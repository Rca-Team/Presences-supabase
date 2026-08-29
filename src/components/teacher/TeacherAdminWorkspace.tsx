import React, { useState, useEffect, useMemo, useRef, useCallback, Suspense } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import {
  GraduationCap,
  Camera,
  Users,
  CheckCircle2,
  XCircle,
  Clock,
  Send,
  FileDown,
  Calendar,
  Search,
  Plus,
  Edit,
  Mail,
  Phone,
  Scan,
  Check,
  Loader2,
  RefreshCw,
  Sparkles,
  AlertTriangle,
  UserCheck,
  Share2,
  ShieldCheck,
  Zap,
  SlidersHorizontal,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useUserRole } from '@/hooks/useUserRole';
import {
  fetchTeacherCategories,
  parseClassSection,
  fetchTeacherPermissions,
  type TeacherPermissions,
  DEFAULT_TEACHER_PERMISSIONS,
} from '@/utils/teacherAccess';
import { lazyWithRetry } from '@/lib/lazyWithRetry';
import { SECTIONS, CLASSES } from '@/constants/schoolConfig';

const AttendanceCapture = lazyWithRetry(() => import('@/components/attendance/AttendanceCapture'), 'tw-face');
const TimetableManager = lazyWithRetry(() => import('@/components/admin/TimetableManager'), 'tw-timetable');
const ClassSectionReport = lazyWithRetry(() => import('@/components/admin/ClassSectionReport'), 'tw-report');

export interface ClassAssignment {
  class: string;
  section: string;
  category: string;
}

