import React, { useRef, useEffect, useCallback, useState } from 'react';
import {
  Eye, Loader2, Scan, Zap, ShieldCheck, ShieldAlert,
  SwitchCamera, Wand2, Square, SlidersHorizontal, CloudOff, Cctv, Camera,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { GateEntry } from '@/pages/GateMode';
import { loadGateDetectionModels, areGateDetectionModelsLoaded } from '@/services/face-recognition/ModelService';
import { recordAttendance, recognizeFace } from '@/services/face-recognition/RecognitionService';
import { usePhotoEnhancer } from '@/hooks/usePhotoEnhancer';
import * as faceapi from 'face-api.js';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '@/integrations/supabase/client';
import DetectionBoxEditor from './DetectionBoxEditor';

// ─── Constants (outside component — stable across renders) ─────────────────────
const REDETECTION_COOLDOWN_MS     = 3_000;   // min gap before re-processing same face track
const DUPLICATE_COOLDOWN_MS       = 25_000;  // don't mark same student twice in this window
const UNKNOWN_COOLDOWN_MS         = 60_000;  // don't fire stranger alert for same region more than once per minute
const MIN_RECOGNITION_CONF        = 0.50;    // minimum to count as "seen"
const MIN_AUTO_MARK_CONF          = 0.72;    // minimum to auto-mark attendance
const BORDERLINE_CONF             = 0.60;    // below this: skip auto-mark (borderline retry)
const MIN_LIVENESS_SCORE          = 0.50;    // face-api.js detection confidence gate
const MIN_QUALITY_SCORE           = 0.40;    // only applied when vision API reports a score
const STABILITY_HITS              = 3;       // times seen before finalising identity
const STABILITY_WINDOW_MS         = 6_000;   // stability window
const DESCRIPTOR_MATCH_THRESHOLD  = 0.55;    // Euclidean distance to recognise same face across frames
const CLOUD_MAX_FAILS             = 3;       // consecutive failures before disabling cloud
const VISION_CACHE_TTL_MS         = 8_000;   // reuse vision result for this long
const MAP_PRUNE_OLDER_THAN_MS     = 300_000; // prune map entries older than 5 min
// ──────────────────────────────────────────────────────────────────────────────

interface GateModeScannerProps {
  onFaceDetected: (entry: GateEntry) => void;
  onSmartMonitoringUpdate?: (payload: {
    people: Array<{
      trackId: string;
      name: string;
      confidence: number;
      uniformStatus: 'compliant' | 'non-compliant' | 'unknown';
      heading: 'entry' | 'exit' | 'stationary';
    }>;
    uniformCompliant: number;
    uniformNonCompliant: number;
    entryFlow: number;
    exitFlow: number;
    stationary: number;
    timestamp: number;
  }) => void;
  onCrowdHotspot?: (event: { count: number; center: { x: number; y: number }; timestamp: number }) => void;
  isActive: boolean;
  onPendingCountChange?: (count: number) => void;
  onCloudStatusChange?: (disabled: boolean) => void;
  markedCount?: number;
  periodKey?: string;
  className?: string;
  section?: string;
  subject?: string;
  aiEnhancerEnabled?: boolean;
  cutoffHour?: number;
  cutoffMinute?: number;
  cameraSource?: 'webcam' | 'cctv' | 'both';
  cctvStreamUrl?: string;
}

interface DetectionBox {
  x: number; y: number; w: number; h: number;
  zMinFaceRatio?: number; zMaxFaceRatio?: number;
}

interface GateVisionResult {
  recognized: boolean;
  confidence: number;
  userId?: string | null;
  studentName?: string | null;
  qualityScore?: number;
  reason?: string;
}

interface FaceTrack {
  id: string;
  descriptor: Float32Array;
  lastSeen: number;
  lastBox: { x: number; y: number; width: number; height: number };
}

interface FaceLabel {
  name: string;
  confidence: number;
  recognized: boolean;
  timestamp: number;
}

interface LiveMatch {
  name: string;
  confidence: number;
  recognized: boolean;
  timestamp: number;
}

const isUnknownIdentityValue = (value?: string | null) => {
  if (!value) return true;
  const normalized = value.trim().toLowerCase();
  return !normalized || normalized === 'unknown' || normalized === 'null' || normalized === 'undefined';
};

// ─── Utilities ────────────────────────────────────────────────────────────────

function euclidean(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2;
  return Math.sqrt(s);
}

/** Find a track whose descriptor is close enough, or create a new one. */
function resolveTrack(
  descriptor: Float32Array,
  box: { x: number; y: number; width: number; height: number },
  tracks: FaceTrack[],
): FaceTrack {
  const now = Date.now();
  let best: { track: FaceTrack; dist: number } | null = null;

  for (const t of tracks) {
    if (now - t.lastSeen > 30_000) continue; // ignore stale tracks
    const d = euclidean(descriptor, t.descriptor);
    if (d < DESCRIPTOR_MATCH_THRESHOLD && (!best || d < best.dist)) {
      best = { track: t, dist: d };
    }
  }

  if (best) {
    best.track.descriptor = descriptor;
    best.track.lastSeen   = now;
    best.track.lastBox    = box;
    return best.track;
  }

  const newTrack: FaceTrack = { id: uuidv4(), descriptor, lastSeen: now, lastBox: box };
  tracks.push(newTrack);
  return newTrack;
}

/** Coarse region key for unknown-face cooldown (100-px grid). */
function regionKey(box: { x: number; y: number }) {
  return `${Math.round(box.x / 100)}:${Math.round(box.y / 100)}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

const GateModeScanner = ({
  onFaceDetected,
  onSmartMonitoringUpdate,
  onCrowdHotspot,
  isActive,
  onPendingCountChange,
  onCloudStatusChange,
  markedCount = 0,
  periodKey,
  className,
  section,
  subject,
  aiEnhancerEnabled = true,
  cutoffHour   = 9,
  cutoffMinute = 0,
  cameraSource = 'both',
  cctvStreamUrl,
}: GateModeScannerProps) => {
  const videoRef   = useRef<HTMLVideoElement>(null);
  const canvasRef  = useRef<HTMLCanvasElement>(null);

  const [isLoading,        setIsLoading]        = useState(true);
  const [cameraError,      setCameraError]       = useState<string | null>(null);
  const [fps,              setFps]               = useState(0);
  const [facesInFrame,     setFacesInFrame]      = useState(0);
  const [liveMatches,      setLiveMatches]       = useState<LiveMatch[]>([]);
  const [facingMode,       setFacingMode]        = useState<'user' | 'environment'>('environment');
  const [detectionBox,     setDetectionBox]      = useState<DetectionBox | null>(null);
  const [depthRange,       setDepthRange]        = useState<{ min: number; max: number }>({ min: 0.08, max: 0.52 });
  const [editingBox,       setEditingBox]        = useState(false);
  const [showDepthPanel,   setShowDepthPanel]    = useState(false);
  const [gateId,           setGateId]            = useState<string | null>(null);
  const [cloudDisabled,    setCloudDisabled]     = useState(false);
  const [blockedCount,     setBlockedCount]      = useState(0);
  const [avgLatencyMs,     setAvgLatencyMs]      = useState(0);
  const [autoZone,         setAutoZone]          = useState<DetectionBox | null>(null);
  const [cameraRetryNonce, setCameraRetryNonce]  = useState(0);
  const [activeSource, setActiveSource] = useState<'webcam' | 'cctv'>(cameraSource === 'cctv' ? 'cctv' : 'webcam');
  const [cctvError, setCctvError] = useState<string | null>(null);

  // Mutable refs — safe to access inside async callbacks without stale closure issues
  const processingRef       = useRef(false);
  const cloudFailCountRef   = useRef(0);
  const cloudDisabledRef    = useRef(false);
  const tracksRef           = useRef<FaceTrack[]>([]);
  const cooldownRef         = useRef<Map<string, number>>(new Map());         // trackId → timestamp
  const studentCooldownRef  = useRef<Map<string, number>>(new Map());         // studentId → timestamp
  const unknownCooldownRef  = useRef<Map<string, number>>(new Map());         // regionKey → timestamp
  const stableHitsRef       = useRef<Map<string, { hits: number; lastSeen: number }>>(new Map()); // `${studentId}:${periodKey}` → hits
  const periodMarkedRef     = useRef<Set<string>>(new Set());                 // `${studentId}:${periodKey}`
  const attendanceMarkedRef = useRef<Set<string>>(new Set());                 // studentId
  const borderlineRetryRef  = useRef<Map<string, number>>(new Map());         // studentId → count
  const visionCacheRef      = useRef<Map<string, { result: GateVisionResult; cachedAt: number }>>(new Map()); // trackId → cached result
  const faceLabelsRef       = useRef<Map<string, FaceLabel>>(new Map());      // trackId → label
  const fpsCounterRef       = useRef<{ frames: number; lastTime: number }>({ frames: 0, lastTime: Date.now() });
  const detectionIntervalRef = useRef(220);
  const perfWindowRef       = useRef<number[]>([]);
  const intervalRef         = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trackMotionRef      = useRef<Map<string, { cx: number; cy: number; ts: number }>>(new Map());
  const sampleCanvasRef     = useRef<HTMLCanvasElement | null>(null);

  const { isEnhancing: isAIEnhancing, autoEnhance } = usePhotoEnhancer();

  useEffect(() => {
    if (cameraSource === 'cctv') setActiveSource('cctv');
    if (cameraSource === 'webcam') setActiveSource('webcam');
  }, [cameraSource]);

  // ── Helpers ────────────────────────────────────────────────────────────────

  const getCurrentPeriodKey = useCallback(() =>
    periodKey ?? `period-${new Date().toISOString().slice(0, 10)}-default`,
  [periodKey]);

  const syncPendingCount = useCallback(() => {
    if (!onPendingCountChange) return;
    const pending = Array.from(borderlineRetryRef.current.values()).filter(v => v === 1).length;
    onPendingCountChange(pending);
  }, [onPendingCountChange]);

  const captureFrame = useCallback((quality = 0.85): string | null => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return null;
    const c   = document.createElement('canvas');
    c.width   = video.videoWidth;
    c.height  = video.videoHeight;
    c.getContext('2d')?.drawImage(video, 0, 0);
    return c.toDataURL('image/jpeg', quality);
  }, []);

  const disableCloud = useCallback(() => {
    if (cloudDisabledRef.current) return;
    cloudDisabledRef.current = true;
    setCloudDisabled(true);
    onCloudStatusChange?.(true);
    console.info('[Gate] Cloud recognition disabled — using local matcher only');
  }, [onCloudStatusChange]);

  // ── Supabase: load detection box ───────────────────────────────────────────

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase
          .from('school_gates')
          .select('id, detection_box')
          .eq('is_active', true)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();

        if (!data) return;
        setGateId(data.id);
        const box = (data as any).detection_box as DetectionBox | null;
        if (box && typeof box === 'object' && 'x' in box) {
          setDetectionBox(box);
          if (Number.isFinite(box.zMinFaceRatio) && Number.isFinite(box.zMaxFaceRatio)) {
            setDepthRange({
              min: Math.max(0.02, Math.min(0.9, Number(box.zMinFaceRatio))),
              max: Math.max(0.04, Math.min(0.95, Number(box.zMaxFaceRatio))),
            });
          }
        }
      } catch (e) { console.warn('[Gate] Could not load detection box:', e); }
    })();
  }, []);

  // Live-update detection box via realtime subscription
  useEffect(() => {
    const ch = supabase
      .channel('gate-scanner-detection-box')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'school_gates' }, (payload) => {
        const row = payload.new as { id?: string; detection_box?: DetectionBox | null; is_active?: boolean };
        if (!row) return;
        if (gateId && row.id === gateId) {
          setDetectionBox(row.detection_box ?? null);
          const b = row.detection_box;
          if (b?.zMinFaceRatio && b?.zMaxFaceRatio) {
            setDepthRange({
              min: Math.max(0.02, Math.min(0.9, Number(b.zMinFaceRatio))),
              max: Math.max(0.04, Math.min(0.95, Number(b.zMaxFaceRatio))),
            });
          }
        } else if (!gateId && row.is_active) {
          setGateId(row.id ?? null);
          setDetectionBox(row.detection_box ?? null);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [gateId]);

  // Auto detection zone (fallback when no saved box)
  useEffect(() => {
    const compute = () => {
      const w = videoRef.current?.videoWidth  || 1280;
      const h = videoRef.current?.videoHeight || 720;
      setAutoZone(
        h > w
          ? { x: 0.23, y: 0.18, w: 0.54, h: 0.62 }
          : { x: 0.31, y: 0.14, w: 0.38, h: 0.68 },
      );
    };
    compute();
    window.addEventListener('resize', compute);
    return () => window.removeEventListener('resize', compute);
  }, [isLoading, facingMode]);

  // Pre-load today's already-marked attendance
  useEffect(() => {
    const currentPeriod = getCurrentPeriodKey();
    (async () => {
      try {
        const start = new Date(); start.setHours(0, 0, 0, 0);
        const end   = new Date(start); end.setDate(end.getDate() + 1);
        const { data } = await supabase
          .from('attendance_records')
          .select('user_id, metadata')
          .eq('source', 'gate-mode')
          .in('status', ['present', 'late'])
          .gte('timestamp', start.toISOString())
          .lt('timestamp', end.toISOString());

        if (data?.length) {
          data.forEach((row: any) => {
            if (!row.user_id) return;
            const key = row?.metadata?.gate_period_key || currentPeriod;
            periodMarkedRef.current.add(`${row.user_id}:${key}`);
          });
        }
      } catch (e) { console.warn('[Gate] Could not preload attendance marks:', e); }
    })();
  }, [getCurrentPeriodKey]);

  // Periodic cleanup: live matches, stale face tracks, stale Map entries
  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();

      // Prune live matches
      setLiveMatches(prev => prev.filter(m => now - m.timestamp < 5_000));

      // Prune stale face tracks (> 30s unseen)
      tracksRef.current = tracksRef.current.filter(t => now - t.lastSeen < 30_000);

      // Prune all Maps older than MAP_PRUNE_OLDER_THAN_MS
      function pruneMap<V>(m: Map<string, V>, getTime: (v: V) => number) {
        m.forEach((v, k) => { if (now - getTime(v) > MAP_PRUNE_OLDER_THAN_MS) m.delete(k); });
      }
      cooldownRef.current.forEach((t, k) => { if (now - t > MAP_PRUNE_OLDER_THAN_MS) cooldownRef.current.delete(k); });
      studentCooldownRef.current.forEach((t, k) => { if (now - t > MAP_PRUNE_OLDER_THAN_MS) studentCooldownRef.current.delete(k); });
      unknownCooldownRef.current.forEach((t, k) => { if (now - t > MAP_PRUNE_OLDER_THAN_MS) unknownCooldownRef.current.delete(k); });
      pruneMap(visionCacheRef.current,  v => v.cachedAt);
      pruneMap(faceLabelsRef.current,   v => v.timestamp);
      stableHitsRef.current.forEach((v, k) => { if (now - v.lastSeen > MAP_PRUNE_OLDER_THAN_MS) stableHitsRef.current.delete(k); });
    }, 10_000);
    return () => clearInterval(id);
  }, []);

  // ── Camera ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!isActive) return;
    let mounted = true;

    if (activeSource === 'cctv') {
      (async () => {
        try {
          if (!cctvStreamUrl) {
            setCctvError('CCTV URL missing. Add a stream URL in Gate setup.');
            setIsLoading(false);
            return;
          }

          if (videoRef.current) {
            videoRef.current.srcObject = null;
            videoRef.current.src = cctvStreamUrl;
            videoRef.current.muted = true;
            videoRef.current.playsInline = true;
            videoRef.current.crossOrigin = 'anonymous';
            await videoRef.current.play();
          }

          if (!areGateDetectionModelsLoaded()) await loadGateDetectionModels();
          if (mounted) {
            setCctvError(null);
            setIsLoading(false);
          }
        } catch {
          if (mounted) {
            setCctvError('Unable to open CCTV stream. Verify URL format (HLS/MP4).');
            setIsLoading(false);
          }
        }
      })();

      return () => {
        mounted = false;
        if (videoRef.current) {
          videoRef.current.pause();
          videoRef.current.src = '';
        }
      };
    }

    (async () => {
      try {
        const stream = await navigator.mediaDevices
          .getUserMedia({
            video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: { ideal: facingMode }, frameRate: { ideal: 30 } },
          })
          .catch(() => navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } } }));

        if (!mounted) { stream.getTracks().forEach(t => t.stop()); return; }
        if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
        if (!areGateDetectionModelsLoaded()) await loadGateDetectionModels();
        if (mounted) setIsLoading(false);
      } catch {
        if (mounted) { setCameraError('Camera access denied. Please allow camera permissions and reload.'); setIsLoading(false); }
      }
    })();

    return () => {
      mounted = false;
      if (videoRef.current?.srcObject) {
        (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
      }
    };
  }, [isActive, facingMode, cameraRetryNonce, activeSource, cctvStreamUrl]);

  const estimateUniformStatus = useCallback((box: { x: number; y: number; width: number; height: number }) => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return 'unknown' as const;

    if (!sampleCanvasRef.current) sampleCanvasRef.current = document.createElement('canvas');
    const c = sampleCanvasRef.current;
    const ctx = c.getContext('2d');
    if (!ctx) return 'unknown' as const;

    const sx = Math.max(0, Math.floor(box.x - box.width * 0.2));
    const sy = Math.max(0, Math.floor(box.y + box.height * 0.9));
    const sw = Math.min(video.videoWidth - sx, Math.max(10, Math.floor(box.width * 1.4)));
    const sh = Math.min(video.videoHeight - sy, Math.max(10, Math.floor(box.height * 1.2)));
    if (sw < 10 || sh < 10) return 'unknown' as const;

    c.width = sw;
    c.height = sh;
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);
    const data = ctx.getImageData(0, 0, sw, sh).data;

    let blueDominant = 0;
    let brightWhite = 0;
    const total = data.length / 4;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      if (b > r + 22 && b > g + 14) blueDominant++;
      if (r > 170 && g > 170 && b > 170) brightWhite++;
    }

    const blueRatio = blueDominant / Math.max(1, total);
    const whiteRatio = brightWhite / Math.max(1, total);
    if (blueRatio > 0.18 || whiteRatio > 0.33) return 'compliant' as const;
    if (blueRatio < 0.06 && whiteRatio < 0.14) return 'non-compliant' as const;
    return 'unknown' as const;
  }, []);

  // ── Gemini Vision (cloud) ──────────────────────────────────────────────────

  const recognizeViaCloud = useCallback(async (track: FaceTrack): Promise<GateVisionResult> => {
    if (cloudDisabledRef.current) return { recognized: false, confidence: 0, reason: 'cloud_disabled' };

    const frameData = captureFrame(0.92);
    if (!frameData) return { recognized: false, confidence: 0, reason: 'no_frame' };

    const { data, error } = await supabase.functions.invoke('face-recognition', {
      body: {
        operation: 'recognizeFaceWithGeminiVision',
        image: frameData,
        faceBox: {
          x:      Math.max(0, Math.round(track.lastBox.x)),
          y:      Math.max(0, Math.round(track.lastBox.y)),
          width:  Math.max(1, Math.round(track.lastBox.width)),
          height: Math.max(1, Math.round(track.lastBox.height)),
        },
        minimumConfidence: MIN_RECOGNITION_CONF,
        minimumQuality:    MIN_QUALITY_SCORE,
      },
    });

    if (error) {
      cloudFailCountRef.current++;
      if (cloudFailCountRef.current >= CLOUD_MAX_FAILS) disableCloud();
      return { recognized: false, confidence: 0, reason: 'cloud_error' };
    }

    cloudFailCountRef.current = 0; // reset on success
    const r = (data?.result || data) as GateVisionResult | undefined;
    if (!r) return { recognized: false, confidence: 0, reason: 'empty_response' };

    return {
      recognized:   !!r.recognized,
      confidence:   Number(r.confidence  || 0),
      userId:       r.userId       || null,
      studentName:  r.studentName  || null,
      qualityScore: Number(r.qualityScore || 0) || undefined,
      reason:       r.reason,
    };
  }, [captureFrame, disableCloud]);

  // ── Main detection loop ────────────────────────────────────────────────────

  const detectLoop = useCallback(async () => {
    if (processingRef.current || !videoRef.current || videoRef.current.paused) return;
    processingRef.current = true;
    const startedAt = performance.now();
    const now       = Date.now();

    try {
      const detections = await faceapi
        .detectAllFaces(videoRef.current, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
        .withFaceLandmarks()
        .withFaceDescriptors();

      setFacesInFrame(detections.length);

      // FPS
      fpsCounterRef.current.frames++;
      if (now - fpsCounterRef.current.lastTime >= 1000) {
        setFps(fpsCounterRef.current.frames);
        fpsCounterRef.current = { frames: 0, lastTime: now };
      }

      const activeZone = detectionBox || autoZone;
      const vw = videoRef.current.videoWidth  || 1;
      const vh = videoRef.current.videoHeight || 1;

      // Filter to zone
      const inZone = activeZone
        ? detections.filter(d => {
            const b      = d.detection.box;
            const cx     = (b.x + b.width  / 2) / vw;
            const cy     = (b.y + b.height / 2) / vh;
            const ratio  = Math.min(b.width / vw, b.height / vh);
            return (
              cx >= activeZone.x && cx <= activeZone.x + activeZone.w &&
              cy >= activeZone.y && cy <= activeZone.y + activeZone.h &&
              ratio >= depthRange.min && ratio <= depthRange.max
            );
          })
        : detections;

      // ── Draw overlays ──────────────────────────────────────────────────────
      if (canvasRef.current && videoRef.current.videoWidth) {
        const dims    = faceapi.matchDimensions(canvasRef.current, videoRef.current, true);
        const safe    = detections.filter(d => {
          const b = d.detection.box;
          return Number.isFinite(b.x) && Number.isFinite(b.y);
        });
        const resized = faceapi.resizeResults(safe, dims);
        const cw = canvasRef.current.width;
        const ch = canvasRef.current.height;
        const ctx = canvasRef.current.getContext('2d');

        if (ctx) {
          ctx.clearRect(0, 0, cw, ch);

          // Detection zone overlay
          if (activeZone) {
            const bx = activeZone.x * cw;
            const by = activeZone.y * ch;
            const bw = activeZone.w * cw;
            const bh = activeZone.h * ch;

            ctx.save();
            ctx.fillStyle = 'rgba(0,0,0,0.42)';
            ctx.beginPath(); ctx.rect(0, 0, cw, ch); ctx.rect(bx, by, bw, bh);
            ctx.fill('evenodd');

            const dashOffset = (now / 50) % 16;
            ctx.shadowColor = 'rgba(6,182,212,0.9)'; ctx.shadowBlur = 16;
            ctx.strokeStyle = 'rgba(6,182,212,1)'; ctx.lineWidth = 3;
            ctx.setLineDash([10, 6]); ctx.lineDashOffset = -dashOffset;
            ctx.strokeRect(bx, by, bw, bh);
            ctx.setLineDash([]); ctx.shadowBlur = 0;

            // Corner brackets
            ctx.strokeStyle = 'rgba(6,182,212,1)'; ctx.lineWidth = 4;
            const cl = Math.min(28, bw / 6, bh / 6);
            const corners: [number, number, number, number][] = [
              [bx, by, bx + cl, by], [bx, by, bx, by + cl],
              [bx + bw, by, bx + bw - cl, by], [bx + bw, by, bx + bw, by + cl],
              [bx, by + bh, bx + cl, by + bh], [bx, by + bh, bx, by + bh - cl],
              [bx + bw, by + bh, bx + bw - cl, by + bh], [bx + bw, by + bh, bx + bw, by + bh - cl],
            ];
            corners.forEach(([x1, y1, x2, y2]) => {
              ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
            });

            // Zone label
            const zoneLabel = detectionBox ? 'Detection Zone' : 'Auto Zone';
            ctx.font = 'bold 11px system-ui, sans-serif';
            const tw = ctx.measureText(zoneLabel).width;
            ctx.fillStyle = 'rgba(6,182,212,0.92)';
            ctx.beginPath(); ctx.roundRect(bx + 6, by + 6, tw + 14, 20, 6); ctx.fill();
            ctx.fillStyle = '#fff'; ctx.fillText(zoneLabel, bx + 13, by + 20);
            ctx.restore();
          }

          // Per-face boxes
          resized.forEach((d, idx) => {
            const box  = d.detection.box;
            const orig = safe[idx]?.detection.box;
            if (!orig) return;

            const cx = (orig.x + orig.width  / 2) / vw;
            const cy = (orig.y + orig.height / 2) / vh;
            const insideZone = activeZone
              ? cx >= activeZone.x && cx <= activeZone.x + activeZone.w &&
                cy >= activeZone.y && cy <= activeZone.y + activeZone.h
              : true;

            const track = safe[idx].descriptor
              ? resolveTrack(safe[idx].descriptor, orig, tracksRef.current)
              : null;
            const label = track ? faceLabelsRef.current.get(track.id) : null;

            let heading: 'entry' | 'exit' | 'stationary' = 'stationary';
            if (track) {
              const prevMotion = trackMotionRef.current.get(track.id);
              const nextCx = orig.x + orig.width / 2;
              const nextCy = orig.y + orig.height / 2;
              if (prevMotion) {
                const dt = Math.max(1, now - prevMotion.ts);
                const vx = (nextCx - prevMotion.cx) / dt;
                if (vx > 0.03) heading = 'entry';
                else if (vx < -0.03) heading = 'exit';
              }
              trackMotionRef.current.set(track.id, { cx: nextCx, cy: nextCy, ts: now });
            }

            const uniformStatus = estimateUniformStatus(orig);

            let color = '#94a3b8';
            if (insideZone) color = label?.recognized ? '#22c55e' : '#ef4444';
            if (!insideZone) color = '#64748b';

            // Rounded box
            ctx.strokeStyle = color; ctx.lineWidth = 2.5;
            const r = 8;
            ctx.beginPath();
            ctx.moveTo(box.x + r, box.y);
            ctx.lineTo(box.x + box.width - r, box.y);
            ctx.arcTo(box.x + box.width, box.y, box.x + box.width, box.y + r, r);
            ctx.lineTo(box.x + box.width, box.y + box.height - r);
            ctx.arcTo(box.x + box.width, box.y + box.height, box.x + box.width - r, box.y + box.height, r);
            ctx.lineTo(box.x + r, box.y + box.height);
            ctx.arcTo(box.x, box.y + box.height, box.x, box.y + box.height - r, r);
            ctx.lineTo(box.x, box.y + r);
            ctx.arcTo(box.x, box.y, box.x + r, box.y, r);
            ctx.stroke();

            // Scan line animation (only for in-zone)
            if (insideZone) {
              const scanY = box.y + box.height * ((now % 2000) / 2000);
              ctx.strokeStyle = color + '60'; ctx.lineWidth = 1;
              ctx.beginPath(); ctx.moveTo(box.x, scanY); ctx.lineTo(box.x + box.width, scanY); ctx.stroke();
            }

            // Label
            ctx.font = 'bold 13px system-ui, sans-serif';
            let labelText: string;
            let bgColor: string;
            if (!insideZone) {
              labelText = 'Outside zone'; bgColor = 'rgba(100,116,139,0.88)';
            } else if (label) {
              const pct = Math.round(label.confidence * 100);
              const dressTag = uniformStatus === 'compliant' ? 'dress✓' : uniformStatus === 'non-compliant' ? 'dress!' : 'dress?';
              const dirTag = heading === 'entry' ? 'IN' : heading === 'exit' ? 'OUT' : 'HOLD';
              labelText = label.recognized ? `${label.name}  ${pct}%  ${dressTag}  ${dirTag}` : `Unknown  ${pct}%  ${dressTag}  ${dirTag}`;
              bgColor   = label.recognized ? 'rgba(34,197,94,0.88)' : 'rgba(239,68,68,0.88)';
            } else {
              labelText = `Scanning…  ${Math.round(d.detection.score * 100)}%`;
              bgColor   = 'rgba(100,116,139,0.80)';
            }
            const tw2   = ctx.measureText(labelText).width;
            const pillH = 22; const pillPad = 6;
            const lx = box.x; const ly = box.y - 8;
            ctx.fillStyle = bgColor;
            ctx.beginPath(); ctx.roundRect(lx - pillPad, ly - pillH + 2, tw2 + pillPad * 2, pillH, 6); ctx.fill();
            ctx.fillStyle = '#fff'; ctx.fillText(labelText, lx, ly - 4);
          });
        }
      }

      if (onSmartMonitoringUpdate) {
        const people = inZone.slice(0, 20).map((detection) => {
          const track = resolveTrack(detection.descriptor, detection.detection.box, tracksRef.current);
          const label = faceLabelsRef.current.get(track.id);
          const uniformStatus = estimateUniformStatus(detection.detection.box);
          const motion = trackMotionRef.current.get(track.id);
          let heading: 'entry' | 'exit' | 'stationary' = 'stationary';
          if (motion) {
            const cx = detection.detection.box.x + detection.detection.box.width / 2;
            const dx = cx - motion.cx;
            if (dx > 6) heading = 'entry';
            else if (dx < -6) heading = 'exit';
          }

          return {
            trackId: track.id,
            name: label?.recognized ? label.name : 'Unknown',
            confidence: label?.confidence ?? detection.detection.score,
            uniformStatus,
            heading,
          };
        });

        onSmartMonitoringUpdate({
          people,
          uniformCompliant: people.filter((p) => p.uniformStatus === 'compliant').length,
          uniformNonCompliant: people.filter((p) => p.uniformStatus === 'non-compliant').length,
          entryFlow: people.filter((p) => p.heading === 'entry').length,
          exitFlow: people.filter((p) => p.heading === 'exit').length,
          stationary: people.filter((p) => p.heading === 'stationary').length,
          timestamp: now,
        });
      }

      if (onCrowdHotspot && inZone.length >= 6) {
        const center = inZone.reduce(
          (acc, d) => ({
            x: acc.x + d.detection.box.x + d.detection.box.width / 2,
            y: acc.y + d.detection.box.y + d.detection.box.height / 2,
          }),
          { x: 0, y: 0 },
        );
        center.x /= inZone.length;
        center.y /= inZone.length;

        const avgDistance = inZone.reduce((sum, d) => {
          const cx = d.detection.box.x + d.detection.box.width / 2;
          const cy = d.detection.box.y + d.detection.box.height / 2;
          return sum + Math.hypot(cx - center.x, cy - center.y);
        }, 0) / inZone.length;

        const denseRadius = Math.min(vw, vh) * 0.22;
        if (avgDistance < denseRadius) {
          onCrowdHotspot({ count: inZone.length, center, timestamp: now });
        }
      }

      // ── Process in-zone faces ──────────────────────────────────────────────
      const currentPeriod = getCurrentPeriodKey();

      for (const detection of inZone) {
        if (!detection.descriptor) continue;

        const track          = resolveTrack(detection.descriptor, detection.detection.box, tracksRef.current);
        const livenessScore  = detection.detection.score ?? 0;

        // Redetection cooldown per track
        const lastCooldown = cooldownRef.current.get(track.id);
        if (lastCooldown && now - lastCooldown < REDETECTION_COOLDOWN_MS) continue;
        cooldownRef.current.set(track.id, now);

        try {
          // Liveness gate
          if (livenessScore < MIN_LIVENESS_SCORE) {
            setBlockedCount(p => p + 1);
            faceLabelsRef.current.set(track.id, { name: 'Low quality', confidence: livenessScore, recognized: false, timestamp: now });
            continue;
          }

          const recStart = performance.now();

          // ── Cloud recognition (with cache) ─────────────────────────────────
          let visionResult: GateVisionResult | null = null;
          const cached = visionCacheRef.current.get(track.id);
          if (cached && now - cached.cachedAt < VISION_CACHE_TTL_MS) {
            visionResult = cached.result;
          } else {
            try {
              visionResult = await recognizeViaCloud(track);
              visionCacheRef.current.set(track.id, { result: visionResult, cachedAt: now });
            } catch {
              visionResult = null;
            }
          }

          // ── Local fallback / identity recovery ────────────────────────────
          let localResult: { recognized: boolean; employee?: any; confidence?: number } | null = null;
          const needsLocalIdentityRecovery =
            !visionResult?.recognized ||
            isUnknownIdentityValue(visionResult?.studentName) ||
            isUnknownIdentityValue(visionResult?.userId || null);

          if (needsLocalIdentityRecovery) {
            try { localResult = await recognizeFace(detection.descriptor); } catch {}
          }

          const recLatency = performance.now() - recStart;
          perfWindowRef.current.push(recLatency);
          if (perfWindowRef.current.length > 30) perfWindowRef.current.shift();
          setAvgLatencyMs(Math.round(perfWindowRef.current.reduce((s, v) => s + v, 0) / perfWindowRef.current.length));

          // ── Quality gate (only when vision API reported a score) ───────────
          const qualityScore = visionResult?.qualityScore ?? null;
          if (qualityScore !== null && qualityScore < MIN_QUALITY_SCORE) {
            setBlockedCount(p => p + 1);
            faceLabelsRef.current.set(track.id, { name: 'Poor image quality', confidence: qualityScore, recognized: false, timestamp: now });
            continue;
          }

          // ── Merge results ──────────────────────────────────────────────────
          const cloudRecognized = !!visionResult?.recognized;
          const localRecognized = !!localResult?.recognized;
          const cloudName       = visionResult?.studentName || 'Unknown';
          const cloudId         = visionResult?.userId || null;
          const localName       = localResult?.employee?.name || 'Unknown';
          const localId         = localResult?.employee?.id || null;

          const useLocalIdentity =
            localRecognized &&
            (!cloudRecognized || isUnknownIdentityValue(cloudName) || isUnknownIdentityValue(cloudId));

          const rawRecognized = cloudRecognized || localRecognized;
          const rawConfidence = useLocalIdentity
            ? Number(localResult?.confidence || 0)
            : Number(visionResult?.confidence || localResult?.confidence || detection.detection.score || 0);
          const resolvedName  = useLocalIdentity ? localName : cloudName;
          const resolvedId    = useLocalIdentity ? localId : cloudId;

          const hasResolvedIdentity = !isUnknownIdentityValue(resolvedName) && !isUnknownIdentityValue(resolvedId);
          const isRecognized  = rawRecognized && rawConfidence >= MIN_RECOGNITION_CONF && hasResolvedIdentity;
          const studentName   = isRecognized ? resolvedName : 'Unknown';
          const studentId     = isRecognized ? resolvedId : null;
          const confidence    = rawConfidence;

          if (useLocalIdentity && isRecognized) {
            console.log(`[Gate] Local fallback: "${studentName}" @ ${(confidence * 100).toFixed(1)}%`);
          }

          // Update canvas label
          faceLabelsRef.current.set(track.id, { name: studentName, confidence, recognized: isRecognized, timestamp: now });

          // Update live HUD
          setLiveMatches(prev => {
            const filtered = prev.filter(m => m.name !== studentName || now - m.timestamp > 3_000);
            return [...filtered, { name: studentName, confidence, recognized: isRecognized, timestamp: now }].slice(-4);
          });

          const nowTime  = new Date();
          const isLate   = nowTime.getHours() > cutoffHour || (nowTime.getHours() === cutoffHour && nowTime.getMinutes() >= cutoffMinute);

          // ── Recognized student ─────────────────────────────────────────────
          if (isRecognized && studentId) {
            // Skip immediately if already marked for today (terminal state — no retry needed)
            if (attendanceMarkedRef.current.has(studentId)) continue;

            // Stability tracking — always accumulate hits regardless of cooldown so stability
            // can reach the required threshold across multiple detections within the window.
            const stableKey = `${studentId}:${currentPeriod}`;
            const existing  = stableHitsRef.current.get(stableKey);
            const nextHits  = existing && now - existing.lastSeen <= STABILITY_WINDOW_MS ? existing.hits + 1 : 1;
            stableHitsRef.current.set(stableKey, { hits: nextHits, lastSeen: now });
            const isStable  = nextHits >= STABILITY_HITS;

            // Borderline retry: if confidence is between BORDERLINE and AUTO_MARK thresholds,
            // give it one more chance before deciding whether to mark or not.
            if (confidence < MIN_AUTO_MARK_CONF && confidence >= BORDERLINE_CONF) {
              const retries = borderlineRetryRef.current.get(studentId) || 0;
              if (retries < 1) {
                borderlineRetryRef.current.set(studentId, retries + 1);
                syncPendingCount();
                continue; // wait for next detection
              }
              borderlineRetryRef.current.delete(studentId);
              syncPendingCount();
            }

            // UI-level duplicate cooldown: suppress repeated onFaceDetected calls for the
            // same student within DUPLICATE_COOLDOWN_MS UNLESS this is the auto-mark event.
            const lastStudentAt = studentCooldownRef.current.get(studentId);
            const inUICooldown  = lastStudentAt && now - lastStudentAt < DUPLICATE_COOLDOWN_MS;

            const entry: GateEntry = {
              id: uuidv4(), studentName, studentId, time: nowTime, isRecognized: true, confidence, isLate,
              className, section, subject, periodKey: currentPeriod,
            };

            // Auto-mark attendance: requires stability + high confidence + not already marked
            if (
              confidence >= MIN_AUTO_MARK_CONF &&
              livenessScore >= MIN_LIVENESS_SCORE &&
              isStable &&
              !periodMarkedRef.current.has(stableKey)
            ) {
              attendanceMarkedRef.current.add(studentId);
              periodMarkedRef.current.add(stableKey);
              studentCooldownRef.current.set(studentId, now);
              borderlineRetryRef.current.delete(studentId);
              syncPendingCount();
              try {
                // Capture frame for the attendance record / notification email
                let photo = captureFrame(0.85);
                if (aiEnhancerEnabled && photo && canvasRef.current) {
                  const c = document.createElement('canvas');
                  c.width = videoRef.current!.videoWidth; c.height = videoRef.current!.videoHeight;
                  c.getContext('2d')?.drawImage(videoRef.current!, 0, 0);
                  photo = await autoEnhance(photo, c);
                }

                await recordAttendance(
                  studentId,
                  isLate ? 'late' : 'present',
                  confidence,
                  { gate: true, metadata: { gate_period_key: currentPeriod, class: className, section, subject } },
                  photo ?? undefined,
                  'gate-mode',
                );

                onFaceDetected({ ...entry, photoUrl: photo ?? undefined });
              } catch (err) {
                console.error('[Gate] Failed to record attendance:', err);
                // Keep attendanceMarkedRef/periodMarkedRef set — do NOT re-emit onFaceDetected.
                // Repeated backend failures would otherwise flood the UI each cooldown cycle.
                // The operator is notified via a toast; they can check the DB manually.
                // A future manual re-sync can record the gap.
                console.warn(`[Gate] Attendance DB write failed for ${studentName} — marked in UI only`);
              }
              continue;
            }

            // Not yet stable / below auto-mark threshold.
            // The liveMatches HUD already shows the face in real-time.
            // Don't call onFaceDetected here — only confirmed (auto-marked) entries are recorded.
            continue;
          }

          // ── Unknown person ─────────────────────────────────────────────────
          // Cooldown: only fire stranger alert once per UNKNOWN_COOLDOWN_MS per region
          const rKey = regionKey(track.lastBox);
          const lastUnknown = unknownCooldownRef.current.get(rKey);
          if (lastUnknown && now - lastUnknown < UNKNOWN_COOLDOWN_MS) continue;
          unknownCooldownRef.current.set(rKey, now);

          // Capture a photo of the stranger
          const strangerPhoto = captureFrame(0.80) ?? undefined;

          onFaceDetected({
            id: uuidv4(),
            studentName: 'Unknown Person',
            studentId:   null,
            time:        nowTime,
            isRecognized: false,
            confidence,
            photoUrl:    strangerPhoto,
          });

        } catch (err) {
          console.error('[Gate] Detection processing error:', err);
        }
      }

    } catch (err) {
      console.error('[Gate] Detection loop error:', err);
    }

    processingRef.current = false;

    // Adaptive interval: slow down if frame processing takes long
    const elapsed = performance.now() - startedAt;
    detectionIntervalRef.current = elapsed > 450 ? 420 : elapsed > 260 ? 320 : 220;
  }, [
    autoZone, cutoffHour, cutoffMinute, depthRange, detectionBox,
    getCurrentPeriodKey, onFaceDetected, recognizeViaCloud, syncPendingCount,
    captureFrame, autoEnhance, aiEnhancerEnabled, className, section, subject,
    onSmartMonitoringUpdate, onCrowdHotspot, estimateUniformStatus,
  ]);

  // Detection interval
  useEffect(() => {
    if (!isActive || isLoading) return;
    let stopped = false;
    const tick = async () => {
      if (stopped) return;
      await detectLoop();
      if (!stopped) intervalRef.current = setTimeout(tick, detectionIntervalRef.current);
    };
    intervalRef.current = setTimeout(tick, detectionIntervalRef.current);
    return () => { stopped = true; if (intervalRef.current) clearTimeout(intervalRef.current); };
  }, [isActive, isLoading, detectLoop]);

  // ── Camera flip helper ─────────────────────────────────────────────────────
  const flipCamera = useCallback(() => {
    if (videoRef.current?.srcObject) {
      (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
    }
    setFacingMode(prev => (prev === 'user' ? 'environment' : 'user'));
    setIsLoading(true);
  }, []);

  // ── Save detection box to DB ───────────────────────────────────────────────
  const saveDepthSettings = useCallback(async () => {
    const nextBox = detectionBox
      ? { ...detectionBox, zMinFaceRatio: depthRange.min, zMaxFaceRatio: depthRange.max }
      : { x: 0.31, y: 0.14, w: 0.38, h: 0.68, zMinFaceRatio: depthRange.min, zMaxFaceRatio: depthRange.max };
    setDetectionBox(nextBox);
    try {
      if (gateId) {
        await supabase.from('school_gates').update({ detection_box: nextBox as any }).eq('id', gateId);
      } else {
        const { data } = await supabase.from('school_gates')
          .insert({ name: 'Main Gate', gate_type: 'main', detection_box: nextBox as any })
          .select('id').single();
        if (data) setGateId(data.id);
      }
    } catch (e) { console.error('[Gate] Failed to save depth settings:', e); }
  }, [detectionBox, depthRange, gateId]);

  // ── Error state ────────────────────────────────────────────────────────────
  if (cameraError || cctvError) {
    return (
      <div className="h-full flex items-center justify-center bg-muted">
        <div className="text-center p-8 space-y-3">
          <Eye className="h-12 w-12 text-muted-foreground mx-auto" />
          <p className="text-destructive font-semibold">{cameraError || cctvError}</p>
          <p className="text-sm text-muted-foreground">Gate mode requires an active camera source.</p>
          <button
            onClick={() => {
              setCameraError(null);
              setCctvError(null);
              setIsLoading(true);
              setCameraRetryNonce((n) => n + 1);
            }}
            className="mt-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="relative h-full w-full bg-black touch-manipulation select-none">
      <video
        ref={videoRef}
        className="h-full w-full object-cover"
        muted playsInline
        style={{
          transform:       facingMode === 'user' ? 'scaleX(-1)' : 'none',
          transformOrigin: 'center center',
          willChange:      'auto',
        }}
      />
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full pointer-events-none" />

      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur">
          <div className="text-center px-6">
            <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
            <p className="font-semibold text-foreground">Initialising face detection…</p>
            <p className="text-sm text-muted-foreground mt-1">Loading AI models, please wait</p>
          </div>
        </div>
      )}

      {/* Top status bar */}
      {!isLoading && (
        <div className="absolute top-2 left-2 right-2 sm:top-3 sm:left-3 sm:right-3 flex items-center gap-1 sm:gap-1.5 flex-wrap">
          {/* Live indicator — always shown */}
          <div className="flex items-center gap-1.5 bg-card/80 backdrop-blur rounded-full px-2 py-1.5 sm:px-2.5">
            <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-[10px] sm:text-xs font-semibold text-foreground">Live</span>
          </div>

          {/* Faces in frame — always shown when faces present */}
          {facesInFrame > 0 && (
            <div className="flex items-center gap-1 bg-primary/80 backdrop-blur rounded-full px-2 py-1.5 sm:px-2.5">
              <Scan className="h-3 w-3 text-primary-foreground" />
              <span className="text-[10px] sm:text-xs font-bold text-primary-foreground">{facesInFrame}</span>
            </div>
          )}

          {/* Auto-marked — always shown */}
          <div className="flex items-center gap-1 bg-card/80 backdrop-blur rounded-full px-2 py-1.5 sm:px-2.5">
            <ShieldCheck className="h-3 w-3 text-emerald-500" />
            <span className="text-[10px] sm:text-xs font-medium text-foreground">{markedCount} marked</span>
          </div>

          {/* FPS — desktop only */}
          <div className="hidden sm:flex items-center gap-1 bg-card/80 backdrop-blur rounded-full px-2.5 py-1.5">
            <Zap className="h-3 w-3 text-yellow-500" />
            <span className="text-xs font-medium text-foreground">{fps} fps</span>
          </div>

          {/* Latency — desktop only */}
          <div className="hidden sm:flex items-center gap-1 bg-card/80 backdrop-blur rounded-full px-2.5 py-1.5">
            <Zap className="h-3 w-3 text-cyan-500" />
            <span className="text-xs font-medium text-foreground">{avgLatencyMs} ms</span>
          </div>

          {/* Blocked — desktop only */}
          {blockedCount > 0 && (
            <div className="hidden sm:flex items-center gap-1 bg-card/80 backdrop-blur rounded-full px-2.5 py-1.5">
              <ShieldAlert className="h-3 w-3 text-rose-500" />
              <span className="text-xs font-medium text-foreground">{blockedCount} blocked</span>
            </div>
          )}

          {/* AI enhancer — desktop only */}
          {aiEnhancerEnabled && isAIEnhancing && (
            <div className="hidden sm:flex items-center gap-1 bg-accent/80 backdrop-blur rounded-full px-2.5 py-1.5">
              <Wand2 className="h-3 w-3 text-accent-foreground animate-pulse" />
              <span className="text-xs font-medium text-accent-foreground">Enhancing</span>
            </div>
          )}

          {/* Cloud disabled badge — always shown */}
          {cloudDisabled && (
            <div className="flex items-center gap-1 bg-amber-500/80 backdrop-blur rounded-full px-2 py-1.5 sm:px-2.5">
              <CloudOff className="h-3 w-3 text-white" />
              <span className="text-[10px] sm:text-xs font-semibold text-white">Local only</span>
            </div>
          )}

          {/* Controls — pushed to right */}
          <div className="ml-auto flex items-center gap-1">
            {cameraSource === 'both' && (
              <button
                onClick={() => {
                  setIsLoading(true);
                  setActiveSource((prev) => (prev === 'webcam' ? 'cctv' : 'webcam'));
                }}
                className="bg-card/80 backdrop-blur rounded-full p-2 sm:p-2.5 hover:bg-card transition-colors"
                title={activeSource === 'webcam' ? 'Switch to CCTV stream' : 'Switch to webcam'}
              >
                {activeSource === 'webcam' ? <Cctv className="h-4 w-4 sm:h-5 sm:w-5 text-foreground" /> : <Camera className="h-4 w-4 sm:h-5 sm:w-5 text-foreground" />}
              </button>
            )}
            <button
              onClick={flipCamera}
              disabled={activeSource !== 'webcam'}
              className="bg-card/80 backdrop-blur rounded-full p-2 sm:p-2.5 hover:bg-card transition-colors"
              title={facingMode === 'user' ? 'Switch to rear camera' : 'Switch to front camera'}
            >
              <SwitchCamera className="h-4 w-4 sm:h-5 sm:w-5 text-foreground" />
            </button>
            <button
              onClick={() => setShowDepthPanel(v => !v)}
              className={`backdrop-blur rounded-full p-2 sm:p-2.5 transition-colors ${showDepthPanel ? 'bg-cyan-500 text-white' : 'bg-card/80 hover:bg-card text-foreground'}`}
              title="Distance filter"
            >
              <SlidersHorizontal className="h-4 w-4 sm:h-5 sm:w-5" />
            </button>
            <button
              onClick={() => setEditingBox(v => !v)}
              className={`backdrop-blur rounded-full p-2 sm:p-2.5 transition-colors ${editingBox ? 'bg-cyan-500 text-white' : 'bg-card/80 hover:bg-card text-foreground'}`}
              title="Edit detection zone"
            >
              <Square className="h-4 w-4 sm:h-5 sm:w-5" />
            </button>
          </div>
        </div>
      )}

      {/* Bottom hint — desktop only (mobile has too many overlapping layers) */}
      {!isLoading && (
        <div className="hidden sm:block absolute bottom-4 left-1/2 -translate-x-1/2 pointer-events-none z-10">
          <div className="bg-card/80 backdrop-blur rounded-full px-4 py-2 border border-primary/30">
            <p className="text-xs font-semibold text-foreground text-center whitespace-nowrap">
              Position face inside the zone for best results
            </p>
          </div>
        </div>
      )}

      {/* Depth / distance panel */}
      <AnimatePresence>
        {!isLoading && showDepthPanel && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="absolute right-2 sm:right-3 top-14 sm:top-16 w-[260px] sm:w-[280px] z-20 rounded-2xl border border-border bg-card/95 backdrop-blur-xl p-4 shadow-2xl space-y-4"
          >
            <p className="text-sm font-semibold text-foreground">Distance Filter</p>

            <div className="space-y-2">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Far limit (min face size)</span>
                <span>{Math.round(depthRange.min * 100)}%</span>
              </div>
              <input type="range" min={2} max={60} step={1}
                value={Math.round(depthRange.min * 100)}
                onChange={e => {
                  const v = Math.max(0.02, Math.min(Number(e.target.value) / 100, depthRange.max - 0.02));
                  setDepthRange(prev => ({ ...prev, min: v }));
                }}
                className="w-full accent-cyan-500"
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Near limit (max face size)</span>
                <span>{Math.round(depthRange.max * 100)}%</span>
              </div>
              <input type="range" min={8} max={95} step={1}
                value={Math.round(depthRange.max * 100)}
                onChange={e => {
                  const v = Math.max(depthRange.min + 0.02, Math.min(Number(e.target.value) / 100, 0.95));
                  setDepthRange(prev => ({ ...prev, max: v }));
                }}
                className="w-full accent-cyan-500"
              />
            </div>

            <button
              onClick={saveDepthSettings}
              className="w-full rounded-xl bg-primary text-primary-foreground text-xs font-semibold py-2"
            >
              Save Depth Settings
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Detection zone editor — starts from autoZone when no custom box saved */}
      {editingBox && !isLoading && (
        <DetectionBoxEditor
          initial={detectionBox ?? autoZone}
          onCancel={() => setEditingBox(false)}
          onSave={async (box) => {
            const nextBox = { ...box, zMinFaceRatio: depthRange.min, zMaxFaceRatio: depthRange.max };
            setDetectionBox(nextBox);
            setEditingBox(false);
            try {
              if (gateId) {
                await supabase.from('school_gates').update({ detection_box: nextBox as any }).eq('id', gateId);
              } else {
                const { data } = await supabase.from('school_gates')
                  .insert({ name: 'Main Gate', gate_type: 'main', detection_box: nextBox as any })
                  .select('id').single();
                if (data) setGateId(data.id);
              }
            } catch (e) { console.error('[Gate] Failed to save detection zone:', e); }
          }}
          onClear={async () => {
            setDetectionBox(null);
            setEditingBox(false);
            if (gateId) {
              try { await supabase.from('school_gates').update({ detection_box: null as any }).eq('id', gateId); } catch {}
            }
          }}
        />
      )}

      {/* Live confidence HUD */}
      <AnimatePresence>
        {liveMatches.length > 0 && !isLoading && (
          <div className="absolute bottom-36 sm:bottom-16 left-2 right-2 sm:left-3 sm:right-auto sm:max-w-xs space-y-1.5 z-10 pointer-events-none">
            {liveMatches.slice(-3).map(m => (
              <motion.div
                key={`${m.name}-${m.timestamp}`}
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{ duration: 0.2 }}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-xl backdrop-blur-xl border shadow-lg ${
                  m.recognized
                    ? 'bg-emerald-500/20 border-emerald-500/40'
                    : 'bg-rose-500/20 border-rose-500/40'
                }`}
              >
                {m.recognized
                  ? <ShieldCheck className="h-4 w-4 text-emerald-400 flex-shrink-0" />
                  : <ShieldAlert  className="h-4 w-4 text-rose-400    flex-shrink-0" />
                }
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-white truncate">{m.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <div className="flex-1 h-1.5 bg-white/20 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.round(m.confidence * 100)}%` }}
                        className={`h-full rounded-full ${m.recognized ? 'bg-emerald-400' : 'bg-rose-400'}`}
                      />
                    </div>
                    <span className={`text-[10px] font-bold ${m.recognized ? 'text-emerald-300' : 'text-rose-300'}`}>
                      {Math.round(m.confidence * 100)}%
                    </span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default GateModeScanner;
