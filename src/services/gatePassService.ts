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

const REALTIME_TOPIC = 'presences_gate_passes_realtime_broadcast';

// Global shared channel reference for real-time broadcasts across all devices
let sharedBroadcastChannel: ReturnType<typeof supabase.channel> | null = null;

function getSharedBroadcastChannel() {
  if (!sharedBroadcastChannel) {
    sharedBroadcastChannel = supabase.channel(REALTIME_TOPIC, {
      config: {
        broadcast: { ack: false, self: true },
      },
    });
    sharedBroadcastChannel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        // Connected to Realtime
      }
    });
  }
  return sharedBroadcastChannel;
}

/**
 * Broadcast gate pass state mutation to all active clients (0ms local + cross-tab + supabase websocket)
 */
export function broadcastGatePassChange(meta?: { action?: string; passId?: string; studentId?: string }) {
  const timestamp = Date.now();
  const payload = { ...meta, timestamp };

  // 1. In-browser local window sync (0ms)
  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(new CustomEvent('presences_gate_pass_updated', { detail: payload }));
    } catch {}
  }

  // 2. Cross-tab BroadcastChannel
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      const bc = new BroadcastChannel('presences_gate_passes_cross_tab');
      bc.postMessage(payload);
      bc.close();
    }
  } catch {}

  // 3. Supabase Realtime Broadcast across all network devices & users
  try {
    const ch = getSharedBroadcastChannel();
    ch.send({
      type: 'broadcast',
      event: 'gate_pass_event',
      payload,
    });
  } catch (err) {
    console.warn('[GatePassService] Broadcast error:', err);
  }
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

  // Instantly notify all realtime subscribers across windows, tabs, and devices
  broadcastGatePassChange({ action: 'persist' });
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
 * Helper to check if two timestamps or Date objects are the same calendar day (local time)
 */
export function isSameDay(date1: string | Date, date2: string | Date = new Date()): boolean {
  try {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return false;
    return (
      d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate()
    );
  } catch {
    return false;
  }
}

/**
 * Get any active/pending/approved/used gate pass for a student created today
 */
export async function getStudentTodayGatePass(studentId: string): Promise<GatePass | null> {
  try {
    const cleanId = String(studentId || '').trim().toLowerCase();
    if (!cleanId) return null;
    const passes = await fetchStudentGatePasses(cleanId);
    const today = new Date();
    const activePassToday = passes.find((p) => {
      if (!isSameDay(p.created_at, today)) return false;
      return p.status !== 'rejected' && p.status !== 'expired';
    });
    return activePassToday || null;
  } catch (err) {
    console.error('[GatePassService] getStudentTodayGatePass error:', err);
    return null;
  }
}

/**
 * Create and submit a new gate pass request
 * - Checks daily limit: Only 1 gate pass is permitted per student per day (unless admin override)
 * - If requested by parent -> initial status is 'pending_teacher'
 * - If requested by teacher -> marked as verified by teacher -> 'pending_principal' (or approved if teacher has admin bypass)
 */
