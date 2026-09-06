import { supabase } from '@/integrations/supabase/client';
import { parseClassSection } from '@/utils/teacherAccess';

export type GatePassStatus = 'pending' | 'approved' | 'rejected' | 'used' | 'expired';

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
  requested_by: 'parent' | 'teacher';
  pickup_person_name: string;
  pickup_person_phone: string;
  pickup_person_relation: string; // "Father", "Mother", "Guardian", "Self"
  pickup_person_id_proof?: string; // "Aadhaar Card", "Driver License", "Parent ID Card"
  reason_category: GatePassReason;
  reason_text: string;
  created_at: string;
  expected_pickup_time: string; // e.g. "10:30 AM"
  valid_until: string; // e.g. "12:00 PM Today"
  status: GatePassStatus;
  approved_by?: string; // "Swami Anant Vyas (Class Teacher)"
  approved_at?: string;
  rejection_reason?: string;
  exit_time?: string; // ISO timestamp
  exit_gate?: string; // "Main Gate 1"
  security_guard_name?: string;
  guard_notes?: string;
}

const STORAGE_KEY = 'school_gate_passes';

/**
 * Fetch all gate passes from the system
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

    return (data.value as GatePass[]).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
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
 * Create and submit a new gate pass
 */
export async function createGatePass(
  pass: Omit<GatePass, 'id' | 'pass_code' | 'created_at' | 'status'>
): Promise<GatePass | null> {
  try {
    const randomCode = Math.floor(1000 + Math.random() * 9000);
    const passCode = `GP-${randomCode}`;
    const newPass: GatePass = {
      ...pass,
      id: `GP-${pass.student_id}-${Date.now()}`,
      pass_code: passCode,
      created_at: new Date().toISOString(),
      status: pass.requested_by === 'teacher' ? 'approved' : 'pending',
      approved_by: pass.requested_by === 'teacher' ? (pass.approved_by || 'Class Teacher') : undefined,
      approved_at: pass.requested_by === 'teacher' ? new Date().toISOString() : undefined,
    };

    const currentList = await fetchAllGatePasses();
    const updatedList = [newPass, ...currentList.filter((p) => p.id !== newPass.id)];

    const { error } = await supabase
      .from('attendance_settings')
      .upsert(
        {
          key: STORAGE_KEY,
          value: updatedList as any,
          description: 'Official active and historical school early exit gate passes',
        },
        { onConflict: 'key' }
      );

    if (error) throw error;
    return newPass;
  } catch (err) {
    console.error('[GatePassService] createGatePass error:', err);
    return null;
  }
}

/**
 * Update gate pass status (Approve, Reject, Expire)
 */
export async function updateGatePassStatus(
  passId: string,
  status: GatePassStatus,
  options?: {
    approved_by?: string;
    rejection_reason?: string;
  }
): Promise<boolean> {
  try {
    const currentList = await fetchAllGatePasses();
    const target = currentList.find((p) => p.id === passId || p.pass_code === passId);
    if (!target) return false;

    const updated = currentList.map((p) => {
      if (p.id === target.id) {
        return {
          ...p,
          status,
          approved_by: options?.approved_by || p.approved_by,
          approved_at: status === 'approved' ? new Date().toISOString() : p.approved_at,
          rejection_reason: options?.rejection_reason || p.rejection_reason,
        };
      }
      return p;
    });

    const { error } = await supabase
      .from('attendance_settings')
      .upsert(
        {
          key: STORAGE_KEY,
          value: updated as any,
        },
        { onConflict: 'key' }
      );

    if (error) throw error;
    return true;
  } catch (err) {
    console.error('[GatePassService] updateGatePassStatus error:', err);
    return false;
  }
}

/**
 * Verify and authorize exit at the gate turnstile
 * Updates pass to 'used' and logs physical exit in 'gate_entries'
 */
export async function verifyAndExecuteExit(
  passIdentifier: string, // passId or pass_code
  guardName = 'Duty Security Officer',
  gateName = 'Main Gate 1',
  snapshotUrl?: string,
  guardNotes?: string
): Promise<{ success: boolean; pass?: GatePass; message: string }> {
  try {
    const currentList = await fetchAllGatePasses();
    const cleanId = passIdentifier.trim().toLowerCase();
    const pass = currentList.find(
      (p) =>
        p.id.toLowerCase() === cleanId ||
        p.pass_code.toLowerCase() === cleanId ||
        `pass-${p.student_id}`.toLowerCase() === cleanId
    );

    if (!pass) {
      return { success: false, message: 'Invalid Pass: No matching gate pass record found.' };
    }

    if (pass.status === 'used') {
      return {
        success: false,
        pass,
        message: `Pass Already Used: Student already exited on ${new Date(pass.exit_time || '').toLocaleTimeString()} at ${pass.exit_gate || 'Gate'}.`,
      };
    }

    if (pass.status === 'rejected') {
      return {
        success: false,
        pass,
        message: `Pass Rejected: Reason: ${pass.rejection_reason || 'Disapproved by school authority'}.`,
      };
    }

    if (pass.status === 'pending') {
      return {
        success: false,
        pass,
        message: 'Pass Pending: Class teacher has not approved this gate pass yet.',
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
    await supabase
      .from('attendance_settings')
      .upsert(
        {
          key: STORAGE_KEY,
          value: updatedList as any,
        },
        { onConflict: 'key' }
      );

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
        reason: pass.reason_text,
        approved_by: pass.approved_by,
        guard_name: guardName,
        exit_event: 'AUTHORIZED_EARLY_EXIT_GATE_PASS',
      },
    });

    return {
      success: true,
      pass: updatedPass,
      message: `Exit Authorized: ${pass.student_name} released to ${pass.pickup_person_name}.`,
    };
  } catch (err: any) {
    console.error('[GatePassService] verifyAndExecuteExit error:', err);
    return { success: false, message: err?.message || 'Error processing exit verification.' };
  }
}

/**
 * Subscribe to realtime gate pass updates
 */
export function subscribeToGatePasses(onChange: () => void) {
  const channel = supabase
    .channel('realtime-gate-passes-channel')
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
    supabase.removeChannel(channel);
  };
}
