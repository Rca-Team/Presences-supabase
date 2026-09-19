import { supabase } from '@/integrations/supabase/client';

export interface UnifiedAttendanceStats {
  totalRegistered: number;
  presentToday: number;
  lateToday: number;
  absentToday: number;
  attendanceRate: number;
}

export interface UnifiedStudentStatus {
  status: 'present' | 'late' | 'absent';
  time?: string;
}

export interface UnifiedStudentSnapshot {
  totalRegistered: number;
  presentToday: number;
  lateToday: number;
  absentToday: number;
  attendanceRate: number;
  statusesByEmployeeId: Record<string, UnifiedStudentStatus>;
}

/**
 * Returns ISO strings and local date strings for today's 00:00:00 to 23:59:59 window.
 */
function getTodayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const end = new Date();
  end.setHours(23, 59, 59, 999);

  const year = start.getFullYear();
  const month = String(start.getMonth() + 1).padStart(2, '0');
  const day = String(start.getDate()).padStart(2, '0');
  const localDateStr = `${year}-${month}-${day}`;
  const utcDateStr = start.toISOString().split('T')[0];

  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    localDateStr,
    utcDateStr,
  };
}

const normalizeStatus = (s: string | null | undefined): 'present' | 'late' | 'absent' | string => {
  const lower = (s || '').toLowerCase().trim();
  if (lower === 'unauthorized' || lower.includes('present')) return 'present';
  if (lower.includes('late')) return 'late';
  if (lower.includes('absent')) return 'absent';
  return lower;
};

/**
 * Single source of truth for attendance stats across the entire application.
 * 1. Registered = attendance_records (status='registered') + face_descriptors + profiles
 * 2. Present/Late = attendance_records (present/late) + gate_entries (within today's bounds)
 * 3. Multi-identifier matching (user_id, student_id, employee_id, student_name, id)
 */
