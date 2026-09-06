import React, { useState, useEffect, useMemo, useRef, useCallback, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Users,
  CheckCircle2,
  XCircle,
  Clock,
  Send,
  Download,
  Plus,
  Edit2,
  Calendar,
  AlertCircle,
  FileSpreadsheet,
  FileDown,
  Sparkles,
  Zap,
  Phone,
  Mail,
  Search,
  CheckSquare,
  Square,
  GraduationCap,
  Loader2,
  Check,
  Save,
  MessageSquare,
  UserX,
  UserCheck,
  RefreshCw,
  CheckCheck,
  Filter,
  QrCode,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import {
  fetchTeacherCategories,
  fetchTeacherPermissions,
  parseClassSection,
  matchesClassAndSection,
  DEFAULT_TEACHER_PERMISSIONS,
  type TeacherPermissions,
} from '@/utils/teacherAccess';
import { TeacherHeroDeck } from './TeacherHeroDeck';
import { TeacherMonthlyRegister } from './TeacherMonthlyRegister';
import { TeacherGatePassReview } from './TeacherGatePassReview';
import { fetchClassGatePasses, subscribeToGatePasses } from '@/services/gatePassService';
import * as XLSX from 'xlsx';

const ClassSectionReport = React.lazy(() => import('@/components/admin/ClassSectionReport'));
const TimetableManager = React.lazy(() => import('@/components/admin/TimetableManager'));

export interface ClassStudent {
  id: string;
  user_id?: string;
  name: string;
  roll_number?: string;
  admission_number?: string;
  parent_name?: string;
  parent_email?: string;
  parent_phone?: string;
  photo_url?: string;
  has_face_descriptor: boolean;
  today_status?: 'present' | 'late' | 'absent' | 'unmarked';
  today_time?: string;
  was_present_yesterday?: boolean;
  capture_mode?: string;
  attendance_source?: string;
  is_manual?: boolean;
}

export const getPreviousWorkingDay = (from: Date = new Date()) => {
  const d = new Date(from);
  d.setDate(d.getDate() - 1);
  if (d.getDay() === 0) {
    // Skip Sunday, move to Saturday
    d.setDate(d.getDate() - 1);
  }
  const start = new Date(d);
  start.setHours(0, 0, 0, 0);
  const end = new Date(d);
  end.setHours(23, 59, 59, 999);
  const label = d.toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' });
  return { start, end, label, dateObj: d };
};

export interface ClassAssignment {
  class: string;
  section: string;
  category: string;
}

export interface TeacherAdminWorkspaceProps {
  initialClass?: { class: string; section: string; category: string };
}

export const TeacherAdminWorkspace: React.FC<TeacherAdminWorkspaceProps> = ({ initialClass }) => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { userId, role, isAdminOrPrincipal } = useUserRole();

  const [loading, setLoading] = useState(true);
  const [assignments, setAssignments] = useState<ClassAssignment[]>([]);
  const [activeClass, setActiveClass] = useState<ClassAssignment | null>(initialClass || null);
  const [students, setStudents] = useState<ClassStudent[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('daily');
  const [dailyFilter, setDailyFilter] = useState<'all' | 'unmarked' | 'present_yesterday' | 'absent' | 'present' | 'late'>('all');
  const [previousDayLabel, setPreviousDayLabel] = useState<string>('Previous Working Day');
  const [isMarkingAttendance, setIsMarkingAttendance] = useState(false);
  const [pendingGatePassesCount, setPendingGatePassesCount] = useState(0);

  // Student Edit Dialog
  const [editStudent, setEditStudent] = useState<ClassStudent | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isSavingStudent, setIsSavingStudent] = useState(false);

  // Add Student Dialog
  const [isAddStudentOpen, setIsAddStudentOpen] = useState(false);
  const [newStudent, setNewStudent] = useState({
    name: '',
    roll_number: '',
    admission_number: '',
    parent_name: '',
    parent_email: '',
    parent_phone: '',
  });
  const [isAddingStudent, setIsAddingStudent] = useState(false);

  // Notification Composer State
  const [notifTarget, setNotifTarget] = useState<'all' | 'absent' | 'late' | 'selected'>('all');
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [notifSubject, setNotifSubject] = useState('');
  const [notifMessage, setNotifMessage] = useState('');
  const [isSendingNotif, setIsSendingNotif] = useState(false);

  const [permissions, setPermissions] = useState<TeacherPermissions>(DEFAULT_TEACHER_PERMISSIONS);
  const [teacherProfile, setTeacherProfile] = useState<{ name: string; email: string; avatarUrl?: string }>({
    name: 'Faculty Teacher',
    email: '',
    avatarUrl: '',
  });

  // Load teacher class assignments, permissions, and profile
  const loadTeacherAssignments = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [categories, perms, profileRes, authRes] = await Promise.all([
        fetchTeacherCategories(userId),
        fetchTeacherPermissions(userId),
        supabase.from('profiles').select('display_name, username, avatar_url, parent_email').eq('user_id', userId).maybeSingle(),
        supabase.auth.getUser(),
      ]);

      setPermissions(perms);

      const userProfile = profileRes.data;
      const authUser = authRes.data?.user;
      setTeacherProfile({
        name: userProfile?.display_name || userProfile?.username || authUser?.email?.split('@')[0] || 'Faculty Teacher',
        email: authUser?.email || userProfile?.parent_email || '',
        avatarUrl: userProfile?.avatar_url || '',
      });

      let list: ClassAssignment[] = categories
        .map(c => {
          const parsed = parseClassSection(c);
          return parsed ? { class: parsed.className, section: parsed.section, category: c } : null;
        })
        .filter((c): c is ClassAssignment => Boolean(c));

      // Admin or Principal fallback: show classes if no specific assignments
      if (list.length === 0 && (isAdminOrPrincipal || role === 'admin' || role === 'principal')) {
        list = [
          { class: '6', section: 'A', category: '6-A' },
          { class: '6', section: 'B', category: '6-B' },
          { class: '10', section: 'A', category: '10-A' },
          { class: '10', section: 'B', category: '10-B' },
          { class: '9', section: 'A', category: '9-A' },
          { class: '11', section: 'A', category: '11-A' },
        ];
      }

      setAssignments(list);
      if (list.length > 0) {
        setActiveClass(prev => {
          if (prev && list.some(a => a.category === prev.category)) return prev;
          return list[0];
        });
      }
    } catch (err) {
      console.error('Error loading teacher assignments:', err);
    } finally {
      setLoading(false);
    }
  }, [userId, isAdminOrPrincipal, role]);

  useEffect(() => {
    loadTeacherAssignments();
  }, [loadTeacherAssignments]);

  useEffect(() => {
    if (!activeClass) return;
    let isMounted = true;
    const updatePendingCount = async () => {
      try {
        const passes = await fetchClassGatePasses(activeClass.class, activeClass.section);
        if (isMounted) {
          const pending = passes.filter(p => p.status === 'pending').length;
          setPendingGatePassesCount(pending);
        }
      } catch (err) {
        console.error('Error fetching pending gate passes count:', err);
      }
    };
    updatePendingCount();

    const unsub = subscribeToGatePasses(() => {
      updatePendingCount();
    });

    return () => {
      isMounted = false;
      unsub();
    };
  }, [activeClass]);

  // Load complete student roster across attendance_records and profiles
  const loadClassStudents = useCallback(async () => {
    if (!activeClass) return;
    setIsRefreshing(true);
    try {
      const { class: cls, section: sec, category } = activeClass;
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);

      const prevWorkingDay = getPreviousWorkingDay();
      setPreviousDayLabel(prevWorkingDay.label);

      // Fetch from profiles, registered attendance records, face descriptors, today's attendance logs, and previous working day's logs
      const [profilesRes, registeredAttRes, descriptorsRes, todayAttRes, prevDayAttRes] = await Promise.all([
        supabase.from('profiles').select('*'),
        supabase
          .from('attendance_records')
          .select('id, user_id, student_id, student_name, class, section, category, status, device_info, image_url, timestamp')
          .eq('status', 'registered')
          .order('timestamp', { ascending: false }),
        supabase
          .from('face_descriptors')
          .select('id, user_id, student_id, image_url'),
        supabase
          .from('attendance_records')
          .select('id, user_id, student_id, student_name, class, section, category, status, timestamp, device_info, capture_mode, source')
          .gte('timestamp', startOfToday.toISOString())
          .order('timestamp', { ascending: false }),
        supabase
          .from('attendance_records')
          .select('id, user_id, student_id, student_name, class, section, category, status, timestamp, device_info')
          .gte('timestamp', prevWorkingDay.start.toISOString())
          .lte('timestamp', prevWorkingDay.end.toISOString())
          .order('timestamp', { ascending: false }),
      ]);

      // Enrolled face descriptor IDs
      const enrolledFaceIds = new Set<string>();
      (descriptorsRes.data || []).forEach((f: any) => {
        if (f.user_id) enrolledFaceIds.add(String(f.user_id).trim().toLowerCase());
        if (f.student_id) enrolledFaceIds.add(String(f.student_id).trim().toLowerCase());
      });

      // Previous working day present IDs set
      const prevDayPresentSet = new Set<string>();
      (prevDayAttRes.data || []).forEach((att: any) => {
        if (att.status === 'registered') return;
        if (!matchesClassAndSection(att, cls, sec)) return;
        const rawStatus = (att.status || '').toLowerCase();
        if (rawStatus.includes('present') || rawStatus.includes('late')) {
          if (att.user_id) prevDayPresentSet.add(String(att.user_id).trim().toLowerCase());
          if (att.student_id) prevDayPresentSet.add(String(att.student_id).trim().toLowerCase());
          if (att.student_name) prevDayPresentSet.add(String(att.student_name).trim().toLowerCase());
          const dInfo = (att.device_info as any) || {};
          if (dInfo.metadata?.employee_id) prevDayPresentSet.add(String(dInfo.metadata.employee_id).trim().toLowerCase());
          if (dInfo.metadata?.name) prevDayPresentSet.add(String(dInfo.metadata.name).trim().toLowerCase());
        }
      });

      // Today's attendance status map
      const todayAttMap = new Map<string, {
        status: 'present' | 'late' | 'absent';
        time: string;
        source?: string;
        captureMode?: string;
        isManual?: boolean;
      }>();
      const matchingTodayAtt = (todayAttRes.data || []).filter((r: any) => matchesClassAndSection(r, cls, sec));

      matchingTodayAtt.forEach((att: any) => {
        if (att.status === 'registered') return;
        const sName = (att.student_name || '').toLowerCase().trim();
        const uId = att.user_id ? String(att.user_id).trim().toLowerCase() : '';
        const sId = att.student_id ? String(att.student_id).trim().toLowerCase() : '';
        const normalizedStatus = (att.status?.toLowerCase().includes('late') ? 'late' : att.status?.toLowerCase().includes('absent') ? 'absent' : 'present') as 'present' | 'late' | 'absent';
        const timeFormatted = att.timestamp ? new Date(att.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '';
        const devInfo = (att.device_info as any) || {};
        const isManual = Boolean(
          att.capture_mode === 'manual' ||
          att.source === 'teacher-portal' ||
          devInfo.mark === 'manual_attendance' ||
          devInfo.manual ||
          att.source === 'manual'
        );
        const info = {
          status: normalizedStatus,
          time: timeFormatted,
          source: att.source || devInfo.source || (isManual ? 'teacher-portal' : 'biometric'),
          captureMode: att.capture_mode || devInfo.capture_mode || (isManual ? 'manual' : 'ai-scan'),
          isManual,
        };

        if (uId && !todayAttMap.has(uId)) todayAttMap.set(uId, info);
        if (sId && !todayAttMap.has(sId)) todayAttMap.set(sId, info);
        if (sName && !todayAttMap.has(sName)) todayAttMap.set(sName, info);
      });

      // Master student unification map
      const studentMap = new Map<string, ClassStudent>();
      const byUserId = new Map<string, string>();
      const byName = new Map<string, string>();
      const byEmployeeId = new Map<string, string>();

      const norm = (v: any) => (v == null ? '' : String(v).trim().toLowerCase());

      const upsertStudent = (candidate: ClassStudent) => {
        const uid = norm(candidate.user_id);
        const nameKey = norm(candidate.name);
        const empKey = norm(candidate.admission_number || candidate.roll_number);

        const existingKey =
          (uid && byUserId.get(uid)) ||
          (empKey && byEmployeeId.get(empKey)) ||
          (nameKey && byName.get(nameKey)) ||
          (studentMap.has(candidate.id) ? candidate.id : undefined);

        if (existingKey && studentMap.has(existingKey)) {
          const cur = studentMap.get(existingKey)!;
          const merged: ClassStudent = {
            ...cur,
            user_id: cur.user_id || candidate.user_id,
            name: cur.name && cur.name !== 'Student' ? cur.name : candidate.name,
            roll_number: cur.roll_number || candidate.roll_number || '',
            admission_number: cur.admission_number || candidate.admission_number || '',
            parent_name: cur.parent_name || candidate.parent_name || '',
            parent_email: cur.parent_email || candidate.parent_email || '',
            parent_phone: cur.parent_phone || candidate.parent_phone || '',
            photo_url: cur.photo_url || candidate.photo_url || '',
            has_face_descriptor: cur.has_face_descriptor || candidate.has_face_descriptor,
            today_status: cur.today_status && cur.today_status !== 'unmarked' ? cur.today_status : candidate.today_status,
            today_time: cur.today_time || candidate.today_time,
            was_present_yesterday: cur.was_present_yesterday ?? candidate.was_present_yesterday,
            capture_mode: cur.capture_mode || candidate.capture_mode,
            attendance_source: cur.attendance_source || candidate.attendance_source,
            is_manual: cur.is_manual ?? candidate.is_manual,
          };
          studentMap.set(existingKey, merged);
        } else {
          studentMap.set(candidate.id, candidate);
          const key = candidate.id;
          if (uid) byUserId.set(uid, key);
          if (nameKey) byName.set(nameKey, key);
          if (empKey) byEmployeeId.set(empKey, key);
        }
      };

      // 1. Process attendance_records with status = 'registered'
      (registeredAttRes.data || []).forEach((r: any) => {
        const deviceInfo = (r.device_info as any) || {};
        const meta = deviceInfo?.metadata || {};
        const categoryVal = r.category || meta.category || meta.department;
        const classVal = r.class || meta.class;
        const sectionVal = r.section || meta.section;

        if (!matchesClassAndSection({ category: categoryVal, class: classVal, section: sectionVal, department: meta.department }, cls, sec)) {
          return;
        }

        const name = meta.name || r.student_name || deviceInfo.name || 'Student';
        const empId = meta.employee_id || deviceInfo.employee_id || r.student_id || '';
        const roll = meta.roll_number || deviceInfo.roll_number || '';
        const pPhone = meta.parent_phone || deviceInfo.parent_phone || meta.phone || '';
        const pEmail = meta.parent_email || deviceInfo.parent_email || (meta.email?.includes('@') ? meta.email : '');
        const pName = meta.parent_name || deviceInfo.parent_name || '';
        const photo = r.image_url || meta.firebase_image_url || meta.image_url || '';

        const uidKey = norm(r.user_id);
        const nameK = norm(name);
        const empK = norm(empId);

        const hasFace =
          (uidKey && enrolledFaceIds.has(uidKey)) ||
          (empK && enrolledFaceIds.has(empK)) ||
          Boolean(photo);

        const attInfo =
          (uidKey && todayAttMap.get(uidKey)) ||
          (empK && todayAttMap.get(empK)) ||
          (nameK && todayAttMap.get(nameK));

        const wasPresentPrev = Boolean(
          (uidKey && prevDayPresentSet.has(uidKey)) ||
          (empK && prevDayPresentSet.has(empK)) ||
          (nameK && prevDayPresentSet.has(nameK))
        );

        upsertStudent({
          id: r.id || r.user_id || `att-${nameK}`,
          user_id: r.user_id,
          name,
          roll_number: roll,
          admission_number: empId,
          parent_name: pName,
          parent_email: pEmail,
          parent_phone: pPhone,
          photo_url: photo,
          has_face_descriptor: hasFace,
          today_status: attInfo?.status || 'unmarked',
          today_time: attInfo?.time || '',
          was_present_yesterday: wasPresentPrev,
          capture_mode: attInfo?.captureMode,
          attendance_source: attInfo?.source,
          is_manual: attInfo?.isManual,
        });
      });

      // 2. Process profiles table
      (profilesRes.data || []).forEach((p: any) => {
        if (!matchesClassAndSection(p, cls, sec)) return;

        const name = p.display_name || p.full_name || p.username || 'Student';
        const uidKey = norm(p.user_id || p.id);
        const nameK = norm(name);
        const empK = norm(p.admission_number || p.roll_number);

        const hasFace =
          (uidKey && enrolledFaceIds.has(uidKey)) ||
          (empK && enrolledFaceIds.has(empK)) ||
          Boolean(p.photo_url || p.avatar_url);

        const attInfo =
          (uidKey && todayAttMap.get(uidKey)) ||
          (empK && todayAttMap.get(empK)) ||
          (nameK && todayAttMap.get(nameK));

        const wasPresentPrev = Boolean(
          (uidKey && prevDayPresentSet.has(uidKey)) ||
          (empK && prevDayPresentSet.has(empK)) ||
          (nameK && prevDayPresentSet.has(nameK))
        );

        upsertStudent({
          id: p.id || p.user_id || `prof-${nameK}`,
          user_id: p.user_id || p.id,
          name,
          roll_number: p.roll_number || '',
          admission_number: p.admission_number || '',
          parent_name: p.parent_name || '',
          parent_email: p.parent_email || (p.email?.includes('@') ? p.email : ''),
          parent_phone: p.parent_phone || p.phone_number || '',
          photo_url: p.photo_url || p.avatar_url || '',
          has_face_descriptor: hasFace,
          today_status: attInfo?.status || 'unmarked',
          today_time: attInfo?.time || '',
          was_present_yesterday: wasPresentPrev,
          capture_mode: attInfo?.captureMode,
          attendance_source: attInfo?.source,
          is_manual: attInfo?.isManual,
        });
      });

      const finalStudents = Array.from(studentMap.values()).sort((a, b) => {
        const rollA = parseInt(a.roll_number || '999', 10);
        const rollB = parseInt(b.roll_number || '999', 10);
        if (!isNaN(rollA) && !isNaN(rollB) && rollA !== rollB) return rollA - rollB;
        return a.name.localeCompare(b.name);
      });

      setStudents(finalStudents);
    } catch (err) {
      console.error('Error loading class students:', err);
      toast({ title: 'Failed to load students', description: 'Could not fetch class roster', variant: 'destructive' });
    } finally {
      setIsRefreshing(false);
    }
  }, [activeClass, toast]);

  useEffect(() => {
    loadClassStudents();
  }, [loadClassStudents]);

  // Real-time Supabase subscription for instant live attendance sync
  useEffect(() => {
    if (!activeClass) return;

    const channelName = `teacher_workspace_att_${activeClass.class}_${activeClass.section}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'attendance_records',
        },
        () => {
          loadClassStudents();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeClass, loadClassStudents]);

  // Quick mark a single student (Present, Late, Absent)
  const handleQuickMarkAttendance = async (student: ClassStudent, status: 'present' | 'late' | 'absent') => {
    if (!activeClass) return;
    const prevStatus = student.today_status;
    const prevTime = student.today_time;
    const prevIsManual = student.is_manual;
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

    // Optimistic UI update
    setStudents(prev =>
      prev.map(s => s.id === student.id ? {
        ...s,
        today_status: status,
        today_time: timeStr,
        is_manual: true,
        capture_mode: 'manual',
        attendance_source: 'teacher-portal',
      } : s)
    );

    try {
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      const endOfToday = new Date();
      endOfToday.setHours(23, 59, 59, 999);

      // Clear existing record for today if exists
      let del = supabase.from('attendance_records').delete().gte('timestamp', startOfToday.toISOString()).lte('timestamp', endOfToday.toISOString());
      if (student.user_id) {
        del = del.eq('user_id', student.user_id);
      } else {
        del = del.eq('student_name', student.name);
      }
      await del;

      // Insert new manual attendance record
      const { error } = await supabase.from('attendance_records').insert({
        user_id: student.user_id || null,
        student_id: student.admission_number || student.roll_number || null,
        student_name: student.name,
        class: activeClass.class,
        section: activeClass.section,
        category: activeClass.category,
        roll_number: student.roll_number || null,
        status: status,
        source: 'teacher-portal',
        capture_mode: 'manual',
        timestamp: now.toISOString(),
        device_info: {
          source: 'teacher-portal',
          capture_mode: 'manual',
          mark: 'manual_attendance',
          marked_by: teacherProfile.name,
          verified_by: teacherProfile.email,
          was_present_previous_day: Boolean(student.was_present_yesterday),
          metadata: {
            name: student.name,
            roll_number: student.roll_number,
            class: activeClass.class,
            section: activeClass.section,
            department: activeClass.category,
            manual: true,
            marked_at: now.toISOString(),
          },
        },
        metadata: {
          source: 'teacher-portal',
          capture_mode: 'manual',
          mark: 'manual_attendance',
          marked_by: teacherProfile.name,
          verified_by: teacherProfile.email,
          was_present_previous_day: Boolean(student.was_present_yesterday),
          manual: true,
        },
      });

      if (error) throw error;

      toast({
        title: `Marked ${status.toUpperCase()}`,
        description: `${student.name} marked as ${status} (Manual Attendance).`,
      });
    } catch (err: any) {
      console.error('Error saving manual attendance:', err);
      // Revert optimistic update on error
      setStudents(prev =>
        prev.map(s => s.id === student.id ? {
          ...s,
          today_status: prevStatus,
          today_time: prevTime,
          is_manual: prevIsManual,
        } : s)
      );
      toast({ title: 'Failed to mark attendance', description: err.message, variant: 'destructive' });
    }
  };

  // Auto-mark absent for students (either only those present yesterday without check-in, or all unmarked)
  const handleAutoMarkAbsent = async (onlyPrevDayPresent: boolean = false) => {
    if (!activeClass) return;
    const targetStudents = students.filter(s => {
      const isUnmarked = !s.today_status || s.today_status === 'unmarked';
      if (!isUnmarked) return false;
      if (onlyPrevDayPresent) return Boolean(s.was_present_yesterday);
      return true;
    });

    if (targetStudents.length === 0) {
      toast({
        title: 'No Students to Mark',
        description: onlyPrevDayPresent
          ? 'All students who were present on the previous working day already have attendance logged.'
          : 'All students in this class already have attendance marked for today.',
      });
      return;
    }

    setIsMarkingAttendance(true);
    try {
      const nowIso = new Date().toISOString();
      const timeStr = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
      const rows = targetStudents.map(s => ({
        user_id: s.user_id || null,
        student_id: s.admission_number || s.roll_number || null,
        student_name: s.name,
        class: activeClass.class,
        section: activeClass.section,
        category: activeClass.category,
        roll_number: s.roll_number || null,
        status: 'absent',
        source: 'teacher-portal',
        capture_mode: 'manual',
        timestamp: nowIso,
        device_info: {
          source: 'teacher-portal',
          capture_mode: 'manual',
          mark: 'manual_attendance',
          marked_by: teacherProfile.name,
          verified_by: teacherProfile.email,
          was_present_previous_day: Boolean(s.was_present_yesterday),
          metadata: {
            name: s.name,
            roll_number: s.roll_number,
            class: activeClass.class,
            section: activeClass.section,
            department: activeClass.category,
            manual: true,
            marked_at: nowIso,
          },
        },
        metadata: {
          source: 'teacher-portal',
          capture_mode: 'manual',
          mark: 'manual_attendance',
          marked_by: teacherProfile.name,
          verified_by: teacherProfile.email,
          was_present_previous_day: Boolean(s.was_present_yesterday),
          manual: true,
        },
      }));

      const { error } = await supabase.from('attendance_records').insert(rows);
      if (error) throw error;

      // Optimistically update
      setStudents(prev =>
        prev.map(s => {
          const isTarget = targetStudents.some(u => u.id === s.id);
          if (isTarget) {
            return {
              ...s,
              today_status: 'absent',
              today_time: timeStr,
              is_manual: true,
              capture_mode: 'manual',
              attendance_source: 'teacher-portal',
            };
          }
          return s;
        })
      );

      toast({
        title: '✅ Auto-Marked Absent',
        description: `Successfully marked ${targetStudents.length} student${targetStudents.length > 1 ? 's' : ''} as Absent (Manual).`,
      });
    } catch (err: any) {
      console.error('Error auto-marking absent:', err);
      toast({ title: 'Auto-Mark Failed', description: err.message, variant: 'destructive' });
    } finally {
      setIsMarkingAttendance(false);
    }
  };

  // 1-Click mark all unmarked students as Present
  const handleMarkAllUnmarkedPresent = async () => {
    if (!activeClass) return;
    const unmarked = students.filter(s => !s.today_status || s.today_status === 'unmarked');
    if (unmarked.length === 0) {
      toast({ title: 'All Marked', description: 'Every student in this class already has attendance marked today.' });
      return;
    }

    setIsMarkingAttendance(true);
    try {
      const nowIso = new Date().toISOString();
      const timeStr = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
      const rows = unmarked.map(s => ({
        user_id: s.user_id || null,
        student_id: s.admission_number || s.roll_number || null,
        student_name: s.name,
        class: activeClass.class,
        section: activeClass.section,
        category: activeClass.category,
        roll_number: s.roll_number || null,
        status: 'present',
        source: 'teacher-portal',
        capture_mode: 'manual',
        timestamp: nowIso,
        device_info: {
          source: 'teacher-portal',
          capture_mode: 'manual',
          mark: 'manual_attendance',
          marked_by: teacherProfile.name,
          verified_by: teacherProfile.email,
          was_present_previous_day: Boolean(s.was_present_yesterday),
          metadata: {
            name: s.name,
            roll_number: s.roll_number,
            class: activeClass.class,
            section: activeClass.section,
            department: activeClass.category,
            manual: true,
            marked_at: nowIso,
          },
        },
        metadata: {
          source: 'teacher-portal',
          capture_mode: 'manual',
          mark: 'manual_attendance',
          marked_by: teacherProfile.name,
          verified_by: teacherProfile.email,
          was_present_previous_day: Boolean(s.was_present_yesterday),
          manual: true,
        },
      }));

      const { error } = await supabase.from('attendance_records').insert(rows);
      if (error) throw error;

      // Optimistically update
      setStudents(prev =>
        prev.map(s => {
          const isTarget = unmarked.some(u => u.id === s.id);
          if (isTarget) {
            return {
              ...s,
              today_status: 'present',
              today_time: timeStr,
              is_manual: true,
              capture_mode: 'manual',
              attendance_source: 'teacher-portal',
            };
          }
          return s;
        })
      );

      toast({
        title: '✅ Marked All Present',
        description: `Marked ${unmarked.length} student${unmarked.length > 1 ? 's' : ''} as Present (Manual).`,
      });
    } catch (err: any) {
      console.error('Error marking present:', err);
      toast({ title: 'Marking Failed', description: err.message, variant: 'destructive' });
    } finally {
      setIsMarkingAttendance(false);
    }
  };

  // Filtered student roster
  const filteredStudents = useMemo(() => {
    let list = students;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(s =>
        s.name.toLowerCase().includes(q) ||
        (s.roll_number && s.roll_number.toLowerCase().includes(q)) ||
        (s.admission_number && s.admission_number.toLowerCase().includes(q)) ||
        (s.parent_email && s.parent_email.toLowerCase().includes(q)) ||
        (s.parent_phone && s.parent_phone.includes(q))
      );
    }
    if (activeTab === 'daily') {
      if (dailyFilter === 'unmarked') {
        list = list.filter(s => !s.today_status || s.today_status === 'unmarked');
      } else if (dailyFilter === 'present_yesterday') {
        list = list.filter(s => s.was_present_yesterday);
      } else if (dailyFilter === 'present') {
        list = list.filter(s => s.today_status === 'present');
      } else if (dailyFilter === 'late') {
        list = list.filter(s => s.today_status === 'late');
      } else if (dailyFilter === 'absent') {
        list = list.filter(s => s.today_status === 'absent');
      }
    }
    return list;
  }, [students, searchQuery, activeTab, dailyFilter]);

  // Overall class attendance stats
  const stats = useMemo(() => {
    const total = students.length;
    const present = students.filter(s => s.today_status === 'present').length;
    const late = students.filter(s => s.today_status === 'late').length;
    const absent = students.filter(s => s.today_status === 'absent').length;
    const unmarked = students.filter(s => !s.today_status || s.today_status === 'unmarked').length;
    const presentYesterday = students.filter(s => s.was_present_yesterday).length;
    const unattendedFromYesterday = students.filter(s => s.was_present_yesterday && (!s.today_status || s.today_status === 'unmarked')).length;
    const manualMarksCount = students.filter(s => s.is_manual).length;
    const attendancePct = total > 0 ? Math.round(((present + late) / total) * 100) : 0;

    return {
      total,
      present,
      late,
      absent,
      unmarked,
      presentYesterday,
      unattendedFromYesterday,
      manualMarksCount,
      attendancePct,
    };
  }, [students]);

  // Edit Student Handlers
  const handleOpenEditStudent = (student: ClassStudent) => {
    setEditStudent({ ...student });
    setIsEditDialogOpen(true);
  };

  const handleSaveStudent = async () => {
    if (!editStudent) return;
    setIsSavingStudent(true);
    try {
      if (editStudent.user_id) {
        await supabase
          .from('profiles')
          .update({
            display_name: editStudent.name,
            roll_number: editStudent.roll_number || null,
            admission_number: editStudent.admission_number || null,
            parent_name: editStudent.parent_name || null,
            parent_email: editStudent.parent_email || null,
            parent_phone: editStudent.parent_phone || null,
          })
          .eq('user_id', editStudent.user_id);
      }

      setStudents(prev => prev.map(s => s.id === editStudent.id ? { ...s, ...editStudent } : s));
      toast({ title: 'Student Updated', description: `Saved details for ${editStudent.name}.` });
      setIsEditDialogOpen(false);
    } catch (err: any) {
      toast({ title: 'Update Failed', description: err.message, variant: 'destructive' });
    } finally {
      setIsSavingStudent(false);
    }
  };

  // Add Student Handlers
  const handleAddStudent = async () => {
    if (!activeClass || !newStudent.name.trim()) {
      toast({ title: 'Name Required', description: 'Please provide a student name.', variant: 'destructive' });
      return;
    }

    setIsAddingStudent(true);
    try {
      const parsed = parseClassSection(activeClass.category);
      const studentPayload = {
        name: newStudent.name.trim(),
        employee_id: newStudent.admission_number.trim() || `STU-${Date.now().toString().slice(-4)}`,
        roll_number: newStudent.roll_number.trim() || null,
        parent_name: newStudent.parent_name.trim() || null,
        parent_email: newStudent.parent_email.trim() || null,
        parent_phone: newStudent.parent_phone.trim() || null,
        department: activeClass.category,
        class: parsed?.className || activeClass.class,
        section: parsed?.section || activeClass.section,
      };

      const { error } = await supabase.from('attendance_records').insert({
        category: activeClass.category,
        class: parsed?.className || activeClass.class,
        section: parsed?.section || activeClass.section,
        student_name: newStudent.name.trim(),
        student_id: studentPayload.employee_id,
        status: 'registered',
        device_info: {
          name: newStudent.name.trim(),
          metadata: studentPayload,
        },
      });

      if (error) throw error;

      toast({ title: 'Student Enrolled', description: `${newStudent.name} added to Class ${activeClass.category}.` });
      setIsAddStudentOpen(false);
      setNewStudent({ name: '', roll_number: '', admission_number: '', parent_name: '', parent_email: '', parent_phone: '' });
      loadClassStudents();
    } catch (err: any) {
      toast({ title: 'Failed to Add', description: err.message, variant: 'destructive' });
    } finally {
      setIsAddingStudent(false);
    }
  };

  // WhatsApp Alert to Parent
  const openWhatsAppParent = (student: ClassStudent) => {
    if (!student.parent_phone) {
      toast({ title: 'No Phone Number', description: 'Parent phone number is not listed for this student.', variant: 'destructive' });
      return;
    }
    const cleanPhone = student.parent_phone.replace(/[^0-9]/g, '');
    const phoneWithCode = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
    const msg = encodeURIComponent(
      `Hello ${student.parent_name || 'Parent'}, this is from PM Shri KV NFC Vigyan Vihar regarding ${student.name} (Class ${activeClass?.category}). Today's attendance status is: ${student.today_status ? student.today_status.toUpperCase() : 'ABSENT'}. Please contact school administration if you have any questions.`
    );
    window.open(`https://wa.me/${phoneWithCode}?text=${msg}`, '_blank');
  };

  // Export Roster Excel
  const handleExportRosterExcel = () => {
    if (!activeClass) return;
    const rows = students.map((s, idx) => ({
      'S.No': idx + 1,
      'Roll No': s.roll_number || '—',
      'Student Name': s.name,
      'Class': activeClass.class,
      'Section': activeClass.section,
      'Today Status': s.today_status ? s.today_status.toUpperCase() : 'UNMARKED',
      'Time Marked': s.today_time || '—',
      'Parent Name': s.parent_name || '—',
      'Parent Email': s.parent_email || '—',
      'Parent Phone': s.parent_phone || '—',
      'Face ID Status': s.has_face_descriptor ? 'Enrolled' : 'Pending',
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Class ${activeClass.category}`);
    XLSX.writeFile(wb, `Attendance_Class_${activeClass.category}_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast({ title: 'Report Downloaded', description: `Excel sheet for Class ${activeClass.category} ready.` });
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 space-y-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading your class workspace…</p>
      </div>
    );
  }

  if (assignments.length === 0) {
    return (
      <Card className="max-w-xl mx-auto my-8 border-dashed">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-500 mb-2">
            <GraduationCap className="h-6 w-6" />
          </div>
          <CardTitle>No Class Assigned Yet</CardTitle>
          <CardDescription>
            You have the Teacher role, but no classes have been assigned to your profile yet.
            Please ask your School Administrator to assign your classes in <strong>Admin → Access Management</strong>.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Personalized Hero Deck & Live Schedule */}
      <TeacherHeroDeck
        teacherName={teacherProfile.name}
        teacherEmail={teacherProfile.email}
        avatarUrl={teacherProfile.avatarUrl}
        activeClass={activeClass}
        assignments={assignments}
        onSelectClass={setActiveClass}
        onRefresh={loadClassStudents}
        isRefreshing={isRefreshing}
        totalStudents={students.length}
      />

      {activeClass && (
        <div className="space-y-4">
          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <Card className="bg-card/60 backdrop-blur-xl border">
              <CardContent className="p-3.5 flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Total Students</p>
                  <p className="text-2xl font-bold text-foreground mt-0.5">{stats.total}</p>
                </div>
                <div className="h-9 w-9 rounded-xl bg-muted/60 flex items-center justify-center text-muted-foreground">
                  <Users className="h-4 w-4" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-emerald-500/5 border-emerald-500/20">
              <CardContent className="p-3.5 flex items-center justify-between">
                <div>
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">Present Today</p>
                  <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">{stats.present}</p>
                </div>
                <div className="h-9 w-9 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                  <CheckCircle2 className="h-4 w-4" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-amber-500/5 border-amber-500/20">
              <CardContent className="p-3.5 flex items-center justify-between">
                <div>
                  <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">Late Arrivals</p>
                  <p className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-0.5">{stats.late}</p>
                </div>
                <div className="h-9 w-9 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500">
                  <Clock className="h-4 w-4" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-rose-500/5 border-rose-500/20">
              <CardContent className="p-3.5 flex items-center justify-between">
                <div>
                  <p className="text-xs text-rose-600 dark:text-rose-400 font-medium">Absent Today</p>
                  <p className="text-2xl font-bold text-rose-600 dark:text-rose-400 mt-0.5">{stats.absent}</p>
                </div>
                <div className="h-9 w-9 rounded-xl bg-rose-500/10 flex items-center justify-center text-rose-500">
                  <XCircle className="h-4 w-4" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-blue-500/5 border-blue-500/20 col-span-2 sm:col-span-1">
              <CardContent className="p-3.5 flex items-center justify-between">
                <div>
                  <p className="text-xs text-blue-600 dark:text-blue-400 font-medium">Attendance %</p>
                  <p className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-0.5">{stats.attendancePct}%</p>
                </div>
                <div className="h-9 w-9 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500">
                  <Zap className="h-4 w-4" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Main Navigation Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full space-y-4">
            <div className="overflow-x-auto pb-1">
              <TabsList className="bg-muted/50 p-1 rounded-2xl inline-flex w-full sm:w-auto">
                <TabsTrigger value="daily" className="gap-1.5 rounded-xl text-xs sm:text-sm py-2 px-3.5 font-bold">
                  <CheckSquare className="h-4 w-4 text-primary" /> Daily Attendance
                  {stats.unmarked > 0 && (
                    <span className="ml-1 px-1.5 py-0.5 text-[10px] bg-rose-500 text-white rounded-full font-extrabold leading-none">
                      {stats.unmarked}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="register" className="gap-1.5 rounded-xl text-xs sm:text-sm py-2 px-3.5">
                  <Calendar className="h-4 w-4" /> Monthly Register
                </TabsTrigger>
                <TabsTrigger value="students" className="gap-1.5 rounded-xl text-xs sm:text-sm py-2 px-3.5">
                  <Users className="h-4 w-4" /> Student Management ({students.length})
                </TabsTrigger>
                <TabsTrigger value="notifications" className="gap-1.5 rounded-xl text-xs sm:text-sm py-2 px-3.5">
                  <Send className="h-4 w-4" /> Parent Notices
                </TabsTrigger>
                <TabsTrigger value="reports" className="gap-1.5 rounded-xl text-xs sm:text-sm py-2 px-3.5">
                  <FileDown className="h-4 w-4" /> Class Reports
                </TabsTrigger>
                <TabsTrigger value="timetable" className="gap-1.5 rounded-xl text-xs sm:text-sm py-2 px-3.5">
                  <Calendar className="h-4 w-4" /> Timetable
                </TabsTrigger>
                <TabsTrigger value="gate_passes" className="gap-1.5 rounded-xl text-xs sm:text-sm py-2 px-3.5 font-medium">
                  <QrCode className="h-4 w-4 text-amber-500" /> Gate Passes
                  {pendingGatePassesCount > 0 && (
                    <span className="ml-1 px-1.5 py-0.5 text-[10px] bg-amber-500 text-white rounded-full font-extrabold leading-none animate-pulse">
                      {pendingGatePassesCount}
                    </span>
                  )}
                </TabsTrigger>
              </TabsList>
            </div>

            {/* TAB: DAILY ROLL CALL / ATTENDANCE */}
            <TabsContent value="daily" className="space-y-4 m-0">
              {/* Alert Banner: Students present yesterday without check-in today */}
              {stats.unattendedFromYesterday > 0 && (
                <Card className="border-amber-500/30 bg-amber-500/10 backdrop-blur-md">
                  <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400 mt-0.5">
                        <AlertCircle className="h-5 w-5" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
                          <span>{stats.unattendedFromYesterday} Student{stats.unattendedFromYesterday > 1 ? 's' : ''} Present on {previousDayLabel} Not Checked In Today</span>
                          <Badge variant="outline" className="bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/40 text-[10px]">
                            Auto-Mark Recommended
                          </Badge>
                        </h4>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          These students attended class on {previousDayLabel}, but haven't checked in today. You can auto-mark them absent or roll-call manually below.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
                      <Button
                        size="sm"
                        disabled={isMarkingAttendance}
                        onClick={() => handleAutoMarkAbsent(true)}
                        className="text-xs h-8 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl gap-1.5 shadow-sm"
                      >
                        {isMarkingAttendance ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserX className="h-3.5 w-3.5" />}
                        Auto-Mark These Absent ({stats.unattendedFromYesterday})
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Main Roll Call Panel */}
              <Card className="border shadow-md">
                <CardHeader className="pb-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <CardTitle className="text-base flex items-center gap-2 font-extrabold">
                          <CheckSquare className="h-4 w-4 text-primary" />
                          Daily Attendance • Class {activeClass.category}
                        </CardTitle>
                        <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 text-xs font-bold">
                          {new Date().toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' })}
                        </Badge>
                        {stats.manualMarksCount > 0 && (
                          <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/30 text-[10px]">
                            {stats.manualMarksCount} Manual Mark{stats.manualMarksCount > 1 ? 's' : ''}
                          </Badge>
                        )}
                      </div>
                      <CardDescription className="text-xs mt-0.5">
                        Live real-time sync with database. Changes are logged as official attendance with manual audit trail.
                      </CardDescription>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      {stats.unmarked > 0 && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isMarkingAttendance}
                            onClick={handleMarkAllUnmarkedPresent}
                            className="text-xs h-8 rounded-xl gap-1.5 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-500/10 border-emerald-500/30 font-semibold"
                            title="Mark all currently unmarked students as Present (Manual)"
                          >
                            <UserCheck className="h-3.5 w-3.5" /> Mark All Present
                          </Button>
                          <Button
                            size="sm"
                            disabled={isMarkingAttendance}
                            onClick={() => handleAutoMarkAbsent(false)}
                            className="text-xs h-8 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl gap-1.5 shadow-md shadow-rose-600/20"
                            title="Auto-mark remaining unmarked students as Absent (Manual)"
                          >
                            {isMarkingAttendance ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserX className="h-3.5 w-3.5" />}
                            Auto-Mark Remaining Absent ({stats.unmarked})
                          </Button>
                        </>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleExportRosterExcel}
                        className="text-xs h-8 rounded-xl gap-1.5"
                        title="Download Excel sheet of today's attendance"
                      >
                        <Download className="h-3.5 w-3.5" /> Export Excel
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-3">
                  {/* Filter and Search Bar */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-1">
                    <div className="relative w-full sm:w-64">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        placeholder="Search student or roll no..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="h-8 pl-8 text-xs rounded-xl"
                      />
                    </div>

                    {/* Filter Buttons */}
                    <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
                      <Button
                        variant={dailyFilter === 'all' ? 'default' : 'ghost'}
                        size="sm"
                        onClick={() => setDailyFilter('all')}
                        className="h-7 text-xs rounded-lg px-2.5"
                      >
                        All ({stats.total})
                      </Button>
                      <Button
                        variant={dailyFilter === 'unmarked' ? 'default' : 'ghost'}
                        size="sm"
                        onClick={() => setDailyFilter('unmarked')}
                        className="h-7 text-xs rounded-lg px-2.5 text-slate-600 dark:text-slate-300 font-semibold"
                      >
                        Unmarked ({stats.unmarked})
                      </Button>
                      <Button
                        variant={dailyFilter === 'present_yesterday' ? 'default' : 'ghost'}
                        size="sm"
                        onClick={() => setDailyFilter('present_yesterday')}
                        className="h-7 text-xs rounded-lg px-2.5 text-emerald-600 font-semibold"
                      >
                        Present Yesterday ({stats.presentYesterday})
                      </Button>
                      <Button
                        variant={dailyFilter === 'present' ? 'default' : 'ghost'}
                        size="sm"
                        onClick={() => setDailyFilter('present')}
                        className="h-7 text-xs rounded-lg px-2.5 text-emerald-600"
                      >
                        Present ({stats.present})
                      </Button>
                      <Button
                        variant={dailyFilter === 'late' ? 'default' : 'ghost'}
                        size="sm"
                        onClick={() => setDailyFilter('late')}
                        className="h-7 text-xs rounded-lg px-2.5 text-amber-600"
                      >
                        Late ({stats.late})
                      </Button>
                      <Button
                        variant={dailyFilter === 'absent' ? 'default' : 'ghost'}
                        size="sm"
                        onClick={() => setDailyFilter('absent')}
                        className="h-7 text-xs rounded-lg px-2.5 text-rose-600 font-semibold"
                      >
                        Absent ({stats.absent})
                      </Button>
                    </div>
                  </div>

                  {/* Roll Call Table */}
                  <div className="overflow-x-auto rounded-2xl border">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-muted/50 border-b">
                          <th className="p-2.5 text-left font-bold w-12">Roll</th>
                          <th className="p-2.5 text-left font-bold">Student Name</th>
                          <th className="p-2.5 text-left font-bold">Previous Day ({previousDayLabel})</th>
                          <th className="p-2.5 text-left font-bold">Today's Status</th>
                          <th className="p-2.5 text-center font-bold">Quick Mark</th>
                          <th className="p-2.5 text-center font-bold w-16">Contact</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {filteredStudents.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="p-8 text-center text-muted-foreground">
                              No students found matching this filter.
                            </td>
                          </tr>
                        ) : (
                          filteredStudents.map(student => (
                            <tr
                              key={student.id}
                              className={`hover:bg-muted/30 transition-colors ${
                                student.today_status === 'absent'
                                  ? 'bg-rose-500/5'
                                  : student.today_status === 'present'
                                  ? 'bg-emerald-500/5'
                                  : student.today_status === 'late'
                                  ? 'bg-amber-500/5'
                                  : student.was_present_yesterday
                                  ? 'bg-amber-500/5 border-l-2 border-l-amber-500'
                                  : ''
                              }`}
                            >
                              <td className="p-2.5 font-bold font-mono text-muted-foreground">
                                {student.roll_number || '—'}
                              </td>
                              <td className="p-2.5">
                                <div className="flex items-center gap-2.5">
                                  <Avatar className="h-8 w-8 rounded-xl border">
                                    {student.photo_url && <AvatarImage src={student.photo_url} alt={student.name} />}
                                    <AvatarFallback className="text-[10px] font-bold bg-primary/10 text-primary">
                                      {student.name.slice(0, 2).toUpperCase()}
                                    </AvatarFallback>
                                  </Avatar>
                                  <div>
                                    <span className="font-extrabold text-foreground block">{student.name}</span>
                                    <span className="text-[10px] font-mono text-muted-foreground">
                                      {student.admission_number || 'STU'}
                                    </span>
                                  </div>
                                </div>
                              </td>
                              <td className="p-2.5">
                                {student.was_present_yesterday ? (
                                  <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 text-[10px] gap-1 font-semibold">
                                    <CheckCircle2 className="h-3 w-3" /> Present Yesterday
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-muted-foreground text-[10px]">
                                    No Entry
                                  </Badge>
                                )}
                              </td>
                              <td className="p-2.5">
                                {student.today_status === 'present' ? (
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 text-[11px] font-bold gap-1">
                                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                                      Present {student.is_manual ? '(Manual)' : '(Biometric)'}
                                    </Badge>
                                    {student.today_time && (
                                      <span className="text-[10px] text-muted-foreground font-mono">
                                        {student.today_time}
                                      </span>
                                    )}
                                  </div>
                                ) : student.today_status === 'late' ? (
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30 text-[11px] font-bold gap-1">
                                      <Clock className="h-3.5 w-3.5 text-amber-500" />
                                      Late {student.is_manual ? '(Manual)' : ''}
                                    </Badge>
                                    {student.today_time && (
                                      <span className="text-[10px] text-muted-foreground font-mono">
                                        {student.today_time}
                                      </span>
                                    )}
                                  </div>
                                ) : student.today_status === 'absent' ? (
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <Badge className="bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30 text-[11px] font-bold gap-1">
                                      <XCircle className="h-3.5 w-3.5 text-rose-500" />
                                      Absent (Manual)
                                    </Badge>
                                    {student.today_time && (
                                      <span className="text-[10px] text-muted-foreground font-mono">
                                        {student.today_time}
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <Badge variant="outline" className="bg-muted text-muted-foreground text-[11px] gap-1 font-medium">
                                    <AlertCircle className="h-3 w-3 text-amber-500" />
                                    Unmarked / Pending
                                  </Badge>
                                )}
                              </td>
                              <td className="p-2.5 text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <Button
                                    size="sm"
                                    variant={student.today_status === 'present' ? 'default' : 'outline'}
                                    onClick={() => handleQuickMarkAttendance(student, 'present')}
                                    className={`h-7 px-2.5 text-xs font-bold rounded-lg transition-all ${
                                      student.today_status === 'present'
                                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm'
                                        : 'text-emerald-600 hover:bg-emerald-500/10 border-emerald-500/30'
                                    }`}
                                    title="Mark Present (Manual Attendance)"
                                  >
                                    <Check className="h-3 w-3 mr-1" /> P
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant={student.today_status === 'late' ? 'default' : 'outline'}
                                    onClick={() => handleQuickMarkAttendance(student, 'late')}
                                    className={`h-7 px-2.5 text-xs font-bold rounded-lg transition-all ${
                                      student.today_status === 'late'
                                        ? 'bg-amber-600 hover:bg-amber-700 text-white shadow-sm'
                                        : 'text-amber-600 hover:bg-amber-500/10 border-amber-500/30'
                                    }`}
                                    title="Mark Late (Manual Attendance)"
                                  >
                                    <Clock className="h-3 w-3 mr-1" /> L
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant={student.today_status === 'absent' ? 'default' : 'outline'}
                                    onClick={() => handleQuickMarkAttendance(student, 'absent')}
                                    className={`h-7 px-2.5 text-xs font-bold rounded-lg transition-all ${
                                      student.today_status === 'absent'
                                        ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-sm'
                                        : 'text-rose-600 hover:bg-rose-500/10 border-rose-500/30'
                                    }`}
                                    title="Mark Absent (Manual Attendance)"
                                  >
                                    <XCircle className="h-3 w-3 mr-1" /> A
                                  </Button>
                                </div>
                              </td>
                              <td className="p-2.5 text-center">
                                {student.parent_phone ? (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => openWhatsAppParent(student)}
                                    className="h-7 w-7 p-0 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-500/10 rounded-lg"
                                    title="WhatsApp Parent"
                                  >
                                    <MessageSquare className="h-3.5 w-3.5" />
                                  </Button>
                                ) : (
                                  <span className="text-muted-foreground text-[10px]">—</span>
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* TAB: MONTHLY ATTENDANCE REGISTER */}
            <TabsContent value="register" className="space-y-4 m-0">
              <TeacherMonthlyRegister
                classNameNumber={activeClass.class}
                section={activeClass.section}
                category={activeClass.category}
                students={students}
              />
            </TabsContent>

            {/* TAB: STUDENT MANAGEMENT (Their Class Only) */}
            <TabsContent value="students" className="space-y-4 m-0">
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Users className="h-4 w-4 text-primary" />
                        Class {activeClass.category} Student Directory ({students.length})
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Official student roster, roll numbers, biometric face status, and parent emergency contacts
                      </CardDescription>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleExportRosterExcel}
                        className="text-xs h-8 rounded-xl gap-1.5"
                      >
                        <Download className="h-3.5 w-3.5" /> Export Roster
                      </Button>
                      {permissions.can_manage_students && (
                        <Button
                          size="sm"
                          onClick={() => setIsAddStudentOpen(true)}
                          className="text-xs h-8 bg-primary hover:bg-primary/90 text-white font-bold rounded-xl gap-1.5 shadow-md shadow-primary/20"
                        >
                          <Plus className="h-3.5 w-3.5" /> Add Student
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-3">
                  <div className="relative max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Search student by name, roll no, phone..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      className="h-8 pl-8 text-xs rounded-xl"
                    />
                  </div>

                  <div className="overflow-x-auto rounded-2xl border">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-muted/50 border-b">
                          <th className="p-2.5 text-left font-bold">Roll</th>
                          <th className="p-2.5 text-left font-bold">Student Name</th>
                          <th className="p-2.5 text-left font-bold">Admission No</th>
                          <th className="p-2.5 text-left font-bold">Face Model</th>
                          <th className="p-2.5 text-left font-bold">Parent Contact</th>
                          <th className="p-2.5 text-center font-bold">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {filteredStudents.map(student => (
                          <tr key={student.id} className="hover:bg-muted/30 transition-colors">
                            <td className="p-2.5 font-bold font-mono text-muted-foreground">
                              {student.roll_number || '—'}
                            </td>
                            <td className="p-2.5">
                              <div className="flex items-center gap-2.5">
                                <Avatar className="h-7 w-7 rounded-xl border">
                                  {student.photo_url && <AvatarImage src={student.photo_url} alt={student.name} />}
                                  <AvatarFallback className="text-[10px] font-bold bg-primary/10 text-primary">
                                    {student.name.slice(0, 2).toUpperCase()}
                                  </AvatarFallback>
                                </Avatar>
                                <span className="font-extrabold text-foreground">{student.name}</span>
                              </div>
                            </td>
                            <td className="p-2.5 font-mono text-muted-foreground">
                              {student.admission_number || '—'}
                            </td>
                            <td className="p-2.5">
                              {student.has_face_descriptor ? (
                                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 text-[10px]">
                                  ✓ Enrolled
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30 text-[10px]">
                                  Pending
                                </Badge>
                              )}
                            </td>
                            <td className="p-2.5 text-muted-foreground">
                              <div>{student.parent_name || '—'}</div>
                              {student.parent_phone && (
                                <div className="text-[11px] font-mono text-primary flex items-center gap-1 mt-0.5">
                                  <Phone className="h-3 w-3" /> {student.parent_phone}
                                </div>
                              )}
                            </td>
                            <td className="p-2.5 text-center">
                              <div className="flex items-center justify-center gap-1">
                                {student.parent_phone && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => openWhatsAppParent(student)}
                                    className="h-7 w-7 p-0 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-500/10 rounded-lg"
                                    title="WhatsApp Parent"
                                  >
                                    <MessageSquare className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleOpenEditStudent(student)}
                                  className="h-7 w-7 p-0 rounded-lg"
                                  title="Edit Student Info"
                                >
                                  <Edit2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* TAB: PARENT NOTIFICATIONS & CLASS NOTICES */}
            <TabsContent value="notifications" className="space-y-4 m-0">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Send className="h-4 w-4 text-primary" />
                    Compose & Dispatch Class Notices
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Send targeted SMS, WhatsApp alerts, and app notifications directly to parents of Class {activeClass.category}
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Recipient Target Group:</Label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant={notifTarget === 'all' ? 'default' : 'outline'}
                        onClick={() => setNotifTarget('all')}
                        className={`text-xs h-8 rounded-xl ${notifTarget === 'all' ? 'bg-primary text-white' : ''}`}
                      >
                        All Students ({students.length})
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={notifTarget === 'absent' ? 'default' : 'outline'}
                        onClick={() => setNotifTarget('absent')}
                        className={`text-xs h-8 rounded-xl ${notifTarget === 'absent' ? 'bg-rose-600 text-white' : ''}`}
                      >
                        Absent Today ({stats.absent})
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={notifTarget === 'late' ? 'default' : 'outline'}
                        onClick={() => setNotifTarget('late')}
                        className={`text-xs h-8 rounded-xl ${notifTarget === 'late' ? 'bg-amber-600 text-white' : ''}`}
                      >
                        Late Arrivals ({stats.late})
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={notifTarget === 'selected' ? 'default' : 'outline'}
                        onClick={() => setNotifTarget('selected')}
                        className={`text-xs h-8 rounded-xl ${notifTarget === 'selected' ? 'bg-blue-600 text-white' : ''}`}
                      >
                        Custom Selected ({selectedStudentIds.length})
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div>
                      <Label className="text-xs font-semibold">Notice Title / Subject:</Label>
                      <Input
                        placeholder="e.g. Unit Test Schedule / Homework Update"
                        value={notifSubject}
                        onChange={e => setNotifSubject(e.target.value)}
                        className="h-9 text-xs rounded-xl mt-1"
                      />
                    </div>

                    <div>
                      <Label className="text-xs font-semibold">Notice Message:</Label>
                      <Textarea
                        placeholder="Write your official class notice for parents here..."
                        value={notifMessage}
                        onChange={e => setNotifMessage(e.target.value)}
                        rows={4}
                        className="text-xs rounded-xl mt-1"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <Button
                      size="sm"
                      onClick={async () => {
                        if (!notifSubject.trim() || !notifMessage.trim()) {
                          toast({ title: 'Missing Content', description: 'Please enter title and message.', variant: 'destructive' });
                          return;
                        }
                        setIsSendingNotif(true);
                        try {
                          await supabase.from('notifications').insert({
                            title: `[Class ${activeClass.category}] ${notifSubject.trim()}`,
                            message: notifMessage.trim(),
                            type: 'class_notice',
                            target_role: 'parent',
                            category: activeClass.category,
                          });
                          toast({ title: 'Notice Dispatched', description: `Broadcasted to parents of Class ${activeClass.category}.` });
                          setNotifSubject('');
                          setNotifMessage('');
                        } catch (err: any) {
                          toast({ title: 'Dispatch Failed', description: err.message, variant: 'destructive' });
                        } finally {
                          setIsSendingNotif(false);
                        }
                      }}
                      disabled={isSendingNotif}
                      className="h-8 text-xs bg-primary hover:bg-primary/90 text-white font-bold rounded-xl gap-1.5 shadow-md shadow-primary/20"
                    >
                      {isSendingNotif ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                      Broadcast Notice to Parents
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* TAB: CLASS REPORTS & ANALYTICS */}
            <TabsContent value="reports" className="space-y-4 m-0">
              <Suspense fallback={<div className="h-[360px] rounded-2xl bg-muted/40 animate-pulse" />}>
                <ClassSectionReport allowedCategories={[activeClass.category]} />
              </Suspense>
            </TabsContent>

            {/* TAB: CLASS TIMETABLE & PLAN */}
            <TabsContent value="timetable" className="space-y-4 m-0">
              <Suspense fallback={<div className="h-[360px] rounded-2xl bg-muted/40 animate-pulse" />}>
                <TimetableManager allowedCategories={[activeClass.category]} />
              </Suspense>
            </TabsContent>

            {/* TAB: GATE PASSES & LEAVE VERIFICATION */}
            <TabsContent value="gate_passes" className="space-y-4 m-0">
              <TeacherGatePassReview
                activeClass={activeClass}
                teacherName={teacherProfile.name}
              />
            </TabsContent>
          </Tabs>
        </div>
      )}

      {/* Edit Student Modal */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-base">Edit Student Profile</DialogTitle>
            <DialogDescription className="text-xs">
              Update details for {editStudent?.name}
            </DialogDescription>
          </DialogHeader>

          {editStudent && (
            <div className="space-y-3 py-2">
              <div>
                <Label className="text-xs">Student Full Name:</Label>
                <Input
                  value={editStudent.name}
                  onChange={e => setEditStudent(prev => prev ? { ...prev, name: e.target.value } : null)}
                  className="h-8 text-xs mt-1"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Roll Number:</Label>
                  <Input
                    value={editStudent.roll_number || ''}
                    onChange={e => setEditStudent(prev => prev ? { ...prev, roll_number: e.target.value } : null)}
                    className="h-8 text-xs mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">Admission No / ID:</Label>
                  <Input
                    value={editStudent.admission_number || ''}
                    onChange={e => setEditStudent(prev => prev ? { ...prev, admission_number: e.target.value } : null)}
                    className="h-8 text-xs mt-1"
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs">Parent / Guardian Name:</Label>
                <Input
                  value={editStudent.parent_name || ''}
                  onChange={e => setEditStudent(prev => prev ? { ...prev, parent_name: e.target.value } : null)}
                  className="h-8 text-xs mt-1"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Parent Phone:</Label>
                  <Input
                    value={editStudent.parent_phone || ''}
                    onChange={e => setEditStudent(prev => prev ? { ...prev, parent_phone: e.target.value } : null)}
                    className="h-8 text-xs mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">Parent Email:</Label>
                  <Input
                    value={editStudent.parent_email || ''}
                    onChange={e => setEditStudent(prev => prev ? { ...prev, parent_email: e.target.value } : null)}
                    className="h-8 text-xs mt-1"
                  />
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setIsEditDialogOpen(false)} className="text-xs">
              Cancel
            </Button>
            <Button size="sm" onClick={handleSaveStudent} disabled={isSavingStudent} className="text-xs font-bold">
              {isSavingStudent ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Student Modal */}
      <Dialog open={isAddStudentOpen} onOpenChange={setIsAddStudentOpen}>
        <DialogContent className="sm:max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-base">Enroll Student to Class {activeClass?.category}</DialogTitle>
            <DialogDescription className="text-xs">
              Add a new student to the official class attendance roster
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs">Student Full Name *:</Label>
              <Input
                placeholder="e.g. Aarav Sharma"
                value={newStudent.name}
                onChange={e => setNewStudent(prev => ({ ...prev, name: e.target.value }))}
                className="h-8 text-xs mt-1"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Roll Number:</Label>
                <Input
                  placeholder="e.g. 1"
                  value={newStudent.roll_number}
                  onChange={e => setNewStudent(prev => ({ ...prev, roll_number: e.target.value }))}
                  className="h-8 text-xs mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Admission No / ID:</Label>
                <Input
                  placeholder="e.g. KV-2026-001"
                  value={newStudent.admission_number}
                  onChange={e => setNewStudent(prev => ({ ...prev, admission_number: e.target.value }))}
                  className="h-8 text-xs mt-1"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs">Parent / Guardian Name:</Label>
              <Input
                placeholder="e.g. Rajesh Sharma"
                value={newStudent.parent_name}
                onChange={e => setNewStudent(prev => ({ ...prev, parent_name: e.target.value }))}
                className="h-8 text-xs mt-1"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Parent WhatsApp Phone:</Label>
                <Input
                  placeholder="e.g. 9876543210"
                  value={newStudent.parent_phone}
                  onChange={e => setNewStudent(prev => ({ ...prev, parent_phone: e.target.value }))}
                  className="h-8 text-xs mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Parent Email:</Label>
                <Input
                  placeholder="parent@gmail.com"
                  value={newStudent.parent_email}
                  onChange={e => setNewStudent(prev => ({ ...prev, parent_email: e.target.value }))}
                  className="h-8 text-xs mt-1"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setIsAddStudentOpen(false)} className="text-xs">
              Cancel
            </Button>
            <Button size="sm" onClick={handleAddStudent} disabled={isAddingStudent || !newStudent.name.trim()} className="text-xs font-bold">
              {isAddingStudent ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
              Enroll Student
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TeacherAdminWorkspace;
