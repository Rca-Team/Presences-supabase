import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { format, isWeekend, startOfMonth, eachDayOfInterval, subDays } from 'date-fns';

export interface ChildProfile {
  id: string;
  name: string;
  employee_id: string;
  category: string;
  image_url: string;
  roll_number?: string;
  parent_phone?: string;
  parent_email?: string;
  parent_name?: string;
  blood_group?: string;
  class_teacher_name?: string;
}

export interface AttendanceItem {
  id: string;
  status: 'present' | 'late' | 'absent' | 'unauthorized';
  timestamp: string;
  device_info?: any;
}

export interface GateLogItem {
  id: string;
  student_id: string;
  student_name: string;
  entry_time: string;
  entry_type: 'entry' | 'exit';
  gate_name?: string;
  is_recognized?: boolean;
}

export interface LeaveRequest {
  id: string;
  student_id: string;
  student_name: string;
  start_date: string;
  end_date: string;
  reason_category: string;
  reason_text: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  doctor_note_url?: string;
  rejection_reason?: string;
}

export interface BadgeItem {
  id: string;
  badge_name: string;
  badge_type: string;
  awarded_at: string;
  icon?: string;
}

export interface ParentSummaryStats {
  workingDays: number;
  presentDays: number;
  lateDays: number;
  absentDays: number;
  attendanceRate: number;
  streak: number;
  todayStatus: 'present' | 'late' | 'absent' | 'weekend';
  todayCheckinTime: string | null;
  todayGateEntries: number;
  badgeCount: number;
  rank?: number | null;
}

const STORAGE_KEY_SAVED_CHILDREN = 'presence_parent_saved_children';
const STORAGE_KEY_ACTIVE_CHILD_ID = 'presence_parent_active_child_id';

