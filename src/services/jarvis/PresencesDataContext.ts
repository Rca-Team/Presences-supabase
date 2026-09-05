import { supabase } from "@/integrations/supabase/client";

export interface CampusTelemetrySnapshot {
  totalStudents: number;
  totalStaff: number;
  classesBreakdown: Record<string, number>;
  biometricsEnrolledCount: number;
  biometricCoverageRate: number;
  missingPhotosCount: number;
  missingBiometricsCount: number;
  missingParentContactsCount: number;
  todayAttendance: {
    date: string;
    present: number;
    late: number;
    absent: number;
    attendanceRate: number;
  };
  todayGateScans: {
    totalEntries: number;
    recognized: number;
  };
  recentDefectsSummary: {
    missingPhotosSample: string[];
    missingBiometricsSample: string[];
    missingContactsSample: string[];
  };
}

class PresencesDataContextService {
  private cachedSnapshot: CampusTelemetrySnapshot | null = null;
  private lastSnapshotTime: number = 0;
  private readonly CACHE_TTL_MS = 45 * 1000; // 45-second cache for overall counts

  /**
   * Fetch live campus overview from older Presences Supabase database
   */
  async getLiveSnapshot(forceFresh: boolean = false): Promise<CampusTelemetrySnapshot> {
    const now = Date.now();
    if (!forceFresh && this.cachedSnapshot && now - this.lastSnapshotTime < this.CACHE_TTL_MS) {
      return this.cachedSnapshot;
    }

    try {
      const todayDate = new Date().toISOString().split("T")[0];

      // 1. Fetch profiles
      const { data: rawProfiles } = await (supabase as any)
        .from("profiles")
        .select("id, name, email, roll_number, class, section, role, photo_url, avatar_url, parent_phone, parent_email");

      const profiles: any[] = rawProfiles || [];

      // 2. Fetch face descriptors
      const { data: rawDescriptors } = await (supabase as any)
        .from("face_descriptors")
        .select("user_id, label");

      const descriptors: any[] = rawDescriptors || [];
      const enrolledIds = new Set<string>();
      descriptors.forEach((d) => {
        if (d.user_id) enrolledIds.add(String(d.user_id));
        if (d.label) enrolledIds.add(String(d.label).toLowerCase());
      });

      // 3. Fetch today's attendance records
      const { data: rawAttendance } = await (supabase as any)
        .from("attendance_records")
        .select("user_id, status, class, section")
        .gte("timestamp", `${todayDate}T00:00:00`)
        .lte("timestamp", `${todayDate}T23:59:59`);

      const todayAttendanceRecords: any[] = rawAttendance || [];

      // 4. Fetch today's gate entries
      const { data: rawGate } = await (supabase as any)
        .from("gate_entries")
        .select("id, is_recognized")
        .gte("entry_time", `${todayDate}T00:00:00`)
        .lte("entry_time", `${todayDate}T23:59:59`);

      const gateEntries: any[] = rawGate || [];

      // Process profiles
      let totalStudents = 0;
      let totalStaff = 0;
      const classesBreakdown: Record<string, number> = {};
      const missingPhotosSample: string[] = [];
      const missingBiometricsSample: string[] = [];
      const missingContactsSample: string[] = [];

      let missingPhotosCount = 0;
      let missingBiometricsCount = 0;
      let missingContactsCount = 0;

      for (const p of profiles) {
        const isStaff = p.role === "teacher" || p.role === "admin" || p.role === "principal";
        if (isStaff) {
          totalStaff++;
        } else {
          totalStudents++;
          const classKey = p.class ? `Class ${p.class}${p.section ? `-${p.section}` : ""}` : "Unassigned";
          classesBreakdown[classKey] = (classesBreakdown[classKey] || 0) + 1;

          const hasPhoto = (p.photo_url && p.photo_url.trim() !== "" && !p.photo_url.includes("placeholder")) ||
            (p.avatar_url && p.avatar_url.trim() !== "" && !p.avatar_url.includes("placeholder"));

          if (!hasPhoto) {
            missingPhotosCount++;
            if (missingPhotosSample.length < 8 && p.name) missingPhotosSample.push(`${p.name} (${classKey})`);
          }

          const hasBio = enrolledIds.has(String(p.id)) ||
            (p.name && enrolledIds.has(String(p.name).toLowerCase())) ||
            (p.roll_number && enrolledIds.has(String(p.roll_number).toLowerCase()));

          if (!hasBio) {
            missingBiometricsCount++;
            if (missingBiometricsSample.length < 8 && p.name) missingBiometricsSample.push(`${p.name} (${classKey})`);
          }

          const hasContact = (p.parent_phone && p.parent_phone.trim() !== "") || (p.parent_email && p.parent_email.trim() !== "");
          if (!hasContact) {
            missingContactsCount++;
            if (missingContactsSample.length < 8 && p.name) missingContactsSample.push(`${p.name} (${classKey})`);
          }
        }
      }

      // Process attendance
      let presentCount = 0;
      let lateCount = 0;
      const countedUsers = new Set<string>();

      for (const rec of todayAttendanceRecords) {
        const st = String(rec.status || "").toLowerCase();
        const uid = rec.user_id || "";
        if (st.includes("present") || st === "unauthorized") {
          presentCount++;
          if (uid) countedUsers.add(uid);
        } else if (st.includes("late")) {
          lateCount++;
          if (uid) countedUsers.add(uid);
        }
      }

      const activeEnrolledStudents = totalStudents > 0 ? totalStudents : profiles.length;
      const absentCount = Math.max(0, activeEnrolledStudents - countedUsers.size);
      const attendanceRate = activeEnrolledStudents > 0
        ? Math.round(((presentCount + lateCount) / activeEnrolledStudents) * 100)
        : 0;

      const bioCoverage = activeEnrolledStudents > 0
        ? Math.round(((activeEnrolledStudents - missingBiometricsCount) / activeEnrolledStudents) * 100)
        : 0;

      const recognizedGate = gateEntries.filter((g) => g.is_recognized).length;

      this.cachedSnapshot = {
        totalStudents: activeEnrolledStudents,
        totalStaff,
        classesBreakdown,
        biometricsEnrolledCount: Math.max(0, activeEnrolledStudents - missingBiometricsCount),
        biometricCoverageRate: Math.max(0, Math.min(100, bioCoverage)),
        missingPhotosCount,
        missingBiometricsCount,
        missingParentContactsCount,
        todayAttendance: {
          date: todayDate,
          present: presentCount,
          late: lateCount,
          absent: absentCount,
          attendanceRate,
        },
        todayGateScans: {
          totalEntries: gateEntries.length,
          recognized: recognizedGate,
        },
        recentDefectsSummary: {
          missingPhotosSample,
          missingBiometricsSample,
          missingContactsSample,
        },
      };

      this.lastSnapshotTime = now;
      return this.cachedSnapshot;
    } catch (err) {
      console.warn("[PresencesDataContext] Error querying older Supabase:", err);
      // Return safe fallback if network is briefly degraded
      return (
        this.cachedSnapshot || {
          totalStudents: 0,
          totalStaff: 0,
          classesBreakdown: {},
          biometricsEnrolledCount: 0,
          biometricCoverageRate: 0,
          missingPhotosCount: 0,
          missingBiometricsCount: 0,
          missingParentContactsCount: 0,
          todayAttendance: {
            date: new Date().toISOString().split("T")[0],
            present: 0,
            late: 0,
            absent: 0,
            attendanceRate: 0,
          },
          todayGateScans: { totalEntries: 0, recognized: 0 },
          recentDefectsSummary: {
            missingPhotosSample: [],
            missingBiometricsSample: [],
            missingContactsSample: [],
          },
        }
      );
    }
  }

