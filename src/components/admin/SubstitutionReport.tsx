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
import { format } from 'date-fns';
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

const SubstitutionReport: React.FC = () => {
  const { toast } = useToast();
  const [substitutions, setSubstitutions] = useState<Substitution[]>([]);
  const [absentTeachers, setAbsentTeachers] = useState<AbsentTeacher[]>([]);
  const [allFaculty, setAllFaculty] = useState<FacultyTeacher[]>([]);
  const [subjectsMap, setSubjectsMap] = useState<Map<string, string>>(new Map());
  const [todayTimetable, setTodayTimetable] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isAutoAssigning, setIsAutoAssigning] = useState(false);
  const [isSendingNotifications, setIsSendingNotifications] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Manual absent teacher selector state
  const [manualTeacherId, setManualTeacherId] = useState<string>('');

  const today = format(new Date(), 'yyyy-MM-dd');
  const dayOfWeek = new Date().getDay(); // 0=Sun, 1=Mon...
  const ttDayOfWeek = dayOfWeek === 0 ? 7 : dayOfWeek;

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

  const resolveSlotKey = (row: any): string => {
    const period = resolvePeriod(row);
    const className = row?.class ?? row?.metadata?.class ?? null;
    const section = row?.section ?? row?.metadata?.section ?? null;
    if (className && section) return `${className}-${section}-${period}`;
    return `${resolveCategory(row)}-${period}`;
  };

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

  // 1. Load data & Detect Absent Teachers
  const detectAbsentTeachers = useCallback(async () => {
    setIsLoading(true);
    try {
      // Fetch subjects, faculty, and today's timetable
      const [subjRes, ttRes, teacherAttRes, profilesRes, classTeachersRes, existSubsRes] = await Promise.all([
        supabase.from('subjects').select('id, name, short_name'),
        supabase.from('timetable').select('*').eq('day_of_week', ttDayOfWeek),
        supabase.from('attendance_records').select('id, user_id, device_info, status, timestamp').eq('category', 'Teacher'),
        supabase.from('profiles').select('id, user_id, display_name, full_name, username, role'),
        supabase.from('class_teachers').select('teacher_id, teacher_name, teacher_email'),
        supabase.from('substitutions').select('*').eq('date', today).order('period_number'),
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
        facultyMap.set('teacher-1', { id: 'teacher-1', name: 'Ritu Dahiya (Mathematics)' });
        facultyMap.set('teacher-2', { id: 'teacher-2', name: 'Manoj Kumar (Science)' });
        facultyMap.set('teacher-3', { id: 'teacher-3', name: 'Sunita Sharma (English)' });
        facultyMap.set('teacher-4', { id: 'teacher-4', name: 'Anil Verma (Hindi)' });
        facultyMap.set('teacher-5', { id: 'teacher-5', name: 'Priya Singh (Social Science)' });
        facultyMap.set('teacher-6', { id: 'teacher-6', name: 'Vikram Rathore (Computer)' });
        facultyMap.set('teacher-7', { id: 'teacher-7', name: 'Rajesh Gupta (PE / Sports)' });
      }

      const facultyList = Array.from(facultyMap.values());
      setAllFaculty(facultyList);

      const ttEntries = ttRes.data || [];
      setTodayTimetable(ttEntries);

      // Check attendance for today
      const todayAttendance = (teacherAttRes.data || []).filter((r) => {
        const ts = r.timestamp || '';
        return ts.startsWith(today) && ['present', 'late', 'unauthorized'].includes(r.status);
      });

      const presentTeacherIds = new Set<string>();
      todayAttendance.forEach((r) => {
        presentTeacherIds.add(r.id);
        if (r.user_id) presentTeacherIds.add(r.user_id);
      });

      // Find absent teachers with scheduled classes today
      const absentMap = new Map<string, AbsentTeacher>();

      for (const entry of ttEntries) {
        const teacherId = resolveTeacherId(entry);
        if (!teacherId) continue;
        if (presentTeacherIds.has(teacherId)) continue; // Present

        const subjId = entry.subject_id ?? entry.metadata?.subject_id ?? null;
        const subjName = subjId ? subjsMap.get(subjId) || 'Subject' : 'Subject';

        if (!absentMap.has(teacherId)) {
          absentMap.set(teacherId, {
            record_id: teacherId,
            name: entry.teacher_name || facultyMap.get(teacherId)?.name || 'Teacher',
            periods: [],
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

      // Sort periods for each absent teacher
      for (const absent of absentMap.values()) {
        absent.periods.sort((a, b) => a.period_number - b.period_number);
      }

      setAbsentTeachers(Array.from(absentMap.values()));

      // Map existing substitutions
      const mappedSubs = (existSubsRes.data || []).map((s) => mapSubstitution(s, subjsMap));
      setSubstitutions(mappedSubs);
      setLoaded(true);
    } catch (e: any) {
      console.error('Error detecting absent teachers:', e);
      toast({ title: 'Detection Error', description: e.message || 'Failed to cross-check timetable', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [today, ttDayOfWeek, toast]);

  useEffect(() => {
    detectAbsentTeachers();
  }, [detectAbsentTeachers]);

  // Realtime subscription to attendance_records & substitutions
  useEffect(() => {
    const channel = supabase
      .channel('substitution-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_records' }, () => {
        if (loaded) detectAbsentTeachers();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'substitutions' }, () => {
        if (loaded) detectAbsentTeachers();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loaded, detectAbsentTeachers]);

  // 2. Mark a teacher absent / on leave manually
  const handleMarkTeacherAbsent = (teacherId: string) => {
    if (!teacherId) return;
    const teacher = allFaculty.find((t) => t.id === teacherId);
    if (!teacher) return;

    // Check if already in absent list
    if (absentTeachers.some((a) => a.record_id === teacherId)) {
      toast({ title: 'Already Marked', description: `${teacher.name} is already listed as absent.` });
      return;
    }

    // Find all periods for this teacher today
    const periodsForTeacher = todayTimetable
      .filter((entry) => resolveTeacherId(entry) === teacherId)
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

    setAbsentTeachers((prev) => [newAbsent, ...prev]);
    setManualTeacherId('');
    toast({
      title: 'Teacher Marked Absent',
      description: `${teacher.name} has ${periodsForTeacher.length} period(s) scheduled for today.`,
    });
  };

  // Remove teacher from absent list
  const handleRemoveAbsentTeacher = (teacherId: string) => {
    setAbsentTeachers((prev) => prev.filter((a) => a.record_id !== teacherId));
    toast({ title: 'Teacher Removed', description: 'Teacher removed from absent list.' });
  };

  // Compute busy faculty per period
  const busyFacultyByPeriod = useMemo(() => {
    const map = new Map<number, Set<string>>();
    // From timetable
    todayTimetable.forEach((entry) => {
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
  }, [todayTimetable, substitutions]);

  // 3. Assign or update an individual substitution
  const handleAssignSingleSubstitute = async (
    absentTeacher: AbsentTeacher,
    period: AbsentTeacherPeriod,
    substituteId: string
  ) => {
    const substituteTeacher = allFaculty.find((t) => t.id === substituteId);
    if (!substituteTeacher) return;

    try {
      const subKey = `${period.class && period.section ? `${period.class}-${period.section}` : period.category}-${period.period_number}`;
      const existing = substitutions.find(
        (s) =>
          (s.class && s.section ? `${s.class}-${s.section}` : s.category) ===
            (period.class && period.section ? `${period.class}-${period.section}` : period.category) &&
          s.period_number === period.period_number
      );

      const subPayload = {
        date: today,
        class: period.class || null,
        section: period.section || null,
        period_number: period.period_number,
        original_teacher_id: absentTeacher.record_id,
        substitute_teacher_id: substituteTeacher.id,
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

      if (existing) {
        // Update
        const { error } = await supabase.from('substitutions').update(subPayload).eq('id', existing.id);
        if (error) throw error;
      } else {
        // Insert
        const { error } = await supabase.from('substitutions').insert(subPayload);
        if (error) throw error;
      }

      toast({
        title: 'Substitution Assigned',
        description: `${substituteTeacher.name} assigned to cover P${period.period_number} (${getCategoryLabel(period.category)}).`,
      });

      await detectAbsentTeachers();
    } catch (e: any) {
      toast({ title: 'Assignment Failed', description: e.message, variant: 'destructive' });
    }
  };

  // Delete substitution
  const handleDeleteSubstitution = async (subId: string) => {
    try {
      const { error } = await supabase.from('substitutions').delete().eq('id', subId);
      if (error) throw error;
      toast({ title: 'Substitution Removed' });
      await detectAbsentTeachers();
    } catch (e: any) {
      toast({ title: 'Delete Failed', description: e.message, variant: 'destructive' });
    }
  };

  // 4. Auto-assign all absent periods with smart subject matching
  const autoAssignSubstitutes = async () => {
    setIsAutoAssigning(true);
    try {
      const newSubs: any[] = [];
      const busyMap = new Map<number, Set<string>>();

      // Seed busy map from today's timetable
      todayTimetable.forEach((entry) => {
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

          // Rank candidates: Same subject specialization first
          const subjName = (period.subject_name || '').toLowerCase();
          const sorted = candidates.sort((a, b) => {
            const aSpec = (a.specialization || a.name).toLowerCase();
            const bSpec = (b.specialization || b.name).toLowerCase();
            const aMatch = subjName && aSpec.includes(subjName.slice(0, 4)) ? 0 : 1;
            const bMatch = subjName && bSpec.includes(subjName.slice(0, 4)) ? 0 : 1;
            return aMatch - bMatch;
          });

          const chosen = sorted[0];
          newSubs.push({
            date: today,
            class: period.class || null,
            section: period.section || null,
            period_number: period.period_number,
            original_teacher_id: absent.record_id,
            substitute_teacher_id: chosen.id,
            subject: period.subject_name || null,
            status: 'assigned',
            notes: `Auto substitution for ${absent.name}`,
            metadata: {
              category: period.category,
              period_number: period.period_number,
              absent_teacher_id: absent.record_id,
              absent_teacher_name: absent.name,
              substitute_teacher_id: chosen.id,
              substitute_teacher_name: chosen.name,
              subject_id: period.subject_id,
              auto_assigned: true,
            },
          });

          // Mark busy
          if (!busyMap.has(period.period_number)) busyMap.set(period.period_number, new Set());
          busyMap.get(period.period_number)!.add(chosen.id);
        }
      }

      if (newSubs.length > 0) {
        const { error } = await supabase.from('substitutions').insert(newSubs);
        if (error) throw error;
        toast({
          title: '✨ Auto-Assigned Successfully',
          description: `${newSubs.length} period(s) assigned with optimal subject matching.`,
        });
        await detectAbsentTeachers();
      } else {
        toast({ title: 'No New Assignments', description: 'All periods are already covered or no free faculty found.' });
      }
    } catch (e: any) {
      toast({ title: 'Auto-Assign Failed', description: e.message, variant: 'destructive' });
    } finally {
      setIsAutoAssigning(false);
    }
  };

  // 5. Send Notifications to all assigned substitute teachers
  const handleSendNotifications = async () => {
    if (substitutions.length === 0) {
      toast({ title: 'No Substitutions', description: 'No substitutions to notify.', variant: 'destructive' });
      return;
    }

    setIsSendingNotifications(true);
    try {
      const { data, error } = await supabase.functions.invoke('notify-substitute-teacher', {
        body: { substitutions },
      });

      if (error) throw error;

      toast({
        title: '✅ Notifications Sent',
        description: 'Assigned teachers have been notified via Email & WhatsApp.',
      });
    } catch (e: any) {
      console.error('Notification error:', e);
      toast({
        title: 'Notification Error',
        description: e.message || 'Failed to dispatch email/WhatsApp notifications.',
        variant: 'destructive',
      });
    } finally {
      setIsSendingNotifications(false);
    }
  };

  // 6. Print Daily Substitution Sheet
  const printReport = async () => {
    const dayName = format(new Date(), 'EEEE, MMMM d, yyyy');
    const { data: timings } = await supabase.from('period_timings').select('*').order('period_number');
    const timingsMap = new Map((timings || []).map((t: any) => [t.period_number, t]));

    const grouped: Record<string, Substitution[]> = {};
    substitutions.forEach((s) => {
      if (!grouped[s.absent_teacher_id]) grouped[s.absent_teacher_id] = [];
      grouped[s.absent_teacher_id].push(s);
    });

    const totalAbsent = Object.keys(grouped).length;
    const totalSubs = substitutions.length;

    const rows = substitutions.map((s) => {
      const pt = timingsMap.get(s.period_number);
      const timeStr = pt ? `${(pt as any).start_time?.slice(0, 5)} - ${(pt as any).end_time?.slice(0, 5)}` : '';
      return `<tr>
        <td style="border:1px solid #cbd5e1;padding:8px 10px;text-align:center;font-weight:bold;">Period ${s.period_number} ${timeStr ? `<br><small style="color:#64748b;">${timeStr}</small>` : ''}</td>
        <td style="border:1px solid #cbd5e1;padding:8px 10px;font-weight:bold;color:#1e3a8a;">${getCategoryLabel(s.category)}</td>
        <td style="border:1px solid #cbd5e1;padding:8px 10px;font-weight:bold;">${s.subject_name || 'Subject'}</td>
        <td style="border:1px solid #cbd5e1;padding:8px 10px;color:#dc2626;font-weight:600;">${s.absent_teacher_name}</td>
        <td style="border:1px solid #cbd5e1;padding:8px 10px;color:#16a34a;font-weight:bold;background:#f0fdf4;">${s.substitute_teacher_name}</td>
        <td style="border:1px solid #cbd5e1;padding:8px 10px;text-align:center;">________________</td>
      </tr>`;
    }).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Daily Substitution Notice - ${dayName}</title>
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
        <p><strong>DAILY TEACHER SUBSTITUTION NOTICE</strong> • ${dayName}</p>
      </div>
      <table>
        <thead>
          <tr>
            <th>Period & Time</th>
            <th>Class / Room</th>
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

  // Find substitution for a given class + period
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
              <CardTitle className="text-lg sm:text-xl font-extrabold flex items-center gap-2">
                Faculty Substitution & Leave Manager
                <Badge variant="outline" className="border-primary/30 text-primary text-xs font-mono">
                  {format(new Date(), 'EEEE, dd MMM')}
                </Badge>
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground mt-0.5">
                Automatic absence detection, smart subject-match substitute assignment, and real-time alerts.
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
              Refresh Attendance
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
                Notify via WhatsApp/Email
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

        {/* Manual Mark Teacher Absent Bar */}
        <div className="mt-4 pt-4 border-t border-border/40 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <UserX className="h-3.5 w-3.5 text-rose-500" /> Mark Teacher on Leave / Absent:
            </span>
            <div className="w-64">
              <Select value={manualTeacherId} onValueChange={handleMarkTeacherAbsent}>
                <SelectTrigger className="h-8 text-xs rounded-xl bg-background border-border/70">
                  <SelectValue placeholder="Select faculty member..." />
                </SelectTrigger>
                <SelectContent>
                  {allFaculty.map((t) => (
                    <SelectItem key={t.id} value={t.id} className="text-xs">
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <span>Absent: <strong className="text-rose-500">{absentTeachers.length}</strong></span>
            <span>•</span>
            <span>Covered: <strong className="text-emerald-500">{substitutions.length}</strong></span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-5 sm:p-6 space-y-6">
        {absentTeachers.length === 0 ? (
          <div className="py-12 text-center rounded-3xl border border-dashed border-border/60 bg-card/40 space-y-2">
            <div className="p-3 rounded-2xl bg-emerald-500/10 text-emerald-500 inline-block">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <h4 className="font-extrabold text-base text-foreground">All Teachers Present & Classes Covered!</h4>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              No faculty leaves detected for today. You can also select a teacher from the dropdown above to arrange planned substitutions.
            </p>
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
                          {absent.periods.length} Period(s) Today
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
                    <Trash2 className="h-3 w-3 mr-1" /> Clear
                  </Button>
                </div>

                {/* Periods Breakdown for this Absent Teacher */}
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
                                <SelectValue placeholder="Select faculty substitute..." />
                              </SelectTrigger>
                              <SelectContent>
                                {allFaculty
                                  .filter((f) => f.id !== absent.record_id)
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
                                        className={cn(
                                          'text-xs flex items-center justify-between',
                                          isBusy && 'text-muted-foreground opacity-60'
                                        )}
                                      >
                                        <span>
                                          {f.name} {isSameSubj ? '⭐ (Subject Match)' : ''} {isBusy ? '🚫 (Busy)' : '✅ (Free)'}
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
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default SubstitutionReport;
