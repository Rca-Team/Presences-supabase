import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield, X, Volume2, VolumeX, Maximize, Minimize,
  Users, CheckCircle2, Wifi, WifiOff, Wand2,
  DoorOpen, ChevronUp, ChevronDown, AlertTriangle, CloudOff, Cctv, Shirt, Navigation,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import GateModeScanner from '@/components/gate/GateModeScanner';
import GateEntryFeedback from '@/components/gate/GateEntryFeedback';
import GateStatsOverlay from '@/components/gate/GateStatsOverlay';
import StrangerAlert from '@/components/gate/StrangerAlert';
import LateEntryForm from '@/components/gate/LateEntryForm';
import GateModeSetup from '@/components/gate/GateModeSetup';
import type { GateSessionStartConfig } from '@/components/gate/GateModeSetup';
import { useNavigate, Link } from 'react-router-dom';
import { useIsMobile } from '@/hooks/use-mobile';
import Logo from '@/components/Logo';

export interface GateEntry {
  id: string;
  studentName: string;
  studentId: string | null;
  time: Date;
  isRecognized: boolean;
  confidence: number;
  photoUrl?: string;
  isLate?: boolean;
  className?: string;
  section?: string;
  subject?: string;
  periodKey?: string;
  gateSessionId?: string | null;
}

interface SmartPersonLive {
  trackId: string;
  name: string;
  confidence: number;
  uniformStatus: 'compliant' | 'non-compliant' | 'unknown';
  heading: 'entry' | 'exit' | 'stationary';
}

interface SmartMonitoringPayload {
  people: SmartPersonLive[];
  uniformCompliant: number;
  uniformNonCompliant: number;
  entryFlow: number;
  exitFlow: number;
  stationary: number;
  timestamp: number;
}

interface CrowdHotspotEvent {
  count: number;
  center: { x: number; y: number };
  timestamp: number;
}

// ─── Sound helpers (beep sequences using Web Audio API) ───────────────────────
function playTone(ctx: AudioContext, freq: number, start: number, duration: number, gain = 0.28, type: OscillatorType = 'sine') {
  const osc  = ctx.createOscillator();
  const amp  = ctx.createGain();
  osc.type   = type;
  osc.frequency.value = freq;
  amp.gain.value      = gain;
  osc.connect(amp); amp.connect(ctx.destination);
  osc.start(ctx.currentTime + start);
  osc.stop(ctx.currentTime + start + duration);
}

function playSuccessChime(ctx: AudioContext) {
  playTone(ctx, 523, 0.00, 0.12); // C5
  playTone(ctx, 659, 0.10, 0.12); // E5
  playTone(ctx, 784, 0.20, 0.18); // G5
}

function playLateChime(ctx: AudioContext) {
  playTone(ctx, 440, 0.00, 0.15, 0.25, 'triangle'); // A4
  playTone(ctx, 392, 0.13, 0.15, 0.25, 'triangle'); // G4
}

function playAlertTone(ctx: AudioContext) {
  playTone(ctx, 330, 0.00, 0.12, 0.22, 'sawtooth'); // E4
  playTone(ctx, 294, 0.10, 0.12, 0.22, 'sawtooth'); // D4
}
// ─────────────────────────────────────────────────────────────────────────────

