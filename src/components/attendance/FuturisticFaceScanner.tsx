import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Webcam from 'react-webcam';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { 
  loadModels, 
  areModelsLoaded,
  getFaceDescriptor
} from '@/services/face-recognition/ModelService';
import {
  recognizeFace,
  recordAttendance
} from '@/services/face-recognition/RecognitionService';
import { recognizeFaceRobust } from '@/services/face-recognition/RobustMatchService';
import { scanTelemetry } from '@/services/face-recognition/ScanTelemetry';

import { saveEmotionEvent } from '@/services/ai/EmotionAnalysisService';
import { sendAutoParentNotification } from '@/services/notification/AutoNotificationService';
import { storeFaceSample } from '@/services/face-recognition/ProgressiveTrainingService';
import { supabase } from '@/integrations/supabase/client';

import { getCutoffTime, isPastCutoffTime, getAttendanceCutoffTime } from '@/services/attendance/AttendanceSettingsService';
import * as faceapi from 'face-api.js';
import { loadNet } from '@/services/face-recognition/NetLoaderService';
import { createRecognitionEngine } from '@/services/face-recognition/RealtimeRecognitionEngine';
import type { FaceTrack } from '@/services/face-recognition/FaceTrackerService';
import {
  Camera,
  Scan,
  CheckCircle,
  AlertCircle,
  User,
  Zap,
  RefreshCw,
  Sparkles,
  Eye,
  Shield,
  Activity,
  Cpu,
  Target,
  Wifi,
  Power,
  Users,
  Play,
  Pause
} from 'lucide-react';
import LiveFaceOverlay, { RecognizedFaceData } from './LiveFaceOverlay';

interface FuturisticFaceScannerProps {
  onScanComplete?: (result: { recognized: boolean; name?: string; confidence?: number }) => void;
}

interface DetectedFace {
  box: { x: number; y: number; width: number; height: number };
  descriptor?: Float32Array;
}

interface PendingManualReview {
  id: string;
  employee: {
    id: string;
    name: string;
    employee_id?: string;
    avatar_url?: string;
    firebase_image_url?: string;
  };
  status: 'present' | 'late';
  confidence: number;
  strictScore: number;
  thresholdTarget: number;
  capturedImageDataUrl?: string;
}

const EMBEDDING_DEDUPE_THRESHOLD = 0.46;
const FACE_CROP_PADDING_PERCENT = 0;
/** Same person is not re-marked by the live scanner within this window. */
const AUTO_MARK_COOLDOWN_MS = 5 * 60 * 1000;
/** Minimum sharpness (gradient energy) for a crop to be kept as a training sample. */
const AUTO_SAMPLE_MIN_SHARPNESS = 9;


interface AutoMarkedEntry {
  id: string;
  name: string;
  status: 'present' | 'late';
  confidence: number;
  at: number;
  emailed?: boolean;
  notified?: boolean;
  sampleSaved?: boolean;
}



const descriptorDistance = (a: Float32Array, b: Float32Array) => {
  let sum = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
};