  /**
   * Search older Supabase on-the-fly for targeted query details (e.g. student name, class, absent list)
   */
  async searchTargetedData(userPrompt: string): Promise<string> {
    const promptLower = userPrompt.toLowerCase().trim();
    const targetedSections: string[] = [];

    try {
      // 1. Check if user is asking about absent or present students
      if (promptLower.includes("absent") || promptLower.includes("who is not here") || promptLower.includes("missing today")) {
        const todayDate = new Date().toISOString().split("T")[0];
        const { data: presentRecords } = await (supabase as any)
          .from("attendance_records")
          .select("user_id")
          .gte("timestamp", `${todayDate}T00:00:00`)
          .lte("timestamp", `${todayDate}T23:59:59`);

        const presentUserIds = new Set<string>((presentRecords || []).map((r: any) => String(r.user_id)));

        const { data: allStudents } = await (supabase as any)
          .from("profiles")
          .select("id, name, roll_number, class, section, parent_phone")
          .not("role", "in", '("teacher","admin","principal")')
          .limit(20);

        const absentList = (allStudents || []).filter((s: any) => !presentUserIds.has(String(s.id)));
        if (absentList.length > 0) {
          const names = absentList.slice(0, 10).map((s: any) => `${s.name} (${s.class || "Unassigned"}${s.section ? `-${s.section}` : ""}, Roll: ${s.roll_number || "—"})`);
          targetedSections.push(`[ABSENT STUDENTS IDENTIFIED TODAY]\n${names.join("\n")}${absentList.length > 10 ? `\n...and ${absentList.length - 10} more` : ""}`);
        }
      }

      // 2. Check if a specific class or section is mentioned (e.g. "class 10", "grade 9", "section A")
      const classMatch = promptLower.match(/class\s*([0-9]{1,2}|[a-z]+)/i) || promptLower.match(/grade\s*([0-9]{1,2})/i);
      if (classMatch) {
        const targetClass = classMatch[1];
        const { data: classStudents } = await (supabase as any)
          .from("profiles")
          .select("name, roll_number, class, section, parent_phone, photo_url")
          .ilike("class", `%${targetClass}%`)
          .limit(15);

        if (classStudents && classStudents.length > 0) {
          const list = classStudents.map((s: any) => `• ${s.name} (Sec: ${s.section || "—"}, Roll: ${s.roll_number || "—"}, Guardian Phone: ${s.parent_phone || "Not on file"})`);
          targetedSections.push(`[STUDENTS ENROLLED IN CLASS ${targetClass.toUpperCase()}]\nTotal found: ${classStudents.length}\nRoster sample:\n${list.join("\n")}`);
        }
      }

      // 3. Search for specific student name mentions (e.g. 2 or more words or direct query)
      const stopWords = new Set(["who", "what", "where", "when", "why", "how", "is", "are", "the", "student", "class", "today", "yesterday", "attendance", "give", "tell", "show", "me", "about", "check", "status", "present", "absent", "late", "jarvis", "system", "please"]);
      const words = promptLower.split(/[^a-zA-Z0-9]+/).filter((w) => w.length >= 3 && !stopWords.has(w));

      if (words.length > 0) {
        for (const word of words.slice(0, 3)) {
          const { data: matchedProfiles } = await (supabase as any)
            .from("profiles")
            .select("id, name, email, roll_number, class, section, parent_phone, parent_email, photo_url, avatar_url, created_at")
            .or(`name.ilike.%${word}%,roll_number.ilike.%${word}%`)
            .limit(3);

          if (matchedProfiles && matchedProfiles.length > 0) {
            for (const student of matchedProfiles) {
              const { data: recentAtt } = await (supabase as any)
                .from("attendance_records")
                .select("date, status, timestamp, method")
                .eq("user_id", student.id)
                .order("timestamp", { ascending: false })
                .limit(3);

              const attHistory = (recentAtt || []).map((a: any) => `${a.date || a.timestamp?.slice(0, 10)}: ${a.status} (${a.method || "gate"})`).join("; ");

              targetedSections.push(
                `[STUDENT PROFILE MATCH: ${student.name.toUpperCase()}]\n` +
                `- ID: ${student.id}\n` +
                `- Class & Section: ${student.class || "Unassigned"} ${student.section || ""}\n` +
                `- Roll Number: ${student.roll_number || "N/A"}\n` +
                `- Guardian Contact: Phone: ${student.parent_phone || "Missing"}, Email: ${student.parent_email || "Missing"}\n` +
                `- Photo on file: ${student.photo_url || student.avatar_url ? "Yes" : "NO"}\n` +
                `- Recent Attendance: ${attHistory || "No recent check-ins recorded"}`
              );
            }
          }
        }
      }
    } catch (searchErr) {
      console.warn("[PresencesDataContext] Error during targeted search:", searchErr);
    }

    return targetedSections.join("\n\n");
  }

