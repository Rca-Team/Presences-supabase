
import { supabase } from '@/integrations/supabase/client';
import { SetDatesFunction, AttendanceRecord } from './types';

// Normalize status to consistent lowercase values
function normalizeStatus(status: string | null): string {
  if (!status) return 'unknown';
  const s = status.toLowerCase().trim();
  if (s.includes('present')) return 'present';
  if (s.includes('late')) return 'late';
  if (s.includes('absent')) return 'absent';
  return s;
}

// Normalize date to midnight for consistent comparison
function toMidnight(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Extract name from device_info
function extractName(deviceInfo: any): string {
  try {
    if (deviceInfo && typeof deviceInfo === 'object' && !Array.isArray(deviceInfo)) {
      if (deviceInfo.metadata?.name) return deviceInfo.metadata.name;
      if (deviceInfo.name) return deviceInfo.name;
    }
  } catch (e) {
    console.error('Error extracting name from device_info:', e);
  }
  return '';
}

function normalizeGateMetadata(record: any) {
  const metadata = (record?.device_info as any)?.metadata || {};
  const source = String(record?.source || '').toLowerCase();
  const captureMode = String(record?.capture_mode || metadata.capture_mode || '').toLowerCase();
  const isGate = source === 'gate-mode' || captureMode === 'gate-mode' || Boolean((record?.device_info as any)?.gate);

  return {
    source,
    captureMode,
    periodKey: metadata.gate_period_key || metadata.periodKey || undefined,
    className: metadata.class || metadata.class_name || record?.class || undefined,
    section: metadata.section || record?.section || undefined,
    subject: metadata.subject || undefined,
    isGate,
  };
}

// Get all identifiers for a registered face to match attendance records
async function getFaceIdentifiers(faceId: string): Promise<{ userIds: string[]; employeeId: string | null }> {
  const { data } = await supabase
    .from('attendance_records')
    .select('user_id, device_info')
    .eq('id', faceId)
    .eq('status', 'registered')
    .single();

  const userIds: string[] = [faceId]; // Always include the registration record ID
  let employeeId: string | null = null;

  if (data) {
    if (data.user_id) userIds.push(data.user_id);
    const di = data.device_info as any;
    employeeId = di?.metadata?.employee_id || di?.employee_id || null;
    if (employeeId) userIds.push(employeeId);
  }

  return { userIds: [...new Set(userIds)], employeeId };
}

// Fetch attendance records - determines present/late days
export const fetchAttendanceRecords = async (
  faceId: string,
  setAttendanceDays: SetDatesFunction,
  setLateAttendanceDays: SetDatesFunction
) => {
  try {
    const { userIds, employeeId } = await getFaceIdentifiers(faceId);
    
    // Build queries for all possible identifier matches
    const queries = userIds.map(uid =>
      supabase.from('attendance_records')
        .select('id, timestamp, status, source, capture_mode, class, section, device_info')
        .or(`user_id.eq.${uid},id.eq.${uid}`)
        .in('status', ['present', 'late', 'unauthorized'])
    );

    // Also query by employee_id in device_info if available
    if (employeeId) {
      queries.push(
        supabase.from('attendance_records')
          .select('id, timestamp, status, source, capture_mode, class, section, device_info')
          .contains('device_info', { metadata: { employee_id: employeeId } })
          .in('status', ['present', 'late', 'unauthorized'])
      );
    }

    const results = await Promise.all(queries);
    
    // Deduplicate by record ID
    const seen = new Set<string>();
    const allRecords = results.flatMap(r => r.data || []).filter(r => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    });

    if (allRecords.length === 0) {
      setAttendanceDays([]);
      setLateAttendanceDays([]);
      return;
    }

    const presentDaysMap = new Map<string, Date>();
    const lateDaysMap = new Map<string, Date>();

    for (const record of allRecords) {
      if (!record.timestamp) continue;
      const di = record.device_info as any;
      if (di?.registration) continue;

      const status = normalizeStatus(record.status);
      if (status !== 'present' && status !== 'late') continue;

      const date = toMidnight(new Date(record.timestamp));
      const dateKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

      const { isGate } = normalizeGateMetadata(record);

      if (status === 'present' && !isGate) {
        presentDaysMap.set(dateKey, date);
        lateDaysMap.delete(dateKey);
      } else if (status === 'late' && !presentDaysMap.has(dateKey)) {
        lateDaysMap.set(dateKey, date);
      }
    }

    setAttendanceDays(Array.from(presentDaysMap.values()));
    setLateAttendanceDays(Array.from(lateDaysMap.values()));
  } catch (error) {
    console.error('Error in fetchAttendanceRecords:', error);
    throw error;
  }
};

// Fetch daily attendance for a specific date
export const fetchDailyAttendance = async (
  faceId: string,
  date: Date,
  setDailyAttendance: (records: AttendanceRecord[]) => void
) => {
  try {
    const { userIds, employeeId } = await getFaceIdentifiers(faceId);

    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const timestampStart = startOfDay.toISOString();
    const timestampEnd = endOfDay.toISOString();

    const queries = userIds.map(uid =>
      supabase.from('attendance_records')
        .select('id, timestamp, status, source, capture_mode, class, section, device_info, user_id, image_url')
        .or(`user_id.eq.${uid},id.eq.${uid}`)
        .gte('timestamp', timestampStart)
        .lte('timestamp', timestampEnd)
        .order('timestamp', { ascending: true })
    );

    if (employeeId) {
      queries.push(
        supabase.from('attendance_records')
          .select('id, timestamp, status, source, capture_mode, class, section, device_info, user_id, image_url')
          .contains('device_info', { metadata: { employee_id: employeeId } })
          .gte('timestamp', timestampStart)
          .lte('timestamp', timestampEnd)
          .order('timestamp', { ascending: true })
      );
    }

    const results = await Promise.all(queries);

    const allRecordsMap = new Map();
    results.flatMap(r => r.data || []).forEach(r => allRecordsMap.set(r.id, r));
    let allRecords = Array.from(allRecordsMap.values());

    // Filter out registration records
    allRecords = allRecords.filter(r => {
      const di = r.device_info as any;
      if (di?.registration) return false;
      const status = normalizeStatus(r.status);
      return status === 'present' || status === 'late';
    });

    if (allRecords.length > 0) {
      const normalizedRecords = allRecords.map(record => ({
        ...(normalizeGateMetadata(record)),
        id: record.id,
        timestamp: record.timestamp,
        status: normalizeStatus(record.status),
        name: extractName(record.device_info) || 'Student',
        image_url: record.image_url
      }));

      const nonGate = normalizedRecords
        .filter((r) => !r.isGate)
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      const gateLatestByPeriod = new Map<string, (typeof normalizedRecords)[number]>();
      normalizedRecords
        .filter((r) => r.isGate)
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
        .forEach((record) => {
          const key = record.periodKey || record.id;
          gateLatestByPeriod.set(key, record);
        });

      const merged = [...nonGate, ...Array.from(gateLatestByPeriod.values())]
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
        .map(({ isGate, ...record }) => record);

      setDailyAttendance(merged);
    } else {
      setDailyAttendance([]);
    }
  } catch (error) {
    console.error('Error in fetchDailyAttendance:', error);
    throw error;
  }
};

// Export for reuse
export { getFaceIdentifiers };
