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

function getLocalDayBoundaries(): { startOfDay: string; endOfDay: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  return {
    startOfDay: start.toISOString(),
    endOfDay: end.toISOString(),
  };
}

/**
 * Single source of truth for attendance stats.
 * 1. Registered = attendance_records with status='registered' (canonical registration table)
 * 2. Present/Late from attendance_records (present/late/unauthorized) + gate_entries
 * 3. Multi-identifier matching (employee_id, user_id, registration id, student_name)
 * 4. Status normalization: unauthorized → present
 */
export async function fetchUnifiedAttendanceStats(): Promise<UnifiedAttendanceStats> {
  const { startOfDay, endOfDay } = getLocalDayBoundaries();

  const [registeredRes, todayRes, gateRes] = await Promise.all([
    supabase.from('attendance_records')
      .select('id, user_id, device_info, category')
      .eq('status', 'registered'),
    supabase.from('attendance_records')
      .select('id, user_id, student_id, student_name, status, device_info, timestamp')
      .in('status', ['present', 'late', 'unauthorized'])
      .gte('timestamp', startOfDay)
      .lte('timestamp', endOfDay),
    supabase.from('gate_entries')
      .select('student_id')
      .gte('entry_time', startOfDay)
      .lte('entry_time', endOfDay)
      .eq('is_recognized', true),
  ]);

  // 1. Build registered users list
  const processedUsers = (registeredRes.data || []).map(r => {
    const m = (r.device_info as any)?.metadata || {};
    return {
      id: r.id,
      user_id: r.user_id,
      employee_id: m.employee_id || (r.device_info as any)?.employee_id || '',
      name: m.name || (r.device_info as any)?.name || '',
    };
  }).filter(u => u.name && u.name !== 'Unknown' && !u.name.toLowerCase().includes('unknown') && u.name !== 'User');

  // Deduplicate by employee_id / user_id
  const seen = new Set<string>();
  const uniqueUsers = processedUsers.filter(u => {
    const key = u.employee_id || u.user_id || u.id;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // 2. Build present/late maps
  const presentMap = new Set<string>();
  const lateMap = new Set<string>();

  const normalizeStatus = (s: string) => {
    const lower = (s || '').toLowerCase().trim();
    if (lower === 'unauthorized' || lower.includes('present')) return 'present';
    if (lower.includes('late')) return 'late';
    return lower;
  };

  (todayRes.data || []).forEach(r => {
    const m = (r.device_info as any)?.metadata || {};
    const possibleKeys = [
      m.employee_id,
      (r.device_info as any)?.employee_id,
      r.student_id,
      r.user_id,
      r.id,
      r.student_name?.trim().toLowerCase(),
      m.name?.trim().toLowerCase(),
    ].filter(Boolean);

    const normalized = normalizeStatus(r.status || '');
    possibleKeys.forEach(k => {
      const keyStr = String(k);
      if (normalized === 'present') {
        presentMap.add(keyStr);
        lateMap.delete(keyStr);
      } else if (normalized === 'late' && !presentMap.has(keyStr)) {
        lateMap.add(keyStr);
      }
    });
  });

  // Merge gate entries
  (gateRes.data || []).forEach(g => {
    if (g.student_id) {
      const keyStr = String(g.student_id);
      if (!presentMap.has(keyStr) && !lateMap.has(keyStr)) {
        presentMap.add(keyStr);
      }
    }
  });

  // 3. Multi-identifier matching
  let totalPresent = 0;
  let totalLate = 0;
  uniqueUsers.forEach(u => {
    const identifiers = [
      u.employee_id,
      u.user_id,
      u.id,
      u.name.trim().toLowerCase(),
    ].filter(Boolean).map(String);

    for (const id of identifiers) {
      if (presentMap.has(id)) {
        totalPresent++;
        return;
      }
      if (lateMap.has(id)) {
        totalLate++;
        return;
      }
    }
  });

  const totalRegistered = uniqueUsers.length;
  const absentToday = Math.max(0, totalRegistered - totalPresent - totalLate);
  const attendanceRate = totalRegistered > 0
    ? Math.round(((totalPresent + totalLate) / totalRegistered) * 100)
    : 0;

  return { totalRegistered, presentToday: totalPresent, lateToday: totalLate, absentToday, attendanceRate };
}

/**
 * Unified per-student attendance snapshot for Admin views.
 * Uses registered users as source-of-truth roster and merges Attendance + Gate Mode records.
 */
export async function fetchUnifiedStudentSnapshot(): Promise<UnifiedStudentSnapshot> {
  const { startOfDay, endOfDay } = getLocalDayBoundaries();

  const [registeredRes, todayRes, gateRes] = await Promise.all([
    supabase
      .from('attendance_records')
      .select('id, user_id, device_info')
      .eq('status', 'registered'),
    supabase
      .from('attendance_records')
      .select('id, user_id, student_id, student_name, status, timestamp, device_info')
      .in('status', ['present', 'late', 'unauthorized'])
      .gte('timestamp', startOfDay)
      .lte('timestamp', endOfDay)
      .order('timestamp', { ascending: false }),
    supabase
      .from('gate_entries')
      .select('student_id, entry_time')
      .gte('entry_time', startOfDay)
      .lte('entry_time', endOfDay)
      .eq('is_recognized', true)
      .order('entry_time', { ascending: false }),
  ]);

  const normalizeStatus = (s: string) => {
    const lower = (s || '').toLowerCase().trim();
    if (lower === 'unauthorized' || lower.includes('present')) return 'present';
    if (lower.includes('late')) return 'late';
    return lower;
  };

  const roster = (registeredRes.data || [])
    .map((r) => {
      const m = (r.device_info as any)?.metadata || {};
      const employeeId = m.employee_id || (r.device_info as any)?.employee_id || '';
      const name = m.name || (r.device_info as any)?.name || '';
      return {
        id: r.id,
        user_id: r.user_id,
        employee_id: employeeId,
        name,
      };
    })
    .filter(
      (u) =>
        u.name &&
        u.name !== 'Unknown' &&
        !u.name.toLowerCase().includes('unknown') &&
        u.name !== 'User',
    );

  // Deduplicate roster by stable key
  const seen = new Set<string>();
  const uniqueUsers = roster.filter((u) => {
    const key = u.employee_id || u.user_id || u.id;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Build lookup index for all known identifiers -> employee_id
  const idToEmployeeId = new Map<string, string>();
  uniqueUsers.forEach((u) => {
    const employeeKey = u.employee_id || u.id;
    [u.employee_id, u.user_id, u.id, u.name.trim().toLowerCase()].filter(Boolean).forEach((id) => {
      idToEmployeeId.set(String(id), employeeKey);
    });
  });

  const statusesByEmployeeId: Record<string, UnifiedStudentStatus> = {};
  uniqueUsers.forEach((u) => {
    const employeeKey = u.employee_id || u.id;
    statusesByEmployeeId[employeeKey] = { status: 'absent' };
  });

  // Latest attendance record wins (query is desc by timestamp)
  (todayRes.data || []).forEach((r) => {
    const metadata = (r.device_info as any)?.metadata || {};
    const possibleIds = [
      r.student_id,
      metadata.employee_id,
      (r.device_info as any)?.employee_id,
      r.user_id,
      r.id,
      r.student_name?.trim().toLowerCase(),
      metadata.name?.trim().toLowerCase(),
    ]
      .filter(Boolean)
      .map(String);

    const matchedEmployeeId = possibleIds
      .map((id) => idToEmployeeId.get(id))
      .find(Boolean);

    if (!matchedEmployeeId) return;
    if (statusesByEmployeeId[matchedEmployeeId]?.status !== 'absent') return;

    const normalized = normalizeStatus(r.status || '');
    if (normalized === 'present' || normalized === 'late') {
      statusesByEmployeeId[matchedEmployeeId] = {
        status: normalized,
        time: r.timestamp,
      };
    }
  });

  // Gate fills only still-absent students
  (gateRes.data || []).forEach((g) => {
    if (!g.student_id) return;
    const matchedEmployeeId = idToEmployeeId.get(String(g.student_id));
    if (!matchedEmployeeId) return;
    if (statusesByEmployeeId[matchedEmployeeId]?.status !== 'absent') return;

    statusesByEmployeeId[matchedEmployeeId] = {
      status: 'present',
      time: g.entry_time,
    };
  });

  const totalRegistered = uniqueUsers.length;
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
}