const GateMode = () => {
  const navigate   = useNavigate();
  const isMobile   = useIsMobile();

  const [isSetup,          setIsSetup]          = useState(true);
  const [isBootstrapping,  setIsBootstrapping]  = useState(true);
  const [isStartingSession,setIsStartingSession]= useState(false);
  const [confirmEnd,       setConfirmEnd]       = useState(false);

  const [gateName,         setGateName]         = useState('Main Gate');
  const [cameraSource,     setCameraSource]     = useState<'webcam' | 'cctv' | 'both'>('both');
  const [cctvStreamUrl,    setCctvStreamUrl]    = useState<string | undefined>(undefined);
  const [sessionId,        setSessionId]        = useState<string | null>(null);
  const [isFullscreen,     setIsFullscreen]     = useState(false);
  const [soundEnabled,     setSoundEnabled]     = useState(true);
  const [aiEnhancerEnabled,setAiEnhancerEnabled]= useState(true);
  const [cloudOffline,     setCloudOffline]     = useState(false);

  const [entries,          setEntries]          = useState<GateEntry[]>([]);
  const [sessionEntries,   setSessionEntries]   = useState<GateEntry[]>([]);
  const [lastEntry,        setLastEntry]        = useState<GateEntry | null>(null);

  const [strangerEntry,    setStrangerEntry]    = useState<GateEntry | null>(null);
  const [showStrangerAlert,setShowStrangerAlert]= useState(false);

  const [showLateForm,     setShowLateForm]     = useState(false);
  const [lateStudent,      setLateStudent]      = useState<GateEntry | null>(null);

  const [isOnline,         setIsOnline]         = useState(navigator.onLine);
  const [totalStudents,    setTotalStudents]    = useState(0);
  const [totalPresentToday,setTotalPresentToday]= useState(0);
  const [lateCount,        setLateCount]        = useState(0);
  const [pendingCount,     setPendingCount]     = useState(0);
  const [mobileStatsOpen,  setMobileStatsOpen]  = useState(false);
  const [smartMonitoring,  setSmartMonitoring]  = useState<SmartMonitoringPayload>({
    people: [],
    uniformCompliant: 0,
    uniformNonCompliant: 0,
    entryFlow: 0,
    exitFlow: 0,
    stationary: 0,
    timestamp: Date.now(),
  });
  const [smartEvents, setSmartEvents] = useState<Array<{ id: string; message: string; tone: 'info' | 'warning'; time: number }>>([]);

  const [cutoffHour,       setCutoffHour]       = useState(9);
  const [cutoffMinute,     setCutoffMinute]     = useState(0);
  const [activePeriodKey,  setActivePeriodKey]  = useState(
    () => `period-${new Date().toISOString().slice(0, 10)}-default`,
  );
  const [className,        setClassName]        = useState<string>();
  const [section,          setSection]          = useState<string>();
  const [subject,            setSubject]          = useState<string>();

  const containerRef       = useRef<HTMLDivElement>(null);
  const audioCtxRef        = useRef<AudioContext | null>(null);
  const sessionIdRef       = useRef<string | null>(null);
  const sessionEntriesRef  = useRef<GateEntry[]>([]);
  const crowdAlertCooldownRef = useRef(0);

  const getAudioCtx = useCallback(() => {
    if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
    if (audioCtxRef.current.state === 'suspended') audioCtxRef.current.resume();
    return audioCtxRef.current;
  }, []);

  const playSound = useCallback((type: 'success' | 'late' | 'alert') => {
    if (!soundEnabled) return;
    try {
      const ctx = getAudioCtx();
      if (type === 'success') playSuccessChime(ctx);
      else if (type === 'late') playLateChime(ctx);
      else playAlertTone(ctx);
    } catch {}
  }, [soundEnabled, getAudioCtx]);

  // Keep refs in sync with state for callbacks / realtime filters
  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);
  useEffect(() => { sessionEntriesRef.current = sessionEntries; }, [sessionEntries]);

  // ── Online / offline ───────────────────────────────────────────────────────
  useEffect(() => {
    const on  = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener('online',  on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  // ── Wake lock (prevent screen sleep during gate session) ───────────────────
  useEffect(() => {
    let lock: any = null;
    if (!isSetup && 'wakeLock' in navigator) {
      (navigator as any).wakeLock.request('screen').then((l: any) => { lock = l; }).catch(() => {});
    }
    return () => { lock?.release(); };
  }, [isSetup]);

  // ── Fullscreen ─────────────────────────────────────────────────────────────
  const toggleFullscreen = useCallback(async () => {
    if (!document.fullscreenElement) {
      await containerRef.current?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      await document.exitFullscreen();
      setIsFullscreen(false);
    }
  }, []);

  // ── Live stats ─────────────────────────────────────────────────────────────
  const fetchGateStats = useCallback(async () => {
    try {
      const start = new Date(); start.setHours(0, 0, 0, 0);
      const end   = new Date(start); end.setDate(end.getDate() + 1);

      const [registeredRes, descriptorRes, attRes] = await Promise.all([
        // Canonical registered student source
        supabase
          .from('attendance_records')
          .select('user_id, student_id, device_info')
          .eq('status', 'registered'),
        // Descriptor-only registrations (fallback when attendance registration row is missing)
        supabase
          .from('face_descriptors')
          .select('user_id, student_id'),
        // Attendance today via gate-mode
        supabase.from('attendance_records')
          .select('user_id, status').eq('source', 'gate-mode')
          .in('status', ['present', 'late']).not('user_id', 'is', null)
          .gte('timestamp', start.toISOString()).lt('timestamp', end.toISOString()),
      ]);

      const registeredRows = (registeredRes.data || []).filter((row: any) => {
        if (!className && !section) return true;
        const metadata = (row.device_info as any)?.metadata || {};
        const rowClass = metadata.class || null;
        const rowSection = metadata.section || null;
        const classMatches = !className || !rowClass || rowClass === className;
        const sectionMatches = !section || !rowSection || rowSection === section;
        return classMatches && sectionMatches;
      });

      const registeredIds = new Set(
        registeredRows
          .map((row: any) => {
            const metadata = (row.device_info as any)?.metadata || {};
            return (
              row.student_id ||
              metadata.employee_id ||
              metadata.roll_number ||
              row.user_id ||
              (row.device_info as any)?.employee_id ||
              row.id
            );
          })
          .filter(Boolean),
      );

      (descriptorRes.data || []).forEach((row: any) => {
        const id = row.user_id || row.student_id;
        if (id) registeredIds.add(id);
      });

      const rows    = attRes.data || [];
      const present = new Set(rows.map(r => r.user_id).filter(Boolean));
      const late    = new Set(rows.filter(r => r.status === 'late').map(r => r.user_id).filter(Boolean));

      setTotalStudents(registeredIds.size);
      setTotalPresentToday(present.size);
      setLateCount(late.size);
    } catch {}
  }, [className, section]);

  // ── Session persistence ────────────────────────────────────────────────────
  const loadSessionEntries = useCallback(async (sid: string) => {
    try {
      const { data, error } = await supabase
        .from('gate_entries')
        .select('id, student_id, student_name, is_recognized, confidence_score, snapshot_url, entry_time, class, section, metadata')
        .eq('gate_session_id', sid)
        .order('entry_time', { ascending: false });
      if (error) throw error;
      const mapped: GateEntry[] = (data || []).map(row => ({
        id:          row.id,
        studentId:   row.student_id,
        studentName: row.student_name || 'Unknown',
        isRecognized: row.is_recognized,
        confidence:  row.confidence_score || 0,
        photoUrl:    row.snapshot_url || undefined,
        time:        new Date(row.entry_time || row.created_at),
        className:   row.class || undefined,
        section:     row.section || undefined,
        periodKey:   (row.metadata as any)?.periodKey || undefined,
      }));
      setSessionEntries(mapped);
      setEntries(mapped);
    } catch (e) { console.warn('[Gate] Could not load session entries:', e); }
  }, []);

  const resumeActiveSession = useCallback(async () => {
    try {
      const start = new Date(); start.setHours(0, 0, 0, 0);
      const { data, error } = await supabase
        .from('gate_sessions')
        .select('id, gate_name, metadata')
        .is('ended_at', null)
        .gte('started_at', start.toISOString())
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error || !data) return false;

      sessionIdRef.current = data.id;
      setSessionId(data.id);
      setGateName(data.gate_name || 'Main Gate');
      const meta = (data.metadata || {}) as any;
      setClassName(meta.class || undefined);
      setSection(meta.section || undefined);
      setSubject(meta.subject || undefined);
      setCameraSource(meta.cameraSource || 'both');
      setCctvStreamUrl(meta.cctvStreamUrl || undefined);
      if (meta.periodKey) setActivePeriodKey(meta.periodKey);
      setIsSetup(false);
      await loadSessionEntries(data.id);
      return true;
    } catch (e) { console.warn('[Gate] Could not resume active session:', e); return false; }
  }, [loadSessionEntries]);

  // Bootstrap: fetch settings + stats, resume any active session.
  // Every step is guarded so a single failed query can never leave the
  // page stuck on the loading skeleton.
  useEffect(() => {
    let statsInterval: any = null;
    let cancelled = false;

    const safe = async <T,>(fn: () => Promise<T>): Promise<T | null> => {
      try { return await fn(); } catch (e) { console.warn('[Gate] bootstrap step failed:', e); return null; }
    };

    (async () => {
      // Cutoff time
      await safe(async () => {
        const { data } = await supabase
          .from('attendance_settings').select('value').eq('key', 'cutoff_time').maybeSingle();
        if (data?.value) {
          const [h, m] = String(data.value).split(':').map(Number);
          setCutoffHour(h || 9); setCutoffMinute(m || 0);
        }
      });

      // Active period
      await safe(async () => {
        const now        = new Date();
        const nowMinutes = now.getHours() * 60 + now.getMinutes();
        const { data: periods } = await supabase
          .from('period_timings').select('period_name, start_time, end_time').order('start_time');
        const current = (periods || []).find(p => {
          const [sh, sm] = String(p.start_time || '00:00').split(':').map(Number);
          const [eh, em] = String(p.end_time   || '23:59').split(':').map(Number);
          return nowMinutes >= sh * 60 + sm && nowMinutes <= eh * 60 + em;
        });
        if (current?.period_name) {
          setActivePeriodKey(`period-${now.toISOString().slice(0, 10)}-${current.period_name.replace(/\s+/g, '-').toLowerCase()}`);
        }
      });

      await safe(() => fetchGateStats());
      await safe(() => resumeActiveSession());

      if (cancelled) return;
      statsInterval = setInterval(() => { void safe(() => fetchGateStats()); }, 15_000);
      setIsBootstrapping(false);
    })().catch((e) => {
      console.warn('[Gate] bootstrap crashed, showing setup anyway:', e);
      setIsBootstrapping(false);
    });

    // Safety net: never stay on the loading skeleton longer than 4s.
    const fallbackTimer = setTimeout(() => setIsBootstrapping(false), 4000);

    return () => {
      cancelled = true;
      clearTimeout(fallbackTimer);
      if (statsInterval) clearInterval(statsInterval);
    };
  }, [fetchGateStats, resumeActiveSession]);

  // Realtime subscription: keep session entries synced whenever sessionId changes
  useEffect(() => {
    if (!sessionId) return;
    const channel = supabase
      .channel(`gate-entries-${sessionId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'gate_entries',
        filter: `gate_session_id=eq.${sessionId}`,
      }, (payload) => {
        const row = payload.new as any;
        if (!row) return;
        const entry: GateEntry = {
          id:          row.id,
          studentId:   row.student_id,
          studentName: row.student_name || 'Unknown',
          isRecognized: row.is_recognized,
          confidence:  row.confidence_score || 0,
          photoUrl:    row.snapshot_url || undefined,
          time:        new Date(row.entry_time || row.created_at),
          className:   row.class || undefined,
          section:     row.section || undefined,
          periodKey:   (row.metadata as any)?.periodKey || undefined,
        };
        setSessionEntries(prev => prev.some(e => e.id === row.id) ? prev : [entry, ...prev]);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [sessionId]);

  // ── Persist a single gate entry to Supabase ─────────────────────────────────
  const persistGateEntry = useCallback(async (entry: GateEntry) => {
    if (!sessionIdRef.current) return null;
    try {
      const { data, error } = await supabase.from('gate_entries').insert({
        gate_session_id:  sessionIdRef.current,
        student_id:       entry.studentId,
        student_name:     entry.studentName,
        is_recognized:    entry.isRecognized,
        confidence_score: entry.confidence,
        gate_name:        gateName,
        snapshot_url:     entry.photoUrl ?? null,
        entry_time:       entry.time.toISOString(),
        class:            entry.className ?? null,
        section:          entry.section ?? null,
        metadata:         {
          periodKey: entry.periodKey,
          subject:   entry.subject,
          source:    'gate-mode',
        },
      }).select('id').single();
      if (error) throw error;
      return data?.id || null;
    } catch (err) {
      console.error('[Gate] Failed to persist gate entry:', err);
      toast.error('Could not save gate entry');
      return null;
    }
  }, [gateName]);

  // ── Session management ─────────────────────────────────────────────────────
  const startSession = useCallback(async (config: GateSessionStartConfig) => {
    if (isStartingSession) return;
    setIsStartingSession(true);
    setGateName(config.gateName);
    setCameraSource(config.cameraSource);
    setCctvStreamUrl(config.cctvStreamUrl);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) throw new Error('Not signed in. Please sign in and retry.');

      const { data, error } = await supabase.from('gate_sessions').insert({
        gate_name:   config.gateName,
        started_by:  session.user.id,
        device_info: { userAgent: navigator.userAgent, screen: `${screen.width}x${screen.height}` },
        metadata:    {
          periodKey: activePeriodKey,
          class: className,
          section,
          subject,
          cameraSource: config.cameraSource,
          cctvStreamUrl: config.cctvStreamUrl,
        },
      }).select('id').single();

      if (error) throw error;
      sessionIdRef.current = data.id;
      setSessionId(data.id);
      setSessionEntries([]);
      setEntries([]);
      setSmartEvents([]);
      setIsSetup(false);
      toast.success(`Gate Mode started — ${config.gateName}`);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to start gate session');
    } finally {
      setIsStartingSession(false);
    }
  }, [isStartingSession, activePeriodKey, className, section, subject]);

  const endSession = useCallback(async () => {
    if (sessionId) {
      const recognized = sessionEntries.filter(e => e.isRecognized).length;
      const unknown    = sessionEntries.filter(e => !e.isRecognized).length;
      await supabase.from('gate_sessions').update({
        ended_at:       new Date().toISOString(),
        total_entries:  recognized,
        unknown_entries: unknown,
      }).eq('id', sessionId);
    }
    sessionIdRef.current = null;
    setSessionId(null);
    navigate('/admin');
  }, [sessionId, sessionEntries, navigate]);

  // ── Face detected callback ─────────────────────────────────────────────────
  const handleFaceDetected = useCallback(async (entry: GateEntry) => {
    // Optimistically show the entry in the UI and include it in session stats
    // before the DB round-trip completes. The realtime subscription will later
    // confirm it (idempotent by id) so stats remain accurate after refresh.
    setSessionEntries(prev => prev.some(e => e.id === entry.id) ? prev : [entry, ...prev]);
    setEntries(prev => [entry, ...prev]);
    setLastEntry(entry);

    if (entry.isRecognized) {
      playSound(entry.isLate ? 'late' : 'success');

      // Late form (non-blocking corner panel)
      if (entry.isLate) {
        setLateStudent(entry);
        setShowLateForm(true);
      }

    } else {
      playSound('alert');
      setStrangerEntry(entry);
      setShowStrangerAlert(true);
    }

    // Persist to gate_entries (awaited so errors surface)
    await persistGateEntry(entry);
    fetchGateStats();
  }, [playSound, fetchGateStats, persistGateEntry]);

  // ── Derived stats ──────────────────────────────────────────────────────────
  // Use DB-backed sessionEntries for the current gate session so stats survive refresh
  const { autoMarkedCount, unknownCount, uniqueStudents } = useMemo(() => {
    const recognized = sessionEntries.filter(e => e.isRecognized);
    const unk  = sessionEntries.length - recognized.length;
    const uniq = new Set(recognized.map(e => e.studentId).filter(Boolean)).size;
    return { autoMarkedCount: recognized.length, unknownCount: unk, uniqueStudents: uniq };
  }, [sessionEntries]);

  const addSmartEvent = useCallback((message: string, tone: 'info' | 'warning' = 'info') => {
    setSmartEvents((prev) => [
      { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, message, tone, time: Date.now() },
      ...prev,
    ].slice(0, 40));
  }, []);

  const handleSmartMonitoringUpdate = useCallback((payload: SmartMonitoringPayload) => {
    setSmartMonitoring(payload);
  }, []);

  const handleCrowdHotspot = useCallback((event: CrowdHotspotEvent) => {
    const now = Date.now();
    if (now - crowdAlertCooldownRef.current < 20_000) return;
    crowdAlertCooldownRef.current = now;

    playSound('alert');
    addSmartEvent(`Crowd hotspot: ${event.count} students gathered near one zone`, 'warning');
    toast.warning(`Crowd hotspot detected (${event.count} students in one area)`);

    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Gate Crowd Hotspot Alert', {
        body: `${event.count} students detected at one place.`,
      });
    }
  }, [addSmartEvent, playSound]);

  // ── Loading skeleton ───────────────────────────────────────────────────────
  if (isSetup && isBootstrapping) {
    return (
      <div className="fixed inset-0 bg-background z-50 p-4 sm:p-6">
        <div className="max-w-3xl mx-auto space-y-4 animate-fade-in">
          <div className="premium-skeleton h-10 w-56 mx-auto" />
          <div className="premium-skeleton h-12 w-full rounded-2xl" />
          <div className="premium-skeleton h-[56vh] w-full rounded-3xl" />
          <div className="grid grid-cols-2 gap-3">
            <div className="premium-skeleton h-12 rounded-xl" />
            <div className="premium-skeleton h-12 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  if (isSetup) {
    return <GateModeSetup onStart={startSession} onCancel={() => navigate('/admin')} isStarting={isStartingSession} />;
  }

  // ── Active gate session ────────────────────────────────────────────────────
  return (
    <div ref={containerRef} className="fixed inset-0 bg-background z-50 flex flex-col overflow-hidden">

      {/* ── Top bar ── */}
      <div className="flex items-center justify-between px-2 sm:px-4 py-1.5 sm:py-2 bg-card/80 backdrop-blur border-b border-border safe-area-top">
        <div className="flex items-center gap-1.5 sm:gap-3 min-w-0">
          <Link to="/" className="flex-shrink-0"><Logo size="sm" /></Link>
          <span className="font-bold text-sm sm:text-lg text-foreground truncate">{gateName}</span>
          <Badge variant="outline" className="text-[10px] sm:text-xs flex-shrink-0 px-1.5 sm:px-2">
            <Cctv className="h-3 w-3 mr-1 text-primary" />
            {cameraSource.toUpperCase()}
          </Badge>
          <Badge variant="outline" className="text-[10px] sm:text-xs flex-shrink-0 px-1.5 sm:px-2">
            {isOnline
              ? <Wifi    className="h-3 w-3 mr-0.5 text-green-500" />
              : <WifiOff className="h-3 w-3 mr-0.5 text-destructive" />
            }
            <span className="hidden sm:inline">{isOnline ? 'Online' : 'Offline'}</span>
          </Badge>
          {cloudOffline && (
            <Badge variant="outline" className="text-[10px] sm:text-xs flex-shrink-0 px-1.5 sm:px-2 border-amber-500/50 text-amber-600">
              <CloudOff className="h-3 w-3 mr-0.5" />
              <span className="hidden sm:inline">Local AI</span>
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-1 sm:gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8 sm:h-9 sm:w-9" onClick={() => setSoundEnabled(v => !v)}>
            {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </Button>
          <Button
            variant={aiEnhancerEnabled ? 'default' : 'ghost'}
            size="sm"
            className="h-8 sm:h-9 text-xs px-2 sm:px-3"
            onClick={() => setAiEnhancerEnabled(v => !v)}
          >
            <Wand2 className="h-3.5 w-3.5 mr-1" />
            <span className="hidden sm:inline">Enhance {aiEnhancerEnabled ? 'On' : 'Off'}</span>
          </Button>
          <Link to="/gate/vision" className="hidden sm:inline-flex">
            <Button variant="outline" size="sm" className="h-8 sm:h-9 text-xs px-2 sm:px-3 gap-1 border-primary/50 text-primary hover:bg-primary/10">
              <Cctv className="h-3.5 w-3.5" />
              Vision 2.0
            </Button>
          </Link>
          {!isMobile && (
            <Button variant="ghost" size="icon" className="h-8 w-8 sm:h-9 sm:w-9" onClick={toggleFullscreen}>
              {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
            </Button>
          )}
          <Button
            variant="destructive"
            size="sm"
            className="h-8 sm:h-9 text-xs sm:text-sm px-2 sm:px-3"
            onClick={() => setConfirmEnd(true)}
          >
            <X className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-0.5 sm:mr-1" />
            <span className="hidden sm:inline">End Session</span>
            <span className="sm:hidden">End</span>
          </Button>
        </div>
      </div>

      {/* ── Main layout ── */}
      <div className={`flex-1 flex relative ${isMobile ? 'flex-col' : 'flex-row'}`}>

        {/* Mobile mini stats moved to bottom floating bar — top overlay removed to avoid covering scanner status pills */}

        {/* Camera */}
        <div className={isMobile ? 'flex-1 relative' : 'flex-[7] relative'}>
          <GateModeScanner
            onFaceDetected={handleFaceDetected}
            onSmartMonitoringUpdate={handleSmartMonitoringUpdate}
            onCrowdHotspot={handleCrowdHotspot}
            isActive={!isSetup}
            onPendingCountChange={setPendingCount}
            onCloudStatusChange={setCloudOffline}
            markedCount={autoMarkedCount}
            periodKey={activePeriodKey}
            className={className}
            section={section}
            subject={subject}
            aiEnhancerEnabled={aiEnhancerEnabled}
            cutoffHour={cutoffHour}
            cutoffMinute={cutoffMinute}
            cameraSource={cameraSource}
            cctvStreamUrl={cctvStreamUrl}
          />

          {/* Entry feedback */}
          <AnimatePresence mode="wait">
            {lastEntry && (
              <GateEntryFeedback
                key={lastEntry.id}
                entry={lastEntry}
                onDismiss={() => setLastEntry(null)}
              />
            )}
          </AnimatePresence>

          {/* Mobile: floating bottom bar — present / late / unknown + Details */}
          {isMobile && !mobileStatsOpen && (
            <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between z-10">
              <div className="flex items-center gap-1.5 flex-wrap">
                <div className="bg-card/90 backdrop-blur rounded-full px-3 py-1.5 flex items-center gap-1.5 shadow-lg">
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                  <span className="text-xs font-bold text-foreground">{autoMarkedCount} marked</span>
                </div>
                <div className="bg-card/90 backdrop-blur rounded-full px-3 py-1.5 flex items-center gap-1.5 shadow-lg">
                  <Users className="h-3.5 w-3.5 text-primary" />
                  <span className="text-xs font-bold text-foreground">{uniqueStudents}/{totalStudents}</span>
                </div>
                {unknownCount > 0 && (
                  <div className="bg-destructive/90 backdrop-blur rounded-full px-3 py-1.5 flex items-center gap-1.5 shadow-lg">
                    <AlertTriangle className="h-3.5 w-3.5 text-destructive-foreground" />
                    <span className="text-xs font-bold text-destructive-foreground">{unknownCount}</span>
                  </div>
                )}
              </div>
              <Button variant="secondary" size="sm" className="h-8 rounded-full shadow-lg text-xs flex-shrink-0"
                onClick={() => setMobileStatsOpen(true)}>
                <ChevronUp className="h-3.5 w-3.5 mr-1" /> Details
              </Button>
            </div>
          )}
        </div>

        {/* Stats sidebar — desktop */}
        {!isMobile && (
          <div className="flex-[3] border-l border-border overflow-y-auto">
            <div className="p-3 border-b border-border space-y-3 bg-card/70">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">Smart Live Tracking</h3>
                <Badge variant="secondary" className="text-[10px]">Expert AI</Badge>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg border border-border p-2">
                  <div className="flex items-center gap-1 text-muted-foreground"><Shirt className="h-3.5 w-3.5" /> Uniform</div>
                  <p className="font-semibold text-foreground mt-1">{smartMonitoring.uniformCompliant} compliant / {smartMonitoring.uniformNonCompliant} mismatch</p>
                </div>
                <div className="rounded-lg border border-border p-2">
                  <div className="flex items-center gap-1 text-muted-foreground"><Navigation className="h-3.5 w-3.5" /> Movement</div>
                  <p className="font-semibold text-foreground mt-1">IN {smartMonitoring.entryFlow} · OUT {smartMonitoring.exitFlow}</p>
                </div>
              </div>

              <div className="max-h-28 overflow-y-auto space-y-1.5">
                {smartMonitoring.people.slice(0, 5).map((p) => (
                  <div key={p.trackId} className="rounded-md border border-border px-2 py-1.5 text-[11px] flex items-center justify-between gap-2">
                    <span className="truncate text-foreground font-medium">{p.name}</span>
                    <span className="text-muted-foreground">{Math.round(p.confidence * 100)}%</span>
                    <span className={p.uniformStatus === 'non-compliant' ? 'text-rose-500' : p.uniformStatus === 'compliant' ? 'text-emerald-500' : 'text-muted-foreground'}>{p.uniformStatus}</span>
                    <span className="text-primary">{p.heading}</span>
                  </div>
                ))}
              </div>

              <div className="max-h-24 overflow-y-auto space-y-1">
                {smartEvents.slice(0, 4).map((e) => (
                  <div key={e.id} className={`rounded-md px-2 py-1.5 text-[11px] border ${e.tone === 'warning' ? 'border-amber-500/40 text-amber-300 bg-amber-500/10' : 'border-border text-muted-foreground bg-background/60'}`}>
                    {e.message}
                  </div>
                ))}
              </div>
            </div>

            <GateStatsOverlay
              autoMarkedCount={autoMarkedCount}
              totalStudents={totalStudents}
              uniqueStudents={uniqueStudents}
              totalPresentToday={totalPresentToday}
              lateCount={lateCount}
              pendingCount={pendingCount}
              unknownCount={unknownCount}
              recentEntries={sessionEntries.slice(0, 30)}
            />
          </div>
        )}

        {/* Mobile stats bottom sheet */}
        <AnimatePresence>
          {isMobile && mobileStatsOpen && (
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'tween', duration: 0.28 }}
              className="absolute bottom-0 left-0 right-0 bg-card/95 backdrop-blur-xl rounded-t-2xl border-t border-border shadow-2xl z-20"
              style={{ maxHeight: '60vh' }}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <h3 className="font-semibold text-sm text-foreground">Gate Stats</h3>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setMobileStatsOpen(false)}>
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </div>
              <div className="overflow-y-auto" style={{ maxHeight: 'calc(60vh - 48px)' }}>
                <GateStatsOverlay
                  autoMarkedCount={autoMarkedCount}
                  totalStudents={totalStudents}
                  uniqueStudents={uniqueStudents}
                  totalPresentToday={totalPresentToday}
                  lateCount={lateCount}
                  pendingCount={pendingCount}
                  unknownCount={unknownCount}
                  recentEntries={sessionEntries.slice(0, 30)}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Stranger alert (non-blocking corner) ── */}
      <AnimatePresence>
        {showStrangerAlert && strangerEntry && (
          <StrangerAlert
            key={strangerEntry.id}
            photoUrl={strangerEntry.photoUrl}
            gateName={gateName}
            onDismiss={() => { setShowStrangerAlert(false); setStrangerEntry(null); }}
            onAlertStaff={() => toast.warning(`Alert sent to staff — unknown person at ${gateName}`)}
          />
        )}
      </AnimatePresence>

      {/* ── Late entry form (non-blocking corner) ── */}
      <AnimatePresence>
        {showLateForm && lateStudent && (
          <LateEntryForm
            key={lateStudent.id}
            student={lateStudent}
            onSubmit={async (reason, detail) => {
              await supabase.from('late_entries').insert({
                student_id:   lateStudent.studentId,
                student_name: lateStudent.studentName,
                reason,
                reason_detail: detail,
              });
              setShowLateForm(false);
              setLateStudent(null);
              toast.success('Late entry recorded');
            }}
            onDismiss={() => { setShowLateForm(false); setLateStudent(null); }}
          />
        )}
      </AnimatePresence>

      {/* ── End session confirmation dialog ── */}
      <AnimatePresence>
        {confirmEnd && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.92, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.92, y: 16 }}
              className="bg-card rounded-2xl border border-border shadow-2xl p-6 max-w-sm w-full space-y-4"
            >
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-destructive/10 flex items-center justify-center">
                  <DoorOpen className="h-5 w-5 text-destructive" />
                </div>
                <div>
                  <h3 className="font-bold text-foreground">End Gate Session?</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {uniqueStudents} student{uniqueStudents !== 1 ? 's' : ''} recorded this session.
                  </p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                This will close the camera and save the session summary. You can review it in the History tab.
              </p>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setConfirmEnd(false)}>
                  Keep Running
                </Button>
                <Button variant="destructive" className="flex-1" onClick={endSession}>
                  End Session
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default GateMode;
