import { supabase } from '@/integrations/supabase/client';
import { parseClassSection } from '@/utils/teacherAccess';

export type GatePassStatus =
  | 'pending' // Legacy alias for pending_teacher
  | 'pending_teacher' // Step 1: Parent submitted -> awaiting Teacher verification
  | 'pending_principal' // Step 2: Teacher verified -> awaiting Principal / Admin final approval
  | 'approved' // Step 3: Principal approved -> QR generated & active for Guard scan
  | 'rejected' // Disapproved by Teacher or Principal
  | 'used' // Scanned by Guard & physically exited
  | 'expired'; // Past validity window

export type GatePassReason =
  | 'medical'
  | 'family_emergency'
  | 'appointment'
  | 'school_event'
  | 'illness_at_school'
  | 'other';

export interface GatePass {
  id: string; // e.g. "GP-12009-178870..."
  pass_code: string; // e.g. "GP-8429" (6-character human readable verification code)
  student_id: string; // Admission number e.g. "12009"
  student_name: string; // "HEMANT PANCHAL"
  class_section: string; // "6-A"
  student_image_url?: string;
  requested_by: 'parent' | 'teacher' | 'admin';
  pickup_person_name: string;
  pickup_person_phone: string;
  pickup_person_relation: string; // "Father", "Mother", "Guardian", "Self", "Other"
  pickup_person_id_proof?: string; // "Aadhaar Card", "Driver License", "Parent ID Card"
  reason_category: GatePassReason;
  reason_text: string;
  created_at: string;
  expected_pickup_time: string; // e.g. "10:30 AM"
  valid_until: string; // e.g. "12:00 PM Today"
  status: GatePassStatus;

  // Step 1: Teacher Verification
  teacher_verified_by?: string;
  teacher_verified_at?: string;
  teacher_notes?: string;

  // Step 2: Principal / Admin Approval
  principal_approved_by?: string;
  principal_approved_at?: string;
  principal_notes?: string;

  // Generic approved fallback for legacy
  approved_by?: string;
  approved_at?: string;

  // Rejection details
  rejection_reason?: string;
  rejected_by?: string;
  rejected_at?: string;

  // Step 4: Physical Exit at Gate
  exit_time?: string; // ISO timestamp
  exit_gate?: string; // "Main Gate 1"
  security_guard_name?: string;
  guard_notes?: string;

  // QR Code Payload (generated when approved)
  qr_payload?: string;
}

const STORAGE_KEY = 'school_gate_passes';

/**
 * Generate standardized JSON QR token payload for security scanner
 */
export function generateGatePassQrPayload(pass: GatePass): string {
  return JSON.stringify({
    passId: pass.id,
    passCode: pass.pass_code,
    studentId: pass.student_id,
    studentName: pass.student_name,
    classSection: pass.class_section,
    pickupPerson: pass.pickup_person_name,
    pickupPhone: pass.pickup_person_phone,
    relation: pass.pickup_person_relation,
    idProof: pass.pickup_person_id_proof || 'Verified Parent',
    reason: pass.reason_text,
    time: pass.expected_pickup_time,
    status: 'approved',
    verifiedByTeacher: pass.teacher_verified_by || 'Yes',
    approvedByPrincipal: pass.principal_approved_by || pass.approved_by || 'Principal Office',
    school: 'PM SHRI KENDRIYA VIDYALAYA NFC VIGYAN VIHAR',
    issuedAt: pass.principal_approved_at || pass.approved_at || pass.created_at,
    validUntil: pass.valid_until,
  });
}

/**
 * Safe database persistence for gate passes that avoids 400 Bad Request on upsert
 */
