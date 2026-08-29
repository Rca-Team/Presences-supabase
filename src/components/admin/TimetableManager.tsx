import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  Loader2,
  Save,
  Trash2,
  CalendarDays,
  BookOpen,
  AlertTriangle,
  Plus,
  Copy,
  Eraser,
  Sparkles,
  Printer,
  Eye,
  Edit3,
  Grid3X3,
  Wand2,
  Zap,
  Users,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { ALL_CLASS_SECTIONS, getCategoryLabel } from '@/constants/schoolConfig';
import { parseClassSection } from '@/utils/teacherAccess';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const getSubjectTheme = (name?: string | null) => {
  const normName = (name || '').toLowerCase();
  if (normName.includes('math')) {
    return {
      bg: 'bg-emerald-500/10 dark:bg-emerald-500/20',
      text: 'text-emerald-700 dark:text-emerald-300',
      border: 'border-emerald-500/30',
      badge: 'bg-emerald-600 text-white',
      accent: 'emerald',
    };
  }
  if (normName.includes('sci') || normName.includes('phys') || normName.includes('chem') || normName.includes('bio') || normName.includes('evs')) {
    return {
      bg: 'bg-cyan-500/10 dark:bg-cyan-500/20',
      text: 'text-cyan-700 dark:text-cyan-300',
      border: 'border-cyan-500/30',
      badge: 'bg-cyan-600 text-white',
      accent: 'cyan',
    };
  }
  if (normName.includes('eng')) {
    return {
      bg: 'bg-indigo-500/10 dark:bg-indigo-500/20',
      text: 'text-indigo-700 dark:text-indigo-300',
      border: 'border-indigo-500/30',
      badge: 'bg-indigo-600 text-white',
      accent: 'indigo',
    };
  }
  if (normName.includes('hin') || normName.includes('sans')) {
    return {
      bg: 'bg-amber-500/10 dark:bg-amber-500/20',
      text: 'text-amber-700 dark:text-amber-300',
      border: 'border-amber-500/30',
      badge: 'bg-amber-600 text-white',
      accent: 'amber',
    };
  }
  if (normName.includes('soc') || normName.includes('sst') || normName.includes('hist') || normName.includes('geo') || normName.includes('civic')) {
    return {
      bg: 'bg-rose-500/10 dark:bg-rose-500/20',
      text: 'text-rose-700 dark:text-rose-300',
      border: 'border-rose-500/30',
      badge: 'bg-rose-600 text-white',
      accent: 'rose',
    };
  }
  if (normName.includes('comp') || normName.includes('cs') || normName.includes('ai') || normName.includes('code') || normName.includes('it')) {
    return {
      bg: 'bg-purple-500/10 dark:bg-purple-500/20',
      text: 'text-purple-700 dark:text-purple-300',
      border: 'border-purple-500/30',
      badge: 'bg-purple-600 text-white',
      accent: 'purple',
    };
  }
  if (normName.includes('pe') || normName.includes('sport') || normName.includes('game') || normName.includes('yoga') || normName.includes('pt')) {
    return {
      bg: 'bg-lime-500/10 dark:bg-lime-500/20',
      text: 'text-lime-700 dark:text-lime-300',
      border: 'border-lime-500/30',
      badge: 'bg-lime-600 text-white',
      accent: 'lime',
    };
  }
  if (normName.includes('art') || normName.includes('craft') || normName.includes('music') || normName.includes('dance')) {
    return {
      bg: 'bg-pink-500/10 dark:bg-pink-500/20',
      text: 'text-pink-700 dark:text-pink-300',
      border: 'border-pink-500/30',
      badge: 'bg-pink-600 text-white',
      accent: 'pink',
    };
  }
  if (normName.includes('lib') || normName.includes('value') || normName.includes('gk') || normName.includes('moral')) {
    return {
      bg: 'bg-sky-500/10 dark:bg-sky-500/20',
      text: 'text-sky-700 dark:text-sky-300',
      border: 'border-sky-500/30',
      badge: 'bg-sky-600 text-white',
      accent: 'sky',
    };
  }
  return {
    bg: 'bg-slate-500/10 dark:bg-slate-500/20',
    text: 'text-slate-700 dark:text-slate-300',
    border: 'border-slate-500/30',
    badge: 'bg-slate-600 text-white',
    accent: 'slate',
  };
};

interface PeriodTiming {
  id?: string;
  period_number: number;
  start_time: string;
  end_time: string;
  is_break: boolean;
  label: string | null;
}

interface Teacher {
  id: string;
  name: string;
}

interface Subject {
  id: string;
  name: string;
  short_name: string | null;
  class: string | null;
  section: string | null;
}

interface DraftSlot {
  teacherId: string;
  subjectId: string;
  room?: string;
  notes?: string;
}

interface ValidationIssue {
  key: string;
  message: string;
}

interface SubjectAutoConfig {
  subjectId: string;
  subjectName: string;
  shortName: string;
  teacherId: string;
  periodsPerWeek: number;
  category: 'core' | 'activity' | 'language' | 'sports';
}

interface TimetableManagerProps {
  allowedCategories?: string[];
}

const db = supabase as any;

