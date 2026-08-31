import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Loader2,
  Save,
  Trash2,
  CalendarDays,
  BookOpen,
  Sparkles,
  Printer,
  Wand2,
  Zap,
  Users,
  CheckCircle2,
  RefreshCw,
  SlidersHorizontal,
  Flame,
  GraduationCap,
  ChevronDown,
  Camera,
  FileImage,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { ALL_CLASS_SECTIONS, getCategoryLabel } from '@/constants/schoolConfig';
import { parseClassSection } from '@/utils/teacherAccess';
import { TimetablePhotoExtractorModal } from '@/components/admin/TimetablePhotoExtractorModal';
import { ExtractedTimetableResult } from '@/utils/timetableExtractor';
import SubstitutionReport from '@/components/admin/SubstitutionReport';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const getSubjectTheme = (name?: string | null) => {
  const normName = (name || '').toLowerCase();
  if (normName.includes('math')) {
    return {
      bg: 'bg-emerald-500/10 dark:bg-emerald-500/20',
      text: 'text-emerald-700 dark:text-emerald-300',
      border: 'border-emerald-500/30',
      badge: 'bg-emerald-600 text-white',
    };
  }
  if (normName.includes('sci') || normName.includes('phys') || normName.includes('chem') || normName.includes('bio') || normName.includes('evs')) {
    return {
      bg: 'bg-cyan-500/10 dark:bg-cyan-500/20',
      text: 'text-cyan-700 dark:text-cyan-300',
      border: 'border-cyan-500/30',
      badge: 'bg-cyan-600 text-white',
    };
  }
  if (normName.includes('eng')) {
    return {
      bg: 'bg-indigo-500/10 dark:bg-indigo-500/20',
      text: 'text-indigo-700 dark:text-indigo-300',
      border: 'border-indigo-500/30',
      badge: 'bg-indigo-600 text-white',
    };
  }
  if (normName.includes('hin') || normName.includes('sans')) {
    return {
      bg: 'bg-amber-500/10 dark:bg-amber-500/20',
      text: 'text-amber-700 dark:text-amber-300',
      border: 'border-amber-500/30',
      badge: 'bg-amber-600 text-white',
    };
  }
  if (normName.includes('soc') || normName.includes('sst') || normName.includes('hist') || normName.includes('geo') || normName.includes('civic')) {
    return {
      bg: 'bg-rose-500/10 dark:bg-rose-500/20',
      text: 'text-rose-700 dark:text-rose-300',
      border: 'border-rose-500/30',
      badge: 'bg-rose-600 text-white',
    };
  }
  if (normName.includes('comp') || normName.includes('cs') || normName.includes('ai') || normName.includes('code') || normName.includes('it')) {
    return {
      bg: 'bg-purple-500/10 dark:bg-purple-500/20',
      text: 'text-purple-700 dark:text-purple-300',
      border: 'border-purple-500/30',
      badge: 'bg-purple-600 text-white',
    };
  }
  if (normName.includes('pe') || normName.includes('sport') || normName.includes('game') || normName.includes('yoga') || normName.includes('pt')) {
    return {
      bg: 'bg-lime-500/10 dark:bg-lime-500/20',
      text: 'text-lime-700 dark:text-lime-300',
      border: 'border-lime-500/30',
      badge: 'bg-lime-600 text-white',
    };
  }
  if (normName.includes('art') || normName.includes('craft') || normName.includes('music') || normName.includes('dance')) {
    return {
      bg: 'bg-pink-500/10 dark:bg-pink-500/20',
      text: 'text-pink-700 dark:text-pink-300',
      border: 'border-pink-500/30',
      badge: 'bg-pink-600 text-white',
    };
  }
  if (normName.includes('lib') || normName.includes('value') || normName.includes('gk') || normName.includes('moral')) {
    return {
      bg: 'bg-sky-500/10 dark:bg-sky-500/20',
      text: 'text-sky-700 dark:text-sky-300',
      border: 'border-sky-500/30',
      badge: 'bg-sky-600 text-white',
    };
  }
  return {
    bg: 'bg-slate-500/10 dark:bg-slate-500/20',
    text: 'text-slate-700 dark:text-slate-300',
    border: 'border-slate-500/30',
    badge: 'bg-slate-600 text-white',
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
  specialization?: string;
}

interface Subject {
  id: string;
  name: string;
  short_name: string | null;
  category: 'core' | 'language' | 'activity' | 'sports';
  weeklyDefault: number;
}

interface DraftSlot {
  teacherId: string;
  subjectId: string;
  room?: string;
  notes?: string;
}

interface TimetableManagerProps {
  allowedCategories?: string[];
}

const db = supabase as any;

const STANDARD_CURRICULUM_SUBJECTS: Subject[] = [
  { id: 'subj-math', name: 'Mathematics', short_name: 'Math', category: 'core', weeklyDefault: 6 },
  { id: 'subj-sci', name: 'Science & EVS', short_name: 'Science', category: 'core', weeklyDefault: 6 },
  { id: 'subj-eng', name: 'English Language', short_name: 'English', category: 'language', weeklyDefault: 5 },
  { id: 'subj-hin', name: 'Hindi', short_name: 'Hindi', category: 'language', weeklyDefault: 5 },
  { id: 'subj-sst', name: 'Social Science (SST)', short_name: 'SST', category: 'core', weeklyDefault: 5 },
  { id: 'subj-cs', name: 'Computer & AI Lab', short_name: 'Computer', category: 'activity', weeklyDefault: 3 },
  { id: 'subj-pe', name: 'Physical Ed & Sports', short_name: 'PE/Sports', category: 'sports', weeklyDefault: 3 },
  { id: 'subj-art', name: 'Art & Music', short_name: 'Art/Music', category: 'activity', weeklyDefault: 2 },
  { id: 'subj-lib', name: 'Library & Values', short_name: 'Library', category: 'activity', weeklyDefault: 1 },
];

export const STANDARD_8_PERIODS: PeriodTiming[] = [
  { period_number: 1, label: 'Period 1', start_time: '07:20', end_time: '07:55', is_break: false },
  { period_number: 2, label: 'Period 2', start_time: '07:55', end_time: '08:30', is_break: false },
  { period_number: 3, label: 'Period 3', start_time: '08:30', end_time: '09:05', is_break: false },
  { period_number: 4, label: 'Period 4', start_time: '09:05', end_time: '09:40', is_break: false },
  { period_number: 5, label: 'Period 5', start_time: '10:00', end_time: '10:35', is_break: false },
  { period_number: 6, label: 'Period 6', start_time: '10:35', end_time: '11:10', is_break: false },
  { period_number: 7, label: 'Period 7', start_time: '11:10', end_time: '11:45', is_break: false },
  { period_number: 8, label: 'Period 8', start_time: '11:45', end_time: '12:15', is_break: false },
];

const TimetableManager: React.FC<TimetableManagerProps> = ({ allowedCategories }) => {
  const { toast } = useToast();
  const categoryOptions = allowedCategories && allowedCategories.length > 0 ? allowedCategories : ALL_CLASS_SECTIONS;

  const [selectedCategory, setSelectedCategory] = useState<string>(categoryOptions[0]);
  const [periods, setPeriods] = useState<PeriodTiming[]>(STANDARD_8_PERIODS);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>(STANDARD_CURRICULUM_SUBJECTS);
  const [draftSlots, setDraftSlots] = useState<Record<string, DraftSlot>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [isExtractorModalOpen, setIsExtractorModalOpen] = useState(false);
  const [activeManagerTab, setActiveManagerTab] = useState<'timetable' | 'substitutions'>('timetable');

  // Quick Slot Edit Modal (when user clicks any cell in the preview)
  const [editingSlot, setEditingSlot] = useState<{ day: number; periodNumber: number } | null>(null);
  const [slotTeacherId, setSlotTeacherId] = useState<string>('');
  const [slotSubjectId, setSlotSubjectId] = useState<string>('');
  const [slotRoom, setSlotRoom] = useState<string>('');

  // AI Strategy Preset
  const [aiPreset, setAiPreset] = useState<'standard' | 'stem' | 'sports' | 'exam'>('standard');

  const slotKey = (day: number, period: number) => `${day}-${period}`;

  // Load all teachers and current timetable
  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [periodRes, teacherAttRes, subjectRes, profilesRes, rolesRes, classTeachersRes] = await Promise.all([
        db.from('period_timings').select('*'),
        db.from('attendance_records')
          .select('id, user_id, device_info')
          .eq('status', 'registered')
          .eq('category', 'Teacher'),
        db.from('subjects').select('*').order('name'),
        db.from('profiles').select('id, user_id, display_name, full_name, username, role'),
        db.from('user_roles').select('user_id, role'),
        db.from('class_teachers').select('teacher_id, teacher_name, teacher_email'),
      ]);

      // Set period timings if available
      const rawPeriods = periodRes.data || [];
      if (rawPeriods.length > 0) {
        const mappedPeriods: PeriodTiming[] = rawPeriods.map((p: any) => {
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
        setPeriods(mappedPeriods);
      } else {
        setPeriods(STANDARD_8_PERIODS);
      }

      // Collect teachers across all sources
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

      // Default faculties if none registered yet
      if (teacherMap.size === 0) {
        teacherMap.set('teacher-1', 'Ritu Dahiya (Mathematics)');
        teacherMap.set('teacher-2', 'Manoj Kumar (Science)');
        teacherMap.set('teacher-3', 'Sunita Sharma (English)');
        teacherMap.set('teacher-4', 'Anil Verma (Hindi)');
        teacherMap.set('teacher-5', 'Priya Singh (Social Science)');
        teacherMap.set('teacher-6', 'Vikram Rathore (Computer)');
        teacherMap.set('teacher-7', 'Rajesh Gupta (PE / Sports)');
      }

      const teacherList: Teacher[] = Array.from(teacherMap.entries()).map(([id, name]) => ({ id, name }));
      setTeachers(teacherList);

      // Load DB subjects or standard curriculum
      const dbSubjects = (subjectRes.data || []).map((s: any) => ({
        id: s.id,
        name: s.name,
        short_name: s.short_name ?? s.code ?? s.name.slice(0, 8),
        category: (s.name.toLowerCase().includes('pe') || s.name.toLowerCase().includes('sport') ? 'sports' : s.name.toLowerCase().includes('eng') || s.name.toLowerCase().includes('hin') ? 'language' : s.name.toLowerCase().includes('cs') || s.name.toLowerCase().includes('art') ? 'activity' : 'core') as any,
        weeklyDefault: 5,
      }));

      if (dbSubjects.length > 0) {
        setSubjects(dbSubjects);
      } else {
        setSubjects(STANDARD_CURRICULUM_SUBJECTS);
      }

      // Load existing timetable for selected class
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
    } catch (err) {
      console.error('Error loading timetable:', err);
    } finally {
      setIsLoading(false);
    }
  }, [selectedCategory]);

  useEffect(() => {
    loadData();
  }, [loadData]);

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

  // 1-CLICK FULLY AUTOMATED AI TIMETABLE GENERATOR
  const handleAiAutoGenerate = (preset = aiPreset) => {
    setIsAiGenerating(true);
    setTimeout(() => {
      try {
        const workingPeriods = periods.filter(p => !p.is_break).map(p => p.period_number);
        if (workingPeriods.length === 0) {
          toast({ title: 'No periods configured', description: 'Using standard 8 periods.', variant: 'destructive' });
          setPeriods(STANDARD_8_PERIODS);
        }

        // Map teachers to subjects smartly
        const subjectTeacherMap = new Map<string, string>();
        subjects.forEach((subj, idx) => {
          const matchingTeacher = teachers.find(t => {
            const tNorm = t.name.toLowerCase();
            const sNorm = subj.name.toLowerCase();
            if (sNorm.includes('math') && tNorm.includes('math')) return true;
            if (sNorm.includes('sci') && tNorm.includes('sci')) return true;
            if (sNorm.includes('eng') && tNorm.includes('eng')) return true;
            if (sNorm.includes('hin') && tNorm.includes('hin')) return true;
            if (sNorm.includes('comp') && (tNorm.includes('comp') || tNorm.includes('cs'))) return true;
            if (sNorm.includes('pe') && (tNorm.includes('pe') || tNorm.includes('sport'))) return true;
            return false;
          });

          subjectTeacherMap.set(subj.id, matchingTeacher?.id || teachers[idx % teachers.length]?.id || teachers[0]?.id || 'faculty-1');
        });

        // Set frequencies based on AI preset
        const subjectQuotas: Record<string, number> = {};
        subjects.forEach(s => {
          const normN = s.name.toLowerCase();
          if (preset === 'stem') {
            if (normN.includes('math')) subjectQuotas[s.id] = 7;
            else if (normN.includes('sci')) subjectQuotas[s.id] = 8;
            else if (normN.includes('comp') || normN.includes('cs')) subjectQuotas[s.id] = 5;
            else if (normN.includes('eng')) subjectQuotas[s.id] = 4;
            else if (normN.includes('soc') || normN.includes('sst')) subjectQuotas[s.id] = 4;
            else subjectQuotas[s.id] = 2;
          } else if (preset === 'sports') {
            if (normN.includes('pe') || normN.includes('sport') || normN.includes('yoga')) subjectQuotas[s.id] = 6;
            else if (normN.includes('art') || normN.includes('music')) subjectQuotas[s.id] = 4;
            else if (normN.includes('math')) subjectQuotas[s.id] = 5;
            else if (normN.includes('sci')) subjectQuotas[s.id] = 5;
            else if (normN.includes('eng')) subjectQuotas[s.id] = 4;
            else subjectQuotas[s.id] = 3;
          } else {
            // Standard CBSE Balanced
            if (normN.includes('math')) subjectQuotas[s.id] = 6;
            else if (normN.includes('sci')) subjectQuotas[s.id] = 6;
            else if (normN.includes('eng')) subjectQuotas[s.id] = 5;
            else if (normN.includes('hin')) subjectQuotas[s.id] = 5;
            else if (normN.includes('soc') || normN.includes('sst')) subjectQuotas[s.id] = 5;
            else if (normN.includes('comp') || normN.includes('cs')) subjectQuotas[s.id] = 3;
            else if (normN.includes('pe') || normN.includes('sport')) subjectQuotas[s.id] = 3;
            else if (normN.includes('art')) subjectQuotas[s.id] = 2;
            else subjectQuotas[s.id] = 1;
          }
        });

        // Build Morning Pool (Core Subjects) and Afternoon Pool (Activities/Labs)
        const morningPool: { subjectId: string; teacherId: string }[] = [];
        const afternoonPool: { subjectId: string; teacherId: string }[] = [];

        subjects.forEach(s => {
          const quota = subjectQuotas[s.id] || s.weeklyDefault || 4;
          const teacherId = subjectTeacherMap.get(s.id) || teachers[0]?.id || 'faculty-1';
          const item = { subjectId: s.id, teacherId };

          if (s.category === 'core' || s.category === 'language') {
            for (let i = 0; i < quota; i++) morningPool.push(item);
          } else {
            for (let i = 0; i < quota; i++) afternoonPool.push(item);
          }
        });

        const nextSlots: Record<string, DraftSlot> = {};
        const pList = periods.filter(p => !p.is_break).map(p => p.period_number);
        const midPoint = Math.ceil(pList.length / 2);
        const morningPeriods = pList.slice(0, midPoint);
        const afternoonPeriods = pList.slice(midPoint);

        const daySubjectTracker: Record<number, Set<string>> = {
          1: new Set(), 2: new Set(), 3: new Set(), 4: new Set(), 5: new Set(), 6: new Set()
        };

        // Morning Core Distribution
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
                room: `Room ${selectedCategory}`,
              };
            }
          }
        }

        // Afternoon Lab & Activity Distribution
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
                room: `Room ${selectedCategory}`,
              };
            }
          }
        }

        setDraftSlots(nextSlots);
        toast({
          title: '✨ AI Timetable Generated',
          description: `Created optimal balanced 48-period timetable for ${getCategoryLabel(selectedCategory)}. Click "Save Timetable" to persist.`,
        });
      } catch (err: any) {
        toast({ title: 'AI Generation Failed', description: err.message, variant: 'destructive' });
      } finally {
        setIsAiGenerating(false);
      }
    }, 400);
  };

  // AI Auto-Fill Empty Slots
  const handleAiFillBlankSlots = () => {
    const next = { ...draftSlots };
    let filled = 0;
    const workingPeriods = periods.filter(p => !p.is_break).map(p => p.period_number);

    for (let day = 1; day <= 6; day++) {
      for (const pNum of workingPeriods) {
        const key = slotKey(day, pNum);
        if (!next[key] || !next[key].subjectId) {
          // pick a suitable subject
          const subjIdx = (day + pNum) % subjects.length;
          const subj = subjects[subjIdx] || subjects[0];
          const tIdx = subjIdx % teachers.length;
          const teacher = teachers[tIdx] || teachers[0];

          next[key] = {
            subjectId: subj.id,
            teacherId: teacher.id,
            room: `Room ${selectedCategory}`,
          };
          filled++;
        }
      }
    }

    setDraftSlots(next);
    toast({ title: '✨ Empty Slots Auto-Filled', description: `Filled ${filled} empty slot(s) with optimal subjects.` });
  };

  // Save to Cloud
  const handleSaveTimetable = async () => {
    setIsSaving(true);
    try {
      const parsed = parseClassSection(selectedCategory);
      const rowsToSave = Object.entries(draftSlots)
        .map(([key, v]) => {
          const [day, period] = key.split('-').map(Number);
          const teacher = teachers.find(t => t.id === v.teacherId);
          if (!teacher || !v.subjectId) return null;
          return {
            class: parsed?.className || null,
            section: parsed?.section || null,
            day_of_week: day,
            period_number: period,
            teacher_id: teacher.id,
            teacher_name: teacher.name,
            subject_id: v.subjectId,
            room: v.room || `Class ${selectedCategory}`,
            notes: v.notes || null,
            metadata: {
              category: selectedCategory,
              class: parsed?.className || null,
              section: parsed?.section || null,
              teacher_record_id: teacher.id,
              teacher_name: teacher.name,
              subject_id: v.subjectId,
              room: v.room || `Class ${selectedCategory}`,
            },
          };
        })
        .filter(Boolean);

      // 1. Clear old records
      if (parsed) {
        await db.from('timetable').delete().eq('class', parsed.className).eq('section', parsed.section);
      }
      await db.from('timetable').delete().eq('category', selectedCategory);

      // 2. Insert new records
      if (rowsToSave.length > 0) {
        const { error } = await db.from('timetable').insert(rowsToSave);
        if (error) {
          // Fallback legacy insert
          const legacyRows = rowsToSave.map((r: any) => ({
            category: selectedCategory,
            day_of_week: r.day_of_week,
            period_number: r.period_number,
            teacher_record_id: r.teacher_id,
            teacher_name: r.teacher_name,
            subject_id: r.subject_id,
          }));
          await db.from('timetable').insert(legacyRows);
        }
      }

      toast({
        title: '✅ Timetable Saved & Live',
        description: `Successfully published timetable for ${getCategoryLabel(selectedCategory)}.`,
      });
      loadData();
    } catch (err: any) {
      toast({ title: 'Save Failed', description: err.message, variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  // Apply extracted timetable from photo
  const handleApplyExtractedTimetable = async (result: ExtractedTimetableResult, autoSaveToCloud = false) => {
    const nextDraft: Record<string, DraftSlot> = {};
    result.slots.forEach((s) => {
      if (s.dayNumber && s.period_number && s.subjectId) {
        nextDraft[slotKey(s.dayNumber, s.period_number)] = {
          teacherId: s.teacherId || teachers[0]?.id || '',
          subjectId: s.subjectId,
          room: s.room || `Class ${selectedCategory}`,
          notes: s.notes || '',
        };
      }
    });

    setDraftSlots(nextDraft);

    if (autoSaveToCloud) {
      setIsSaving(true);
      try {
        const parsed = parseClassSection(selectedCategory);
        const rowsToSave = Object.entries(nextDraft)
          .map(([key, v]) => {
            const [day, period] = key.split('-').map(Number);
            const teacher = teachers.find(t => t.id === v.teacherId);
            if (!teacher || !v.subjectId) return null;
            return {
              class: parsed?.className || null,
              section: parsed?.section || null,
              day_of_week: day,
              period_number: period,
              teacher_id: teacher.id,
              teacher_name: teacher.name,
              subject_id: v.subjectId,
              room: v.room || `Class ${selectedCategory}`,
              notes: v.notes || null,
              metadata: {
                category: selectedCategory,
                class: parsed?.className || null,
                section: parsed?.section || null,
                teacher_record_id: teacher.id,
                teacher_name: teacher.name,
                subject_id: v.subjectId,
                room: v.room || `Class ${selectedCategory}`,
              },
            };
          })
          .filter(Boolean);

        if (parsed) {
          await db.from('timetable').delete().eq('class', parsed.className).eq('section', parsed.section);
        }
        await db.from('timetable').delete().eq('category', selectedCategory);

        if (rowsToSave.length > 0) {
          const { error } = await db.from('timetable').insert(rowsToSave);
          if (error) {
            const legacyRows = rowsToSave.map((r: any) => ({
              category: selectedCategory,
              day_of_week: r.day_of_week,
              period_number: r.period_number,
              teacher_record_id: r.teacher_id,
              teacher_name: r.teacher_name,
              subject_id: r.subject_id,
            }));
            await db.from('timetable').insert(legacyRows);
          }
        }

        toast({
          title: '✅ Timetable Extracted & Saved to Cloud',
          description: `Successfully configured and published timetable for ${getCategoryLabel(selectedCategory)}.`,
        });
        loadData();
      } catch (e: any) {
        toast({ title: 'Save Failed', description: e.message, variant: 'destructive' });
      } finally {
        setIsSaving(false);
      }
    } else {
      toast({
        title: '✨ Timetable Configured from Photo',
        description: 'Schedule extracted and teachers assigned by subject. Review and click Save Timetable when ready.',
      });
    }
  };

  // Open Cell Quick Edit Dialog
  const handleOpenCellEditor = (day: number, periodNumber: number) => {
    const key = slotKey(day, periodNumber);
    const existing = draftSlots[key];
    setEditingSlot({ day, periodNumber });
    setSlotTeacherId(existing?.teacherId || teachers[0]?.id || '');
    setSlotSubjectId(existing?.subjectId || subjects[0]?.id || '');
    setSlotRoom(existing?.room || `Class ${selectedCategory}`);
  };

  const handleSaveCellEdit = () => {
    if (!editingSlot) return;
    const key = slotKey(editingSlot.day, editingSlot.periodNumber);
    if (!slotSubjectId || !slotTeacherId) {
      setDraftSlots(prev => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    } else {
      setDraftSlots(prev => ({
        ...prev,
        [key]: {
          teacherId: slotTeacherId,
          subjectId: slotSubjectId,
          room: slotRoom,
        },
      }));
    }
    setEditingSlot(null);
    toast({ title: 'Slot Updated', description: 'Click Save Timetable to persist changes.' });
  };

  const handleClearCell = () => {
    if (!editingSlot) return;
    const key = slotKey(editingSlot.day, editingSlot.periodNumber);
    setDraftSlots(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setEditingSlot(null);
  };

  // Print Timetable HTML
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
                let rowHtml = `<tr>
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

                if (p.period_number === 4) {
                  rowHtml += `<tr>
                    <td class="break-cell"><strong>Lunch Break</strong><br><small>09:40 - 10:00</small></td>
                    <td colspan="6" class="break-cell">🥪 RECESS & LUNCH BREAK (09:40 AM – 10:00 AM)</td>
                  </tr>`;
                }

                return rowHtml;
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

  const totalAllocated = Object.values(draftSlots).filter(s => s.subjectId && s.teacherId).length;

  return (
    <div className="space-y-4">
      {/* Top View Mode Switcher */}
      <div className="flex items-center justify-between gap-3 p-1.5 rounded-2xl bg-card/60 border border-border/40 backdrop-blur-xl">
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant={activeManagerTab === 'timetable' ? 'default' : 'ghost'}
            onClick={() => setActiveManagerTab('timetable')}
            className={cn(
              'h-8 px-3.5 text-xs font-bold rounded-xl gap-1.5 transition-all',
              activeManagerTab === 'timetable' ? 'shadow-md shadow-primary/20' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <CalendarDays className="h-3.5 w-3.5" /> Class Timetables
          </Button>

          <Button
            size="sm"
            variant={activeManagerTab === 'substitutions' ? 'default' : 'ghost'}
            onClick={() => setActiveManagerTab('substitutions')}
            className={cn(
              'h-8 px-3.5 text-xs font-bold rounded-xl gap-1.5 transition-all',
              activeManagerTab === 'substitutions' ? 'bg-gradient-to-r from-rose-600 to-purple-600 text-white shadow-md shadow-rose-600/20' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Users className="h-3.5 w-3.5" /> Faculty Substitutions & Leave
          </Button>
        </div>
      </div>

      {activeManagerTab === 'substitutions' ? (
        <SubstitutionReport />
      ) : (
        <>
          {/* Top AI Automation Command Bar */}
          <div className="p-4 sm:p-5 rounded-3xl bg-gradient-to-r from-blue-950/40 via-indigo-950/30 to-purple-950/40 border border-primary/20 backdrop-blur-2xl shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-blue-600/30 shrink-0">
                <Sparkles className="h-6 w-6" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-base sm:text-lg font-extrabold text-foreground tracking-tight">
                    AI Smart Timetable Generator
                  </h2>
                  <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30 text-xs font-semibold">
                    {totalAllocated}/48 Periods Active
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  1-Click automated scheduling with zero human effort • Balanced pedagogy & teacher allocation
                </p>
              </div>
            </div>

        {/* 1-Click AI Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Preset Selector */}
          <Select value={aiPreset} onValueChange={(val: any) => setAiPreset(val)}>
            <SelectTrigger className="h-9 text-xs rounded-xl bg-background/80 border-border/80 w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="standard" className="text-xs">🏫 CBSE Standard</SelectItem>
              <SelectItem value="stem" className="text-xs">🔬 STEM & Science</SelectItem>
              <SelectItem value="sports" className="text-xs">🏃 Sports & Activity</SelectItem>
              <SelectItem value="exam" className="text-xs">📖 Revision Mode</SelectItem>
            </SelectContent>
          </Select>

          {/* Extract Timetable from Photo Button */}
          <Button
            size="sm"
            onClick={() => setIsExtractorModalOpen(true)}
            className="h-9 px-3.5 text-xs font-extrabold bg-gradient-to-r from-purple-600 via-pink-600 to-rose-600 hover:from-purple-700 hover:to-rose-700 text-white rounded-xl shadow-lg shadow-purple-600/25 gap-1.5 transition-all hover:scale-105 active:scale-95"
            title="Scan or upload photo of printed timetable"
          >
            <Camera className="h-4 w-4" />
            Extract from Photo
          </Button>

          {/* Glowing 1-Click Auto-Generate Button */}
          <Button
            size="sm"
            onClick={() => handleAiAutoGenerate()}
            disabled={isAiGenerating}
            className="h-9 px-4 text-xs font-extrabold bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white rounded-xl shadow-lg shadow-indigo-600/30 gap-1.5 transition-all hover:scale-105 active:scale-95"
          >
            {isAiGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
            AI Auto-Schedule (1-Click)
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={handleAiFillBlankSlots}
            className="h-9 px-3 text-xs rounded-xl border-border/80 hover:bg-muted font-semibold gap-1.5"
            title="Auto-fill empty period slots"
          >
            <Zap className="h-3.5 w-3.5 text-amber-500" />
            Auto-Fill Blanks
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={handlePrintTimetable}
            className="h-9 px-3 text-xs rounded-xl border-border/80 hover:bg-muted font-semibold gap-1.5"
          >
            <Printer className="h-3.5 w-3.5" />
            Print
          </Button>

          <Button
            size="sm"
            onClick={handleSaveTimetable}
            disabled={isSaving}
            className="h-9 px-4 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-md shadow-emerald-600/25 gap-1.5"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Save Timetable
          </Button>
        </div>
      </div>

      {/* Class Selector Bar if multiple classes available */}
      {categoryOptions.length > 1 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <span className="text-xs font-semibold text-muted-foreground shrink-0">Class:</span>
          {categoryOptions.map(cat => (
            <Button
              key={cat}
              size="sm"
              variant={selectedCategory === cat ? 'default' : 'outline'}
              onClick={() => setSelectedCategory(cat)}
              className={`text-xs h-7 rounded-xl ${selectedCategory === cat ? 'bg-blue-600 text-white font-bold shadow-sm' : ''}`}
            >
              {getCategoryLabel(cat)}
            </Button>
          ))}
        </div>
      )}

      {/* Main Interactive Visual Schedule Grid */}
      <Card className="rounded-3xl border shadow-lg bg-card/70 backdrop-blur-xl overflow-hidden">
        <CardHeader className="pb-3 border-b bg-gradient-to-r from-muted/40 to-muted/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-primary" />
              Live Weekly Timetable — {getCategoryLabel(selectedCategory)}
            </CardTitle>
            <CardDescription className="text-xs">
              Click any period slot to easily change faculty or subject in one tap
            </CardDescription>
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" /> Math
            <span className="inline-block w-2 h-2 rounded-full bg-cyan-500 ml-2" /> Science
            <span className="inline-block w-2 h-2 rounded-full bg-indigo-500 ml-2" /> English
            <span className="inline-block w-2 h-2 rounded-full bg-purple-500 ml-2" /> CS / AI
            <span className="inline-block w-2 h-2 rounded-full bg-lime-500 ml-2" /> Sports
          </div>
        </CardHeader>

        <CardContent className="p-3 sm:p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border bg-background/50">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-muted/60 border-b">
                    <th className="p-3 text-left font-extrabold text-muted-foreground min-w-[110px]">
                      Period / Time
                    </th>
                    {DAYS.map(day => (
                      <th key={day} className="p-3 text-center font-extrabold text-foreground min-w-[145px]">
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
                          <td className="p-3 font-bold text-amber-700 dark:text-amber-300">
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
                      <React.Fragment key={period.id || period.period_number}>
                        <tr className="hover:bg-muted/30 transition-colors">
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
                              <td key={dIdx} className="p-1.5 border-r border-border/40 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleOpenCellEditor(day, period.period_number)}
                                  className="w-full py-3 rounded-xl border border-dashed border-border/60 text-[11px] text-muted-foreground/60 hover:border-primary hover:text-primary hover:bg-primary/5 transition-all"
                                >
                                  + Assign
                                </button>
                              </td>
                            );
                          }

                          return (
                            <td key={dIdx} className="p-1.5 border-r border-border/40 align-top">
                              <button
                                type="button"
                                onClick={() => handleOpenCellEditor(day, period.period_number)}
                                className={`w-full text-left p-2.5 rounded-2xl border ${theme.bg} ${theme.border} transition-all hover:scale-[1.02] hover:shadow-md active:scale-95 space-y-1`}
                              >
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
                              </button>
                            </td>
                          );
                        })}
                      </tr>

                      {/* Recess / Lunch Break Banner between Period 4 and Period 5 */}
                      {period.period_number === 4 && (
                        <tr className="bg-amber-500/10 dark:bg-amber-500/15 border-y-2 border-amber-500/30">
                          <td className="p-2.5 font-bold text-amber-700 dark:text-amber-300 bg-amber-500/20 border-r border-amber-500/30">
                            <div className="text-xs font-extrabold flex items-center gap-1">
                              🥪 Lunch Break
                            </div>
                            <div className="text-[10px] text-amber-700 dark:text-amber-300 font-mono font-semibold mt-0.5">
                              09:40 – 10:00
                            </div>
                          </td>
                          <td colSpan={6} className="p-2.5 text-center font-extrabold tracking-widest text-amber-700 dark:text-amber-300 text-xs bg-amber-500/5">
                            🥪 RECESS & LUNCH BREAK • 09:40 AM – 10:00 AM (20 MIN)
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Cell Edit Modal */}
      <Dialog open={Boolean(editingSlot)} onOpenChange={open => !open && setEditingSlot(null)}>
        <DialogContent className="sm:max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-primary" />
              Edit Period Slot — {editingSlot ? `${DAYS[editingSlot.day - 1]} Period ${editingSlot.periodNumber}` : ''}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Select the subject and faculty teacher for this specific period slot
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs font-semibold text-muted-foreground">Subject:</label>
              <Select value={slotSubjectId} onValueChange={setSlotSubjectId}>
                <SelectTrigger className="h-9 text-xs mt-1 rounded-xl">
                  <SelectValue placeholder="Select Subject" />
                </SelectTrigger>
                <SelectContent>
                  {subjects.map(s => (
                    <SelectItem key={s.id} value={s.id} className="text-xs">
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground">Faculty Teacher:</label>
              <Select value={slotTeacherId} onValueChange={setSlotTeacherId}>
                <SelectTrigger className="h-9 text-xs mt-1 rounded-xl">
                  <SelectValue placeholder="Select Teacher" />
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

            <div>
              <label className="text-xs font-semibold text-muted-foreground">Room / Lab (Optional):</label>
              <input
                type="text"
                value={slotRoom}
                onChange={e => setSlotRoom(e.target.value)}
                placeholder="e.g. Science Lab 2"
                className="w-full h-9 px-3 text-xs rounded-xl border bg-background mt-1"
              />
            </div>
          </div>

          <DialogFooter className="flex items-center justify-between sm:justify-between gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleClearCell}
              className="text-xs text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 rounded-xl"
            >
              <Trash2 className="h-3.5 w-3.5 mr-1" />
              Clear Slot
            </Button>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setEditingSlot(null)}
                className="text-xs rounded-xl"
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleSaveCellEdit}
                className="text-xs bg-primary hover:bg-primary/90 text-white font-bold rounded-xl px-4"
              >
                Apply Slot
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </>
      )}

      {/* AI Timetable Photo Extractor Modal */}
      <TimetablePhotoExtractorModal
        open={isExtractorModalOpen}
        onOpenChange={setIsExtractorModalOpen}
        selectedCategory={selectedCategory}
        knownSubjects={subjects}
        knownTeachers={teachers}
        onApply={handleApplyExtractedTimetable}
      />
    </div>
  );
};

export default TimetableManager;