export async function fetchUnifiedAttendanceStats(): Promise<UnifiedAttendanceStats> {
  const { startIso, endIso, localDateStr, utcDateStr } = getTodayRange();

  try {
    const [registeredRes, descriptorsRes, profilesRes, todayRes, gateRes] = await Promise.all([
      supabase
        .from('attendance_records')
        .select('id, user_id, student_id, student_name, device_info, category')
        .eq('status', 'registered'),
      supabase
        .from('face_descriptors')
        .select('id, user_id, student_id, student_name, label'),
      supabase
        .from('profiles')
        .select('id, full_name, username, role')
        .limit(200),
      supabase
        .from('attendance_records')
        .select('id, user_id, student_id, student_name, status, timestamp, date, device_info')
        .in('status', ['present', 'late', 'unauthorized'])
        .or(`timestamp.gte.${startIso},date.eq.${localDateStr},date.eq.${utcDateStr}`),
      supabase
        .from('gate_entries')
        .select('id, student_id, entry_time, is_recognized')
        .gte('entry_time', startIso)
        .eq('is_recognized', true),
    ]);

    // 1. Build comprehensive registered students roster
    const rawUsers: Array<{ id: string; user_id: string | null; employee_id: string; name: string }> = [];

    // From attendance_records (registered)
    (registeredRes.data || []).forEach((r) => {
      const m = (r.device_info as any)?.metadata || {};
      const empId = r.student_id || m.employee_id || (r.device_info as any)?.employee_id || '';
      const name = r.student_name || m.name || (r.device_info as any)?.name || '';
      if (name && name !== 'Unknown' && !name.toLowerCase().includes('unknown') && name !== 'User') {
        rawUsers.push({
          id: r.id,
          user_id: r.user_id,
          employee_id: String(empId).trim(),
          name: String(name).trim(),
        });
      }
    });

    // From face_descriptors (enrolled biometric models)
    (descriptorsRes.data || []).forEach((d) => {
      const empId = d.student_id || '';
      const name = d.student_name || d.label || '';
      if (name && name !== 'Unknown' && !name.toLowerCase().includes('unknown')) {
        rawUsers.push({
          id: d.id,
          user_id: d.user_id,
          employee_id: String(empId).trim(),
          name: String(name).trim(),
        });
      }
    });

    // From profiles
    (profilesRes.data || []).forEach((p) => {
      if (p.role === 'teacher' || p.role === 'admin' || p.role === 'guard') return;
      const name = p.full_name || p.username || '';
      if (name && name !== 'Unknown' && !name.toLowerCase().includes('unknown')) {
        rawUsers.push({
          id: p.id,
          user_id: p.id,
          employee_id: '',
          name: String(name).trim(),
        });
      }
    });

    // Deduplicate roster by normalized name or employee_id or user_id
    const seenRoster = new Set<string>();
    const uniqueUsers = rawUsers.filter((u) => {
      const key = u.employee_id ? `emp:${u.employee_id.toLowerCase()}`
        : (u.name ? `name:${u.name.toLowerCase()}` : `uid:${u.user_id || u.id}`);
      if (seenRoster.has(key)) return false;
      seenRoster.add(key);
      return true;
    });

    // 2. Build present/late lookup sets
    const presentKeys = new Set<string>();
    const lateKeys = new Set<string>();
    const distinctPresentEntries = new Set<string>();
    const distinctLateEntries = new Set<string>();

    (todayRes.data || []).forEach((r) => {
      const m = (r.device_info as any)?.metadata || {};
      const empId = r.student_id || m.employee_id || (r.device_info as any)?.employee_id;
      const name = r.student_name || m.name || (r.device_info as any)?.name;
      const norm = normalizeStatus(r.status);
      const uniqueEntryKey = `${norm}:${empId || ''}:${name || ''}:${r.user_id || r.id}`;

      const keys = [r.user_id, r.student_id, empId, name, r.id]
        .filter(Boolean)
        .map((k) => String(k).trim().toLowerCase());

      keys.forEach((k) => {
        if (norm === 'present') {
          presentKeys.add(k);
          lateKeys.delete(k);
        } else if (norm === 'late' && !presentKeys.has(k)) {
          lateKeys.add(k);
        }
      });

      if (norm === 'present') {
        distinctPresentEntries.add(uniqueEntryKey);
      } else if (norm === 'late') {
        distinctLateEntries.add(uniqueEntryKey);
      }
    });

    // Merge gate entries
    (gateRes.data || []).forEach((g) => {
      const sId = g.student_id ? String(g.student_id).trim().toLowerCase() : '';
      if (sId) {
        presentKeys.add(sId);
        lateKeys.delete(sId);
        distinctPresentEntries.add(`present:gate:${sId}`);
      }
    });

    // 3. Count matching roster students
    let totalPresent = 0;
    let totalLate = 0;
    const accountedRosterKeys = new Set<string>();

    uniqueUsers.forEach((u) => {
      const identifiers = [u.employee_id, u.user_id, u.id, u.name]
        .filter(Boolean)
        .map((k) => String(k).trim().toLowerCase());

      for (const id of identifiers) {
        if (!id) continue;
        if (presentKeys.has(id)) {
          totalPresent++;
          accountedRosterKeys.add(id);
          return;
        }
        if (lateKeys.has(id)) {
          totalLate++;
          accountedRosterKeys.add(id);
          return;
        }
      }
    });

    // If there were check-in rows that didn't link to a pre-existing roster user, include them so stats never drop live marks!
    const unlistedPresent = Math.max(0, distinctPresentEntries.size - totalPresent);
    const unlistedLate = Math.max(0, distinctLateEntries.size - totalLate);
    totalPresent += unlistedPresent;
    totalLate += unlistedLate;

    const totalRegistered = Math.max(uniqueUsers.length, totalPresent + totalLate);
    const absentToday = Math.max(0, totalRegistered - totalPresent - totalLate);
    const attendanceRate =
      totalRegistered > 0 ? Math.round(((totalPresent + totalLate) / totalRegistered) * 100) : 0;

    return {
      totalRegistered,
      presentToday: totalPresent,
      lateToday: totalLate,
      absentToday,
      attendanceRate,
    };
  } catch (err) {
    console.error('[attendanceStatsHelper] Error calculating attendance stats:', err);
    return {
      totalRegistered: 0,
      presentToday: 0,
      lateToday: 0,
      absentToday: 0,
      attendanceRate: 0,
    };
  }
}

/**
 * Unified per-student attendance snapshot for Admin & Teacher views.
 * Uses registered users as source-of-truth roster and merges Attendance + Gate Mode records.
 */
