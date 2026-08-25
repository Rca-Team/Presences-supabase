import React, { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { recordAttendance } from '@/services/face-recognition/RecognitionService';
import { getAttendanceCutoffTime, isPastCutoffTime } from '@/services/attendance/AttendanceSettingsService';
import { sendAutoParentNotification } from '@/services/notification/AutoNotificationService';
import { QrCode, Camera, CameraOff, RefreshCw } from 'lucide-react';
import { useLiteFeedback } from '@/hooks/useLiteFeedback';
import { LiteFeedbackControls, LiteFlashOverlay } from './LiteFeedbackControls';

/**
 * LiteQRScanner
 * -------------
 * Bare-metal QR attendance for smart boards / low-end Android.
 * - Raw <video> + getUserMedia (no react-webcam, no framer-motion, no blur)
 * - Native BarcodeDetector when available (GPU accelerated, handles motion),
 *   jsQR loaded lazily ONLY as a fallback so slow devices never pay for it.
 * - requestVideoFrameCallback driven: decodes exactly one frame per new frame,
 *   so a moving card is picked up immediately without stacking work.
 */

interface QRData {
  id: string;
  user_id?: string;
  student_id?: string;
  name: string;
  employee_id: string;
  category: string;
}

const COOLDOWN_MS = 12_000;
const MAX_SCAN_WIDTH = 640;
/** Minimum gap between two decode attempts (frame-rate throttle). */
const MIN_DECODE_INTERVAL_MS = 45;
/** Force a decode at least this often even if the frame looks identical. */
const FORCE_DECODE_INTERVAL_MS = 600;
/** Centre ROI size as a fraction of the shorter video edge. */
const ROI_FRACTION = 0.72;
/** Consecutive misses in ROI before falling back to a full-frame pass. */
const ROI_MISSES_BEFORE_WIDE = 6;
/** Signature grid (NxN luma buckets) used for cheap change detection. */
const SIG_GRID = 8;
/** Mean per-bucket luma delta that counts as a meaningful frame change. */
const SIG_DELTA = 2.2;


const normalize = (v?: string | null) => (typeof v === 'string' ? v.trim() : '');
const looksLikeUuid = (v: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);

function parsePayload(raw: string): QRData | null {
  const value = raw.trim();
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object') {
      return {
        id: String(parsed.id ?? parsed.user_id ?? parsed.student_id ?? ''),
        user_id: parsed.user_id,
        student_id: parsed.student_id,
        name: parsed.name ?? 'Student',
        employee_id: parsed.employee_id ?? parsed.student_id ?? '',
        category: parsed.category ?? 'General',
      };
    }
  } catch {
    /* plain-text card */
  }
  return { id: value, user_id: value, student_id: value, name: 'Student', employee_id: value, category: 'General' };
}

