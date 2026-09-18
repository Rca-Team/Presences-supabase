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
  ScanFace,
  BookOpen,
  Grid,
  List,
  Eye,
  Camera,
  ExternalLink,
  ShieldCheck,
  LayoutDashboard,
  Smartphone,
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
  assignClassTeacher,
  DEFAULT_TEACHER_PERMISSIONS,
  type TeacherPermissions,
} from '@/utils/teacherAccess';
import { TeacherHeroDeck } from './TeacherHeroDeck';
import { TeacherDashboardOverview } from './TeacherDashboardOverview';
import { TeacherMonthlyRegister } from './TeacherMonthlyRegister';
import { TeacherGatePassReview } from './TeacherGatePassReview';
import { TeacherAttendanceExporter } from './TeacherAttendanceExporter';
import { TeacherAbsenteeManager } from './TeacherAbsenteeManager';
import TeacherAssignmentManager from './TeacherAssignmentManager';
import TeacherTimetableEditor from './TeacherTimetableEditor';
import TeacherNotificationHub from './TeacherNotificationHub';
import CaptureFaceDialog from '@/components/admin/CaptureFaceDialog';
import { fetchClassGatePasses, subscribeToGatePasses } from '@/services/gatePassService';
import { sanitizeStudentPhotoUrl } from '@/utils/studentPhotoResolver';
import { AndroidWidgetBoard } from '@/components/widgets/android/AndroidWidgetBoard';
import { useIsMobile } from '@/hooks/use-mobile';
import { TeacherMobileAppView } from './TeacherMobileAppView';
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
  const isMobile = useIsMobile();

  const [loading, setLoading] = useState(true);
  const [assignments, setAssignments] = useState<ClassAssignment[]>([]);
  const [activeClass, setActiveClass] = useState<ClassAssignment | null>(initialClass || null);
  const [students, setStudents] = useState<ClassStudent[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('overview');
  const [dailyFilter, setDailyFilter] = useState<'all' | 'unmarked' | 'present_yesterday' | 'absent' | 'present' | 'late'>('all');
  const [rollCallViewMode, setRollCallViewMode] = useState<'cards' | 'table'>('cards');
  const [previousDayLabel, setPreviousDayLabel] = useState<string>('Previous Working Day');
  const [isMarkingAttendance, setIsMarkingAttendance] = useState(false);
  const [pendingGatePassesCount, setPendingGatePassesCount] = useState(0);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

  // Student Edit Dialog
  const [editStudent, setEditStudent] = useState<ClassStudent | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isSavingStudent, setIsSavingStudent] = useState(false);

  // Biometric Face Capture Dialog
  const [selectedFaceStudent, setSelectedFaceStudent] = useState<ClassStudent | null>(null);

  // Interactive Student Profile & Image Inspector Modal
  const [inspectStudent, setInspectStudent] = useState<ClassStudent | null>(null);
  const [directoryViewMode, setDirectoryViewMode] = useState<'table' | 'grid'>('table');

  const getStudentPhotoUrl = useCallback((student: ClassStudent) => {
    if (student.photo_url) {
      const sanitized = sanitizeStudentPhotoUrl(student.photo_url);
      if (sanitized) return sanitized;
    }
    return `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(student.name || 'Student')}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`;
  }, []);

  // Quick Class Claiming State for newly registered teachers
  const [isClaimingClass, setIsClaimingClass] = useState(false);
  const [claimGrade, setClaimGrade] = useState('10');
  const [claimSection, setClaimSection] = useState('A');
  const [claimRole, setClaimRole] = useState<'class_teacher' | 'co_teacher'>('class_teacher');

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
        supabase.from('profiles').select('display_name, username, avatar_url, parent_email, department').eq('user_id', userId).maybeSingle(),
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

      let list: ClassAssignment[] = (categories || [])
        .map(c => {
          const parsed = parseClassSection(c);
          return parsed ? { class: parsed.className, section: parsed.section, category: c } : null;
        })
        .filter((c): c is ClassAssignment => Boolean(c));

      // If user registered with assigned_class in metadata or profile department
      const metaClass = authUser?.user_metadata?.assigned_class || (userProfile as any)?.department;
      if (metaClass) {
        const parsedMeta = parseClassSection(metaClass);
        if (parsedMeta && !list.some(a => a.category === metaClass)) {
          list.unshift({ class: parsedMeta.className, section: parsedMeta.section, category: metaClass });
        }
      }

      // Default fallback roster classes so the portal always opens directly to the class page
      if (list.length === 0) {
        list = [
          { class: '10', section: 'A', category: '10-A' },
          { class: '10', section: 'B', category: '10-B' },
          { class: '9', section: 'A', category: '9-A' },
          { class: '8', section: 'A', category: '8-A' },
          { class: '6', section: 'A', category: '6-A' },
          { class: '11', section: 'A', category: '11-A' },
          { class: '12', section: 'A', category: '12-A' },
        ];
      }

      setAssignments(list);

      // Check URL query param e.g. /teacher?class=10-A
      const urlParams = new URLSearchParams(window.location.search);
      const urlClass = urlParams.get('class');

      if (urlClass) {
        const found = list.find(a => a.category.toLowerCase() === urlClass.toLowerCase());
        if (found) {
          setActiveClass(found);
        } else {
          const parsed = parseClassSection(urlClass);
          if (parsed) {
            const customAssignment = { class: parsed.className, section: parsed.section, category: urlClass.toUpperCase() };
            list.unshift(customAssignment);
            setAssignments([...list]);
            setActiveClass(customAssignment);
          } else {
            setActiveClass(list[0]);
          }
        }
      } else {
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
        const classTarget = activeClass.category || `${activeClass.class}-${activeClass.section}`;
        const passes = await fetchClassGatePasses(classTarget);
        if (isMounted) {
          const pending = passes.filter(
            (p) => p.status === 'pending' || p.status === 'pending_teacher'
          ).length;
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
      const endOfToday = new Date();
      endOfToday.setHours(23, 59, 59, 999);

      const prevWorkingDay = getPreviousWorkingDay();
      setPreviousDayLabel(prevWorkingDay.label);

      // Fetch from profiles, registered attendance records, face descriptors, today's attendance logs, gate entries, vision events, and previous day logs
      const [
        profilesRes,
        registeredAttRes,
        descriptorsRes,
        todayAttRes,
        prevDayAttRes,
        todayGateRes,
        prevDayGateRes,
        todayGvEventsRes,
      ] = await Promise.all([
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
          .lte('timestamp', endOfToday.toISOString())
          .order('timestamp', { ascending: false }),
        supabase
          .from('attendance_records')
          .select('id, user_id, student_id, student_name, class, section, category, status, timestamp, device_info')
          .gte('timestamp', prevWorkingDay.start.toISOString())
          .lte('timestamp', prevWorkingDay.end.toISOString())
          .order('timestamp', { ascending: false }),
        (supabase as any)
          .from('gate_entries')
          .select('id, student_id, student_name, entry_time, is_recognized, class, section, metadata')
          .gte('entry_time', startOfToday.toISOString())
          .lte('entry_time', endOfToday.toISOString())
          .order('entry_time', { ascending: false }),
        (supabase as any)
          .from('gate_entries')
          .select('id, student_id, student_name, entry_time, is_recognized, class, section, metadata')
          .gte('entry_time', prevWorkingDay.start.toISOString())
          .lte('entry_time', prevWorkingDay.end.toISOString())
          .order('entry_time', { ascending: false }),
        (supabase as any)
          .from('gv_events')
          .select('id, event_type, student_id, timestamp, metadata')
          .gte('timestamp', startOfToday.toISOString())
          .lte('timestamp', endOfToday.toISOString())
          .order('timestamp', { ascending: false })
          .then((res: any) => res)
          .catch(() => ({ data: [] })),
      ]);

      const norm = (v: any) => (v == null ? '' : String(v).trim().toLowerCase());

      // Enrolled face descriptor IDs and Photos Map
      const enrolledFaceIds = new Set<string>();
      const facePhotoMap = new Map<string, string>();
      (descriptorsRes.data || []).forEach((f: any) => {
        const uId = norm(f.user_id);
        const sId = norm(f.student_id);
        if (uId) enrolledFaceIds.add(uId);
        if (sId) enrolledFaceIds.add(sId);
        if (f.image_url) {
          if (uId) facePhotoMap.set(uId, f.image_url);
          if (sId) facePhotoMap.set(sId, f.image_url);
        }
      });

      // Previous working day present IDs set across attendance_records and gate_entries
      const prevDayPresentSet = new Set<string>();
      (prevDayAttRes.data || []).forEach((att: any) => {
        if (att.status === 'registered') return;
        const rawStatus = (att.status || '').toLowerCase();
        if (rawStatus.includes('present') || rawStatus.includes('late') || rawStatus.includes('verified') || rawStatus.includes('unauthorized')) {
          if (att.user_id) prevDayPresentSet.add(norm(att.user_id));
          if (att.student_id) prevDayPresentSet.add(norm(att.student_id));
          if (att.student_name) prevDayPresentSet.add(norm(att.student_name));
          const dInfo = (att.device_info as any) || {};
          const meta = dInfo.metadata || {};
          if (meta.employee_id) prevDayPresentSet.add(norm(meta.employee_id));
          if (dInfo.employee_id) prevDayPresentSet.add(norm(dInfo.employee_id));
          if (meta.roll_number) prevDayPresentSet.add(norm(meta.roll_number));
          if (dInfo.roll_number) prevDayPresentSet.add(norm(dInfo.roll_number));
          if (meta.name) prevDayPresentSet.add(norm(meta.name));
        }
      });

      (prevDayGateRes.data || []).forEach((gate: any) => {
        if (gate.student_id) prevDayPresentSet.add(norm(gate.student_id));
        if (gate.student_name) prevDayPresentSet.add(norm(gate.student_name));
        const meta = gate.metadata || {};
        if (meta.employee_id) prevDayPresentSet.add(norm(meta.employee_id));
        if (meta.roll_number) prevDayPresentSet.add(norm(meta.roll_number));
      });

      // Today's attendance status map (Unifying Spotlight Engine, Gate Entries, Kiosks, Overrides, Smartboard)
      const todayAttMap = new Map<string, {
        status: 'present' | 'late' | 'absent';
        time: string;
        source?: string;
        captureMode?: string;
        isManual?: boolean;
      }>();

      // Helper to register attendance record into todayAttMap across all its identifiers
      const registerTodayRecord = (key: string, info: { status: 'present' | 'late' | 'absent'; time: string; source?: string; captureMode?: string; isManual?: boolean }) => {
        if (!key) return;
        const cleanKey = norm(key);
        if (!cleanKey) return;
        const existing = todayAttMap.get(cleanKey);
        // Prioritize present/late over absent or manual override over passive
        if (!existing || (existing.status === 'absent' && info.status !== 'absent') || info.isManual) {
          todayAttMap.set(cleanKey, info);
        }
      };

      // 1. Process attendance_records for today
      (todayAttRes.data || []).forEach((att: any) => {
        if (att.status === 'registered') return;
        const sName = att.student_name || '';
        const uId = att.user_id ? String(att.user_id) : '';
        const sId = att.student_id ? String(att.student_id) : '';
        const dInfo = (att.device_info as any) || {};
        const meta = dInfo.metadata || {};
        const empId = meta.employee_id || dInfo.employee_id || '';
        const rollNum = meta.roll_number || dInfo.roll_number || '';
        const metaName = meta.name || dInfo.name || '';

        const rawStatus = (att.status || '').toLowerCase().trim();
        let normalizedStatus: 'present' | 'late' | 'absent' = 'present';
        if (rawStatus.includes('late')) {
          normalizedStatus = 'late';
        } else if (rawStatus.includes('absent')) {
          normalizedStatus = 'absent';
        } else {
          // 'present', 'marked', 'verified', 'unauthorized', 'on-time', 'ontime', etc.
          normalizedStatus = 'present';
        }

        const timeFormatted = att.timestamp ? new Date(att.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '';
        const isManual = Boolean(
          att.capture_mode === 'manual' ||
          att.source === 'teacher-portal' ||
          dInfo.mark === 'manual_attendance' ||
          dInfo.manual ||
          att.source === 'manual'
        );

        const info = {
          status: normalizedStatus,
          time: timeFormatted,
          source: att.source || dInfo.source || (isManual ? 'teacher-portal' : 'biometric-kiosk'),
          captureMode: att.capture_mode || dInfo.capture_mode || (isManual ? 'manual' : 'spotlight-engine'),
          isManual,
        };

        if (uId) registerTodayRecord(uId, info);
        if (sId) registerTodayRecord(sId, info);
        if (empId) registerTodayRecord(empId, info);
        if (rollNum) registerTodayRecord(rollNum, info);
        if (sName) registerTodayRecord(sName, info);
        if (metaName) registerTodayRecord(metaName, info);
        if (att.id) registerTodayRecord(att.id, info);
      });

      // 2. Process gate_entries for today (Security Gate, Turnstiles, RFID)
      (todayGateRes.data || []).forEach((g: any) => {
        const sId = g.student_id ? String(g.student_id) : '';
        const sName = g.student_name || '';
        const meta = g.metadata || {};
        const empId = meta.employee_id || meta.admission_number || '';
        const rollNum = meta.roll_number || '';
        const timeFormatted = g.entry_time ? new Date(g.entry_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '';
        const gateInfo = {
          status: 'present' as const,
          time: timeFormatted,
          source: 'gate-security',
          captureMode: 'rfid-gate',
          isManual: false,
        };

        if (sId) registerTodayRecord(sId, gateInfo);
        if (empId) registerTodayRecord(empId, gateInfo);
        if (rollNum) registerTodayRecord(rollNum, gateInfo);
        if (sName) registerTodayRecord(sName, gateInfo);
        if (g.id) registerTodayRecord(g.id, gateInfo);
      });

      // 3. Process gv_events for today (Spotlight Engine & Gate Vision live streams)
      (todayGvEventsRes.data || []).forEach((ev: any) => {
        const sId = ev.student_id ? String(ev.student_id) : '';
        const meta = ev.metadata || {};
        const sName = meta.student_name || meta.name || '';
        const empId = meta.employee_id || meta.admission_number || '';
        const rollNum = meta.roll_number || '';
        const timeFormatted = ev.timestamp ? new Date(ev.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '';
        const gvInfo = {
          status: 'present' as const,
          time: timeFormatted,
          source: 'spotlight-engine',
          captureMode: 'ai-vision',
          isManual: false,
        };

        if (sId) registerTodayRecord(sId, gvInfo);
        if (empId) registerTodayRecord(empId, gvInfo);
        if (rollNum) registerTodayRecord(rollNum, gvInfo);
        if (sName) registerTodayRecord(sName, gvInfo);
        if (ev.id) registerTodayRecord(ev.id, gvInfo);
      });

      // Master student unification map
      const studentMap = new Map<string, ClassStudent>();
      const byUserId = new Map<string, string>();
      const byName = new Map<string, string>();
      const byEmployeeId = new Map<string, string>();

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

        const uidKey = norm(r.user_id);
        const nameK = norm(name);
        const empK = norm(empId);
        const rollK = norm(roll);

        const rawPhoto = r.image_url || meta.firebase_image_url || meta.image_url || (uidKey && facePhotoMap.get(uidKey)) || (empK && facePhotoMap.get(empK)) || '';
        const photo = sanitizeStudentPhotoUrl(rawPhoto);

        const hasFace =
          (uidKey && enrolledFaceIds.has(uidKey)) ||
          (empK && enrolledFaceIds.has(empK)) ||
          Boolean(photo);

        const attInfo =
          (uidKey && todayAttMap.get(uidKey)) ||
          (empK && todayAttMap.get(empK)) ||
          (rollK && todayAttMap.get(rollK)) ||
          (nameK && todayAttMap.get(nameK)) ||
          (r.id && todayAttMap.get(norm(r.id)));

        const wasPresentPrev = Boolean(
          (uidKey && prevDayPresentSet.has(uidKey)) ||
          (empK && prevDayPresentSet.has(empK)) ||
          (rollK && prevDayPresentSet.has(rollK)) ||
          (nameK && prevDayPresentSet.has(nameK)) ||
          (r.id && prevDayPresentSet.has(norm(r.id)))
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
        const rollK = norm(p.roll_number);

        const rawPhoto = p.photo_url || p.avatar_url || (uidKey && facePhotoMap.get(uidKey)) || (empK && facePhotoMap.get(empK)) || '';
        const photo = sanitizeStudentPhotoUrl(rawPhoto);

        const hasFace =
          (uidKey && enrolledFaceIds.has(uidKey)) ||
          (empK && enrolledFaceIds.has(empK)) ||
          Boolean(photo);

        const attInfo =
          (uidKey && todayAttMap.get(uidKey)) ||
          (empK && todayAttMap.get(empK)) ||
          (rollK && todayAttMap.get(rollK)) ||
          (nameK && todayAttMap.get(nameK)) ||
          (p.id && todayAttMap.get(norm(p.id)));

        const wasPresentPrev = Boolean(
          (uidKey && prevDayPresentSet.has(uidKey)) ||
          (empK && prevDayPresentSet.has(empK)) ||
          (rollK && prevDayPresentSet.has(rollK)) ||
          (nameK && prevDayPresentSet.has(nameK)) ||
          (p.id && prevDayPresentSet.has(norm(p.id)))
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

      // 3. Process any attendance_records tagged directly with class/section
      (todayAttRes.data || []).forEach((r: any) => {
        if (r.status === 'registered') return;
        const dInfo = (r.device_info as any) || {};
        const meta = dInfo.metadata || {};
        const categoryVal = r.category || meta.category || meta.department;
        const classVal = r.class || meta.class;
        const sectionVal = r.section || meta.section;

        if (matchesClassAndSection({ category: categoryVal, class: classVal, section: sectionVal, department: meta.department }, cls, sec)) {
          const name = meta.name || r.student_name || dInfo.name || 'Student';
          const empId = meta.employee_id || dInfo.employee_id || r.student_id || '';
          const roll = meta.roll_number || dInfo.roll_number || '';
          const uidKey = norm(r.user_id);
          const nameK = norm(name);
          const empK = norm(empId);
          const rollK = norm(roll);

          const attInfo =
            (uidKey && todayAttMap.get(uidKey)) ||
            (empK && todayAttMap.get(empK)) ||
            (rollK && todayAttMap.get(rollK)) ||
            (nameK && todayAttMap.get(nameK));

          const wasPresentPrev = Boolean(
            (uidKey && prevDayPresentSet.has(uidKey)) ||
            (empK && prevDayPresentSet.has(empK)) ||
            (rollK && prevDayPresentSet.has(rollK)) ||
            (nameK && prevDayPresentSet.has(nameK))
          );

          upsertStudent({
            id: r.id || r.user_id || `direct-att-${nameK}`,
            user_id: r.user_id,
            name,
            roll_number: roll,
            admission_number: empId,
            parent_name: meta.parent_name || dInfo.parent_name || '',
            parent_email: meta.parent_email || dInfo.parent_email || '',
            parent_phone: meta.parent_phone || dInfo.parent_phone || '',
            photo_url: sanitizeStudentPhotoUrl(r.image_url || meta.image_url || ''),
            has_face_descriptor: Boolean(uidKey && enrolledFaceIds.has(uidKey)),
            today_status: attInfo?.status || (r.status === 'late' ? 'late' : r.status === 'absent' ? 'absent' : 'present'),
            today_time: attInfo?.time || (r.timestamp ? new Date(r.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : ''),
            was_present_yesterday: wasPresentPrev,
            capture_mode: attInfo?.captureMode || r.capture_mode,
            attendance_source: attInfo?.source || r.source,
            is_manual: attInfo?.isManual ?? (r.capture_mode === 'manual' || r.source === 'teacher-portal'),
          });
        }
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

  // Real-time Supabase subscription for instant live attendance sync across ALL school sources
  useEffect(() => {
    if (!activeClass) return;

    const channelName = `teacher_live_${activeClass.class}_${activeClass.section}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'attendance_records' },
        () => loadClassStudents()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'gate_entries' },
        () => loadClassStudents()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'face_descriptors' },
        () => loadClassStudents()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles' },
        () => loadClassStudents()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'class_teachers' },
        () => loadTeacherAssignments()
      )
      .subscribe();

    return () => {
      try {
        supabase.removeChannel(channel);
      } catch (_) {}
    };
  }, [activeClass, loadClassStudents, loadTeacherAssignments]);

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

  const handleClaimClass = async (categoryToClaim?: string) => {
    if (!userId) return;
    const cat = categoryToClaim || `${claimGrade.trim().toUpperCase()}-${claimSection.trim().toUpperCase()}`;
    if (!cat || cat === '-') {
      toast({ title: 'Invalid Class', description: 'Please provide both Grade and Section', variant: 'destructive' });
      return;
    }
    setIsClaimingClass(true);
    try {
      await assignClassTeacher(cat, userId, teacherProfile.name, teacherProfile.email, claimRole);
      toast({ title: 'Class Assigned!', description: `You are now assigned as ${claimRole === 'class_teacher' ? 'Class Teacher' : 'Co-Teacher'} for Class ${cat}.` });
      await loadTeacherAssignments();
    } catch (err: any) {
      toast({ title: 'Failed to assign class', description: err.message, variant: 'destructive' });
    } finally {
      setIsClaimingClass(false);
    }
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
      <Card className="max-w-2xl mx-auto my-8 border-slate-200 dark:border-white/10 shadow-xl rounded-3xl overflow-hidden liquid-glass-surface">
        <CardHeader className="text-center pb-2 bg-gradient-to-b from-blue-500/10 to-transparent">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white mb-3 shadow-lg shadow-blue-500/20">
            <GraduationCap className="h-7 w-7" />
          </div>
          <CardTitle className="text-xl font-black">Welcome to Teacher Portal, {teacherProfile.name}!</CardTitle>
          <CardDescription className="text-xs max-w-md mx-auto mt-1">
            To start managing students, attendance, timetables, and assignments, choose or claim your primary class below.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 pt-4">
          <div className="space-y-2">
            <Label className="text-xs font-bold text-foreground">1-Tap Quick Claim (Popular Grades):</Label>
            <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
              {['6-A', '7-A', '8-A', '9-A', '10-A', '10-B', '11-A', '12-A'].map((cat) => (
                <Button
                  key={cat}
                  variant="outline"
                  size="sm"
                  disabled={isClaimingClass}
                  onClick={() => handleClaimClass(cat)}
                  className="text-xs font-bold h-9 rounded-xl hover:bg-primary hover:text-white border-slate-200 dark:border-white/10 transition-all active:scale-95"
                >
                  {cat}
                </Button>
              ))}
            </div>
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200 dark:border-white/10" /></div>
            <div className="relative flex justify-center text-xs">
              <span className="px-3 bg-card text-muted-foreground font-medium">or specify custom class</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Grade / Standard</Label>
              <Input
                placeholder="e.g. 10"
                value={claimGrade}
                onChange={(e) => setClaimGrade(e.target.value)}
                className="h-9 text-xs rounded-xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Section</Label>
              <Input
                placeholder="e.g. A"
                value={claimSection}
                onChange={(e) => setClaimSection(e.target.value)}
                className="h-9 text-xs rounded-xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Faculty Role</Label>
              <select
                value={claimRole}
                onChange={(e) => setClaimRole(e.target.value as any)}
                className="h-9 w-full text-xs rounded-xl border bg-background px-3"
              >
                <option value="class_teacher">Class Teacher</option>
                <option value="co_teacher">Co-Teacher</option>
              </select>
            </div>
          </div>

          <Button
            onClick={() => handleClaimClass()}
            disabled={isClaimingClass || !claimGrade || !claimSection}
            className="w-full h-10 text-sm font-bold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-2xl shadow-lg shadow-blue-500/20 gap-2"
          >
            {isClaimingClass ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Claim Class & Launch Portal
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (isMobile) {
    return (
      <div className="space-y-4">
        <TeacherMobileAppView
          teacherName={teacherProfile.name}
          teacherEmail={teacherProfile.email}
          avatarUrl={teacherProfile.avatarUrl}
          activeClass={activeClass}
          assignments={assignments}
          students={students}
          stats={stats}
          previousDayLabel={previousDayLabel}
          pendingGatePassesCount={pendingGatePassesCount}
          isMarkingAttendance={isMarkingAttendance}
          onSelectClass={setActiveClass}
          onQuickMarkAttendance={handleQuickMarkAttendance}
          onAutoMarkAbsent={handleAutoMarkAbsent}
          onMarkAllPresent={handleMarkAllUnmarkedPresent}
          onOpenAddStudent={() => setIsAddStudentOpen(true)}
          onOpenFaceCapture={(st) => setSelectedFaceStudent(st)}
          onRefresh={loadClassStudents}
          isRefreshing={isRefreshing}
        />

        {selectedFaceStudent && (
          <CaptureFaceDialog
            isOpen={Boolean(selectedFaceStudent)}
            onClose={() => setSelectedFaceStudent(null)}
            studentId={selectedFaceStudent.admission_number || selectedFaceStudent.id}
            studentName={selectedFaceStudent.name}
            classSection={activeClass?.category}
            onSuccess={() => {
              loadClassStudents();
              setSelectedFaceStudent(null);
            }}
          />
        )}
      </div>
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
          {/* Quick Metrics Bar - Nano Card Bento Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="nano-card p-3.5 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">Total Students</p>
                <p className="text-2xl font-bold text-foreground mt-0.5">{stats.total}</p>
              </div>
              <div className="h-9 w-9 rounded-xl bg-muted/60 flex items-center justify-center text-muted-foreground">
                <Users className="h-4 w-4" />
              </div>
            </div>

            <div className="nano-card p-3.5 flex items-center justify-between border-emerald-500/20 bg-emerald-500/5">
              <div>
                <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">Present Today</p>
                <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">{stats.present}</p>
              </div>
              <div className="h-9 w-9 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                <CheckCircle2 className="h-4 w-4" />
              </div>
            </div>

            <div className="nano-card p-3.5 flex items-center justify-between border-amber-500/20 bg-amber-500/5">
              <div>
                <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">Late Arrivals</p>
                <p className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-0.5">{stats.late}</p>
              </div>
              <div className="h-9 w-9 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500">
                <Clock className="h-4 w-4" />
              </div>
            </div>

            <div className="nano-card p-3.5 flex items-center justify-between border-rose-500/20 bg-rose-500/5">
              <div>
                <p className="text-xs text-rose-600 dark:text-rose-400 font-medium">Absent Today</p>
                <p className="text-2xl font-bold text-rose-600 dark:text-rose-400 mt-0.5">{stats.absent}</p>
              </div>
              <div className="h-9 w-9 rounded-xl bg-rose-500/10 flex items-center justify-center text-rose-500">
                <XCircle className="h-4 w-4" />
              </div>
            </div>

            <div className="nano-card p-3.5 flex items-center justify-between col-span-2 sm:col-span-1 border-primary/20 bg-primary/5">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className="text-xs text-primary font-semibold">Attendance Rate</p>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full font-mono shrink-0 ${stats.attendancePct >= 75 ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-rose-500/15 text-rose-600 dark:text-rose-400'}`}>
                    {stats.attendancePct >= 75 ? 'CBSE Ok' : 'Defaulter'}
                  </span>
                </div>
                <p className="text-2xl font-black text-primary mt-0.5 font-mono">{stats.attendancePct}%</p>
              </div>
              <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0 ml-2">
                <Zap className="h-4 w-4" />
              </div>
            </div>
          </div>

          {/* Main Navigation Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full space-y-4">
            <div className="overflow-x-auto pb-1 no-scrollbar">
              <TabsList className="nano-glass-dock p-1.5 rounded-2xl inline-flex w-full sm:w-auto border border-slate-200/70 dark:border-white/10 shadow-xs">
                <TabsTrigger value="overview" className="gap-1.5 rounded-xl text-xs sm:text-sm py-2 px-3.5 font-bold data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-600 data-[state=active]:to-indigo-600 data-[state=active]:text-white data-[state=active]:shadow-md">
                  <LayoutDashboard className="h-4 w-4" /> Overview Dashboard
                </TabsTrigger>
                <TabsTrigger value="daily" className="gap-1.5 rounded-xl text-xs sm:text-sm py-2 px-3.5 font-bold data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-600 data-[state=active]:to-indigo-600 data-[state=active]:text-white data-[state=active]:shadow-md">
                  <CheckSquare className="h-4 w-4" /> Daily Attendance
                  {stats.unmarked > 0 && (
                    <span className="ml-1 px-1.5 py-0.5 text-[10px] bg-amber-500 text-white rounded-full font-extrabold leading-none">
                      {stats.unmarked}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="absentees" className="gap-1.5 rounded-xl text-xs sm:text-sm py-2 px-3.5 font-bold data-[state=active]:bg-gradient-to-r data-[state=active]:from-rose-600 data-[state=active]:to-pink-600 data-[state=active]:text-white data-[state=active]:shadow-md">
                  <UserX className="h-4 w-4" /> Absentee Radar
                  {stats.absent + stats.unmarked > 0 && (
                    <span className="ml-1 px-1.5 py-0.5 text-[10px] bg-rose-500 text-white rounded-full font-extrabold leading-none animate-pulse">
                      {stats.absent + stats.unmarked}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="register" className="gap-1.5 rounded-xl text-xs sm:text-sm py-2 px-3.5 font-bold data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-600 data-[state=active]:to-indigo-600 data-[state=active]:text-white data-[state=active]:shadow-md">
                  <Calendar className="h-4 w-4" /> Monthly Register
                </TabsTrigger>
                <TabsTrigger value="students" className="gap-1.5 rounded-xl text-xs sm:text-sm py-2 px-3.5 font-bold data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-600 data-[state=active]:to-indigo-600 data-[state=active]:text-white data-[state=active]:shadow-md">
                  <Users className="h-4 w-4" /> Student Directory ({students.length})
                </TabsTrigger>
                <TabsTrigger value="assignments" className="gap-1.5 rounded-xl text-xs sm:text-sm py-2 px-3.5 font-bold data-[state=active]:bg-gradient-to-r data-[state=active]:from-indigo-600 data-[state=active]:to-purple-600 data-[state=active]:text-white data-[state=active]:shadow-md">
                  <BookOpen className="h-4 w-4" /> Assignments & Tests
                </TabsTrigger>
                <TabsTrigger value="notifications" className="gap-1.5 rounded-xl text-xs sm:text-sm py-2 px-3.5 font-bold data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-600 data-[state=active]:to-indigo-600 data-[state=active]:text-white data-[state=active]:shadow-md">
                  <Send className="h-4 w-4" /> Parent Notices
                </TabsTrigger>
                <TabsTrigger value="reports" className="gap-1.5 rounded-xl text-xs sm:text-sm py-2 px-3.5 font-bold data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-600 data-[state=active]:to-indigo-600 data-[state=active]:text-white data-[state=active]:shadow-md">
                  <FileDown className="h-4 w-4" /> Class Reports
                </TabsTrigger>
                <TabsTrigger value="timetable" className="gap-1.5 rounded-xl text-xs sm:text-sm py-2 px-3.5 font-bold data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-600 data-[state=active]:to-indigo-600 data-[state=active]:text-white data-[state=active]:shadow-md">
                  <Calendar className="h-4 w-4" /> Timetable
                </TabsTrigger>
                <TabsTrigger value="gate_passes" className="gap-1.5 rounded-xl text-xs sm:text-sm py-2 px-3.5 font-bold data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-600 data-[state=active]:to-indigo-600 data-[state=active]:text-white data-[state=active]:shadow-md">
                  <QrCode className="h-4 w-4 text-amber-500" /> Gate Passes
                  {pendingGatePassesCount > 0 && (
                    <span className="ml-1 px-1.5 py-0.5 text-[10px] bg-amber-500 text-white rounded-full font-extrabold leading-none animate-pulse">
                      {pendingGatePassesCount}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="widgets" className="gap-1.5 rounded-xl text-xs sm:text-sm py-2 px-3.5 font-bold data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-500 data-[state=active]:to-orange-500 data-[state=active]:text-white data-[state=active]:shadow-md">
                  <Smartphone className="h-4 w-4 text-amber-500 data-[state=active]:text-white" /> Android Widgets
                </TabsTrigger>
              </TabsList>
            </div>

            {/* TAB: OVERVIEW DASHBOARD */}
            <TabsContent value="overview" className="space-y-4 m-0">
              <TeacherDashboardOverview
                teacherName={teacherProfile.name}
                teacherEmail={teacherProfile.email}
                avatarUrl={teacherProfile.avatarUrl}
                activeClass={activeClass}
                assignments={assignments}
                students={students}
                previousDayLabel={previousDayLabel}
                pendingGatePassesCount={pendingGatePassesCount}
                onSelectTab={setActiveTab}
                onSelectClass={setActiveClass}
                onQuickMarkAttendance={handleQuickMarkAttendance}
                onAutoMarkAbsent={handleAutoMarkAbsent}
                onMarkAllPresent={handleMarkAllUnmarkedPresent}
                onOpenExportModal={() => setIsExportModalOpen(true)}
                isMarkingAttendance={isMarkingAttendance}
              />
            </TabsContent>

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
                        onClick={() => setIsExportModalOpen(true)}
                        className="text-xs h-8 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold rounded-xl gap-1.5 shadow-sm"
                        title="Export attendance in PA Register Matrix or Standard Audit Log format for any duration"
                      >
                        <FileSpreadsheet className="h-3.5 w-3.5" /> Export Attendance
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleExportRosterExcel}
                        className="text-xs h-8 rounded-xl gap-1.5"
                        title="Quick download Excel sheet of today's attendance"
                      >
                        <Download className="h-3.5 w-3.5" /> Quick Excel
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-3">
                  {/* Filter, Search, and View Mode Bar */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-1">
                    <div className="flex items-center gap-2 flex-1">
                      <div className="relative flex-1 max-w-sm">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                          placeholder="Search student or roll no..."
                          value={searchQuery}
                          onChange={e => setSearchQuery(e.target.value)}
                          className="h-8 pl-8 text-xs rounded-xl"
                        />
                      </div>

                      {/* View Mode Switcher */}
                      <div className="flex items-center bg-muted/60 p-0.5 rounded-xl border shrink-0">
                        <button
                          type="button"
                          onClick={() => setRollCallViewMode('cards')}
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 ${
                            rollCallViewMode === 'cards'
                              ? 'bg-background text-foreground shadow-xs'
                              : 'text-muted-foreground hover:text-foreground'
                          }`}
                          title="Mobile Touch Cards Mode"
                        >
                          <Smartphone className="h-3.5 w-3.5 text-primary" />
                          <span>Cards</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setRollCallViewMode('table')}
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 ${
                            rollCallViewMode === 'table'
                              ? 'bg-background text-foreground shadow-xs'
                              : 'text-muted-foreground hover:text-foreground'
                          }`}
                          title="Detailed Table Mode"
                        >
                          <List className="h-3.5 w-3.5" />
                          <span>Table</span>
                        </button>
                      </div>
                    </div>

                    {/* Filter Buttons */}
                    <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0 no-scrollbar">
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

                  {/* 1. MOBILE TOUCH CARDS MODE */}
                  {rollCallViewMode === 'cards' ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {filteredStudents.length === 0 ? (
                        <div className="col-span-full p-8 text-center text-muted-foreground text-xs">
                          No students found matching this filter.
                        </div>
                      ) : (
                        filteredStudents.map(student => (
                          <div
                            key={student.id}
                            className={`p-3.5 rounded-2xl border transition-all flex flex-col justify-between gap-3 shadow-xs ${
                              student.today_status === 'present'
                                ? 'bg-emerald-500/5 border-emerald-500/30'
                                : student.today_status === 'late'
                                ? 'bg-amber-500/5 border-amber-500/30'
                                : student.today_status === 'absent'
                                ? 'bg-rose-500/5 border-rose-500/30'
                                : student.was_present_yesterday
                                ? 'bg-card border-amber-500/40 shadow-amber-500/5'
                                : 'bg-card border-border/80'
                            }`}
                          >
                            {/* Top Card Info */}
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className="relative shrink-0">
                                  <Avatar className="h-11 w-11 rounded-2xl border-2 border-primary/20 shadow-xs">
                                    <AvatarImage src={getStudentPhotoUrl(student)} alt={student.name} />
                                    <AvatarFallback className="text-xs font-bold bg-primary/10 text-primary">
                                      {student.name.slice(0, 2).toUpperCase()}
                                    </AvatarFallback>
                                  </Avatar>
                                  <span
                                    className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-background ${
                                      student.today_status === 'present'
                                        ? 'bg-emerald-500'
                                        : student.today_status === 'late'
                                        ? 'bg-amber-500'
                                        : student.today_status === 'absent'
                                        ? 'bg-rose-500'
                                        : 'bg-slate-400'
                                    }`}
                                  />
                                </div>

                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <Badge variant="secondary" className="text-[10px] font-mono px-1.5 py-0 h-4">
                                      #{student.roll_number || '—'}
                                    </Badge>
                                    <span className="font-extrabold text-sm text-foreground truncate">{student.name}</span>
                                  </div>
                                  <p className="text-[10px] font-mono text-muted-foreground truncate mt-0.5">
                                    ID: {student.admission_number || '—'}
                                  </p>
                                </div>
                              </div>

                              {student.parent_phone && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => openWhatsAppParent(student)}
                                  className="h-8 w-8 p-0 text-emerald-600 hover:bg-emerald-500/10 rounded-xl shrink-0"
                                  title="WhatsApp Parent"
                                >
                                  <MessageSquare className="h-4 w-4" />
                                </Button>
                              )}
                            </div>

                            {/* Middle Status Pill & Yesterday Context */}
                            <div className="flex items-center justify-between text-[11px] px-1">
                              <div>
                                {student.was_present_yesterday ? (
                                  <span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1 text-[10px]">
                                    <CheckCircle2 className="h-3 w-3" /> Present Yesterday
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground text-[10px]">No prev day entry</span>
                                )}
                              </div>

                              <div>
                                {student.today_status === 'present' ? (
                                  <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 text-[10px] font-bold">
                                    ✓ Present {student.today_time ? `(${student.today_time})` : ''}
                                  </Badge>
                                ) : student.today_status === 'late' ? (
                                  <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30 text-[10px] font-bold">
                                    ◷ Late {student.today_time ? `(${student.today_time})` : ''}
                                  </Badge>
                                ) : student.today_status === 'absent' ? (
                                  <Badge className="bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30 text-[10px] font-bold">
                                    ✕ Absent
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-muted-foreground text-[10px]">
                                    Pending Mark
                                  </Badge>
                                )}
                              </div>
                            </div>

                            {/* Bottom 1-Tap Thumb Action Grid */}
                            <div className="grid grid-cols-3 gap-1.5 pt-1 border-t border-border/50">
                              <Button
                                size="sm"
                                variant={student.today_status === 'present' ? 'default' : 'outline'}
                                onClick={() => handleQuickMarkAttendance(student, 'present')}
                                className={`h-8 text-xs font-bold rounded-xl transition-all ${
                                  student.today_status === 'present'
                                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm'
                                    : 'text-emerald-600 hover:bg-emerald-500/10 border-emerald-500/30'
                                }`}
                              >
                                <Check className="h-3.5 w-3.5 mr-1" /> Present
                              </Button>

                              <Button
                                size="sm"
                                variant={student.today_status === 'late' ? 'default' : 'outline'}
                                onClick={() => handleQuickMarkAttendance(student, 'late')}
                                className={`h-8 text-xs font-bold rounded-xl transition-all ${
                                  student.today_status === 'late'
                                    ? 'bg-amber-600 hover:bg-amber-700 text-white shadow-sm'
                                    : 'text-amber-600 hover:bg-amber-500/10 border-amber-500/30'
                                }`}
                              >
                                <Clock className="h-3.5 w-3.5 mr-1" /> Late
                              </Button>

                              <Button
                                size="sm"
                                variant={student.today_status === 'absent' ? 'default' : 'outline'}
                                onClick={() => handleQuickMarkAttendance(student, 'absent')}
                                className={`h-8 text-xs font-bold rounded-xl transition-all ${
                                  student.today_status === 'absent'
                                    ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-sm'
                                    : 'text-rose-600 hover:bg-rose-500/10 border-rose-500/30'
                                }`}
                              >
                                <XCircle className="h-3.5 w-3.5 mr-1" /> Absent
                              </Button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  ) : (
                    /* 2. DETAILED TABLE MODE */
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
                                      <AvatarImage src={getStudentPhotoUrl(student)} alt={student.name} />
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
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* TAB: DAILY ABSENTEE RADAR & RAPID OVERRIDE */}
            <TabsContent value="absentees" className="space-y-4 m-0">
              <TeacherAbsenteeManager
                activeClass={activeClass}
                students={students}
                teacherName={teacherProfile.name}
                teacherEmail={teacherProfile.email}
                previousDayLabel={previousDayLabel}
                onRefresh={loadClassStudents}
              />
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
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            onClick={() => {
                              navigate(`/register?department=${encodeURIComponent(activeClass.category)}&returnUrl=${encodeURIComponent(`/teacher/${activeClass.category}`)}`);
                            }}
                            className="text-xs h-8 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-extrabold rounded-xl gap-1.5 shadow-md shadow-blue-600/20"
                            title="Register new student with 3D Face Biometrics & ID Card Scanner"
                          >
                            <Plus className="h-3.5 w-3.5" /> + Register New Student
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setIsAddStudentOpen(true)}
                            className="text-xs h-8 rounded-xl font-bold gap-1 text-muted-foreground hover:text-foreground"
                            title="Quick Manual Entry directly into class roster"
                          >
                            Quick Entry
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-3">
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                    <div className="relative max-w-sm flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        placeholder="Search student by name, roll no, phone..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="h-8 pl-8 text-xs rounded-xl"
                      />
                    </div>

                    <div className="flex items-center gap-1.5 self-end sm:self-auto bg-muted/60 p-1 rounded-xl border">
                      <button
                        type="button"
                        onClick={() => setDirectoryViewMode('table')}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                          directoryViewMode === 'table'
                            ? 'bg-background text-foreground shadow-xs'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        <List className="h-3.5 w-3.5" /> Table
                      </button>
                      <button
                        type="button"
                        onClick={() => setDirectoryViewMode('grid')}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                          directoryViewMode === 'grid'
                            ? 'bg-background text-foreground shadow-xs'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        <Grid className="h-3.5 w-3.5 text-primary" /> Photo ID Gallery
                      </button>
                    </div>
                  </div>

                  {filteredStudents.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground text-xs">
                      No students found matching "{searchQuery}".
                    </div>
                  ) : directoryViewMode === 'table' ? (
                    /* 1. INTERACTIVE TABLE VIEW */
                    <div className="overflow-x-auto rounded-2xl border bg-background/50 shadow-inner">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-muted/60 border-b">
                            <th className="p-2.5 text-left font-bold w-12">Roll</th>
                            <th className="p-2.5 text-left font-bold">Student Photo & Name</th>
                            <th className="p-2.5 text-left font-bold">Admission ID</th>
                            <th className="p-2.5 text-left font-bold">Biometric Face Model</th>
                            <th className="p-2.5 text-left font-bold">Parent Contact</th>
                            <th className="p-2.5 text-center font-bold">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {filteredStudents.map(student => (
                            <tr
                              key={student.id}
                              className="hover:bg-primary/5 transition-colors group cursor-pointer"
                              onClick={() => setInspectStudent(student)}
                            >
                              <td className="p-2.5 font-bold font-mono text-muted-foreground">
                                {student.roll_number || '—'}
                              </td>
                              <td className="p-2.5">
                                <div className="flex items-center gap-3">
                                  <div className="relative group/avatar">
                                    <Avatar className="h-9 w-9 rounded-2xl border-2 border-primary/20 shadow-xs group-hover:scale-105 transition-transform overflow-hidden bg-background">
                                      <AvatarImage
                                        src={getStudentPhotoUrl(student)}
                                        alt={student.name}
                                        className="object-cover"
                                      />
                                      <AvatarFallback className="text-[10px] font-bold bg-primary/10 text-primary">
                                        {student.name.slice(0, 2).toUpperCase()}
                                      </AvatarFallback>
                                    </Avatar>
                                    <span
                                      className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background ${
                                        student.today_status === 'present'
                                          ? 'bg-emerald-500'
                                          : student.today_status === 'late'
                                          ? 'bg-amber-500'
                                          : student.today_status === 'absent'
                                          ? 'bg-rose-500'
                                          : 'bg-slate-400'
                                      }`}
                                      title={`Today: ${student.today_status || 'Unmarked'}`}
                                    />
                                  </div>
                                  <div>
                                    <span className="font-extrabold text-foreground block group-hover:text-primary transition-colors">
                                      {student.name}
                                    </span>
                                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                      {student.today_time ? `Checked in: ${student.today_time}` : 'Click to inspect profile'}
                                    </span>
                                  </div>
                                </div>
                              </td>
                              <td className="p-2.5 font-mono text-muted-foreground">
                                {student.admission_number || '—'}
                              </td>
                              <td className="p-2.5">
                                <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                                  {student.has_face_descriptor ? (
                                    <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 text-[10px] font-bold gap-1">
                                      <CheckCircle2 className="h-3 w-3" /> 3D Enrolled
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30 text-[10px] font-bold gap-1">
                                      <AlertCircle className="h-3 w-3" /> Pending
                                    </Badge>
                                  )}
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setSelectedFaceStudent(student)}
                                    className="h-6 px-1.5 text-[10px] rounded-lg gap-1 border border-border/80 hover:bg-primary/10 hover:text-primary transition-colors"
                                    title={student.has_face_descriptor ? "Re-scan 3D Face Biometrics" : "Enroll 3D Face Model"}
                                  >
                                    <ScanFace className="h-3 w-3 text-primary" />
                                    <span>{student.has_face_descriptor ? 'Re-scan' : 'Enroll'}</span>
                                  </Button>
                                </div>
                              </td>
                              <td className="p-2.5 text-muted-foreground">
                                <div>{student.parent_name || '—'}</div>
                                {student.parent_phone && (
                                  <div className="text-[11px] font-mono text-primary flex items-center gap-1 mt-0.5">
                                    <Phone className="h-3 w-3" /> {student.parent_phone}
                                  </div>
                                )}
                              </td>
                              <td className="p-2.5 text-center" onClick={e => e.stopPropagation()}>
                                <div className="flex items-center justify-center gap-1">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setInspectStudent(student)}
                                    className="h-7 w-7 p-0 text-primary hover:bg-primary/10 rounded-lg"
                                    title="View Full Profile & Photos"
                                  >
                                    <Eye className="h-3.5 w-3.5" />
                                  </Button>
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
                                    className="h-7 w-7 p-0 rounded-lg text-muted-foreground hover:text-foreground"
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
                  ) : (
                    /* 2. PHOTO ID CARD GALLERY VIEW */
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
                      {filteredStudents.map(student => (
                        <div
                          key={student.id}
                          onClick={() => setInspectStudent(student)}
                          className="group relative p-3.5 rounded-3xl border border-border/80 hover:border-primary/50 bg-card/80 hover:bg-card shadow-sm hover:shadow-xl transition-all cursor-pointer space-y-3 flex flex-col justify-between overflow-hidden"
                        >
                          {/* Top Card Strip */}
                          <div className="flex items-start gap-3">
                            <div className="relative shrink-0">
                              <Avatar className="h-16 w-16 rounded-2xl border-2 border-primary/25 shadow-md group-hover:scale-105 transition-transform overflow-hidden bg-background">
                                <AvatarImage
                                  src={getStudentPhotoUrl(student)}
                                  alt={student.name}
                                  className="object-cover"
                                />
                                <AvatarFallback className="text-base font-extrabold bg-primary/10 text-primary">
                                  {student.name.slice(0, 2).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              <span
                                className={`absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full border-2 border-card ${
                                  student.today_status === 'present'
                                    ? 'bg-emerald-500 ring-2 ring-emerald-500/30 animate-pulse'
                                    : student.today_status === 'late'
                                    ? 'bg-amber-500'
                                    : student.today_status === 'absent'
                                    ? 'bg-rose-500'
                                    : 'bg-slate-400'
                                }`}
                                title={`Today: ${student.today_status || 'Unmarked'}`}
                              />
                            </div>

                            <div className="min-w-0 flex-1 space-y-0.5">
                              <div className="flex items-center justify-between gap-1">
                                <Badge variant="secondary" className="text-[10px] font-mono font-bold px-1.5 py-0 h-4">
                                  Roll {student.roll_number || '—'}
                                </Badge>
                                {student.has_face_descriptor ? (
                                  <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 text-[9px] font-bold">
                                    ✓ 3D Face
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30 text-[9px] font-bold">
                                    No Face
                                  </Badge>
                                )}
                              </div>
                              <h4 className="font-extrabold text-sm text-foreground truncate group-hover:text-primary transition-colors">
                                {student.name}
                              </h4>
                              <p className="text-[10px] font-mono text-muted-foreground truncate">
                                ID: {student.admission_number || '—'}
                              </p>
                            </div>
                          </div>

                          {/* Middle Info Details */}
                          <div className="p-2 rounded-2xl bg-muted/30 border border-border/50 text-[11px] space-y-1">
                            <div className="flex items-center justify-between text-muted-foreground">
                              <span>Parent:</span>
                              <span className="font-semibold text-foreground truncate max-w-[120px]">
                                {student.parent_name || 'Not recorded'}
                              </span>
                            </div>
                            {student.parent_phone && (
                              <div className="flex items-center justify-between text-muted-foreground">
                                <span>Phone:</span>
                                <span className="font-mono font-semibold text-primary">
                                  {student.parent_phone}
                                </span>
                              </div>
                            )}
                          </div>

                          {/* Quick Actions Footer */}
                          <div className="flex items-center justify-between gap-1.5 pt-1 border-t border-border/50" onClick={e => e.stopPropagation()}>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setSelectedFaceStudent(student)}
                              className="h-7 px-2 text-[10px] font-bold rounded-xl gap-1 text-primary border-primary/30 hover:bg-primary/10 flex-1"
                              title={student.has_face_descriptor ? "Re-scan 3D Face Biometrics" : "Enroll 3D Face Model"}
                            >
                              <ScanFace className="h-3 w-3" />
                              {student.has_face_descriptor ? 'Re-scan' : 'Scan Face'}
                            </Button>

                            {student.parent_phone && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openWhatsAppParent(student)}
                                className="h-7 w-7 p-0 rounded-xl text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/10"
                                title="WhatsApp Parent"
                              >
                                <MessageSquare className="h-3.5 w-3.5" />
                              </Button>
                            )}

                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleOpenEditStudent(student)}
                              className="h-7 w-7 p-0 rounded-xl text-muted-foreground hover:text-foreground"
                              title="Edit Student Info"
                            >
                              <Edit2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* TAB: HOMEWORK, UNIT TESTS & ASSIGNMENTS */}
            <TabsContent value="assignments" className="space-y-4 m-0">
              <TeacherAssignmentManager
                activeClass={activeClass}
                students={students}
                teacherName={teacherProfile.name}
              />
            </TabsContent>

            {/* TAB: PARENT NOTIFICATIONS & CLASS NOTICES */}
            <TabsContent value="notifications" className="space-y-4 m-0">
              <TeacherNotificationHub
                activeClass={activeClass}
                students={students}
                teacherName={teacherProfile.name}
                teacherEmail={teacherProfile.email}
              />
            </TabsContent>

            {/* TAB: CLASS REPORTS & ANALYTICS */}
            <TabsContent value="reports" className="space-y-4 m-0">
              <Suspense fallback={<div className="h-[360px] rounded-2xl bg-muted/40 animate-pulse" />}>
                <ClassSectionReport allowedCategories={[activeClass.category]} />
              </Suspense>
            </TabsContent>

            {/* TAB: CLASS TIMETABLE & PLAN */}
            <TabsContent value="timetable" className="space-y-4 m-0">
              <TeacherTimetableEditor activeClass={activeClass} />
            </TabsContent>

            {/* TAB: GATE PASSES & LEAVE VERIFICATION */}
            <TabsContent value="gate_passes" className="space-y-4 m-0">
              <TeacherGatePassReview
                activeClass={activeClass}
                teacherName={teacherProfile.name}
                teacherEmail={teacherProfile.email}
                students={students}
              />
            </TabsContent>

            {/* TAB: ANDROID WIDGETS BOARD */}
            <TabsContent value="widgets" className="space-y-4 m-0">
              <AndroidWidgetBoard
                students={students}
                activeClass={activeClass}
                onRefresh={loadClassStudents}
                isRefreshing={isRefreshing}
                onOpenAbsenteeManager={() => setActiveTab('absentees')}
                onOpenIssuePass={() => setActiveTab('gate_passes')}
                onOpenScanPass={() => setActiveTab('gate_passes')}
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
            {/* Quick Redirect to Full Biometric Registration Studio */}
            <div className="p-3 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ScanFace className="h-4 w-4 text-blue-600" />
                <div className="text-[11px]">
                  <p className="font-bold text-foreground">Need 3D Face Scan or ID Card OCR?</p>
                  <p className="text-muted-foreground">Use full biometric registration workstation</p>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                type="button"
                onClick={() => {
                  setIsAddStudentOpen(false);
                  navigate(`/register?department=${encodeURIComponent(activeClass?.category || '')}&returnUrl=${encodeURIComponent(`/teacher/${activeClass?.category || ''}`)}`);
                }}
                className="h-7 px-2.5 text-[11px] font-bold text-blue-600 hover:bg-blue-500/10 rounded-xl shrink-0"
              >
                Open Studio →
              </Button>
            </div>

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

      {/* Dual Format Attendance Exporter Modal for Any Time Duration */}
      {activeClass && (
        <TeacherAttendanceExporter
          isOpen={isExportModalOpen}
          onClose={() => setIsExportModalOpen(false)}
          activeClass={activeClass}
          students={students}
        />
      )}

      {/* 3D Face Biometric Enrollment Dialog */}
      <CaptureFaceDialog
        open={Boolean(selectedFaceStudent)}
        onOpenChange={(open) => {
          if (!open) setSelectedFaceStudent(null);
        }}
        student={
          selectedFaceStudent && activeClass
            ? {
                id: selectedFaceStudent.id,
                user_id: selectedFaceStudent.user_id,
                name: selectedFaceStudent.name,
                employee_id: selectedFaceStudent.admission_number || selectedFaceStudent.id,
                roll_number: selectedFaceStudent.roll_number,
                category: activeClass.category,
                parent_name: selectedFaceStudent.parent_name,
                parent_phone: selectedFaceStudent.parent_phone,
                parent_email: selectedFaceStudent.parent_email,
              }
            : null
        }
        onSuccess={() => {
          loadClassStudents();
          setSelectedFaceStudent(null);
        }}
      />

      {/* Interactive Student Identity & Biometric Modal */}
      <Dialog open={Boolean(inspectStudent)} onOpenChange={(open) => { if (!open) setInspectStudent(null); }}>
        <DialogContent className="sm:max-w-lg rounded-3xl p-0 overflow-hidden border bg-card shadow-2xl">
          {inspectStudent && (
            <div>
              {/* Header Gradient Cover */}
              <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 p-6 text-white relative">
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <Avatar className="h-20 w-20 rounded-3xl border-4 border-white/20 shadow-2xl overflow-hidden bg-background">
                      <AvatarImage
                        src={getStudentPhotoUrl(inspectStudent)}
                        alt={inspectStudent.name}
                        className="object-cover"
                      />
                      <AvatarFallback className="text-xl font-black bg-primary/20 text-white">
                        {inspectStudent.name.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span
                      className={`absolute -bottom-1 -right-1 h-5 w-5 rounded-full border-2 border-white flex items-center justify-center ${
                        inspectStudent.today_status === 'present'
                          ? 'bg-emerald-500'
                          : inspectStudent.today_status === 'late'
                          ? 'bg-amber-500'
                          : inspectStudent.today_status === 'absent'
                          ? 'bg-rose-500'
                          : 'bg-slate-400'
                      }`}
                    />
                  </div>

                  <div className="space-y-1 text-white">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-lg font-black tracking-tight">{inspectStudent.name}</h3>
                      <Badge variant="secondary" className="bg-white/20 text-white border-0 text-xs font-mono font-bold">
                        Roll #{inspectStudent.roll_number || '—'}
                      </Badge>
                    </div>
                    <p className="text-xs text-white/80 font-medium">
                      Class {activeClass?.category} • Admission ID: <span className="font-mono">{inspectStudent.admission_number || '—'}</span>
                    </p>
                    <div className="flex items-center gap-2 pt-1">
                      {inspectStudent.has_face_descriptor ? (
                        <Badge className="bg-emerald-500 text-white border-0 text-[10px] font-bold gap-1 shadow-sm">
                          <CheckCircle2 className="h-3 w-3" /> 3D Face Model Enrolled
                        </Badge>
                      ) : (
                        <Badge className="bg-amber-500 text-white border-0 text-[10px] font-bold gap-1 shadow-sm">
                          <AlertCircle className="h-3 w-3" /> Face Scan Pending
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Body Content */}
              <div className="p-5 space-y-4">
                {/* 1. Today's Attendance Realtime Card */}
                <div className="p-3.5 rounded-2xl bg-muted/30 border space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold text-foreground flex items-center gap-1.5">
                      <Clock className="h-4 w-4 text-primary" /> Today's Live Attendance Status:
                    </span>
                    <Badge
                      variant={
                        inspectStudent.today_status === 'present'
                          ? 'outline'
                          : inspectStudent.today_status === 'absent'
                          ? 'destructive'
                          : 'secondary'
                      }
                      className={`text-xs font-bold capitalize ${
                        inspectStudent.today_status === 'present' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30' : ''
                      }`}
                    >
                      {inspectStudent.today_status || 'Unmarked'}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground grid grid-cols-2 gap-2 pt-1 border-t">
                    <div>
                      <span className="block text-[10px] text-muted-foreground/80">Check-in Time:</span>
                      <span className="font-bold text-foreground">{inspectStudent.today_time || 'No check-in recorded yet'}</span>
                    </div>
                    <div>
                      <span className="block text-[10px] text-muted-foreground/80">Capture Mode:</span>
                      <span className="font-bold text-foreground capitalize">{inspectStudent.capture_mode || inspectStudent.attendance_source || 'Spotlight Engine'}</span>
                    </div>
                  </div>
                </div>

                {/* 2. Parent & Emergency Contact */}
                <div className="p-3.5 rounded-2xl bg-muted/20 border space-y-2.5">
                  <span className="text-xs font-extrabold text-foreground flex items-center gap-1.5">
                    <Users className="h-4 w-4 text-blue-500" /> Parent & Emergency Contact:
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="block text-[10px] text-muted-foreground">Guardian Name:</span>
                      <span className="font-bold text-foreground">{inspectStudent.parent_name || 'Not specified'}</span>
                    </div>
                    <div>
                      <span className="block text-[10px] text-muted-foreground">Phone Number:</span>
                      <span className="font-mono font-bold text-primary">{inspectStudent.parent_phone || 'No phone recorded'}</span>
                    </div>
                  </div>
                </div>

                {/* 3. Interactive Quick Actions Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
                  <Button
                    size="sm"
                    onClick={() => {
                      const studentToScan = inspectStudent;
                      setInspectStudent(null);
                      setSelectedFaceStudent(studentToScan);
                    }}
                    className="h-9 text-xs bg-primary hover:bg-primary/90 text-white font-bold rounded-xl gap-1.5 shadow-md shadow-primary/20"
                  >
                    <ScanFace className="h-3.5 w-3.5" />
                    {inspectStudent.has_face_descriptor ? 'Re-scan 3D Face' : 'Enroll 3D Face'}
                  </Button>

                  {inspectStudent.parent_phone ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openWhatsAppParent(inspectStudent)}
                      className="h-9 text-xs rounded-xl gap-1.5 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-500/10 border-emerald-500/30 font-bold"
                    >
                      <MessageSquare className="h-3.5 w-3.5" /> WhatsApp Parent
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled
                      className="h-9 text-xs rounded-xl text-muted-foreground"
                    >
                      No Phone
                    </Button>
                  )}

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const studentToEdit = inspectStudent;
                      setInspectStudent(null);
                      handleOpenEditStudent(studentToEdit);
                    }}
                    className="h-9 text-xs rounded-xl gap-1.5 font-bold col-span-2 sm:col-span-1"
                  >
                    <Edit2 className="h-3.5 w-3.5" /> Edit Details
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── STICKY MOBILE BOTTOM ACTION DOCK (PHONE SCREENS) ───────────────── */}
      <div className="fixed bottom-0 left-0 right-0 z-40 md:hidden bg-card/90 backdrop-blur-xl border-t border-slate-200/80 dark:border-white/10 px-2 py-1.5 shadow-[0_-8px_30px_rgba(0,0,0,0.12)] safe-area-bottom">
        <div className="flex items-center justify-around max-w-md mx-auto">
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={`flex flex-col items-center justify-center flex-1 py-1 rounded-xl transition-all ${
              activeTab === 'overview' ? 'text-primary font-black bg-primary/10' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <LayoutDashboard className="h-4 w-4" />
            <span className="text-[10px] mt-0.5 tracking-tight">Dashboard</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('daily')}
            className={`flex flex-col items-center justify-center flex-1 py-1 rounded-xl transition-all relative ${
              activeTab === 'daily' ? 'text-primary font-black bg-primary/10' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <CheckSquare className="h-4 w-4" />
            <span className="text-[10px] mt-0.5 tracking-tight">Roll Call</span>
            {stats.unmarked > 0 && (
              <span className="absolute top-1 right-3 h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('absentees')}
            className={`flex flex-col items-center justify-center flex-1 py-1 rounded-xl transition-all relative ${
              activeTab === 'absentees' ? 'text-rose-600 font-black bg-rose-500/10' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <UserX className="h-4 w-4" />
            <span className="text-[10px] mt-0.5 tracking-tight">Absentees</span>
            {stats.absent + stats.unmarked > 0 && (
              <span className="absolute top-1 right-3 h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('notifications')}
            className={`flex flex-col items-center justify-center flex-1 py-1 rounded-xl transition-all ${
              activeTab === 'notifications' ? 'text-indigo-600 font-black bg-indigo-500/10' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Send className="h-4 w-4" />
            <span className="text-[10px] mt-0.5 tracking-tight">Notices</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('register')}
            className={`flex flex-col items-center justify-center flex-1 py-1 rounded-xl transition-all ${
              activeTab === 'register' ? 'text-blue-600 font-black bg-blue-500/10' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Calendar className="h-4 w-4" />
            <span className="text-[10px] mt-0.5 tracking-tight">Register</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default TeacherAdminWorkspace;
