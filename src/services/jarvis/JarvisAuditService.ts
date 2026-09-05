import { supabase } from "@/integrations/supabase/client";
import { jarvisSupabase, JarvisStudentAudit, JarvisSystemLog } from "@/integrations/jarvis/supabaseClient";

export interface AuditSummaryResult {
  totalStudentsChecked: number;
  missingPhotos: number;
  missingFaceDescriptors: number;
  missingParentContacts: number;
  missingClassOrSection: number;
  duplicateIdentifiers: number;
  systemErrorsFound: number;
  studentAudits: JarvisStudentAudit[];
  systemLogs: JarvisSystemLog[];
}

export class JarvisAuditService {
  // Execute full on-demand audit across profiles, face_descriptors, and attendance data
  async runFullAudit(): Promise<AuditSummaryResult> {
    const studentAudits: JarvisStudentAudit[] = [];
    const systemLogs: JarvisSystemLog[] = [];

    // 1. Fetch all student profiles
    const { data: rawProfiles, error: profileError } = await (supabase as any)
      .from("profiles")
      .select("id, name, email, roll_number, class, section, avatar_url, photo_url, parent_phone, parent_email, created_at")
      .order("name", { ascending: true });

    if (profileError) {
      systemLogs.push({
        category: "data_anomaly",
        severity: "error",
        source: "profiles_table",
        message: `Failed to query profiles database: ${profileError.message}`,
        metadata: profileError,
      });
    }

    const profiles = rawProfiles || [];

    // 2. Fetch face descriptor IDs to verify biometric enrollment
    const { data: rawDescriptors, error: descError } = await (supabase as any)
      .from("face_descriptors")
      .select("user_id, label, descriptor, created_at");

    if (descError) {
      systemLogs.push({
        category: "data_anomaly",
        severity: "error",
        source: "face_descriptors_table",
        message: `Failed to query face descriptors database: ${descError.message}`,
        metadata: descError,
      });
    }

    const descriptors = rawDescriptors || [];
    const enrolledUserIds = new Set<string>();
    descriptors.forEach((d: any) => {
      if (d.user_id) enrolledUserIds.add(String(d.user_id));
      if (d.label) enrolledUserIds.add(String(d.label).toLowerCase());
    });

    // 3. Evaluate each student profile
    const seenEmails = new Map<string, string>();
    const seenRollNumbers = new Map<string, string>();

    let missingPhotosCount = 0;
    let missingDescriptorsCount = 0;
    let missingParentContactsCount = 0;
    let missingClassCount = 0;
    let duplicateIdCount = 0;

    for (const student of profiles) {
      const studentName = student.name || "Unnamed Student";
      const studentId = student.id;
      const studentPhoto = student.photo_url || student.avatar_url;

      // Issue: Missing Photo
      if (!studentPhoto || studentPhoto.trim() === "" || studentPhoto.includes("placeholder")) {
        missingPhotosCount++;
        studentAudits.push({
          student_id: studentId,
          student_name: studentName,
          class: student.class || "Unassigned",
          section: student.section || "—",
          issue_type: "missing_photo",
          severity: "high",
          details: `Student is missing a profile photo. Without a valid facial portrait, visual verification fails.`,
          suggested_fix: `Upload portrait photo via Admin Quick Registration or Student ID card extractor.`,
          status: "pending",
          metadata: { profile: student },
        });
      }

      // Issue: Missing Face Descriptor (No biometric representation)
      const hasDescriptor =
        enrolledUserIds.has(String(studentId)) ||
        (student.name && enrolledUserIds.has(String(student.name).toLowerCase())) ||
        (student.roll_number && enrolledUserIds.has(String(student.roll_number).toLowerCase()));

      if (!hasDescriptor) {
        missingDescriptorsCount++;
        studentAudits.push({
          student_id: studentId,
          student_name: studentName,
          class: student.class || "Unassigned",
          section: student.section || "—",
          issue_type: "missing_descriptor",
          severity: "critical",
          details: `Student does not have enrolled 128D/512D face embeddings in the biometric index. Gate and live cameras cannot detect this student.`,
          suggested_fix: `Run biometric descriptor generation via Student Face Samples Manager or trigger automatic embedding extraction.`,
          status: "pending",
          metadata: { profile: student },
        });
      }

      // Issue: Missing Parent Contact Info
      const hasParentPhone = student.parent_phone && student.parent_phone.trim().length >= 8;
      const hasParentEmail = student.parent_email && student.parent_email.includes("@");

      if (!hasParentPhone && !hasParentEmail) {
        missingParentContactsCount++;
        studentAudits.push({
          student_id: studentId,
          student_name: studentName,
          class: student.class || "Unassigned",
          section: student.section || "—",
          issue_type: "missing_parent_contact",
          severity: "medium",
          details: `No parent phone number or email registered. Automated gate check-in SMS and email notifications cannot be delivered.`,
          suggested_fix: `Add parent contact information in Parent Contact Importer or Student Profile editor.`,
          status: "pending",
          metadata: { profile: student },
        });
      }

      // Issue: Missing Class / Section
      if (!student.class || student.class.trim() === "") {
        missingClassCount++;
        studentAudits.push({
          student_id: studentId,
          student_name: studentName,
          class: "Missing",
          section: student.section || "—",
          issue_type: "unassigned_section",
          severity: "medium",
          details: `Student is not assigned to any grade/class. Timetable and class-specific attendance records will not associate properly.`,
          suggested_fix: `Assign student to their designated grade and division in Student Details.`,
          status: "pending",
          metadata: { profile: student },
        });
      }

      // Issue: Duplicate Identifiers
      if (student.email) {
        const cleanEmail = student.email.trim().toLowerCase();
        if (seenEmails.has(cleanEmail)) {
          duplicateIdCount++;
          studentAudits.push({
            student_id: studentId,
            student_name: studentName,
            class: student.class || "Unassigned",
            section: student.section || "—",
            issue_type: "duplicate_identifier",
            severity: "high",
            details: `Duplicate email detected: '${cleanEmail}'. Conflict with '${seenEmails.get(cleanEmail)}'.`,
            suggested_fix: `Verify unique email address to prevent authentication collisions.`,
            status: "pending",
            metadata: { conflictingWith: seenEmails.get(cleanEmail) },
          });
        } else {
          seenEmails.set(cleanEmail, studentName);
        }
      }

      if (student.roll_number && student.class) {
        const key = `${student.class}-${student.section || ""}-${student.roll_number}`;
        if (seenRollNumbers.has(key)) {
          duplicateIdCount++;
          studentAudits.push({
            student_id: studentId,
            student_name: studentName,
            class: student.class,
            section: student.section || "—",
            issue_type: "duplicate_identifier",
            severity: "high",
            details: `Duplicate Roll Number '${student.roll_number}' in Class ${student.class}. Conflict with '${seenRollNumbers.get(key)}'.`,
            suggested_fix: `Reassign unique roll number for class register accuracy.`,
            status: "pending",
            metadata: { conflictingWith: seenRollNumbers.get(key) },
          });
        } else {
          seenRollNumbers.set(key, studentName);
        }
      }
    }

    // 4. Check notification logs for delivery failures or errors
    try {
      const { data: failedLogs } = await (supabase as any)
        .from("notification_log")
        .select("id, type, status, recipient, error_message, created_at")
        .eq("status", "failed")
        .order("created_at", { ascending: false })
        .limit(20);

      if (failedLogs && failedLogs.length > 0) {
        failedLogs.forEach((log: any) => {
          systemLogs.push({
            category: "network_failure",
            severity: "warning",
            source: "notification_service",
            message: `Notification failure to ${log.recipient || "recipient"}: ${log.error_message || "Delivery rejected"}`,
            metadata: log,
          });
        });
      }
    } catch {
      // notification_log table might be empty or optional
    }

    // 5. Persist audit findings into the dedicated Jarvis Supabase Project
    try {
      if (studentAudits.length > 0) {
        // Clear old pending audits and insert fresh snapshot
        await jarvisSupabase.from("jarvis_student_audits").delete().eq("status", "pending");
        await jarvisSupabase.from("jarvis_student_audits").insert(
          studentAudits.slice(0, 100).map((a) => ({
            student_id: a.student_id,
            student_name: a.student_name,
            class: a.class,
            section: a.section,
            issue_type: a.issue_type,
            severity: a.severity,
            details: a.details,
            suggested_fix: a.suggested_fix,
            status: a.status,
            metadata: a.metadata,
          }))
        );
      }

      if (systemLogs.length > 0) {
        await jarvisSupabase.from("jarvis_system_logs").insert(
          systemLogs.slice(0, 50).map((l) => ({
            category: l.category,
            severity: l.severity,
            source: l.source,
            route: l.route,
            message: l.message,
            stack_trace: l.stack_trace,
            metadata: l.metadata,
          }))
        );
      }
    } catch (saveErr) {
      console.warn("[JarvisAuditService] Non-critical error storing audit snapshot in Jarvis Supabase:", saveErr);
    }

    return {
      totalStudentsChecked: profiles.length,
      missingPhotos: missingPhotosCount,
      missingFaceDescriptors: missingDescriptorsCount,
      missingParentContacts: missingParentContactsCount,
      missingClassOrSection: missingClassCount,
      duplicateIdentifiers: duplicateIdCount,
      systemErrorsFound: systemLogs.length,
      studentAudits,
      systemLogs,
    };
  }

