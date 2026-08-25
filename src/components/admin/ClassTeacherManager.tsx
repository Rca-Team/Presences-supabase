import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  GraduationCap, Plus, Trash2, Clock, BookOpen, Save, Loader2, CalendarClock,
  UserCheck, AlertTriangle, ChevronLeft, RefreshCw, Printer,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import FullTimetableManager from '@/components/admin/TimetableManager';
import { useToast } from '@/hooks/use-toast';
import { getCategoryLabel, ALL_CLASS_SECTIONS } from '@/constants/schoolConfig';
import { parseClassSection } from '@/utils/teacherAccess';
import { format } from 'date-fns';

interface TeacherOption {
  id: string;
  user_id?: string;
  name: string;
  employee_id: string;
}

interface Subject {
  id: string;
  name: string;
  short_name: string | null;
  teacher_id?: string | null;
  class?: string | null;
  section?: string | null;
}

interface ClassTeacher {
  id: string;
  category: string;
  teacher_record_id: string;
  teacher_name: string;
  role: string;
  subject_id: string | null;
}

interface PeriodTiming {
  id: string;
  period_number: number;
  start_time: string;
  end_time: string;
  is_break: boolean;
  label: string | null;
}

interface TimetableEntry {
  id?: string;
  category?: string;
  class?: string | null;
  section?: string | null;
  day_of_week: number;
  period_number: number;
  subject_id: string | null;
  teacher_record_id: string;
  teacher_name: string;
}

interface Substitution {
  id: string;
  date: string;
  category?: string;
  class?: string | null;
  section?: string | null;
  period_number: number;
  absent_teacher_name: string;
  substitute_teacher_name: string;
  status: string;
  auto_assigned: boolean;
}

const DAY_NAMES = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_SHORT = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface Props {
  category: string;
  onBack: () => void;
}

