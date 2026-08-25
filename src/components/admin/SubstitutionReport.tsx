import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Printer, UserCheck, AlertTriangle, RefreshCw, Zap } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { getCategoryLabel } from '@/constants/schoolConfig';

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
  status: string;
  auto_assigned: boolean;
}

interface AbsentTeacher {
  record_id: string;
  name: string;
  periods: { period_number: number; category: string; class?: string | null; section?: string | null; subject_id: string | null }[];
}

const SubstitutionReport: React.FC = () => {
  const { toast } = useToast();
  const [substitutions, setSubstitutions] = useState<Substitution[]>([]);
  const [absentTeachers, setAbsentTeachers] = useState<AbsentTeacher[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isAutoAssigning, setIsAutoAssigning] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const today = format(new Date(), 'yyyy-MM-dd');
  const dayOfWeek = new Date().getDay(); // 0=Sun, 1=Mon...
  // Convert to our timetable format (1=Mon, 2=Tue, ..., 6=Sat)
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

  const mapSubstitution = (row: any): Substitution => {
    const metadata = (row?.metadata || {}) as any;
    const className = row?.class ?? metadata?.class ?? null;
    const section = row?.section ?? metadata?.section ?? null;
    const category = resolveCategory(row);
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
      subject_id: row.subject_id || metadata.subject_id || null,
      status: row.status || 'assigned',
      auto_assigned: Boolean(row.auto_assigned ?? metadata.auto_assigned ?? false),
    };
  };

  const detectAbsentTeachers = useCallback(async () => {
    setIsLoading(true);
    try {
      // 1. Get today's timetable entries (all classes, current day)
      const { data: ttEntries, error: ttErr } = await supabase
        .from('timetable')
        .select('*')
        .eq('day_of_week', ttDayOfWeek);

      if (ttErr) throw ttErr;
      if (!ttEntries || ttEntries.length === 0) {
        toast({ title: 'No Timetable', description: 'No timetable configured for today.', variant: 'destructive' });
        setAbsentTeachers([]);
        setLoaded(true);
        setIsLoading(false);
        return;
      }

      // 2. Get unique teacher IDs from today's timetable
      const scheduledTeacherIds = [...new Set((ttEntries || []).map(resolveTeacherId).filter(Boolean))] as string[];

      if (scheduledTeacherIds.length === 0) {
        toast({ title: 'No Timetable', description: 'Timetable entries exist but no teacher IDs were found.', variant: 'destructive' });
        setAbsentTeachers([]);
        setLoaded(true);
        setIsLoading(false);
        return;
      }

      // 3. Check which teachers have attendance today
      const { data: todayAttendance } = await supabase
        .from('attendance_records')
        .select('id, user_id, status, device_info')
        .in('status', ['present', 'late', 'unauthorized'])
        .gte('timestamp', `${today}T00:00:00`)
        .lte('timestamp', `${today}T23:59:59`);

      // Build set of present teacher IDs (match by record_id, user_id, or employee_id)
      const presentTeacherIds = new Set<string>();
      (todayAttendance || []).forEach(r => {
        const di = r.device_info as any;
        if (di?.registration) return; // skip registration records
        presentTeacherIds.add(r.id);
        if (r.user_id) presentTeacherIds.add(r.user_id);
        const empId = di?.metadata?.employee_id || di?.employee_id;
        if (empId) presentTeacherIds.add(empId);
      });

      // Also check gate entries
      const { data: gateData } = await supabase
        .from('gate_entries')
        .select('student_id')
        .gte('entry_time', `${today}T00:00:00`)
        .lte('entry_time', `${today}T23:59:59`)
        .eq('is_recognized', true);

      (gateData || []).forEach(g => {
        if (g.student_id) presentTeacherIds.add(g.student_id);
      });

      // 4. Find absent teachers: scheduled but not in present set
      const absentMap = new Map<string, AbsentTeacher>();

      for (const entry of ttEntries) {
        const teacherId = resolveTeacherId(entry);
        if (!teacherId) continue;
        if (presentTeacherIds.has(teacherId)) continue; // Teacher is present

        if (!absentMap.has(teacherId)) {
          absentMap.set(teacherId, {
            record_id: teacherId,
            name: entry.teacher_name,
            periods: [],
          });
        }
        absentMap.get(teacherId)!.periods.push({
          period_number: resolvePeriod(entry),
          category: resolveCategory(entry),
          class: entry.class ?? entry.metadata?.class ?? null,
          section: entry.section ?? entry.metadata?.section ?? null,
          subject_id: entry.subject_id ?? entry.metadata?.subject_id ?? null,
        });
      }

      setAbsentTeachers(Array.from(absentMap.values()));

      // 5. Fetch existing substitutions for today
      const { data: existingSubs } = await supabase
        .from('substitutions')
        .select('*')
        .eq('date', today)
        .order('period_number');

      setSubstitutions((existingSubs || []).map(mapSubstitution));
      setLoaded(true);
    } catch (e) {
      console.error(e);
      toast({ title: 'Error', description: 'Failed to detect absent teachers', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [today, ttDayOfWeek, toast]);

  // Auto-assign substitutes: find free teachers who teach the same subject
  const autoAssignSubstitutes = async () => {
    setIsAutoAssigning(true);
    try {
      // Get full timetable for today to know who's busy at each period
      const { data: ttEntries } = await supabase
        .from('timetable')
        .select('*')
        .eq('day_of_week', ttDayOfWeek);

      // Get all registered teachers from attendance_records (canonical registration source)
      const { data: allTeacherRegs } = await supabase
        .from('attendance_records')
        .select('id, user_id, device_info, category')
        .eq('status', 'registered')
        .eq('category', 'Teacher');

      const allTeachers = (allTeacherRegs || []).map(r => {
        const meta = (r.device_info as any)?.metadata || {};
        return { record_id: r.user_id || r.id, name: meta.name || (r.device_info as any)?.name || 'Unknown' };
      }).filter(t => t.name !== 'Unknown');

      // Check which teachers are present today
      const { data: todayAttendance } = await supabase
        .from('attendance_records')
        .select('id, user_id, status, device_info')
        .in('status', ['present', 'late', 'unauthorized'])
        .gte('timestamp', `${today}T00:00:00`)
        .lte('timestamp', `${today}T23:59:59`);

      const presentTeacherIds = new Set<string>();
      (todayAttendance || []).forEach(r => {
        const di = r.device_info as any;
        if (di?.registration) return;
        presentTeacherIds.add(r.id);
        if (r.user_id) presentTeacherIds.add(r.user_id);
        const empId = di?.metadata?.employee_id || di?.employee_id;
        if (empId) presentTeacherIds.add(empId);
      });

      // Get existing substitutions to avoid double-assigning
      const { data: existingSubs } = await supabase
        .from('substitutions')
        .select('*')
        .eq('date', today);

      const existingSubRows = (existingSubs || []).map(mapSubstitution);
      const existingSubKeys = new Set(existingSubRows.map(resolveSlotKey));

      // Build busy map: period -> set of busy teacher IDs
      const busyMap = new Map<number, Set<string>>();
      (ttEntries || []).forEach(entry => {
        const period = resolvePeriod(entry);
        const teacherId = resolveTeacherId(entry);
        if (!teacherId || period <= 0) return;
        if (!busyMap.has(period)) busyMap.set(period, new Set());
        busyMap.get(period)!.add(teacherId);
      });

      // Also mark substitute teachers as busy
      existingSubRows.forEach(s => {
        if (!s.substitute_teacher_id || s.period_number <= 0) return;
        if (!busyMap.has(s.period_number)) busyMap.set(s.period_number, new Set());
        busyMap.get(s.period_number)!.add(s.substitute_teacher_id);
      });

      // Get all timetable entries to know which teachers teach which subjects
      const { data: allTT } = await supabase.from('timetable').select('*');
      const teacherSubjects = new Map<string, Set<string>>();
      (allTT || []).forEach(t => {
        const teacherId = resolveTeacherId(t);
        const subjectId = t.subject_id ?? t.metadata?.subject_id;
        if (!teacherId || !subjectId) return;
        if (!teacherSubjects.has(teacherId)) teacherSubjects.set(teacherId, new Set());
        teacherSubjects.get(teacherId)!.add(subjectId);
      });

      const newSubs: any[] = [];
      const absentTeacherIds = new Set(absentTeachers.map(a => a.record_id));

      for (const absent of absentTeachers) {
        for (const period of absent.periods) {
          const key = `${period.class && period.section ? `${period.class}-${period.section}` : period.category}-${period.period_number}`;
          if (existingSubKeys.has(key)) continue; // Already has substitution

          const busyAtPeriod = busyMap.get(period.period_number) || new Set();

          // Find free present teachers, prioritize same-subject
          const candidates = allTeachers.filter(t =>
            presentTeacherIds.has(t.record_id) &&
            !busyAtPeriod.has(t.record_id) &&
            !absentTeacherIds.has(t.record_id)
          );

          // Sort: same-subject teachers first
          const sorted = candidates.sort((a, b) => {
            const aMatch = period.subject_id && teacherSubjects.get(a.record_id)?.has(period.subject_id) ? 0 : 1;
            const bMatch = period.subject_id && teacherSubjects.get(b.record_id)?.has(period.subject_id) ? 0 : 1;
            return aMatch - bMatch;
          });

          if (sorted.length > 0) {
            const substitute = sorted[0];
            newSubs.push({
              date: today,
              class: period.class || null,
              section: period.section || null,
              period_number: period.period_number,
              original_teacher_id: absent.record_id,
              substitute_teacher_id: substitute.record_id,
              subject: null,
              status: 'assigned',
              notes: `Auto substitution for period ${period.period_number}`,
              metadata: {
                category: period.category,
                period_number: period.period_number,
                absent_teacher_id: absent.record_id,
                absent_teacher_name: absent.name,
                substitute_teacher_id: substitute.record_id,
                substitute_teacher_name: substitute.name,
                subject_id: period.subject_id,
                auto_assigned: true,
              },
            });

            // Mark this teacher as busy for this period
            if (!busyMap.has(period.period_number)) busyMap.set(period.period_number, new Set());
            busyMap.get(period.period_number)!.add(substitute.record_id);
          }
        }
      }

      if (newSubs.length > 0) {
        const { data: insertedSubs, error } = await supabase
          .from('substitutions')
          .insert(newSubs)
          .select();
        if (error) throw error;
        toast({
          title: 'Auto-Assigned',
          description: `${newSubs.length} substitution(s) assigned (same-subject preferred).`,
        });

        // Notify substitute teachers via Email + WhatsApp
        try {
          const { error: notifyErr } = await supabase.functions.invoke('notify-substitute-teacher', {
            body: { substitutions: insertedSubs || newSubs },
          });
          if (notifyErr) console.warn('Substitute notification failed:', notifyErr);
          else toast({ title: 'Notifications Sent', description: 'Substitute teachers notified via email & WhatsApp.' });
        } catch (e) {
          console.warn('Substitute notification error:', e);
        }
      } else {
        toast({ title: 'No Assignments', description: 'No free teachers available or all slots already assigned.' });
      }

      await detectAbsentTeachers();
    } catch (e: any) {
      console.error(e);
      toast({ title: 'Error', description: e.message || 'Auto-assign failed', variant: 'destructive' });
    } finally {
      setIsAutoAssigning(false);
    }
  };

  // Realtime subscription
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

    return () => { supabase.removeChannel(channel); };
  }, [loaded, detectAbsentTeachers]);

  const printReport = async () => {
    const dayName = format(new Date(), 'EEEE, MMMM d, yyyy');
    const { data: timings } = await supabase.from('period_timings').select('*').order('period_number');
    const timingsMap = new Map((timings || []).map((t: any) => [t.period_number, t]));

    const grouped: Record<string, Substitution[]> = {};
    substitutions.forEach(s => {
      if (!grouped[s.absent_teacher_id]) grouped[s.absent_teacher_id] = [];
      grouped[s.absent_teacher_id].push(s);
    });

    const totalAbsent = Object.keys(grouped).length;
    const totalSubs = substitutions.length;

    const absentRows = Object.entries(grouped).map(([, subs]) => {
      const details = subs.map(s => {
        const pt = timingsMap.get(s.period_number);
        const time = pt ? `${(pt as any).start_time.slice(0, 5)}–${(pt as any).end_time.slice(0, 5)}` : '';
        return `<span style="display:inline-block;background:#fee2e2;color:#991b1b;padding:2px 8px;border-radius:4px;margin:2px;font-size:12px;">P${s.period_number} ${time ? `(${time})` : ''} → ${s.substitute_teacher_name} [${getCategoryLabel(s.category)}]</span>`;
      }).join(' ');
      return `<tr>
        <td style="border:1px solid #d1d5db;padding:10px 12px;font-weight:600;color:#dc2626;">${subs[0].absent_teacher_name}</td>
        <td style="border:1px solid #d1d5db;padding:10px 12px;text-align:center;">${subs.length}</td>
        <td style="border:1px solid #d1d5db;padding:10px 12px;">${details}</td>
      </tr>`;
    }).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Substitution Report</title>
    <style>
      @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } @page { margin: 15mm; } }
      body { font-family: -apple-system, sans-serif; color: #111827; max-width: 950px; margin: 0 auto; padding: 20px; }
      .header { text-align: center; border-bottom: 3px solid #dc2626; padding-bottom: 16px; margin-bottom: 24px; }
      .header h1 { font-size: 22px; margin: 0 0 4px; color: #dc2626; }
      .header p { margin: 2px 0; color: #6b7280; font-size: 13px; }
      .stats { display: flex; gap: 16px; margin-bottom: 24px; }
      .stat-box { flex: 1; border-radius: 8px; padding: 12px; text-align: center; }
      .stat-box .num { font-size: 28px; font-weight: 700; }
      .stat-box .lbl { font-size: 11px; color: #6b7280; text-transform: uppercase; }
      table { width: 100%; border-collapse: collapse; margin-top: 8px; }
      th { background: #1e293b; color: white; padding: 10px 12px; text-align: left; font-size: 12px; text-transform: uppercase; }
      .footer { text-align: center; margin-top: 30px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #9ca3af; }
    </style></head><body>
      <div class="header">
        <h1>🏫 Absent Teachers & Substitution Report</h1>
        <p><strong>${dayName}</strong></p>
        <p>Generated at ${format(new Date(), 'hh:mm a')}</p>
      </div>
      <div class="stats">
        <div class="stat-box" style="background:#fef2f2;border:1px solid #fecaca;">
          <div class="num" style="color:#dc2626;">${totalAbsent}</div><div class="lbl">Absent Teachers</div>
        </div>
        <div class="stat-box" style="background:#f0fdf4;border:1px solid #bbf7d0;">
          <div class="num" style="color:#16a34a;">${totalSubs}</div><div class="lbl">Substitutions</div>
        </div>
      </div>
      ${totalSubs === 0 && absentTeachers.length === 0 ? '<div style="text-align:center;padding:40px;color:#16a34a;font-size:18px;">✅ All teachers present today.</div>' : `
      <table>
        <thead><tr><th>Absent Teacher</th><th style="text-align:center;">Periods</th><th>Substitutes</th></tr></thead>
        <tbody>${absentRows}</tbody>
      </table>`}
      <div class="footer">School Attendance System • ${dayName}</div>
    </body></html>`;

    const w = window.open('', '_blank', 'width=950,height=700');
    if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 500); }
  };

  // Group substitutions by absent teacher for display
  const groupedSubs = substitutions.reduce<Record<string, Substitution[]>>((acc, s) => {
    if (!acc[s.absent_teacher_id]) acc[s.absent_teacher_id] = [];
    acc[s.absent_teacher_id].push(s);
    return acc;
  }, {});

  // Unassigned absent periods
      const assignedKeys = new Set(substitutions.map(s => `${s.class && s.section ? `${s.class}-${s.section}` : s.category}-${s.period_number}`));
  const unassignedPeriods = absentTeachers.flatMap(t =>
    t.periods.filter(p => !assignedKeys.has(`${p.category}-${p.period_number}`))
      .map(p => ({ ...p, teacherName: t.name }))
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <UserCheck className="h-5 w-5 text-destructive" />
            Absent Teachers & Substitution Report
          </CardTitle>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={detectAbsentTeachers} disabled={isLoading}>
              {isLoading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}
              {loaded ? 'Refresh' : 'Detect Absent'}
            </Button>
            {loaded && absentTeachers.length > 0 && (
              <Button variant="default" size="sm" onClick={autoAssignSubstitutes} disabled={isAutoAssigning}>
                {isAutoAssigning ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Zap className="w-4 h-4 mr-1" />}
                Auto-Assign
              </Button>
            )}
            {loaded && substitutions.length > 0 && (
              <Button size="sm" variant="outline" onClick={printReport}>
                <Printer className="w-4 h-4 mr-1" />
                Print
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {!loaded ? (
          <div className="text-center py-8 text-muted-foreground">
            <AlertTriangle className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">Click "Detect Absent" to cross-check timetable with today's attendance</p>
          </div>
        ) : absentTeachers.length === 0 ? (
          <div className="text-center py-8">
            <UserCheck className="h-10 w-10 mx-auto mb-3 text-green-500" />
            <p className="font-medium text-green-600 dark:text-green-400">All teachers are present today!</p>
            <p className="text-sm text-muted-foreground mt-1">No substitutions needed.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Summary */}
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center p-3 rounded-lg bg-destructive/10">
                <p className="text-2xl font-bold text-destructive">{absentTeachers.length}</p>
                <p className="text-xs text-muted-foreground">Absent Teachers</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-green-500/10">
                <p className="text-2xl font-bold text-green-600 dark:text-green-400">{substitutions.length}</p>
                <p className="text-xs text-muted-foreground">Assigned</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-orange-500/10">
                <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">{unassignedPeriods.length}</p>
                <p className="text-xs text-muted-foreground">Unassigned</p>
              </div>
            </div>

            {/* Unassigned warning */}
            {unassignedPeriods.length > 0 && (
              <div className="border border-orange-500/30 bg-orange-500/5 rounded-lg p-3">
                <p className="text-sm font-medium text-orange-600 dark:text-orange-400 mb-2">
                  ⚠️ {unassignedPeriods.length} period(s) still need substitutes:
                </p>
                <div className="flex flex-wrap gap-2">
                  {unassignedPeriods.map((p, i) => (
                    <Badge key={i} variant="outline" className="text-xs border-orange-500/40">
                      {p.teacherName} → P{p.period_number} ({getCategoryLabel(p.category)})
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Assigned substitutions */}
            {Object.entries(groupedSubs).map(([teacherId, subs]) => (
              <div key={teacherId} className="border rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-destructive">{subs[0].absent_teacher_name}</span>
                  <Badge variant="destructive">{subs.length} period(s)</Badge>
                </div>
                <div className="flex flex-wrap gap-2">
                  {subs.map(s => (
                    <div key={s.id} className="text-xs bg-muted rounded-md px-2 py-1">
                      <span className="font-medium">P{s.period_number}</span>
                      <span className="text-muted-foreground"> → </span>
                      <span className="text-green-600 dark:text-green-400 font-medium">{s.substitute_teacher_name}</span>
                      <span className="text-muted-foreground ml-1">({getCategoryLabel(s.category)})</span>
                      {s.auto_assigned && (
                        <Badge variant="secondary" className="ml-1 text-[8px] px-1 py-0">auto</Badge>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {/* Absent but no subs */}
            {absentTeachers.filter(a => !groupedSubs[a.record_id]).map(a => (
              <div key={a.record_id} className="border border-dashed border-destructive/30 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-destructive">{a.name}</span>
                  <Badge variant="outline" className="text-destructive border-destructive/30">
                    {a.periods.length} period(s) - no substitute
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {a.periods.map((p, i) => (
                    <Badge key={i} variant="outline" className="text-[10px]">
                      P{p.period_number} • {getCategoryLabel(p.category)}
                    </Badge>
                  ))}
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