  // Quick fix helper: apply corrections for selected issues
  async applyQuickFix(auditId: string, fixAction: "mark_resolved" | "generate_notification" | "ignore"): Promise<boolean> {
    try {
      if (fixAction === "mark_resolved") {
        await jarvisSupabase
          .from("jarvis_student_audits")
          .update({ status: "resolved", updated_at: new Date().toISOString() })
          .eq("id", auditId);

        await jarvisSupabase.from("jarvis_actions").insert({
          action_name: "mark_audit_resolved",
          target_entity: "jarvis_student_audits",
          target_id: auditId,
          result: "success",
          details: { action: "manual_resolution" },
        });
      } else if (fixAction === "ignore") {
        await jarvisSupabase
          .from("jarvis_student_audits")
          .update({ status: "ignored", updated_at: new Date().toISOString() })
          .eq("id", auditId);
      }
      return true;
    } catch (err) {
      console.error("[JarvisAuditService] Quick fix error:", err);
      return false;
    }
  }

  // Autonomous Biometric Auto-Healing
  async autoHealMissingBiometrics(
    onProgress?: (curr: number, total: number, studentName: string) => void
  ): Promise<{ healed: number; failed: number; details: string[] }> {
    const details: string[] = [];
    let healed = 0;
    let failed = 0;

    try {
      const { loadModels } = await import("@/services/face-recognition/ModelService");
      const faceapi = await import("face-api.js");
      await loadModels();

      const { data: rawProfiles } = await (supabase as any)
        .from("profiles")
        .select("id, name, roll_number, class, section, avatar_url, photo_url");

      const { data: rawDescriptors } = await (supabase as any)
        .from("face_descriptors")
        .select("user_id, label");

      const enrolledIds = new Set<string>();
      (rawDescriptors || []).forEach((d: any) => {
        if (d.user_id) enrolledIds.add(String(d.user_id));
        if (d.label) enrolledIds.add(String(d.label).toLowerCase());
      });

      const candidates = (rawProfiles || []).filter((p: any) => {
        const photo = p.photo_url || p.avatar_url;
        const hasDescriptor =
          enrolledIds.has(String(p.id)) || (p.name && enrolledIds.has(String(p.name).toLowerCase()));
        return !!photo && photo.trim() !== "" && !photo.includes("placeholder") && !hasDescriptor;
      });

      if (candidates.length === 0) {
        return {
          healed: 0,
          failed: 0,
          details: ["No candidate students found with photos needing descriptor enrollment."],
        };
      }

      for (let i = 0; i < candidates.length; i++) {
        const student = candidates[i];
        const photoUrl = student.photo_url || student.avatar_url;
        onProgress?.(i + 1, candidates.length, student.name || "Student");

        try {
          const img = await faceapi.fetchImage(photoUrl);
          const detection = await faceapi.detectSingleFace(img).withFaceLandmarks().withFaceDescriptor();

          if (detection?.descriptor) {
            const descriptorArray = Array.from(detection.descriptor);
            await (supabase as any).from("face_descriptors").insert({
              user_id: student.id,
              label: student.name || "Student",
              descriptor: descriptorArray,
              image_url: photoUrl,
            });

            await jarvisSupabase
              .from("jarvis_student_audits")
              .update({ status: "resolved", updated_at: new Date().toISOString() })
              .eq("student_id", student.id)
              .eq("issue_type", "missing_descriptor");

            await jarvisSupabase.from("jarvis_actions").insert({
              action_name: "auto_heal_biometric",
              target_entity: "face_descriptors",
              target_id: student.id,
              result: "success",
              details: { student_name: student.name, class: student.class },
            });

            healed++;
            details.push(`Enrolled biometrics for ${student.name}`);
          } else {
            failed++;
            details.push(`Face not detectable in portrait for ${student.name}`);
          }
        } catch (itemErr: any) {
          failed++;
          details.push(`Failed for ${student.name}: ${itemErr?.message || "Unknown error"}`);
        }
      }
    } catch (e: any) {
      console.error("[JarvisAuditService] autoHeal error:", e);
      details.push(`Self-healing interrupted: ${e.message}`);
    }

    return { healed, failed, details };
  }