export interface ClassStudent {
  id: string;
  user_id: string;
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

interface TeacherAdminWorkspaceProps {
  initialClass?: string;
}

export const TeacherAdminWorkspace: React.FC<TeacherAdminWorkspaceProps> = () => {
  const { toast } = useToast();
  const { userId, role, isAdminOrPrincipal } = useUserRole();
  const [loading, setLoading] = useState(true);
  const [assignments, setAssignments] = useState<ClassAssignment[]>([]);
  const [activeClass, setActiveClass] = useState<ClassAssignment | null>(null);
  const [students, setStudents] = useState<ClassStudent[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('attendance');
  const [attendanceMode, setAttendanceMode] = useState<'face' | 'manual'>('face');

  // Manual Attendance State (studentId -> status)
  const [manualMarks, setManualMarks] = useState<Record<string, 'present' | 'late' | 'absent'>>({});
  const [isSavingAttendance, setIsSavingAttendance] = useState(false);

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

  // Load teacher class assignments and permissions
  const loadTeacherAssignments = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [categories, perms] = await Promise.all([
        fetchTeacherCategories(userId),
        fetchTeacherPermissions(userId),
      ]);
      setPermissions(perms);

      let list: ClassAssignment[] = categories
        .map(c => {
          const parsed = parseClassSection(c);
          return parsed ? { class: parsed.className, section: parsed.section, category: c } : null;
        })
        .filter((c): c is ClassAssignment => Boolean(c));

      // Admin or Principal fallback: show classes if no specific assignments
      if (list.length === 0 && (isAdminOrPrincipal || role === 'admin' || role === 'principal')) {
        list = [
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

  // Load students for active class
  const loadClassStudents = useCallback(async () => {
    if (!activeClass) return;
    setIsRefreshing(true);
    try {
      const { class: cls, section: sec, category } = activeClass;
      const todayStr = new Date().toISOString().slice(0, 10);
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);

      // 1. Fetch profiles matching class and section
      const { data: profileRows, error: profileErr } = await supabase
        .from('profiles')
        .select('*')
        .or(`and(class.eq.${cls},section.eq.${sec}),category.eq.${category}`);

      if (profileErr) throw profileErr;

      // 2. Fetch today's attendance records for this class
      const { data: attendanceRows } = await supabase
        .from('attendance_records')
        .select('id, user_id, student_name, status, timestamp, device_info')
        .or(`and(class.eq.${cls},section.eq.${sec}),category.eq.${category}`)
        .gte('timestamp', startOfToday.toISOString())
        .order('timestamp', { ascending: false });

      // 3. Fetch face descriptor presence
      const { data: faceDescriptors } = await supabase
        .from('face_descriptors')
        .select('user_id, student_id');

      const enrolledFaceIds = new Set<string>();
      (faceDescriptors || []).forEach(f => {
        if (f.user_id) enrolledFaceIds.add(f.user_id);
        if (f.student_id) enrolledFaceIds.add(f.student_id);
      });

      // Build attendance map for today
      const todayAttMap = new Map<string, { status: 'present' | 'late' | 'absent'; time: string }>();
      (attendanceRows || []).forEach(att => {
        const sName = (att.student_name || '').toLowerCase().trim();
        const uId = att.user_id;
        const normalizedStatus = (att.status?.toLowerCase().includes('late') ? 'late' : att.status?.toLowerCase().includes('absent') ? 'absent' : 'present') as 'present' | 'late' | 'absent';
        const timeFormatted = att.timestamp ? new Date(att.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '';

        if (uId && !todayAttMap.has(uId)) {
          todayAttMap.set(uId, { status: normalizedStatus, time: timeFormatted });
        }
        if (sName && !todayAttMap.has(sName)) {
          todayAttMap.set(sName, { status: normalizedStatus, time: timeFormatted });
        }
      });

      // Map to ClassStudent list
      const mapped: ClassStudent[] = (profileRows || []).map(p => {
        const name = p.display_name || p.full_name || p.username || 'Student';
        const attInfo = todayAttMap.get(p.user_id) || todayAttMap.get(p.id) || todayAttMap.get(name.toLowerCase().trim());
        const hasFace = enrolledFaceIds.has(p.user_id) || enrolledFaceIds.has(p.id) || Boolean(p.photo_url || p.avatar_url);

        return {
          id: p.id || p.user_id,
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
        };
      }).sort((a, b) => {
        const rollA = parseInt(a.roll_number || '999', 10);
        const rollB = parseInt(b.roll_number || '999', 10);
        if (!isNaN(rollA) && !isNaN(rollB) && rollA !== rollB) return rollA - rollB;
        return a.name.localeCompare(b.name);
      });

      setStudents(mapped);

      // Prepopulate manual marks
      const initialMarks: Record<string, 'present' | 'late' | 'absent'> = {};
      mapped.forEach(s => {
        if (s.today_status && s.today_status !== 'unmarked') {
          initialMarks[s.id] = s.today_status;
        }
      });
      setManualMarks(initialMarks);
    } catch (err) {
      console.error('Error loading class students:', err);
      toast({ title: 'Failed to load students', description: 'Could not fetch class roster', variant: 'destructive' });
    } finally {
      setIsRefreshing(false);
    }
  }, [activeClass, toast]);

  useEffect(() => {
    if (activeClass) {
      loadClassStudents();
    }
  }, [activeClass, loadClassStudents]);

  // Realtime subscription for class attendance and profiles
  useEffect(() => {
    if (!activeClass) return;
    const channel = supabase
      .channel(`tw-class-${activeClass.category}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_records' }, () => {
        loadClassStudents();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        loadClassStudents();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeClass, loadClassStudents]);

  // Filtered Students
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

  // Stats
  const stats = useMemo(() => {
    const total = students.length;
    const present = students.filter(s => s.today_status === 'present').length;
    const late = students.filter(s => s.today_status === 'late').length;
    const absent = students.filter(s => s.today_status === 'absent').length;
    const unmarked = students.filter(s => !s.today_status || s.today_status === 'unmarked').length;
    const attendancePct = total > 0 ? Math.round(((present + late) / total) * 100) : 0;

    return { total, present, late, absent, unmarked, attendancePct };
  }, [students]);

  // Manual Attendance Helpers
  const handleMarkStudent = (studentId: string, status: 'present' | 'late' | 'absent') => {
    setManualMarks(prev => ({ ...prev, [studentId]: status }));
  };

  const handleMarkAllPresent = () => {
    const allPresent: Record<string, 'present' | 'late' | 'absent'> = {};
    students.forEach(s => {
      allPresent[s.id] = 'present';
    });
    setManualMarks(allPresent);
    toast({ title: 'Marked All Present', description: 'Click Save Attendance to persist' });
  };

  const handleSaveManualAttendance = async () => {
    if (!activeClass || students.length === 0) return;
    setIsSavingAttendance(true);
    try {
      const now = new Date();
      const recordsToInsert = Object.entries(manualMarks).map(([studentId, status]) => {
        const student = students.find(s => s.id === studentId);
        return {
          user_id: student?.user_id || studentId,
          student_name: student?.name || 'Student',
          class: activeClass.class,
          section: activeClass.section,
          category: activeClass.category,
          status,
          verified_by: 'Teacher Manual Roster',
          timestamp: now.toISOString(),
          device_info: {
            method: 'teacher_manual_grid',
            teacher_id: userId,
            marked_at: now.toISOString(),
          },
        };
      });

      if (recordsToInsert.length > 0) {
        const { error } = await supabase.from('attendance_records').insert(recordsToInsert);
        if (error) throw error;
      }

      toast({
        title: '✅ Attendance Saved',
        description: `Updated attendance for ${recordsToInsert.length} students in Class ${activeClass.category}.`,
      });
      loadClassStudents();
    } catch (err: any) {
      toast({ title: 'Save Failed', description: err.message, variant: 'destructive' });
    } finally {
      setIsSavingAttendance(false);
    }
  };

  // Student Edit / Add Handlers
  const handleSaveStudentEdit = async () => {
    if (!editStudent) return;
    setIsSavingStudent(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          display_name: editStudent.name,
          full_name: editStudent.name,
          roll_number: editStudent.roll_number,
          admission_number: editStudent.admission_number,
          parent_name: editStudent.parent_name,
          parent_email: editStudent.parent_email,
          parent_phone: editStudent.parent_phone,
        })
        .eq('id', editStudent.id);

      if (error) throw error;
      toast({ title: 'Student details updated', description: `${editStudent.name}'s info saved successfully.` });
      setIsEditDialogOpen(false);
      loadClassStudents();
    } catch (err: any) {
      toast({ title: 'Update failed', description: err.message, variant: 'destructive' });
    } finally {
      setIsSavingStudent(false);
    }
  };

  const handleAddNewStudent = async () => {
    if (!activeClass || !newStudent.name.trim()) {
      toast({ title: 'Name required', description: 'Please provide the student name', variant: 'destructive' });
      return;
    }
    setIsAddingStudent(true);
    try {
      const { error } = await supabase.from('profiles').insert({
        display_name: newStudent.name.trim(),
        full_name: newStudent.name.trim(),
        class: activeClass.class,
        section: activeClass.section,
        category: activeClass.category,
        roll_number: newStudent.roll_number.trim(),
        admission_number: newStudent.admission_number.trim(),
        parent_name: newStudent.parent_name.trim(),
        parent_email: newStudent.parent_email.trim(),
        parent_phone: newStudent.parent_phone.trim(),
      });

      if (error) throw error;
      toast({ title: 'Student Enrolled', description: `${newStudent.name} added to Class ${activeClass.category}.` });
      setIsAddStudentOpen(false);
      setNewStudent({ name: '', roll_number: '', admission_number: '', parent_name: '', parent_email: '', parent_phone: '' });
      loadClassStudents();
    } catch (err: any) {
      toast({ title: 'Enrollment failed', description: err.message, variant: 'destructive' });
    } finally {
      setIsAddingStudent(false);
    }
  };

  // Notification Handler
  const handleSendClassNotice = async () => {
    if (!notifSubject.trim() || !notifMessage.trim()) {
      toast({ title: 'Missing fields', description: 'Subject and message are required', variant: 'destructive' });
      return;
    }

    let targetStudents = students;
    if (notifTarget === 'absent') {
      targetStudents = students.filter(s => s.today_status === 'absent');
    } else if (notifTarget === 'late') {
      targetStudents = students.filter(s => s.today_status === 'late');
    } else if (notifTarget === 'selected') {
      targetStudents = students.filter(s => selectedStudentIds.includes(s.id));
    }

    const recipients = targetStudents.filter(s => s.parent_email).map(s => s.parent_email!);
    if (recipients.length === 0) {
      toast({
        title: 'No parent emails found',
        description: 'None of the targeted students have parent email addresses saved.',
        variant: 'destructive',
      });
      return;
    }

    setIsSendingNotif(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-notification', {
        body: {
          recipients,
          subject: notifSubject,
          message: notifMessage,
          schoolName: 'PM Shri Kendriya Vidyalaya NFC Vigyan Vihar',
          className: activeClass?.class,
          section: activeClass?.section,
        },
      });

      if (error) throw error;
      toast({
        title: '📢 Notice Sent Successfully',
        description: `Dispatched to ${recipients.length} parent(s) of Class ${activeClass?.category}.`,
      });
      setNotifSubject('');
      setNotifMessage('');
    } catch (err: any) {
      toast({ title: 'Send Failed', description: err.message, variant: 'destructive' });
    } finally {
      setIsSendingNotif(false);
    }
  };

  // Export Class Sheet
  const handleExportClassExcel = () => {
    if (!activeClass || students.length === 0) return;
    const dateStr = new Date().toLocaleDateString('en-IN');
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
      {/* Top Header & Class Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-gradient-to-r from-blue-950/40 via-slate-900/60 to-slate-950 border border-blue-900/30 backdrop-blur-xl">
        <div className="flex items-center gap-3.5">
          <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-blue-600/30">
            <GraduationCap className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg md:text-xl font-bold tracking-tight text-foreground">
                Class Teacher Workspace
              </h1>
              <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/30 text-xs">
                Scoped Class Mode
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              PM Shri Kendriya Vidyalaya NFC Vigyan Vihar
            </p>
          </div>
        </div>

        {/* Assigned Classes Bar */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground font-medium hidden sm:inline">Active Class:</span>
          {assignments.map(a => {
            const isSelected = activeClass?.category === a.category;
            return (
              <Button
                key={a.category}
                size="sm"
                variant={isSelected ? 'default' : 'outline'}
                onClick={() => setActiveClass(a)}
                className={`text-xs h-8 px-3 rounded-xl transition-all ${
                  isSelected
                    ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-600/25 font-semibold'
                    : 'border-border/60 hover:bg-muted/60'
                }`}
              >
                Class {a.class}–{a.section}
              </Button>
            );
          })}
          <Button
            size="sm"
            variant="ghost"
            onClick={loadClassStudents}
            disabled={isRefreshing}
            className="h-8 w-8 p-0 rounded-xl"
            title="Refresh Class Data"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {activeClass && (
        <>
          {/* Class Summary Stats Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <Card className="bg-card/60 backdrop-blur-lg border-border/60">
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
                <TabsTrigger value="attendance" className="gap-1.5 rounded-xl text-xs sm:text-sm py-2 px-3.5">
                  <Camera className="h-4 w-4" /> Take Attendance
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

            {/* TAB 1: ATTENDANCE TAKING (AI Face Model + Manual Roll-call) */}
            <TabsContent value="attendance" className="space-y-4 m-0">
              <div className="flex items-center justify-between gap-3 flex-wrap bg-card/40 p-3 rounded-2xl border">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Mode:</span>
                  <div className="inline-flex rounded-xl bg-muted/60 p-1">
                    <Button
                      size="sm"
                      variant={attendanceMode === 'face' ? 'default' : 'ghost'}
                      onClick={() => setAttendanceMode('face')}
                      className={`text-xs h-7 rounded-lg gap-1.5 ${attendanceMode === 'face' ? 'bg-blue-600 text-white' : ''}`}
                    >
                      <Scan className="h-3.5 w-3.5" /> AI Face Scanner (Scoped)
                    </Button>
                    <Button
                      size="sm"
                      variant={attendanceMode === 'manual' ? 'default' : 'ghost'}
                      onClick={() => setAttendanceMode('manual')}
                      className={`text-xs h-7 rounded-lg gap-1.5 ${attendanceMode === 'manual' ? 'bg-blue-600 text-white' : ''}`}
                    >
                      <UserCheck className="h-3.5 w-3.5" /> 1-Click Roll Call Grid
                    </Button>
                  </div>
                </div>

                {attendanceMode === 'manual' && (
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleMarkAllPresent}
                      className="text-xs h-8 text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/10"
                    >
                      <Check className="h-3.5 w-3.5 mr-1" /> Mark All Present
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleSaveManualAttendance}
                      disabled={isSavingAttendance}
                      className="text-xs h-8 bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      {isSavingAttendance ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1" />}
                      Save Attendance
                    </Button>
                  </div>
                )}
              </div>

              {attendanceMode === 'face' ? (
                <Card className="border-blue-900/30 shadow-xl overflow-hidden">
                  <CardHeader className="bg-gradient-to-r from-blue-950/30 to-slate-900/30 pb-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-base flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-blue-400" />
                          AI Face Attendance — Class {activeClass.class} Section {activeClass.section}
                        </CardTitle>
                        <CardDescription className="text-xs">
                          AI Model is strictly scoped to load only {students.length} students of Class {activeClass.category}
                        </CardDescription>
                      </div>
                      <Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
                        {students.filter(s => s.has_face_descriptor).length}/{students.length} Face Enrolled
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4">
                    <Suspense fallback={<div className="h-[400px] rounded-2xl bg-muted/40 animate-pulse" />}>
                      <AttendanceCapture
                        classScope={{
                          className: activeClass.class,
                          section: activeClass.section,
                        }}
                      />
                    </Suspense>
                  </CardContent>
                </Card>
              ) : (
                /* Manual Roll Call Grid */
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-base">1-Click Classroom Attendance Roster</CardTitle>
                        <CardDescription className="text-xs">
                          Mark student attendance quickly with one-click status pills
                        </CardDescription>
                      </div>
                      <span className="text-xs text-muted-foreground font-mono">
                        {Object.keys(manualMarks).length}/{students.length} marked
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="divide-y divide-border/60 border rounded-xl overflow-hidden max-h-[500px] overflow-y-auto">
                      {students.map((student, idx) => {
                        const currentMark = manualMarks[student.id] || (student.today_status !== 'unmarked' ? student.today_status : undefined);
                        return (
                          <div
                            key={student.id}
                            className="flex items-center justify-between p-3 hover:bg-muted/30 transition-colors gap-3"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <span className="text-xs font-mono text-muted-foreground w-6 text-right">
                                {student.roll_number || idx + 1}
                              </span>
                              <Avatar className="h-9 w-9">
                                {student.photo_url ? <AvatarImage src={student.photo_url} alt={student.name} /> : null}
                                <AvatarFallback className="text-xs">{student.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                              </Avatar>
                              <div className="truncate">
                                <p className="text-sm font-medium truncate">{student.name}</p>
                                <p className="text-xs text-muted-foreground truncate">
                                  {student.parent_phone ? `📞 ${student.parent_phone}` : student.parent_email || 'No contact'}
                                </p>
                              </div>
                            </div>

                            {/* 3-State Toggle Pills */}
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => handleMarkStudent(student.id, 'present')}
                                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                                  currentMark === 'present'
                                    ? 'bg-emerald-600 text-white shadow-sm font-bold'
                                    : 'bg-muted/60 text-muted-foreground hover:bg-emerald-500/10 hover:text-emerald-600'
                                }`}
                              >
                                Present
                              </button>
                              <button
                                type="button"
                                onClick={() => handleMarkStudent(student.id, 'late')}
                                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                                  currentMark === 'late'
                                    ? 'bg-amber-600 text-white shadow-sm font-bold'
                                    : 'bg-muted/60 text-muted-foreground hover:bg-amber-500/10 hover:text-amber-600'
                                }`}
                              >
                                Late
                              </button>
                              <button
                                type="button"
                                onClick={() => handleMarkStudent(student.id, 'absent')}
                                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                                  currentMark === 'absent'
                                    ? 'bg-rose-600 text-white shadow-sm font-bold'
                                    : 'bg-muted/60 text-muted-foreground hover:bg-rose-500/10 hover:text-rose-600'
                                }`}
                              >
                                Absent
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* TAB 2: STUDENT MANAGEMENT (Their Class Only) */}
            <TabsContent value="students" className="space-y-4 m-0">
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Users className="h-4 w-4 text-blue-500" />
                        Class {activeClass.class}–{activeClass.section} Students Roster
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Manage student info, parent contact details, and face registration
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button size="sm" onClick={() => setIsAddStudentOpen(true)} className="gap-1.5 text-xs h-8 bg-blue-600 hover:bg-blue-700 text-white">
                        <Plus className="h-3.5 w-3.5" /> Add Student
                      </Button>
                      <Button size="sm" variant="outline" onClick={handleExportClassExcel} className="gap-1.5 text-xs h-8">
                        <FileDown className="h-3.5 w-3.5" /> Export Excel
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search students by name, roll no, phone or email..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      className="pl-9 text-xs sm:text-sm h-9"
                    />
                  </div>

                  <div className="divide-y border rounded-xl overflow-hidden max-h-[520px] overflow-y-auto">
                    {filteredStudents.length === 0 ? (
                      <p className="text-center py-8 text-xs text-muted-foreground">No students found matching search.</p>
                    ) : (
                      filteredStudents.map((s, i) => (
                        <div key={s.id} className="flex items-center justify-between p-3 hover:bg-muted/30 transition-colors gap-2">
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="text-xs font-mono text-muted-foreground w-6 text-right">
                              {s.roll_number || i + 1}
                            </span>
                            <Avatar className="h-10 w-10 border">
                              {s.photo_url ? <AvatarImage src={s.photo_url} alt={s.name} /> : null}
                              <AvatarFallback className="text-xs font-bold">{s.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-sm font-semibold truncate">{s.name}</p>
                                {s.has_face_descriptor ? (
                                  <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-500 border-emerald-500/30">
                                    Face Enrolled
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-500 border-amber-500/30">
                                    Photo Needed
                                  </Badge>
                                )}
                                {s.today_status && s.today_status !== 'unmarked' && (
                                  <Badge variant="outline" className={`text-[10px] ${
                                    s.today_status === 'present' ? 'bg-emerald-500/10 text-emerald-500' : s.today_status === 'late' ? 'bg-amber-500/10 text-amber-500' : 'bg-rose-500/10 text-rose-500'
                                  }`}>
                                    Today: {s.today_status.toUpperCase()} {s.today_time ? `(${s.today_time})` : ''}
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5 flex-wrap">
                                {s.parent_name && <span>Parent: {s.parent_name}</span>}
                                {s.parent_phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{s.parent_phone}</span>}
                                {s.parent_email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{s.parent_email}</span>}
                              </div>
                            </div>
                          </div>

                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setEditStudent(s);
                              setIsEditDialogOpen(true);
                            }}
                            className="h-8 px-2.5 text-xs"
                          >
                            <Edit className="h-3.5 w-3.5 mr-1" /> Edit
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* TAB 3: PARENT NOTIFICATIONS & CLASS NOTICES */}
            <TabsContent value="notifications" className="space-y-4 m-0">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Send className="h-4 w-4 text-blue-500" />
                    Send Notice to Parents — Class {activeClass.class} Section {activeClass.section}
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Dispatches official notification emails with KVS collaboration branding
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Target selector */}
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold">Target Parents:</Label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant={notifTarget === 'all' ? 'default' : 'outline'}
                        onClick={() => setNotifTarget('all')}
                        className={`text-xs h-8 ${notifTarget === 'all' ? 'bg-blue-600 text-white' : ''}`}
                      >
                        All Parents ({students.length})
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={notifTarget === 'absent' ? 'default' : 'outline'}
                        onClick={() => setNotifTarget('absent')}
                        className={`text-xs h-8 ${notifTarget === 'absent' ? 'bg-rose-600 text-white' : ''}`}
                      >
                        Absent Today ({stats.absent})
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={notifTarget === 'late' ? 'default' : 'outline'}
                        onClick={() => setNotifTarget('late')}
                        className={`text-xs h-8 ${notifTarget === 'late' ? 'bg-amber-600 text-white' : ''}`}
                      >
                        Late Today ({stats.late})
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={notifTarget === 'selected' ? 'default' : 'outline'}
                        onClick={() => setNotifTarget('selected')}
                        className={`text-xs h-8 ${notifTarget === 'selected' ? 'bg-blue-600 text-white' : ''}`}
                      >
                        Selected ({selectedStudentIds.length})
                      </Button>
                    </div>
                  </div>

                  {notifTarget === 'selected' && (
                    <div className="border rounded-xl p-3 max-h-40 overflow-y-auto space-y-1.5 text-xs bg-muted/20">
                      <p className="font-semibold text-xs mb-1">Select students to notify:</p>
                      {students.map(s => {
                        const isChecked = selectedStudentIds.includes(s.id);
                        return (
                          <label key={s.id} className="flex items-center gap-2 cursor-pointer p-1 rounded hover:bg-muted">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {
                                setSelectedStudentIds(prev =>
                                  isChecked ? prev.filter(id => id !== s.id) : [...prev, s.id]
                                );
                              }}
                            />
                            <span>{s.name} ({s.parent_email || 'No email'})</span>
                          </label>
                        );
                      })}
                    </div>
                  )}

                  {/* Quick Presets */}
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Quick Notice Templates:</Label>
                    <div className="flex gap-2 flex-wrap">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="text-xs h-7"
                        onClick={() => {
                          setNotifSubject(`Attendance Notice · Class ${activeClass.category}`);
                          setNotifMessage(`Dear Parent, this is an update regarding today's attendance and class activities for Class ${activeClass.category}. Please ensure timely attendance.`);
                        }}
                      >
                        Daily Attendance Notice
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="text-xs h-7"
                        onClick={() => {
                          setNotifSubject(`Urgent Notice: Absent Today · Class ${activeClass.category}`);
                          setNotifMessage(`Dear Parent, your child was recorded absent in school today. Please verify and contact the class teacher if leave was not applied.`);
                        }}
                      >
                        Absent Alert
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="text-xs h-7"
                        onClick={() => {
                          setNotifSubject(`Class Announcement · Class ${activeClass.category}`);
                          setNotifMessage(`Dear Parent, please note the upcoming class test and homework submission scheduled for this week.`);
                        }}
                      >
                        Class Announcement
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <Label className="text-xs">Subject Line:</Label>
                      <Input
                        placeholder="e.g. Class 10-A Notice: Attendance & Important Update"
                        value={notifSubject}
                        onChange={e => setNotifSubject(e.target.value)}
                        className="text-xs sm:text-sm mt-1"
                      />
                    </div>

                    <div>
                      <Label className="text-xs">Notice Message:</Label>
                      <Textarea
                        placeholder="Write your notice message here to send to parents..."
                        value={notifMessage}
                        onChange={e => setNotifMessage(e.target.value)}
                        rows={4}
                        className="text-xs sm:text-sm mt-1"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end pt-2">
                    <Button
                      onClick={handleSendClassNotice}
                      disabled={isSendingNotif}
                      className="gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold px-6 shadow-lg shadow-blue-600/25"
                    >
                      {isSendingNotif ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      {isSendingNotif ? 'Sending Notice…' : 'Send Notice to Parents'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* TAB 4: CLASS REPORTS & ANALYTICS */}
            <TabsContent value="reports" className="space-y-4 m-0">
              <Suspense fallback={<div className="h-[360px] rounded-2xl bg-muted/40 animate-pulse" />}>
                <ClassSectionReport allowedCategories={[activeClass.category]} />
              </Suspense>
            </TabsContent>

            {/* TAB 5: CLASS TIMETABLE & PLAN */}
            <TabsContent value="timetable" className="space-y-4 m-0">
              <Suspense fallback={<div className="h-[360px] rounded-2xl bg-muted/40 animate-pulse" />}>
                <TimetableManager allowedCategories={[activeClass.category]} />
              </Suspense>
            </TabsContent>
          </Tabs>
        </>
      )}

      {/* Edit Student Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Student Details</DialogTitle>
            <DialogDescription>
              Update student information and parent contact coordinates
            </DialogDescription>
          </DialogHeader>
          {editStudent && (
            <div className="space-y-3 py-2 text-xs sm:text-sm">
              <div>
                <Label className="text-xs">Student Full Name</Label>
                <Input
                  value={editStudent.name}
                  onChange={e => setEditStudent({ ...editStudent, name: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Roll Number</Label>
                  <Input
                    value={editStudent.roll_number || ''}
                    onChange={e => setEditStudent({ ...editStudent, roll_number: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">Admission No</Label>
                  <Input
                    value={editStudent.admission_number || ''}
                    onChange={e => setEditStudent({ ...editStudent, admission_number: e.target.value })}
                    className="mt-1"
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs">Parent / Guardian Name</Label>
                <Input
                  value={editStudent.parent_name || ''}
                  onChange={e => setEditStudent({ ...editStudent, parent_name: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Parent Email (for Auto Attendance Alerts)</Label>
                <Input
                  type="email"
                  value={editStudent.parent_email || ''}
                  onChange={e => setEditStudent({ ...editStudent, parent_email: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Parent Phone Number</Label>
                <Input
                  value={editStudent.parent_phone || ''}
                  onChange={e => setEditStudent({ ...editStudent, parent_phone: e.target.value })}
                  className="mt-1"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setIsEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSaveStudentEdit} disabled={isSavingStudent}>
              {isSavingStudent ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add New Student Dialog */}
      <Dialog open={isAddStudentOpen} onOpenChange={setIsAddStudentOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Student to Class {activeClass?.category}</DialogTitle>
            <DialogDescription>
              Register a new student directly into your class roster
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2 text-xs sm:text-sm">
            <div>
              <Label className="text-xs">Student Full Name *</Label>
              <Input
                placeholder="e.g. Aarav Sharma"
                value={newStudent.name}
                onChange={e => setNewStudent({ ...newStudent, name: e.target.value })}
                className="mt-1"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Roll Number</Label>
                <Input
                  placeholder="e.g. 15"
                  value={newStudent.roll_number}
                  onChange={e => setNewStudent({ ...newStudent, roll_number: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Admission No</Label>
                <Input
                  placeholder="e.g. KV-2026-101"
                  value={newStudent.admission_number}
                  onChange={e => setNewStudent({ ...newStudent, admission_number: e.target.value })}
                  className="mt-1"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">Parent Name</Label>
              <Input
                placeholder="e.g. Rajesh Sharma"
                value={newStudent.parent_name}
                onChange={e => setNewStudent({ ...newStudent, parent_name: e.target.value })}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Parent Email</Label>
              <Input
                type="email"
                placeholder="e.g. parent@example.com"
                value={newStudent.parent_email}
                onChange={e => setNewStudent({ ...newStudent, parent_email: e.target.value })}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Parent Phone</Label>
              <Input
                placeholder="e.g. 9876543210"
                value={newStudent.parent_phone}
                onChange={e => setNewStudent({ ...newStudent, parent_phone: e.target.value })}
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setIsAddStudentOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleAddNewStudent} disabled={isAddingStudent}>
              {isAddingStudent ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
              Enroll Student
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TeacherAdminWorkspace;