const ClassTeacherManager: React.FC<Props> = ({ category, onBack }) => {
  const { toast } = useToast();
  const parsedClassSection = useMemo(() => parseClassSection(category), [category]);
  const [teachers, setTeachers] = useState<TeacherOption[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [classTeachers, setClassTeachers] = useState<ClassTeacher[]>([]);
  const [periodTimings, setPeriodTimings] = useState<PeriodTiming[]>([]);
  const [timetable, setTimetable] = useState<TimetableEntry[]>([]);
  const [substitutions, setSubstitutions] = useState<Substitution[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [newSubjectName, setNewSubjectName] = useState('');
  const [newSubjectShort, setNewSubjectShort] = useState('');
  const [addSubjectOpen, setAddSubjectOpen] = useState(false);
  const [fullEditorOpen, setFullEditorOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState(1);
  const [draftAssignments, setDraftAssignments] = useState<Record<string, { teacherId?: string; subjectId?: string }>>({});

  const slotKey = (day: number, period: number) => `${day}-${period}`;

  const mapTimetableRow = (row: any): TimetableEntry => {
    const metadata = (row.metadata || {}) as any;
    return {
      id: row.id,
      category: row.category || metadata.category || category,
      class: row.class ?? metadata.class ?? null,
      section: row.section ?? metadata.section ?? null,
      day_of_week: Number(row.day_of_week ?? metadata.day_of_week ?? 0),
      period_number: Number(row.period_number ?? metadata.period_number ?? 0),
      subject_id: row.subject_id ?? metadata.subject_id ?? null,
      teacher_record_id: row.teacher_id || row.teacher_record_id || metadata.teacher_id || metadata.teacher_record_id || '',
      teacher_name: row.teacher_name || metadata.teacher_name || 'Unknown',
    };
  };

  const mapSubstitutionRow = (row: any): Substitution => {
    const metadata = (row.metadata || {}) as any;
    return {
      id: row.id,
      date: row.date,
      category: row.category || metadata.category || category,
      class: row.class ?? metadata.class ?? null,
      section: row.section ?? metadata.section ?? null,
      period_number: Number(row.period_number ?? metadata.period_number ?? 0),
      absent_teacher_name: row.absent_teacher_name || metadata.absent_teacher_name || 'Unknown',
      substitute_teacher_name: row.substitute_teacher_name || metadata.substitute_teacher_name || 'Unassigned',
      status: row.status || 'pending',
      auto_assigned: Boolean(row.auto_assigned ?? metadata.auto_assigned ?? false),
    };
  };

  const loadAll = useCallback(async () => {
    setIsLoading(true);
    try {
      const [teacherRes, subjectRes, ptRes] = await Promise.all([
        supabase.from('attendance_records').select('id, user_id, device_info').eq('status', 'registered').eq('category', 'Teacher'),
        supabase.from('subjects').select('*').order('name'),
        supabase.from('period_timings').select('*').order('period_number'),
      ]);

      const todayDate = format(new Date(), 'yyyy-MM-dd');

      let timetableRows: any[] = [];
      if (parsedClassSection) {
        const modernTimetable = await supabase
          .from('timetable')
          .select('*')
          .eq('class', parsedClassSection.className)
          .eq('section', parsedClassSection.section);

        if (!modernTimetable.error && Array.isArray(modernTimetable.data) && modernTimetable.data.length > 0) {
          timetableRows = modernTimetable.data;
        } else {
          const legacyTimetable = await supabase.from('timetable').select('*').eq('category', category);
          timetableRows = legacyTimetable.data || [];
        }
      } else {
        const legacyTimetable = await supabase.from('timetable').select('*').eq('category', category);
        timetableRows = legacyTimetable.data || [];
      }

      let substitutionRows: any[] = [];
      if (parsedClassSection) {
        const modernSubs = await supabase
          .from('substitutions')
          .select('*')
          .eq('class', parsedClassSection.className)
          .eq('section', parsedClassSection.section)
          .eq('date', todayDate);

        if (!modernSubs.error && Array.isArray(modernSubs.data)) {
          substitutionRows = modernSubs.data;
        } else {
          const legacySubs = await supabase
            .from('substitutions')
            .select('*')
            .eq('category', category)
            .eq('date', todayDate);
          substitutionRows = legacySubs.data || [];
        }
      } else {
        const legacySubs = await supabase
          .from('substitutions')
          .select('*')
          .eq('category', category)
          .eq('date', todayDate);
        substitutionRows = legacySubs.data || [];
      }

      let ctData: any[] = [];
      if (parsedClassSection) {
        const modernRes = await supabase
          .from('class_teachers')
          .select('*')
          .eq('class', parsedClassSection.className)
          .eq('section', parsedClassSection.section);

        if (!modernRes.error) {
          ctData = modernRes.data || [];
        } else {
          const legacyRes = await supabase.from('class_teachers').select('*').eq('category', category);
          ctData = legacyRes.data || [];
        }
      } else {
        const legacyRes = await supabase.from('class_teachers').select('*').eq('category', category);
        ctData = legacyRes.data || [];
      }

      if (teacherRes.data) {
        const t: TeacherOption[] = teacherRes.data.map(r => {
          const di = r.device_info as any;
          return {
            id: r.user_id || r.id,
            user_id: r.user_id || undefined,
            name: di?.metadata?.name || 'Unknown',
            employee_id: di?.metadata?.employee_id || 'N/A',
          };
        }).filter(t => t.name !== 'Unknown');
        setTeachers(t);

        const subjectList: Subject[] = (subjectRes.data || []).map((s: any) => ({
          id: s.id,
          name: s.name,
          short_name: s.short_name ?? s.code ?? null,
          teacher_id: s.teacher_id ?? null,
          class: s.class ?? null,
          section: s.section ?? null,
        }));
        setSubjects(subjectList);

        const teacherNameById = new Map(t.map(row => [row.id, row.name]));

        const mapLegacyRows = (rows: any[]) =>
          (rows || []).map((row: any) => {
            const metadata = (row.metadata || {}) as any;
            return {
              id: row.id,
              category: row.category || category,
              teacher_record_id: row.teacher_record_id || row.teacher_id || metadata.teacher_record_id || '',
              teacher_name: row.teacher_name || metadata.teacher_name || 'Unknown',
              role: row.role || metadata.role || 'class_teacher',
              subject_id: row.subject_id || metadata.subject_id || null,
            } as ClassTeacher;
          });

        let assignmentRows: ClassTeacher[] = [];
        if (parsedClassSection) {
          const modernRes = await supabase
            .from('class_teachers')
            .select('*')
            .eq('class', parsedClassSection.className)
            .eq('section', parsedClassSection.section);

          if (!modernRes.error) {
            assignmentRows = (modernRes.data || []).map((row: any) => ({
              id: row.id,
              category,
              teacher_record_id: row.teacher_id || '',
              teacher_name: row.teacher_name || teacherNameById.get(row.teacher_id) || 'Unknown',
              role: 'class_teacher',
              subject_id: null,
            }));

            const modernSubjectTeachers: ClassTeacher[] = subjectList
              .filter((s) =>
                s.teacher_id &&
                s.class === parsedClassSection.className &&
                s.section === parsedClassSection.section
              )
              .map((s) => ({
                id: `subject-${s.id}`,
                category,
                teacher_record_id: s.teacher_id!,
                teacher_name: teacherNameById.get(s.teacher_id!) || 'Unknown',
                role: 'subject_teacher',
                subject_id: s.id,
              }));

            assignmentRows = [...assignmentRows, ...modernSubjectTeachers];
          } else {
            const legacyRes = await supabase.from('class_teachers').select('*').eq('category', category);
            assignmentRows = mapLegacyRows(legacyRes.data || []);
          }
        } else {
          const legacyRes = await supabase.from('class_teachers').select('*').eq('category', category);
          assignmentRows = mapLegacyRows(legacyRes.data || []);
        }

        setClassTeachers(assignmentRows);
      }

      if (ptRes.data) {
        const mappedPeriods = (ptRes.data as any[]).map((row: any, idx: number) => {
          const metadata = (row.metadata || {}) as any;
          const inferredPeriodNumber = Number(
            row.period_number ?? metadata.period_number ?? idx + 1
          );
          const inferredLabel = row.label ?? row.period_name ?? `Period ${inferredPeriodNumber}`;
          const inferredBreak =
            Boolean(row.is_break) ||
            Boolean(metadata.is_break) ||
            /lunch|break/i.test(String(inferredLabel));

          return {
            period_number: inferredPeriodNumber,
            start_time: row.start_time,
            end_time: row.end_time,
            is_break: inferredBreak,
            label: inferredLabel,
          } as PeriodTiming;
        });

        mappedPeriods.sort((a, b) => a.period_number - b.period_number);
        setPeriodTimings(mappedPeriods);
      }
      setTimetable((timetableRows || []).map(mapTimetableRow).filter((row) => row.day_of_week > 0 && row.period_number > 0));
      setSubstitutions((substitutionRows || []).map(mapSubstitutionRow).filter((row) => row.period_number > 0));
      setDraftAssignments({});
    } catch (e) {
      console.error(e);
      toast({ title: 'Error', description: 'Failed to load data', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [category, parsedClassSection, toast]);

  useEffect(() => { loadAll(); }, [loadAll]);

  useEffect(() => {
    const channel = supabase
      .channel(`class-timetable-${category}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'class_teachers' }, () => loadAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'subjects' }, () => loadAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'timetable' }, () => loadAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'substitutions' }, () => loadAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'period_timings' }, () => loadAll())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [category, loadAll]);

  const teachingPeriods = useMemo(() =>
    periodTimings.filter(p => !p.is_break), [periodTimings]
  );

  // --- Subjects ---
  const addSubject = async () => {
    if (!newSubjectName.trim()) return;
    const { error } = await supabase.from('subjects').insert({
      name: newSubjectName.trim(),
      code: newSubjectShort.trim() || null,
    });
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    setNewSubjectName('');
    setNewSubjectShort('');
    setAddSubjectOpen(false);
    loadAll();
    toast({ title: 'Subject Added' });
  };

  const setupDefaultTimetableStructure = async () => {
    setIsSaving(true);
    try {
      const defaultPeriods = [
        { n: 1, start: '08:00', end: '08:45' },
        { n: 2, start: '08:45', end: '09:30' },
        { n: 3, start: '09:30', end: '10:15' },
        { n: 4, start: '10:15', end: '11:00' },
        { n: 5, start: '11:45', end: '12:30' },
        { n: 6, start: '12:30', end: '13:15' },
        { n: 7, start: '13:15', end: '14:00' },
        { n: 8, start: '14:00', end: '14:45' },
      ];

      // Modern per-class shape
      if (parsedClassSection) {
        const modernRows = defaultPeriods.map((p) => ({
          class: parsedClassSection.className,
          section: parsedClassSection.section,
          period_name: `Period ${p.n}`,
          start_time: p.start,
          end_time: p.end,
          metadata: {
            period_number: p.n,
            is_break: false,
            lunch_after_period: 4,
          },
        }));

        const wipeModern = await supabase
          .from('period_timings')
          .delete()
          .eq('class', parsedClassSection.className)
          .eq('section', parsedClassSection.section);

        if (!wipeModern.error) {
          const insertModern = await supabase.from('period_timings').insert(modernRows as any);
          if (!insertModern.error) {
            await loadAll();
            toast({ title: 'Timetable structure ready', description: '6 working days, 8 periods/day, lunch after period 4.' });
            return;
          }
        }
      }

      // Legacy global shape fallback
      const legacyRows = defaultPeriods.map((p) => ({
        period_number: p.n,
        start_time: p.start,
        end_time: p.end,
        is_break: false,
        label: `Period ${p.n}`,
      }));

      const wipeLegacy = await supabase.from('period_timings').delete().gt('period_number', 0);
      if (wipeLegacy.error) {
        toast({ title: 'Error', description: wipeLegacy.error.message, variant: 'destructive' });
        return;
      }

      const insertLegacy = await supabase.from('period_timings').insert(legacyRows as any);
      if (insertLegacy.error) {
        toast({ title: 'Error', description: insertLegacy.error.message, variant: 'destructive' });
        return;
      }

      await loadAll();
      toast({ title: 'Timetable structure ready', description: '6 working days, 8 periods/day, lunch after period 4.' });
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message || 'Failed to setup timetable structure', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  // --- Class/Subject Teacher ---
  const assignTeacher = async (role: string, teacherId: string, subjectId?: string) => {
    const teacher = teachers.find(t => t.id === teacherId);
    if (!teacher) return;

    if (parsedClassSection) {
      if (role === 'subject_teacher') {
        if (!subjectId) {
          toast({ title: 'Subject required', description: 'Select a subject before assigning a subject teacher.', variant: 'destructive' });
          return;
        }

        const { error } = await supabase
          .from('subjects')
          .update({
            teacher_id: teacher.id,
            class: parsedClassSection.className,
            section: parsedClassSection.section,
          })
          .eq('id', subjectId);

        if (error) {
          toast({ title: 'Error', description: error.message, variant: 'destructive' });
          return;
        }

        loadAll();
        toast({ title: 'Subject Teacher Assigned' });
        return;
      }

      const removeExisting = await supabase
        .from('class_teachers')
        .delete()
        .eq('class', parsedClassSection.className)
        .eq('section', parsedClassSection.section);

      if (removeExisting.error) {
        toast({ title: 'Error', description: removeExisting.error.message, variant: 'destructive' });
        return;
      }

      const payload = {
        class: parsedClassSection.className,
        section: parsedClassSection.section,
        teacher_id: teacher.id,
        teacher_name: teacher.name,
        metadata: {
          role,
          subject_id: subjectId || null,
        },
      } as any;

      const { error } = await supabase.from('class_teachers').insert(payload);

      if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    } else {
      // Remove existing assignment for this role+subject on legacy schema
      if (role === 'class_teacher') {
        await supabase.from('class_teachers').delete().eq('category', category).eq('role', 'class_teacher');
      }

      const { error } = await supabase.from('class_teachers').insert({
        category,
        teacher_record_id: teacher.id,
        teacher_name: teacher.name,
        role,
        subject_id: subjectId || null,
      });
      if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    }

    loadAll();
    toast({ title: `${role === 'class_teacher' ? 'Class' : 'Subject'} Teacher Assigned` });
  };

  const removeTeacher = async (id: string) => {
    if (id.startsWith('subject-')) {
      const subjectId = id.replace('subject-', '');
      await supabase.from('subjects').update({ teacher_id: null }).eq('id', subjectId);
      loadAll();
      return;
    }

    await supabase.from('class_teachers').delete().eq('id', id);
    loadAll();
  };

  // --- Timetable ---
  const setTimetableEntry = async (dayOfWeek: number, periodNumber: number, teacherId: string, subjectId: string | null) => {
    const teacher = teachers.find(t => t.id === teacherId);
    if (!teacher) return;

    if (!subjectId) {
      toast({
        title: 'Subject required',
        description: 'Choose both subject and teacher before assigning a period.',
        variant: 'destructive',
      });
      return;
    }

    const { data: conflicts } = await supabase
      .from('timetable')
      .select('*')
      .eq('day_of_week', dayOfWeek)
      .eq('period_number', periodNumber);

    const hasConflict = (conflicts || []).some((row: any) => {
      const rowTeacherId = row.teacher_id || row.teacher_record_id || row.metadata?.teacher_id || row.metadata?.teacher_record_id;
      if (rowTeacherId !== teacher.id) return false;
      if (parsedClassSection) {
        return row.class !== parsedClassSection.className || row.section !== parsedClassSection.section;
      }
      return row.category !== category;
    });
    if (hasConflict) {
      toast({
        title: 'Teacher already busy',
        description: `${teacher.name} is already assigned in another class for this period.`,
        variant: 'destructive',
      });
      return;
    }

    let error: any = null;
    if (parsedClassSection) {
      const wipeRes = await supabase
        .from('timetable')
        .delete()
        .eq('class', parsedClassSection.className)
        .eq('section', parsedClassSection.section)
        .eq('day_of_week', dayOfWeek)
        .eq('period_number', periodNumber);

      if (wipeRes.error) {
        const legacyWipeRes = await supabase
          .from('timetable')
          .delete()
          .eq('category', category)
          .eq('day_of_week', dayOfWeek)
          .eq('period_number', periodNumber);
        if (legacyWipeRes.error) {
          toast({ title: 'Error', description: legacyWipeRes.error.message, variant: 'destructive' });
          return;
        }
      }

      const modernInsert = await supabase.from('timetable').insert({
        class: parsedClassSection.className,
        section: parsedClassSection.section,
        day_of_week: dayOfWeek,
        period_number: periodNumber,
        teacher_id: teacher.id,
        teacher_name: teacher.name,
        subject_id: subjectId,
        metadata: {
          category,
          teacher_record_id: teacher.id,
          subject_id: subjectId,
        },
      } as any);

      if (modernInsert.error) {
        const legacyInsert = await supabase.from('timetable').insert({
          category,
          day_of_week: dayOfWeek,
          period_number: periodNumber,
          teacher_record_id: teacher.id,
          teacher_name: teacher.name,
          subject_id: subjectId,
        } as any);
        error = legacyInsert.error;
      }
    } else {
      const legacyUpsert = await supabase.from('timetable').upsert({
        category,
        day_of_week: dayOfWeek,
        period_number: periodNumber,
        teacher_record_id: teacher.id,
        teacher_name: teacher.name,
        subject_id: subjectId,
      } as any, { onConflict: 'category,day_of_week,period_number' });
      error = legacyUpsert.error;
    }

    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    const key = slotKey(dayOfWeek, periodNumber);
    setDraftAssignments((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    loadAll();
  };

  const removeTimetableEntry = async (dayOfWeek: number, periodNumber: number) => {
    if (parsedClassSection) {
      const modernDelete = await supabase.from('timetable').delete()
        .eq('class', parsedClassSection.className)
        .eq('section', parsedClassSection.section)
        .eq('day_of_week', dayOfWeek)
        .eq('period_number', periodNumber);

      if (modernDelete.error) {
        await supabase.from('timetable').delete()
          .eq('category', category)
          .eq('day_of_week', dayOfWeek)
          .eq('period_number', periodNumber);
      }
    } else {
      await supabase.from('timetable').delete()
        .eq('category', category)
        .eq('day_of_week', dayOfWeek)
        .eq('period_number', periodNumber);
    }
    loadAll();
  };

  // --- Auto Substitution ---
  const findSubstitutes = async () => {
    setIsSaving(true);
    try {
      const today = format(new Date(), 'yyyy-MM-dd');
      const dayOfWeek = new Date().getDay(); // 0=Sun, 1=Mon...
      if (dayOfWeek === 0) { toast({ title: 'Sunday', description: 'No classes today.' }); setIsSaving(false); return; }

      // Get today's timetable for this class
      const todayTimetable = timetable.filter(t => t.day_of_week === dayOfWeek);
      if (todayTimetable.length === 0) { toast({ title: 'No timetable', description: 'No timetable set for today.' }); setIsSaving(false); return; }

      // Check which teachers are absent today (no attendance record)
      const { data: attendanceToday } = await supabase
        .from('attendance_records')
        .select('user_id, device_info')
        .eq('category', 'Teacher')
        .in('status', ['present', 'late'])
        .gte('timestamp', `${today}T00:00:00`)
        .lte('timestamp', `${today}T23:59:59`);

      const presentTeacherIds = new Set<string>();
      (attendanceToday || []).forEach(r => {
        const empId = (r.device_info as any)?.metadata?.employee_id;
        const userId = r.user_id;
        if (userId) presentTeacherIds.add(userId);
        if (empId) presentTeacherIds.add(empId);
      });

      const resolveTeacherId = (row: any): string | null =>
        row?.teacher_id || row?.teacher_record_id || row?.metadata?.teacher_id || row?.metadata?.teacher_record_id || null;

      // Get ALL timetable entries for today (all classes) to know who's busy
      const { data: allTimetableToday } = await supabase
        .from('timetable')
        .select('*')
        .eq('day_of_week', dayOfWeek);

      // Get existing substitutions for today
      const { data: existingSubs } = await supabase
        .from('substitutions')
        .select('*')
        .eq('date', today);

      const busyByPeriod = new Map<number, Set<string>>();
      (allTimetableToday || []).forEach((entry: any) => {
        if (!busyByPeriod.has(entry.period_number)) busyByPeriod.set(entry.period_number, new Set());
        const teacherId = resolveTeacherId(entry);
        if (teacherId) busyByPeriod.get(entry.period_number)!.add(teacherId);
      });
      // Also mark substitutes as busy
      (existingSubs || []).forEach((sub: any) => {
        if (!busyByPeriod.has(sub.period_number)) busyByPeriod.set(sub.period_number, new Set());
        busyByPeriod.get(sub.period_number)!.add(sub.substitute_teacher_id);
      });

      let assignedCount = 0;
      for (const entry of todayTimetable) {
        const originalTeacherId = resolveTeacherId(entry);
        if (!originalTeacherId) continue;

        const isPresent = presentTeacherIds.has(originalTeacherId);
        if (isPresent) continue;

        // Check if substitution already exists
        const alreadyAssigned = (existingSubs || []).some((s: any) => {
          const sPeriod = Number(s.period_number ?? s.metadata?.period_number ?? 0);
          if (sPeriod !== entry.period_number) return false;
          if (parsedClassSection) return s.class === parsedClassSection.className && s.section === parsedClassSection.section;
          return s.category === category;
        });
        if (alreadyAssigned) continue;

        // Find a free teacher for this period
        const busyThisPeriod = busyByPeriod.get(entry.period_number) || new Set();
        const freeTeacher = teachers.find(t =>
          presentTeacherIds.has(t.id) && !busyThisPeriod.has(t.id) && t.id !== originalTeacherId
        );

        if (freeTeacher) {
          const subjectName = subjects.find(s => s.id === entry.subject_id)?.name || 'Class';

          let substitutionError: any = null;
          if (parsedClassSection) {
            const modernInsert = await supabase.from('substitutions').insert({
              date: today,
              class: parsedClassSection.className,
              section: parsedClassSection.section,
              subject: subjectName,
                original_teacher_id: originalTeacherId,
              substitute_teacher_id: freeTeacher.id,
              status: 'assigned',
              notes: `Auto substitution for period ${entry.period_number}`,
              metadata: {
                category,
                period_number: entry.period_number,
                  absent_teacher_id: originalTeacherId,
                absent_teacher_name: entry.teacher_name,
                substitute_teacher_name: freeTeacher.name,
                subject_id: entry.subject_id,
                auto_assigned: true,
              },
            } as any);

            if (modernInsert.error) {
              const legacyInsert = await supabase.from('substitutions').insert({
                date: today,
                category,
                period_number: entry.period_number,
                absent_teacher_id: originalTeacherId,
                absent_teacher_name: entry.teacher_name,
                substitute_teacher_id: freeTeacher.id,
                substitute_teacher_name: freeTeacher.name,
                subject_id: entry.subject_id,
                auto_assigned: true,
                status: 'assigned',
              } as any);
              substitutionError = legacyInsert.error;
            }
          } else {
            const legacyInsert = await supabase.from('substitutions').insert({
              date: today,
              category,
              period_number: entry.period_number,
              absent_teacher_id: entry.teacher_record_id,
              absent_teacher_name: entry.teacher_name,
              substitute_teacher_id: freeTeacher.id,
              substitute_teacher_name: freeTeacher.name,
              subject_id: entry.subject_id,
              auto_assigned: true,
              status: 'assigned',
            } as any);
            substitutionError = legacyInsert.error;
          }

          if (substitutionError) {
            console.error('Failed to insert substitution:', substitutionError);
            continue;
          }

          // Send in-app notification to substitute teacher
          const periodInfo = periodTimings.find(p => p.period_number === entry.period_number);
          const timeStr = periodInfo ? `${periodInfo.start_time}–${periodInfo.end_time}` : `Period ${entry.period_number}`;
          if (freeTeacher.user_id || freeTeacher.id) {
            await supabase.from('notifications').insert({
              user_id: freeTeacher.user_id || freeTeacher.id,
              title: `📋 Substitution Assignment`,
              message: `You have been assigned to cover ${subjectName} for ${getCategoryLabel(category)} during ${timeStr} (replacing ${entry.teacher_name}).`,
              type: 'substitution',
            });
          }

          // Mark this teacher as busy for this period
          busyThisPeriod.add(freeTeacher.id);
          busyByPeriod.set(entry.period_number, busyThisPeriod);
          assignedCount++;
        }
      }

      loadAll();
      toast({
        title: assignedCount > 0 ? `${assignedCount} Substitutes Assigned` : 'No Substitutions Needed',
        description: assignedCount > 0
          ? `Auto-assigned ${assignedCount} substitute teacher(s) for today.`
          : 'All scheduled teachers are present or already have substitutes.',
      });
    } catch (e) {
      console.error(e);
      toast({ title: 'Error', description: 'Failed to find substitutes', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  // --- Print Daily Substitution Report (all classes) ---
  const printDailySubstitutionReport = async () => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const dayName = format(new Date(), 'EEEE, MMMM d, yyyy');

    const { data: allSubs } = await supabase
      .from('substitutions')
      .select('*')
      .eq('date', today)
      .order('class')
      .order('section')
      .order('period_number');

    const { data: timings } = await supabase
      .from('period_timings')
      .select('*')
      .order('period_number');

    const timingsMap = new Map((timings || []).map((t: any) => [t.period_number, t]));

    const grouped: Record<string, any[]> = {};
    (allSubs || []).forEach((s: any) => {
      const key = s.category || (s.class && s.section ? `${s.class}-${s.section}` : category);
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(s);
    });

    const totalAbsent = new Set((allSubs || []).map((s: any) => s.absent_teacher_id)).size;
    const totalSubs = (allSubs || []).length;

    const rows = Object.entries(grouped).map(([cat, subs]) =>
      subs.map((s: any, i: number) => {
        const pt = timingsMap.get(s.period_number);
        const time = pt ? `${(pt as any).start_time}\u2013${(pt as any).end_time}` : '';
        return `<tr>
          ${i === 0 ? `<td rowspan="${subs.length}" style="border:1px solid #d1d5db;padding:8px 12px;font-weight:600;vertical-align:top;background:#f9fafb;">${getCategoryLabel(cat)}</td>` : ''}
          <td style="border:1px solid #d1d5db;padding:8px 12px;text-align:center;">Period ${s.period_number}${time ? `<br/><span style="font-size:11px;color:#6b7280;">${time}</span>` : ''}</td>
          <td style="border:1px solid #d1d5db;padding:8px 12px;color:#dc2626;">${s.absent_teacher_name}</td>
          <td style="border:1px solid #d1d5db;padding:8px 12px;color:#16a34a;font-weight:600;">${s.substitute_teacher_name}</td>
          <td style="border:1px solid #d1d5db;padding:8px 12px;text-align:center;">
            <span style="background:${s.auto_assigned ? '#dbeafe' : '#fef3c7'};color:${s.auto_assigned ? '#1d4ed8' : '#92400e'};padding:2px 8px;border-radius:12px;font-size:11px;">${s.auto_assigned ? 'Auto' : 'Manual'}</span>
          </td>
        </tr>`;
      }).join('')
    ).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Daily Substitution Report</title>
    <style>
      @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } @page { margin: 15mm; } }
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #111827; max-width: 900px; margin: 0 auto; padding: 20px; }
      .header { text-align: center; border-bottom: 3px solid #1d4ed8; padding-bottom: 16px; margin-bottom: 24px; }
      .header h1 { font-size: 22px; margin: 0 0 4px; color: #1d4ed8; }
      .header p { margin: 2px 0; color: #6b7280; font-size: 13px; }
      .stats { display: flex; gap: 16px; margin-bottom: 20px; }
      .stat-box { flex: 1; background: #f0f9ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 12px; text-align: center; }
      .stat-box .num { font-size: 28px; font-weight: 700; color: #1d4ed8; }
      .stat-box .lbl { font-size: 11px; color: #6b7280; text-transform: uppercase; }
      table { width: 100%; border-collapse: collapse; margin-top: 8px; }
      th { background: #1d4ed8; color: white; padding: 10px 12px; text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
      .footer { text-align: center; margin-top: 30px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #9ca3af; }
    </style></head><body>
      <div class="header">
        <h1>Daily Substitution Report</h1>
        <p><strong>${dayName}</strong></p>
        <p>Generated at ${format(new Date(), 'hh:mm a')}</p>
      </div>
      <div class="stats">
        <div class="stat-box"><div class="num">${totalAbsent}</div><div class="lbl">Absent Teachers</div></div>
        <div class="stat-box"><div class="num">${totalSubs}</div><div class="lbl">Substitutions</div></div>
        <div class="stat-box"><div class="num">${Object.keys(grouped).length}</div><div class="lbl">Classes Affected</div></div>
      </div>
      ${totalSubs === 0 ? '<div style="text-align:center;padding:40px;color:#6b7280;">All teachers are present today. No substitutions needed.</div>' : `
      <table>
        <thead><tr><th>Class</th><th style="text-align:center;">Period</th><th>Absent Teacher</th><th>Substitute</th><th style="text-align:center;">Type</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`}
      <div class="footer">School Attendance System &bull; Substitution Report &bull; ${dayName}</div>
    </body></html>`;

    const w = window.open('', '_blank', 'width=900,height=700');
    if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 500); }
  };

  const classTeacher = classTeachers.find(ct => ct.role === 'class_teacher');
  const subjectTeacherList = classTeachers.filter(ct => ct.role === 'subject_teacher');

  const getTimetableEntry = (day: number, period: number) =>
    timetable.find(t => t.day_of_week === day && t.period_number === period);

  const getSubjectName = (id: string | null) => {
    if (!id) return '—';
    return subjects.find(s => s.id === id)?.short_name || subjects.find(s => s.id === id)?.name || '—';
  };

  if (isLoading) {
    return <div className="flex items-center justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" onClick={onBack}><ChevronLeft className="h-4 w-4" /></Button>
        <div>
          <h2 className="text-xl font-semibold">{getCategoryLabel(category)} — Teacher & Timetable</h2>
          <p className="text-sm text-muted-foreground">Assign teachers and manage class timetable</p>
        </div>
      </div>

      <Tabs defaultValue="teachers" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="teachers" className="text-xs sm:text-sm"><GraduationCap className="w-4 h-4 mr-1.5 hidden sm:inline" />Teachers</TabsTrigger>
          <TabsTrigger value="timetable" className="text-xs sm:text-sm"><CalendarClock className="w-4 h-4 mr-1.5 hidden sm:inline" />Timetable</TabsTrigger>
          <TabsTrigger value="substitution" className="text-xs sm:text-sm"><UserCheck className="w-4 h-4 mr-1.5 hidden sm:inline" />Substitution</TabsTrigger>
        </TabsList>

        {/* ====== TEACHERS TAB ====== */}
        <TabsContent value="teachers" className="space-y-6 mt-4">
          {/* Class Teacher */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><GraduationCap className="w-4 h-4 text-primary" />Class Teacher</CardTitle>
            </CardHeader>
            <CardContent>
              {classTeacher ? (
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div>
                    <p className="font-medium">{classTeacher.teacher_name}</p>
                    <Badge variant="secondary" className="mt-1">Class Teacher</Badge>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => removeTeacher(classTeacher.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                </div>
              ) : (
                <Select onValueChange={(val) => assignTeacher('class_teacher', val)}>
                  <SelectTrigger><SelectValue placeholder="Select class teacher..." /></SelectTrigger>
                  <SelectContent>
                    {teachers.map(t => (
                      <SelectItem key={t.id} value={t.id}>{t.name} ({t.employee_id})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </CardContent>
          </Card>

          {/* Subject Teachers */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2"><BookOpen className="w-4 h-4 text-primary" />Subject Teachers</CardTitle>
                <Dialog open={addSubjectOpen} onOpenChange={setAddSubjectOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm"><Plus className="w-4 h-4 mr-1" />Add Subject</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>Add New Subject</DialogTitle></DialogHeader>
                    <div className="space-y-3">
                      <div><Label>Subject Name</Label><Input value={newSubjectName} onChange={e => setNewSubjectName(e.target.value)} placeholder="e.g. Mathematics" className="mt-1" /></div>
                      <div><Label>Short Name</Label><Input value={newSubjectShort} onChange={e => setNewSubjectShort(e.target.value)} placeholder="e.g. Math" className="mt-1" /></div>
                      <Button onClick={addSubject} className="w-full"><Plus className="w-4 h-4 mr-2" />Add Subject</Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {subjectTeacherList.map(st => (
                <div key={st.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div>
                    <p className="font-medium">{st.teacher_name}</p>
                    <Badge variant="outline" className="mt-1">{getSubjectName(st.subject_id)}</Badge>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => removeTeacher(st.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                </div>
              ))}

              {subjects.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t">
                  {subjects.map(subject => {
                    const assigned = subjectTeacherList.find(st => st.subject_id === subject.id);
                    if (assigned) return null;
                    return (
                      <div key={subject.id} className="space-y-1.5">
                        <Label className="text-xs">{subject.name}</Label>
                        <Select onValueChange={(val) => assignTeacher('subject_teacher', val, subject.id)}>
                          <SelectTrigger className="h-9"><SelectValue placeholder="Assign teacher..." /></SelectTrigger>
                          <SelectContent>
                            {teachers.map(t => (
                              <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    );
                  })}
                </div>
              )}

              {subjects.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">No subjects added yet. Add subjects first to assign teachers.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ====== TIMETABLE TAB ====== */}
        <TabsContent value="timetable" className="space-y-4 mt-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-xs text-muted-foreground">Working days: Mon-Sat • 8 periods/day • Lunch after period 4</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={setupDefaultTimetableStructure} disabled={isSaving}>
                {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Setup Structure
              </Button>
              <Dialog open={fullEditorOpen} onOpenChange={setFullEditorOpen}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <CalendarClock className="w-4 h-4 mr-2" />
                    Open Full Editor
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-6xl w-[95vw] max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Full Timetable Editor — {getCategoryLabel(category)}</DialogTitle>
                  </DialogHeader>
                  <FullTimetableManager allowedCategories={[category]} />
                </DialogContent>
              </Dialog>
            </div>
          </div>

          {/* Day selector */}
          <div className="flex gap-1.5 overflow-x-auto pb-2">
            {[1, 2, 3, 4, 5, 6].map(day => (
              <Button
                key={day}
                variant={selectedDay === day ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedDay(day)}
                className="whitespace-nowrap"
              >
                {DAY_SHORT[day]}
              </Button>
            ))}
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{DAY_NAMES[selectedDay]} Timetable</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-20">Period</TableHead>
                      <TableHead className="w-28">Time</TableHead>
                      <TableHead>Subject</TableHead>
                      <TableHead>Teacher</TableHead>
                      <TableHead className="w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {periodTimings.map((pt, idx) => {
                      const shouldShowLunchBreakRow = !pt.is_break && idx === 4;

                      return (
                        <React.Fragment key={pt.period_number}>
                          {shouldShowLunchBreakRow && (
                            <TableRow className="bg-muted/30">
                              <TableCell colSpan={5} className="text-center text-sm text-muted-foreground font-medium py-2">
                                ☕ Lunch Break (after Period 4)
                              </TableCell>
                            </TableRow>
                          )}

                          {pt.is_break ? (
                            <TableRow className="bg-muted/30">
                              <TableCell colSpan={5} className="text-center text-sm text-muted-foreground font-medium py-2">
                                ☕ {pt.label || 'Break'} ({pt.start_time.slice(0, 5)} - {pt.end_time.slice(0, 5)})
                              </TableCell>
                            </TableRow>
                          ) : (
                            (() => {
                              const entry = getTimetableEntry(selectedDay, pt.period_number);
                              return (
                                <TableRow>
                                  <TableCell className="font-medium">{pt.label || `P${pt.period_number}`}</TableCell>
                                  <TableCell className="text-xs text-muted-foreground">{pt.start_time.slice(0, 5)} - {pt.end_time.slice(0, 5)}</TableCell>
                                  <TableCell>
                                    {entry ? (
                                      <Badge variant="secondary">{getSubjectName(entry.subject_id)}</Badge>
                                    ) : (
                                      <Select
                                        value={draftAssignments[slotKey(selectedDay, pt.period_number)]?.subjectId || ''}
                                        onValueChange={(val) => {
                                          const key = slotKey(selectedDay, pt.period_number);
                                          setDraftAssignments((prev) => ({
                                            ...prev,
                                            [key]: { ...prev[key], subjectId: val },
                                          }));
                                        }}
                                      >
                                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Subject" /></SelectTrigger>
                                        <SelectContent>
                                          {subjects.map(s => (<SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>))}
                                        </SelectContent>
                                      </Select>
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    {entry ? (
                                      <span className="text-sm">{entry.teacher_name}</span>
                                    ) : (
                                      <Select
                                        value={draftAssignments[slotKey(selectedDay, pt.period_number)]?.teacherId || ''}
                                        onValueChange={(val) => {
                                          const key = slotKey(selectedDay, pt.period_number);
                                          setDraftAssignments((prev) => ({
                                            ...prev,
                                            [key]: { ...prev[key], teacherId: val },
                                          }));
                                        }}
                                      >
                                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Teacher" /></SelectTrigger>
                                        <SelectContent>
                                          {teachers.map(t => (<SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>))}
                                        </SelectContent>
                                      </Select>
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    {entry && (
                                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeTimetableEntry(selectedDay, pt.period_number)}>
                                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                                      </Button>
                                    )}
                                    {!entry && (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-7 px-2 text-[11px]"
                                        disabled={!draftAssignments[slotKey(selectedDay, pt.period_number)]?.teacherId || !draftAssignments[slotKey(selectedDay, pt.period_number)]?.subjectId}
                                        onClick={() => {
                                          const key = slotKey(selectedDay, pt.period_number);
                                          const draft = draftAssignments[key];
                                          if (!draft?.teacherId || !draft?.subjectId) return;
                                          setTimetableEntry(selectedDay, pt.period_number, draft.teacherId, draft.subjectId);
                                        }}
                                      >
                                        Save
                                      </Button>
                                    )}
                                  </TableCell>
                                </TableRow>
                              );
                            })()
                          )}
                        </React.Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ====== SUBSTITUTION TAB ====== */}
        <TabsContent value="substitution" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold">Today's Substitutions</h3>
              <p className="text-sm text-muted-foreground">{format(new Date(), 'EEEE, MMM d yyyy')}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={printDailySubstitutionReport}>
                <Printer className="w-4 h-4 mr-2" />
                Print Report
              </Button>
              <Button onClick={findSubstitutes} disabled={isSaving}>
                {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                Auto-Assign Substitutes
              </Button>
            </div>
          </div>

          {substitutions.length === 0 ? (
            <Card className="p-8 text-center">
              <UserCheck className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">No Substitutions Today</h3>
              <p className="text-sm text-muted-foreground">Click "Auto-Assign Substitutes" to check for absent teachers and assign replacements.</p>
            </Card>
          ) : (
            <div className="space-y-3">
              {substitutions.map(sub => (
                <Card key={sub.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">Period {sub.period_number}</Badge>
                          {sub.auto_assigned && <Badge variant="secondary" className="text-[10px]">Auto</Badge>}
                          <Badge variant={sub.status === 'assigned' ? 'default' : 'secondary'}>{sub.status}</Badge>
                        </div>
                        <div className="flex items-center gap-2 text-sm mt-2">
                          <span className="text-destructive font-medium line-through">{sub.absent_teacher_name}</span>
                          <span className="text-muted-foreground">→</span>
                          <span className="text-green-600 dark:text-green-400 font-medium">{sub.substitute_teacher_name}</span>
                        </div>
                      </div>
                      <AlertTriangle className="w-5 h-5 text-amber-500" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ClassTeacherManager;