  // Export audit report to downloadable CSV
  exportAuditReportCSV(audits: JarvisStudentAudit[], healthScore: number | null): void {
    const headers = ["Student Name", "Class", "Section", "Anomaly Type", "Severity", "Details", "Suggested Remedy", "Status"];
    const rows = audits.map((a) => [
      `"${(a.student_name || "").replace(/"/g, '""')}"`,
      `"${(a.class || "").replace(/"/g, '""')}"`,
      `"${(a.section || "").replace(/"/g, '""')}"`,
      `"${(a.issue_type || "").replace(/"/g, '""')}"`,
      `"${(a.severity || "").replace(/"/g, '""')}"`,
      `"${(a.details || "").replace(/"/g, '""')}"`,
      `"${(a.suggested_fix || "").replace(/"/g, '""')}"`,
      `"${(a.status || "").replace(/"/g, '""')}"`,
    ]);

    const csvContent = [
      `# PRESENCES JARVIS AUDIT REPORT — HEALTH SCORE: ${healthScore ?? "N/A"}%`,
      `# GENERATED AT: ${new Date().toISOString()}`,
      headers.join(","),
      ...rows.map((r) => r.join(",")),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `jarvis-audit-report-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  // Clear resolved audits from dedicated Supabase
  async clearResolvedAudits(): Promise<void> {
    await jarvisSupabase.from("jarvis_student_audits").delete().eq("status", "resolved");
    await jarvisSupabase.from("jarvis_actions").insert({
      action_name: "clear_resolved_audits",
      target_entity: "jarvis_student_audits",
      result: "success",
      details: { timestamp: new Date().toISOString() },
    });
  }
}

export const jarvisAudit = new JarvisAuditService();
