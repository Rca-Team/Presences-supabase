import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  Loader2, Save, Trash2, CalendarDays, BookOpen, AlertTriangle,
  Plus, Clock, Copy, Eraser, Sparkles, Upload, Image as ImageIcon, Wand2,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { ALL_CLASS_SECTIONS, getCategoryLabel } from '@/constants/schoolConfig';
import { parseClassSection } from '@/utils/teacherAccess';

const DAY_INDEX: Record<string, number> = {
  monday: 1, mon: 1,
  tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4, thurs: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
};

const norm = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

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

interface TimetableManagerProps {
  allowedCategories?: string[];
}

const db = supabase as any;

const TimetableManager: React.FC<TimetableManagerProps> = ({ allowedCategories }) => {
  const { toast } = useToast();
  const categoryOptions = allowedCategories && allowedCategories.length > 0 ? allowedCategories : ALL_CLASS_SECTIONS;

  const [periods, setPeriods] = useState<PeriodTiming[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [draftSlots, setDraftSlots] = useState<Record<string, DraftSlot>>({});
  const [validationIssues, setValidationIssues] = useState<ValidationIssue[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>(categoryOptions[0]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

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
      const [periodRes, teacherRes, subjectRes] = await Promise.all([
        db.from('period_timings').select('*'),
        db.from('attendance_records')
          .select('id, user_id, device_info, image_url')
          .eq('status', 'registered')
          .eq('category', 'Teacher'),
        db.from('subjects').select('*').order('name'),
      ]);

      const rawPeriods = periodRes.data || [];
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

      const teacherList = (teacherRes.data || []).map((r: any) => {
        const meta = (r.device_info as any)?.metadata || {};
        return { id: r.user_id || r.id, name: meta.name || 'Unknown Teacher' };
      }).filter((t: Teacher) => t.name !== 'Unknown Teacher');
      setTeachers(teacherList);

      setSubjects((subjectRes.data || []).map((s: any) => ({
        id: s.id,
        name: s.name,
        short_name: s.short_name ?? s.code ?? null,
        class: s.class ?? null,
        section: s.section ?? null,
      })));

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
      console.error(e);
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

  const filteredSubjects = useMemo(() => {
    const parsed = parseClassSection(selectedCategory);
    if (!parsed) return subjects;
    const byClass = subjects.filter((s) => s.class === parsed.className && s.section === parsed.section);
    if (byClass.length > 0) return byClass;
    return subjects.filter((s) => !s.class && !s.section);
  }, [selectedCategory, subjects]);

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

  const updatePeriodField = (idx: number, patch: Partial<PeriodTiming>) => {
    setPeriods((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  };

  const persistPeriod = async (p: PeriodTiming) => {
    try {
      await savePeriodRow(p);
      toast({ title: 'Period saved' });
    } catch (e: any) {
      toast({ title: 'Failed', description: e.message || 'Could not save', variant: 'destructive' });
    }
  };

  const deletePeriod = async (p: PeriodTiming) => {
    if (!p.id) return;
    if (!confirm(`Delete "${p.label || `Period ${p.period_number}`}"? Any timetable entries for this period will be removed too.`)) return;
    try {
      await db.from('period_timings').delete().eq('id', p.id);
      // Remove from local draft
      setDraftSlots((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((k) => {
          if (k.endsWith(`-${p.period_number}`)) delete next[k];
        });
        return next;
      });
      toast({ title: 'Period deleted' });
      fetchData();
    } catch (e: any) {
      toast({ title: 'Failed', description: e.message || 'Could not delete', variant: 'destructive' });
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
      // Clear target day
      Object.keys(next).forEach((k) => {
        if (k.startsWith(`${toDay}-`)) delete next[k];
      });
      // Copy from source
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
    if (!confirm('Clear the entire timetable for this class? This only clears the draft — click Save to persist.')) return;
    setDraftSlots({});
  };

  // ============ Save timetable ============

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

      toast({ title: 'Saved', description: `Timetable for ${getCategoryLabel(selectedCategory)} saved.` });
      fetchData();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message || 'Failed to save', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const filledCount = Object.values(draftSlots).filter((s) => s.teacherId && s.subjectId).length;

  // ============ AI photo extraction ============
  const [extractOpen, setExtractOpen] = useState(false);
  const [extractFile, setExtractFile] = useState<File | null>(null);
  const [extractPreview, setExtractPreview] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extractResult, setExtractResult] = useState<any | null>(null);
  const [importPeriods, setImportPeriods] = useState(true);
  const [autoCreateSubjects, setAutoCreateSubjects] = useState(true);

  const onPickPhoto = async (file: File | null) => {
    setExtractResult(null);
    setExtractFile(file);
    if (!file) { setExtractPreview(null); return; }
    // Downscale to keep payload well under edge-function body limits.
    try {
      const bmp = await createImageBitmap(file);
      const maxDim = 1600;
      const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
      const w = Math.round(bmp.width * scale);
      const h = Math.round(bmp.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(bmp, 0, 0, w, h);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      setExtractPreview(dataUrl);
    } catch {
      const reader = new FileReader();
      reader.onload = () => setExtractPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const runExtract = async () => {
    if (!extractPreview) return;
    setExtracting(true);
    setExtractResult(null);
    try {
      const parsed = parseClassSection(selectedCategory);
      const { data, error } = await supabase.functions.invoke('extract-timetable-photo', {
        body: {
          fileData: extractPreview,
          className: parsed?.className || null,
          section: parsed?.section || null,
          knownSubjects: filteredSubjects.map((s) => ({ name: s.name, short_name: s.short_name })),
          knownTeachers: teachers.map((t) => ({ name: t.name })),
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setExtractResult(data);
      const nSlots = Array.isArray((data as any)?.slots) ? (data as any).slots.length : 0;
      const nPeriods = Array.isArray((data as any)?.periods) ? (data as any).periods.length : 0;
      toast({ title: 'Extracted', description: `${nSlots} slots • ${nPeriods} periods detected. Review below and Apply.` });
    } catch (e: any) {
      toast({ title: 'Extraction failed', description: e.message || 'AI could not read this image', variant: 'destructive' });
    } finally {
      setExtracting(false);
    }
  };

  const applyExtraction = async () => {
    if (!extractResult) return;
    const result = extractResult;
    const parsed = parseClassSection(selectedCategory);
    setExtracting(true);
    try {
      // 1. Optionally import period timings (add missing ones)
      let workingPeriods = [...periods];
      if (importPeriods && Array.isArray(result.periods)) {
        for (const p of result.periods) {
          const num = Number(p.period_number);
          if (!num) continue;
          if (workingPeriods.find((wp) => wp.period_number === num)) continue;
          const row: PeriodTiming = {
            period_number: num,
            start_time: (p.start_time || '09:00') + ':00'.slice((p.start_time || '').length >= 5 ? 3 : 0),
            end_time: (p.end_time || '09:45') + ':00'.slice((p.end_time || '').length >= 5 ? 3 : 0),
            is_break: !!p.is_break,
            label: p.label || null,
          };
          // normalize HH:MM -> HH:MM:SS if needed
          if (row.start_time && row.start_time.length === 5) row.start_time += ':00';
          if (row.end_time && row.end_time.length === 5) row.end_time += ':00';
          try {
            const newId = await savePeriodRow(row);
            workingPeriods.push({ ...row, id: newId });
          } catch (err) { console.error('period save', err); }
        }
        workingPeriods.sort((a, b) => a.period_number - b.period_number);
      }

      // 2. Build subject map (auto-create if allowed)
      let workingSubjects = [...subjects];
      const findSubject = (needle: string, short?: string | null) => {
        const n = norm(needle);
        const sn = short ? norm(short) : '';
        return workingSubjects.find((s) => {
          const sameClass = !s.class || (s.class === parsed?.className && s.section === parsed?.section);
          if (!sameClass) return false;
          return norm(s.name) === n || (s.short_name && norm(s.short_name) === n)
            || (sn && ((s.short_name && norm(s.short_name) === sn) || norm(s.name) === sn));
        }) || workingSubjects.find((s) =>
          norm(s.name) === n || (s.short_name && norm(s.short_name) === n)
          || (sn && ((s.short_name && norm(s.short_name) === sn) || norm(s.name) === sn))
        );
      };
      const ensureSubject = async (name: string, short?: string | null): Promise<string | null> => {
        if (!name) return null;
        const existing = findSubject(name, short);
        if (existing) return existing.id;
        if (!autoCreateSubjects) return null;
        const row: any = {
          name: name.trim(),
          short_name: (short || name).trim().slice(0, 12),
          code: (short || name).trim().slice(0, 12),
          class: parsed?.className || null,
          section: parsed?.section || null,
        };
        const { data, error } = await db.from('subjects').insert(row).select('id, name, short_name, class, section').single();
        if (error) { console.error('subject', error); return null; }
        workingSubjects.push({
          id: data.id, name: data.name,
          short_name: data.short_name ?? null,
          class: data.class ?? null, section: data.section ?? null,
        });
        return data.id;
      };

      // 3. Teacher matcher
      const findTeacher = (name?: string | null) => {
        if (!name) return '';
        const n = norm(name);
        const t = teachers.find((t) => norm(t.name) === n)
          || teachers.find((t) => norm(t.name).includes(n) || n.includes(norm(t.name)));
        return t?.id || '';
      };

      // 4. Build draft slots
      const next: Record<string, DraftSlot> = { ...draftSlots };
      let applied = 0, skippedNoPeriod = 0, skippedNoSubject = 0;
      for (const s of (result.slots || [])) {
        const dayNum = DAY_INDEX[String(s.day || '').toLowerCase()];
        const perNum = Number(s.period_number);
        if (!dayNum || !perNum) continue;
        const periodExists = workingPeriods.find((p) => p.period_number === perNum);
        if (!periodExists) { skippedNoPeriod++; continue; }
        if (periodExists.is_break) continue;
        const subjName = s.subject || s.subject_short || '';
        const subjectId = await ensureSubject(subjName, s.subject_short);
        if (!subjectId) { skippedNoSubject++; continue; }
        next[slotKey(dayNum, perNum)] = {
          teacherId: findTeacher(s.teacher),
          subjectId,
          room: s.room || '',
          notes: s.notes || '',
        };
        applied++;
      }
      setDraftSlots(next);
      // Refresh periods + subjects from DB in background
      fetchData();

      toast({
        title: 'Applied to draft',
        description: `${applied} slots filled${skippedNoPeriod ? ` • ${skippedNoPeriod} skipped (no period)` : ''}${skippedNoSubject ? ` • ${skippedNoSubject} skipped (no subject)` : ''}. Review then Save.`,
      });
      setExtractOpen(false);
      setExtractFile(null);
      setExtractPreview(null);
      setExtractResult(null);
    } catch (e: any) {
      toast({ title: 'Apply failed', description: e.message || 'Could not apply extraction', variant: 'destructive' });
    } finally {
      setExtracting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarDays className="h-5 w-5 text-primary" />
              Timetable Manager
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categoryOptions.map((cat) => (
                    <SelectItem key={cat} value={cat}>{getCategoryLabel(cat)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" variant="outline" onClick={() => setExtractOpen(true)} className="gap-1">
                <Sparkles className="w-4 h-4 text-primary" /> Extract from photo
              </Button>
              <Button size="sm" variant="outline" onClick={clearAll}>
                <Eraser className="w-4 h-4 mr-1" /> Clear all
              </Button>
              <Button size="sm" onClick={saveTimetable} disabled={isSaving}>
                {isSaving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
                Save
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <Badge variant="outline">Class: {getCategoryLabel(selectedCategory)}</Badge>
            <Badge variant="secondary">Filled slots: {filledCount}</Badge>
            <Badge variant="outline">Periods: {periods.length}</Badge>
          </div>
        </CardHeader>
      </Card>

      {/* Periods editor */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Clock className="h-4 w-4 text-primary" /> Period timings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {periods.length === 0 && (
            <p className="text-sm text-muted-foreground">No periods yet. Add one below.</p>
          )}
          {periods.map((p, idx) => (
            <div key={p.id || idx} className="grid grid-cols-12 gap-2 items-center border rounded-md p-2">
              <Input
                type="number" min={1}
                className="col-span-2 sm:col-span-1 h-8 text-xs"
                value={p.period_number}
                onChange={(e) => updatePeriodField(idx, { period_number: Number(e.target.value) || 0 })}
              />
              <Input
                className="col-span-4 sm:col-span-3 h-8 text-xs"
                placeholder="Label (optional)"
                value={p.label || ''}
                onChange={(e) => updatePeriodField(idx, { label: e.target.value })}
              />
              <Input
                type="time" className="col-span-3 sm:col-span-2 h-8 text-xs"
                value={p.start_time?.slice(0, 5) || ''}
                onChange={(e) => updatePeriodField(idx, { start_time: e.target.value })}
              />
              <Input
                type="time" className="col-span-3 sm:col-span-2 h-8 text-xs"
                value={p.end_time?.slice(0, 5) || ''}
                onChange={(e) => updatePeriodField(idx, { end_time: e.target.value })}
              />
              <div className="col-span-6 sm:col-span-2 flex items-center gap-2">
                <Switch
                  checked={p.is_break}
                  onCheckedChange={(v) => updatePeriodField(idx, { is_break: v })}
                />
                <Label className="text-xs">Break</Label>
              </div>
              <div className="col-span-6 sm:col-span-2 flex items-center justify-end gap-1">
                <Button size="sm" variant="outline" onClick={() => persistPeriod(p)}>
                  <Save className="w-3 h-3" />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => deletePeriod(p)}>
                  <Trash2 className="w-3 h-3 text-destructive" />
                </Button>
              </div>
            </div>
          ))}

          {/* Add new period */}
          <div className="grid grid-cols-12 gap-2 items-center border-2 border-dashed rounded-md p-2">
            <Input
              type="number" min={1}
              className="col-span-2 sm:col-span-1 h-8 text-xs"
              value={newPeriod.period_number}
              onChange={(e) => setNewPeriod({ ...newPeriod, period_number: Number(e.target.value) || 0 })}
            />
            <Input
              className="col-span-4 sm:col-span-3 h-8 text-xs"
              placeholder="Label e.g. Morning Assembly"
              value={newPeriod.label || ''}
              onChange={(e) => setNewPeriod({ ...newPeriod, label: e.target.value })}
            />
            <Input
              type="time" className="col-span-3 sm:col-span-2 h-8 text-xs"
              value={newPeriod.start_time}
              onChange={(e) => setNewPeriod({ ...newPeriod, start_time: e.target.value })}
            />
            <Input
              type="time" className="col-span-3 sm:col-span-2 h-8 text-xs"
              value={newPeriod.end_time}
              onChange={(e) => setNewPeriod({ ...newPeriod, end_time: e.target.value })}
            />
            <div className="col-span-6 sm:col-span-2 flex items-center gap-2">
              <Switch checked={newPeriod.is_break} onCheckedChange={(v) => setNewPeriod({ ...newPeriod, is_break: v })} />
              <Label className="text-xs">Break</Label>
            </div>
            <div className="col-span-6 sm:col-span-2 flex justify-end">
              <Button size="sm" onClick={addPeriod}><Plus className="w-3 h-3 mr-1" />Add</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Subjects inline add */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <BookOpen className="h-4 w-4 text-primary" /> Subjects for {getCategoryLabel(selectedCategory)}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-1">
            {filteredSubjects.length === 0 && (
              <span className="text-xs text-muted-foreground">No subjects yet — add one below.</span>
            )}
            {filteredSubjects.map((s) => (
              <Badge key={s.id} variant="secondary" className="text-xs">
                {s.short_name || s.name}
              </Badge>
            ))}
          </div>
          <div className="grid grid-cols-12 gap-2 items-center">
            <Input
              className="col-span-5 h-8 text-xs" placeholder="Subject name (e.g. Mathematics)"
              value={newSubjectName} onChange={(e) => setNewSubjectName(e.target.value)}
            />
            <Input
              className="col-span-4 h-8 text-xs" placeholder="Short (e.g. Math)"
              value={newSubjectShort} onChange={(e) => setNewSubjectShort(e.target.value)}
            />
            <div className="col-span-3 flex justify-end">
              <Button size="sm" onClick={addSubject} disabled={addingSubject || !newSubjectName.trim()}>
                {addingSubject ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Plus className="w-3 h-3 mr-1" />}
                Add subject
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Timetable grid */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Weekly grid</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : teachers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p className="text-sm">No teachers registered. Register teachers with category "Teacher" first.</p>
            </div>
          ) : periods.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p className="text-sm">Add at least one period above before editing the grid.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {validationIssues.length > 0 && (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-destructive mt-0.5" />
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-destructive">Fix these issues before saving</p>
                      <ul className="list-disc pl-4 space-y-1">
                        {validationIssues.slice(0, 8).map((issue) => (
                          <li key={issue.key} className="text-xs text-destructive">{issue.message}</li>
                        ))}
                        {validationIssues.length > 8 && (
                          <li className="text-xs text-destructive">+{validationIssues.length - 8} more</li>
                        )}
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr>
                      <th className="border border-border bg-muted p-2 text-left text-xs font-semibold min-w-[110px]">Period</th>
                      {DAYS.map((day, i) => (
                        <th key={day} className="border border-border bg-muted p-2 text-xs font-semibold min-w-[220px]">
                          <div className="flex items-center justify-between gap-1">
                            <span>{day}</span>
                            <div className="flex items-center gap-1">
                              <Select value="" onValueChange={(val) => copyDay(Number(val), i + 1)}>
                                <SelectTrigger className="h-6 w-6 p-0 border-none" title="Copy from another day">
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
                    {periods.map((period) => (
                      <tr key={period.id || period.period_number}>
                        <td className={`border border-border p-2 ${period.is_break ? 'bg-amber-500/10' : ''}`}>
                          <div className="text-xs font-medium">{period.label || `Period ${period.period_number}`}</div>
                          <div className="text-[10px] text-muted-foreground">
                            {period.start_time?.slice(0, 5)} – {period.end_time?.slice(0, 5)}
                          </div>
                        </td>
                        {DAYS.map((_, dayIndex) => {
                          if (period.is_break) {
                            return (
                              <td key={dayIndex} className="border border-border p-2 bg-amber-500/10 text-center">
                                <span className="text-xs text-muted-foreground italic">Break</span>
                              </td>
                            );
                          }

                          const day = dayIndex + 1;
                          const key = slotKey(day, period.period_number);
                          const slot = draftSlots[key] || { teacherId: '', subjectId: '', room: '', notes: '' };
                          const subjectLabel = getSubjectName(slot.subjectId || null);

                          return (
                            <td key={dayIndex} className="border border-border p-1 align-top">
                              <div className="space-y-1">
                                <Select
                                  value={slot.teacherId}
                                  onValueChange={(val) => patchSlot(day, period.period_number, { teacherId: val })}
                                >
                                  <SelectTrigger className="h-7 text-[10px] border-dashed">
                                    <SelectValue placeholder="Teacher" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {teachers.map((t) => (
                                      <SelectItem key={t.id} value={t.id} className="text-xs">{t.name}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>

                                <Select
                                  value={slot.subjectId}
                                  onValueChange={(val) => patchSlot(day, period.period_number, { subjectId: val })}
                                >
                                  <SelectTrigger className="h-7 text-[10px] border-dashed">
                                    <SelectValue placeholder="Subject" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {filteredSubjects.map((s) => (
                                      <SelectItem key={s.id} value={s.id} className="text-xs">
                                        <BookOpen className="w-3 h-3 inline mr-1" />{s.short_name || s.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>

                                <Input
                                  className="h-6 text-[10px]" placeholder="Room"
                                  value={slot.room || ''}
                                  onChange={(e) => patchSlot(day, period.period_number, { room: e.target.value })}
                                />
                                <Input
                                  className="h-6 text-[10px]" placeholder="Notes"
                                  value={slot.notes || ''}
                                  onChange={(e) => patchSlot(day, period.period_number, { notes: e.target.value })}
                                />

                                <div className="flex items-center justify-between gap-1 min-h-[18px]">
                                  {slot.teacherId && subjectLabel ? (
                                    <Badge variant="secondary" className="text-[10px] h-4 px-1.5 truncate max-w-[130px]">
                                      {subjectLabel}
                                    </Badge>
                                  ) : (
                                    <span className="text-[9px] text-muted-foreground">Not set</span>
                                  )}
                                  {(slot.teacherId || slot.subjectId || slot.room || slot.notes) && (
                                    <Button
                                      variant="ghost" size="icon" className="h-5 w-5 shrink-0"
                                      onClick={() => removeSlot(day, period.period_number)}
                                    >
                                      <Trash2 className="w-3 h-3 text-destructive" />
                                    </Button>
                                  )}
                                </div>
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* AI Extraction Dialog */}
      <Dialog open={extractOpen} onOpenChange={(o) => { if (!extracting) setExtractOpen(o); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" /> Extract timetable from photo
            </DialogTitle>
            <DialogDescription>
              Upload a clear photo of a printed/handwritten class timetable. AI will read the grid and pre-fill the draft for <b>{getCategoryLabel(selectedCategory)}</b>. Review then click Save to persist.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {!extractPreview && (
              <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg p-8 cursor-pointer hover:bg-muted/40 transition">
                <Upload className="w-8 h-8 text-muted-foreground" />
                <span className="text-sm font-medium">Click to upload or drag a photo</span>
                <span className="text-xs text-muted-foreground">JPG / PNG / HEIC (max ~10MB). A crisp, straight-on shot works best.</span>
                <input
                  type="file" accept="image/*" className="hidden"
                  onChange={(e) => onPickPhoto(e.target.files?.[0] || null)}
                />
              </label>
            )}

            {extractPreview && (
              <div className="space-y-3">
                <div className="relative rounded-lg overflow-hidden border bg-muted/20">
                  <img src={extractPreview} alt="Timetable preview" className="w-full max-h-[360px] object-contain" />
                  <div className="absolute top-2 right-2 flex gap-1">
                    <Button size="sm" variant="secondary" onClick={() => onPickPhoto(null)}>
                      <Trash2 className="w-3 h-3 mr-1" /> Replace
                    </Button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-4 rounded-md border p-3">
                  <label className="flex items-center gap-2 text-xs">
                    <Checkbox checked={importPeriods} onCheckedChange={(v) => setImportPeriods(!!v)} />
                    Import missing period timings
                  </label>
                  <label className="flex items-center gap-2 text-xs">
                    <Checkbox checked={autoCreateSubjects} onCheckedChange={(v) => setAutoCreateSubjects(!!v)} />
                    Auto-create unknown subjects
                  </label>
                </div>

                {!extractResult ? (
                  <Button className="w-full" onClick={runExtract} disabled={extracting}>
                    {extracting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Wand2 className="w-4 h-4 mr-2" />}
                    {extracting ? 'Reading timetable…' : 'Extract with AI'}
                  </Button>
                ) : (
                  <div className="rounded-md border bg-muted/30 p-3 space-y-2 text-xs">
                    <div className="flex items-center gap-2 font-medium">
                      <ImageIcon className="w-4 h-4 text-primary" />
                      Preview: {(extractResult.slots || []).length} slots • {(extractResult.periods || []).length} periods
                      {extractResult.class_teacher && <Badge variant="outline">Class T: {extractResult.class_teacher}</Badge>}
                    </div>
                    <div className="max-h-[180px] overflow-y-auto rounded border bg-background">
                      <table className="w-full text-[11px]">
                        <thead className="sticky top-0 bg-muted">
                          <tr>
                            <th className="p-1 text-left">Day</th>
                            <th className="p-1 text-left">P#</th>
                            <th className="p-1 text-left">Subject</th>
                            <th className="p-1 text-left">Teacher</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(extractResult.slots || []).slice(0, 60).map((s: any, i: number) => (
                            <tr key={i} className="border-t">
                              <td className="p-1">{s.day}</td>
                              <td className="p-1">{s.period_number}</td>
                              <td className="p-1">{s.subject_short || s.subject}</td>
                              <td className="p-1 text-muted-foreground">{s.teacher || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      Applying will fill the draft. Unmatched teachers stay blank so you can pick from the dropdown.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setExtractOpen(false)} disabled={extracting}>Cancel</Button>
            {extractResult && (
              <Button onClick={applyExtraction} disabled={extracting}>
                {extracting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                Apply to draft
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TimetableManager;