  /**
   * Build complete contextual telemetry block to inject into Gemini prompt
   */
  async buildPresencesPromptContext(userPrompt?: string): Promise<string> {
    const snapshot = await this.getLiveSnapshot();
    const targetedData = userPrompt ? await this.searchTargetedData(userPrompt) : "";

    const classesListStr = Object.entries(snapshot.classesBreakdown)
      .map(([cls, count]) => `${cls}: ${count}`)
      .join(", ");

    return `
[PRESENCES CAMPUS LIVE DATABASE - REAL-TIME TELEMETRY FROM PRIMARY SUPABASE]
INSTITUTIONAL METRICS:
- Total Registered Students: ${snapshot.totalStudents}
- Total Faculty & Staff: ${snapshot.totalStaff}
- Active Classes: ${classesListStr || "Standard Grade Levels"}
- Biometric Enrollment Rate: ${snapshot.biometricCoverageRate}% (${snapshot.biometricsEnrolledCount} of ${snapshot.totalStudents} students have 128D facial vectors enrolled)

TODAY'S ATTENDANCE STATUS (${snapshot.todayAttendance.date}):
- Present: ${snapshot.todayAttendance.present}
- Late: ${snapshot.todayAttendance.late}
- Absent: ${snapshot.todayAttendance.absent}
- Overall Attendance Rate: ${snapshot.todayAttendance.attendanceRate}%
- Turnstile Scans Today: ${snapshot.todayGateScans.totalEntries} (${snapshot.todayGateScans.recognized} recognized)

REGISTRY DATA INTEGRITY:
- Students Missing Photos: ${snapshot.missingPhotosCount} ${snapshot.recentDefectsSummary.missingPhotosSample.length ? `(e.g., ${snapshot.recentDefectsSummary.missingPhotosSample.join(", ")})` : ""}
- Students Missing Biometrics: ${snapshot.missingBiometricsCount} ${snapshot.recentDefectsSummary.missingBiometricsSample.length ? `(e.g., ${snapshot.recentDefectsSummary.missingBiometricsSample.join(", ")})` : ""}
- Students Missing Guardian Contact: ${snapshot.missingParentContactsCount} ${snapshot.recentDefectsSummary.missingContactsSample.length ? `(e.g., ${snapshot.recentDefectsSummary.missingContactsSample.join(", ")})` : ""}

${targetedData ? `SPECIFIC QUERY DATABASE LOOKUP RESULTS:\n${targetedData}\n` : ""}
INSTRUCTION FOR JARVIS:
Use this exact, real-time institutional database to answer the administrator's request. Quote accurate numbers, student names, classes, and attendance percentages directly from this live data. Speak in character as J.A.R.V.I.S.
`.trim();
  }
}

export const presencesDataContext = new PresencesDataContextService();