export async function fetchUnifiedStudentSnapshot(): Promise<UnifiedStudentSnapshot> {
  const { startIso, localDateStr, utcDateStr } = getTodayRange();

  try {
    const [registeredRes, descriptorsRes, profilesRes, todayRes, gateRes] = await Promise.all([
      supabase
        .from('attendance_records')
        .select('id, user_id, student_id, student_name, device_info')
        .eq('status', 'registered'),
      supabase
        .from('face_descriptors')
        .select('id, user_id, student_id, student_name, label'),
      supabase
        .from('profiles')
        .select('id, full_name, username, role')
        .limit(200),
      supabase
        .from('attendance_records')
        .select('id, user_id, student_id, student_name, status, timestamp, date, device_info')
        .in('status', ['present', 'late', 'unauthorized'])
        .or(`timestamp.gte.${startIso},date.eq.${localDateStr},date.eq.${utcDateStr}`)
        .order('timestamp', { ascending: false }),
      supabase
        .from('gate_entries')
        .select('id, student_id, entry_time')
        .gte('entry_time', startIso)
        .eq('is_recognized', true)
        .order('entry_time', { ascending: false }),
    ]);

    const rawRoster: Array<{ id: string; user_id: string | null; employee_id: string; name: string }> = [];

    (registeredRes.data || []).forEach((r) => {
      const m = (r.device_info as any)?.metadata || {};
      const empId = r.student_id || m.employee_id || (r.device_info as any)?.employee_id || '';
      const name = r.student_name || m.name || (r.device_info as any)?.name || '';
      if (name && name !== 'Unknown' && !name.toLowerCase().includes('unknown') && name !== 'User') {
        rawRoster.push({
          id: r.id,
          user_id: r.user_id,
          employee_id: String(empId).trim(),
          name: String(name).trim(),
        });
      }
    });

    (descriptorsRes.data || []).forEach((d) => {
      const empId = d.student_id || '';
      const name = d.student_name || d.label || '';
      if (name && name !== 'Unknown' && !name.toLowerCase().includes('unknown')) {
        rawRoster.push({
          id: d.id,
          user_id: d.user_id,
          employee_id: String(empId).trim(),
          name: String(name).trim(),
        });
      }
    });

    (profilesRes.data || []).forEach((p) => {
      if (p.role === 'teacher' || p.role === 'admin' || p.role === 'guard') return;
      const name = p.full_name || p.username || '';
      if (name && name !== 'Unknown' && !name.toLowerCase().includes('unknown')) {
        rawRoster.push({
          id: p.id,
          user_id: p.id,
          employee_id: '',
          name: String(name).trim(),
        });
      }
    });

    const seen = new Set<string>();
    const uniqueUsers = rawRoster.filter((u) => {
      const key = u.employee_id ? `emp:${u.employee_id.toLowerCase()}`
        : (u.name ? `name:${u.name.toLowerCase()}` : `uid:${u.user_id || u.id}`);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const idToEmployeeId = new Map<string, string>();
    uniqueUsers.forEach((u) => {
      const employeeKey = u.employee_id || u.name || u.id;
      [u.employee_id, u.user_id, u.id, u.name].filter(Boolean).forEach((id) => {
        idToEmployeeId.set(String(id).trim().toLowerCase(), employeeKey);
      });
    });

    const statusesByEmployeeId: Record<string, UnifiedStudentStatus> = {};
    uniqueUsers.forEach((u) => {
      const employeeKey = u.employee_id || u.name || u.id;
      statusesByEmployeeId[employeeKey] = { status: 'absent' };
    });

    // Latest attendance record wins
    (todayRes.data || []).forEach((r) => {
      const metadata = (r.device_info as any)?.metadata || {};
      const possibleIds = [
        r.student_id,
        metadata.employee_id,
        (r.device_info as any)?.employee_id,
        r.student_name,
        metadata.name,
        (r.device_info as any)?.name,
        r.user_id,
        r.id,
      ]
        .filter(Boolean)
        .map((s) => String(s).trim().toLowerCase());

      const matchedEmployeeId = possibleIds
        .map((id) => idToEmployeeId.get(id))
        .find(Boolean);

      const targetKey = matchedEmployeeId || r.student_id || r.student_name || r.user_id || r.id;
      if (!targetKey) return;

      if (statusesByEmployeeId[targetKey]?.status && statusesByEmployeeId[targetKey]?.status !== 'absent') {
        return;
      }

      const normalized = normalizeStatus(r.status);
      if (normalized === 'present' || normalized === 'late') {
        statusesByEmployeeId[targetKey] = {
          status: normalized as 'present' | 'late',
          time: r.timestamp,
        };
      }
    });

    // Gate entries fill remaining absentees
    (gateRes.data || []).forEach((g) => {
      if (!g.student_id) return;
      const sId = String(g.student_id).trim().toLowerCase();
      const matchedEmployeeId = idToEmployeeId.get(sId) || g.student_id;
      if (!matchedEmployeeId) return;

      if (!statusesByEmployeeId[matchedEmployeeId] || statusesByEmployeeId[matchedEmployeeId].status === 'absent') {
        statusesByEmployeeId[matchedEmployeeId] = {
          status: 'present',
          time: g.entry_time,
        };
      }
    });

    const totalRegistered = Object.keys(statusesByEmployeeId).length;
    const presentToday = Object.values(statusesByEmployeeId).filter((s) => s.status === 'present').length;
    const lateToday = Object.values(statusesByEmployeeId).filter((s) => s.status === 'late').length;
    const absentToday = Math.max(0, totalRegistered - presentToday - lateToday);
    const attendanceRate =
      totalRegistered > 0 ? Math.round(((presentToday + lateToday) / totalRegistered) * 100) : 0;

    return {
      totalRegistered,
      presentToday,
      lateToday,
      absentToday,
      attendanceRate,
      statusesByEmployeeId,
    };
  } catch (err) {
    console.error('[attendanceStatsHelper] Error fetching student snapshot:', err);
    return {
      totalRegistered: 0,
      presentToday: 0,
      lateToday: 0,
      absentToday: 0,
      attendanceRate: 0,
      statusesByEmployeeId: {},
    };
  }
}
