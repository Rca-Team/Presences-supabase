import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as faceapi from 'face-api.js';
import { useLiteFeedback } from '@/hooks/useLiteFeedback';
import { LiteFeedbackControls, LiteFlashOverlay } from './LiteFeedbackControls';
import { supabase } from '@/integrations/supabase/client';
import { loadModels, areModelsLoaded } from '@/services/face-recognition/ModelService';
import { recognizeFace, recordAttendance } from '@/services/face-recognition/RecognitionService';
import { alignFace, isFaceFrontal } from '@/services/face-recognition/FaceAlignmentService';
import { scoreFaceQuality } from '@/services/face-recognition/FaceQualityService';
import { Play, Pause, Send, Trash2, Loader2, Users, Eye, SwitchCamera, Camera } from 'lucide-react';

/**
 * LiteLoopFaceScanner
 * -------------------
 * Accuracy-first, graphics-free loop attendance for smart boards / low-end devices.
 *
 * Capture phase  : all faces in frame are tracked (IoU). For every track we keep
 *                  BOTH descriptor flavours:
 *                    · "std" — face-api's own descriptor computed from the raw
 *                      detection (exactly how students were registered), so the
 *                      gallery comparison is apples-to-apples.
 *                    · "alt" — descriptor from an eye-aligned 112×112 crop, used
 *                      as an extra candidate for hard angles.
 *                  Optional blink gate: samples are only kept right after a real
 *                  blink (liveness + sharpest, eyes-open frames).
 * Process phase  : no time budget. Every captured face is matched with MULTIPLE
 *                  candidate descriptors (averaged + individual samples, std and
 *                  aligned) and the strongest verdict wins. Server batch pass is
 *                  used as a second opinion only when local matching fails.
 * Close-safe     : the queue lives in localStorage and is re-submitted on next
 *                  open; server submission uses keepalive.
 */

const QUEUE_KEY = 'lite-loop-queue-v2';
const BLINK_KEY = 'lite-loop-blink-gate';
const FACING_KEY = 'lite-loop-camera-facing';

const DETECT_MIN_CONFIDENCE = 0.5;
const MAX_FACES_PER_FRAME = 12;
const MIN_FACE_PX = 70;
const SAMPLE_MIN_QUALITY = 0.40;
const COMMIT_MIN_QUALITY = 0.46;
const MIN_SAMPLES = 3;
const MAX_SAMPLES = 8;
const SAMPLE_INTERVAL_MS = 110;
const TRACK_IOU = 0.30;
const TRACK_TIMEOUT_MS = 900;
const DETECT_INTERVAL_MS = 120;
const SAME_FACE_DIST = 0.42;
const LOCAL_MIN_CONFIDENCE = 0.62;

/** Eye-aspect-ratio thresholds for blink detection. */
const EAR_CLOSED = 0.19;
const EAR_OPEN = 0.25;
const BLINK_WINDOW_MS = 1500;

interface CapturedFace {
  clientId: string;
  descriptor: number[];        // averaged std descriptor (primary)
  altDescriptor?: number[];    // averaged aligned descriptor
  samples3?: number[][];       // a few individual std samples
  capturedAt: string;
  quality: number;
  samples: number;
  blinked?: boolean;
}
type ItemStatus = 'marked' | 'late' | 'already' | 'unmatched' | 'error';
interface ItemResult { clientId: string; status: ItemStatus; name?: string; confidence?: number }

interface Track {
  id: string;
  box: faceapi.Box;
  lastSeen: number;
  lastSample: number;
  std: Float32Array[];
  alt: Float32Array[];
  bestQuality: number;
  earOpen: boolean;
  lastBlinkAt: number;
  blinked: boolean;
}

const euclid = (a: Float32Array | number[], b: Float32Array | number[]) => {
  if (a.length !== b.length) return Infinity;
  let s = 0;
  for (let i = 0; i < a.length; i++) { const d = (a as any)[i] - (b as any)[i]; s += d * d; }
  return Math.sqrt(s);
};

const iou = (a: any, b: any) => {
  const x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width), y2 = Math.min(a.y + a.height, b.y + b.height);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  return inter <= 0 ? 0 : inter / (a.width * a.height + b.width * b.height - inter);
};

