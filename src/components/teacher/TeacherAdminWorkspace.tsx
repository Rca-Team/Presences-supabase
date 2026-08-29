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
}

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
  const [activeTab, setActiveTab] = useState('register');

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

  // Load complete student roster across attendance_records and profiles
  const loadClassStudents = useCallback(async () => {
    if (!activeClass) return;
    setIsRefreshing(true);
    try {
      const { class: cls, section: sec, category } = activeClass;
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);

      // Fetch from profiles, registered attendance records, face descriptors, and today's attendance logs
      const [profilesRes, registeredAttRes, descriptorsRes, todayAttRes] = await Promise.all([
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
          .select('id, user_id, student_id, student_name, class, section, category, status, timestamp, device_info')
          .gte('timestamp', startOfToday.toISOString())
          .order('timestamp', { ascending: false }),
      ]);

      // Enrolled face descriptor IDs
      const enrolledFaceIds = new Set<string>();
      (descriptorsRes.data || []).forEach((f: any) => {
        if (f.user_id) enrolledFaceIds.add(String(f.user_id).trim().toLowerCase());
        if (f.student_id) enrolledFaceIds.add(String(f.student_id).trim().toLowerCase());
      });

      // Today's attendance status map
      const todayAttMap = new Map<string, { status: 'present' | 'late' | 'absent'; time: string }>();
      const matchingTodayAtt = (todayAttRes.data || []).filter((r: any) => matchesClassAndSection(r, cls, sec));

      matchingTodayAtt.forEach((att: any) => {
        const sName = (att.student_name || '').toLowerCase().trim();
        const uId = att.user_id ? String(att.user_id).trim().toLowerCase() : '';
        const sId = att.student_id ? String(att.student_id).trim().toLowerCase() : '';
        const normalizedStatus = (att.status?.toLowerCase().includes('late') ? 'late' : att.status?.toLowerCase().includes('absent') ? 'absent' : 'present') as 'present' | 'late' | 'absent';
        const timeFormatted = att.timestamp ? new Date(att.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '';

        if (uId && !todayAttMap.has(uId)) todayAttMap.set(uId, { status: normalizedStatus, time: timeFormatted });
        if (sId && !todayAttMap.has(sId)) todayAttMap.set(sId, { status: normalizedStatus, time: timeFormatted });
        if (sName && !todayAttMap.has(sName)) todayAttMap.set(sName, { status: normalizedStatus, time: timeFormatted });
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

  // Filtered student roster
  const filteredStudents = useMemo(() => {
    if (!searchQuery.trim()) return students;
    const q = searchQuery.toLowerCase().trim();
    return students.filter(s =>
      s.name.toLowerCase().includes(q) ||
      (s.roll_number && s.roll_number.toLowerCase().includes(q)) ||
      (s.parent_email && s.parent_email.toLowerCase().includes(q)) ||
      (s.parent_phone && s.parent_phone.includes(q))
    );
  }, [students, searchQuery]);

  // Overall class attendance stats
  const stats = useMemo(() => {
    const total = students.length;
    const present = students.filter(s => s.today_status === 'present').length;
    const late = students.filter(s => s.today_status === 'late').length;
    const absent = students.filter(s => s.today_status === 'absent').length;
    const unmarked = students.filter(s => !s.today_status || s.today_status === 'unmarked').length;
    const attendancePct = total > 0 ? Math.round(((present + late) / total) * 100) : 0;

    return { total, present, late, absent, unmarked, attendancePct };
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

          {/* Main Navigation Tabs (Attendance taking removed, starting with Monthly Register) */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full space-y-4">
            <div className="overflow-x-auto pb-1">
              <TabsList className="bg-muted/50 p-1 rounded-2xl inline-flex w-full sm:w-auto">
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
              </TabsList>
            </div>

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
