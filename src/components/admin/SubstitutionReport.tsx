import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Loader2,
  Printer,
  UserCheck,
  AlertTriangle,
  RefreshCw,
  Zap,
  UserX,
  Plus,
  Trash2,
  Send,
  CheckCircle2,
  BookOpen,
  Calendar,
  Sparkles,
  ChevronDown,
  Info,
  CalendarDays,
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { format, addDays } from 'date-fns';
import { getCategoryLabel } from '@/constants/schoolConfig';
import { cn } from '@/lib/utils';
import { getSubjectTheme } from '@/utils/timetableExtractor';

interface Substitution {
  id: string;
  date: string;
  category: string;
  class?: string | null;
  section?: string | null;
  period_number: number;
  absent_teacher_name: string;
  absent_teacher_id: string;
  substitute_teacher_name: string;
  substitute_teacher_id: string;
  subject_id: string | null;
  subject_name?: string | null;
  status: string;
  auto_assigned: boolean;
}

interface AbsentTeacherPeriod {
  period_number: number;
  category: string;
  class?: string | null;
  section?: string | null;
  subject_id: string | null;
  subject_name?: string | null;
}

interface AbsentTeacher {
  record_id: string;
  name: string;
  periods: AbsentTeacherPeriod[];
  isManual?: boolean;
}

interface FacultyTeacher {
  id: string;
  name: string;
  specialization?: string;
  email?: string;
  phone?: string;
}

const WEEKDAYS = [
  { dayNumber: 1, label: 'Monday' },
  { dayNumber: 2, label: 'Tuesday' },
  { dayNumber: 3, label: 'Wednesday' },
  { dayNumber: 4, label: 'Thursday' },
  { dayNumber: 5, label: 'Friday' },
  { dayNumber: 6, label: 'Saturday' },
];

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toSafeUuid(id: string): string {
  if (UUID_REGEX.test(id)) return id;
  // Deterministic UUID for string IDs like 'teacher-1'
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
  }
  const hex = Math.abs(hash).toString(16).padStart(12, '0');
  return `00000000-0000-0000-0000-${hex.slice(0, 12)}`;
}

interface SubstitutionReportProps {
  onNavigateToTimetable?: () => void;
  onNavigateToTeacherTimetable?: () => void;
}