export async function createGatePass(
  pass: Omit<GatePass, 'id' | 'pass_code' | 'created_at' | 'status'> & {
    status?: GatePassStatus;
    bypass_daily_limit?: boolean;
  }
): Promise<GatePass | null> {
  try {
    const currentList = await fetchAllGatePasses();
    const cleanId = String(pass.student_id || '').trim().toLowerCase();
    const today = new Date();

    // Enforce 1 gate pass per student per day rule
    const existingPassToday = currentList.find((p) => {
      const pId = String(p.student_id || '').trim().toLowerCase();
      if (pId !== cleanId && p.student_id !== pass.student_id) return false;
      if (!isSameDay(p.created_at, today)) return false;
      return p.status !== 'rejected' && p.status !== 'expired';
    });

    if (existingPassToday && pass.requested_by !== 'admin' && !pass.bypass_daily_limit) {
      if (existingPassToday.status !== 'used' && existingPassToday.status !== 'rejected') {
        // If a pending or approved pass exists, update it with new pickup/time/reason details rather than failing
        const updated = currentList.map(p => {
          if (p.id === existingPassToday.id) {
            return {
              ...p,
              pickup_person_name: pass.pickup_person_name,
              pickup_person_phone: pass.pickup_person_phone,
              pickup_person_relation: pass.pickup_person_relation,
              pickup_person_id_proof: pass.pickup_person_id_proof,
              reason_category: pass.reason_category,
              reason_text: pass.reason_text,
              expected_pickup_time: pass.expected_pickup_time,
              status: pass.status || p.status,
            };
          }
          return p;
        });
        await persistGatePasses(updated);
        const updatedPass = updated.find(p => p.id === existingPassToday.id)!;
        
        // Notify
        try {
          await supabase.from('notifications').insert({
            title: `🚨 Updated Gate Pass Request: ${updatedPass.student_name}`,
            message: `${updatedPass.student_name} (${updatedPass.class_section}) updated gate pass request. Pickup: ${updatedPass.pickup_person_name} (${updatedPass.pickup_person_relation}). Expected: ${updatedPass.expected_pickup_time}. Reason: ${updatedPass.reason_text}`,
            type: 'gate_pass',
            is_read: false,
          });
        } catch {}

        return updatedPass;
      }
    }

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

    const updatedList = [newPass, ...currentList.filter((p) => p.id !== newPass.id)];

    await persistGatePasses(updatedList);

    // Insert real-time notification for Teacher and Admin
    try {
      await supabase.from('notifications').insert({
        title: `🚨 Early Exit Gate Pass Request: ${newPass.student_name}`,
        message: `${newPass.student_name} (${newPass.class_section}) requested early departure. Pass Code: ${newPass.pass_code}. Pickup: ${newPass.pickup_person_name} (${newPass.pickup_person_relation}). Reason: ${newPass.reason_text}`,
        type: 'gate_pass',
        is_read: false,
      });
    } catch (notifErr) {
      console.warn('[GatePassService] Notification insert error:', notifErr);
    }

    return newPass;
  } catch (err) {
    console.error('[GatePassService] createGatePass error:', err);
    throw err;
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

    // Notify Principal & Admin in realtime
    try {
      await supabase.from('notifications').insert({
        title: `📝 Gate Pass Verified by Teacher: ${target.student_name}`,
        message: `Pass ${target.pass_code} for ${target.student_name} (${target.class_section}) verified by ${teacherName}. Awaiting Principal authorization.`,
        type: 'gate_pass',
        is_read: false,
      });
    } catch {}

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

    // Notify Parent & Class Teacher in realtime
    try {
      await supabase.from('notifications').insert({
        title: `✅ Gate Pass Authorized: ${target.student_name}`,
        message: `Pass ${target.pass_code} for ${target.student_name} authorized by Principal ${principalName}. Digital QR Token activated for security turnstile.`,
        type: 'gate_pass',
        is_read: false,
      });
    } catch {}

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

    // Notify Parent in realtime
    try {
      await supabase.from('notifications').insert({
        title: `❌ Gate Pass Disapproved: ${target.student_name}`,
        message: `Gate Pass request for ${target.student_name} was disapproved by ${rejectedBy}. Reason: ${reason || 'Administrative discretion'}.`,
        type: 'gate_pass',
        is_read: false,
      });
    } catch {}

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

    // 3. Notify Parent & School of physical departure
    try {
      await supabase.from('notifications').insert({
        title: `🚪 Campus Exit Recorded: ${pass.student_name}`,
        message: `${pass.student_name} (${pass.class_section}) departed through ${gateName}. Handed over to ${pass.pickup_person_name} (${pass.pickup_person_relation}). Exit verified by ${guardName}.`,
        type: 'gate_pass',
        is_read: false,
      });
    } catch {}

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
 * Subscribe to realtime gate pass updates across all connected clients & devices
 * - 1. Supabase Realtime Broadcast (sub-second network websocket delivery across all devices)
 * - 2. Postgres CDC Database Changes (attendance_settings & gate_entries tables)
 * - 3. In-browser local window sync (0ms instant response)
 * - 4. Cross-tab BroadcastChannel (0ms multi-tab sync)
 * - 5. Automatic window focus & tab visibility re-sync
 * - 6. Smart background polling heartbeat (every 4s while tab is visible)
 */
export function subscribeToGatePasses(onChange: (detail?: any) => void) {
  let isSubscribed = true;

  // 1. Supabase Realtime Broadcast Listener
  const broadcastCh = getSharedBroadcastChannel();
  const broadcastHandler = (resp: any) => {
    if (isSubscribed) onChange(resp?.payload);
  };
  broadcastCh.on('broadcast', { event: 'gate_pass_event' }, broadcastHandler);

  // 2. Supabase Postgres CDC Changes (attendance_settings & gate_entries)
  const uniqueSubName = `sub_gp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const cdcChannel = supabase
    .channel(uniqueSubName)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'attendance_settings',
        filter: `key=eq.${STORAGE_KEY}`,
      },
      (payload) => {
        if (isSubscribed) onChange({ source: 'cdc_attendance_settings', payload });
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'gate_entries',
      },
      (payload) => {
        if (isSubscribed) onChange({ source: 'cdc_gate_entries', payload });
      }
    )
    .subscribe();

  // 3. Local DOM CustomEvent (0ms in current window)
  const handleLocalEvent = (e: Event) => {
    if (isSubscribed) {
      const custom = e as CustomEvent;
      onChange(custom?.detail);
    }
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('presences_gate_pass_updated', handleLocalEvent);
  }

  // 4. Cross-tab BroadcastChannel
  let bc: BroadcastChannel | null = null;
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      bc = new BroadcastChannel('presences_gate_passes_cross_tab');
      bc.onmessage = (msg) => {
        if (isSubscribed) onChange(msg.data);
      };
    }
  } catch {}

  // 5. Window Focus / Tab Visibility Switch (re-sync immediately upon refocus)
  const handleFocus = () => {
    if (isSubscribed) onChange({ reason: 'window-focus' });
  };
  const handleVisibility = () => {
    if (isSubscribed && typeof document !== 'undefined' && document.visibilityState === 'visible') {
      onChange({ reason: 'tab-visible' });
    }
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);
  }

  // 6. Background Polling Heartbeat (every 4000ms while document is visible)
  const intervalId = setInterval(() => {
    if (isSubscribed && typeof document !== 'undefined' && document.visibilityState === 'visible') {
      onChange({ reason: 'heartbeat' });
    }
  }, 4000);

  return () => {
    isSubscribed = false;
    try {
      if (typeof window !== 'undefined') {
        window.removeEventListener('presences_gate_pass_updated', handleLocalEvent);
        window.removeEventListener('focus', handleFocus);
        document.removeEventListener('visibilitychange', handleVisibility);
      }
      if (bc) {
        bc.close();
      }
      clearInterval(intervalId);
      supabase.removeChannel(cdcChannel);
    } catch (_) {}
  };
}