export function useParentPortal() {
  const { toast } = useToast();

  const [savedChildren, setSavedChildren] = useState<ChildProfile[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_SAVED_CHILDREN);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  const [activeChildId, setActiveChildId] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEY_ACTIVE_CHILD_ID) || '';
  });

  const [studentIdInput, setStudentIdInput] = useState('');
  const [phoneInput, setPhoneInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const [child, setChild] = useState<ChildProfile | null>(null);
  const [attendance, setAttendance] = useState<AttendanceItem[]>([]);
  const [gateLogs, setGateLogs] = useState<GateLogItem[]>([]);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [badges, setBadges] = useState<BadgeItem[]>([]);
  const [isLive, setIsLive] = useState(false);

  // Save children list to localStorage whenever updated
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_SAVED_CHILDREN, JSON.stringify(savedChildren));
    } catch (e) {
      console.warn('Could not save children in localStorage:', e);
    }
  }, [savedChildren]);

  useEffect(() => {
    if (activeChildId) {
      localStorage.setItem(STORAGE_KEY_ACTIVE_CHILD_ID, activeChildId);
    }
  }, [activeChildId]);

  // Lookup function
  const lookupStudent = useCallback(
    async (studentIdQuery: string, phoneQuery: string, silent = false): Promise<boolean> => {
      const cleanId = studentIdQuery.trim();
      const cleanPhone = phoneQuery.trim().replace(/[^0-9+]/g, '');

      if (!cleanId || !cleanPhone) {
        if (!silent) {
          toast({
            title: 'Details Required',
            description: 'Please enter both Student ID and registered Phone number.',
            variant: 'destructive',
          });
        }
        return false;
      }

      setIsLoading(true);
      setHasSearched(true);

      try {
        // 1. Try edge function first
        const { data, error } = await supabase.functions.invoke('parent-lookup', {
          body: { student_id: cleanId, phone: cleanPhone },
        });

        if (!error && data?.found && data.student) {
          const profile: ChildProfile = {
            id: data.student.id,
            name: data.student.name,
            employee_id: data.student.employee_id,
            category: data.student.category,
            image_url: data.student.image_url,
            parent_phone: cleanPhone,
          };

          setChild(profile);
          setActiveChildId(profile.employee_id);
          setAttendance(data.attendance || []);
          setBadges(data.badges || []);

          // Add to saved children list if not already present
          setSavedChildren((prev) => {
            const exists = prev.some((c) => c.employee_id.toLowerCase() === profile.employee_id.toLowerCase());
            if (exists) {
              return prev.map((c) => (c.employee_id.toLowerCase() === profile.employee_id.toLowerCase() ? profile : c));
            }
            return [profile, ...prev];
          });

          // Fetch local leaves
          fetchStudentLeaves(profile.employee_id);

          return true;
        }

        // 2. Direct client fallback search if edge function had an issue
        const { data: records } = await supabase
          .from('attendance_records')
          .select('id, user_id, category, image_url, device_info, timestamp, status')
          .eq('status', 'registered');

        const matchedRecord = (records || []).find((r: any) => {
          const di = r.device_info as any;
          const meta = di?.metadata || di || {};
          const empId = String(meta.employee_id || meta.roll_number || '').toLowerCase();
          const pPhone = String(meta.parent_phone || meta.parentPhone || meta.phone || '').replace(/[^0-9]/g, '');
          const phoneLast10 = cleanPhone.replace(/[^0-9]/g, '').slice(-10);
          return empId === cleanId.toLowerCase() && pPhone.endsWith(phoneLast10);
        });

        if (matchedRecord) {
          const di = matchedRecord.device_info as any;
          const meta = di?.metadata || di || {};
          const profile: ChildProfile = {
            id: matchedRecord.id,
            name: meta.name || meta.student_name || 'Student',
            employee_id: meta.employee_id || meta.roll_number || cleanId,
            category: matchedRecord.category || '6-A',
            image_url: matchedRecord.image_url || '',
            parent_phone: cleanPhone,
            blood_group: meta.blood_group,
          };

          setChild(profile);
          setActiveChildId(profile.employee_id);

          // Fetch attendance history
          const { data: attHistory } = await supabase
            .from('attendance_records')
            .select('id, status, timestamp, device_info')
            .or(`user_id.eq.${profile.id},id.eq.${profile.id}`)
            .in('status', ['present', 'late', 'unauthorized'])
            .order('timestamp', { ascending: false });

          setAttendance((attHistory as any) || []);

          setSavedChildren((prev) => {
            const exists = prev.some((c) => c.employee_id.toLowerCase() === profile.employee_id.toLowerCase());
            return exists ? prev : [profile, ...prev];
          });

          fetchStudentLeaves(profile.employee_id);
          return true;
        }

        if (!silent) {
          toast({
            title: 'Student Not Found',
            description: 'No matching student record found with this ID and phone number.',
            variant: 'destructive',
          });
        }
        return false;
      } catch (err: any) {
        console.error('Lookup error:', err);
        if (!silent) {
          toast({
            title: 'Lookup Error',
            description: err?.message || 'Unable to connect to school server.',
            variant: 'destructive',
          });
        }
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [toast]
  );

  // Fetch submitted leaves for the child
  const fetchStudentLeaves = async (studentEmpId: string) => {
    try {
      const { data } = await supabase
        .from('attendance_settings')
        .select('*')
        .eq('key', `leave_requests_${studentEmpId}`)
        .maybeSingle();

      if (data && data.value && Array.isArray(data.value)) {
        setLeaves(data.value as LeaveRequest[]);
      } else {
        setLeaves([]);
      }
    } catch {
      setLeaves([]);
    }
  };

  // Submit a new leave application
  const submitLeave = async (leave: Omit<LeaveRequest, 'id' | 'created_at' | 'status'>): Promise<boolean> => {
    if (!child) return false;

    try {
      const newLeave: LeaveRequest = {
        ...leave,
        id: `leave_${Date.now()}`,
        status: 'pending',
        created_at: new Date().toISOString(),
      };

      const updatedLeaves = [newLeave, ...leaves];
      setLeaves(updatedLeaves);

      // Save into settings table / leaves storage
      await supabase
        .from('attendance_settings')
        .upsert(
          {
            key: `leave_requests_${child.employee_id}`,
            value: updatedLeaves as any,
          },
          { onConflict: 'key' }
        );

      toast({
        title: '✅ Leave Application Submitted',
        description: `Leave request for ${child.name} has been sent to the class teacher.`,
      });
      return true;
    } catch (err: any) {
      toast({
        title: 'Submission Failed',
        description: err?.message || 'Could not send leave application.',
        variant: 'destructive',
      });
      return false;
    }
  };

  // Auto-login to active child on mount if saved
  useEffect(() => {
    if (!child && savedChildren.length > 0) {
      const target = savedChildren.find((c) => c.employee_id === activeChildId) || savedChildren[0];
      if (target && target.parent_phone) {
        lookupStudent(target.employee_id, target.parent_phone, true);
      }
    }
  }, [activeChildId, child, lookupStudent, savedChildren]);

  // Realtime synchronization for active child
  useEffect(() => {
    if (!child) return;

    const refresh = () => {
      if (child.parent_phone) {
        lookupStudent(child.employee_id, child.parent_phone, true);
      }
    };

    const channel = supabase
      .channel(`parent-live-updates-${child.employee_id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_records' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gate_entries' }, refresh)
      .subscribe((status) => setIsLive(status === 'SUBSCRIBED'));

    const interval = setInterval(refresh, 20000);
    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
      setIsLive(false);
    };
  }, [child, lookupStudent]);

  // Compute stats summary
  const summary: ParentSummaryStats = useMemo(() => {
    const now = new Date();
    const monthStart = startOfMonth(now);
    const todayKey = format(now, 'yyyy-MM-dd');

    const dayMap: Record<string, { status: string; time: string }> = {};
    attendance.forEach((r) => {
      const key = format(new Date(r.timestamp), 'yyyy-MM-dd');
      const s = (r.status || '').toLowerCase();
      const normalized = s === 'unauthorized' || s.includes('present') ? 'present' : s.includes('late') ? 'late' : 'absent';
      if (!dayMap[key] || normalized === 'present') {
        dayMap[key] = { status: normalized, time: r.timestamp };
      }
    });

    let workingDays = 0;
    let presentDays = 0;
    let lateDays = 0;

    const workingInterval = eachDayOfInterval({ start: monthStart, end: now }).filter((d) => !isWeekend(d));
    workingInterval.forEach((d) => {
      workingDays += 1;
      const key = format(d, 'yyyy-MM-dd');
      const st = dayMap[key]?.status;
      if (st === 'present') presentDays += 1;
      if (st === 'late') lateDays += 1;
    });

    const absentDays = Math.max(0, workingDays - presentDays - lateDays);
    const attendanceRate = workingDays > 0 ? Math.round(((presentDays + lateDays) / workingDays) * 100) : 100;

    // Calculate Streak
    let streak = 0;
    const pastDays = eachDayOfInterval({ start: subDays(now, 30), end: now })
      .filter((d) => !isWeekend(d))
      .reverse();

    for (const d of pastDays) {
      const key = format(d, 'yyyy-MM-dd');
      const st = dayMap[key]?.status;
      if (st === 'present' || st === 'late') streak += 1;
      else if (key !== todayKey) break;
    }

    const todayStatus = (isWeekend(now) ? 'weekend' : dayMap[todayKey]?.status || 'absent') as any;
    const todayCheckinTime = dayMap[todayKey]?.time || null;

    return {
      workingDays,
      presentDays,
      lateDays,
      absentDays,
      attendanceRate,
      streak,
      todayStatus,
      todayCheckinTime,
      todayGateEntries: todayStatus === 'present' || todayStatus === 'late' ? 1 : 0,
      badgeCount: badges.length || Math.min(6, Math.floor(presentDays / 3) + (streak >= 3 ? 1 : 0)),
    };
  }, [attendance, badges.length]);

  // Switch to another child (siblings)
  const switchChild = (sibling: ChildProfile) => {
    setChild(sibling);
    setActiveChildId(sibling.employee_id);
    if (sibling.parent_phone) {
      lookupStudent(sibling.employee_id, sibling.parent_phone, true);
    }
  };

  // Logout / Switch Account
  const logout = () => {
    setChild(null);
    setActiveChildId('');
    setHasSearched(false);
    setStudentIdInput('');
    setPhoneInput('');
    localStorage.removeItem(STORAGE_KEY_ACTIVE_CHILD_ID);
  };

  return {
    child,
    savedChildren,
    studentIdInput,
    phoneInput,
    isLoading,
    hasSearched,
    isLive,
    attendance,
    gateLogs,
    leaves,
    badges,
    summary,
    setStudentIdInput,
    setPhoneInput,
    lookupStudent,
    switchChild,
    submitLeave,
    logout,
  };
}
