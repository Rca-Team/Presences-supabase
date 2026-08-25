import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

const TEACHER_TAB_MAP: Record<string, string> = {
  'attendance': 'attendance',
  'take': 'attendance',
  'face': 'attendance',
  'today': 'today',
  'records': 'today',
  'timetable': 'timetable',
  'plan': 'timetable',
  'schedule': 'timetable',
  'editplan': 'editPlan',
  'edit-plan': 'editPlan',
  'report': 'report',
  'reports': 'report',
  'stats': 'stats',
  'analytics': 'stats',
};
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, GraduationCap, Camera, DoorOpen, Calendar, RefreshCcw, LogOut, FileDown, CalendarCog, QrCode, Scan } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { useToast } from '@/hooks/use-toast';
import PageLayout from '@/components/layouts/PageLayout';
import { lazyWithRetry } from '@/lib/lazyWithRetry';

// Heavy, tab-gated features (camera pipeline, QR decoder, jspdf/xlsx report
// tooling) are split out so opening the portal doesn't parse ~900 kB up front.
const AttendanceCapture = lazyWithRetry(() => import('@/components/attendance/AttendanceCapture'), 'tp-face');
const GateModeScanner = lazyWithRetry(() => import('@/components/gate/GateModeScanner'), 'tp-gate');
const QRCodeScanner = lazyWithRetry(() => import('@/components/attendance/QRCodeScanner'), 'tp-qr');
const ClassSectionReport = lazyWithRetry(() => import('@/components/admin/ClassSectionReport'), 'tp-report');
const TimetableManager = lazyWithRetry(() => import('@/components/admin/TimetableManager'), 'tp-timetable');
import { fetchTeacherCategories, parseClassSection } from '@/utils/teacherAccess';

interface ClassAssignment { class: string; section: string; teacher_name?: string | null; }
interface Period { id: string; period_name: string; start_time: string; end_time: string; class: string | null; section: string | null; }
interface Substitution { id: string; date: string; subject: string | null; class: string | null; section: string | null; status: string | null; notes: string | null; substitute_teacher_id: string | null; original_teacher_id: string | null; }
interface AttRow { id: string; student_name: string | null; status: string | null; timestamp: string; }