async function persistGatePasses(updatedList: GatePass[]): Promise<void> {
  const { data: existing } = await supabase
    .from('attendance_settings')
    .select('id')
    .eq('key', STORAGE_KEY)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await supabase
      .from('attendance_settings')
      .update({
        value: updatedList as any,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('attendance_settings')
      .insert({
        key: STORAGE_KEY,
        value: updatedList as any,
      });
    if (error) throw error;
  }
}

/**
 * Auto-expire stale passes older than 20 hours that were never used
 */
export async function autoExpireOldGatePasses(passes: GatePass[]): Promise<GatePass[]> {
  const now = new Date();
  let modified = false;

  const updated = passes.map((p) => {
    const isPendingOrActive =
      p.status === 'approved' ||
      p.status === 'pending' ||
      p.status === 'pending_teacher' ||
      p.status === 'pending_principal';

    if (isPendingOrActive) {
      const createdDate = new Date(p.created_at);
      const diffHours = (now.getTime() - createdDate.getTime()) / (1000 * 60 * 60);
      if (diffHours > 20) {
        modified = true;
        return { ...p, status: 'expired' as GatePassStatus };
      }
    }
    return p;
  });

  if (modified) {
    try {
      await persistGatePasses(updated);
    } catch (e) {
      console.warn('[GatePassService] Could not auto-expire passes:', e);
    }
  }

  return updated;
}

/**
 * Fetch all gate passes from the system (with auto-expiry check)
 */
export async function fetchAllGatePasses(): Promise<GatePass[]> {
  try {
    const { data, error } = await supabase
      .from('attendance_settings')
      .select('value')
      .eq('key', STORAGE_KEY)
      .maybeSingle();

    if (error || !data || !Array.isArray(data.value)) {
      return [];
    }

    const rawList = (data.value as GatePass[]).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    return await autoExpireOldGatePasses(rawList);
  } catch (err) {
    console.error('[GatePassService] fetchAllGatePasses error:', err);
    return [];
  }
}

/**
 * Fetch gate passes for a specific student (by employee_id / admission no)
 */
export async function fetchStudentGatePasses(studentId: string): Promise<GatePass[]> {
  const all = await fetchAllGatePasses();
  const cleanId = String(studentId || '').trim().toLowerCase();
  return all.filter((p) => String(p.student_id || '').trim().toLowerCase() === cleanId);
}

/**
 * Fetch gate passes for a specific class & section (e.g. "6-A")
 */
export async function fetchClassGatePasses(classSection?: string): Promise<GatePass[]> {
  const all = await fetchAllGatePasses();
  if (!classSection) return all;

  const target = classSection.trim().toLowerCase();
  return all.filter((p) => {
    const cs = String(p.class_section || '').trim().toLowerCase();
    return cs === target || cs.replace('-', '') === target.replace('-', '');
  });
}

/**
 * Create and submit a new gate pass request
 * - If requested by parent -> initial status is 'pending_teacher'
 * - If requested by teacher -> marked as verified by teacher -> 'pending_principal' (or approved if teacher has admin bypass)
 */
export async function createGatePass(
  pass: Omit<GatePass, 'id' | 'pass_code' | 'created_at' | 'status'> & {
    status?: GatePassStatus;
  }
): Promise<GatePass | null> {
  try {
    const randomCode = Math.floor(1000 + Math.random() * 9000);
    const passCode = `GP-${randomCode}`;
    const nowIso = new Date().toISOString();

    let initialStatus: GatePassStatus = 'pending_teacher';
    let teacherVerifiedBy = pass.teacher_verified_by;
    let teacherVerifiedAt = pass.teacher_verified_at;

    if (pass.requested_by === 'teacher') {
      initialStatus = 'pending_principal';
      teacherVerifiedBy = pass.approved_by || 'Class Teacher In-Charge';
      teacherVerifiedAt = nowIso;
    } else if (pass.requested_by === 'admin') {
      initialStatus = 'approved';
    }

    const newPass: GatePass = {
      ...pass,
      id: `GP-${pass.student_id}-${Date.now()}`,
      pass_code: passCode,
      created_at: nowIso,
      status: pass.status || initialStatus,
      teacher_verified_by: teacherVerifiedBy,
      teacher_verified_at: teacherVerifiedAt,
      approved_by: initialStatus === 'approved' ? pass.approved_by || 'Principal Office' : undefined,
      approved_at: initialStatus === 'approved' ? nowIso : undefined,
    };

    if (newPass.status === 'approved') {
      newPass.qr_payload = generateGatePassQrPayload(newPass);
    }

    const currentList = await fetchAllGatePasses();
    const updatedList = [newPass, ...currentList.filter((p) => p.id !== newPass.id)];

    await persistGatePasses(updatedList);
    return newPass;
  } catch (err) {
    console.error('[GatePassService] createGatePass error:', err);
    return null;
  }
}

/**
 * Step 1: Class Teacher Verification
 * Moves status from 'pending_teacher' (or 'pending') -> 'pending_principal'
 */
export async function verifyPassByTeacher(
  passId: string,
  teacherName: string,
  notes?: string
): Promise<boolean> {
  try {
    const currentList = await fetchAllGatePasses();
    const target = currentList.find((p) => p.id === passId || p.pass_code === passId);
    if (!target) return false;

    const nowIso = new Date().toISOString();
    const updated = currentList.map((p) => {
      if (p.id === target.id) {
        return {
          ...p,
          status: 'pending_principal' as GatePassStatus,
          teacher_verified_by: teacherName,
          teacher_verified_at: nowIso,
          teacher_notes: notes || p.teacher_notes,
        };
      }
      return p;
    });

    await persistGatePasses(updated);
    return true;
  } catch (err) {
    console.error('[GatePassService] verifyPassByTeacher error:', err);
    return false;
  }
}

/**
 * Step 2: Principal / Admin Final Approval
 * Moves status from 'pending_principal' (or 'pending_teacher') -> 'approved' and generates QR Code payload
 */
export async function approvePassByPrincipal(
  passId: string,
  principalName: string,
  notes?: string
): Promise<GatePass | null> {
  try {
    const currentList = await fetchAllGatePasses();
    const target = currentList.find((p) => p.id === passId || p.pass_code === passId);
    if (!target) return null;

    const nowIso = new Date().toISOString();
    let updatedPass: GatePass | null = null;

    const updated = currentList.map((p) => {
      if (p.id === target.id) {
        const approved: GatePass = {
          ...p,
          status: 'approved' as GatePassStatus,
          principal_approved_by: principalName,
          principal_approved_at: nowIso,
          principal_notes: notes || p.principal_notes,
          approved_by: principalName,
          approved_at: nowIso,
        };
        approved.qr_payload = generateGatePassQrPayload(approved);
        updatedPass = approved;
        return approved;
      }
      return p;
    });

    await persistGatePasses(updated);
    return updatedPass;
  } catch (err) {
    console.error('[GatePassService] approvePassByPrincipal error:', err);
    return null;
  }
}

/**
 * Reject Gate Pass (at Teacher or Principal stage)
 */
export async function rejectGatePass(
  passId: string,
  rejectedBy: string,
  reason: string,
  stage: 'teacher' | 'principal' = 'teacher'
): Promise<boolean> {
  try {
    const currentList = await fetchAllGatePasses();
    const target = currentList.find((p) => p.id === passId || p.pass_code === passId);
    if (!target) return false;

    const nowIso = new Date().toISOString();
    const updated = currentList.map((p) => {
      if (p.id === target.id) {
        return {
          ...p,
          status: 'rejected' as GatePassStatus,
          rejected_by: rejectedBy,
          rejected_at: nowIso,
          rejection_reason: reason || `Disapproved during ${stage} review`,
        };
      }
      return p;
    });

    await persistGatePasses(updated);
    return true;
  } catch (err) {
    console.error('[GatePassService] rejectGatePass error:', err);
    return false;
  }
}

/**
 * Update gate pass status (General helper)
 */
export async function updateGatePassStatus(
  passId: string,
  status: GatePassStatus,
  options?: {
    approved_by?: string;
    rejection_reason?: string;
    teacher_notes?: string;
    principal_notes?: string;
  }
): Promise<boolean> {
  try {
    const currentList = await fetchAllGatePasses();
    const target = currentList.find((p) => p.id === passId || p.pass_code === passId);
    if (!target) return false;

    const nowIso = new Date().toISOString();
    const updated = currentList.map((p) => {
      if (p.id === target.id) {
        const item: GatePass = {
          ...p,
          status,
          approved_by: options?.approved_by || p.approved_by,
          approved_at: status === 'approved' ? nowIso : p.approved_at,
          rejection_reason: options?.rejection_reason || p.rejection_reason,
          teacher_notes: options?.teacher_notes || p.teacher_notes,
          principal_notes: options?.principal_notes || p.principal_notes,
        };
        if (status === 'approved') {
          item.qr_payload = generateGatePassQrPayload(item);
        }
        return item;
      }
      return p;
    });

    await persistGatePasses(updated);
    return true;
  } catch (err) {
    console.error('[GatePassService] updateGatePassStatus error:', err);
    return false;
  }
}

/**
 * Step 3: Verify and authorize physical exit at the gate turnstile
 * Updates pass to 'used' and logs physical exit in 'gate_entries'
 */
export async function verifyAndExecuteExit(
  passIdentifier: string, // passId or pass_code or raw QR json
  gateName = 'Main Gate 1',
  guardName = 'Duty Security Officer',
  snapshotUrl?: string,
  guardNotes?: string
): Promise<{ success: boolean; pass?: GatePass; message: string; error?: string }> {
  try {
    let cleanId = passIdentifier.trim();

    // If QR payload JSON was passed, extract passCode or passId
    if (cleanId.startsWith('{') && cleanId.endsWith('}')) {
      try {
        const parsed = JSON.parse(cleanId);
        if (parsed.passCode) cleanId = parsed.passCode;
        else if (parsed.passId) cleanId = parsed.passId;
      } catch {
        // use raw string
      }
    }

    const lowerId = cleanId.toLowerCase();
    const currentList = await fetchAllGatePasses();
    const pass = currentList.find(
      (p) =>
        p.id.toLowerCase() === lowerId ||
        p.pass_code.toLowerCase() === lowerId ||
        `pass-${p.student_id}`.toLowerCase() === lowerId ||
        p.student_id.toLowerCase() === lowerId
    );

    if (!pass) {
      const msg = 'Invalid Pass: No matching gate pass record found.';
      return { success: false, message: msg, error: msg };
    }

    if (pass.status === 'used') {
      const exitTimeStr = pass.exit_time
        ? new Date(pass.exit_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : 'earlier';
      const msg = `Pass Already Used: Student already departed at ${exitTimeStr} (${pass.exit_gate || 'Main Gate'}).`;
      return {
        success: false,
        pass,
        message: msg,
        error: msg,
      };
    }

    if (pass.status === 'rejected') {
      const msg = `Pass Rejected: Reason: ${pass.rejection_reason || 'Disapproved by school authority'}.`;
      return {
        success: false,
        pass,
        message: msg,
        error: msg,
      };
    }

    if (pass.status === 'expired') {
      const msg = 'Pass Expired: This pass has exceeded its validity window.';
      return {
        success: false,
        pass,
        message: msg,
        error: msg,
      };
    }

    if (pass.status === 'pending' || pass.status === 'pending_teacher') {
      const msg = 'Pass Pending: Class Teacher has not verified this request yet.';
      return {
        success: false,
        pass,
        message: msg,
        error: msg,
      };
    }

    if (pass.status === 'pending_principal') {
      const msg = `Pass Pending Approval: Verified by Teacher (${pass.teacher_verified_by || 'Teacher'}), but awaiting Principal final authorization.`;
      return {
        success: false,
        pass,
        message: msg,
        error: msg,
      };
    }

    if (pass.status !== 'approved') {
      const msg = `Pass status is "${pass.status}" and cannot be authorized for exit.`;
      return {
        success: false,
        pass,
        message: msg,
        error: msg,
      };
    }

    const nowIso = new Date().toISOString();
    const updatedPass: GatePass = {
      ...pass,
      status: 'used',
      exit_time: nowIso,
      exit_gate: gateName,
      security_guard_name: guardName,
      guard_notes: guardNotes,
    };

    // 1. Update the pass record
    const updatedList = currentList.map((p) => (p.id === pass.id ? updatedPass : p));
    await persistGatePasses(updatedList);

    // 2. Insert record into gate_entries table
    const { class: classNum, section: sectionLetter } = parseClassSection(pass.class_section);
    await supabase.from('gate_entries').insert({
      student_id: pass.student_id,
      student_name: pass.student_name,
      class: classNum,
      section: sectionLetter,
      gate_name: gateName,
      entry_time: nowIso,
      entry_type: 'exit' as any,
      is_recognized: true,
      snapshot_url: snapshotUrl || pass.student_image_url || null,
      metadata: {
        pass_id: pass.id,
        pass_code: pass.pass_code,
        pickup_person: pass.pickup_person_name,
        pickup_phone: pass.pickup_person_phone,
        pickup_relation: pass.pickup_person_relation,
        id_proof: pass.pickup_person_id_proof || 'Verified Parent',
        reason: pass.reason_text,
        teacher_verified_by: pass.teacher_verified_by,
        principal_approved_by: pass.principal_approved_by || pass.approved_by,
        guard_name: guardName,
        exit_event: 'AUTHORIZED_EARLY_EXIT_GATE_PASS',
      },
    });

    return {
      success: true,
      pass: updatedPass,
      message: `Exit Authorized: ${pass.student_name} departure recorded. Released to ${pass.pickup_person_name}.`,
    };
  } catch (err: any) {
    console.error('[GatePassService] verifyAndExecuteExit error:', err);
    return { success: false, message: err?.message || 'Error processing exit verification.', error: err?.message };
  }
}

/**
 * Generate formatted WhatsApp message URL for sharing Gate Pass
 */
export function getGatePassWhatsAppUrl(pass: GatePass, recipientPhone?: string): string {
  const phone = (recipientPhone || pass.pickup_person_phone || '').replace(/[^0-9]/g, '');
  const statusEmoji =
    pass.status === 'approved'
      ? '✅'
      : pass.status === 'used'
      ? '🚪'
      : pass.status === 'pending_principal'
      ? '⏳ (Teacher Verified - Awaiting Principal)'
      : pass.status === 'pending_teacher' || pass.status === 'pending'
      ? '⏳ (Awaiting Teacher)'
      : '❌';

  const text = encodeURIComponent(
    `*🏛️ PM SHRI KV NFC VIGYAN VIHAR - OFFICIAL GATE PASS*\n\n` +
    `*Status:* ${statusEmoji} ${pass.status.toUpperCase()}\n` +
    `*Pass Code:* \`${pass.pass_code}\`\n\n` +
    `*Student:* ${pass.student_name} (Class ${pass.class_section})\n` +
    `*Student ID:* ${pass.student_id}\n` +
    `*Authorized Pickup:* ${pass.pickup_person_name} (${pass.pickup_person_relation})\n` +
    `*Contact Phone:* ${pass.pickup_person_phone}\n` +
    `*Departure Time:* ${pass.expected_pickup_time}\n` +
    `*Reason:* ${pass.reason_text}\n` +
    `*Class Teacher:* ${pass.teacher_verified_by || 'Verified'}\n` +
    `*Principal Approval:* ${pass.principal_approved_by || pass.approved_by || 'Authorized'}\n\n` +
    `_Please present QR code or Code *${pass.pass_code}* at Main Gate Security Guard Turnstile for physical exit clearance._`
  );

  return phone ? `https://wa.me/${phone}?text=${text}` : `https://wa.me/?text=${text}`;
}

/**
 * Subscribe to realtime gate pass updates
 */
export function subscribeToGatePasses(onChange: () => void) {
  const uniqueChannelName = `gate_passes_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const channel = supabase
    .channel(uniqueChannelName)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'attendance_settings',
        filter: `key=eq.${STORAGE_KEY}`,
      },
      () => {
        onChange();
      }
    )
    .subscribe();

  return () => {
    try {
      supabase.removeChannel(channel);
    } catch (_) {}
  };
}
