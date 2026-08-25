import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { 
  fetchSelectedFace, 
  fetchAttendanceRecords, 
  fetchDailyAttendance,
  generateWorkingDays,
  isDateInArray,
  FaceInfo
} from '../utils/attendanceUtils';
import { getFaceIdentifiers } from '../utils/attendanceRecordsUtils';
import { format } from 'date-fns';

interface AttendanceRecord {
  id: string;
  timestamp: string;
  status: string;
  name?: string;
  image_url?: string;
  source?: string;
  capture_mode?: string;
  period_key?: string;
  class_name?: string;
  section?: string;
  subject?: string;
}

function normalizeStatus(status: string | null): string {
  if (!status) return 'unknown';
  const s = status.toLowerCase().trim();
  if (s.includes('present')) return 'present';
  if (s.includes('late')) return 'late';
  if (s.includes('absent')) return 'absent';
  return s;
}

function toMidnight(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export const useAttendanceCalendar = (selectedFaceId: string | null) => {
  const { toast } = useToast();
  
  const [attendanceDays, setAttendanceDays] = useState<Date[]>([]);
  const [lateAttendanceDays, setLateAttendanceDays] = useState<Date[]>([]);
  const [absentDays, setAbsentDays] = useState<Date[]>([]);
  const [selectedFace, setSelectedFace] = useState<FaceInfo | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [visibleMonth, setVisibleMonth] = useState<Date>(new Date());
  const [loading, setLoading] = useState(false);
  const [dailyAttendance, setDailyAttendance] = useState<AttendanceRecord[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<Record<string, AttendanceRecord[]>>({});
  const [workingDays, setWorkingDays] = useState<Date[]>([]);

  useEffect(() => {
    setWorkingDays(generateWorkingDays(visibleMonth.getFullYear(), visibleMonth.getMonth()));
  }, [visibleMonth]);

  // Compute absent days from working days minus present/late days
  useEffect(() => {
    if (workingDays.length === 0) return;
    
    const today = toMidnight(new Date());
    const absent = workingDays.filter(workDay => {
      const d = toMidnight(workDay);
      if (d > today) return false;
      return !isDateInArray(d, attendanceDays) && !isDateInArray(d, lateAttendanceDays);
    });
    
    setAbsentDays(absent);
  }, [workingDays, attendanceDays, lateAttendanceDays]);

  // Load data when face changes
  useEffect(() => {
    let channel: any = null;

    if (selectedFaceId) {
      setAttendanceDays([]);
      setLateAttendanceDays([]);
      setAbsentDays([]);
      setAttendanceRecords({});
      setVisibleMonth((prev) => selectedDate || prev);
      
      fetchFaceDetails(selectedFaceId);
      loadAttendanceRecords(selectedFaceId);

      channel = supabase
        .channel(`attendance-calendar-${selectedFaceId}`)
        .on('postgres_changes', 
          { event: '*', schema: 'public', table: 'attendance_records' }, 
          () => {
            loadAttendanceRecords(selectedFaceId);
            if (selectedDate) {
              loadDailyAttendance(selectedFaceId, selectedDate);
            }
          }
        )
        .subscribe();
    } else {
      setSelectedFace(null);
      setAttendanceDays([]);
      setLateAttendanceDays([]);
      setAbsentDays([]);
      setAttendanceRecords({});
      setVisibleMonth(new Date());
    }

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [selectedFaceId]);

  useEffect(() => {
    if (selectedFaceId && selectedDate) {
      loadDailyAttendance(selectedFaceId, selectedDate);
    } else {
      setDailyAttendance([]);
    }
  }, [selectedFaceId, selectedDate]);

  const fetchFaceDetails = async (faceId: string) => {
    try {
      const faceInfo = await fetchSelectedFace(faceId);
      setSelectedFace(faceInfo);
    } catch (error) {
      console.error('Error fetching face details:', error);
    }
  };

  const loadAttendanceRecords = async (faceId: string) => {
    try {
      setLoading(true);
      await fetchAttendanceRecords(faceId, setAttendanceDays, setLateAttendanceDays);
      
      // Build records-by-date map for tooltips using same identifier logic
      const { userIds, employeeId } = await getFaceIdentifiers(faceId);
      
      const queries = userIds.map(uid =>
        supabase.from('attendance_records')
          .select('id, timestamp, status, source, capture_mode, class, section, device_info, image_url')
          .or(`user_id.eq.${uid},id.eq.${uid}`)
          .in('status', ['present', 'late', 'unauthorized'])
          .order('timestamp', { ascending: true })
      );

      if (employeeId) {
        queries.push(
          supabase.from('attendance_records')
            .select('id, timestamp, status, source, capture_mode, class, section, device_info, image_url')
            .contains('device_info', { metadata: { employee_id: employeeId } })
            .in('status', ['present', 'late', 'unauthorized'])
            .order('timestamp', { ascending: true })
        );
      }

      const results = await Promise.all(queries);
      const seen = new Set<string>();
      const allRecords = results.flatMap(r => r.data || []).filter(r => {
        if (seen.has(r.id)) return false;
        seen.add(r.id);
        return true;
      });

      if (allRecords.length > 0) {
        const recordsByDate: Record<string, AttendanceRecord[]> = {};
        
        for (const record of allRecords) {
          const deviceInfo = record.device_info as any;
          if (deviceInfo?.registration) continue;
          
          const status = normalizeStatus(record.status);
          if (status !== 'present' && status !== 'late') continue;
          
          let name = deviceInfo?.metadata?.name || deviceInfo?.name || '';
          const source = record.source || deviceInfo?.metadata?.capture_mode || '';
          const periodKey = deviceInfo?.metadata?.gate_period_key || deviceInfo?.metadata?.periodKey;
          const className = deviceInfo?.metadata?.class || deviceInfo?.metadata?.class_name || record.class;
          const section = deviceInfo?.metadata?.section || record.section;
          const subject = deviceInfo?.metadata?.subject;
          const dateKey = format(new Date(record.timestamp), 'yyyy-MM-dd');

          const nextRecord: AttendanceRecord = {
            id: record.id,
            timestamp: record.timestamp,
            status,
            name: name || selectedFace?.name || 'Student',
            image_url: record.image_url,
            source,
            capture_mode: record.capture_mode,
            period_key: periodKey,
            class_name: className,
            section,
            subject,
          };

          if (!recordsByDate[dateKey]) recordsByDate[dateKey] = [];
          recordsByDate[dateKey].push(nextRecord);
        }

        Object.keys(recordsByDate).forEach((key) => {
          recordsByDate[key] = recordsByDate[key].sort(
            (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
          );
        });
        
        setAttendanceRecords(recordsByDate);
      }
    } catch (error) {
      console.error('Error loading attendance records:', error);
    } finally {
      setLoading(false);
    }
  };

  const refreshSelectedFace = useCallback(async () => {
    if (!selectedFaceId) return;
    await fetchFaceDetails(selectedFaceId);
  }, [selectedFaceId]);

  const loadDailyAttendance = async (faceId: string, date: Date) => {
    try {
      await fetchDailyAttendance(faceId, date, (records) => {
        const enhanced = records.map(r => ({
          ...r,
          name: r.name && r.name !== 'Student' ? r.name : selectedFace?.name || 'Student'
        }));
        setDailyAttendance(enhanced);
      });
    } catch (error) {
      console.error('Error loading daily attendance:', error);
    }
  };

  return {
    attendanceDays,
    lateAttendanceDays,
    absentDays,
    selectedFace,
    selectedDate,
    setSelectedDate,
    visibleMonth,
    setVisibleMonth,
    loading,
    dailyAttendance,
    workingDays,
    isDateInArray,
    attendanceRecords,
    selectedFaceId,
    refreshSelectedFace,
  };
};