const TeacherPortal: React.FC = () => {
  const navigate = useNavigate();
  const { section } = useParams<{ section?: string }>();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const { role, userId, isLoading: roleLoading } = useUserRole();
  const db = supabase as any;

  const [loading, setLoading] = useState(true);
  const [assignments, setAssignments] = useState<ClassAssignment[]>([]);
  const [activeClass, setActiveClass] = useState<ClassAssignment | null>(null);
  const [activeTab, setActiveTab] = useState('attendance');
  const [today, setToday] = useState<AttRow[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [subs, setSubs] = useState<Substitution[]>([]);
  const [isRealtimeHealthy, setIsRealtimeHealthy] = useState(true);
  const isRealtimeHealthyRef = useRef(true);
  const [captureMethod, setCaptureMethod] = useState<'face' | 'qr' | 'gate'>('face');

  useEffect(() => {
    const raw = section || searchParams.get('tab');
    if (raw) {
      const canonical = TEACHER_TAB_MAP[raw.toLowerCase()] || raw;
      setActiveTab(canonical);
    }
  }, [section, searchParams]);

  const handleTabChange = (val: string) => {
    setActiveTab(val);
    navigate(`/teacher/${val}`, { replace: true });
  };

  const allowedCategories = useMemo(
    () => assignments.map((a) => `${a.class}-${a.section}`),
    [assignments]
  );
  const activeCategory = activeClass ? `${activeClass.class}-${activeClass.section}` : '';

  // Gate authorization
  useEffect(() => {
    if (roleLoading) return;
    if (!role || !['teacher', 'admin', 'principal'].includes(role)) {
      navigate('/login', { replace: true });
    }
  }, [role, roleLoading, navigate]);

  const loadAssignments = async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const { data: classes } = await db
        .from('class_teachers')
        .select('class, section, teacher_name')
        .eq('teacher_id', userId);
      const list: ClassAssignment[] = classes || [];

      const categories = await fetchTeacherCategories(userId);
      const fromPermissions: ClassAssignment[] = categories
        .map(parseClassSection)
        .filter(Boolean)
        .map((parsed) => ({ class: parsed!.className, section: parsed!.section }));

      const deduped = new Map<string, ClassAssignment>();
      [...list, ...fromPermissions].forEach((entry) => {
        deduped.set(`${entry.class}-${entry.section}`, entry);
      });
      const merged = [...deduped.values()];

      setAssignments(merged);
      // Admin/principal fallback: show all if no explicit assignment
      if (merged.length === 0 && (role === 'admin' || role === 'principal')) {
        const { data: all } = await db.from('class_teachers').select('class, section, teacher_name').limit(20);
        setAssignments(all || []);
        if (all && all.length) setActiveClass(all[0]);
      } else if (merged.length) {
        setActiveClass(merged[0]);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAssignments(); /* eslint-disable-next-line */ }, [userId]);

  const loadTodayAttendance = async (cls: ClassAssignment | null) => {
    if (!cls) return;
    const todayDate = new Date().toISOString().slice(0, 10);

    const { data: session } = await db
      .from('class_sessions')
      .select('id')
      .eq('class', cls.class)
      .eq('section', cls.section)
      .eq('school_day', todayDate)
      .eq('is_active', true)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (session?.id) {
      const { data: events } = await db
        .from('attendance_session_events')
        .select('id, status, recognized_at, metadata')
        .eq('session_id', session.id)
        .order('recognized_at', { ascending: false })
        .limit(200);

      setToday(
        (events || []).map((event: any) => ({
          id: event.id,
          student_name: event.metadata?.student_name ?? 'Unknown',
          status: event.status,
          timestamp: event.recognized_at,
        }))
      );
      return;
    }

    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const { data: legacy } = await db
      .from('attendance_records')
      .select('id, student_name, status, timestamp')
      .eq('class', cls.class)
      .eq('section', cls.section)
      .gte('timestamp', start.toISOString())
      .order('timestamp', { ascending: false })
      .limit(200);

    setToday(legacy || []);
  };

  const loadTimetable = async (cls: ClassAssignment | null) => {
    if (!cls) return;
    const { data: pdata } = await db
      .from('period_timings')
      .select('id, period_name, start_time, end_time, class, section')
      .or(`and(class.eq.${cls.class},section.eq.${cls.section}),class.is.null`)
      .order('start_time', { ascending: true });
    setPeriods(pdata || []);
    const today = new Date().toISOString().slice(0, 10);
    const { data: sdata } = await db
      .from('substitutions')
      .select('id, date, subject, class, section, status, notes, substitute_teacher_id, original_teacher_id')
      .eq('class', cls.class)
      .eq('section', cls.section)
      .gte('date', today)
      .order('date', { ascending: true });
    setSubs(sdata || []);
  };

  // Reload when active class changes + realtime today's attendance
  useEffect(() => {
    if (!activeClass) return;
    loadTodayAttendance(activeClass);
    loadTimetable(activeClass);
    const ch = supabase
      .channel(`teacher-att-${activeClass.class}-${activeClass.section}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'class_sessions',
          filter: `class=eq.${activeClass.class}`,
        },
        () => loadTodayAttendance(activeClass)
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'attendance_records',
          filter: `class=eq.${activeClass.class}`,
        },
        () => loadTodayAttendance(activeClass)
      )
      .subscribe((status) => {
        const healthy = status === 'SUBSCRIBED';
        isRealtimeHealthyRef.current = healthy;
        setIsRealtimeHealthy(healthy);
      });

    const fallbackPoll = window.setInterval(() => {
      if (!isRealtimeHealthyRef.current) {
        loadTodayAttendance(activeClass);
      }
    }, 12000);

    return () => {
      supabase.removeChannel(ch);
      clearInterval(fallbackPoll);
    };
    // eslint-disable-next-line
  }, [activeClass?.class, activeClass?.section]);

  useEffect(() => {
    if (!activeClass) return;

    const classScoped = supabase
      .channel(`teacher-portal-${activeClass.class}-${activeClass.section}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'class_teachers',
        },
        () => loadAssignments()
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'timetable',
        },
        () => loadTimetable(activeClass)
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'substitutions',
        },
        () => loadTimetable(activeClass)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(classScoped);
    };
    // eslint-disable-next-line
  }, [activeClass?.class, activeClass?.section, userId]);

  const acceptSubstitution = async (subId: string) => {
    if (!userId) return;
    const { error } = await db.from('substitutions').update({ substitute_teacher_id: userId, status: 'accepted' }).eq('id', subId);
    if (error) { toast({ title: 'Could not accept', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Substitution accepted' });
    loadTimetable(activeClass);
  };

  const signOut = async () => { await supabase.auth.signOut(); navigate('/login', { replace: true }); };

  if (roleLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  const presentCount = today.filter((t) => t.status === 'present').length;
  const lateCount = today.filter((t) => t.status === 'late').length;
  const absentCount = today.filter((t) => t.status === 'absent').length;

  return (
    <PageLayout>
      <div className="container mx-auto px-3 py-4 space-y-4 max-w-6xl">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <GraduationCap className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold">Teacher Portal</h1>
              <p className="text-xs text-muted-foreground">Real-time classroom attendance & timetable</p>
            </div>
          </div>
          <Button size="sm" variant="ghost" onClick={signOut}><LogOut className="h-4 w-4 mr-1" />Sign out</Button>
        </div>

        {/* Class selector */}
        {assignments.length === 0 ? (
          <Card>
            <CardHeader><CardTitle>No class assigned</CardTitle><CardDescription>Ask the school admin to assign you a class in Admin → Classes.</CardDescription></CardHeader>
          </Card>
        ) : (
          <div className="flex flex-wrap gap-2">
            {assignments.map((a) => {
              const isActive = activeClass?.class === a.class && activeClass?.section === a.section;
              return (
                <Button key={`${a.class}-${a.section}`} size="sm" variant={isActive ? 'default' : 'outline'} onClick={() => setActiveClass(a)}>
                  Class {a.class} – {a.section}
                </Button>
              );
            })}
          </div>
        )}

        {activeClass && (
          <>
            {/* Stats */}
            <div className="grid grid-cols-3 gap-2">
              <Card><CardContent className="p-3 text-center"><p className="text-xs text-muted-foreground">Present</p><p className="text-2xl font-bold text-emerald-600">{presentCount}</p></CardContent></Card>
              <Card><CardContent className="p-3 text-center"><p className="text-xs text-muted-foreground">Late</p><p className="text-2xl font-bold text-amber-600">{lateCount}</p></CardContent></Card>
              <Card><CardContent className="p-3 text-center"><p className="text-xs text-muted-foreground">Absent</p><p className="text-2xl font-bold text-rose-600">{absentCount}</p></CardContent></Card>
            </div>

            <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
              <TabsList className="grid grid-cols-3 sm:grid-cols-6 w-full">
                <TabsTrigger value="attendance"><Camera className="h-4 w-4 mr-1" />Take</TabsTrigger>
                <TabsTrigger value="today">Today</TabsTrigger>
                <TabsTrigger value="timetable"><Calendar className="h-4 w-4 mr-1" />Plan</TabsTrigger>
                <TabsTrigger value="editPlan"><CalendarCog className="h-4 w-4 mr-1" />Edit Plan</TabsTrigger>
                <TabsTrigger value="report"><FileDown className="h-4 w-4 mr-1" />Report</TabsTrigger>
                <TabsTrigger value="stats">Stats</TabsTrigger>
              </TabsList>
              <div className="mt-2">
                <Badge variant={isRealtimeHealthy ? 'default' : 'secondary'}>
                  {isRealtimeHealthy ? 'Realtime Connected' : 'Realtime Reconnecting'}
                </Badge>
              </div>

              {/* Take attendance — Face / QR / Gate */}
              <TabsContent value="attendance" className="mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Take attendance — Class {activeClass.class} {activeClass.section}</CardTitle>
                    <CardDescription>Choose a method — Face ID, QR code, or continuous Gate mode.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant={captureMethod === 'face' ? 'default' : 'outline'} onClick={() => setCaptureMethod('face')}>
                        <Scan className="h-4 w-4 mr-1" /> Face ID
                      </Button>
                      <Button size="sm" variant={captureMethod === 'qr' ? 'default' : 'outline'} onClick={() => setCaptureMethod('qr')}>
                        <QrCode className="h-4 w-4 mr-1" /> QR Code
                      </Button>
                      <Button size="sm" variant={captureMethod === 'gate' ? 'default' : 'outline'} onClick={() => setCaptureMethod('gate')}>
                        <DoorOpen className="h-4 w-4 mr-1" /> Gate Mode
                      </Button>
                    </div>

                    <Suspense fallback={<div className="h-[360px] rounded-2xl bg-muted/40 animate-pulse" />}>
                      {captureMethod === 'face' && (
                        <AttendanceCapture
                          classScope={{
                            className: activeClass.class,
                            section: activeClass.section,
                          }}
                        />
                      )}
                      {captureMethod === 'qr' && (
                        <QRCodeScanner
                          autoStart
                          onScanComplete={() => loadTodayAttendance(activeClass)}
                        />
                      )}
                      {captureMethod === 'gate' && (
                        <GateModeScanner
                          isActive={true}
                          onFaceDetected={() => loadTodayAttendance(activeClass)}
                          className={activeClass.class}
                          section={activeClass.section}
                        />
                      )}
                    </Suspense>
                  </CardContent>
                </Card>
              </TabsContent>


              {/* Today list */}
              <TabsContent value="today" className="mt-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <div><CardTitle>Today's attendance</CardTitle><CardDescription>Live updates from this class.</CardDescription></div>
                    <Button size="sm" variant="ghost" onClick={() => loadTodayAttendance(activeClass)}><RefreshCcw className="h-4 w-4" /></Button>
                  </CardHeader>
                  <CardContent>
                    {today.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-8 text-center">No attendance recorded yet today.</p>
                    ) : (
                      <ul className="divide-y">
                        {today.map((r) => (
                          <li key={r.id} className="py-2 flex items-center justify-between">
                            <div>
                              <p className="text-sm font-medium">{r.student_name || 'Unknown'}</p>
                              <p className="text-xs text-muted-foreground">{new Date(r.timestamp).toLocaleTimeString()}</p>
                            </div>
                            <Badge variant={r.status === 'present' ? 'default' : r.status === 'late' ? 'secondary' : 'destructive'}>
                              {r.status}
                            </Badge>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Timetable + substitutions */}
              <TabsContent value="timetable" className="mt-4 space-y-4">
                <Card>
                  <CardHeader><CardTitle>Periods</CardTitle><CardDescription>Set by the school admin.</CardDescription></CardHeader>
                  <CardContent>
                    {periods.length === 0 ? <p className="text-sm text-muted-foreground py-6 text-center">No periods defined.</p> : (
                      <ul className="divide-y">
                        {periods.map((p) => (
                          <li key={p.id} className="py-2 flex items-center justify-between">
                            <span className="text-sm font-medium">{p.period_name}</span>
                            <span className="text-xs text-muted-foreground">{p.start_time?.slice(0,5)} – {p.end_time?.slice(0,5)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle>Substitutions</CardTitle><CardDescription>Upcoming substitutions for your class.</CardDescription></CardHeader>
                  <CardContent>
                    {subs.length === 0 ? <p className="text-sm text-muted-foreground py-6 text-center">No upcoming substitutions.</p> : (
                      <ul className="divide-y">
                        {subs.map((s) => (
                          <li key={s.id} className="py-3 flex items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-medium">{s.subject || 'Subject TBD'} • {s.date}</p>
                              <p className="text-xs text-muted-foreground">{s.notes || (s.status || 'pending')}</p>
                            </div>
                            {!s.substitute_teacher_id && (
                              <Button size="sm" variant="outline" onClick={() => acceptSubstitution(s.id)}>Accept</Button>
                            )}
                            {s.substitute_teacher_id === userId && (
                              <Badge>Yours</Badge>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
              {/* Edit timetable — scoped to teacher's assigned classes */}
              <TabsContent value="editPlan" className="mt-4">
                {allowedCategories.length > 0 ? (
                  <Suspense fallback={<div className="h-[320px] rounded-2xl bg-muted/40 animate-pulse" />}>
                    <TimetableManager allowedCategories={allowedCategories} />
                  </Suspense>
                ) : (
                  <Card><CardHeader><CardTitle>No class assigned</CardTitle><CardDescription>Ask the admin to assign you a class before editing the timetable.</CardDescription></CardHeader></Card>
                )}
              </TabsContent>

              {/* Class report — PDF/CSV export */}
              <TabsContent value="report" className="mt-4">
                {allowedCategories.length > 0 ? (
                  <Suspense fallback={<div className="h-[320px] rounded-2xl bg-muted/40 animate-pulse" />}>
                    <ClassSectionReport allowedCategories={allowedCategories} />
                  </Suspense>
                ) : (
                  <Card><CardHeader><CardTitle>No class assigned</CardTitle><CardDescription>Ask the admin to assign you a class before exporting reports.</CardDescription></CardHeader></Card>
                )}
              </TabsContent>

              {/* Stats — today's totals for the active class */}
              <TabsContent value="stats" className="mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Today's stats — {activeCategory}</CardTitle>
                    <CardDescription>Live counts for your class.</CardDescription>
                  </CardHeader>
                  <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="rounded-xl border p-3 text-center">
                      <p className="text-xs text-muted-foreground">Total marked</p>
                      <p className="text-2xl font-bold">{today.length}</p>
                    </div>
                    <div className="rounded-xl border p-3 text-center">
                      <p className="text-xs text-muted-foreground">Present</p>
                      <p className="text-2xl font-bold text-emerald-600">{presentCount}</p>
                    </div>
                    <div className="rounded-xl border p-3 text-center">
                      <p className="text-xs text-muted-foreground">Late</p>
                      <p className="text-2xl font-bold text-amber-600">{lateCount}</p>
                    </div>
                    <div className="rounded-xl border p-3 text-center">
                      <p className="text-xs text-muted-foreground">Absent</p>
                      <p className="text-2xl font-bold text-rose-600">{absentCount}</p>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </PageLayout>
  );
};

export default TeacherPortal;