const LiteQRScanner: React.FC<{ autoStart?: boolean }> = ({ autoStart = true }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const jsqrRef = useRef<any>(null);
  const detectorRef = useRef<any>(null);
  const runningRef = useRef(false);
  const busyRef = useRef(false);
  const seenRef = useRef<Map<string, number>>(new Map());
  const rafRef = useRef<number | null>(null);
  // --- decode throttling / ROI / frame-change state ---
  const sigCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastSigRef = useRef<Float32Array | null>(null);
  const lastDecodeAtRef = useRef(0);
  const roiMissesRef = useRef(0);


  const [active, setActive] = useState(false);
  const [status, setStatus] = useState('Idle');
  const [error, setError] = useState<string | null>(null);
  const [scans, setScans] = useState<{ name: string; id: string; status: string; time: number }[]>([]);

  const { prefs, toggle, signal, flashKind } = useLiteFeedback();

  const resolveTarget = async (qr: QRData) => {
    const preferred = normalize(qr.user_id || qr.id);
    if (preferred && looksLikeUuid(preferred)) return preferred;
    const key = normalize(qr.student_id || qr.employee_id || qr.id);
    if (!key) return preferred || null;
    const [d, a] = await Promise.all([
      supabase.from('face_descriptors').select('user_id').eq('student_id', key).not('user_id', 'is', null).limit(1).maybeSingle(),
      supabase.from('attendance_records').select('user_id').eq('student_id', key).not('user_id', 'is', null)
        .order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ]);
    return normalize(d.data?.user_id) || normalize(a.data?.user_id) || preferred || key || null;
  };

  const handleValue = useCallback(async (raw: string) => {
    const now = Date.now();
    const last = seenRef.current.get(raw);
    if (last && now - last < COOLDOWN_MS) return;
    seenRef.current.set(raw, now);
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      const qr = parsePayload(raw);
      if (!qr) return;
      const target = await resolveTarget(qr);
      if (!target) return;
      const cutoff = await getAttendanceCutoffTime();
      const st = isPastCutoffTime(cutoff) ? 'late' : 'present';
      await recordAttendance(target, st, 1, {
        source: 'lite-qr-scanner',
        type: 'qr_code',
        scanned_at: new Date().toISOString(),
        metadata: { name: qr.name, employee_id: qr.employee_id },
      }, undefined, 'qr-scan');
      signal(st === 'late' ? 'warn' : 'ok');
      setScans(prev => [{ name: qr.name, id: qr.employee_id || target.slice(0, 8), status: st, time: now }, ...prev].slice(0, 12));
      setStatus(`${qr.name} · ${st}`);
      sendAutoParentNotification(target, qr.name, st).catch(() => undefined);
    } catch (e: any) {
      signal('fail');
      setStatus('Scan failed — try again');
    } finally {
      busyRef.current = false;
    }
  }, [signal]);

  /**
   * Cheap perceptual signature of the current frame (SIG_GRID x SIG_GRID luma
   * buckets). Used to skip decode work while the scene is static.
   * Returns true when the frame changed meaningfully since the last call.
   */
  const frameChanged = useCallback((video: HTMLVideoElement) => {
    const c = sigCanvasRef.current || (sigCanvasRef.current = document.createElement('canvas'));
    if (c.width !== SIG_GRID || c.height !== SIG_GRID) { c.width = SIG_GRID; c.height = SIG_GRID; }
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) return true;
    try {
      ctx.drawImage(video, 0, 0, SIG_GRID, SIG_GRID);
    } catch {
      return true;
    }
    const px = ctx.getImageData(0, 0, SIG_GRID, SIG_GRID).data;
    const sig = new Float32Array(SIG_GRID * SIG_GRID);
    for (let i = 0, p = 0; i < sig.length; i++, p += 4) {
      sig[i] = 0.299 * px[p] + 0.587 * px[p + 1] + 0.114 * px[p + 2];
    }
    const prev = lastSigRef.current;
    lastSigRef.current = sig;
    if (!prev) return true;
    let diff = 0;
    for (let i = 0; i < sig.length; i++) diff += Math.abs(sig[i] - prev[i]);
    return diff / sig.length >= SIG_DELTA;
  }, []);

  const decodeFrame = useCallback(async () => {
    const video = videoRef.current;
    if (!runningRef.current || !video || video.readyState < 2) return;
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) return;

    const now = performance.now();
    const since = now - lastDecodeAtRef.current;
    // 1) Frame-rate throttle — never analyse faster than MIN_DECODE_INTERVAL_MS.
    if (since < MIN_DECODE_INTERVAL_MS) return;
    // 2) Skip identical frames, but still refresh at FORCE_DECODE_INTERVAL_MS.
    const changed = frameChanged(video);
    if (!changed && since < FORCE_DECODE_INTERVAL_MS) return;
    lastDecodeAtRef.current = now;

    // 3) ROI: decode the centre square where cards are held. Every so often,
    //    after repeated misses, do one full-frame pass to catch off-centre codes.
    const wide = roiMissesRef.current >= ROI_MISSES_BEFORE_WIDE;
    let sx = 0, sy = 0, sw = vw, sh = vh;
    if (!wide) {
      const side = Math.round(Math.min(vw, vh) * ROI_FRACTION);
      sw = side; sh = side;
      sx = Math.round((vw - side) / 2);
      sy = Math.round((vh - side) / 2);
    }

    const canvas = canvasRef.current || (canvasRef.current = document.createElement('canvas'));
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    const scale = sw > MAX_SCAN_WIDTH ? MAX_SCAN_WIDTH / sw : 1;
    const w = Math.max(1, Math.round(sw * scale));
    const h = Math.max(1, Math.round(sh * scale));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, w, h);

    const hit = () => {
      roiMissesRef.current = 0;
      lastSigRef.current = null; // force a fresh comparison after a decode
    };

    // 4) Native detector on the cropped canvas (fastest, best with motion blur)
    if (detectorRef.current) {
      try {
        const codes = await detectorRef.current.detect(canvas);
        if (codes?.length) {
          for (const c of codes) if (c.rawValue) void handleValue(c.rawValue);
          hit();
          return;
        }
      } catch { /* fall through to jsQR */ }
    }

    // 5) jsQR fallback on the same cropped, downscaled pixels
    if (jsqrRef.current) {
      const data = ctx.getImageData(0, 0, w, h);
      const res = jsqrRef.current(data.data, w, h, {
        inversionAttempts: wide ? 'attemptBoth' : 'dontInvert',
      });
      if (res?.data) {
        void handleValue(res.data);
        hit();
        return;
      }
    }

    roiMissesRef.current = wide ? 0 : roiMissesRef.current + 1;
  }, [handleValue, frameChanged]);


  const loop = useCallback(() => {
    if (!runningRef.current) return;
    const video = videoRef.current as any;
    const step = () => { void decodeFrame().finally(() => loop()); };
    if (video?.requestVideoFrameCallback) {
      video.requestVideoFrameCallback(() => step());
    } else {
      rafRef.current = window.setTimeout(step, 60) as unknown as number;
    }
  }, [decodeFrame]);

  const start = useCallback(async () => {
    if (runningRef.current) return;
    setError(null);
    setStatus('Starting camera…');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      // Continuous autofocus where supported (keeps moving cards sharp)
      try {
        const track = stream.getVideoTracks()[0];
        const caps: any = track.getCapabilities?.() || {};
        const advanced: any = {};
        if (Array.isArray(caps.focusMode) && caps.focusMode.includes('continuous')) advanced.focusMode = 'continuous';
        if (Array.isArray(caps.exposureMode) && caps.exposureMode.includes('continuous')) advanced.exposureMode = 'continuous';
        if (Object.keys(advanced).length) await track.applyConstraints({ advanced: [advanced] } as any);
      } catch { /* ignore */ }

      if ('BarcodeDetector' in window) {
        try { detectorRef.current = new (window as any).BarcodeDetector({ formats: ['qr_code'] }); } catch { detectorRef.current = null; }
      }
      if (!detectorRef.current && !jsqrRef.current) {
        const mod = await import('jsqr');
        jsqrRef.current = mod.default;
      }

      runningRef.current = true;
      setActive(true);
      setStatus('Point camera at the ID card QR');
      loop();
    } catch (e: any) {
      setError(e?.message || 'Camera unavailable');
      setStatus('Camera blocked');
    }
  }, [loop]);

  const stop = useCallback(() => {
    runningRef.current = false;
    setActive(false);
    setStatus('Stopped');
    if (rafRef.current) { window.clearTimeout(rafRef.current); rafRef.current = null; }
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => {
    if (autoStart) void start();
    return () => stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-3">
      <div className="relative bg-black rounded-lg overflow-hidden aspect-[4/3] max-w-xl mx-auto">
        <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="w-[58%] aspect-square border-2 border-white/70 rounded-md" />
        </div>
        <div className="absolute top-2 left-2 text-[11px] text-white bg-black/60 px-2 py-1 rounded">
          {active ? 'Scanning' : 'Paused'}
        </div>
        <LiteFlashOverlay kind={flashKind} />
      </div>

      <div className="text-center text-sm text-foreground">{status}</div>
      <LiteFeedbackControls
        prefs={prefs}
        onToggle={toggle}
        status={`${active ? 'camera on' : 'camera off'} · ${scans.length} scanned`}
      />
      {error && <div className="text-center text-xs text-destructive">{error}</div>}

      <div className="flex gap-2 justify-center">
        {active ? (
          <button onClick={stop} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm">
            <CameraOff className="w-4 h-4" /> Stop
          </button>
        ) : (
          <button onClick={() => void start()} className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium">
            <Camera className="w-4 h-4" /> Start scanner
          </button>
        )}
        <button
          onClick={() => { seenRef.current.clear(); setScans([]); setStatus('Cleared'); }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm"
        >
          <RefreshCw className="w-4 h-4" /> Reset
        </button>
      </div>

      {scans.length > 0 && (
        <div className="rounded-lg border border-border divide-y divide-border max-w-xl mx-auto">
          {scans.map(s => (
            <div key={`${s.id}-${s.time}`} className="flex items-center justify-between px-3 py-2 text-sm">
              <span className="flex items-center gap-2 min-w-0">
                <QrCode className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                <span className="truncate">{s.name}</span>
              </span>
              <span className={s.status === 'late' ? 'text-amber-600 text-xs' : 'text-emerald-600 text-xs'}>{s.status}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default LiteQRScanner;