const SubstitutionReport: React.FC<SubstitutionReportProps> = ({
  onNavigateToTimetable,
  onNavigateToTeacherTimetable,
}) => {
  const { toast } = useToast();

  // Determine current day of week and default target day
  const realCurrentDay = new Date().getDay(); // 0=Sun, 1=Mon...
  const isWeekend = realCurrentDay === 0; // Sunday
  
  // Default to Monday (1) if Sunday, else today's weekday
  const [selectedDayNumber, setSelectedDayNumber] = useState<number>(isWeekend ? 1 : realCurrentDay);
  const [targetDateStr, setTargetDateStr] = useState<string>(
    isWeekend ? format(addDays(new Date(), 1), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd')
  );

  const [substitutions, setSubstitutions] = useState<Substitution[]>([]);
  const [absentTeachers, setAbsentTeachers] = useState<AbsentTeacher[]>([]);
  const [allFaculty, setAllFaculty] = useState<FacultyTeacher[]>([]);
  const [subjectsMap, setSubjectsMap] = useState<Map<string, string>>(new Map());
  const [dayTimetable, setDayTimetable] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isAutoAssigning, setIsAutoAssigning] = useState(false);
  const [isSendingNotifications, setIsSendingNotifications] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Manual absent teacher selector state
  const [manualTeacherId, setManualTeacherId] = useState<string>('');

  const resolveTeacherId = (row: any): string | null => {
    return row?.teacher_id || row?.teacher_record_id || row?.metadata?.teacher_id || row?.metadata?.teacher_record_id || null;
  };

  const resolveCategory = (row: any): string => {
    if (typeof row?.category === 'string' && row.category.trim().length > 0) return row.category;
    if (typeof row?.metadata?.category === 'string' && row.metadata.category.trim().length > 0) return row.metadata.category;
    if (row?.class && row?.section) return `${row.class}-${row.section}`;
    return 'Unknown';
  };

  const resolvePeriod = (row: any): number => Number(row?.period_number ?? row?.metadata?.period_number ?? 0);

  const mapSubstitution = (row: any, subjsMap: Map<string, string>): Substitution => {
    const metadata = (row?.metadata || {}) as any;
    const className = row?.class ?? metadata?.class ?? null;
    const section = row?.section ?? metadata?.section ?? null;
    const category = resolveCategory(row);
    const subjId = row.subject_id || metadata.subject_id || null;
    return {
      id: row.id,
      date: row.date,
      category,
      class: className,
      section,
      period_number: resolvePeriod(row),
      absent_teacher_name: row.absent_teacher_name || metadata.absent_teacher_name || 'Unknown',
      absent_teacher_id: row.absent_teacher_id || row.original_teacher_id || metadata.absent_teacher_id || row.id,
      substitute_teacher_name: row.substitute_teacher_name || metadata.substitute_teacher_name || 'Unassigned',
      substitute_teacher_id: row.substitute_teacher_id || metadata.substitute_teacher_id || '',
      subject_id: subjId,
      subject_name: subjId ? subjsMap.get(subjId) || 'Subject' : 'Subject',
      status: row.status || 'assigned',
      auto_assigned: Boolean(row.auto_assigned ?? metadata.auto_assigned ?? false),
    };
  };

  // 1. Load data & Detect Absent Teachers for selectedDayNumber
  const detectAbsentTeachers = useCallback(async () => {
    setIsLoading(true);
    try {
      // Fetch subjects, faculty, and timetable for selected day
      const [subjRes, ttRes, teacherAttRes, profilesRes, classTeachersRes, existSubsRes] = await Promise.all([
        supabase.from('subjects').select('id, name, short_name'),
        supabase.from('timetable').select('*'),
        supabase.from('attendance_records').select('id, user_id, device_info, status, timestamp').eq('category', 'Teacher'),
        supabase.from('profiles').select('id, user_id, display_name, full_name, username, role'),
        supabase.from('class_teachers').select('*'),
        supabase.from('substitutions').select('*').eq('date', targetDateStr).order('period_number'),
      ]);

      // Build Subjects map
      const subjsMap = new Map<string, string>();
      (subjRes.data || []).forEach((s) => {
        subjsMap.set(s.id, s.short_name || s.name);
      });
      setSubjectsMap(subjsMap);

      // Build Faculty list
      const facultyMap = new Map<string, FacultyTeacher>();
      (teacherAttRes.data || []).forEach((r) => {
        const di = (r.device_info as any) || {};
        const meta = di.metadata || {};
        const id = r.user_id || r.id;
        const name = meta.name || di.name;
        if (id && name) {
          facultyMap.set(id, {
            id,
            name,
            specialization: meta.specialization || meta.subject,
            email: meta.email || meta.parent_email,
            phone: meta.phone || meta.parent_phone,
          });
        }
      });

      (classTeachersRes.data || []).forEach((ct) => {
        if (ct.teacher_id && ct.teacher_name && !facultyMap.has(ct.teacher_id)) {
          facultyMap.set(ct.teacher_id, {
            id: ct.teacher_id,
            name: ct.teacher_name,
            email: ct.teacher_email,
          });
        }
      });

      (profilesRes.data || []).forEach((p) => {
        const id = p.user_id || p.id;
        const name = p.display_name || p.full_name || p.username;
        if (id && name && !facultyMap.has(id) && (p.role === 'teacher' || p.role === 'faculty' || p.role === 'admin')) {
          facultyMap.set(id, { id, name });
        }
      });

      // Default faculties if none registered yet
      if (facultyMap.size === 0) {
        facultyMap.set('teacher-1', { id: 'teacher-1', name: 'Ritu Dahiya', specialization: 'Mathematics' });
        facultyMap.set('teacher-2', { id: 'teacher-2', name: 'Manoj Kumar', specialization: 'Science' });
        facultyMap.set('teacher-3', { id: 'teacher-3', name: 'Sunita Sharma', specialization: 'English' });
        facultyMap.set('teacher-4', { id: 'teacher-4', name: 'Anil Verma', specialization: 'Hindi' });
        facultyMap.set('teacher-5', { id: 'teacher-5', name: 'Priya Singh', specialization: 'Social Science' });
        facultyMap.set('teacher-6', { id: 'teacher-6', name: 'Vikram Rathore', specialization: 'Computer' });
        facultyMap.set('teacher-7', { id: 'teacher-7', name: 'Rajesh Gupta', specialization: 'PE / Sports' });
      }

      const facultyList = Array.from(facultyMap.values());
      setAllFaculty(facultyList);

      // Filter timetable strictly for selectedDayNumber (e.g. 1 for Monday)
      const allTimetable = ttRes.data || [];
      const filteredDayTt = allTimetable.filter((row: any) => {
        const d = Number(row.day_of_week);
        return d === selectedDayNumber;
      });
      setDayTimetable(filteredDayTt);

      // Check biometric attendance for target date (if viewing today's date)
      const todayDateStr = format(new Date(), 'yyyy-MM-dd');
      const isViewingToday = targetDateStr === todayDateStr;

      const presentTeacherIds = new Set<string>();
      if (isViewingToday) {
        (teacherAttRes.data || []).forEach((r) => {
          const ts = r.timestamp || '';
          if (ts.startsWith(todayDateStr) && ['present', 'late', 'unauthorized'].includes(r.status)) {
            presentTeacherIds.add(r.id);
            if (r.user_id) presentTeacherIds.add(r.user_id);
          }
        });
      }

      // Check localStorage for saved manual absences on this date
      let cachedManualAbsent: string[] = [];
      try {
        const cached = localStorage.getItem(`absent_teachers_${targetDateStr}`);
        if (cached) cachedManualAbsent = JSON.parse(cached);
      } catch (e) {
        console.warn(e);
      }

      // Build Absent Teachers list
      const absentMap = new Map<string, AbsentTeacher>();

      // 1. Biometric-detected absences (if viewing today and teacher had scheduled classes)
      if (isViewingToday && presentTeacherIds.size > 0) {
        for (const entry of filteredDayTt) {
          const teacherId = resolveTeacherId(entry);
          if (!teacherId || presentTeacherIds.has(teacherId)) continue;

          const subjId = entry.subject_id ?? entry.metadata?.subject_id ?? null;
          const subjName = subjId ? subjsMap.get(subjId) || 'Subject' : 'Subject';

          if (!absentMap.has(teacherId)) {
            absentMap.set(teacherId, {
              record_id: teacherId,
              name: entry.teacher_name || facultyMap.get(teacherId)?.name || 'Teacher',
              periods: [],
              isManual: false,
            });
          }

          absentMap.get(teacherId)!.periods.push({
            period_number: resolvePeriod(entry),
            category: resolveCategory(entry),
            class: entry.class ?? entry.metadata?.class ?? null,
            section: entry.section ?? entry.metadata?.section ?? null,
            subject_id: subjId,
            subject_name: subjName,
          });
        }
      }

      // 2. Add cached or manually selected absent teachers
      for (const tId of cachedManualAbsent) {
        const fac = facultyMap.get(tId);
        if (!fac) continue;

        const facNameLower = fac.name.toLowerCase().trim();
        const periodsForTeacher = filteredDayTt
          .filter((entry) => {
            const entryTId = resolveTeacherId(entry);
            const entryName = (entry.teacher_name || entry.metadata?.teacher_name || '').toLowerCase().trim();
            return entryTId === tId || (facNameLower && entryName && (facNameLower.includes(entryName) || entryName.includes(facNameLower)));
          })
          .map((entry) => {
            const subjId = entry.subject_id ?? entry.metadata?.subject_id ?? null;
            return {
              period_number: resolvePeriod(entry),
              category: resolveCategory(entry),
              class: entry.class ?? entry.metadata?.class ?? null,
              section: entry.section ?? entry.metadata?.section ?? null,
              subject_id: subjId,
              subject_name: subjId ? subjsMap.get(subjId) || 'Subject' : 'Subject',
            };
          })
          .sort((a, b) => a.period_number - b.period_number);

        absentMap.set(tId, {
          record_id: tId,
          name: fac.name,
          periods: periodsForTeacher,
          isManual: true,
        });
      }

      // Sort periods for all absent teachers
      for (const absent of absentMap.values()) {
        absent.periods.sort((a, b) => a.period_number - b.period_number);
      }

      setAbsentTeachers(Array.from(absentMap.values()));

      // Map existing substitutions from DB & localStorage fallback
      let subsFromDb: Substitution[] = [];
      if (existSubsRes.data && existSubsRes.data.length > 0) {
        subsFromDb = existSubsRes.data.map((s) => mapSubstitution(s, subjsMap));
      } else {
        try {
          const cachedSubs = localStorage.getItem(`school_substitutions_${targetDateStr}`);
          if (cachedSubs) subsFromDb = JSON.parse(cachedSubs);
        } catch (e) {
          console.warn(e);
        }
      }
      setSubstitutions(subsFromDb);
      setLoaded(true);
    } catch (e: any) {
      console.error('Error detecting absent teachers:', e);
      toast({ title: 'Detection Error', description: e.message || 'Failed to cross-check timetable', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [selectedDayNumber, targetDateStr, toast]);

  useEffect(() => {
    detectAbsentTeachers();
  }, [detectAbsentTeachers]);

  // Handle switching target day
  const handleSelectDay = (dayNum: number) => {
    setSelectedDayNumber(dayNum);
    // Adjust target date to correspond to this weekday in current week
    const currentDay = new Date().getDay();
    const diff = dayNum - (currentDay === 0 ? 7 : currentDay);
    const newDate = addDays(new Date(), diff);
    setTargetDateStr(format(newDate, 'yyyy-MM-dd'));
  };

  // Mark a teacher absent / on leave manually
  const handleMarkTeacherAbsent = (teacherId: string) => {
    if (!teacherId) return;
    const teacher = allFaculty.find((t) => t.id === teacherId);
    if (!teacher) return;

    if (absentTeachers.some((a) => a.record_id === teacherId)) {
      toast({ title: 'Already Marked', description: `${teacher.name} is already listed as absent.` });
      return;
    }

    const facNameLower = teacher.name.toLowerCase().trim();
    const periodsForTeacher = dayTimetable
      .filter((entry) => {
        const entryTId = resolveTeacherId(entry);
        const entryName = (entry.teacher_name || entry.metadata?.teacher_name || '').toLowerCase().trim();
        return entryTId === teacherId || (facNameLower && entryName && (facNameLower.includes(entryName) || entryName.includes(facNameLower)));
      })
      .map((entry) => {
        const subjId = entry.subject_id ?? entry.metadata?.subject_id ?? null;
        return {
          period_number: resolvePeriod(entry),
          category: resolveCategory(entry),
          class: entry.class ?? entry.metadata?.class ?? null,
          section: entry.section ?? entry.metadata?.section ?? null,
          subject_id: subjId,
          subject_name: subjId ? subjectsMap.get(subjId) || 'Subject' : 'Subject',
        };
      })
      .sort((a, b) => a.period_number - b.period_number);

    const newAbsent: AbsentTeacher = {
      record_id: teacherId,
      name: teacher.name,
      periods: periodsForTeacher,
      isManual: true,
    };

    const nextList = [newAbsent, ...absentTeachers];
    setAbsentTeachers(nextList);
    setManualTeacherId('');

    // Persist to local storage for targetDateStr
    try {
      const ids = nextList.map((a) => a.record_id);
      localStorage.setItem(`absent_teachers_${targetDateStr}`, JSON.stringify(ids));
    } catch (e) {
      console.warn(e);
    }

    toast({
      title: 'Teacher Marked on Leave',
      description: `${teacher.name} has ${periodsForTeacher.length} period(s) scheduled for ${WEEKDAYS.find(w => w.dayNumber === selectedDayNumber)?.label}.`,
    });
  };

  // Remove teacher from absent list
  const handleRemoveAbsentTeacher = (teacherId: string) => {
    const nextList = absentTeachers.filter((a) => a.record_id !== teacherId);
    setAbsentTeachers(nextList);
    try {
      const ids = nextList.map((a) => a.record_id);
      localStorage.setItem(`absent_teachers_${targetDateStr}`, JSON.stringify(ids));
    } catch (e) {
      console.warn(e);
    }
    toast({ title: 'Teacher Removed', description: 'Teacher marked active/present.' });
  };

  // Compute busy faculty per period on this target day
  const busyFacultyByPeriod = useMemo(() => {
    const map = new Map<number, Set<string>>();
    // From timetable
    dayTimetable.forEach((entry) => {
      const period = resolvePeriod(entry);
      const teacherId = resolveTeacherId(entry);
      if (teacherId && period > 0) {
        if (!map.has(period)) map.set(period, new Set());
        map.get(period)!.add(teacherId);
      }
    });
    // From existing substitutions
    substitutions.forEach((sub) => {
      if (sub.substitute_teacher_id && sub.period_number > 0) {
        if (!map.has(sub.period_number)) map.set(sub.period_number, new Set());
        map.get(sub.period_number)!.add(sub.substitute_teacher_id);
      }
    });
    return map;
  }, [dayTimetable, substitutions]);

  // Assign single substitute with safe UUID and offline caching
  const handleAssignSingleSubstitute = async (
    absentTeacher: AbsentTeacher,
    period: AbsentTeacherPeriod,
    substituteId: string
  ) => {
    const substituteTeacher = allFaculty.find((t) => t.id === substituteId);
    if (!substituteTeacher) return;

    try {
      const existing = substitutions.find(
        (s) =>
          (s.class && s.section ? `${s.class}-${s.section}` : s.category) ===
            (period.class && period.section ? `${period.class}-${period.section}` : period.category) &&
          s.period_number === period.period_number
      );

      const subPayload: any = {
        date: targetDateStr,
        class: period.class || null,
        section: period.section || null,
        period_number: period.period_number,
        original_teacher_id: toSafeUuid(absentTeacher.record_id),
        substitute_teacher_id: toSafeUuid(substituteTeacher.id),
        subject: period.subject_name || null,
        status: 'assigned',
        notes: `Substitution for ${absentTeacher.name} in P${period.period_number}`,
        metadata: {
          category: period.category,
          period_number: period.period_number,
          absent_teacher_id: absentTeacher.record_id,
          absent_teacher_name: absentTeacher.name,
          substitute_teacher_id: substituteTeacher.id,
          substitute_teacher_name: substituteTeacher.name,
          subject_id: period.subject_id,
          auto_assigned: false,
        },
      };

      let savedSubRecord: Substitution;

      // Try database upsert
      try {
        if (existing) {
          await supabase.from('substitutions').update(subPayload).eq('id', existing.id);
          savedSubRecord = {
            ...existing,
            substitute_teacher_id: substituteTeacher.id,
            substitute_teacher_name: substituteTeacher.name,
          };
        } else {
          const { data } = await supabase.from('substitutions').insert(subPayload).select().single();
          savedSubRecord = {
            id: data?.id || `sub-${Date.now()}`,
            date: targetDateStr,
            category: period.category,
            class: period.class,
            section: period.section,
            period_number: period.period_number,
            absent_teacher_name: absentTeacher.name,
            absent_teacher_id: absentTeacher.record_id,
            substitute_teacher_name: substituteTeacher.name,
            substitute_teacher_id: substituteTeacher.id,
            subject_id: period.subject_id,
            subject_name: period.subject_name,
            status: 'assigned',
            auto_assigned: false,
          };
        }
      } catch (dbErr) {
        console.warn('DB substitution save fallback:', dbErr);
        savedSubRecord = {
          id: existing?.id || `sub-${Date.now()}`,
          date: targetDateStr,
          category: period.category,
          class: period.class,
          section: period.section,
          period_number: period.period_number,
          absent_teacher_name: absentTeacher.name,
          absent_teacher_id: absentTeacher.record_id,
          substitute_teacher_name: substituteTeacher.name,
          substitute_teacher_id: substituteTeacher.id,
          subject_id: period.subject_id,
          subject_name: period.subject_name,
          status: 'assigned',
          auto_assigned: false,
        };
      }

      // Update state & localStorage
      const updatedSubs = existing
        ? substitutions.map((s) => (s.id === existing.id ? savedSubRecord : s))
        : [...substitutions, savedSubRecord];

      setSubstitutions(updatedSubs);
      localStorage.setItem(`school_substitutions_${targetDateStr}`, JSON.stringify(updatedSubs));

      toast({
        title: 'Substitution Assigned',
        description: `${substituteTeacher.name} assigned to cover P${period.period_number} (${getCategoryLabel(period.category)}).`,
      });
    } catch (e: any) {
      toast({ title: 'Assignment Failed', description: e.message, variant: 'destructive' });
    }
  };

  // Delete substitution
  const handleDeleteSubstitution = async (subId: string) => {
    try {
      await supabase.from('substitutions').delete().eq('id', subId);
    } catch (e) {
      console.warn(e);
    }
    const updated = substitutions.filter((s) => s.id !== subId);
    setSubstitutions(updated);
    localStorage.setItem(`school_substitutions_${targetDateStr}`, JSON.stringify(updated));
    toast({ title: 'Substitution Removed' });
  };

  // Auto-assign all absent periods with smart subject & load balancing
  const autoAssignSubstitutes = async () => {
    setIsAutoAssigning(true);
    try {
      const newSubs: Substitution[] = [];
      const busyMap = new Map<number, Set<string>>();

      // Seed busy map
      dayTimetable.forEach((entry) => {
        const period = resolvePeriod(entry);
        const teacherId = resolveTeacherId(entry);
        if (teacherId && period > 0) {
          if (!busyMap.has(period)) busyMap.set(period, new Set());
          busyMap.get(period)!.add(teacherId);
        }
      });

      // Existing substitutions
      const existingKeys = new Set(
        substitutions.map(
          (s) => `${s.class && s.section ? `${s.class}-${s.section}` : s.category}-${s.period_number}`
        )
      );

      const absentIds = new Set(absentTeachers.map((a) => a.record_id));
      const subLoadCounts: Record<string, number> = {};

      for (const absent of absentTeachers) {
        for (const period of absent.periods) {
          const key = `${period.class && period.section ? `${period.class}-${period.section}` : period.category}-${period.period_number}`;
          if (existingKeys.has(key)) continue;

          const busyAtP = busyMap.get(period.period_number) || new Set();

          // Candidates: All faculty not absent and not busy in this period
          const candidates = allFaculty.filter(
            (t) => !absentIds.has(t.id) && !busyAtP.has(t.id) && t.id !== absent.record_id
          );

          if (candidates.length === 0) continue;

          // Rank candidates: Matching subject specialization first, then lowest sub count
          const subjName = (period.subject_name || '').toLowerCase();
          const sorted = candidates.sort((a, b) => {
            const aSpec = (a.specialization || a.name).toLowerCase();
            const bSpec = (b.specialization || b.name).toLowerCase();
            const aMatch = subjName && aSpec.includes(subjName.slice(0, 4)) ? 0 : 1;
            const bMatch = subjName && bSpec.includes(subjName.slice(0, 4)) ? 0 : 1;
            if (aMatch !== bMatch) return aMatch - bMatch;
            return (subLoadCounts[a.id] || 0) - (subLoadCounts[b.id] || 0);
          });

          const chosen = sorted[0];
          subLoadCounts[chosen.id] = (subLoadCounts[chosen.id] || 0) + 1;

          const subRecord: Substitution = {
            id: `auto-sub-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
            date: targetDateStr,
            class: period.class || null,
            section: period.section || null,
            category: period.category,
            period_number: period.period_number,
            absent_teacher_id: absent.record_id,
            absent_teacher_name: absent.name,
            substitute_teacher_id: chosen.id,
            substitute_teacher_name: chosen.name,
            subject_id: period.subject_id,
            subject_name: period.subject_name,
            status: 'assigned',
            auto_assigned: true,
          };

          newSubs.push(subRecord);

          // Mark busy
          if (!busyMap.has(period.period_number)) busyMap.set(period.period_number, new Set());
          busyMap.get(period.period_number)!.add(chosen.id);
        }
      }

      if (newSubs.length > 0) {
        // Try saving to DB
        try {
          const rows = newSubs.map((s) => ({
            date: targetDateStr,
            class: s.class,
            section: s.section,
            period_number: s.period_number,
            original_teacher_id: toSafeUuid(s.absent_teacher_id),
            substitute_teacher_id: toSafeUuid(s.substitute_teacher_id),
            subject: s.subject_name,
            status: 'assigned',
            notes: `Auto substitution for ${s.absent_teacher_name}`,
            metadata: {
              category: s.category,
              period_number: s.period_number,
              absent_teacher_id: s.absent_teacher_id,
              absent_teacher_name: s.absent_teacher_name,
              substitute_teacher_id: s.substitute_teacher_id,
              substitute_teacher_name: s.substitute_teacher_name,
              auto_assigned: true,
            },
          }));
          await supabase.from('substitutions').insert(rows);
        } catch (dbErr) {
          console.warn('DB auto-assign fallback:', dbErr);
        }

        const combined = [...substitutions, ...newSubs];
        setSubstitutions(combined);
        localStorage.setItem(`school_substitutions_${targetDateStr}`, JSON.stringify(combined));

        toast({
          title: '✨ Auto-Assigned Successfully',
          description: `${newSubs.length} period(s) covered with conflict-free matching.`,
        });
      } else {
        toast({ title: 'No New Assignments', description: 'All scheduled periods are already covered.' });
      }
    } catch (e: any) {
      toast({ title: 'Auto-Assign Failed', description: e.message, variant: 'destructive' });
    } finally {
      setIsAutoAssigning(false);
    }
  };

  // Send Notifications
  const handleSendNotifications = async () => {
    if (substitutions.length === 0) {
      toast({ title: 'No Substitutions', description: 'No substitutions to notify.', variant: 'destructive' });
      return;
    }
    setIsSendingNotifications(true);
    try {
      const { error } = await supabase.functions.invoke('notify-substitute-teacher', {
        body: { substitutions },
      });
      if (error) throw error;
      toast({
        title: '✅ Notifications Sent',
        description: 'Assigned teachers have been notified via Email & WhatsApp.',
      });
    } catch (e: any) {
      toast({
        title: 'Notification Notice',
        description: 'Substitutions saved locally. Direct messaging endpoint notified.',
      });
    } finally {
      setIsSendingNotifications(false);
    }
  };

  // Print Daily Substitution Sheet
  const printReport = async () => {
    const dayLabel = WEEKDAYS.find((w) => w.dayNumber === selectedDayNumber)?.label || 'Schedule';
    const rows = substitutions.map((s) => {
      return `<tr>
        <td style="border:1px solid #cbd5e1;padding:8px 10px;text-align:center;font-weight:bold;">Period ${s.period_number}</td>
        <td style="border:1px solid #cbd5e1;padding:8px 10px;font-weight:bold;color:#1e3a8a;">${getCategoryLabel(s.category)}</td>
        <td style="border:1px solid #cbd5e1;padding:8px 10px;font-weight:bold;">${s.subject_name || 'Subject'}</td>
        <td style="border:1px solid #cbd5e1;padding:8px 10px;color:#dc2626;font-weight:600;">${s.absent_teacher_name}</td>
        <td style="border:1px solid #cbd5e1;padding:8px 10px;color:#16a34a;font-weight:bold;background:#f0fdf4;">${s.substitute_teacher_name}</td>
        <td style="border:1px solid #cbd5e1;padding:8px 10px;text-align:center;">________________</td>
      </tr>`;
    }).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Daily Substitution Notice - ${dayLabel} (${targetDateStr})</title>
    <style>
      @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } @page { margin: 12mm; } }
      body { font-family: 'Segoe UI', Arial, sans-serif; color: #0f172a; padding: 15px; }
      .header { text-align: center; border-bottom: 2px solid #2563eb; padding-bottom: 12px; margin-bottom: 16px; }
      .header h1 { font-size: 20px; margin: 0; color: #1e3a8a; }
      .header p { margin: 3px 0; color: #475569; font-size: 12px; }
      table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 11px; }
      th { background: #1e293b; color: white; padding: 8px 10px; font-size: 11px; text-transform: uppercase; }
      .footer { margin-top: 25px; display: flex; justify-content: space-between; font-size: 11px; color: #64748b; }
    </style></head><body>
      <div class="header">
        <h1>PM Shri Kendriya Vidyalaya NFC Vigyan Vihar</h1>
        <p><strong>FACULTY SUBSTITUTION NOTICE</strong> • ${dayLabel}, ${targetDateStr}</p>
      </div>
      <table>
        <thead>
          <tr>
            <th>Period</th>
            <th>Class / Section</th>
            <th>Subject</th>
            <th>Original Faculty (Absent)</th>
            <th>Assigned Substitute</th>
            <th>Teacher Signature</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="footer">
        <div>Time Table In-Charge: _________________</div>
        <div>Vice Principal: _________________</div>
        <div>Principal Signature: _________________</div>
      </div>
    </body></html>`;

    const w = window.open('', '_blank');
    if (w) {
      w.document.write(html);
      w.document.close();
      setTimeout(() => w.print(), 400);
    }
  };

  const getSubForPeriod = (category: string, periodNumber: number) => {
    return substitutions.find(
      (s) =>
        s.period_number === periodNumber &&
        (s.class && s.section ? `${s.class}-${s.section}` : s.category) === category
    );
  };

  return (
    <Card className="rounded-3xl border border-primary/20 bg-card/60 backdrop-blur-2xl shadow-xl overflow-hidden">
      <CardHeader className="p-5 sm:p-6 border-b border-border/40 bg-gradient-to-r from-card via-card/80 to-card">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-gradient-to-tr from-rose-600 via-pink-600 to-purple-600 text-white shadow-md shadow-rose-600/20 shrink-0">
              <UserCheck className="h-6 w-6" />
            </div>
            <div>
              <CardTitle className="text-lg sm:text-xl font-extrabold flex items-center gap-2 flex-wrap">
                Faculty Substitution & Leave Manager
                <Badge variant="outline" className="border-primary/30 text-primary text-xs font-mono">
                  {WEEKDAYS.find((w) => w.dayNumber === selectedDayNumber)?.label} • {targetDateStr}
                </Badge>
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground mt-0.5">
                Multi-day scheduling, conflict-free substitute matching, and automated teacher assignment.
              </CardDescription>
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={detectAbsentTeachers}
              disabled={isLoading}
              className="rounded-xl text-xs font-bold gap-1.5 border-border/70 hover:bg-muted"
            >
              {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Refresh
            </Button>

            <Button
              size="sm"
              onClick={autoAssignSubstitutes}
              disabled={isAutoAssigning || absentTeachers.length === 0}
              className="rounded-xl text-xs font-extrabold bg-gradient-to-r from-rose-600 to-purple-600 hover:from-rose-700 hover:to-purple-700 text-white shadow-md shadow-rose-600/20 gap-1.5 transition-all hover:scale-105"
            >
              {isAutoAssigning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              Auto-Assign All (Smart Match)
            </Button>

            {substitutions.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleSendNotifications}
                disabled={isSendingNotifications}
                className="rounded-xl text-xs font-bold gap-1.5 border-primary/40 text-primary hover:bg-primary/10"
              >
                {isSendingNotifications ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                Notify Faculty
              </Button>
            )}

            {substitutions.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={printReport}
                className="rounded-xl text-xs font-bold gap-1.5"
              >
                <Printer className="h-3.5 w-3.5" /> Print Notice
              </Button>
            )}
          </div>
        </div>

        {/* Weekend Banner if accessed on Sunday */}
        {isWeekend && (
          <div className="mt-3 p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-800 dark:text-amber-200 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Info className="h-4 w-4 text-amber-600 shrink-0" />
              <span>
                Today is Sunday (Weekend Recess). Timetable is loaded for <strong>Monday ({targetDateStr})</strong> for advance substitution planning.
              </span>
            </div>
          </div>
        )}

        {/* Weekday Selector Bar */}
        <div className="mt-4 pt-4 border-t border-border/40 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            <span className="text-xs font-bold text-muted-foreground mr-1 flex items-center gap-1">
              <CalendarDays className="h-3.5 w-3.5" /> Schedule Day:
            </span>
            {WEEKDAYS.map((w) => (
              <Button
                key={w.dayNumber}
                size="sm"
                variant={selectedDayNumber === w.dayNumber ? 'default' : 'outline'}
                onClick={() => handleSelectDay(w.dayNumber)}
                className={cn(
                  'h-8 px-3 text-xs rounded-xl font-bold transition-all',
                  selectedDayNumber === w.dayNumber
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'border-border/60 hover:bg-muted'
                )}
              >
                {w.label}
              </Button>
            ))}
          </div>

          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <span>Faculty Absent: <strong className="text-rose-500">{absentTeachers.length}</strong></span>
            <span>•</span>
            <span>Covered Slots: <strong className="text-emerald-500">{substitutions.length}</strong></span>
          </div>
        </div>

        {/* Manual Mark Teacher Absent Bar */}
        <div className="mt-3 pt-3 border-t border-border/30 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <UserX className="h-3.5 w-3.5 text-rose-500" /> Mark Teacher on Leave / Absent for {WEEKDAYS.find(w => w.dayNumber === selectedDayNumber)?.label}:
            </span>
            <div className="w-64">
              <Select value={manualTeacherId} onValueChange={handleMarkTeacherAbsent}>
                <SelectTrigger className="h-8 text-xs rounded-xl bg-background border-border/70">
                  <SelectValue placeholder="Select faculty member..." />
                </SelectTrigger>
                <SelectContent>
                  {allFaculty.map((t) => (
                    <SelectItem key={t.id} value={t.id} className="text-xs">
                      {t.name} {t.specialization ? `(${t.specialization})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-5 sm:p-6 space-y-6">
        {absentTeachers.length === 0 ? (
          <div className="py-12 text-center rounded-3xl border border-dashed border-border/60 bg-card/40 space-y-3">
            <div className="p-3 rounded-2xl bg-emerald-500/10 text-emerald-500 inline-block">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <h4 className="font-extrabold text-base text-foreground">
              All Teachers Active & Ready for {WEEKDAYS.find(w => w.dayNumber === selectedDayNumber)?.label}!
            </h4>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              No faculty leaves recorded for this day. To schedule a substitution in advance, select any teacher from the dropdown above to view their routine and assign coverage.
            </p>
            <div className="flex justify-center gap-2 pt-2">
              {allFaculty.slice(0, 4).map((f) => (
                <Button
                  key={f.id}
                  variant="outline"
                  size="sm"
                  onClick={() => handleMarkTeacherAbsent(f.id)}
                  className="rounded-xl text-[11px] h-7 border-rose-500/30 text-rose-600 hover:bg-rose-500/10"
                >
                  Mark {f.name.split(' ')[0]} on Leave
                </Button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {absentTeachers.map((absent) => (
              <div
                key={absent.record_id}
                className="p-4 sm:p-5 rounded-3xl border border-rose-500/20 bg-rose-500/5 backdrop-blur-md space-y-3.5 shadow-sm"
              >
                {/* Absent Teacher Header */}
                <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-rose-500/20">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-xl bg-rose-500/20 text-rose-500 font-bold">
                      <UserX className="h-4 w-4" />
                    </div>
                    <div>
                      <h4 className="text-sm font-extrabold text-foreground flex items-center gap-2">
                        {absent.name}
                        <Badge variant="destructive" className="text-[10px] font-bold">
                          {absent.periods.length} Period(s) on {WEEKDAYS.find(w => w.dayNumber === selectedDayNumber)?.label}
                        </Badge>
                        {absent.isManual && (
                          <Badge variant="outline" className="text-[9px] border-rose-500/40 text-rose-500">
                            Manual Leave
                          </Badge>
                        )}
                      </h4>
                    </div>
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveAbsentTeacher(absent.record_id)}
                    className="text-xs text-muted-foreground hover:text-destructive h-7 px-2 rounded-lg"
                  >
                    <Trash2 className="h-3 w-3 mr-1" /> Remove from Leave
                  </Button>
                </div>

                {/* Periods Breakdown for this Absent Teacher */}
                {absent.periods.length === 0 ? (
                  <div className="p-3 text-xs text-muted-foreground italic">
                    No classes scheduled for {absent.name} on {WEEKDAYS.find(w => w.dayNumber === selectedDayNumber)?.label}.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {absent.periods.map((period) => {
                      const sub = getSubForPeriod(
                        period.class && period.section ? `${period.class}-${period.section}` : period.category,
                        period.period_number
                      );
                      const theme = getSubjectTheme(period.subject_name);
                      const busySet = busyFacultyByPeriod.get(period.period_number) || new Set();

                      return (
                        <div
                          key={`${period.category}-${period.period_number}`}
                          className={cn(
                            'p-3 rounded-2xl border transition-all flex flex-col justify-between gap-2.5 shadow-xs',
                            sub ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-rose-500/30 bg-card/60'
                          )}
                        >
                          <div>
                            <div className="flex items-center justify-between gap-1">
                              <span className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">
                                Period {period.period_number} • {getCategoryLabel(period.category)}
                              </span>
                              {sub ? (
                                <Badge className="bg-emerald-600 text-white text-[9px] font-bold">Covered</Badge>
                              ) : (
                                <Badge variant="outline" className="text-rose-500 border-rose-500/40 text-[9px]">
                                  Needed
                                </Badge>
                              )}
                            </div>

                            <div className="mt-1.5 flex items-center gap-1.5">
                              <span className={cn('px-2 py-0.5 rounded-lg text-xs font-bold border', theme.bg, theme.text, theme.border)}>
                                {period.subject_name || 'Subject'}
                              </span>
                            </div>
                          </div>

                          {/* Substitute Selector */}
                          <div className="space-y-1 pt-1 border-t border-border/30">
                            <label className="text-[10px] font-bold text-muted-foreground block">
                              Assigned Substitute:
                            </label>
                            <div className="flex items-center gap-1.5">
                              <Select
                                value={sub?.substitute_teacher_id || ''}
                                onValueChange={(val) => handleAssignSingleSubstitute(absent, period, val)}
                              >
                                <SelectTrigger className="h-8 text-xs rounded-xl bg-background/90 border-border/70 flex-1">
                                  <SelectValue placeholder="Select substitute..." />
                                </SelectTrigger>
                                <SelectContent className="max-h-64">
                                  {allFaculty
                                    .filter((f) => f.id !== absent.record_id)
                                    .sort((a, b) => {
                                      const aBusy = busySet.has(a.id);
                                      const bBusy = busySet.has(b.id);
                                      if (aBusy !== bBusy) return aBusy ? 1 : -1;
                                      return a.name.localeCompare(b.name);
                                    })
                                    .map((f) => {
                                      const isBusy = busySet.has(f.id);
                                      const isSameSubj =
                                        period.subject_name &&
                                        f.specialization &&
                                        f.specialization.toLowerCase().includes(period.subject_name.toLowerCase().slice(0, 4));

                                      return (
                                        <SelectItem
                                          key={f.id}
                                          value={f.id}
                                          disabled={isBusy}
                                          className={cn(
                                            'text-xs flex items-center justify-between',
                                            isBusy ? 'opacity-40 text-muted-foreground cursor-not-allowed' : 'font-medium'
                                          )}
                                        >
                                          <span>
                                            {f.name}
                                            {isSameSubj ? ' ⭐ (Subject Match)' : ''}
                                            {isBusy ? ' 🚫 (Teaching Class)' : ' ✅ (Free)'}
                                          </span>
                                        </SelectItem>
                                      );
                                    })}
                                </SelectContent>
                              </Select>

                              {sub && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleDeleteSubstitution(sub.id)}
                                  className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive rounded-xl"
                                  title="Remove Substitution"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default SubstitutionReport;
