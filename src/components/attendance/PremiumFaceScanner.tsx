/**
 * PremiumFaceScanner
 *
 * Apple Face ID + Lenskart-inspired attendance scanner.
 * - Full-bleed camera, minimal chrome
 * - Face lock ring: idle -> detecting -> locked
 * - Continuous async recognition with IoU-based frame skipping
 * - Session embedding + per-user cooldown to avoid duplicate work
 * - Optimistic UI: name pops instantly, DB write + parent notify happen in background
 *
 * Recognition accuracy is unchanged — same detector + descriptor + recognizeFace().
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as faceapi from 'face-api.js';
import { CheckCircle2, RefreshCw, User2, Loader2, ScanFace } from 'lucide-react';
import { loadModels, areModelsLoaded } from '@/services/face-recognition/ModelService';
import { recognizeFace, recordAttendance } from '@/services/face-recognition/RecognitionService';
import { sendAutoParentNotification } from '@/services/notification/AutoNotificationService';
import { getAttendanceCutoffTime, isPastCutoffTime } from '@/services/attendance/AttendanceSettingsService';

type Phase = 'booting' | 'searching' | 'locked' | 'recognized';

interface Recent {
  id: string;
  name: string;
  status: 'present' | 'late';
  ts: number;
  avatar?: string;
}

interface Track {
  id: number;
  box: { x: number; y: number; width: number; height: number };
  score: number;
  stableCount: number;
  lastSeen: number;
  firstSeen: number;
  processingStartedAt?: number;
  attempts: number;
  state: 'tracking' | 'queued' | 'processing' | 'done' | 'unknown';
  recognizedName?: string;
  userId?: string;
  // Best-quality snapshot captured during the quality window
  bestQuality: number;
  bestSnapshot?: HTMLCanvasElement;
  bestBox?: { x: number; y: number; width: number; height: number };
}

const DEDUP_EMBED_DIST = 0.46;
const USER_COOLDOWN_MS = 6000;
const DETECT_INTERVAL_MS = 33;       // ~30fps detection
const IOU_MATCH = 0.35;
const STABLE_FRAMES_REQUIRED = 1;    // ship on first solid detection
const QUALITY_WINDOW_MS = 0;         // no waiting — fire immediately
const MIN_QUALITY_TO_SHIP_EARLY = 0; // ship right away
const MAX_CONCURRENT_RECOG = 5;
const TRACK_TTL_MS = 700;
const MIN_FACE_SIZE = 60;


const iou = (
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
) => {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = a.width * a.height + b.width * b.height - inter;
  return union > 0 ? inter / union : 0;
};

const dist = (a: Float32Array, b: Float32Array) => {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const d = a[i] - b[i];
    s += d * d;
  }
  return Math.sqrt(s);
};

const PremiumFaceScanner: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastDetectAtRef = useRef(0);
  const lastVideoTimeRef = useRef(-1);

  // Tracking state (refs — never trigger renders)
  const tracksRef = useRef<Map<number, Track>>(new Map());
  const nextTrackIdRef = useRef(1);
  const inFlightCountRef = useRef(0);
  const sessionEmbedsRef = useRef<Float32Array[]>([]);
  const userCooldownRef = useRef<Map<string, number>>(new Map());
  const lastPhaseRef = useRef<Phase>('booting');
  const cropCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [phase, setPhase] = useState<Phase>('booting');
  const [current, setCurrent] = useState<Recent | null>(null);
  const [recent, setRecent] = useState<Recent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [facing, setFacing] = useState<'user' | 'environment'>('user');

  const setPhaseIfChanged = useCallback((p: Phase) => {
    if (lastPhaseRef.current !== p) {
      lastPhaseRef.current = p;
      setPhase(p);
    }
  }, []);

  // ---- Camera + models ----
  const startCamera = useCallback(async (mode: 'user' | 'environment') => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: mode, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    streamRef.current = stream;
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      await videoRef.current.play().catch(() => {});
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!areModelsLoaded()) await loadModels();
        if (cancelled) return;
        await startCamera(facing);
        if (cancelled) return;
        setPhaseIfChanged('searching');
      } catch (e) {
        console.error(e);
        setError('Camera or model init failed. Check permissions.');
      }
    })();
    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Camera flip
  const flipCamera = useCallback(async () => {
    const next = facing === 'user' ? 'environment' : 'user';
    setFacing(next);
    try { await startCamera(next); } catch (e) { console.error(e); }
  }, [facing, startCamera]);

  // ---- Detection + recognition loop ----
  useEffect(() => {
    if (phase === 'booting') return;

    // ---------- Recognition worker (runs in background per queued face) ----------
    // Uses a pre-captured best-quality snapshot canvas, so it recognizes the SHARPEST
    // frame the tracker saw for this person — not whatever frame the video is on now.
    const runRecognitionForTrack = async (trackId: number, snapshot: HTMLCanvasElement) => {
      const track = tracksRef.current.get(trackId);
      if (!track) { inFlightCountRef.current = Math.max(0, inFlightCountRef.current - 1); return; }

      const releaseTrack = (nextState: Track['state']) => {
        const t = tracksRef.current.get(trackId);
        if (t) {
          t.state = nextState;
          t.processingStartedAt = undefined;
          if (nextState === 'tracking') {
            // allow another attempt with a fresh best-quality window
            t.bestQuality = 0;
            t.bestSnapshot = undefined;
            t.firstSeen = Date.now();
          }
        }
      };

      try {
        // Try snapshot first (sharper, isolated ROI). If that fails, fall back to
        // the live video so we never get stuck on a bad crop.
        let full = await faceapi
          .detectSingleFace(snapshot, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.4 }))
          .withFaceLandmarks()
          .withFaceDescriptor();

        if (!full && videoRef.current && videoRef.current.readyState >= 2) {
          full = await faceapi
            .detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.4 }))
            .withFaceLandmarks()
            .withFaceDescriptor();
        }

        if (!full) {
          const t = tracksRef.current.get(trackId);
          const attempts = (t?.attempts ?? 0) + 1;
          if (t) t.attempts = attempts;
          // Give up after 3 failed attempts so we don't loop forever on a bad face
          releaseTrack(attempts >= 3 ? 'unknown' : 'tracking');
          return;
        }

        const desc = full.descriptor;

        // Session dedup — same person recognized again in same session
        for (const e of sessionEmbedsRef.current) {
          if (dist(e, desc) < DEDUP_EMBED_DIST) {
            releaseTrack('done');
            return;
          }
        }

        const result = await Promise.race([
          recognizeFace(desc),
          new Promise<null>(resolve => setTimeout(() => resolve(null), 3500)),
        ]);
        if (!result?.recognized || !result.employee) {
          releaseTrack('unknown');
          return;
        }

        const uid = result.employee.id;
        const lastAt = userCooldownRef.current.get(uid) ?? 0;
        if (Date.now() - lastAt < USER_COOLDOWN_MS) {
          const t = tracksRef.current.get(trackId);
          if (t) { t.userId = uid; t.recognizedName = result.employee.name; }
          releaseTrack('done');
          return;
        }
        userCooldownRef.current.set(uid, Date.now());
        sessionEmbedsRef.current.push(new Float32Array(desc));
        if (sessionEmbedsRef.current.length > 200) sessionEmbedsRef.current.splice(0, 50);

        let status: 'present' | 'late' = 'present';
        try {
          const cutoff = await getAttendanceCutoffTime();
          status = isPastCutoffTime(cutoff) ? 'late' : 'present';
        } catch {}

        const entry: Recent = {
          id: `${uid}-${Date.now()}`,
          name: result.employee.name || 'Student',
          status,
          ts: Date.now(),
          avatar: result.employee.avatar_url || result.employee.firebase_image_url,
        };

        const t = tracksRef.current.get(trackId);
        if (t) { t.userId = uid; t.recognizedName = entry.name; }
        releaseTrack('done');

        // Optimistic UI
        setCurrent(entry);
        setRecent(prev => [entry, ...prev].slice(0, 8));
        setPhaseIfChanged('recognized');
        if (navigator.vibrate) navigator.vibrate(30);
        playBeep();

        // Background writes — fire and forget
        recordAttendance(uid, status, result.confidence, {
          metadata: {
            name: result.employee.name,
            employee_id: result.employee.employee_id,
            source: 'premium-face-scanner',
          },
        }).catch(err => console.error('attendance save failed', err));

        sendAutoParentNotification(
          uid,
          result.employee.name || 'Student',
          status,
          result.employee.avatar_url || result.employee.firebase_image_url
        ).catch(err => console.error('parent notify failed', err));

        window.setTimeout(() => {
          setCurrent(prev => (prev?.id === entry.id ? null : prev));
          setPhaseIfChanged('searching');
        }, 900);
      } catch (e) {
        console.error('recognition error', e);
        releaseTrack('tracking');
      } finally {
        inFlightCountRef.current = Math.max(0, inFlightCountRef.current - 1);
      }
    };

    // Quality score: bigger + more centered + higher detector score = better
    const qualityScore = (box: Track['box'], score: number, vw: number, vh: number) => {
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      const dx = (cx - vw / 2) / vw;
      const dy = (cy - vh / 2) / vh;
      const centerBonus = 1 - Math.min(1, Math.hypot(dx, dy) * 2);
      const sizeScore = Math.min(1, box.width / (vw * 0.35));
      return score * 0.5 + sizeScore * 0.3 + centerBonus * 0.2;
    };

    // Capture the ROI of the current video frame into a fresh canvas we can keep.
    const captureSnapshot = (video: HTMLVideoElement, box: Track['box']): HTMLCanvasElement | null => {
      const pad = Math.max(box.width, box.height) * 0.35;
      const sx = Math.max(0, box.x - pad);
      const sy = Math.max(0, box.y - pad);
      const sw = Math.min(video.videoWidth - sx, box.width + pad * 2);
      const sh = Math.min(video.videoHeight - sy, box.height + pad * 2);
      const c = document.createElement('canvas');
      c.width = Math.max(160, Math.round(sw));
      c.height = Math.max(160, Math.round(sh));
      const ctx = c.getContext('2d', { willReadFrequently: true });
      if (!ctx) return null;
      ctx.drawImage(video, sx, sy, sw, sh, 0, 0, c.width, c.height);
      return c;
    };

    const tick = async () => {
      rafRef.current = requestAnimationFrame(tick);
      const now = performance.now();
      if (now - lastDetectAtRef.current < DETECT_INTERVAL_MS) return;
      const video = videoRef.current;
      if (!video || video.readyState < 2 || video.videoWidth === 0) return;
      if (video.currentTime === lastVideoTimeRef.current) return;
      lastVideoTimeRef.current = video.currentTime;
      lastDetectAtRef.current = now;

      try {
        const dets = await faceapi.detectAllFaces(
          video,
          new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.55 })
        );

        const nowMs = Date.now();
        for (const [tid, t] of tracksRef.current) {
          if (nowMs - t.lastSeen > TRACK_TTL_MS) tracksRef.current.delete(tid);
        }

        if (!dets || dets.length === 0) {
          if (inFlightCountRef.current === 0) setPhaseIfChanged('searching');
          return;
        }

        const vw = video.videoWidth;
        const vh = video.videoHeight;

        // Match detections to tracks; update best-quality snapshot per track continuously.
        const used = new Set<number>();
        for (const det of dets) {
          const box = { x: det.box.x, y: det.box.y, width: det.box.width, height: det.box.height };
          const score = (det as any).score ?? 0.9;
          const q = qualityScore(box, score, vw, vh);

          let bestId = -1;
          let bestIoU = 0;
          for (const [tid, t] of tracksRef.current) {
            if (used.has(tid)) continue;
            const s = iou(t.box, box);
            if (s > bestIoU) { bestIoU = s; bestId = tid; }
          }

          let track: Track;
          if (bestId !== -1 && bestIoU >= IOU_MATCH) {
            track = tracksRef.current.get(bestId)!;
            track.box = box;
            track.score = score;
            track.stableCount += 1;
            track.lastSeen = nowMs;
            used.add(bestId);
          } else {
            const id = nextTrackIdRef.current++;
            track = {
              id, box, score,
              stableCount: 1,
              lastSeen: nowMs,
              firstSeen: nowMs,
              attempts: 0,
              state: 'tracking',
              bestQuality: 0,
            };
            tracksRef.current.set(id, track);
            used.add(id);
          }

          // Only bother snapshotting tracks that still need recognition
          if (track.state === 'tracking' && box.width >= MIN_FACE_SIZE && q > track.bestQuality) {
            const snap = captureSnapshot(video, box);
            if (snap) {
              track.bestQuality = q;
              track.bestSnapshot = snap;
              track.bestBox = box;
            }
          }
        }

        // Recover any track stuck in 'processing' for too long (e.g. worker crashed
        // or the network timed out). Prevents the UI getting frozen on "Verifying…".
        for (const t of tracksRef.current.values()) {
          if (t.state === 'processing' && t.processingStartedAt && nowMs - t.processingStartedAt > 7000) {
            t.state = 'tracking';
            t.processingStartedAt = undefined;
            t.bestQuality = 0;
            t.bestSnapshot = undefined;
            t.firstSeen = nowMs;
            inFlightCountRef.current = Math.max(0, inFlightCountRef.current - 1);
          }
        }

        // Phase indicator
        let anyProcessing = false;
        for (const t of tracksRef.current.values()) {
          if (t.state === 'processing' || t.state === 'queued') { anyProcessing = true; break; }
        }
        setPhaseIfChanged(
          anyProcessing || tracksRef.current.size > 0 ? 'locked' : 'searching'
        );

        // Ship any track that either: (a) has excellent quality already, or
        // (b) has been tracked for QUALITY_WINDOW_MS. Best-quality snapshot wins.
        const ready: Track[] = [];
        for (const t of tracksRef.current.values()) {
          if (t.state !== 'tracking') continue;
          if (!t.bestSnapshot) continue;
          if (t.stableCount < STABLE_FRAMES_REQUIRED) continue;
          const age = nowMs - t.firstSeen;
          if (t.bestQuality >= MIN_QUALITY_TO_SHIP_EARLY || age >= QUALITY_WINDOW_MS) {
            ready.push(t);
          }
        }
        // Best faces first
        ready.sort((a, b) => b.bestQuality - a.bestQuality);

        for (const t of ready) {
          if (inFlightCountRef.current >= MAX_CONCURRENT_RECOG) break;
          const snap = t.bestSnapshot!;
          t.state = 'processing';
          t.processingStartedAt = nowMs;
          t.bestSnapshot = undefined; // release ref; the worker owns the canvas now
          inFlightCountRef.current += 1;
          void runRecognitionForTrack(t.id, snap);
        }
      } catch {
        // silent
      }

    };

    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [phase, setPhaseIfChanged]);


  const ringColor =
    phase === 'recognized' ? 'hsl(var(--ios-green))' :
    phase === 'locked' ? 'hsl(var(--ios-blue))' :
    'rgba(255,255,255,0.55)';

  return (
    <div className="relative w-full">
      <div className="relative aspect-[3/4] sm:aspect-video w-full overflow-hidden rounded-3xl bg-black shadow-2xl">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className="absolute inset-0 w-full h-full object-cover"
          style={{ transform: facing === 'user' ? 'scaleX(-1)' : 'none' }}
        />

        {/* Vignette */}
        <div className="pointer-events-none absolute inset-0"
             style={{ background: 'radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.55) 100%)' }} />

        {/* Face lock ring */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div
            className="relative rounded-full transition-all duration-500 ease-out"
            style={{
              width: 'min(62vw, 320px)',
              height: 'min(62vw, 320px)',
              border: `3px solid ${ringColor}`,
              boxShadow: phase === 'recognized'
                ? `0 0 60px ${ringColor}, inset 0 0 40px ${ringColor}`
                : phase === 'locked'
                  ? `0 0 40px ${ringColor}, inset 0 0 24px rgba(6,182,212,0.35)`
                  : '0 0 24px rgba(255,255,255,0.15)',
              transform: phase === 'recognized' ? 'scale(1.03)' : 'scale(1)',
            }}
          >
            {/* Sweeping arc for searching */}
            {phase !== 'recognized' && (
              <div
                className="absolute inset-[-3px] rounded-full"
                style={{
                  border: '3px solid transparent',
                  borderTopColor: phase === 'locked' ? 'hsl(var(--ios-blue))' : 'rgba(255,255,255,0.9)',
                  animation: 'pfs-spin 1.4s linear infinite',
                  opacity: phase === 'locked' ? 0.9 : 0.7,
                }}
              />
            )}
            {phase === 'recognized' && (
              <div className="absolute inset-0 flex items-center justify-center">
                <CheckCircle2 className="w-16 h-16 sm:w-20 sm:h-20" style={{ color: ringColor }} />
              </div>
            )}
          </div>
        </div>

        {/* Status pill (top) */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3.5 py-1.5 rounded-full backdrop-blur-md bg-black/40 border border-white/15 text-white text-xs font-medium">
          {phase === 'booting' && <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Starting camera…</>}
          {phase === 'searching' && <><ScanFace className="w-3.5 h-3.5" /> Look at the camera</>}
          {phase === 'locked' && <><ScanFace className="w-3.5 h-3.5 animate-pulse" /> Verifying…</>}
          {phase === 'recognized' && <><CheckCircle2 className="w-3.5 h-3.5" /> Recognized</>}
        </div>

        {/* Controls (top-right) */}
        <button
          onClick={flipCamera}
          className="absolute top-3 right-3 h-10 w-10 rounded-full bg-black/40 backdrop-blur-md border border-white/15 text-white flex items-center justify-center active:scale-95 transition-transform"
          aria-label="Flip camera"
        >
          <RefreshCw className="w-4 h-4" />
        </button>

        {/* Recognized card (bottom, optimistic) */}
        {current && (
          <div
            key={current.id}
            className="absolute left-3 right-3 bottom-3 flex items-center gap-3 rounded-2xl bg-white/10 backdrop-blur-xl border border-white/25 p-3 shadow-2xl"
            style={{ animation: 'pfs-rise 260ms ease-out both' }}
          >
            <div className="h-11 w-11 rounded-full overflow-hidden bg-white/20 flex items-center justify-center text-white flex-shrink-0">
              {current.avatar
                ? <img src={current.avatar} alt="" className="w-full h-full object-cover" />
                : <User2 className="w-5 h-5" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-white font-semibold truncate text-sm">{current.name}</div>
              <div className="text-white/70 text-xs">
                Marked {current.status === 'late' ? 'Late' : 'Present'} · {new Date(current.ts).toLocaleTimeString()}
              </div>
            </div>
            <CheckCircle2 className="w-6 h-6 flex-shrink-0" style={{ color: 'hsl(var(--ios-green))' }} />
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70">
            <div className="text-center text-white p-6 max-w-xs">
              <p className="text-sm">{error}</p>
            </div>
          </div>
        )}
      </div>

      {/* Recent scans strip */}
      {recent.length > 0 && (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {recent.map(r => (
            <div key={r.id} className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-card border border-border/60 flex-shrink-0 shadow-sm">
              <CheckCircle2 className="w-3.5 h-3.5" style={{ color: 'hsl(var(--ios-green))' }} />
              <span className="text-xs font-medium text-foreground truncate max-w-[140px]">{r.name}</span>
              <span className="text-[10px] text-muted-foreground uppercase">{r.status}</span>
            </div>
          ))}
        </div>
      )}

      <style>{`
        @keyframes pfs-spin { to { transform: rotate(360deg); } }
        @keyframes pfs-rise {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};

// Tiny WebAudio beep — no asset needed
let _audioCtx: AudioContext | null = null;
function playBeep() {
  try {
    _audioCtx = _audioCtx || new (window.AudioContext || (window as any).webkitAudioContext)();
    const ctx = _audioCtx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = 880;
    g.gain.value = 0.05;
    o.connect(g).connect(ctx.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.15);
    o.stop(ctx.currentTime + 0.16);
  } catch {}
}

export default PremiumFaceScanner;
