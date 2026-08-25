import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowLeft, Play, Square, Camera, Users, GraduationCap, LogOut, LogIn, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

import { detectPersons, warmupPersonDetector } from '@/services/vision/PersonDetector';
import { Tracker, computeAppearance, type Track } from '@/services/vision/TrackerService';
import { classifyZone, DEFAULT_ZONES } from '@/services/vision/ZoneClassifier';
import { ClassSessionInferer } from '@/services/vision/ClassSessionInferer';
import { pushEvent, startEventBatcher, stopEventBatcher } from '@/services/vision/EventBatcher';

interface LiveEvent {
  id: string;
  type: string;
  zone?: string | null;
  subject?: string | null;
  at: Date;
}

export default function GateVisionMode() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null); // overlay canvas
  const appCanvasRef = useRef<HTMLCanvasElement>(document.createElement('canvas'));
  const appCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const trackerRef = useRef<Tracker>(new Tracker());
  const infererRef = useRef<ClassSessionInferer | null>(null);
  const rafRef = useRef<number | null>(null);
  const runningRef = useRef(false);

  const [running, setRunning] = useState(false);
  const [ready, setReady] = useState(false);
  const [classKey, setClassKey] = useState('demo-class');
  const [periodKey, setPeriodKey] = useState('P1');
  const [teacherName, setTeacherName] = useState('');
  const [cameraId, setCameraId] = useState<string | null>(null);
  const [stats, setStats] = useState({
    tracks: 0,
    studentCountPeak: 0,
    teacherStatus: 'no teacher yet',
    duringExits: 0,
    afterExits: 0,
  });
  const [liveEvents, setLiveEvents] = useState<LiveEvent[]>([]);
  const [tracksSnap, setTracksSnap] = useState<Track[]>([]);

  // Setup appearance canvas ctx
  useEffect(() => {
    appCtxRef.current = appCanvasRef.current.getContext('2d', { willReadFrequently: true });
  }, []);

  // Ensure a gv_cameras row for this device (persistent)
  const ensureCamera = useCallback(async () => {
    let camId = localStorage.getItem('gv_camera_id');
    if (camId) {
      const { data } = await supabase.from('gv_cameras').select('id').eq('id', camId).maybeSingle();
      if (data?.id) { setCameraId(camId); return camId; }
    }
    const name = `Camera ${new Date().toISOString().slice(0, 16)}`;
    const { data, error } = await supabase
      .from('gv_cameras')
      .insert({ name, location_kind: 'classroom', class_key: classKey, status: 'active' })
      .select('id').single();
    if (error) {
      toast.error(`Camera register failed: ${error.message}`);
      return null;
    }
    camId = data.id;
    localStorage.setItem('gv_camera_id', camId);
    setCameraId(camId);
    return camId;
  }, [classKey]);

  // Warmup
  useEffect(() => {
    warmupPersonDetector()
      .then(() => setReady(true))
      .catch((e) => toast.error(`AI vision failed to load: ${e?.message ?? e}`));
    return () => stopEventBatcher();
  }, []);

  const start = useCallback(async () => {
    if (!videoRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
    } catch (e: any) {
      toast.error(`Camera failed: ${e?.message ?? e}`);
      return;
    }

    const cam = await ensureCamera();
    if (!cam) return;

    infererRef.current = new ClassSessionInferer({
      cameraId: cam,
      classKey,
      periodKey,
      scheduledTeacher: teacherName || null,
    });

    startEventBatcher();

    runningRef.current = true;
    setRunning(true);
    loop();
    toast.success('Vision 2.0 tracking started');
  }, [ensureCamera, classKey, periodKey, teacherName]);

  const stop = useCallback(() => {
    runningRef.current = false;
    setRunning(false);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const stream = videoRef.current?.srcObject as MediaStream | null;
    stream?.getTracks().forEach((t) => t.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
    trackerRef.current.reset();
    setTracksSnap([]);
    stopEventBatcher();
    toast('Vision 2.0 stopped');
  }, []);

  // Realtime event log
  useEffect(() => {
    if (!running || !cameraId) return;
    const ch = supabase.channel(`gv-events-${cameraId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'gv_events', filter: `camera_id=eq.${cameraId}`,
      }, (payload) => {
        const row = payload.new as any;
        setLiveEvents((prev) => [{
          id: row.id,
          type: row.event_type,
          zone: row.zone,
          subject: row.subject_name,
          at: new Date(row.occurred_at),
        }, ...prev].slice(0, 40));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [running, cameraId]);

  const loop = useCallback(async () => {
    if (!runningRef.current || !videoRef.current) return;
    const video = videoRef.current;
    const now = performance.now();

    try {
      const dets = await detectPersons(video, now);
      const appCtx = appCtxRef.current;
      const appearances = dets.map((d) =>
        appCtx ? computeAppearance(appCanvasRef.current, appCtx, video, d) : null
      );
      const tracks = trackerRef.current.update(dets, appearances, now);

      // Assign zones
      const w = video.videoWidth, h = video.videoHeight;
      for (const tr of tracks) {
        tr.zone = classifyZone(tr.box.x + tr.box.w / 2, tr.box.y + tr.box.h / 2, w, h, DEFAULT_ZONES);
      }

      infererRef.current?.tick(tracks, Date.now());

      draw(tracks);
      setTracksSnap(tracks);
      const snap = infererRef.current?.snapshot();
      if (snap) {
        setStats({
          tracks: tracks.length,
          studentCountPeak: snap.studentCountPeak,
          teacherStatus: snap.teacherTrackId
            ? (snap.teacherConfirmed ? 'confirmed' : 'inferred by presence')
            : 'not detected',
          duringExits: snap.studentsLeftDuring,
          afterExits: snap.studentsLeftAfter,
        });
      }
    } catch (e) {
      console.warn('[vision] loop error', e);
    }

    rafRef.current = requestAnimationFrame(loop);
  }, []);

  const draw = useCallback((tracks: Track[]) => {
    const video = videoRef.current, canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Zones (translucent)
    for (const z of DEFAULT_ZONES) {
      ctx.beginPath();
      z.polygon.forEach((p, i) => {
        const x = p.x * canvas.width, y = p.y * canvas.height;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.fillStyle = z.key === 'class-front' ? 'rgba(59,130,246,0.06)' : 'rgba(34,197,94,0.05)';
      ctx.strokeStyle = z.key === 'class-front' ? 'rgba(59,130,246,0.35)' : 'rgba(34,197,94,0.35)';
      ctx.lineWidth = 2;
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.font = '12px system-ui';
      ctx.fillText(z.key, z.polygon[0].x * canvas.width + 6, z.polygon[0].y * canvas.height + 14);
    }

    // Tracks
    for (const tr of tracks) {
      const color = tr.identity?.subjectType === 'teacher'
        ? '#f59e0b'
        : tr.identity?.subjectType === 'student'
        ? '#22c55e'
        : '#38bdf8';
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.strokeRect(tr.box.x, tr.box.y, tr.box.w, tr.box.h);
      const label = `${tr.identity?.subjectName ?? 'person'} · ${tr.zone ?? '—'}`;
      ctx.font = 'bold 13px system-ui';
      const textW = ctx.measureText(label).width + 12;
      ctx.fillStyle = color;
      ctx.fillRect(tr.box.x, tr.box.y - 22, textW, 20);
      ctx.fillStyle = '#0b0b0b';
      ctx.fillText(label, tr.box.x + 6, tr.box.y - 7);

      // trail
      ctx.strokeStyle = color + '99';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      tr.history.forEach((h, i) => {
        if (i === 0) ctx.moveTo(h.x, h.y); else ctx.lineTo(h.x, h.y);
      });
      ctx.stroke();
    }
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-border bg-card/80 backdrop-blur">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Link to="/gate">
              <Button size="icon" variant="ghost"><ArrowLeft className="h-5 w-5" /></Button>
            </Link>
            <div>
              <h1 className="text-lg sm:text-xl font-bold flex items-center gap-2">
                <Activity className="h-5 w-5 text-primary" />
                Gate Mode · Vision 2.0
              </h1>
              <p className="text-xs text-muted-foreground">AI surveillance · person tracking · class session inference</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={ready ? 'default' : 'secondary'}>{ready ? 'AI ready' : 'loading…'}</Badge>
            {running ? (
              <Button size="sm" variant="destructive" onClick={stop}><Square className="h-4 w-4 mr-1" /> Stop</Button>
            ) : (
              <Button size="sm" onClick={start} disabled={!ready}><Play className="h-4 w-4 mr-1" /> Start</Button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 grid lg:grid-cols-3 gap-4">
        {/* Video canvas */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="relative overflow-hidden rounded-3xl border-border/60 bg-black aspect-video">
            <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" playsInline muted />
            <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />
            {!running && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center px-6 text-white/80">
                <Camera className="h-10 w-10 opacity-70" />
                <div>
                  <p className="font-semibold text-lg">Ready to observe</p>
                  <p className="text-sm opacity-70">Set class + period below and press Start.</p>
                </div>
              </div>
            )}
          </Card>

          <Card className="p-4 rounded-2xl">
            <h3 className="font-semibold mb-3 text-sm text-muted-foreground uppercase tracking-wider">Session context</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <label className="block">
                <span className="text-xs text-muted-foreground">Class key</span>
                <input value={classKey} onChange={(e) => setClassKey(e.target.value)}
                  disabled={running}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </label>
              <label className="block">
                <span className="text-xs text-muted-foreground">Period key</span>
                <input value={periodKey} onChange={(e) => setPeriodKey(e.target.value)}
                  disabled={running}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </label>
              <label className="block sm:col-span-1 col-span-2">
                <span className="text-xs text-muted-foreground">Scheduled teacher (optional)</span>
                <input value={teacherName} onChange={(e) => setTeacherName(e.target.value)}
                  disabled={running}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </label>
            </div>
          </Card>
        </div>

        {/* Stats + timeline */}
        <div className="space-y-4">
          <Card className="p-4 rounded-2xl">
            <h3 className="font-semibold mb-3 text-sm text-muted-foreground uppercase tracking-wider">Live stats</h3>
            <div className="grid grid-cols-2 gap-3">
              <Stat icon={<Users className="h-4 w-4" />} label="Active tracks" value={stats.tracks} />
              <Stat icon={<GraduationCap className="h-4 w-4" />} label="Peak students" value={stats.studentCountPeak} />
              <Stat icon={<LogOut className="h-4 w-4" />} label="Exits during class" value={stats.duringExits} />
              <Stat icon={<LogIn className="h-4 w-4" />} label="Exits after teacher" value={stats.afterExits} />
            </div>
            <div className="mt-3 p-3 rounded-xl bg-muted/40 text-sm">
              <div className="text-xs text-muted-foreground uppercase tracking-wider">Teacher</div>
              <div className="font-semibold">{stats.teacherStatus}</div>
            </div>
          </Card>

          <Card className="p-4 rounded-2xl">
            <h3 className="font-semibold mb-3 text-sm text-muted-foreground uppercase tracking-wider">People in view</h3>
            {tracksSnap.length === 0 ? (
              <p className="text-sm text-muted-foreground">No one detected yet.</p>
            ) : (
              <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                {tracksSnap.map((t) => (
                  <div key={t.id} className="flex items-center justify-between text-sm p-2 rounded-lg bg-muted/30">
                    <span className="font-mono text-xs opacity-70">{t.id.slice(0, 6)}</span>
                    <span>{t.identity?.subjectName ?? 'unknown'}</span>
                    <Badge variant="outline" className="text-[10px]">{t.zone ?? '—'}</Badge>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-4 rounded-2xl">
            <h3 className="font-semibold mb-3 text-sm text-muted-foreground uppercase tracking-wider">Live timeline</h3>
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              <AnimatePresence initial={false}>
                {liveEvents.length === 0 && (
                  <p className="text-sm text-muted-foreground">Events will appear here in real time.</p>
                )}
                {liveEvents.map((ev) => (
                  <motion.div
                    key={ev.id}
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="flex items-start justify-between gap-2 text-xs p-2 rounded-lg bg-muted/30"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium">{ev.type}</div>
                      <div className="text-muted-foreground truncate">
                        {ev.subject ?? '—'} {ev.zone ? `· ${ev.zone}` : ''}
                      </div>
                    </div>
                    <div className="text-muted-foreground whitespace-nowrap">
                      {ev.at.toLocaleTimeString()}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </Card>
        </div>
      </main>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number | string }) {
  return (
    <div className="p-3 rounded-xl bg-muted/40">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">{icon}<span>{label}</span></div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </div>
  );
}