const TimetableManager: React.FC<TimetableManagerProps> = ({ allowedCategories }) => {
  const { toast } = useToast();
  const categoryOptions = allowedCategories && allowedCategories.length > 0 ? allowedCategories : ALL_CLASS_SECTIONS;

  const [viewMode, setViewMode] = useState<'preview' | 'editor' | 'auto'>('preview');
  const [periods, setPeriods] = useState<PeriodTiming[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [draftSlots, setDraftSlots] = useState<Record<string, DraftSlot>>({});
  const [validationIssues, setValidationIssues] = useState<ValidationIssue[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>(categoryOptions[0]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Auto-assignment configuration state
  const [autoConfigs, setAutoConfigs] = useState<SubjectAutoConfig[]>([]);
  const [isAutoAssigning, setIsAutoAssigning] = useState(false);

  // Quick Batch Assign state
  const [quickTeacherId, setQuickTeacherId] = useState<string>('');
  const [quickSubjectId, setQuickSubjectId] = useState<string>('');
  const [quickTargetPeriod, setQuickTargetPeriod] = useState<string>('all-empty');

  // New-period draft
  const [newPeriod, setNewPeriod] = useState<PeriodTiming>({
    period_number: 1, start_time: '09:00', end_time: '09:45', is_break: false, label: '',
  });

  // New-subject draft
  const [newSubjectName, setNewSubjectName] = useState('');
  const [newSubjectShort, setNewSubjectShort] = useState('');
  const [addingSubject, setAddingSubject] = useState(false);

  const slotKey = (day: number, period: number) => `${day}-${period}`;
  const readableSlot = (day: number, period: number) => `${DAYS[day - 1]} • Period ${period}`;

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [periodRes, teacherAttRes, subjectRes, profilesRes, rolesRes, classTeachersRes] = await Promise.all([
        db.from('period_timings').select('*'),
        db.from('attendance_records')
          .select('id, user_id, device_info, image_url')
          .eq('status', 'registered')
          .eq('category', 'Teacher'),
        db.from('subjects').select('*').order('name'),
        db.from('profiles').select('id, user_id, display_name, full_name, username, role'),
        db.from('user_roles').select('user_id, role'),
        db.from('class_teachers').select('teacher_id, teacher_name, teacher_email'),
      ]);

      const rawPeriods = periodRes.data || [];
      let mappedPeriods: PeriodTiming[] = rawPeriods.map((p: any) => {
        const meta = p.metadata || {};
        return {
          id: p.id,
          period_number: p.period_number ?? meta.period_number ?? 0,
          start_time: p.start_time,
          end_time: p.end_time,
          is_break: p.is_break ?? meta.is_break ?? false,
          label: p.label ?? meta.label ?? p.period_name ?? null,
        };
      }).sort((a: PeriodTiming, b: PeriodTiming) => a.period_number - b.period_number);

      // Provide standard 8-period timings if none exist
      if (mappedPeriods.length === 0) {
        mappedPeriods = [
          { period_number: 1, label: 'Period 1', start_time: '08:00', end_time: '08:45', is_break: false },
          { period_number: 2, label: 'Period 2', start_time: '08:45', end_time: '09:30', is_break: false },
          { period_number: 3, label: 'Period 3', start_time: '09:30', end_time: '10:15', is_break: false },
          { period_number: 4, label: 'Period 4', start_time: '10:15', end_time: '11:00', is_break: false },
          { period_number: 5, label: 'Period 5', start_time: '11:20', end_time: '12:00', is_break: false },
          { period_number: 6, label: 'Period 6', start_time: '12:00', end_time: '12:40', is_break: false },
          { period_number: 7, label: 'Period 7', start_time: '12:40', end_time: '13:20', is_break: false },
          { period_number: 8, label: 'Period 8', start_time: '13:20', end_time: '14:00', is_break: false },
        ];
      }
      setPeriods(mappedPeriods);

      // Collect all teachers across the school
      const teacherMap = new Map<string, string>();

      (teacherAttRes.data || []).forEach((r: any) => {
        const meta = (r.device_info as any)?.metadata || {};
        const name = meta.name || (r.device_info as any)?.name;
        const id = r.user_id || r.id;
        if (id && name) teacherMap.set(id, name);
      });

      (classTeachersRes.data || []).forEach((ct: any) => {
        if (ct.teacher_id && ct.teacher_name) {
          teacherMap.set(ct.teacher_id, ct.teacher_name);
        }
      });

      const teacherUserIds = new Set<string>();
      (rolesRes.data || []).forEach((ur: any) => {
        if (ur.role === 'teacher' || ur.role === 'faculty' || ur.role === 'admin' || ur.role === 'principal') {
          teacherUserIds.add(ur.user_id);
        }
      });

      (profilesRes.data || []).forEach((p: any) => {
        const id = p.user_id || p.id;
        const name = p.display_name || p.full_name || p.username;
        if (p.role === 'teacher' || p.role === 'faculty' || teacherUserIds.has(id)) {
          if (id && name && !teacherMap.has(id)) {
            teacherMap.set(id, name);
          }
        }
      });

      // Default standard faculties fallback if empty
      if (teacherMap.size === 0) {
        teacherMap.set('teacher-1', 'Ritu Dahiya (Faculty)');
        teacherMap.set('teacher-2', 'Manoj Kumar (Faculty)');
        teacherMap.set('teacher-3', 'Sunita Sharma (Faculty)');
        teacherMap.set('teacher-4', 'Anil Verma (Faculty)');
        teacherMap.set('teacher-5', 'Priya Singh (Faculty)');
        teacherMap.set('teacher-6', 'Vikram Rathore (Faculty)');
      }

      const teacherList: Teacher[] = Array.from(teacherMap.entries()).map(([id, name]) => ({ id, name }));
      setTeachers(teacherList);

      // Collect subjects or provide comprehensive CBSE subjects
      let subjectList = (subjectRes.data || []).map((s: any) => ({
        id: s.id,
        name: s.name,
        short_name: s.short_name ?? s.code ?? null,
        class: s.class ?? null,
        section: s.section ?? null,
      }));

      if (subjectList.length === 0) {
        subjectList = [
          { id: 'subj-math', name: 'Mathematics', short_name: 'Math', class: null, section: null },
          { id: 'subj-sci', name: 'Science & EVS', short_name: 'Science', class: null, section: null },
          { id: 'subj-eng', name: 'English Language', short_name: 'English', class: null, section: null },
          { id: 'subj-hin', name: 'Hindi', short_name: 'Hindi', class: null, section: null },
          { id: 'subj-sst', name: 'Social Science (SST)', short_name: 'SST', class: null, section: null },
          { id: 'subj-cs', name: 'Computer Science & AI', short_name: 'CS', class: null, section: null },
          { id: 'subj-pe', name: 'Physical Education & Sports', short_name: 'PE', class: null, section: null },
          { id: 'subj-art', name: 'Art & Music', short_name: 'Art', class: null, section: null },
          { id: 'subj-lib', name: 'Library & Value Education', short_name: 'Library', class: null, section: null },
        ];
      }
      setSubjects(subjectList);

      // Initialize Auto-assignment subject configurations
      const defaultConfigs: SubjectAutoConfig[] = subjectList.map((s, idx) => {
        let quota = 5;
        let cat: 'core' | 'activity' | 'language' | 'sports' = 'core';
        const normN = s.name.toLowerCase();

        if (normN.includes('math') || normN.includes('sci')) {
          quota = 6;
          cat = 'core';
        } else if (normN.includes('eng') || normN.includes('hin') || normN.includes('sans')) {
          quota = 5;
          cat = 'language';
        } else if (normN.includes('soc') || normN.includes('sst')) {
          quota = 5;
          cat = 'core';
        } else if (normN.includes('comp') || normN.includes('cs')) {
          quota = 3;
          cat = 'activity';
        } else if (normN.includes('pe') || normN.includes('sport') || normN.includes('yoga')) {
          quota = 3;
          cat = 'sports';
        } else if (normN.includes('art') || normN.includes('music')) {
          quota = 2;
          cat = 'activity';
        } else if (normN.includes('lib') || normN.includes('value')) {
          quota = 1;
          cat = 'activity';
        }

        const matchedTeacher = teacherList[idx % teacherList.length]?.id || teacherList[0]?.id || '';

        return {
          subjectId: s.id,
          subjectName: s.name,
          shortName: s.short_name || s.name.slice(0, 8),
          teacherId: matchedTeacher,
          periodsPerWeek: quota,
          category: cat,
        };
      });
      setAutoConfigs(defaultConfigs);

      // Load timetable data for active class
      const parsed = parseClassSection(selectedCategory);
      let ttData: any[] = [];
      const modernRes = parsed
        ? await db.from('timetable').select('*').eq('class', parsed.className).eq('section', parsed.section)
        : { data: [], error: null };

      if (!modernRes?.error && Array.isArray(modernRes?.data) && modernRes.data.length > 0) {
        ttData = modernRes.data;
      } else {
        const legacyRes = await db.from('timetable').select('*').eq('category', selectedCategory);
        ttData = legacyRes.data || [];
      }

      const nextDraft: Record<string, DraftSlot> = {};
      ttData.forEach((t: any) => {
        if (!t.day_of_week || !t.period_number) return;
        const meta = t.metadata || {};
        const teacherId = t.teacher_id || t.teacher_record_id || meta.teacher_record_id;
        if (!teacherId) return;
        nextDraft[slotKey(t.day_of_week, t.period_number)] = {
          teacherId,
          subjectId: t.subject_id || meta.subject_id || '',
          room: t.room ?? meta.room ?? '',
          notes: t.notes ?? meta.notes ?? '',
        };
      });
      setDraftSlots(nextDraft);
      setValidationIssues([]);

      // Suggest next period number
      const nextNum = (mappedPeriods[mappedPeriods.length - 1]?.period_number ?? 0) + 1;
      setNewPeriod((prev) => ({ ...prev, period_number: nextNum }));
    } catch (e) {
      console.error('Error fetching timetable data:', e);
    } finally {
      setIsLoading(false);
    }
  }, [selectedCategory]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const getSubjectName = (subjectId: string | null) => {
    if (!subjectId) return null;
    const s = subjects.find(s => s.id === subjectId);
    return s ? (s.short_name || s.name) : null;
  };

  const getTeacherName = (teacherId: string | null) => {
    if (!teacherId) return null;
    const t = teachers.find(t => t.id === teacherId);
    return t ? t.name : null;
  };

  // Statistics per subject
  const subjectWeeklyCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    Object.values(draftSlots).forEach(slot => {
      if (slot.subjectId) {
        counts[slot.subjectId] = (counts[slot.subjectId] || 0) + 1;
      }
    });
    return counts;
  }, [draftSlots]);

  // ============ Period CRUD ============

  const savePeriodRow = async (p: PeriodTiming) => {
    const row: any = {
      period_name: p.label || `Period ${p.period_number}`,
      start_time: p.start_time,
      end_time: p.end_time,
      period_number: p.period_number,
      is_break: p.is_break,
      label: p.label || null,
      metadata: {
        period_number: p.period_number,
        is_break: p.is_break,
        label: p.label || null,
      },
    };
    if (p.id) {
      const { error } = await db.from('period_timings').update(row).eq('id', p.id);
      if (error) throw error;
      return p.id;
    }
    const { data, error } = await db.from('period_timings').insert(row).select('id').single();
    if (error) throw error;
    return data?.id as string;
  };

  const addPeriod = async () => {
    if (!newPeriod.start_time || !newPeriod.end_time || !newPeriod.period_number) {
      toast({ title: 'Missing fields', description: 'Number, start, and end time are required.', variant: 'destructive' });
      return;
    }
    try {
      await savePeriodRow(newPeriod);
      toast({ title: 'Period added' });
      setNewPeriod({ period_number: newPeriod.period_number + 1, start_time: newPeriod.end_time, end_time: '', is_break: false, label: '' });
      fetchData();
    } catch (e: any) {
      toast({ title: 'Failed', description: e.message || 'Could not add period', variant: 'destructive' });
    }
  };

  // ============ Subject inline add ============

  const addSubject = async () => {
    if (!newSubjectName.trim()) return;
    const parsed = parseClassSection(selectedCategory);
    setAddingSubject(true);
    try {
      const row: any = {
        name: newSubjectName.trim(),
        short_name: newSubjectShort.trim() || null,
        code: newSubjectShort.trim() || null,
        class: parsed?.className || null,
        section: parsed?.section || null,
      };
      const { error } = await db.from('subjects').insert(row);
      if (error) throw error;
      toast({ title: 'Subject added' });
      setNewSubjectName('');
      setNewSubjectShort('');
      fetchData();
    } catch (e: any) {
      toast({ title: 'Failed', description: e.message || 'Could not add subject', variant: 'destructive' });
    } finally {
      setAddingSubject(false);
    }
  };

  // ============ Slot editing ============

  const patchSlot = (day: number, period: number, patch: Partial<DraftSlot>) => {
    const key = slotKey(day, period);
    setDraftSlots((prev) => ({
      ...prev,
      [key]: { teacherId: '', subjectId: '', ...(prev[key] || {}), ...patch },
    }));
  };

  const removeSlot = (day: number, period: number) => {
    const key = slotKey(day, period);
    setDraftSlots((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const copyDay = (fromDay: number, toDay: number) => {
    if (fromDay === toDay) return;
    setDraftSlots((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((k) => {
        if (k.startsWith(`${toDay}-`)) delete next[k];
      });
      Object.entries(prev).forEach(([k, v]) => {
        const [d, p] = k.split('-');
        if (Number(d) === fromDay) next[`${toDay}-${p}`] = { ...v };
      });
      return next;
    });
    toast({ title: 'Day copied', description: `${DAYS[fromDay - 1]} → ${DAYS[toDay - 1]}` });
  };

  const clearDay = (day: number) => {
    setDraftSlots((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((k) => {
        if (k.startsWith(`${day}-`)) delete next[k];
      });
      return next;
    });
  };

  const clearAll = () => {
    if (!confirm('Clear the entire timetable for this class? Click Save to persist after clearing.')) return;
    setDraftSlots({});
  };

  // ============ 1-Click Smart Auto-Scheduler ============

  const handleAutoAssignTimetable = () => {
    setIsAutoAssigning(true);
    try {
      const workingPeriods = periods.filter(p => !p.is_break).map(p => p.period_number);
      if (workingPeriods.length === 0) {
        toast({ title: 'No working periods', description: 'Please add non-break periods first.', variant: 'destructive' });
        return;
      }

      // Build item pools for Core (morning) vs Afternoon subjects
      const morningPool: { subjectId: string; teacherId: string; subjectName: string }[] = [];
      const afternoonPool: { subjectId: string; teacherId: string; subjectName: string }[] = [];

      autoConfigs.forEach(cfg => {
        if (!cfg.teacherId || !cfg.subjectId || cfg.periodsPerWeek <= 0) return;
        const item = { subjectId: cfg.subjectId, teacherId: cfg.teacherId, subjectName: cfg.subjectName };

        if (cfg.category === 'core' || cfg.category === 'language') {
          for (let i = 0; i < cfg.periodsPerWeek; i++) morningPool.push(item);
        } else {
          for (let i = 0; i < cfg.periodsPerWeek; i++) afternoonPool.push(item);
        }
      });

      const nextSlots: Record<string, DraftSlot> = {};
      const midPoint = Math.ceil(workingPeriods.length / 2);
      const morningPeriods = workingPeriods.slice(0, midPoint);
      const afternoonPeriods = workingPeriods.slice(midPoint);

      // Track daily subject placement to avoid duplicates on same day
      const daySubjectTracker: Record<number, Set<string>> = {
        1: new Set(), 2: new Set(), 3: new Set(), 4: new Set(), 5: new Set(), 6: new Set()
      };

      // 1. Assign morning periods across 6 days
      for (const pNum of morningPeriods) {
        for (let day = 1; day <= 6; day++) {
          if (morningPool.length > 0) {
            let pickedIdx = morningPool.findIndex(item => !daySubjectTracker[day].has(item.subjectId));
            if (pickedIdx === -1) pickedIdx = 0;

            const picked = morningPool.splice(pickedIdx, 1)[0];
            daySubjectTracker[day].add(picked.subjectId);
            nextSlots[slotKey(day, pNum)] = {
              teacherId: picked.teacherId,
              subjectId: picked.subjectId,
              room: `Class ${selectedCategory}`,
              notes: 'Auto-Scheduled',
            };
          }
        }
      }

      // 2. Assign afternoon periods across 6 days
      const remainingPool = [...morningPool, ...afternoonPool];
      for (const pNum of afternoonPeriods) {
        for (let day = 1; day <= 6; day++) {
          if (remainingPool.length > 0) {
            let pickedIdx = remainingPool.findIndex(item => !daySubjectTracker[day].has(item.subjectId));
            if (pickedIdx === -1) pickedIdx = 0;

            const picked = remainingPool.splice(pickedIdx, 1)[0];
            daySubjectTracker[day].add(picked.subjectId);
            nextSlots[slotKey(day, pNum)] = {
              teacherId: picked.teacherId,
              subjectId: picked.subjectId,
              room: `Class ${selectedCategory}`,
              notes: 'Auto-Scheduled',
            };
          }
        }
      }

      setDraftSlots(nextSlots);
      setViewMode('preview');
      toast({
        title: '✨ Timetable Auto-Generated',
        description: `Successfully allocated balanced subject periods for ${getCategoryLabel(selectedCategory)}. Review and click Save Timetable.`,
      });
    } catch (err: any) {
      toast({ title: 'Auto-assign failed', description: err.message, variant: 'destructive' });
    } finally {
      setIsAutoAssigning(false);
    }
  };

  // Quick Batch Fill
  const handleQuickBatchAssign = () => {
    if (!quickTeacherId || !quickSubjectId) {
      toast({ title: 'Select Teacher & Subject', description: 'Please select both before applying.', variant: 'destructive' });
      return;
    }

    setDraftSlots(prev => {
      const next = { ...prev };
      const workingPeriods = periods.filter(p => !p.is_break).map(p => p.period_number);

      if (quickTargetPeriod === 'all-empty') {
        for (let day = 1; day <= 6; day++) {
          for (const pNum of workingPeriods) {
            const key = slotKey(day, pNum);
            if (!next[key] || !next[key].subjectId) {
              next[key] = {
                teacherId: quickTeacherId,
                subjectId: quickSubjectId,
                room: `Class ${selectedCategory}`,
              };
            }
          }
        }
      } else {
        const targetP = parseInt(quickTargetPeriod, 10);
        for (let day = 1; day <= 6; day++) {
          next[slotKey(day, targetP)] = {
            teacherId: quickTeacherId,
            subjectId: quickSubjectId,
            room: `Class ${selectedCategory}`,
          };
        }
      }
      return next;
    });

    toast({ title: '⚡ Fast Period Assigned', description: 'Updated timetable slots. Click Save to persist.' });
  };

  // ============ Save Timetable ============

  const validateDraft = () => {
    const issues: ValidationIssue[] = [];
    if (periods.filter((p) => !p.is_break).length === 0) {
      issues.push({ key: 'periods', message: 'No working periods. Add at least one period before saving.' });
    }
    Object.entries(draftSlots).forEach(([key, value]) => {
      const [day, period] = key.split('-').map(Number);
      if (value.teacherId && !value.subjectId) {
        issues.push({ key: `subject-${key}`, message: `${readableSlot(day, period)}: subject required.` });
      }
      if (!value.teacherId && value.subjectId) {
        issues.push({ key: `teacher-${key}`, message: `${readableSlot(day, period)}: teacher required.` });
      }
    });
    setValidationIssues(issues);
    return issues;
  };

  const saveTimetable = async () => {
    const issues = validateDraft();
    if (issues.length > 0) {
      toast({ title: 'Validation failed', description: `Fix ${issues.length} issue${issues.length > 1 ? 's' : ''}.`, variant: 'destructive' });
      return;
    }

    const rowsToSave = Object.entries(draftSlots)
      .map(([key, v]) => {
        const [day, period] = key.split('-').map(Number);
        const teacher = teachers.find((t) => t.id === v.teacherId);
        if (!teacher || !v.subjectId) return null;
        return {
          day_of_week: day,
          period_number: period,
          teacher_id: teacher.id,
          teacher_name: teacher.name,
          subject_id: v.subjectId,
          room: v.room || null,
          notes: v.notes || null,
        };
      })
      .filter(Boolean) as any[];

    setIsSaving(true);
    try {
      const parsed = parseClassSection(selectedCategory);
      if (parsed) {
        const modernDelete = await db.from('timetable').delete().eq('class', parsed.className).eq('section', parsed.section);
        if (modernDelete.error) await db.from('timetable').delete().eq('category', selectedCategory);
      } else {
        await db.from('timetable').delete().eq('category', selectedCategory);
      }

      if (rowsToSave.length > 0) {
        const rowsModern = rowsToSave.map((t) => ({
          class: parsed?.className || null,
          section: parsed?.section || null,
          day_of_week: t.day_of_week,
          period_number: t.period_number,
          teacher_id: t.teacher_id,
          teacher_name: t.teacher_name,
          subject_id: t.subject_id,
          room: t.room,
          notes: t.notes,
          metadata: {
            category: selectedCategory,
            class: parsed?.className || null,
            section: parsed?.section || null,
            teacher_record_id: t.teacher_id,
            teacher_name: t.teacher_name,
            subject_id: t.subject_id,
            room: t.room,
            notes: t.notes,
          },
        }));
        const modernInsert = await db.from('timetable').insert(rowsModern);
        if (modernInsert.error) {
          const rowsLegacy = rowsToSave.map((t) => ({
            category: selectedCategory,
            day_of_week: t.day_of_week,
            period_number: t.period_number,
            teacher_record_id: t.teacher_id,
            teacher_name: t.teacher_name,
            subject_id: t.subject_id,
          }));
          const legacyInsert = await db.from('timetable').insert(rowsLegacy);
          if (legacyInsert.error) throw legacyInsert.error;
        }
      }

      toast({ title: '✅ Timetable Saved', description: `Saved active timetable for ${getCategoryLabel(selectedCategory)}.` });
      fetchData();
    } catch (e: any) {
      toast({ title: 'Error saving timetable', description: e.message || 'Failed to save', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const filledCount = Object.values(draftSlots).filter((s) => s.teacherId && s.subjectId).length;

  // Printable Noticeboard HTML
  const handlePrintTimetable = () => {
    const parsed = parseClassSection(selectedCategory);
    const classTitle = parsed ? `Class ${parsed.className} Section ${parsed.section}` : selectedCategory;

    const content = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Class Timetable - ${classTitle}</title>
          <style>
            @page { size: landscape; margin: 12mm; }
            body { font-family: 'Segoe UI', Arial, sans-serif; color: #0f172a; padding: 20px; background: #fff; }
            .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #2563eb; padding-bottom: 12px; }
            .title { font-size: 24px; font-weight: bold; color: #1e3a8a; margin: 0; }
            .subtitle { font-size: 14px; color: #475569; margin-top: 4px; }
            table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 11px; }
            th, td { border: 1px solid #cbd5e1; padding: 10px 8px; text-align: center; vertical-align: middle; }
            th { background-color: #f1f5f9; color: #0f172a; font-weight: bold; font-size: 12px; }
            .period-th { background-color: #e2e8f0; width: 120px; }
            .break-cell { background-color: #fef3c7; color: #92400e; font-weight: bold; letter-spacing: 1px; }
            .subj { font-size: 13px; font-weight: bold; color: #1e293b; }
            .teacher { font-size: 11px; color: #475569; margin-top: 4px; font-weight: 500; }
            .room { font-size: 10px; color: #94a3b8; margin-top: 2px; }
            .footer { margin-top: 30px; display: flex; justify-content: space-between; font-size: 12px; color: #64748b; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="title">PM Shri Kendriya Vidyalaya NFC Vigyan Vihar</div>
            <div class="subtitle">Official Class Timetable • ${classTitle} • Academic Session 2026–2027</div>
          </div>
          <table>
            <thead>
              <tr>
                <th class="period-th">Period & Time</th>
                ${DAYS.map(d => `<th>${d}</th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${periods.map(p => {
                if (p.is_break) {
                  return `<tr>
                    <td><strong>${p.label || 'Break'}</strong><br><small>${p.start_time?.slice(0, 5)} - ${p.end_time?.slice(0, 5)}</small></td>
                    <td colspan="6" class="break-cell">RECESS / LUNCH BREAK</td>
                  </tr>`;
                }
                return `<tr>
                  <td><strong>Period ${p.period_number}</strong><br><small>${p.start_time?.slice(0, 5)} - ${p.end_time?.slice(0, 5)}</small></td>
                  ${DAYS.map((_, dIdx) => {
                    const day = dIdx + 1;
                    const key = `${day}-${p.period_number}`;
                    const slot = draftSlots[key];
                    if (!slot || !slot.subjectId) return '<td>—</td>';
                    const sName = getSubjectName(slot.subjectId) || 'Subject';
                    const tName = teachers.find(t => t.id === slot.teacherId)?.name || 'Teacher';
                    return `<td>
                      <div class="subj">${sName}</div>
                      <div class="teacher">${tName}</div>
                      ${slot.room ? `<div class="room">Room: ${slot.room}</div>` : ''}
                    </td>`;
                  }).join('')}
                </tr>`;
              }).join('')}
            </tbody>
          </table>
          <div class="footer">
            <div>Class Teacher Signature: ____________________</div>
            <div>Time Table In-Charge: ____________________</div>
            <div>Principal Signature: ____________________</div>
          </div>
        </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(content);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
      }, 300);
    }
  };

  return (
    <div className="space-y-5">
      {/* Top Controls & Mode Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-3xl bg-card/60 backdrop-blur-xl border shadow-sm">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/25">
            <CalendarDays className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base sm:text-lg font-bold tracking-tight text-foreground">
                Class Timetable Control Deck
              </h2>
              <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 text-xs">
                {filledCount} Periods Allocated
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Manage weekly periods, auto-assign faculty, and export official schedules
            </p>
          </div>
        </div>

        {/* View Mode Toggle Pills */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex rounded-2xl bg-muted/60 p-1 border">
            <Button
              size="sm"
              variant={viewMode === 'preview' ? 'default' : 'ghost'}
              onClick={() => setViewMode('preview')}
              className={`text-xs h-8 rounded-xl gap-1.5 ${viewMode === 'preview' ? 'bg-primary text-white font-bold shadow-sm' : ''}`}
            >
              <Eye className="h-3.5 w-3.5" /> Schedule Preview
            </Button>
            <Button
              size="sm"
              variant={viewMode === 'auto' ? 'default' : 'ghost'}
              onClick={() => setViewMode('auto')}
              className={`text-xs h-8 rounded-xl gap-1.5 ${viewMode === 'auto' ? 'bg-primary text-white font-bold shadow-sm' : ''}`}
            >
              <Wand2 className="h-3.5 w-3.5" /> Auto-Assign Engine
            </Button>
            <Button
              size="sm"
              variant={viewMode === 'editor' ? 'default' : 'ghost'}
              onClick={() => setViewMode('editor')}
              className={`text-xs h-8 rounded-xl gap-1.5 ${viewMode === 'editor' ? 'bg-primary text-white font-bold shadow-sm' : ''}`}
            >
              <Grid3X3 className="h-3.5 w-3.5" /> Grid Editor
            </Button>
          </div>

          <Button
            size="sm"
            variant="outline"
            onClick={handlePrintTimetable}
            className="text-xs h-8 rounded-xl gap-1.5 border-border/80 hover:bg-muted font-medium"
          >
            <Printer className="h-3.5 w-3.5" /> Print Timetable
          </Button>

          <Button
            size="sm"
            onClick={saveTimetable}
            disabled={isSaving}
            className="text-xs h-8 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl gap-1.5 shadow-md shadow-emerald-600/20"
          >
            {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save Timetable
          </Button>
        </div>
      </div>

      {/* Class Selector if multiple classes */}
      {categoryOptions.length > 1 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <span className="text-xs font-semibold text-muted-foreground shrink-0">Class:</span>
          {categoryOptions.map(cat => (
            <Button
              key={cat}
              size="sm"
              variant={selectedCategory === cat ? 'default' : 'outline'}
              onClick={() => setSelectedCategory(cat)}
              className={`text-xs h-7 rounded-xl ${selectedCategory === cat ? 'bg-blue-600 text-white font-bold' : ''}`}
            >
              {getCategoryLabel(cat)}
            </Button>
          ))}
        </div>
      )}

      {/* MODE 1: INTERACTIVE TIMETABLE PREVIEW */}
      {viewMode === 'preview' && (
        <div className="space-y-4">
          <Card className="rounded-3xl border shadow-md overflow-hidden bg-card/70 backdrop-blur-lg">
            <CardHeader className="pb-3 border-b bg-gradient-to-r from-blue-950/20 to-indigo-950/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-primary" />
                  Weekly Schedule Preview — {getCategoryLabel(selectedCategory)}
                </CardTitle>
                <CardDescription className="text-xs">
                  Official Monday–Saturday period roster with assigned faculty and room tags
                </CardDescription>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setViewMode('auto')}
                  className="text-xs h-7 rounded-lg gap-1 border-primary/30 text-primary hover:bg-primary/10"
                >
                  <Wand2 className="h-3 w-3" /> Auto-Scheduler
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setViewMode('editor')}
                  className="text-xs h-7 rounded-lg gap-1"
                >
                  <Edit3 className="h-3 w-3" /> Edit Slots
                </Button>
              </div>
            </CardHeader>

            <CardContent className="p-3 sm:p-4">
              {isLoading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              ) : periods.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <p className="text-sm">No periods configured. Use Grid Editor to initialize periods.</p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border bg-background/50">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-muted/60 border-b">
                        <th className="p-3 text-left font-bold text-muted-foreground min-w-[110px]">Period</th>
                        {DAYS.map(day => (
                          <th key={day} className="p-3 text-center font-bold text-foreground min-w-[150px]">
                            {day}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {periods.map(period => {
                        if (period.is_break) {
                          return (
                            <tr key={period.id || period.period_number} className="bg-amber-500/10 border-y border-amber-500/20">
                              <td className="p-3 font-semibold text-amber-700 dark:text-amber-300">
                                {period.label || 'Break'}
                                <div className="text-[10px] text-muted-foreground font-normal">
                                  {period.start_time?.slice(0, 5)} – {period.end_time?.slice(0, 5)}
                                </div>
                              </td>
                              <td colSpan={6} className="p-3 text-center font-bold tracking-wider text-amber-700 dark:text-amber-300 text-xs">
                                🥪 RECESS / LUNCH BREAK
                              </td>
                            </tr>
                          );
                        }

                        return (
                          <tr key={period.id || period.period_number} className="hover:bg-muted/30 transition-colors">
                            <td className="p-3 font-semibold text-foreground bg-muted/20 border-r border-border/60">
                              <div className="text-xs font-bold">{period.label || `Period ${period.period_number}`}</div>
                              <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                                {period.start_time?.slice(0, 5)} – {period.end_time?.slice(0, 5)}
                              </div>
                            </td>

                            {DAYS.map((_, dIdx) => {
                              const day = dIdx + 1;
                              const key = slotKey(day, period.period_number);
                              const slot = draftSlots[key];
                              const subjectName = getSubjectName(slot?.subjectId || null);
                              const teacherName = getTeacherName(slot?.teacherId || null);
                              const theme = getSubjectTheme(subjectName);

                              if (!slot || !slot.subjectId) {
                                return (
                                  <td key={dIdx} className="p-2 text-center text-muted-foreground/40 border-r border-border/40 hover:bg-muted/50 transition-colors">
                                    <button
                                      type="button"
                                      onClick={() => setViewMode('editor')}
                                      className="w-full py-3 rounded-xl border border-dashed border-border/60 text-[10px] text-muted-foreground hover:border-primary/50 hover:text-primary transition-all"
                                    >
                                      + Assign
                                    </button>
                                  </td>
                                );
                              }

                              return (
                                <td key={dIdx} className="p-2 border-r border-border/40 align-top">
                                  <div className={`p-2.5 rounded-2xl border ${theme.bg} ${theme.border} transition-all hover:shadow-md space-y-1`}>
                                    <div className="flex items-center justify-between gap-1">
                                      <span className={`font-extrabold text-xs truncate ${theme.text}`}>
                                        {subjectName}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-1 text-[11px] text-muted-foreground font-medium truncate">
                                      <Users className="h-3 w-3 shrink-0 opacity-70" />
                                      <span className="truncate">{teacherName || 'Faculty'}</span>
                                    </div>
                                    {slot.room && (
                                      <div className="text-[10px] text-muted-foreground/80 font-mono">
                                        📍 {slot.room}
                                      </div>
                                    )}
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Subject Allocation Weekly Summary Pill Strip */}
          <Card className="rounded-3xl border bg-card/60 backdrop-blur-lg">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                Weekly Subject Workload & Allocation Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2 pb-4">
              {subjects.map(s => {
                const count = subjectWeeklyCounts[s.id] || 0;
                const theme = getSubjectTheme(s.name);
                return (
                  <div
                    key={s.id}
                    className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold ${theme.bg} ${theme.border} ${theme.text}`}
                  >
                    <BookOpen className="h-3 w-3" />
                    <span>{s.short_name || s.name}</span>
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 bg-background/80 font-bold">
                      {count} / wk
                    </Badge>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      )}

      {/* MODE 2: 1-CLICK AUTO-ASSIGNMENT ENGINE */}
      {viewMode === 'auto' && (
        <div className="space-y-4">
          <Card className="rounded-3xl border shadow-md bg-card/70 backdrop-blur-lg">
            <CardHeader className="border-b pb-3 bg-gradient-to-r from-purple-950/20 via-indigo-950/20 to-blue-950/20">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base flex items-center gap-2 text-foreground">
                    <Wand2 className="h-4 w-4 text-purple-500" />
                    Smart Auto-Assignment & Period Generator
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Assign teachers to subjects and automatically schedule all 48 periods across Monday–Saturday
                  </CardDescription>
                </div>

                <Button
                  size="sm"
                  onClick={handleAutoAssignTimetable}
                  disabled={isAutoAssigning}
                  className="text-xs h-9 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-bold rounded-xl gap-2 shadow-lg shadow-purple-600/25 px-4"
                >
                  {isAutoAssigning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  Auto-Assign to Periods Now
                </Button>
              </div>
            </CardHeader>

            <CardContent className="p-4 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {autoConfigs.map((cfg, idx) => {
                  const theme = getSubjectTheme(cfg.subjectName);
                  return (
                    <div
                      key={cfg.subjectId}
                      className={`p-3.5 rounded-2xl border ${theme.bg} ${theme.border} space-y-3 transition-all`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className={`w-2.5 h-2.5 rounded-full ${theme.badge.split(' ')[0]}`} />
                          <span className="font-bold text-sm text-foreground truncate">{cfg.subjectName}</span>
                        </div>
                        <Badge variant="outline" className="text-[10px] capitalize">
                          {cfg.category}
                        </Badge>
                      </div>

                      {/* Teacher Dropdown */}
                      <div className="space-y-1">
                        <Label className="text-[11px] text-muted-foreground">Assigned Teacher:</Label>
                        <Select
                          value={cfg.teacherId}
                          onValueChange={val => {
                            setAutoConfigs(prev => prev.map((c, i) => i === idx ? { ...c, teacherId: val } : c));
                          }}
                        >
                          <SelectTrigger className="h-8 text-xs bg-background/80 rounded-xl">
                            <SelectValue placeholder="Select faculty teacher" />
                          </SelectTrigger>
                          <SelectContent>
                            {teachers.map(t => (
                              <SelectItem key={t.id} value={t.id} className="text-xs">
                                {t.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Weekly Period Quota Counter */}
                      <div className="flex items-center justify-between pt-1">
                        <span className="text-xs text-muted-foreground font-medium">Weekly Frequency:</span>
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setAutoConfigs(prev => prev.map((c, i) => i === idx ? { ...c, periodsPerWeek: Math.max(0, c.periodsPerWeek - 1) } : c));
                            }}
                            className="h-6 w-6 p-0 rounded-lg"
                          >
                            -
                          </Button>
                          <span className="text-xs font-bold w-6 text-center font-mono">
                            {cfg.periodsPerWeek}
                          </span>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setAutoConfigs(prev => prev.map((c, i) => i === idx ? { ...c, periodsPerWeek: c.periodsPerWeek + 1 } : c));
                            }}
                            className="h-6 w-6 p-0 rounded-lg"
                          >
                            +
                          </Button>
                          <span className="text-[10px] text-muted-foreground">/wk</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Fast Period Allocator Toolbar */}
              <div className="p-4 rounded-2xl bg-muted/40 border space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                  <Zap className="h-3.5 w-3.5 text-amber-500" />
                  Quick Batch Period Allocator
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                  <div>
                    <Label className="text-[11px]">Subject:</Label>
                    <Select value={quickSubjectId} onValueChange={setQuickSubjectId}>
                      <SelectTrigger className="h-8 text-xs mt-1 bg-background rounded-xl">
                        <SelectValue placeholder="Pick subject" />
                      </SelectTrigger>
                      <SelectContent>
                        {subjects.map(s => (
                          <SelectItem key={s.id} value={s.id} className="text-xs">{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="text-[11px]">Teacher:</Label>
                    <Select value={quickTeacherId} onValueChange={setQuickTeacherId}>
                      <SelectTrigger className="h-8 text-xs mt-1 bg-background rounded-xl">
                        <SelectValue placeholder="Pick teacher" />
                      </SelectTrigger>
                      <SelectContent>
                        {teachers.map(t => (
                          <SelectItem key={t.id} value={t.id} className="text-xs">{t.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="text-[11px]">Target Slots:</Label>
                    <Select value={quickTargetPeriod} onValueChange={setQuickTargetPeriod}>
                      <SelectTrigger className="h-8 text-xs mt-1 bg-background rounded-xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all-empty" className="text-xs">Fill All Empty Slots</SelectItem>
                        {periods.filter(p => !p.is_break).map(p => (
                          <SelectItem key={p.period_number} value={String(p.period_number)} className="text-xs">
                            Period {p.period_number} (Mon–Sat)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-end">
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleQuickBatchAssign}
                      className="w-full h-8 text-xs bg-primary hover:bg-primary/90 text-white font-bold rounded-xl"
                    >
                      Apply Batch Allocation
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* MODE 3: DETAILED GRID EDITOR */}
      {viewMode === 'editor' && (
        <div className="space-y-4">
          {/* Inline Period & Subject Creator */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Card className="rounded-2xl border bg-card/60">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Add New Period</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label className="text-[10px]">Number:</Label>
                    <Input
                      type="number"
                      value={newPeriod.period_number}
                      onChange={e => setNewPeriod(prev => ({ ...prev, period_number: parseInt(e.target.value) || 1 }))}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div>
                    <Label className="text-[10px]">Start:</Label>
                    <Input
                      type="time"
                      value={newPeriod.start_time}
                      onChange={e => setNewPeriod(prev => ({ ...prev, start_time: e.target.value }))}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div>
                    <Label className="text-[10px]">End:</Label>
                    <Input
                      type="time"
                      value={newPeriod.end_time}
                      onChange={e => setNewPeriod(prev => ({ ...prev, end_time: e.target.value }))}
                      className="h-8 text-xs"
                    />
                  </div>
                </div>
                <div className="flex justify-end pt-1">
                  <Button size="sm" onClick={addPeriod} className="h-7 text-xs rounded-lg gap-1">
                    <Plus className="h-3 w-3" /> Add Period
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border bg-card/60">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Add Custom Subject</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[10px]">Subject Name:</Label>
                    <Input
                      placeholder="e.g. Sanskrit"
                      value={newSubjectName}
                      onChange={e => setNewSubjectName(e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div>
                    <Label className="text-[10px]">Short Code:</Label>
                    <Input
                      placeholder="e.g. SANS"
                      value={newSubjectShort}
                      onChange={e => setNewSubjectShort(e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>
                </div>
                <div className="flex justify-end pt-1">
                  <Button size="sm" onClick={addSubject} disabled={addingSubject || !newSubjectName.trim()} className="h-7 text-xs rounded-lg gap-1">
                    <Plus className="h-3 w-3" /> Add Subject
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Full Grid Editor */}
          <Card className="rounded-3xl border shadow-md">
            <CardHeader className="pb-3 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="text-sm font-bold">Interactive Slot Editor</CardTitle>
                <CardDescription className="text-xs">
                  Directly customize any individual period slot across Monday–Saturday
                </CardDescription>
              </div>

              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" onClick={clearAll} className="h-7 text-xs text-rose-500 hover:text-rose-600 hover:bg-rose-500/10">
                  <Eraser className="h-3 w-3 mr-1" /> Clear Draft
                </Button>
              </div>
            </CardHeader>

            <CardContent className="p-3 sm:p-4">
              <div className="overflow-x-auto rounded-2xl border">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-muted/60">
                      <th className="border p-2 text-left font-bold min-w-[110px]">Period</th>
                      {DAYS.map((day, i) => (
                        <th key={day} className="border p-2 text-xs font-bold min-w-[190px]">
                          <div className="flex items-center justify-between gap-1">
                            <span>{day}</span>
                            <div className="flex items-center gap-1">
                              <Select value="" onValueChange={(val) => copyDay(Number(val), i + 1)}>
                                <SelectTrigger className="h-6 w-6 p-0 border-none" title="Copy from day">
                                  <Copy className="w-3 h-3" />
                                </SelectTrigger>
                                <SelectContent>
                                  {DAYS.map((d, j) => (
                                    j !== i && <SelectItem key={d} value={String(j + 1)} className="text-xs">From {d}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Button size="icon" variant="ghost" className="h-5 w-5" title="Clear day" onClick={() => clearDay(i + 1)}>
                                <Eraser className="w-3 h-3" />
                              </Button>
                            </div>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {periods.map(period => (
                      <tr key={period.id || period.period_number}>
                        <td className={`border p-2 ${period.is_break ? 'bg-amber-500/10' : 'bg-muted/20'}`}>
                          <div className="font-bold text-xs">{period.label || `Period ${period.period_number}`}</div>
                          <div className="text-[10px] text-muted-foreground font-mono">
                            {period.start_time?.slice(0, 5)} – {period.end_time?.slice(0, 5)}
                          </div>
                        </td>

                        {DAYS.map((_, dayIndex) => {
                          if (period.is_break) {
                            return (
                              <td key={dayIndex} className="border p-2 bg-amber-500/10 text-center text-amber-700 dark:text-amber-300 font-bold text-[11px]">
                                Break
                              </td>
                            );
                          }

                          const day = dayIndex + 1;
                          const key = slotKey(day, period.period_number);
                          const slot = draftSlots[key] || { teacherId: '', subjectId: '', room: '', notes: '' };

                          return (
                            <td key={dayIndex} className="border p-1.5 align-top space-y-1">
                              <Select
                                value={slot.subjectId}
                                onValueChange={(val) => patchSlot(day, period.period_number, { subjectId: val })}
                              >
                                <SelectTrigger className="h-7 text-[11px] rounded-lg">
                                  <SelectValue placeholder="Pick Subject" />
                                </SelectTrigger>
                                <SelectContent>
                                  {subjects.map((s) => (
                                    <SelectItem key={s.id} value={s.id} className="text-xs">
                                      {s.short_name || s.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>

                              <Select
                                value={slot.teacherId}
                                onValueChange={(val) => patchSlot(day, period.period_number, { teacherId: val })}
                              >
                                <SelectTrigger className="h-7 text-[11px] rounded-lg">
                                  <SelectValue placeholder="Pick Teacher" />
                                </SelectTrigger>
                                <SelectContent>
                                  {teachers.map((t) => (
                                    <SelectItem key={t.id} value={t.id} className="text-xs">{t.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>

                              <div className="flex items-center gap-1">
                                <Input
                                  className="h-6 text-[10px] rounded-md px-1.5"
                                  placeholder="Room"
                                  value={slot.room || ''}
                                  onChange={(e) => patchSlot(day, period.period_number, { room: e.target.value })}
                                />
                                {slot.subjectId && (
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    onClick={() => removeSlot(day, period.period_number)}
                                    className="h-6 w-6 text-muted-foreground hover:text-rose-500 p-0"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                )}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default TimetableManager;