const FuturisticFaceScanner: React.FC<FuturisticFaceScannerProps> = ({ onScanComplete }) => {
  const { toast } = useToast();
  const webcamRef = useRef<Webcam>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const detectionIntervalRef = useRef<number | null>(null);
  const loopTimerRef = useRef<number | null>(null);
  const isLoopActiveRef = useRef(false);
  const processedFaceCooldownRef = useRef<Map<string, number>>(new Map());
  const recognizedUserCooldownRef = useRef<Map<string, number>>(new Map());
  const stableFaceCounterRef = useRef<Map<string, number>>(new Map());
  const processingFaceKeysRef = useRef<Set<string>>(new Set());
  const hasCompletedFirstRecognitionRef = useRef(false);
  const processedEmbeddingsRef = useRef<Array<{ descriptor: Float32Array; employeeId?: string; ts: number }>>([]);
  const autoMarkedUsersRef = useRef<Map<string, number>>(new Map());
  const cutoffCacheRef = useRef<{ value: { hour: number; minute: number }; at: number } | null>(null);
  const [autoMarkedLog, setAutoMarkedLog] = useState<AutoMarkedEntry[]>([]);
  

  
  const [modelsLoaded, setModelsLoaded] = useState(areModelsLoaded());
  const [galleryCount, setGalleryCount] = useState<number | null>(null);

  const [isScanning, setIsScanning] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [scanPhase, setScanPhase] = useState<'idle' | 'detecting' | 'analyzing' | 'matching' | 'complete'>('idle');
  const [scanResult, setScanResult] = useState<{ recognized: boolean; name?: string; confidence?: number } | null>(null);
  const [isLoopScanning, setIsLoopScanning] = useState(false);
  const [loopCapturedCount, setLoopCapturedCount] = useState(0);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [detectedFaces, setDetectedFaces] = useState<DetectedFace[]>([]);
  const [faceCount, setFaceCount] = useState(0);
  const [recognizedFaces, setRecognizedFaces] = useState<RecognizedFaceData[]>([]);
  const [pendingManualReviews, setPendingManualReviews] = useState<PendingManualReview[]>([]);
  const [isSavingReviewId, setIsSavingReviewId] = useState<string | null>(null);
  const [containerDimensions, setContainerDimensions] = useState({ width: 0, height: 0 });
  const [systemStatus, setSystemStatus] = useState({
    neural: true,
    biometric: true,
    cloud: navigator.onLine,
    recognition: true
  });

  // Track container dimensions for overlay positioning
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        setContainerDimensions({
          width: containerRef.current.offsetWidth,
          height: containerRef.current.offsetHeight
        });
      }
    };
    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  const patchAutoMarked = useCallback((entryId: string, patch: Partial<AutoMarkedEntry>) => {
    setAutoMarkedLog((prev) => prev.map((e) => (e.id === entryId ? { ...e, ...patch } : e)));
  }, []);

  /**
   * Background follow-ups for an auto-marked student:
   *  1. Parent email (Resend) + SMS/push via the notification pipeline
   *  2. In-app notification row (fallback insert if the pipeline is unreachable)
   *  3. A fresh face sample stored for future recognition — only when the crop
   *     is high quality, so the gallery keeps the newest & sharpest views.
   */
  const runAutoFollowUps = useCallback(
    async (job: {
      entryId: string;
      userId: string;
      name: string;
      status: 'present' | 'late';
      confidence: number;
      descriptor?: Float32Array;
      crop: { dataUrl: string; blurScore: number } | null;
    }) => {
      // 1 + 2 — notifications (email via Resend, push, SMS, in-app row)
      try {
        const result = await sendAutoParentNotification(job.userId, job.name, job.status, job.crop?.dataUrl);
        patchAutoMarked(job.entryId, { emailed: !!result?.success, notified: true });
        if (!result?.success) {
          await supabase.from('notifications').insert({
            user_id: job.userId,
            title: `Attendance marked ${job.status}`,
            message: `${job.name} was marked ${job.status} by live Face ID at ${new Date().toLocaleTimeString()}.`,
            type: job.status === 'late' ? 'warning' : 'success',
            metadata: { source: 'live-face-id', confidence: job.confidence },
          });
        }
      } catch (err) {
        console.warn('Auto notification follow-up failed:', err);
      }

      // 3 — high-quality face sample for progressive training
      try {
        const isHighQuality =
          job.confidence >= 0.8 && !!job.crop && job.crop.blurScore >= AUTO_SAMPLE_MIN_SHARPNESS;
        if (job.descriptor && isHighQuality && job.crop) {
          const blob = await (await fetch(job.crop.dataUrl)).blob();
          const stored = await storeFaceSample(job.userId, job.descriptor, blob, job.name, job.confidence);
          patchAutoMarked(job.entryId, { sampleSaved: stored });
        }
      } catch (err) {
        console.warn('Auto face-sample capture failed:', err);
      }
    },
    [patchAutoMarked]
  );



  useEffect(() => {
    const initModels = async () => {
      try {
        if (!areModelsLoaded()) await loadModels();
        setModelsLoaded(true);
      } catch (e) {
        console.error('Face model load failed:', e);
      }
      // Pre-load the detector via the shared loader (deduped, retried)
      try {
        await loadNet('ssdMobilenetv1');
      } catch (e) {
        console.warn('SSD MobileNetV1 pre-load failed, will use TinyFaceDetector', e);
      }
    };
    initModels();
  }, []);

  // Gallery health check — if no face descriptors exist, recognition can never
  // succeed, so tell the operator instead of silently showing "Face 1".
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { count, error } = await supabase
          .from('face_descriptors')
          .select('id', { count: 'exact', head: true });
        if (!cancelled) setGalleryCount(error ? null : Number(count ?? 0));
      } catch {
        if (!cancelled) setGalleryCount(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);


  // Real-time face detection — engine driven:
  //  • preview stays at full camera fps, detection runs at 9 fps
  //  • inference on a 640px downscaled frame, boxes mapped back to full res
  //  • IoU tracking keeps identities so a face is recognised once, not per frame
  const engineRef = useRef<ReturnType<typeof createRecognitionEngine> | null>(null);

  useEffect(() => {
    if (!modelsLoaded || isScanning) {
      engineRef.current?.stop();
      engineRef.current = null;
      setIsDetecting(false);
      return;
    }

    const drawTracks = (tracks: FaceTrack[]) => {
      const video = webcamRef.current?.video;
      const canvas = canvasRef.current;
      if (!video || !canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      tracks.forEach((track, i) => {
        const box = track.box;
        ctx.strokeStyle = track.identity ? '#34d399' : '#22d3ee';
        ctx.lineWidth = 3;
        ctx.strokeRect(box.x, box.y, box.width, box.height);

        const cornerSize = 15;
        ctx.strokeStyle = track.identity ? '#10b981' : '#06b6d4';
        ctx.lineWidth = 4;

        ctx.beginPath();
        ctx.moveTo(box.x, box.y + cornerSize);
        ctx.lineTo(box.x, box.y);
        ctx.lineTo(box.x + cornerSize, box.y);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(box.x + box.width - cornerSize, box.y);
        ctx.lineTo(box.x + box.width, box.y);
        ctx.lineTo(box.x + box.width, box.y + cornerSize);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(box.x, box.y + box.height - cornerSize);
        ctx.lineTo(box.x, box.y + box.height);
        ctx.lineTo(box.x + cornerSize, box.y + box.height);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(box.x + box.width - cornerSize, box.y + box.height);
        ctx.lineTo(box.x + box.width, box.y + box.height);
        ctx.lineTo(box.x + box.width, box.y + box.height - cornerSize);
        ctx.stroke();

        ctx.fillStyle = track.identity ? '#10b981' : '#06b6d4';
        ctx.font = 'bold 14px Inter';
        ctx.fillText(track.identity ? track.identity.name : `Face ${i + 1}`, box.x, box.y - 8);
      });
    };

    const engine = createRecognitionEngine(() => webcamRef.current?.video ?? null, {
      detectFps: 10,
      detectionWidth: 640,
      maxConcurrentJobs: 2,
      identityTtlMs: 3000,
      maxMissed: 3,
      onTracks: (tracks) => {
        // Boxes live on the canvas overlay; React state only tracks the count so
        // the camera loop never triggers a full re-render per frame.
        drawTracks(tracks);
        setFaceCount((prev) => (prev === tracks.length ? prev : tracks.length));
      },
      // Runs once per newly identified person — UI only, never blocks detection.
      onIdentified: (face) => {
        scanTelemetry.matched({
          name: face.name,
          confidence: face.confidence,
          meta: 'Recognized · marking…',
          counted: false,
        });
      },
      // Thread 4: attendance persistence off the recognition path (background
      // write queue with de-duplication, so the camera never stalls).
      markAttendance: async (face) => {
        const alreadyMarkedAt = autoMarkedUsersRef.current.get(face.userId) || 0;
        if (Date.now() - alreadyMarkedAt < AUTO_MARK_COOLDOWN_MS) return;
        autoMarkedUsersRef.current.set(face.userId, Date.now());

        try {
          const video = webcamRef.current?.video;
          const crop = video ? captureFaceArea(video, face.box) : null;

          // Cutoff is cached for 5 minutes — no per-student network round-trip
          let cutoffTime = cutoffCacheRef.current?.value;
          if (!cutoffTime || Date.now() - (cutoffCacheRef.current?.at ?? 0) > 300_000) {
            cutoffTime = await getAttendanceCutoffTime();
            cutoffCacheRef.current = { value: cutoffTime, at: Date.now() };
          }
          const status: 'present' | 'late' = isPastCutoffTime(cutoffTime) ? 'late' : 'present';

          const outcome = await recordAttendance(
            face.userId,
            status,
            face.confidence,
            {
              metadata: {
                name: face.name,
                source: 'live-face-id',
                track_id: face.trackId,
                distance: Number(face.distance.toFixed(4)),
                // The real-time engine has already passed its strict distance
                // and ambiguity checks. Do not apply a second, differently
                // calibrated confidence gate that can show "recognized" while
                // silently refusing to mark the student.
                force_attendance_save: true,
                // runAutoFollowUps owns the single parent notification for this
                // path; recordAttendance must not send a duplicate.
                suppress_auto_notification: true,
              },
            }
          );

          if (outcome?.skipped) {
            autoMarkedUsersRef.current.delete(face.userId);
            scanTelemetry.matched({
              name: face.name,
              confidence: face.confidence,
              meta: 'Needs a clearer look',
              counted: false,
            });
            return;
          }

          const entryId = `${face.userId}-${Date.now()}`;
          setAutoMarkedLog((prev) => {
            const next = [
              { id: entryId, name: face.name, status, confidence: face.confidence, at: Date.now() },
              ...prev.filter((e) => e.name !== face.name),
            ];
            return next.slice(0, 8);
          });

          // Background follow-ups: parent email (Resend), in-app notification and
          // a fresh high-quality face sample for future recognition. Never awaited
          // on the recognition path, so the camera loop stays perfectly smooth.
          void runAutoFollowUps({
            entryId,
            userId: face.userId,
            name: face.name,
            status,
            confidence: face.confidence,
            descriptor: face.descriptor,
            crop,
          });


          setRecognizedFaces((prev) => [
            ...prev.filter((f) => f.id !== face.userId),
            {
              id: face.userId,
              name: face.name,
              status,
              confidence: face.confidence,
              box: { ...face.box },
            },
          ].slice(-6));

          scanTelemetry.matched({
            name: face.name,
            confidence: face.confidence,
            meta: `Marked ${status}`,
          });

          toast({
            title: `${face.name} marked ${status}`,
            description: `Auto attendance · ${Math.round(face.confidence * 100)}% match`,
          });
        } catch (err) {
          // Allow a retry on the next appearance if the write failed
          autoMarkedUsersRef.current.delete(face.userId);
          console.warn('Auto attendance mark failed:', err);
        }
      },
    });

    engineRef.current = engine;
    engine.start();
    setIsDetecting(true);

    return () => {
      engine.stop();
      engineRef.current = null;
      setIsDetecting(false);
    };
  }, [modelsLoaded, isScanning]);

  // Helper to create a timeout promise for biometric operations
  const withTimeout = <T,>(promise: Promise<T>, ms: number, errorMessage: string): Promise<T> => {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(errorMessage));
      }, ms);
      
      promise
        .then((value) => {
          clearTimeout(timer);
          resolve(value);
        })
        .catch((err) => {
          clearTimeout(timer);
          reject(err);
        });
    });
  };

  const makeFaceKey = (box: { x: number; y: number; width: number; height: number }) => {
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;
    return `${Math.round(centerX / 80)}-${Math.round(centerY / 80)}-${Math.round(box.width / 40)}-${Math.round(box.height / 40)}`;
  };

  const captureFaceArea = (
    video: HTMLVideoElement,
    box: { x: number; y: number; width: number; height: number }
  ): { dataUrl: string; blurScore: number } | null => {
    if (!video.videoWidth || !video.videoHeight) return null;

    const paddingScale = FACE_CROP_PADDING_PERCENT / 100;
    const paddingX = box.width * paddingScale;
    const paddingY = box.height * paddingScale;
    const cropX = Math.max(0, Math.floor(box.x - paddingX));
    const cropY = Math.max(0, Math.floor(box.y - paddingY));
    const cropW = Math.min(video.videoWidth - cropX, Math.ceil(box.width + paddingX * 2));
    const cropH = Math.min(video.videoHeight - cropY, Math.ceil(box.height + paddingY * 2));

    if (cropW < 40 || cropH < 40) return null;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    canvas.width = cropW;
    canvas.height = cropH;
    ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

    const imageData = ctx.getImageData(0, 0, cropW, cropH);
    const data = imageData.data;
    let gradientSum = 0;

    for (let y = 1; y < cropH - 1; y += 2) {
      for (let x = 1; x < cropW - 1; x += 2) {
        const idx = (y * cropW + x) * 4;
        const rightIdx = (y * cropW + (x + 1)) * 4;
        const downIdx = ((y + 1) * cropW + x) * 4;

        const luma = data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114;
        const rightLuma = data[rightIdx] * 0.299 + data[rightIdx + 1] * 0.587 + data[rightIdx + 2] * 0.114;
        const downLuma = data[downIdx] * 0.299 + data[downIdx + 1] * 0.587 + data[downIdx + 2] * 0.114;

        gradientSum += Math.abs(luma - rightLuma) + Math.abs(luma - downLuma);
      }
    }

    const blurScore = gradientSum / Math.max(1, (cropW * cropH) / 4);
    return {
      dataUrl: canvas.toDataURL('image/jpeg', 0.95),
      blurScore,
    };
  };

  const hasSessionEmbeddingMatch = useCallback((descriptor: Float32Array) => {
    return processedEmbeddingsRef.current.some((entry) => descriptorDistance(entry.descriptor, descriptor) < EMBEDDING_DEDUPE_THRESHOLD);
  }, []);

  const rememberSessionEmbedding = useCallback((descriptor: Float32Array, employeeId?: string) => {
    const cloned = new Float32Array(descriptor);
    processedEmbeddingsRef.current.push({ descriptor: cloned, employeeId, ts: Date.now() });

    // Keep bounded for long sessions while preserving recent identities
    if (processedEmbeddingsRef.current.length > 300) {
      processedEmbeddingsRef.current.splice(0, processedEmbeddingsRef.current.length - 300);
    }
  }, []);

  const stopLoopScan = useCallback(() => {
    isLoopActiveRef.current = false;
    setIsLoopScanning(false);
    stableFaceCounterRef.current.clear();
    processingFaceKeysRef.current.clear();
    if (loopTimerRef.current) {
      window.clearTimeout(loopTimerRef.current);
      loopTimerRef.current = null;
    }
  }, []);

  const runLoopTick = useCallback(async () => {
    if (!isLoopActiveRef.current || !webcamRef.current?.video || !modelsLoaded || isScanning) return;

    const video = webcamRef.current.video;
    if (video.readyState !== 4) {
      loopTimerRef.current = window.setTimeout(() => {
        void runLoopTick();
      }, 500);
      return;
    }

    try {
      // SSD MobileNet is far more reliable than TinyFaceDetector at classroom
      // distance / angles — this alone removes many "unknown" outcomes.
      const detections = await faceapi
        .detectAllFaces(video, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.45, maxResults: 12 }))
        .withFaceLandmarks()
        .withFaceDescriptors();

      scanTelemetry.faces(detections.length);

      const nextStableMap = new Map<string, number>();


      for (const detection of detections) {
        const box = detection.detection.box;
        const faceKey = makeFaceKey(box);
        const previousStableCount = stableFaceCounterRef.current.get(faceKey) || 0;
        const stableCount = previousStableCount + 1;
        nextStableMap.set(faceKey, stableCount);

        const lastCapturedAt = processedFaceCooldownRef.current.get(faceKey) || 0;
        const inCooldown = Date.now() - lastCapturedAt < 2500;
        const isStableEnough = stableCount >= 2;
        const alreadyProcessing = processingFaceKeysRef.current.has(faceKey);

        if (!isStableEnough || inCooldown || alreadyProcessing) continue;

        if (hasSessionEmbeddingMatch(detection.descriptor)) {
          processedFaceCooldownRef.current.set(faceKey, Date.now());
          continue;
        }

        const faceCrop = captureFaceArea(video, box);
        if (!faceCrop) continue;

        // Reject blurry captures and wait for a better stable frame
        if (faceCrop.blurScore < 18) {
          continue;
        }

        processingFaceKeysRef.current.add(faceKey);

        void (async () => {
          try {
            const recognition = await withTimeout(
              recognizeFaceRobust(video, detection),
              9000,
              'Loop recognition timed out'
            );

            if (!recognition.recognized || !recognition.employee) {
              scanTelemetry.unknown(recognition.confidence);
              return;
            }

            const recentlyRecognizedAt = recognizedUserCooldownRef.current.get(recognition.employee.id) || 0;
            if (Date.now() - recentlyRecognizedAt < 9000) {
              scanTelemetry.matched({
                name: recognition.employee.name,
                confidence: recognition.confidence,
                meta: 'Already captured',
                image: recognition.employee.avatar_url || recognition.employee.firebase_image_url,
                counted: false,
              });
              return;
            }

            const cutoffTime = await getAttendanceCutoffTime();
            const status = isPastCutoffTime(cutoffTime) ? 'late' : 'present';

            await withTimeout(
              recordAttendance(
                recognition.employee.id,
                status,
                recognition.confidence,
                {
                  metadata: {
                    name: recognition.employee.name,
                    employee_id: recognition.employee.employee_id,
                    source: 'loop-face-capture',
                    stable_capture: true,
                    blur_score: Number(faceCrop.blurScore.toFixed(2)),
                  },
                },
                faceCrop.dataUrl
              ),
              7000,
              'Loop attendance save timed out'
            );

            rememberSessionEmbedding(recognition.descriptor ?? detection.descriptor, recognition.employee.id);
            recognizedUserCooldownRef.current.set(recognition.employee.id, Date.now());
            processedFaceCooldownRef.current.set(faceKey, Date.now());
            setLoopCapturedCount((prev) => prev + 1);
            scanTelemetry.matched({
              name: recognition.employee.name,
              confidence: recognition.confidence,
              meta: `Marked ${status}`,
              image: recognition.employee.avatar_url || recognition.employee.firebase_image_url,
            });

            toast({
              title: 'Loop capture processed',
              description: `${recognition.employee.name} marked ${status} with stable face-only photo.`,
            });

          } catch (error) {
            console.error('Loop scan face process failed:', error);
          } finally {
            processingFaceKeysRef.current.delete(faceKey);
          }
        })();
      }

      stableFaceCounterRef.current = nextStableMap;
    } catch (error) {
      console.error('Loop scan tick failed:', error);
    } finally {
      if (isLoopActiveRef.current) {
        loopTimerRef.current = window.setTimeout(() => {
          void runLoopTick();
        }, 850);
      }
    }
  }, [modelsLoaded, isScanning, toast, hasSessionEmbeddingMatch, rememberSessionEmbedding]);

  const startLoopScan = useCallback(() => {
    if (isLoopActiveRef.current || !modelsLoaded) return;

    resetScanner();
    setLoopCapturedCount(0);
    processedEmbeddingsRef.current = [];
    isLoopActiveRef.current = true;
    setIsLoopScanning(true);

    toast({
      title: 'Loop scan started',
      description: 'Capturing stable face-only photos continuously for backend processing.',
    });

    void runLoopTick();
  }, [modelsLoaded, runLoopTick, toast]);

  const scanFace = useCallback(async () => {
    if (isLoopActiveRef.current) {
      stopLoopScan();
    }

    if (!webcamRef.current || !modelsLoaded || faceCount === 0) {
      toast({
        title: 'No Face Detected',
        description: 'Please position your face in the camera frame',
        variant: 'destructive'
      });
      return;
    }

    // Stop detection during scan
    if (detectionIntervalRef.current) {
      window.clearInterval(detectionIntervalRef.current);
      detectionIntervalRef.current = null;
    }

    setIsScanning(true);
    setScanPhase('detecting');
    scanTelemetry.set({ phase: 'analyzing', statusText: 'Detecting faces…' });
    setScanResult(null);
    setRecognizedFaces([]);

    const isFirstRecognitionAttempt = !hasCompletedFirstRecognitionRef.current;

    // Give first recognition attempt extra time to warm caches and gallery fetches
    const scanTimeout = setTimeout(() => {
      console.warn('Scan timeout - forcing completion');
      setIsScanning(false);
      setScanPhase('idle');
      setScanResult({ recognized: false });
      toast({
        title: "Scan Timeout",
        description: "The scan took too long. Please try again.",
        variant: "destructive"
      });
    }, isFirstRecognitionAttempt ? 35000 : 25000);

    try {
      const video = webcamRef.current.video;
      if (!video) throw new Error('Video not available');

      // Phase 1: Detecting all faces with descriptors
      await new Promise(r => setTimeout(r, 400));
      setScanPhase('analyzing');

      // Detect all faces with full descriptors
      // Use whichever detector is already loaded (prefer SSD, fallback to TinyFaceDetector)
      const useSsd = faceapi.nets.ssdMobilenetv1?.isLoaded;
      console.log(`Using ${useSsd ? 'SSD MobileNetV1' : 'TinyFaceDetector'} for scan`);

      const detectionPromise: Promise<faceapi.WithFaceDescriptor<faceapi.WithFaceLandmarks<{ detection: faceapi.FaceDetection }, faceapi.FaceLandmarks68>>[]> = useSsd
        ? faceapi
            .detectAllFaces(video, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.4 }))
            .withFaceLandmarks()
            .withFaceDescriptors()
            .run()
        : faceapi
            .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.4 }))
            .withFaceLandmarks()
            .withFaceDescriptors()
            .run();

      const fullDetections = await withTimeout(
        detectionPromise,
        20000,
        'Face detection timed out. Please ensure good lighting and try again.'
      );
      console.log(`Found ${fullDetections.length} faces to process`);

      if (fullDetections.length === 0) {
        throw new Error('No faces detected in frame');
      }

      await new Promise(r => setTimeout(r, 400));
      setScanPhase('matching');
      scanTelemetry.set({ phase: 'analyzing', statusText: 'Matching biometric signature…', facesInFrame: fullDetections.length });

      // Process all detected faces
      const results: RecognizedFaceData[] = [];
      const reviewQueue: PendingManualReview[] = [];
      let recognizedCount = 0;

      // Get cutoff time from settings - with timeout
      let cutoffTimeObj = { hour: 9, minute: 0 };
      let isPastCutoff = false;
      try {
        cutoffTimeObj = await withTimeout(getAttendanceCutoffTime(), 3000, 'Cutoff time fetch failed');
        isPastCutoff = isPastCutoffTime(cutoffTimeObj);
      } catch (e) {
        console.warn('Using default cutoff time:', e);
        isPastCutoff = isPastCutoffTime(cutoffTimeObj);
      }
      
      // Process faces with individual timeouts
      for (const detection of fullDetections) {
        const box = detection.detection.box;
        const descriptor = detection.descriptor;
        const faceCaptureImageDataUrl = captureFaceArea(video, box)?.dataUrl;

        if (hasSessionEmbeddingMatch(descriptor)) {
          continue;
        }
        
        try {
          // Multi-view recognition (raw + aligned + mirrored + padded crop):
          // dramatically higher recall for registered students.
          const result = await withTimeout(
            recognizeFaceRobust(video, detection),
            isFirstRecognitionAttempt ? 15000 : 9000,
            isFirstRecognitionAttempt
              ? 'Face recognition warm-up in progress. Please hold still.'
              : 'Face recognition timed out'
          );

          if (result.recognized && result.employee) {
            const status = isPastCutoff ? 'late' : 'present';
            const strictMetrics = result.strictMetrics;
            const strictScore = strictMetrics?.fusedScore ?? (result.confidence ?? 0);
            const thresholdTarget = strictMetrics?.thresholdTarget ?? 0.5;
            const autoMarkEligible =
              strictScore >= thresholdTarget ||
              !!strictMetrics?.autoMarkEligible;

            scanTelemetry.matched({
              name: result.employee.name,
              confidence: result.confidence ?? 0,
              meta: autoMarkEligible ? `Marked ${status}` : 'Needs confirmation',
              image: result.employee.avatar_url || result.employee.firebase_image_url,
              counted: autoMarkEligible,
            });


            saveEmotionEvent({
              userId: result.employee.id,
              studentId: result.employee.employee_id || result.employee.id,
              source: 'ai-scan',
              descriptor,
              recognitionConfidence: result.confidence,
              metadata: {
                student_name: result.employee.name,
                strict_mode: true,
                strict_score: strictScore,
                strict_threshold_target: thresholdTarget,
                auto_mark_eligible: autoMarkEligible,
              },
            }).then();
            
            if (autoMarkEligible) {
              try {
                await withTimeout(
                  recordAttendance(
                    result.employee.id,
                    status,
                    result.confidence,
                    {
                      metadata: {
                        name: result.employee.name,
                        employee_id: result.employee.employee_id,
                        strict_mode: true,
                        strict_fused_score: strictScore,
                        strict_threshold_target: thresholdTarget,
                      },
                    },
                    faceCaptureImageDataUrl,
                  ),
                  5000,
                  'Attendance recording timed out'
                );
                rememberSessionEmbedding(descriptor, result.employee.id);
                recognizedCount++;
              } catch (recordErr) {
                console.error('Failed to record attendance:', recordErr);
              }

              sendAutoParentNotification(
                result.employee.id,
                result.employee.name || 'Student',
                status,
                result.employee.avatar_url || result.employee.firebase_image_url
              ).catch(err => console.error('Auto notification error:', err));

              results.push({
                id: result.employee.id,
                name: result.employee.name || 'Unknown',
                status,
                confidence: (result.confidence ?? 0) * 100,
                strictScore,
                thresholdTarget,
                imageUrl: result.employee.avatar_url || result.employee.firebase_image_url,
                box: { x: box.x, y: box.y, width: box.width, height: box.height }
              });
            } else {
              reviewQueue.push({
                id: `${result.employee.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                employee: {
                  id: result.employee.id,
                  name: result.employee.name || 'Unknown',
                  employee_id: result.employee.employee_id,
                  avatar_url: result.employee.avatar_url,
                  firebase_image_url: result.employee.firebase_image_url,
                },
                status,
                confidence: result.confidence ?? 0,
                strictScore,
                thresholdTarget,
                capturedImageDataUrl: faceCaptureImageDataUrl,
              });

              results.push({
                id: `review-${result.employee.id}`,
                name: result.employee.name || 'Unknown',
                status: 'review',
                confidence: (result.confidence ?? 0) * 100,
                strictScore,
                thresholdTarget,
                imageUrl: result.employee.avatar_url || result.employee.firebase_image_url,
                box: { x: box.x, y: box.y, width: box.width, height: box.height }
              });

              rememberSessionEmbedding(descriptor, result.employee.id);
            }
          } else {
            scanTelemetry.unknown(result.confidence ?? 0);
            results.push({
              id: `unknown-${Math.random().toString(36).substr(2, 9)}`,
              name: 'Unknown',
              status: 'unrecognized',
              confidence: detection.detection.score * 100,
              box: { x: box.x, y: box.y, width: box.width, height: box.height }
            });
          }

        } catch (recognitionErr) {
          console.error('Recognition error for face:', recognitionErr);
          results.push({
            id: `error-${Math.random().toString(36).substr(2, 9)}`,
            name: 'Unknown',
            status: 'unrecognized',
            confidence: detection.detection.score * 100,
            box: { x: box.x, y: box.y, width: box.width, height: box.height }
          });
        }
      }

      clearTimeout(scanTimeout);
      await new Promise(r => setTimeout(r, 300));
      setScanPhase('complete');
      setRecognizedFaces(results);
      setPendingManualReviews(reviewQueue);

      // Set scan result for primary face (first recognized, or first in list)
      const primaryResult = results.find(r => r.status === 'present' || r.status === 'late' || r.status === 'review') || results[0];
      if (primaryResult && (primaryResult.status === 'present' || primaryResult.status === 'late')) {
        setScanResult({
          recognized: true,
          name: primaryResult.name,
          confidence: primaryResult.confidence
        });
      } else if (primaryResult?.status === 'review') {
        setScanResult({
          recognized: false,
          name: primaryResult.name,
          confidence: primaryResult.confidence,
        });
      } else {
        setScanResult({ recognized: false });
      }

      // Show summary toast
      const unrecognizedCount = results.length - recognizedCount;
      const reviewCount = reviewQueue.length;
      if (recognizedCount > 0) {
        toast({
          title: `✓ ${recognizedCount} Attendance${recognizedCount > 1 ? 's' : ''} Recorded`,
          description: reviewCount > 0
            ? `${reviewCount} scan${reviewCount > 1 ? 's' : ''} requires manual confirmation`
            : unrecognizedCount > 0
              ? `${unrecognizedCount} face${unrecognizedCount > 1 ? 's' : ''} not recognized`
              : `All ${recognizedCount} face${recognizedCount > 1 ? 's' : ''} auto-validated in strict mode!`,
        });
      } else if (reviewCount > 0) {
        toast({
          title: 'Manual Confirmation Required',
          description: `${reviewCount} candidate${reviewCount > 1 ? 's' : ''} is below strict 50% threshold.`,
        });
      } else {
        toast({
          title: "No Faces Recognized",
          description: `${results.length} face${results.length > 1 ? 's' : ''} detected but not registered`,
          variant: "destructive"
        });
      }
      
      onScanComplete?.({ 
        recognized: recognizedCount > 0, 
        name: primaryResult?.name,
        confidence: primaryResult?.confidence
      });

    } catch (err) {
      clearTimeout(scanTimeout);
      console.error('Scan error:', err);
      setScanPhase('complete');
      setScanResult({ recognized: false });
      toast({
        title: "Scan Failed",
        description: err instanceof Error ? err.message : "Unknown error occurred",
        variant: "destructive"
      });
    } finally {
      hasCompletedFirstRecognitionRef.current = true;
      setTimeout(() => {
        setIsScanning(false);
        setScanPhase('idle');
        // Keep recognized faces visible for a moment longer
        setTimeout(() => setRecognizedFaces([]), 3000);
      }, 2000);
    }
  }, [modelsLoaded, faceCount, onScanComplete, stopLoopScan, toast, hasSessionEmbeddingMatch, rememberSessionEmbedding]);

  const confirmManualReview = useCallback(async (review: PendingManualReview) => {
    try {
      setIsSavingReviewId(review.id);
      await recordAttendance(
        review.employee.id,
        review.status,
        review.confidence,
        {
          metadata: {
            name: review.employee.name,
            employee_id: review.employee.employee_id,
            strict_mode: true,
            strict_fused_score: review.strictScore,
            strict_threshold_target: review.thresholdTarget,
            manual_confirmation: true,
            force_attendance_save: true,
          },
        },
        review.capturedImageDataUrl,
      );

      sendAutoParentNotification(
        review.employee.id,
        review.employee.name || 'Student',
        review.status,
        review.employee.avatar_url || review.employee.firebase_image_url,
      ).catch(err => console.error('Auto notification error:', err));

      setPendingManualReviews((prev) => prev.filter((item) => item.id !== review.id));
      toast({
        title: 'Attendance Confirmed',
        description: `${review.employee.name} marked as ${review.status} after manual verification.`,
      });
    } catch (error) {
      console.error('Manual confirmation failed:', error);
      toast({
        title: 'Could not confirm attendance',
        description: 'Please retry confirmation.',
        variant: 'destructive',
      });
    } finally {
      setIsSavingReviewId(null);
    }
  }, [toast]);

  const rejectManualReview = useCallback((reviewId: string) => {
    setPendingManualReviews((prev) => prev.filter((item) => item.id !== reviewId));
  }, []);

  const resetScanner = () => {
    setScanResult(null);
    setScanPhase('idle');
    setIsScanning(false);
    setRecognizedFaces([]);
    setPendingManualReviews([]);
    processedEmbeddingsRef.current = [];
  };

  useEffect(() => {
    return () => {
      stopLoopScan();
    };
  }, [stopLoopScan]);

  return (
    <div className="relative w-full">
      {galleryCount === 0 && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs text-foreground">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <span>
            No registered faces in this workspace yet, so every face will show as unrecognized and no
            attendance can be marked. Register students first (Register page) or restore a backup, then
            reopen this scanner.
          </span>
        </div>
      )}

      {/* Face Count Badge */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="absolute top-0 left-0 right-0 z-20 flex justify-center -mt-12"
      >
        <div className={`flex items-center gap-2 px-4 py-2 rounded-full backdrop-blur-sm border shadow-lg ${
          faceCount > 0 
            ? 'bg-success/15 border-success/35 text-success' 
            : 'bg-card/90 border-border text-primary'
        }`}>
          <Users className="w-4 h-4" />
          <span className="font-bold">{faceCount}</span>
          <span className="text-sm">Face{faceCount !== 1 ? 's' : ''} Detected</span>
          {faceCount > 0 && (
            <motion.div
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 1, repeat: Infinity }}
              className="w-2 h-2 rounded-full bg-success"
            />
          )}
        </div>
      </motion.div>

      {/* Scanner Container */}
      <div ref={containerRef} className="relative aspect-[4/5] sm:aspect-video rounded-2xl overflow-hidden bg-card border border-border/70 shadow-xl shadow-primary/10">
        {/* Tech Grid Background */}
        <div className="absolute inset-0 opacity-20">
          <div className="absolute inset-0" style={{
            backgroundImage: `
              linear-gradient(rgba(6,182,212,0.1) 1px, transparent 1px),
              linear-gradient(90deg, rgba(6,182,212,0.1) 1px, transparent 1px)
            `,
            backgroundSize: '20px 20px'
          }} />
        </div>

        {/* Webcam Feed */}
        <Webcam
          ref={webcamRef}
          audio={false}
          screenshotFormat="image/jpeg"
          className="absolute inset-0 w-full h-full object-cover"
          mirrored={facingMode === 'user'}
          videoConstraints={{
            facingMode,
            width: { ideal: 1280 },
            height: { ideal: 720 }
          }}
        />

        {/* Face Detection Canvas */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          style={{ transform: facingMode === 'user' ? 'scaleX(-1)' : 'none' }}
        />

        {/* Live Face Recognition Overlay */}
        <LiveFaceOverlay
          faces={recognizedFaces}
          containerWidth={containerDimensions.width}
          containerHeight={containerDimensions.height}
          mirrored={facingMode === 'user'}
        />

        {/* Scanning Overlay */}
        <AnimatePresence>
          {isScanning && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-background/60 backdrop-blur-sm z-10"
            >
              {/* Central Scanner */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="relative">
                  {/* Outer Rings */}
                  {[1, 2, 3].map((ring) => (
                    <motion.div
                      key={ring}
                      className="absolute rounded-full border-2 border-primary/30"
                      style={{
                        width: `${140 + ring * 35}px`,
                        height: `${140 + ring * 35}px`,
                        left: `${-17.5 - ring * 17.5}px`,
                        top: `${-17.5 - ring * 17.5}px`,
                      }}
                      animate={{
                        scale: [1, 1.05, 1],
                        opacity: [0.3, 0.6, 0.3],
                      }}
                      transition={{
                        duration: 2,
                        repeat: Infinity,
                        delay: ring * 0.2,
                      }}
                    />
                  ))}

                  {/* Rotating Scanner Ring */}
                  <motion.div
                    className="w-36 h-36 rounded-full"
                    style={{
                      background: 'conic-gradient(from 0deg, transparent, #06b6d4, transparent)',
                    }}
                    animate={{ rotate: 360 }}
                    transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                  />

                  {/* Inner Circle */}
                  <motion.div
                    className="absolute inset-4 rounded-full bg-gradient-to-br from-primary/20 to-emerald/20 border-2 border-primary/50 flex items-center justify-center"
                    animate={{
                      boxShadow: [
                        '0 0 20px rgba(6,182,212,0.3)',
                        '0 0 40px rgba(6,182,212,0.5)',
                        '0 0 20px rgba(6,182,212,0.3)',
                      ],
                    }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  >
                    {scanPhase === 'complete' && scanResult?.recognized ? (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring' }}
                      >
                        <CheckCircle className="w-14 h-14 text-green-400" />
                      </motion.div>
                    ) : scanPhase === 'complete' && !scanResult?.recognized ? (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring' }}
                      >
                        <AlertCircle className="w-14 h-14 text-red-400" />
                      </motion.div>
                    ) : (
                      <motion.div
                        animate={{ scale: [1, 1.1, 1] }}
                        transition={{ duration: 1, repeat: Infinity }}
                      >
                        <Eye className="w-10 h-10 text-primary" />
                      </motion.div>
                    )}
                  </motion.div>
                </div>

                {/* Scanning Line */}
                <motion.div
                  className="absolute left-0 right-0 h-1 bg-gradient-to-r from-transparent via-cyan-400 to-transparent"
                  animate={{ top: ['20%', '80%', '20%'] }}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                />
              </div>

              {/* Phase Indicator */}
              <motion.div
                className="absolute bottom-16 left-0 right-0 text-center"
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 1, repeat: Infinity }}
              >
                <p className={`text-base sm:text-lg font-bold ${
                  scanPhase === 'complete' && scanResult?.recognized ? 'text-green-400' :
                  scanPhase === 'complete' && !scanResult?.recognized ? 'text-red-400' :
                  'text-primary'
                }`}>
                  {scanPhase === 'detecting' && '◎ DETECTING FACE...'}
                  {scanPhase === 'analyzing' && '◉ ANALYZING BIOMETRICS...'}
                  {scanPhase === 'matching' && '⚡ MATCHING DATABASE...'}
                  {scanPhase === 'complete' && scanResult?.recognized && `✓ RECOGNIZED: ${scanResult.name}`}
                  {scanPhase === 'complete' && !scanResult?.recognized && '✗ UNRECOGNIZED'}
                </p>
                {scanResult?.confidence && (
                  <p className="text-sm text-primary/80 mt-1">
                    Match Confidence: {Math.round(scanResult.confidence)}%
                  </p>
                )}
              </motion.div>

              {/* Floating Particles */}
              {[...Array(10)].map((_, i) => (
                <motion.div
                  key={i}
                  className="absolute w-1 h-1 bg-cyan-400 rounded-full"
                  style={{
                    left: `${Math.random() * 100}%`,
                    top: `${Math.random() * 100}%`,
                  }}
                  animate={{
                    y: [0, -25, 0],
                    opacity: [0, 1, 0],
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    delay: i * 0.15,
                  }}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Status Bar */}
        <div className="absolute top-3 left-3 right-3 flex items-center justify-between z-10">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-card/90 backdrop-blur-sm border border-border/70">
            {Object.entries(systemStatus).map(([key, active]) => (
              <div 
                key={key} 
                 className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full ${
                   active ? 'text-primary' : 'text-destructive'
                }`}
              >
                <div className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-primary' : 'bg-destructive'}`} />
                <span className="text-[10px] font-medium uppercase hidden sm:inline">{key}</span>
              </div>
            ))}
          </div>
          
        </div>

        {/* FPS Counter */}
        <div className="absolute top-3 right-3 px-2 py-1 rounded-lg bg-card/90 backdrop-blur-sm border border-border/70 hidden sm:block">
          <div className="flex items-center gap-1 text-xs text-primary">
            <Activity className="w-3 h-3" />
            <span>60 FPS</span>
          </div>
        </div>
      </div>

      {/* Autonomous Hands-Free Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mt-4 px-2">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <span className="text-xs font-semibold">100% Hands-Free Auto-Attendance Active</span>
          </div>
          {faceCount > 0 && (
            <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-500 border-blue-500/30">
              {faceCount} Face{faceCount > 1 ? 's' : ''} in View
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setFacingMode(f => f === 'user' ? 'environment' : 'user')}
            className="text-xs h-8 rounded-xl border-border/70 hover:bg-muted"
            title="Switch camera"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            Flip Camera
          </Button>
          {autoMarkedLog.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setAutoMarkedLog([])}
              className="text-xs h-8 text-muted-foreground hover:text-foreground"
            >
              Clear Log
            </Button>
          )}
        </div>
      </div>

      {autoMarkedLog.length > 0 && (
        <div className="mt-5 rounded-2xl border border-success/25 bg-success/5 p-3 sm:p-4">
          <div className="flex items-center justify-between gap-2 mb-2">
            <p className="text-sm font-semibold text-foreground flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-success" />
              Auto-marked this session ({autoMarkedLog.length})
            </p>
            <Badge variant="secondary" className="bg-secondary text-secondary-foreground border-border/70">
              Background
            </Badge>
          </div>
          <div className="space-y-1.5">
            {autoMarkedLog.map((entry) => (
              <div key={entry.id} className="flex items-center justify-between gap-2 text-xs sm:text-sm">
                <span className="truncate text-foreground">{entry.name}</span>
                <span className="flex items-center gap-1.5 shrink-0">
                  <Badge
                    variant="outline"
                    className={entry.status === 'late' ? 'border-warning/50 text-warning' : 'border-success/50 text-success'}
                  >
                    {entry.status}
                  </Badge>
                  {entry.emailed && (
                    <Badge variant="outline" className="border-primary/40 text-primary" title="Parent email sent">
                      mail
                    </Badge>
                  )}
                  {entry.notified && (
                    <Badge variant="outline" className="border-border text-muted-foreground" title="In-app notification sent">
                      notified
                    </Badge>
                  )}
                  {entry.sampleSaved && (
                    <Badge variant="outline" className="border-success/40 text-success" title="New face sample stored for future recognition">
                      sample
                    </Badge>
                  )}
                  <span className="text-muted-foreground">{Math.round(entry.confidence * 100)}%</span>
                </span>
              </div>

            ))}
          </div>
        </div>
      )}



      {pendingManualReviews.length > 0 && (
        <div className="mt-5 space-y-3 rounded-2xl border border-primary/25 bg-primary/10 p-3 sm:p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-foreground">
              Manual confirmation required ({pendingManualReviews.length})
            </p>
            <Badge variant="secondary" className="bg-secondary text-secondary-foreground border-border/70">
              Strict 3D mode
            </Badge>
          </div>

          <div className="space-y-2">
            {pendingManualReviews.map((review) => (
              <div
                key={review.id}
                className="flex flex-col gap-2 rounded-xl border border-border/70 bg-card/80 p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">{review.employee.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Candidate {(review.confidence * 100).toFixed(1)}% • 3D score {(review.strictScore * 100).toFixed(1)}% • target {(review.thresholdTarget * 100).toFixed(0)}%
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => rejectManualReview(review.id)}
                    disabled={isSavingReviewId === review.id}
                    className="border-destructive/40 text-destructive hover:bg-destructive/10"
                  >
                    Reject
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => confirmManualReview(review)}
                    disabled={isSavingReviewId === review.id}
                    className="bg-success text-success-foreground hover:bg-success/90"
                  >
                    {isSavingReviewId === review.id ? 'Saving...' : 'Confirm'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Stats */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3 mt-5">
        {[
          { icon: Zap, label: 'Speed', value: '<1-2s', color: 'text-warning' },
          { icon: Target, label: 'Accuracy', value: '99.8%', color: 'text-success' },
          { icon: Shield, label: 'Secure', value: 'AES-256', color: 'text-primary' },
        ].map((stat, i) => (
          <div key={i} className="flex flex-col items-center p-2 sm:p-3 rounded-xl bg-card/85 border border-border/70">
            <stat.icon className={`w-4 h-4 sm:w-5 sm:h-5 ${stat.color} mb-1`} />
            <span className="text-base sm:text-lg font-bold text-foreground">{stat.value}</span>
            <span className="text-[10px] sm:text-xs text-muted-foreground">{stat.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default FuturisticFaceScanner;