const robustAverage = (samples: Float32Array[]): Float32Array => {
  if (samples.length === 1) return samples[0];
  const dim = samples[0].length;
  const mean = new Float32Array(dim);
  for (const s of samples) for (let i = 0; i < dim; i++) mean[i] += s[i] / samples.length;
  const devs = samples.map(s => euclid(s, mean));
  const sorted = [...devs].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] || 0;
  const cutoff = Math.max(0.05, median * 2.0);
  const kept = samples.filter((_, i) => devs[i] <= cutoff);
  const use = kept.length >= 2 ? kept : samples;
  const out = new Float32Array(dim);
  for (const s of use) for (let i = 0; i < dim; i++) out[i] += s[i] / use.length;
  return out;
};

/** Eye aspect ratio from a 6-point face-api eye ring. */
const eyeAspect = (pts: { x: number; y: number }[]) => {
  if (!pts || pts.length < 6) return 1;
  const d = (a: any, b: any) => Math.hypot(a.x - b.x, a.y - b.y);
  const horiz = d(pts[0], pts[3]);
  if (horiz < 1) return 1;
  return (d(pts[1], pts[5]) + d(pts[2], pts[4])) / (2 * horiz);
};

const LiteLoopFaceScanner: React.FC = () => {
  const { prefs, toggle, signal, flashKind } = useLiteFeedback();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const runningRef = useRef(false);
  const tracksRef = useRef<Map<string, Track>>(new Map());
  const seqRef = useRef(0);
  const committedRef = useRef<Float32Array[]>([]);
  const queueRef = useRef<CapturedFace[]>([]);
  const busyRef = useRef(false);
  const blinkGateRef = useRef(false);
  const facingRef = useRef<'user' | 'environment'>('user');

  const [modelsReady, setModelsReady] = useState(false);
  const [running, setRunning] = useState(false);
  const [queue, setQueue] = useState<CapturedFace[]>([]);
  const [liveFaces, setLiveFaces] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [results, setResults] = useState<ItemResult[]>([]);
  const [blinkGate, setBlinkGate] = useState<boolean>(() => {
    try { return localStorage.getItem(BLINK_KEY) === '1'; } catch { return false; }
  });
  const [facing, setFacing] = useState<'user' | 'environment'>(() => {
    try { return localStorage.getItem(FACING_KEY) === 'environment' ? 'environment' : 'user'; } catch { return 'user'; }
  });
  const [note, setNote] = useState('Tap Start, then walk students past the camera.');

  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => { blinkGateRef.current = blinkGate; }, [blinkGate]);
  useEffect(() => { facingRef.current = facing; }, [facing]);
  useEffect(() => { try { localStorage.setItem(FACING_KEY, facing); } catch { /* ignore */ } }, [facing]);
  useEffect(() => {
    try { localStorage.setItem(BLINK_KEY, blinkGate ? '1' : '0'); } catch { /* ignore */ }
  }, [blinkGate]);
  useEffect(() => { try { localStorage.setItem(QUEUE_KEY, JSON.stringify(queue)); } catch { /* ignore */ } }, [queue]);

  // Restore any captures left behind by a closed app
  useEffect(() => {
    try {
      const raw = localStorage.getItem(QUEUE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as CapturedFace[];
        if (Array.isArray(parsed) && parsed.length) {
          setQueue(parsed);
          setNote(`${parsed.length} capture(s) recovered from last session — tap Process all.`);
        }
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    (async () => {
      if (!areModelsLoaded()) await loadModels();
      setModelsReady(true);
    })().catch(() => setNote('Face models failed to load — reload the page.'));
  }, []);

  const commitTrack = useCallback((t: Track) => {
    if (t.std.length < MIN_SAMPLES || t.bestQuality < COMMIT_MIN_QUALITY) return;
    if (blinkGateRef.current && !t.blinked) return;
    const descriptor = robustAverage(t.std);
    const dupQueue = queueRef.current.some(q => euclid(descriptor, q.descriptor) < SAME_FACE_DIST);
    const dupSession = committedRef.current.some(d => euclid(descriptor, d) < SAME_FACE_DIST);
    if (dupQueue || dupSession) return;
    committedRef.current.push(descriptor);
    if (committedRef.current.length > 400) committedRef.current.shift();
    setQueue(prev => [{
      clientId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      descriptor: Array.from(descriptor),
      altDescriptor: t.alt.length ? Array.from(robustAverage(t.alt)) : undefined,
      samples3: t.std.slice(0, 4).map(s => Array.from(s)),
      capturedAt: new Date().toISOString(),
      quality: t.bestQuality,
      samples: t.std.length,
      blinked: t.blinked,
    }, ...prev]);
    signal('ok');
  }, [signal]);

  const detectLoop = useCallback(async () => {
    if (!runningRef.current) return;
    const started = Date.now();
    const video = videoRef.current;
    if (video && video.readyState >= 2 && video.videoWidth > 0) {
      try {
        // Full face-api pipeline: descriptors here match how students registered.
        const dets = await faceapi
          .detectAllFaces(video, new faceapi.SsdMobilenetv1Options({
            minConfidence: DETECT_MIN_CONFIDENCE, maxResults: MAX_FACES_PER_FRAME,
          }))
          .withFaceLandmarks()
          .withFaceDescriptors();

        const now = Date.now();
        const used = new Set<string>();
        for (const det of dets) {
          const box = det.detection.box;
          if (Math.min(box.width, box.height) < MIN_FACE_PX) continue;
          let matched: Track | null = null;
          let best = TRACK_IOU;
          for (const t of tracksRef.current.values()) {
            if (used.has(t.id)) continue;
            const o = iou(t.box, box);
            if (o > best) { best = o; matched = t; }
          }
          if (!matched) {
            matched = {
              id: `t${++seqRef.current}`, box, lastSeen: now, lastSample: 0,
              std: [], alt: [], bestQuality: 0, earOpen: true, lastBlinkAt: 0, blinked: false,
            };
            tracksRef.current.set(matched.id, matched);
          }
          matched.box = box;
          matched.lastSeen = now;
          used.add(matched.id);

          // ── blink tracking (always measured, only gates when toggle is on) ──
          const ear = (eyeAspect(det.landmarks.getLeftEye() as any) + eyeAspect(det.landmarks.getRightEye() as any)) / 2;
          if (matched.earOpen && ear < EAR_CLOSED) {
            matched.earOpen = false;
          } else if (!matched.earOpen && ear > EAR_OPEN) {
            matched.earOpen = true;
            matched.lastBlinkAt = now;
            matched.blinked = true;
            if (blinkGateRef.current) signal('ok');
          }

          if (matched.std.length >= MAX_SAMPLES) continue;
          if (now - matched.lastSample < SAMPLE_INTERVAL_MS) continue;
          if (blinkGateRef.current && now - matched.lastBlinkAt > BLINK_WINDOW_MS) continue;
          if (ear < EAR_CLOSED) continue; // never sample with eyes shut
          if (!isFaceFrontal(det.landmarks)) continue;

          const aligned = alignFace(video, det.landmarks, 112);
          const report = scoreFaceQuality(aligned, { width: box.width, height: box.height });
          const quality = report.score * (0.6 + 0.4 * det.detection.score);
          if (quality < SAMPLE_MIN_QUALITY) continue;

          const std = det.descriptor as Float32Array;
          if (std && std.length === 128) matched.std.push(std);
          try {
            const altDesc = await faceapi.computeFaceDescriptor(aligned) as Float32Array;
            if (altDesc && altDesc.length === 128) matched.alt.push(altDesc);
          } catch { /* aligned descriptor is optional */ }
          matched.lastSample = Date.now();
          if (quality > matched.bestQuality) matched.bestQuality = quality;
        }

        const stamp = Date.now();
        for (const t of Array.from(tracksRef.current.values())) {
          const ready = t.std.length >= MAX_SAMPLES;
          const gone = stamp - t.lastSeen > TRACK_TIMEOUT_MS;
          if (ready || gone) { tracksRef.current.delete(t.id); commitTrack(t); }
        }
        setLiveFaces(tracksRef.current.size);
      } catch { /* transient frame errors ignored */ }
    }
    if (!runningRef.current) return;
    const elapsed = Date.now() - started;
    timerRef.current = window.setTimeout(detectLoop, Math.max(16, DETECT_INTERVAL_MS - elapsed));
  }, [commitTrack, signal]);

  /** Opens a stream on the requested camera and attaches it to the video tag. */
  const openStream = useCallback(async (which: 'user' | 'environment') => {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: which }, width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false,
    });
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = stream;
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      await videoRef.current.play().catch(() => undefined);
    }
  }, []);

  const start = useCallback(async () => {
    if (runningRef.current) return;
    if (!modelsReady) { setNote('Loading face models…'); return; }
    try {
      await openStream(facingRef.current);
      runningRef.current = true;
      setRunning(true);
      setNote(blinkGateRef.current
        ? 'Capturing on blink — ask each student to blink once at the camera.'
        : 'Capturing — best photo of each student is kept automatically.');
      timerRef.current = window.setTimeout(detectLoop, 0);
    } catch (e: any) {
      setNote(e?.message || 'Camera unavailable');
    }
  }, [detectLoop, modelsReady, openStream]);

  /** Front ⇄ back switch. Keeps the capture loop and queue running mid-session. */
  const switchCamera = useCallback(async () => {
    const next = facingRef.current === 'user' ? 'environment' : 'user';
    try {
      if (runningRef.current) await openStream(next);
      facingRef.current = next;
      setFacing(next);
      tracksRef.current.clear();
      setLiveFaces(0);
      setNote(next === 'user' ? 'Front camera' : 'Back camera');
    } catch {
      setNote('Could not switch camera on this device');
    }
  }, [openStream]);

  /** Manual instant capture — click while running to immediately record every face currently in frame. */
  const manualCapture = useCallback(async () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || !video.videoWidth) return;
    if (!modelsReady) { setNote('Models still loading…'); return; }
    setNote('Capturing now…');
    try {
      const dets = await faceapi
        .detectAllFaces(video, new faceapi.SsdMobilenetv1Options({
          minConfidence: DETECT_MIN_CONFIDENCE, maxResults: MAX_FACES_PER_FRAME,
        }))
        .withFaceLandmarks()
        .withFaceDescriptors();
      if (!dets.length) { setNote('No face detected — try again'); signal('fail'); return; }
      const currentQueue = queueRef.current;
      const currentCommitted = committedRef.current;
      let added = 0;
      for (const det of dets) {
        const box = det.detection.box;
        if (Math.min(box.width, box.height) < MIN_FACE_PX) continue;
        if (!isFaceFrontal(det.landmarks)) continue;
        const aligned = alignFace(video, det.landmarks, 112);
        const report = scoreFaceQuality(aligned, { width: box.width, height: box.height });
        const quality = report.score * (0.6 + 0.4 * det.detection.score);
        if (quality < COMMIT_MIN_QUALITY) continue;
        const std = det.descriptor as Float32Array;
        if (!std || std.length !== 128) continue;
        const dupQueue = currentQueue.some(q => euclid(std, q.descriptor) < SAME_FACE_DIST);
        const dupSession = currentCommitted.some(d => euclid(std, d) < SAME_FACE_DIST);
        if (dupQueue || dupSession) continue;
        currentCommitted.push(std);
        let alt: number[] | undefined;
        try {
          const altDesc = await faceapi.computeFaceDescriptor(aligned) as Float32Array;
          if (altDesc && altDesc.length === 128) alt = Array.from(altDesc);
        } catch { /* aligned descriptor is optional */ }
        setQueue(prev => [{
          clientId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          descriptor: Array.from(std),
          altDescriptor: alt,
          samples3: [Array.from(std)],
          capturedAt: new Date().toISOString(),
          quality,
          samples: 1,
          blinked: false,
        }, ...prev]);
        added++;
      }
      setNote(added ? `${added} face(s) captured instantly` : 'No new face captured (duplicate or low quality)');
      signal(added ? 'ok' : 'warn');
    } catch (e: any) {
      setNote(e?.message || 'Capture failed');
      signal('fail');
    }
  }, [modelsReady, signal]);

  const stop = useCallback(() => {
    runningRef.current = false;
    setRunning(false);
    setLiveFaces(0);
    tracksRef.current.clear();
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => () => {
    runningRef.current = false;
    if (timerRef.current) window.clearTimeout(timerRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
  }, []);

  /**
   * On-device recognition — no time limit, accuracy first.
   * Every capture is matched with several candidate descriptors and the most
   * confident verdict wins, which is what lifts the hit-rate on hard angles.
   */
  const processLocally = useCallback(async (items: CapturedFace[]) => {
    const out: ItemResult[] = [];
    let done = 0;
    for (const item of items) {
      try {
        const candidates: Float32Array[] = [];
        candidates.push(new Float32Array(item.descriptor));
        for (const s of item.samples3 || []) candidates.push(new Float32Array(s));
        if (item.altDescriptor) candidates.push(new Float32Array(item.altDescriptor));

        let bestRec: { employee: any; confidence: number } | null = null;
        for (const cand of candidates) {
          const rec = await recognizeFace(cand);
          const conf = rec.confidence ?? 0;
          if (rec.recognized && rec.employee && conf > (bestRec?.confidence ?? 0)) {
            bestRec = { employee: rec.employee, confidence: conf };
          }
          if (bestRec && bestRec.confidence >= 0.9) break; // already certain
        }

        if (!bestRec || bestRec.confidence < LOCAL_MIN_CONFIDENCE) {
          out.push({ clientId: item.clientId, status: 'unmatched', confidence: bestRec?.confidence });
        } else {
          const outcome = await recordAttendance(
            bestRec.employee.id, 'present', bestRec.confidence,
            { source: 'lite-loop-local', metadata: { name: bestRec.employee.name, blinked: !!item.blinked } },
            undefined, 'ai-scan',
          );
          const name = bestRec.employee.name;
          if (outcome?.skipped && outcome.reason === 'already_marked') {
            out.push({ clientId: item.clientId, status: 'already', name, confidence: bestRec.confidence });
          } else if (outcome?.skipped) {
            out.push({ clientId: item.clientId, status: 'unmatched', name, confidence: bestRec.confidence });
          } else {
            out.push({
              clientId: item.clientId,
              status: (outcome?.status === 'late' ? 'late' : 'marked'),
              name, confidence: bestRec.confidence,
            });
          }
        }
      } catch {
        out.push({ clientId: item.clientId, status: 'error' });
      }
      done++;
      setProgress({ done, total: items.length });
    }
    return out;
  }, []);

  const mapServerResults = (list: any[]): ItemResult[] => list.map(r => ({
    clientId: r.clientId,
    name: r.name,
    confidence: r.confidence,
    status: r.recognized && r.alreadyMarked ? 'already'
      : r.recognized && r.status === 'late' ? 'late'
      : r.recognized ? 'marked'
      : r.reason === 'error' ? 'error' : 'unmatched',
  }));

  /** Second opinion from the server for captures the device could not match. */
  const askServer = useCallback(async (items: CapturedFace[]): Promise<ItemResult[] | null> => {
    const url = (import.meta as any).env?.VITE_SUPABASE_URL as string | undefined;
    const key = (import.meta as any).env?.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
    if (!url || !key || !items.length) return null;
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess?.session?.access_token ?? key;
      const body = JSON.stringify({
        items: items.map(i => ({ clientId: i.clientId, descriptor: i.descriptor, capturedAt: i.capturedAt })),
      });
      const r = await fetch(`${url}/functions/v1/batch-face-attendance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${token}` },
        body,
        keepalive: new Blob([body]).size < 60_000,
      });
      if (!r.ok) return null;
      const data = await r.json().catch(() => null);
      return Array.isArray(data?.results) ? mapServerResults(data.results) : null;
    } catch { return null; }
  }, []);

  /** Process everything captured so far. Device first (multi-candidate), server as backup. */
  const processAll = useCallback(async () => {
    if (busyRef.current) return;
    const items = queueRef.current;
    if (!items.length) return;
    busyRef.current = true;
    setProcessing(true);
    setProgress({ done: 0, total: items.length });
    setNote('Processing — no time limit, accuracy first.');

    try {
      let mapped = await processLocally(items);

      // Anything the device could not match gets a server second opinion.
      const unresolvedIds = new Set(mapped.filter(m => m.status === 'unmatched' || m.status === 'error').map(m => m.clientId));
      if (unresolvedIds.size) {
        setNote(`Retrying ${unresolvedIds.size} unmatched capture(s) on the server…`);
        const serverResults = await askServer(items.filter(i => unresolvedIds.has(i.clientId)));
        if (serverResults) {
          const byId = new Map(serverResults.map(r => [r.clientId, r]));
          mapped = mapped.map(m => {
            const s = byId.get(m.clientId);
            return s && s.status !== 'unmatched' && s.status !== 'error' ? s : m;
          });
        }
      }

      setResults(prev => [...mapped, ...prev].slice(0, 300));
      const settled = new Set(mapped.filter(m => m.status !== 'error').map(m => m.clientId));
      setQueue(q => q.filter(x => !settled.has(x.clientId)));
      const hits = mapped.filter(m => m.status !== 'unmatched' && m.status !== 'error').length;
      setNote(`Done — ${hits}/${mapped.length} recognised. Results below.`);
      signal(hits ? 'ok' : 'fail');
    } finally {
      setProcessing(false);
      busyRef.current = false;
    }
  }, [askServer, processLocally, signal]);

  const counts = results.reduce((a, r) => { a[r.status] = (a[r.status] || 0) + 1; return a; }, {} as Record<ItemStatus, number>);

  return (
    <div className="space-y-3">
      <div className="relative bg-black rounded-lg overflow-hidden aspect-[4/3] max-w-xl mx-auto">
        <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
        <div className="absolute top-2 left-2 text-[11px] text-white bg-black/60 px-2 py-1 rounded inline-flex items-center gap-1">
          <Users className="w-3 h-3" /> {liveFaces} in view · {queue.length} captured
        </div>
        {blinkGate && (
          <div className="absolute top-2 right-2 text-[11px] text-white bg-black/60 px-2 py-1 rounded inline-flex items-center gap-1">
            <Eye className="w-3 h-3" /> blink to capture
          </div>
        )}
        {/* Front ⇄ back camera switch — plain button, no animation */}
        <button
          onClick={() => void switchCamera()}
          aria-label="Switch camera"
          className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded bg-black/60 px-2 py-1 text-[11px] font-medium text-white"
        >
          <SwitchCamera className="w-3.5 h-3.5" /> {facing === 'user' ? 'Front' : 'Back'}
        </button>
        <LiteFlashOverlay kind={flashKind} />
      </div>

      <p className="text-center text-sm text-foreground">{note}</p>

      {/* Blink capture toggle — switchable live, mid-session */}
      <div className="max-w-xl mx-auto flex items-center justify-between rounded-lg border border-border px-3 py-2">
        <div className="text-sm">
          <div className="font-medium text-foreground flex items-center gap-1.5">
            <Eye className="w-4 h-4" /> Blink to capture
          </div>
          <div className="text-[11px] text-muted-foreground">
            Only keeps photos taken right after a real blink (liveness check)
          </div>
        </div>
        <button
          onClick={() => setBlinkGate(v => !v)}
          aria-pressed={blinkGate}
          className={`px-3 py-1.5 rounded-md text-xs font-semibold border ${
            blinkGate ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground'
          }`}
        >
          {blinkGate ? 'On' : 'Off'}
        </button>
      </div>

      <LiteFeedbackControls
        prefs={prefs}
        onToggle={toggle}
        status={`${running ? 'capturing' : 'paused'} · ${blinkGate ? 'blink gate on' : 'auto capture'} · ${queue.length} queued · ${results.length} processed`}
      />

      <div className="flex flex-wrap gap-2 justify-center">
        {!running ? (
          <button
            onClick={() => void start()}
            disabled={!modelsReady}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            <Play className="w-4 h-4" /> {modelsReady ? 'Start capture' : 'Loading models…'}
          </button>
        ) : (
          <button onClick={stop} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm">
            <Pause className="w-4 h-4" /> Pause
          </button>
        )}
        {running && (
          <button
            onClick={() => void manualCapture()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium"
          >
            <Camera className="w-4 h-4" /> Capture now
          </button>
        )}
        <button
          onClick={() => void processAll()}
          disabled={!queue.length || processing}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          Process all {queue.length ? `(${queue.length})` : ''}
        </button>
        {(queue.length > 0 || results.length > 0) && (
          <button
            onClick={() => { setQueue([]); setResults([]); committedRef.current = []; setNote('Cleared.'); }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-destructive"
          >
            <Trash2 className="w-4 h-4" /> Clear
          </button>
        )}
      </div>

      {processing && progress.total > 0 && (
        <div className="max-w-xl mx-auto text-xs text-muted-foreground text-center">
          {progress.done} / {progress.total} processed
        </div>
      )}

      {results.length > 0 && (
        <div className="max-w-xl mx-auto space-y-2">
          <div className="grid grid-cols-4 gap-2 text-center">
            {([['marked', 'Present'], ['late', 'Late'], ['already', 'Already'], ['unmatched', 'Unknown']] as [ItemStatus, string][]).map(([k, label]) => (
              <div key={k} className="rounded-lg border border-border py-2">
                <div className="text-base font-bold text-foreground">{counts[k] || 0}</div>
                <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
              </div>
            ))}
          </div>
          <div className="rounded-lg border border-border divide-y divide-border">
            {results.slice(0, 40).map(r => (
              <div key={r.clientId} className="flex items-center justify-between px-3 py-2 text-sm">
                <span className="truncate">{r.name || 'Unrecognised'}</span>
                <span className="text-xs text-muted-foreground">
                  {r.status}{typeof r.confidence === 'number' ? ` · ${Math.round(r.confidence * 100)}%` : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default LiteLoopFaceScanner;
