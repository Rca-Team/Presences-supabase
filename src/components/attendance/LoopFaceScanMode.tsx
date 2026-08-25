import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Webcam from 'react-webcam';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { loadModels, areModelsLoaded } from '@/services/face-recognition/ModelService';
import { recognizeFace, recordAttendance } from '@/services/face-recognition/RecognitionService';
import { recognizeBestOf } from '@/services/face-recognition/RobustMatchService';
import { scanTelemetry } from '@/services/face-recognition/ScanTelemetry';
import { alignFace, isFaceFrontal } from '@/services/face-recognition/FaceAlignmentService';
import { scoreFaceQuality } from '@/services/face-recognition/FaceQualityService';
import * as faceapi from 'face-api.js';
import {
  Play, Pause, Send, Trash2, CheckCircle2, Loader2,
  Users, Sparkles, Repeat, X, WifiOff, AlertTriangle,
  UserCheck, UserX, Clock, HelpCircle, ScanFace, Zap,
} from 'lucide-react';

interface CapturedFace {
  clientId: string;
  /** Averaged descriptor from standard face-api crops — same domain as registration. */
  descriptor: number[];
  /** Averaged descriptor from eye-aligned 112px crops — second opinion. */
  altDescriptor?: number[];
  /** A few individual raw samples, matched separately for hard angles. */
  samples3?: number[][];
  imageDataUrl: string;
  capturedAt: string;
  quality: number;
  samples?: number;
}

type ItemStatus = 'marked' | 'already' | 'late' | 'unmatched' | 'low_conf' | 'error';
interface ItemResult { clientId: string; status: ItemStatus; name?: string; confidence?: number }

const QUEUE_KEY = 'loop-mode-queue-v1';

// ─── Recognition-engine tuning ───────────────────────────────────────────────
// Detector: SSD MobileNetV1 (far more reliable than TinyFaceDetector on
// classroom distances / angles) running over ALL faces in frame, so several
// students can be captured simultaneously.
const DETECT_MIN_CONFIDENCE = 0.5;
const MAX_FACES_PER_FRAME   = 12;
const MIN_FACE_PX           = 70;

// Per-face sampling: each tracked face contributes multiple ALIGNED descriptors
// which are robustly averaged. Averaging 3–5 aligned samples cuts the matcher's
// error rate dramatically versus a single raw-crop descriptor.
const SAMPLE_MIN_QUALITY = 0.40;
const COMMIT_MIN_QUALITY = 0.48;
const MIN_SAMPLES        = 3;
const MAX_SAMPLES        = 5;
const SAMPLE_INTERVAL_MS = 110;

// Tracking
const TRACK_IOU          = 0.30;
const TRACK_TIMEOUT_MS   = 650;
const DETECT_INTERVAL_MS = 100;

// De-duplication
const SAME_FACE_DIST = 0.42;

const AUTO_BATCH_SIZE = 5;
const AUTO_FLUSH_MS = 4000;
const LOCAL_MIN_CONFIDENCE = 0.56;

const euclid = (a: Float32Array | number[], b: Float32Array | number[]) => {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) { const d = (a as any)[i] - (b as any)[i]; s += d * d; }
  return Math.sqrt(s);
};

const iou = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) => {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  if (inter <= 0) return 0;
  return inter / (a.width * a.height + b.width * b.height - inter);
};

/**
 * Robust mean of face descriptors:
 *  - plain (NON-normalised) average, so Euclidean distance stays comparable
 *    with the stored face-api.js descriptors
 *  - outlier samples further than 2.0x the median deviation are discarded
 */
const robustAverage = (samples: Float32Array[]): Float32Array => {
  if (samples.length === 1) return samples[0];
  const dim = samples[0].length;
  const mean = new Float32Array(dim);
  for (const s of samples) for (let i = 0; i < dim; i++) mean[i] += s[i] / samples.length;

  const devs = samples.map(s => euclid(s, mean));
  const sorted = [...devs].sort((x, y) => x - y);
  const median = sorted[Math.floor(sorted.length / 2)] || 0;
  const cutoff = Math.max(0.05, median * 2.0);
  const kept = samples.filter((_, i) => devs[i] <= cutoff);
  const use = kept.length >= 2 ? kept : samples;

  const out = new Float32Array(dim);
  for (const s of use) for (let i = 0; i < dim; i++) out[i] += s[i] / use.length;
  return out;
};

