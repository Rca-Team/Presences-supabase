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

  const [isSetup,          setIsSetup]          = useState(false);
  const [isBootstrapping,  setIsBootstrapping]  = useState(false);
  const [isStartingSession,setIsStartingSession]= useState(false);
  const [confirmEnd,       setConfirmEnd]       = useState(false);

  const [gateName,         setGateName]         = useState('Main Gate');
  const [cameraSource,     setCameraSource]     = useState<'webcam' | 'cctv' | 'both'>('webcam');
  const [cctvStreamUrl,    setCctvStreamUrl]    = useState<string | undefined>(undefined);
  const [sessionId,        setSessionId]        = useState<string | null>(null);
  const [isFullscreen,     setIsFullscreen]     = useState(false);
  const [soundEnabled,     setSoundEnabled]     = useState(true);
  const [voiceGreeting,    setVoiceGreeting]    = useState<'voice' | 'chime' | 'off'>('voice');
  const [uniformDetectionEnabled, setUniformDetectionEnabled] = useState(true);
  const [aiEnhancerEnabled,setAiEnhancerEnabled]= useState(true);
  const [cloudOffline,     setCloudOffline]     = useState(false);
  const [mobileStatsOpen,  setMobileStatsOpen]  = useState(false);

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

  const [smartMonitoring,  setSmartMonitoring]  = useState<{
    people: Array<{
      trackId: string;
      name: string;
      confidence: number;
      uniformStatus: 'compliant' | 'non-compliant' | 'unknown';
      hasLanyard?: boolean;
      heading: 'entry' | 'exit' | 'stationary';
    }>;
    uniformCompliant: number;
    uniformNonCompliant: number;
    entryFlow: number;
    exitFlow: number;
    stationary: number;
    timestamp: number;
  }>({
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

      const [profilesRes, registeredRes, descriptorRes, attRes] = await Promise.all([
        supabase.from('profiles').select('user_id, employee_id, roll_number, full_name, display_name'),
        supabase
          .from('attendance_records')
          .select('user_id, student_id, device_info')
          .eq('status', 'registered'),
        supabase
          .from('face_descriptors')
          .select('user_id, student_id'),
        supabase.from('attendance_records')
          .select('user_id, status, student_id, student_name')
          .gte('timestamp', start.toISOString()).lt('timestamp', end.toISOString()),
      ]);

      const uniqueIds = new Set<string>();
      (profilesRes.data || []).forEach((p) => {
        if (p.user_id) uniqueIds.add(p.user_id);
      });
      (registeredRes.data || []).forEach((r) => {
        if (r.user_id) uniqueIds.add(r.user_id);
      });
      (descriptorRes.data || []).forEach((d) => {
        if (d.user_id) uniqueIds.add(d.user_id);
      });

      const rows = attRes.data || [];
      const present = new Set(
        rows.filter((r) => r.status === 'present' || r.status === 'late').map((r) => r.user_id || r.student_id || r.student_name).filter(Boolean)
      );
      const late = new Set(
        rows.filter((r) => r.status === 'late').map((r) => r.user_id || r.student_id || r.student_name).filter(Boolean)
      );

      setTotalStudents(Math.max(uniqueIds.size, present.size));
      setTotalPresentToday(present.size);
      setLateCount(late.size);
    } catch (err) {
      console.warn('fetchGateStats error:', err);
    }
  }, []);

  // ── Session persistence ────────────────────────────────────────────────────
  const loadSessionEntries = useCallback(async (sid: string) => {
    try {
      const { data, error } = await supabase
        .from('gate_entries')
        .select('id, student_id, student_name, is_recognized, confidence_score, snapshot_url, entry_time, class, section, metadata')
        .eq('gate_session_id', sid)
        .order('entry_time', { ascending: false });
      if (error) throw error;
      const mapped: GateEntry[] = (data || []).map((row) => ({
        id:          row.id,
        studentId:   row.student_id,
        studentName: row.student_name || 'Unknown',
        isRecognized: row.is_recognized,
        confidence:  row.confidence_score || 0,
        photoUrl:    row.snapshot_url || undefined,
        time:        new Date(row.entry_time || (row as any).created_at),
        className:   row.class || undefined,
        section:     row.section || undefined,
        periodKey:   (row.metadata as any)?.periodKey || undefined,
      }));
      setSessionEntries(mapped);
      setEntries(mapped);
    } catch (e) {
      console.warn('[Gate] Could not load session entries:', e);
    }
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
      setCameraSource(meta.cameraSource || 'webcam');
      setCctvStreamUrl(meta.cctvStreamUrl || undefined);
      if (meta.periodKey) setActivePeriodKey(meta.periodKey);
      await loadSessionEntries(data.id);
      return true;
    } catch (e) {
      console.warn('[Gate] Could not resume active session:', e);
      return false;
    }
  }, [loadSessionEntries]);

  // Bootstrap
  useEffect(() => {
    let statsInterval: any = null;

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

      await safe(() => fetchGateStats());
      await safe(() => resumeActiveSession());

      statsInterval = setInterval(() => { void safe(() => fetchGateStats()); }, 10_000);
    })();

    return () => {
      if (statsInterval) clearInterval(statsInterval);
    };
  }, [fetchGateStats, resumeActiveSession]);

  // Realtime subscription
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
    try {
      const { data, error } = await supabase.from('gate_entries').insert({
        gate_session_id:  sessionIdRef.current || null,
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
      return null;
    }
  }, [gateName]);

  // ── Face detected callback ─────────────────────────────────────────────────
  const handleFaceDetected = useCallback(async (entry: GateEntry) => {
    setSessionEntries(prev => prev.some(e => e.id === entry.id) ? prev : [entry, ...prev]);
    setEntries(prev => [entry, ...prev]);
    setLastEntry(entry);

    if (entry.isRecognized) {
      playSound(entry.isLate ? 'late' : 'success');
      if (entry.isLate) {
        setLateStudent(entry);
        setShowLateForm(true);
      }
    } else {
      playSound('alert');
      setStrangerEntry(entry);
      setShowStrangerAlert(true);
    }

    await persistGateEntry(entry);
    fetchGateStats();
  }, [playSound, fetchGateStats, persistGateEntry]);

  // ── Derived stats ──────────────────────────────────────────────────────────
  const { autoMarkedCount, unknownCount, uniqueStudents } = useMemo(() => {
    const recognized = sessionEntries.filter(e => e.isRecognized);
    const unk  = sessionEntries.length - recognized.length;
    const uniq = new Set(recognized.map(e => e.studentId || e.studentName).filter(Boolean)).size;
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
  }, [addSmartEvent, playSound]);

  // ── Active gate session ────────────────────────────────────────────────────
  return (
    <div ref={containerRef} className="fixed inset-0 bg-[#070b14] z-40 flex flex-col overflow-hidden text-foreground">

      {/* ── Top Command Bar ── */}
      {isMobile ? (
        /* Mobile Dedicated Top Floating Header */
        <div className="flex items-center justify-between px-3 py-2 bg-card/90 backdrop-blur-2xl border-b border-border/70 shadow-lg z-30">
          <div className="flex items-center gap-1.5 min-w-0">
            <Link to="/" className="flex-shrink-0"><Logo size="sm" /></Link>
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-primary/10 border border-primary/20 max-w-[130px]">
              <DoorOpen className="h-3 w-3 text-primary flex-shrink-0" />
              <select
                value={gateName}
                onChange={(e) => setGateName(e.target.value)}
                className="bg-transparent text-[11px] font-extrabold text-foreground focus:outline-none cursor-pointer truncate"
              >
                <option value="Main Gate" className="bg-card text-foreground">Main Gate</option>
                <option value="Gate 1 (North)" className="bg-card text-foreground">Gate 1</option>
                <option value="Gate 2 (South)" className="bg-card text-foreground">Gate 2</option>
                <option value="Bus Terminal Gate" className="bg-card text-foreground">Bus Gate</option>
              </select>
            </div>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0.5 border-emerald-500/40 text-emerald-400 bg-emerald-500/10 font-bold">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 mr-1 animate-pulse" />
              Live
            </Badge>
          </div>

          <div className="flex items-center gap-1">
            {/* Voice Greeting Toggle */}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full text-foreground hover:bg-card/80"
              onClick={() => setVoiceGreeting(curr => curr === 'voice' ? 'chime' : curr === 'chime' ? 'off' : 'voice')}
              title={`Voice: ${voiceGreeting}`}
            >
              {voiceGreeting === 'voice' ? (
                <Volume2 className="h-4 w-4 text-emerald-400" />
              ) : voiceGreeting === 'chime' ? (
                <Volume2 className="h-4 w-4 text-cyan-400" />
              ) : (
                <VolumeX className="h-4 w-4 text-muted-foreground" />
              )}
            </Button>

            {/* Uniform AI Toggle */}
            <Button
              variant={uniformDetectionEnabled ? 'default' : 'outline'}
              size="icon"
              className={`h-8 w-8 rounded-full ${
                uniformDetectionEnabled ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/40' : ''
              }`}
              onClick={() => setUniformDetectionEnabled(v => !v)}
              title="Uniform AI"
            >
              <Shirt className="h-3.5 w-3.5" />
            </Button>

            {/* Exit */}
            <Button
              variant="destructive"
              size="icon"
              className="h-8 w-8 rounded-full shadow-md shadow-destructive/20 ml-0.5"
              onClick={() => navigate('/admin')}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ) : (
        /* Desktop Top Command Bar */
        <div className="flex items-center justify-between px-3 sm:px-5 py-2.5 bg-card/80 backdrop-blur-2xl border-b border-border/70 shadow-lg z-30">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <Link to="/" className="flex-shrink-0"><Logo size="sm" /></Link>
            
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-primary/10 border border-primary/20">
              <DoorOpen className="h-4 w-4 text-primary" />
              <select
                value={gateName}
                onChange={(e) => setGateName(e.target.value)}
                className="bg-transparent text-xs font-extrabold text-foreground focus:outline-none cursor-pointer"
              >
                <option value="Main Gate" className="bg-card text-foreground">Main Gate</option>
                <option value="Gate 1 (North)" className="bg-card text-foreground">Gate 1 (North)</option>
                <option value="Gate 2 (South)" className="bg-card text-foreground">Gate 2 (South)</option>
                <option value="Bus Terminal Gate" className="bg-card text-foreground">Bus Terminal Gate</option>
              </select>
            </div>

            <Badge variant="outline" className="hidden sm:inline-flex text-xs px-2 py-0.5 border-emerald-500/40 text-emerald-400 bg-emerald-500/10 font-bold">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 mr-1.5 animate-pulse" />
              AI Gate Live
            </Badge>

            <Badge variant="outline" className="text-xs px-2 py-0.5 border-border/60 bg-background/50 font-medium">
              <Cctv className="h-3.5 w-3.5 mr-1 text-primary" />
              <select
                value={cameraSource}
                onChange={(e) => setCameraSource(e.target.value as any)}
                className="bg-transparent text-[11px] font-bold text-foreground focus:outline-none cursor-pointer"
              >
                <option value="webcam" className="bg-card text-foreground">Webcam</option>
                <option value="cctv" className="bg-card text-foreground">CCTV Stream</option>
                <option value="both" className="bg-card text-foreground">Dual Hybrid</option>
              </select>
            </Badge>

            <Badge variant="outline" className="hidden md:inline-flex text-xs px-2 py-0.5 border-border/60 bg-background/50">
              {isOnline
                ? <Wifi className="h-3.5 w-3.5 mr-1 text-green-500" />
                : <WifiOff className="h-3.5 w-3.5 mr-1 text-destructive" />
              }
              <span>{isOnline ? 'Online' : 'Offline'}</span>
            </Badge>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Voice Greeting Mode */}
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2.5 text-xs rounded-xl font-semibold text-muted-foreground hover:text-foreground"
              onClick={() => setVoiceGreeting(curr => curr === 'voice' ? 'chime' : curr === 'chime' ? 'off' : 'voice')}
              title="Toggle Voice Greeting: Voice Speech / Chime / Muted"
            >
              {voiceGreeting === 'voice' ? (
                <>
                  <Volume2 className="h-4 w-4 text-emerald-400 mr-1" />
                  <span className="hidden sm:inline">Voice TTS</span>
                </>
              ) : voiceGreeting === 'chime' ? (
                <>
                  <Volume2 className="h-4 w-4 text-cyan-400 mr-1" />
                  <span className="hidden sm:inline">Chime</span>
                </>
              ) : (
                <>
                  <VolumeX className="h-4 w-4 mr-1" />
                  <span className="hidden sm:inline">Muted</span>
                </>
              )}
            </Button>

            {/* Uniform Compliance AI Toggle */}
            <Button
              variant={uniformDetectionEnabled ? 'default' : 'outline'}
              size="sm"
              className={`h-8 px-2.5 text-xs rounded-xl font-bold gap-1 ${
                uniformDetectionEnabled ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/40' : ''
              }`}
              onClick={() => setUniformDetectionEnabled(v => !v)}
              title="Toggle Real-Time School Uniform & ID Lanyard AI Scanner"
            >
              <Shirt className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Uniform AI</span>
            </Button>

            <Button
              variant={aiEnhancerEnabled ? 'default' : 'outline'}
              size="sm"
              className={`h-8 px-2.5 text-xs rounded-xl font-bold gap-1 ${
                aiEnhancerEnabled ? 'bg-primary/20 text-primary border border-primary/40' : ''
              }`}
              onClick={() => setAiEnhancerEnabled(v => !v)}
            >
              <Wand2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">AI Enhance</span>
            </Button>

            <Button variant="outline" size="icon" className="h-8 w-8 rounded-xl" onClick={toggleFullscreen}>
              {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
            </Button>

            <Button
              variant="destructive"
              size="sm"
              className="h-8 text-xs px-3 rounded-xl font-bold gap-1 shadow-md shadow-destructive/20"
              onClick={() => navigate('/admin')}
            >
              <X className="h-3.5 w-3.5" />
              <span>Exit</span>
            </Button>
          </div>
        </div>
      )}

      {/* ── Main Layout Split (70% Video HUD / 30% Stats & Live Feed) ── */}
      <div className={`flex-1 flex min-h-0 relative ${isMobile ? 'flex-col h-[calc(100dvh-50px)]' : 'flex-row'}`}>

        {/* Left: Camera Feed & AI Recognition Box */}
        <div className={isMobile ? 'flex-1 relative min-h-0 w-full overflow-hidden' : 'flex-[68] relative min-h-0 bg-black/80 flex flex-col'}>
          <GateModeScanner
            onFaceDetected={handleFaceDetected}
            onSmartMonitoringUpdate={handleSmartMonitoringUpdate}
            onCrowdHotspot={handleCrowdHotspot}
            isActive={true}
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
            voiceGreeting={voiceGreeting}
            uniformDetectionEnabled={uniformDetectionEnabled}
          />

          {/* Entry feedback notification card */}
          <AnimatePresence mode="wait">
            {lastEntry && (
              <GateEntryFeedback
                key={lastEntry.id}
                entry={lastEntry}
                onDismiss={() => setLastEntry(null)}
              />
            )}
          </AnimatePresence>

          {/* Mobile Bottom Dock (Floating Action Capsule) */}
          {isMobile && !mobileStatsOpen && (
            <div className="absolute bottom-4 left-3 right-3 flex items-center justify-between z-20 pointer-events-auto">
              {/* Left quick metric capsule */}
              <div className="flex items-center gap-1.5">
                <div className="bg-[#0b101b]/90 backdrop-blur-2xl border border-border/80 rounded-full px-3 py-1.5 flex items-center gap-1.5 shadow-2xl">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  <span className="text-xs font-black text-foreground tracking-tight">{totalPresentToday} Marked</span>
                </div>
                {smartMonitoring.uniformCompliant > 0 && (
                  <div className="hidden xs:flex bg-indigo-500/20 backdrop-blur-2xl border border-indigo-500/40 rounded-full px-2.5 py-1.5 items-center gap-1 text-indigo-300 shadow-xl">
                    <Shirt className="h-3.5 w-3.5" />
                    <span className="text-[11px] font-bold">{smartMonitoring.uniformCompliant} Dress✓</span>
                  </div>
                )}
                {unknownCount > 0 && (
                  <div className="bg-destructive/90 backdrop-blur-2xl rounded-full px-2.5 py-1.5 flex items-center gap-1 shadow-xl text-white">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    <span className="text-xs font-bold">{unknownCount}</span>
                  </div>
                )}
              </div>

              {/* Right: Expand Feed Button */}
              <Button
                variant="secondary"
                size="sm"
                className="h-9 px-3.5 rounded-full shadow-2xl text-xs font-extrabold gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 transition-transform active:scale-95"
                onClick={() => setMobileStatsOpen(true)}
              >
                <Activity className="h-3.5 w-3.5 animate-pulse" />
                <span>Live Feed</span>
                <ChevronUp className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>

        {/* Right: Stats & Intelligence Sidebar (Desktop) */}
        {!isMobile && (
          <div className="flex-[32] min-h-0 h-full border-l border-border/70 flex flex-col">
            <GateStatsOverlay
              totalStudents={totalStudents}
              uniqueStudents={uniqueStudents}
              autoMarkedCount={autoMarkedCount}
              totalPresentToday={totalPresentToday}
              lateCount={lateCount}
              pendingCount={pendingCount}
              unknownCount={unknownCount}
              recentEntries={sessionEntries}
              smartMonitoring={smartMonitoring}
            />
          </div>
        )}

        {/* Mobile Stats Drawer */}
        <AnimatePresence>
          {isMobile && mobileStatsOpen && (
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="fixed inset-x-0 bottom-0 top-12 bg-[#0b101b]/98 backdrop-blur-3xl rounded-t-[28px] border-t border-border/80 shadow-2xl z-50 flex flex-col"
            >
              {/* Drag Handle & Top Bar */}
              <div className="px-4 pt-2 pb-3 border-b border-border/60 flex flex-col gap-1.5">
                <div className="w-12 h-1.5 rounded-full bg-muted-foreground/30 mx-auto" />
                <div className="flex items-center justify-between mt-1">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-xl bg-primary/20 text-primary">
                      <Activity className="h-4 w-4 animate-pulse" />
                    </div>
                    <div>
                      <h3 className="font-black text-sm text-foreground">Gate Live Feed & Logs</h3>
                      <p className="text-[10px] text-muted-foreground">{totalPresentToday} Total Verified Today</p>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full hover:bg-card" onClick={() => setMobileStatsOpen(false)}>
                    <ChevronDown className="h-5 w-5 text-muted-foreground" />
                  </Button>
                </div>
              </div>

              <div className="flex-1 min-h-0 overflow-hidden">
                <GateStatsOverlay
                  totalStudents={totalStudents}
                  uniqueStudents={uniqueStudents}
                  autoMarkedCount={autoMarkedCount}
                  totalPresentToday={totalPresentToday}
                  lateCount={lateCount}
                  pendingCount={pendingCount}
                  unknownCount={unknownCount}
                  recentEntries={sessionEntries}
                  smartMonitoring={smartMonitoring}
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