interface Track {
  id: string;
  box: faceapi.Box;
  firstSeen: number;
  lastSeen: number;
  lastSample: number;
  /** Descriptors from standard face-api crops (registration domain). */
  samples: Float32Array[];
  /** Descriptors from eye-aligned crops (second opinion). */
  alt: Float32Array[];
  bestQuality: number;
  bestImage: string;
}

const LoopFaceScanMode: React.FC = () => {
  const { toast } = useToast();
  const webcamRef = useRef<Webcam>(null);
  const timerRef = useRef<number | null>(null);
  const runningRef = useRef(false);
  const tracksRef = useRef<Map<string, Track>>(new Map());
  const trackSeqRef = useRef(0);
  const committedRef = useRef<Float32Array[]>([]);
  const queueRef = useRef<CapturedFace[]>([]);
  const submittingRef = useRef(false);
  const autoFlushTimerRef = useRef<number | null>(null);

  const [modelsReady, setModelsReady] = useState(false);
  const [running, setRunning] = useState(false);
  const [queue, setQueue] = useState<CapturedFace[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [flash, setFlash] = useState(false);
  const [lastResult, setLastResult] = useState<any>(null);
  const [tracking, setTracking] = useState(false);
  const [liveFaces, setLiveFaces] = useState(0);
  const [autoProcess, setAutoProcess] = useState(true);
  const [serverDown, setServerDown] = useState(false);
  const [itemResults, setItemResults] = useState<Record<string, ItemResult>>({});

  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => { submittingRef.current = submitting; }, [submitting]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(QUEUE_KEY);
      if (raw) setQueue(JSON.parse(raw));
    } catch {}
  }, []);
  useEffect(() => {
    try { localStorage.setItem(QUEUE_KEY, JSON.stringify(queue)); } catch {}
  }, [queue]);

  useEffect(() => {
    (async () => {
      if (!areModelsLoaded()) await loadModels();
      setModelsReady(true);
    })().catch(() => toast({ title: 'Models failed', description: 'Reload page', variant: 'destructive' }));
  }, [toast]);

  const stop = useCallback(() => {
    runningRef.current = false;
    setRunning(false);
    setTracking(false);
    setLiveFaces(0);
    tracksRef.current.clear();
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);


  const captureFrom = useCallback((video: HTMLVideoElement, box: faceapi.Box) => {
    const pad = 0.35;
    const w = video.videoWidth, h = video.videoHeight;
    const cw = Math.min(w, box.width * (1 + pad * 2));
    const ch = Math.min(h, box.height * (1 + pad * 2));
    const cx = Math.max(0, box.x - box.width * pad);
    const cy = Math.max(0, box.y - box.height * pad);
    const c = document.createElement('canvas');
    c.width = 320; c.height = 320;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(video, cx, cy, cw, ch, 0, 0, 320, 320);
    return c.toDataURL('image/jpeg', 0.85);
  }, []);

  // ─── Local (client-side) recognizer — accuracy first, no time pressure ─────
  // Each capture is compared with several candidate descriptors (averaged
  // standard, averaged aligned, and individual samples) and the most confident
  // verdict wins. This is what lifts the hit-rate on hard angles and removes
  // the "Unrecognised for a registered user" failures.
  const processLocally = useCallback(async (items: CapturedFace[]) => {
    const results: any[] = [];
    let marked = 0, alreadyMarked = 0, unrecognized = 0, lowConf = 0;

    for (const item of items) {
      try {
        const candidates: Float32Array[] = [new Float32Array(item.descriptor)];
        for (const s of item.samples3 || []) candidates.push(new Float32Array(s));
        if (item.altDescriptor) candidates.push(new Float32Array(item.altDescriptor));

        scanTelemetry.set({ phase: 'analyzing', statusText: 'Matching captured faces…' });
        const match = await recognizeBestOf(candidates);
        const best = match.recognized && match.employee
          ? { employee: match.employee, confidence: match.confidence }
          : null;

        if (!best) {
          unrecognized++;
          scanTelemetry.unknown(match.confidence);
          results.push({ clientId: item.clientId, recognized: false, reason: 'no_match' });
          continue;
        }
        const conf = best.confidence;
        if (conf < LOCAL_MIN_CONFIDENCE) {
          lowConf++;
          unrecognized++;
          scanTelemetry.unknown(conf);
          results.push({ clientId: item.clientId, recognized: false, reason: 'low_confidence', confidence: conf });
          continue;
        }
        const rec = { employee: best.employee };
        scanTelemetry.matched({
          name: rec.employee.name,
          confidence: conf,
          meta: 'Loop match',
          image: rec.employee.avatar_url || rec.employee.firebase_image_url,
        });

        const outcome = await recordAttendance(
          rec.employee.id,
          'present',
          conf,
          { source: 'loop-mode-local', metadata: { name: rec.employee.name } },
          item.imageDataUrl,
          'ai-scan',
        );
        if (outcome?.skipped) {
          if (outcome.reason === 'already_marked') {
            alreadyMarked++;
            results.push({ clientId: item.clientId, recognized: true, alreadyMarked: true, name: rec.employee.name, confidence: conf });

          } else {
            lowConf++;
            results.push({ clientId: item.clientId, recognized: false, reason: outcome.reason, confidence: conf });
          }
        } else {
          marked++;
          const status = outcome?.status || 'present';
          results.push({ clientId: item.clientId, recognized: true, name: rec.employee.name, status, confidence: conf });
        }
      } catch (e: any) {
        results.push({ clientId: item.clientId, recognized: false, reason: 'error', error: e?.message });
      }
    }
    return {
      ok: true,
      summary: { total: items.length, marked, alreadyMarked, unrecognized, lowConf },
      results,
      via: 'local' as const,
    };
  }, []);

  const applyResults = useCallback((results: any[]) => {
    const map: Record<string, ItemResult> = {};
    const toRemove = new Set<string>();
    for (const r of results) {
      let status: ItemStatus = 'error';
      if (r.recognized && r.alreadyMarked) status = 'already';
      else if (r.recognized && r.status === 'late') status = 'late';
      else if (r.recognized) status = 'marked';
      else if (r.reason === 'low_confidence') status = 'low_conf';
      else if (r.reason === 'ambiguous' || r.reason === 'no_match') status = 'unmatched';
      map[r.clientId] = { clientId: r.clientId, status, name: r.name, confidence: r.confidence };
      if (status === 'marked' || status === 'already' || status === 'late') toRemove.add(r.clientId);
    }
    setItemResults(prev => ({ ...prev, ...map }));
    // Remove successfully-processed items from the capture queue after a short delay,
    // but keep their results in itemResults so the summary/results panel persists for the session.
    setTimeout(() => {
      setQueue(prev => prev.filter(q => !toRemove.has(q.clientId)));
    }, 900);
  }, []);

  const submit = useCallback(async (opts: { silent?: boolean } = {}) => {
    if (submittingRef.current) return;
    const items = queueRef.current;
    if (!items.length) return;
    setSubmitting(true);
    const wasRunning = runningRef.current;
    try {
      // 1) On-device pass first — highest accuracy, unlimited time budget.
      const local = await processLocally(items);
      const localResults: any[] = Array.isArray(local.results) ? local.results : [];
      let data: any = local;

      // 2) Second opinion from the server for anything the device could not match.
      const unresolvedIds = new Set(
        localResults.filter(r => !r.recognized).map(r => r.clientId),
      );
      const leftovers = items.filter(i => unresolvedIds.has(i.clientId));

      if (leftovers.length) {
        try {
          const payload = leftovers.map(q => ({
            clientId: q.clientId,
            descriptor: q.descriptor,
            capturedAt: q.capturedAt,
          }));
          const { data: srvData, error } = await supabase.functions.invoke('batch-face-attendance', { body: { items: payload } });
          if (error) throw error;
          if (!srvData?.summary) throw new Error('Malformed server response');
          setServerDown(false);

          const srvResults: any[] = Array.isArray(srvData.results) ? srvData.results : [];
          const byId = new Map(srvResults.map(r => [r.clientId, r]));
          const merged = localResults.map(r => {
            const srv = byId.get(r.clientId);
            return srv && srv.recognized ? srv : r;
          });
          const summary = merged.reduce(
            (acc, r) => {
              if (r.recognized && r.alreadyMarked) acc.alreadyMarked++;
              else if (r.recognized) acc.marked++;
              else { acc.unrecognized++; if (r.reason === 'low_confidence') acc.lowConf++; }
              return acc;
            },
            { total: merged.length, marked: 0, alreadyMarked: 0, unrecognized: 0, lowConf: 0 },
          );
          data = { ok: true, summary, results: merged, via: 'hybrid' as const };
        } catch (edgeErr: any) {
          console.warn('Server second-opinion unavailable:', edgeErr?.message || edgeErr);
          setServerDown(true);
        }
      } else {
        setServerDown(false);
      }

      setLastResult(data);
      if (Array.isArray(data?.results)) applyResults(data.results);

      if (!opts.silent) {
        const s = data.summary || {};
        toast({
          title: 'Batch processed',
          description: `${s.marked ?? 0} marked · ${s.alreadyMarked ?? 0} already · ${s.unrecognized ?? 0} unmatched`,
        });
      }
    } catch (e: any) {
      toast({ title: 'Process failed', description: e?.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setSubmitting(false);
      if (wasRunning && !runningRef.current) {
        // scanner was paused externally — leave it
      }
    }
  }, [applyResults, processLocally, toast]);

  const scheduleAutoFlush = useCallback(() => {
    if (!autoProcess) return;
    if (autoFlushTimerRef.current) window.clearTimeout(autoFlushTimerRef.current);
    autoFlushTimerRef.current = window.setTimeout(() => {
      if (!submittingRef.current && queueRef.current.length > 0) submit({ silent: true });
    }, AUTO_FLUSH_MS);
  }, [autoProcess, submit]);

  // Auto-batch trigger when queue reaches threshold
  useEffect(() => {
    if (!autoProcess) return;
    if (submitting) return;
    if (queue.length >= AUTO_BATCH_SIZE) {
      submit({ silent: true });
    } else if (queue.length > 0) {
      scheduleAutoFlush();
    }
    return () => {
      if (autoFlushTimerRef.current) window.clearTimeout(autoFlushTimerRef.current);
    };
  }, [queue.length, autoProcess, submitting, submit, scheduleAutoFlush]);

  /** Finalise a tracked face: robust-average its samples and queue it. */
  const commitTrack = useCallback((track: Track) => {
    if (track.samples.length < 2 || track.bestQuality < COMMIT_MIN_QUALITY) return;

    const descriptor = robustAverage(track.samples);

    // Skip if this person is already in the queue OR was already committed this session
    const dupQueue = queueRef.current.some(q => euclid(descriptor, q.descriptor) < SAME_FACE_DIST);
    const dupSession = committedRef.current.some(d => euclid(descriptor, d) < SAME_FACE_DIST);
    if (dupQueue || dupSession) return;

    committedRef.current.push(descriptor);
    if (committedRef.current.length > 300) committedRef.current.shift();

    const item: CapturedFace = {
      clientId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      descriptor: Array.from(descriptor),
      altDescriptor: track.alt.length ? Array.from(robustAverage(track.alt)) : undefined,
      samples3: track.samples.slice(0, 3).map(s => Array.from(s)),
      imageDataUrl: track.bestImage,
      capturedAt: new Date().toISOString(),
      quality: track.bestQuality,
      samples: track.samples.length,
    };
    setQueue(prev => [item, ...prev]);
    setFlash(true);
    setTimeout(() => setFlash(false), 180);
    try { (navigator as any).vibrate?.(30); } catch {}
  }, []);

  /**
   * Detection loop — SSD MobileNetV1 over ALL faces in frame, IoU tracking,
   * multi-sample aligned descriptors per track. Runs on a self-scheduling
   * timer so a slow frame never stacks work up.
   */
  const detectLoop = useCallback(async () => {
    if (!runningRef.current) return;
    const started = Date.now();
    const video = webcamRef.current?.video as HTMLVideoElement | undefined;

    if (video && video.readyState >= 2 && video.videoWidth > 0) {
      try {
        const dets = await faceapi
          .detectAllFaces(video, new faceapi.SsdMobilenetv1Options({
            minConfidence: DETECT_MIN_CONFIDENCE,
            maxResults: MAX_FACES_PER_FRAME,
          }))
          .withFaceLandmarks()
          .withFaceDescriptors();

        const now = Date.now();
        const used = new Set<string>();

        for (const det of dets) {
          const box = det.detection.box;
          if (Math.min(box.width, box.height) < MIN_FACE_PX) continue;

          // Associate with an existing track by IoU
          let matched: Track | null = null;
          let bestIou = TRACK_IOU;
          for (const t of tracksRef.current.values()) {
            if (used.has(t.id)) continue;
            const overlap = iou(t.box, box);
            if (overlap > bestIou) { bestIou = overlap; matched = t; }
          }
          if (!matched) {
            matched = {
              id: `t${++trackSeqRef.current}`,
              box, firstSeen: now, lastSeen: now, lastSample: 0,
              samples: [], alt: [], bestQuality: 0, bestImage: '',
            };
            tracksRef.current.set(matched.id, matched);
          }
          matched.box = box;
          matched.lastSeen = now;
          used.add(matched.id);

          if (matched.samples.length >= MAX_SAMPLES) continue;
          if (now - matched.lastSample < SAMPLE_INTERVAL_MS) continue;
          if (!isFaceFrontal(det.landmarks)) continue;

          // Quality gate on the aligned crop, descriptors from BOTH domains
          const aligned = alignFace(video, det.landmarks, 112);
          const report = scoreFaceQuality(aligned, { width: box.width, height: box.height });
          const quality = report.score * (0.6 + 0.4 * det.detection.score);
          if (quality < SAMPLE_MIN_QUALITY) continue;

          // Standard descriptor = exactly how students were registered.
          const std = det.descriptor as Float32Array;
          if (!std || std.length !== 128) continue;
          matched.samples.push(std);
          try {
            const altDesc = await faceapi.computeFaceDescriptor(aligned) as Float32Array;
            if (altDesc && altDesc.length === 128) matched.alt.push(altDesc);
          } catch { /* aligned descriptor is optional */ }

          matched.lastSample = Date.now();
          if (quality > matched.bestQuality) {
            matched.bestQuality = quality;
            matched.bestImage = captureFrom(video, box);
          }
        }

        // Finalise tracks that are ready or have left the frame

        const stamp = Date.now();
        for (const t of Array.from(tracksRef.current.values())) {
          const ready = t.samples.length >= MIN_SAMPLES && t.bestQuality >= COMMIT_MIN_QUALITY;
          const gone = stamp - t.lastSeen > TRACK_TIMEOUT_MS;
          if (ready || gone) {
            tracksRef.current.delete(t.id);
            commitTrack(t);
          }
        }

        const active = tracksRef.current.size;
        setLiveFaces(active);
        scanTelemetry.faces(active);
        setTracking(active > 0);
      } catch {
        /* transient frame errors are ignored */
      }
    }

    if (!runningRef.current) return;
    const elapsed = Date.now() - started;
    timerRef.current = window.setTimeout(detectLoop, Math.max(16, DETECT_INTERVAL_MS - elapsed));
  }, [captureFrom, commitTrack]);

  const start = useCallback(() => {
    if (!modelsReady) {
      toast({ title: 'Loading models…', description: 'Try again in a moment' });
      return;
    }
    runningRef.current = true;
    setRunning(true);
    tracksRef.current.clear();
    timerRef.current = window.setTimeout(detectLoop, 0);
  }, [detectLoop, modelsReady, toast]);

  useEffect(() => () => {
    runningRef.current = false;
    if (timerRef.current) window.clearTimeout(timerRef.current);
    if (autoFlushTimerRef.current) window.clearTimeout(autoFlushTimerRef.current);
  }, []);


  const removeItem = (id: string) => setQueue(q => q.filter(x => x.clientId !== id));
  const clearAll = () => { setQueue([]); setItemResults({}); committedRef.current = []; };

  const submitDetached = async () => {
    if (!queue.length) return;
    const snapshot = [...queue];
    const ids = new Set(snapshot.map(s => s.clientId));
    const payload = snapshot.map(q => ({ clientId: q.clientId, descriptor: q.descriptor, capturedAt: q.capturedAt }));

    const runLocalFallback = async () => {
      toast({ title: 'Server unavailable — processing on device…', description: 'Keeping this screen open finishes attendance faster.' });
      try {
        const data = await processLocally(snapshot);
        setLastResult(data);
        applyResults(data.results);
        setQueue(q => q.filter(x => !ids.has(x.clientId)));
        setServerDown(true);
        toast({ title: 'Processed on-device', description: 'Attendance marked locally.' });
      } catch {
        toast({
          title: 'Submission failed',
          description: 'Kept your captures — please retry when connection is stable.',
          variant: 'destructive' as any,
        });
      }
    };

    // Try keepalive fetch first so the request survives tab close. We do NOT
    // clear the queue until we get a successful reply — this prevents silent
    // data loss on non-2xx responses. If the user closes the tab before the
    // reply arrives, the queue persists in localStorage and can be retried
    // (server-side mark is idempotent via already-marked status).
    const supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL as string | undefined;
    const anonKey = (import.meta as any).env?.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
    try {
      if (supabaseUrl && anonKey) {
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData?.session?.access_token ?? anonKey;
        const body = JSON.stringify({ items: payload });
        if (new Blob([body]).size < 60_000) {
          toast({ title: 'Sending…', description: 'Safe to close — will finish in background if online.' });
          try {
            const r = await fetch(`${supabaseUrl}/functions/v1/batch-face-attendance`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                apikey: anonKey,
                Authorization: `Bearer ${accessToken}`,
              },
              body,
              keepalive: true,
            });
            if (r.ok) {
              const data = await r.json().catch(() => null);
              setServerDown(false);
              if (data?.results) {
                applyResults(data.results);
                setLastResult(data);
              }
              // Only now safe to clear.
              setQueue(q => q.filter(x => !ids.has(x.clientId)));
              toast({ title: 'Attendance submitted', description: 'Server confirmed your captures.' });
              return;
            }
            // Non-2xx: preserve queue, fall back locally.
            setServerDown(true);
            await runLocalFallback();
            return;
          } catch {
            // Network error: preserve queue, fall back locally.
            setServerDown(true);
            await runLocalFallback();
            return;
          }
        }
      }
    } catch { /* fall through */ }

    // No env / oversized body — go straight to local fallback.
    await runLocalFallback();
  };


  const statusMeta: Record<ItemStatus, { label: string; cls: string; ring: string; icon: React.ReactNode }> = {
    marked:    { label: 'Present',   cls: 'bg-emerald-500 text-white',                       ring: 'ring-emerald-500/60', icon: <UserCheck className="w-3 h-3" /> },
    late:      { label: 'Late',      cls: 'bg-amber-500 text-white',                         ring: 'ring-amber-500/60',   icon: <Clock className="w-3 h-3" /> },
    already:   { label: 'Already',   cls: 'bg-slate-500 text-white',                         ring: 'ring-slate-400/60',   icon: <CheckCircle2 className="w-3 h-3" /> },
    unmatched: { label: 'No match',  cls: 'bg-rose-500 text-white',                          ring: 'ring-rose-500/60',    icon: <UserX className="w-3 h-3" /> },
    low_conf:  { label: 'Low conf',  cls: 'bg-orange-500 text-white',                        ring: 'ring-orange-500/60',  icon: <HelpCircle className="w-3 h-3" /> },
    error:     { label: 'Error',     cls: 'bg-rose-600 text-white',                          ring: 'ring-rose-600/60',    icon: <AlertTriangle className="w-3 h-3" /> },
  };

  const statusBadge = (r?: ItemResult) => {
    if (!r) return null;
    const m = statusMeta[r.status];
    return (
      <div className={`absolute top-1 left-1 inline-flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded-md shadow-sm ${m.cls}`}>
        {m.icon}<span>{m.label}</span>
      </div>
    );
  };

  // Aggregate results (live, from itemResults + lastResult history)
  const resultEntries = Object.values(itemResults);
  const counts = resultEntries.reduce(
    (acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc; },
    {} as Record<ItemStatus, number>,
  );
  const totalProcessed = resultEntries.length;
  const successProcessed = (counts.marked || 0) + (counts.late || 0) + (counts.already || 0);
  const pendingCount = queue.length;
  const totalSeen = pendingCount + totalProcessed;
  const progressPct = totalSeen ? Math.round((totalProcessed / totalSeen) * 100) : 0;

  const summaryCards: { key: ItemStatus | 'pending'; label: string; value: number; grad: string; icon: React.ReactNode }[] = [
    { key: 'marked',    label: 'Present',   value: counts.marked || 0,    grad: 'from-emerald-500/15 to-emerald-500/5 text-emerald-600 dark:text-emerald-400', icon: <UserCheck className="w-4 h-4" /> },
    { key: 'late',      label: 'Late',      value: counts.late || 0,      grad: 'from-amber-500/15 to-amber-500/5 text-amber-600 dark:text-amber-400',         icon: <Clock className="w-4 h-4" /> },
    { key: 'already',   label: 'Already',   value: counts.already || 0,   grad: 'from-slate-500/15 to-slate-500/5 text-slate-600 dark:text-slate-300',         icon: <CheckCircle2 className="w-4 h-4" /> },
    { key: 'unmatched', label: 'Unknown',   value: (counts.unmatched || 0) + (counts.low_conf || 0) + (counts.error || 0), grad: 'from-rose-500/15 to-rose-500/5 text-rose-600 dark:text-rose-400', icon: <UserX className="w-4 h-4" /> },
    { key: 'pending',   label: 'Pending',   value: pendingCount,          grad: 'from-primary/15 to-primary/5 text-primary',                                    icon: <ScanFace className="w-4 h-4" /> },
  ];

  return (
    <div className="space-y-4">
      {/* Camera */}
      <div className="relative rounded-2xl overflow-hidden bg-black aspect-[4/3] max-w-2xl mx-auto shadow-lg">
        <Webcam
          ref={webcamRef}
          audio={false}
          mirrored
          screenshotFormat="image/jpeg"
          videoConstraints={{ facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } }}
          className="w-full h-full object-cover"
        />

        {tracking && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <motion.div
              initial={{ scale: 0.9, opacity: 0.4 }}
              animate={{ scale: [0.95, 1.05, 0.95], opacity: [0.5, 0.9, 0.5] }}
              transition={{ duration: 0.9, repeat: Infinity }}
              className="w-60 h-76 sm:w-72 sm:h-88 rounded-[42%] border-[3px]"
              style={{ borderColor: 'hsl(var(--ios-green))' }}
            />
          </div>
        )}

        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <motion.div
            animate={{ scale: running ? [1, 1.03, 1] : 1 }}
            transition={{ duration: 2, repeat: Infinity }}
            className="w-56 h-72 sm:w-64 sm:h-80 rounded-[42%] border-2"
            style={{ borderColor: running ? 'hsl(var(--ios-green))' : 'rgba(255,255,255,0.35)' }}
          />
        </div>

        <AnimatePresence>
          {flash && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 0.85 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0 bg-white"
            />
          )}
        </AnimatePresence>

        <div className="absolute top-3 left-3 right-3 flex items-center justify-between">
          <Badge className="bg-black/60 text-white border-white/20 backdrop-blur">
            <Repeat className="w-3 h-3 mr-1" /> Loop Mode
          </Badge>
          <div className="flex items-center gap-2">
            {submitting && (
              <Badge className="bg-black/60 text-white border-white/20 backdrop-blur">
                <Loader2 className="w-3 h-3 mr-1 animate-spin" /> Processing
              </Badge>
            )}
            <Badge className="bg-black/60 text-white border-white/20 backdrop-blur">
              <Users className="w-3 h-3 mr-1" /> {liveFaces > 0 ? `${liveFaces} in view · ` : ''}{queue.length} queued
            </Badge>
          </div>
        </div>

        <div className="absolute bottom-3 left-0 right-0 flex justify-center">
          <div className="px-3 py-1.5 rounded-full bg-black/60 text-white text-xs backdrop-blur">
            {running
              ? (autoProcess ? 'Auto-marking as students appear — just point the camera' : 'Point at students — press Process when done')
              : 'Tap Start to begin capturing'}
          </div>
        </div>
      </div>

      {serverDown && (
        <div className="max-w-2xl mx-auto flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300 px-3 py-2 text-xs">
          <WifiOff className="w-4 h-4" />
          Server unavailable — using on-device recognition. Attendance is still being marked.
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-wrap items-center justify-center gap-2 max-w-2xl mx-auto">
        {!running ? (
          <Button onClick={start} disabled={!modelsReady} size="lg" className="min-w-[140px]">
            <Play className="w-4 h-4 mr-1" /> Start
          </Button>
        ) : (
          <Button onClick={stop} size="lg" variant="secondary" className="min-w-[140px]">
            <Pause className="w-4 h-4 mr-1" /> Pause
          </Button>
        )}
        <Button
          onClick={() => submit()}
          disabled={!queue.length || submitting}
          size="lg"
          className="min-w-[160px] bg-gradient-to-r from-emerald-500 to-teal-500 text-white hover:opacity-90"
        >
          {submitting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Send className="w-4 h-4 mr-1" />}
          Process {queue.length ? `(${queue.length})` : ''}
        </Button>
        <Button
          onClick={submitDetached}
          disabled={!queue.length || submitting}
          size="lg"
          variant="outline"
          title="Send in background — falls back to on-device if server is offline"
        >
          <Sparkles className="w-4 h-4 mr-1" /> Send & Close-Safe
        </Button>
        {(queue.length > 0 || totalProcessed > 0) && (
          <Button onClick={clearAll} size="lg" variant="ghost" className="text-destructive">
            <Trash2 className="w-4 h-4 mr-1" /> Clear
          </Button>
        )}
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border/60 bg-card/60">
          <Switch id="auto-proc" checked={autoProcess} onCheckedChange={setAutoProcess} />
          <Label htmlFor="auto-proc" className="text-xs cursor-pointer">Auto process</Label>
        </div>
      </div>

      {/* Session summary cards */}
      {(totalSeen > 0) && (
        <div className="max-w-2xl mx-auto space-y-3">
          <div className="grid grid-cols-5 gap-2">
            {summaryCards.map(c => (
              <motion.div
                key={c.key}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className={`rounded-xl border border-border/50 bg-gradient-to-br ${c.grad} p-2 flex flex-col items-center justify-center text-center`}
              >
                <div className="flex items-center gap-1 opacity-80">{c.icon}</div>
                <div className="text-lg font-bold leading-tight mt-0.5">{c.value}</div>
                <div className="text-[10px] uppercase tracking-wide opacity-70">{c.label}</div>
              </motion.div>
            ))}
          </div>

          {/* Progress bar */}
          <div className="rounded-xl border border-border/50 bg-card/60 backdrop-blur p-3">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <div className="flex items-center gap-1.5 font-medium">
                <Zap className="w-3.5 h-3.5 text-primary" />
                Session progress
              </div>
              <div className="text-muted-foreground">
                {totalProcessed} / {totalSeen} processed · {successProcessed} marked
              </div>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-emerald-500 via-teal-500 to-primary"
                initial={{ width: 0 }}
                animate={{ width: `${progressPct}%` }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Queue grid (pending captures) */}
      {queue.length > 0 && (
        <div className="max-w-2xl mx-auto">
          <div className="text-xs text-muted-foreground mb-2 px-1 flex items-center justify-between">
            <span className="inline-flex items-center gap-1">
              <ScanFace className="w-3 h-3" />
              {pendingCount} pending · {autoProcess ? 'auto-processing' : 'manual mode'}
            </span>
            {submitting && (
              <span className="inline-flex items-center gap-1 text-primary">
                <Loader2 className="w-3 h-3 animate-spin" /> Working…
              </span>
            )}
          </div>
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
            <AnimatePresence>
              {queue.map(item => {
                const r = itemResults[item.clientId];
                const ringCls = r ? `ring-2 ${statusMeta[r.status].ring}` : '';
                return (
                  <motion.div
                    key={item.clientId}
                    layout
                    initial={{ scale: 0.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.6, opacity: 0 }}
                    className={`relative aspect-square rounded-xl overflow-hidden bg-muted border border-border/60 ${ringCls}`}
                  >
                    <img src={item.imageDataUrl} alt="captured" className="w-full h-full object-cover" />
                    {statusBadge(r)}
                    <button
                      onClick={() => removeItem(item.clientId)}
                      className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 text-white flex items-center justify-center"
                      aria-label="Remove capture"
                    >
                      <X className="w-3 h-3" />
                    </button>
                    <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] px-1 py-0.5 flex items-center justify-between">
                      <span className="truncate">{r?.name || '—'}</span>
                      <span className="opacity-80">{(item.quality * 100).toFixed(0)}%</span>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* Results panel — recognized students */}
      {resultEntries.length > 0 && (
        <div className="max-w-2xl mx-auto rounded-2xl border border-border/60 bg-card/70 backdrop-blur overflow-hidden">
          <div className="px-4 py-2.5 flex items-center justify-between border-b border-border/50 bg-gradient-to-r from-emerald-500/10 to-teal-500/10">
            <div className="flex items-center gap-2 font-semibold text-sm">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              Results
              {lastResult?.via === 'local' && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-amber-500/20 text-amber-600 dark:text-amber-300">on-device</span>
              )}
            </div>
            <div className="text-xs text-muted-foreground">
              {successProcessed} of {totalProcessed} matched
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto divide-y divide-border/40">
            {resultEntries
              .slice()
              .sort((a, b) => {
                const order: Record<ItemStatus, number> = { marked: 0, late: 1, already: 2, low_conf: 3, unmatched: 4, error: 5 };
                return order[a.status] - order[b.status];
              })
              .map(r => {
                const m = statusMeta[r.status];
                return (
                  <div key={r.clientId} className="flex items-center gap-3 px-4 py-2.5">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${m.cls}`}>
                      {m.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
                        {r.name || (r.status === 'unmatched' ? 'Unknown face' : 'Unrecognized')}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {m.label}
                        {typeof r.confidence === 'number' && ` · ${(r.confidence * 100).toFixed(0)}% confidence`}
                      </div>
                    </div>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${m.cls}`}>
                      {m.label}
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
};

export default LoopFaceScanMode;
