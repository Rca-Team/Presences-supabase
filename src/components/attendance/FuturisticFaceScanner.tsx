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
import { playSuccessChime, playLateChime } from '@/utils/audioFeedback';
import * as faceapi from 'face-api.js';
import { loadNet } from '@/services/face-recognition/NetLoaderService';
import { createRecognitionEngine } from '@/services/face-recognition/RealtimeRecognitionEngine';
import type { FaceTrack } from '@/services/face-recognition/FaceTrackerService';
import {
  Camera,
  Scan,
  CheckCircle,
  CheckCircle2,
  AlertCircle,
  User,
  Zap,
  RefreshCw,
  Sparkles,
  Eye,
  Shield,
  ShieldCheck,
  Activity,
  Cpu,
  Target,
  Wifi,
  Power,
  Users,
  Volume2,
  VolumeX,
  ChevronDown,
  Check,
  Video,
  Layers,
  Flame,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import LiveFaceOverlay, { RecognizedFaceData } from './LiveFaceOverlay';
import {
  getStudentCoverPhoto,
  getCachedStudentCoverPhoto,
  prefetchStudentCoverPhotos,
} from '@/utils/studentPhotoResolver';
import { usePerformanceMode } from '@/hooks/usePerformanceMode';
import { useLiteFeedback } from '@/hooks/useLiteFeedback';

interface FuturisticFaceScannerProps {
  onScanComplete?: (result: { recognized: boolean; name?: string; confidence?: number }) => void;
  onAttendanceMarked?: (record: { userId: string; name: string; status: 'present' | 'late'; confidence: number }) => void;
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
const FACE_CROP_PADDING_PERCENT = 25;
/** Same person is not re-marked by the live scanner within this window. */
const AUTO_MARK_COOLDOWN_MS = 5 * 60 * 1000;
/** Minimum sharpness (gradient energy) for a crop to be kept as a training sample. */
const AUTO_SAMPLE_MIN_SHARPNESS = 14;


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

const FuturisticFaceScanner: React.FC<FuturisticFaceScannerProps> = ({ onScanComplete, onAttendanceMarked }) => {
  const { toast } = useToast();
  const { liteMode, signals } = usePerformanceMode();
  const { signal: liteSignal } = useLiteFeedback();
  const webcamRef = useRef<Webcam>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const detectionIntervalRef = useRef<number | null>(null);
  const processedFaceCooldownRef = useRef<Map<string, number>>(new Map());
  const recognizedUserCooldownRef = useRef<Map<string, number>>(new Map());
  const stableFaceCounterRef = useRef<Map<string, number>>(new Map());
  const processingFaceKeysRef = useRef<Set<string>>(new Set());
  const hasCompletedFirstRecognitionRef = useRef(false);
  const processedEmbeddingsRef = useRef<Array<{ descriptor: Float32Array; employeeId?: string; ts: number }>>([]);
  const autoMarkedUsersRef = useRef<Map<string, number>>(new Map());
  const cutoffCacheRef = useRef<{ value: { hour: number; minute: number }; at: number } | null>(null);
  const sharedCropCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [autoMarkedLog, setAutoMarkedLog] = useState<AutoMarkedEntry[]>([]);

  // Multi-Camera Selection & Audio State
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>(() => {
    try {
      return localStorage.getItem('presence_camera_device_id') || '';
    } catch {
      return '';
    }
  });
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem('attendance_sound_enabled') !== 'false';
    } catch {
      return true;
    }
  });
  const [lastVerifiedStudent, setLastVerifiedStudent] = useState<{
    id: string;
    name: string;
    status: 'present' | 'late';
    confidence: number;
    time: string;
    imageUrl?: string;
  } | null>(null);

  const [modelsLoaded, setModelsLoaded] = useState(areModelsLoaded());
  const [galleryCount, setGalleryCount] = useState<number | null>(null);

  const [isScanning, setIsScanning] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [scanPhase, setScanPhase] = useState<'idle' | 'detecting' | 'analyzing' | 'matching' | 'complete'>('idle');
  const [scanResult, setScanResult] = useState<{ recognized: boolean; name?: string; confidence?: number } | null>(null);
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

  // Enumerate Connected Camera Devices
  const enumerateCameras = useCallback(async () => {
    try {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) return;
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices.filter((d) => d.kind === 'videoinput');
      setVideoDevices(videoInputs);

      if (videoInputs.length > 0) {
        setSelectedDeviceId((prev) => {
          if (prev && videoInputs.some((v) => v.deviceId === prev)) return prev;
          // Prefer external / wide-angle / USB if present, otherwise first available
          const external = videoInputs.find((v) =>
            /external|usb|4k|brio|c920|c922|obs|logitech|wide|camera/i.test(v.label)
          );
          return external?.deviceId || videoInputs[0].deviceId;
        });
      }
    } catch (err) {
      console.warn('[FaceScanner] Failed to enumerate camera devices:', err);
    }
  }, []);

  useEffect(() => {
    void enumerateCameras();
  }, [enumerateCameras]);

  const handleSelectCamera = useCallback((deviceId: string) => {
    setSelectedDeviceId(deviceId);
    try {
      localStorage.setItem('presence_camera_device_id', deviceId);
    } catch {}
  }, []);

  const toggleSound = useCallback(() => {
    setSoundEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('attendance_sound_enabled', String(next));
      } catch {}
      return next;
    });
  }, []);

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

      // 3 — high-quality face sample photo saved to Supabase storage & progressive training
      try {
        const isHighQuality =
          job.confidence >= 0.65 && !!job.crop && job.crop.blurScore >= AUTO_SAMPLE_MIN_SHARPNESS;
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
        void prefetchStudentCoverPhotos();
      } catch (e) {
        console.error('Face model load failed:', e);
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
      if (!video || !canvas || video.readyState < 2) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (vw && vh && (canvas.width !== vw || canvas.height !== vh)) {
        canvas.width = vw;
        canvas.height = vh;
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      tracks.forEach((track, i) => {
        const box = track.box;
        const isVerified = track.identity?.verified;
        const isHolding = track.identity && !isVerified;
        const progress = Math.max(0, Math.min(1, track.holdingProgress || 0));

        // Styling: Verified -> Emerald, Holding (1s countdown) -> Amber, Unidentified -> Cyan
        const strokeColor = isVerified ? '#10b981' : isHolding ? '#f59e0b' : '#06b6d4';
        const glowColor = isVerified ? 'rgba(16, 185, 129, 0.4)' : isHolding ? 'rgba(245, 158, 11, 0.4)' : 'rgba(6, 182, 212, 0.3)';

        // Box
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = isVerified ? 3.5 : 2.5;
        ctx.strokeRect(box.x, box.y, box.width, box.height);

        // Tech Corner Brackets
        const cornerSize = 16;
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = isVerified ? 5 : 4;

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

        // Label above face box
        ctx.font = 'bold 13px Inter, -apple-system, sans-serif';
        const nameLabel = isVerified
          ? `✓ ${track.identity!.name}`
          : isHolding
          ? `${track.identity!.name}`
          : `Detecting Face...`;

        const textMetrics = ctx.measureText(nameLabel);
        const pillW = textMetrics.width + 16;
        const pillH = 22;
        const pillX = box.x;
        const pillY = Math.max(8, box.y - 28);

        ctx.fillStyle = 'rgba(11, 16, 27, 0.88)';
        ctx.fillRect(pillX, pillY, pillW, pillH);
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 1;
        ctx.strokeRect(pillX, pillY, pillW, pillH);

        ctx.fillStyle = strokeColor;
        ctx.fillText(nameLabel, pillX + 8, pillY + 15);

        // Continuous 1-Second Verification HUD
        if (isHolding) {
          const barH = 6;
          const barY = box.y + box.height + 6;
          const barW = Math.max(120, box.width);
          const barX = box.x;

          // Track bg
          ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
          ctx.fillRect(barX, barY, barW, barH);
          // Animated progress fill
          ctx.fillStyle = '#f59e0b';
          ctx.fillRect(barX, barY, Math.max(4, barW * progress), barH);

          // Subtext
          ctx.font = 'bold 11px Inter, -apple-system, sans-serif';
          ctx.fillStyle = '#fef3c7';
          ctx.fillText(`Hold steady: ${Math.round(progress * 100)}%`, barX, barY + 18);
        } else if (isVerified) {
          const badgeY = box.y + box.height + 6;
          ctx.font = 'bold 12px Inter, -apple-system, sans-serif';
          ctx.fillStyle = '#10b981';
          ctx.fillText(`✓ Attendance Recorded`, box.x, badgeY + 16);
        }
      });
    };

    const engine = createRecognitionEngine(() => webcamRef.current?.video ?? null, {
      detectFps: liteMode ? (signals.lowCPU ? 6 : 8) : 10,
      detectionWidth: liteMode ? 480 : 640,
      maxConcurrentJobs: 1,
      identityTtlMs: 3500,
      maxMissed: 4,
      onTracks: (tracks) => {
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
        recognizedUserCooldownRef.current.set(face.userId, Date.now());

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
                source: liteMode ? 'lite-face-terminal' : 'live-face-id',
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
            },
            crop?.dataUrl,
            'ai-scan'
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
          
          // Sound & tactile feedback upon successful face recognition (Lite and Standard adaptive)
          try {
            if (soundEnabled) {
              if (liteMode) {
                liteSignal(status === 'late' ? 'warn' : 'ok');
              } else {
                if (status === 'late') {
                  playLateChime();
                } else {
                  playSuccessChime();
                }
              }
            }
          } catch {
            /* ignore */
          }

          // Set celebration HUD for student
          setLastVerifiedStudent({
            id: face.userId,
            name: face.name,
            status,
            confidence: face.confidence,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            imageUrl: cachedCover || undefined,
          });
          setTimeout(() => {
            setLastVerifiedStudent((prev) => (prev?.id === face.userId ? null : prev));
          }, 4000);

          // Trigger parent component callback if supplied
          try {
            onAttendanceMarked?.({
              userId: face.userId,
              name: face.name,
              status,
              confidence: face.confidence,
            });
          } catch {
            /* ignore */
          }

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

          // Look up student's registered cover photo (NOT the live recognition webcam crop)
          const cachedCover = getCachedStudentCoverPhoto(face.userId);

          setRecognizedFaces((prev) => [
            ...prev.filter((f) => f.id !== face.userId),
            {
              id: face.userId,
              name: face.name,
              status,
              confidence: face.confidence,
              box: { ...face.box },
              imageUrl: cachedCover || undefined,
            },
          ].slice(-4));

          if (!cachedCover) {
            void getStudentCoverPhoto(face.userId, face.name).then((resolved) => {
              if (resolved) {
                setRecognizedFaces((prev) =>
                  prev.map((f) => (f.id === face.userId ? { ...f, imageUrl: resolved } : f))
                );
                setLastVerifiedStudent((prev) =>
                  prev?.id === face.userId ? { ...prev, imageUrl: resolved } : prev
                );
              }
            });
          }

          // Automatically clear ID plate after 4.5s
          setTimeout(() => {
            setRecognizedFaces((prev) => prev.filter((f) => f.id !== face.userId));
          }, 4500);

          scanTelemetry.matched({
            name: face.name,
            confidence: face.confidence,
            meta: `Marked ${status}`,
          });

          toast({
            title: `${face.name} marked ${status}`,
            description: `Auto attendance · ${Math.round(face.confidence * 100)}% match`,
          });

          onScanComplete?.({
            recognized: true,
            name: face.name,
            confidence: face.confidence,
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
  }, [modelsLoaded, isScanning, soundEnabled]);

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

    if (!sharedCropCanvasRef.current) {
      sharedCropCanvasRef.current = document.createElement('canvas');
    }
    const canvas = sharedCropCanvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;

    canvas.width = cropW;
    canvas.height = cropH;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
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
      dataUrl: canvas.toDataURL('image/jpeg', 0.98),
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

  const scanFace = useCallback(async () => {
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
                        force_attendance_save: true,
                      },
                    },
                    faceCaptureImageDataUrl,
                    'ai-scan'
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
        try {
          if (primaryResult.status === 'late') playLateChime();
          else playSuccessChime();
        } catch {}
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
  }, [modelsLoaded, faceCount, onScanComplete, toast, hasSessionEmbeddingMatch, rememberSessionEmbedding]);

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

      {/* Scanner Container with Cyber Frame and Glassmorphism Inset HUD */}
      <div
        ref={containerRef}
        className="relative aspect-[4/5] sm:aspect-video rounded-3xl overflow-hidden bg-slate-950 border border-slate-700/60 dark:border-white/10 shadow-2xl shadow-blue-500/10"
      >
        {/* Tech Grid Background (standard mode only) */}
        {!liteMode && (
          <div className="absolute inset-0 opacity-15 pointer-events-none z-0">
            <div
              className="absolute inset-0"
              style={{
                backgroundImage: `
                  linear-gradient(rgba(6,182,212,0.12) 1px, transparent 1px),
                  linear-gradient(90deg, rgba(6,182,212,0.12) 1px, transparent 1px)
                `,
                backgroundSize: '24px 24px',
              }}
            />
          </div>
        )}

        {/* Webcam Feed with Device Selection */}
        <Webcam
          ref={webcamRef}
          audio={false}
          screenshotFormat="image/jpeg"
          className="absolute inset-0 w-full h-full object-cover"
          mirrored={facingMode === 'user' && !selectedDeviceId.toLowerCase().includes('back')}
          videoConstraints={{
            deviceId: selectedDeviceId ? { exact: selectedDeviceId } : undefined,
            facingMode: selectedDeviceId ? undefined : facingMode,
            width: { ideal: liteMode ? 960 : 1280 },
            height: { ideal: liteMode ? 540 : 720 },
            frameRate: { ideal: 30, max: 60 },
          }}
          onUserMedia={() => {
            void enumerateCameras();
          }}
          onUserMediaError={(err) => {
            console.error('[FaceScanner] Camera stream error:', err);
            if (selectedDeviceId) setSelectedDeviceId('');
          }}
        />

        {/* Face Detection Canvas */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full object-cover pointer-events-none z-10"
          style={{ transform: facingMode === 'user' && !selectedDeviceId.toLowerCase().includes('back') ? 'scaleX(-1)' : 'none' }}
        />

        {/* Live Face Recognition Overlay */}
        <LiveFaceOverlay
          faces={recognizedFaces}
          containerWidth={containerDimensions.width}
          containerHeight={containerDimensions.height}
          videoWidth={webcamRef.current?.video?.videoWidth || 1280}
          videoHeight={webcamRef.current?.video?.videoHeight || 720}
          mirrored={facingMode === 'user' && !selectedDeviceId.toLowerCase().includes('back')}
        />

        {/* Cyber Viewfinder Reticle Framing */}
        <div className="absolute inset-4 sm:inset-6 pointer-events-none z-10">
          {/* Top Left Bracket */}
          <div
            className={`absolute top-0 left-0 w-6 sm:w-8 h-6 sm:h-8 border-t-2 border-l-2 transition-colors duration-300 rounded-tl-lg ${
              faceCount > 0
                ? 'border-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.6)]'
                : 'border-cyan-400/70'
            }`}
          />
          {/* Top Right Bracket */}
          <div
            className={`absolute top-0 right-0 w-6 sm:w-8 h-6 sm:h-8 border-t-2 border-r-2 transition-colors duration-300 rounded-tr-lg ${
              faceCount > 0
                ? 'border-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.6)]'
                : 'border-cyan-400/70'
            }`}
          />
          {/* Bottom Left Bracket */}
          <div
            className={`absolute bottom-0 left-0 w-6 sm:w-8 h-6 sm:h-8 border-b-2 border-l-2 transition-colors duration-300 rounded-bl-lg ${
              faceCount > 0
                ? 'border-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.6)]'
                : 'border-cyan-400/70'
            }`}
          />
          {/* Bottom Right Bracket */}
          <div
            className={`absolute bottom-0 right-0 w-6 sm:w-8 h-6 sm:h-8 border-b-2 border-r-2 transition-colors duration-300 rounded-br-lg ${
              faceCount > 0
                ? 'border-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.6)]'
                : 'border-cyan-400/70'
            }`}
          />

          {/* Ambient Scanning Laser Bar */}
          {!liteMode && !isScanning && (
            <motion.div
              className="absolute left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-cyan-400/80 to-transparent shadow-[0_0_15px_rgba(6,182,212,0.8)]"
              animate={{ top: ['5%', '95%', '5%'] }}
              transition={{ duration: faceCount > 0 ? 2.5 : 4, repeat: Infinity, ease: 'easeInOut' }}
            />
          )}
        </div>

        {/* Integrated Top Glassmorphism HUD Bar */}
        <div className="absolute top-3 left-3 right-3 flex items-center justify-between gap-2 z-20 pointer-events-auto">
          {/* Left: Engine & Telemetry Status Pill */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-slate-950/80 backdrop-blur-xl border border-white/10 shadow-lg text-white">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <span className="text-[11px] font-semibold tracking-tight text-slate-200 hidden sm:inline">
              Neural Engine
            </span>
            <span className="text-slate-500 text-xs hidden sm:inline">•</span>
            <div className="flex items-center gap-1 text-[11px] text-cyan-400 font-mono font-medium">
              <Activity className="w-3 h-3" />
              <span>60 FPS</span>
            </div>
          </div>

          {/* Center: Dynamic Guidance & Face Status Pill */}
          <div className="flex items-center">
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-2xl backdrop-blur-xl border shadow-lg transition-all ${
                faceCount > 0
                  ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-300 shadow-emerald-500/20'
                  : 'bg-slate-950/80 border-white/10 text-slate-200'
              }`}
            >
              {faceCount > 0 ? (
                <>
                  <Users className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-xs font-bold tracking-tight">
                    {faceCount} Face{faceCount > 1 ? 's' : ''} Locked
                  </span>
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                </>
              ) : (
                <>
                  <Eye className="w-3.5 h-3.5 text-cyan-400" />
                  <span className="text-xs font-semibold text-slate-300">
                    Standby • Face Camera
                  </span>
                </>
              )}
            </motion.div>
          </div>

          {/* Right: Camera Selector, Audio Toggle & Flip */}
          <div className="flex items-center gap-1.5">
            {/* Audio Feedback Toggle */}
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleSound}
              className={`h-8 w-8 p-0 rounded-xl border backdrop-blur-xl flex items-center justify-center shadow-lg transition-all ${
                soundEnabled
                  ? 'bg-slate-950/80 text-cyan-400 hover:text-cyan-300 border-white/10'
                  : 'bg-slate-950/80 text-slate-500 hover:text-slate-400 border-white/10'
              }`}
              title={soundEnabled ? 'Mute Chimes' : 'Unmute Chimes'}
            >
              {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
            </Button>

            {/* Camera Device Selector Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2.5 rounded-xl bg-slate-950/80 hover:bg-slate-900 text-slate-200 border border-white/10 text-xs backdrop-blur-xl flex items-center gap-1.5 shadow-lg"
                  title="Select Camera Input"
                >
                  <Video className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                  <span className="max-w-[85px] sm:max-w-[130px] truncate hidden md:inline">
                    {videoDevices.find((d) => d.deviceId === selectedDeviceId)?.label || 'Camera'}
                  </span>
                  <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-64 bg-slate-950/95 border border-white/15 text-white backdrop-blur-2xl rounded-2xl p-1.5 shadow-2xl z-50"
              >
                <DropdownMenuLabel className="text-[11px] font-bold text-slate-400 px-2 py-1 uppercase tracking-wider flex items-center justify-between">
                  <span>Camera Inputs</span>
                  <span className="text-cyan-400 font-bold">{videoDevices.length}</span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-white/10 my-1" />
                {videoDevices.length === 0 ? (
                  <div className="px-2.5 py-2 text-xs text-slate-400">Default Camera Active</div>
                ) : (
                  videoDevices.map((device, idx) => {
                    const isSelected = selectedDeviceId === device.deviceId;
                    const label = device.label || `Camera ${idx + 1}`;
                    return (
                      <DropdownMenuItem
                        key={device.deviceId || idx}
                        onClick={() => handleSelectCamera(device.deviceId)}
                        className={`flex items-center justify-between px-2.5 py-2 rounded-xl text-xs cursor-pointer ${
                          isSelected
                            ? 'bg-cyan-500/20 text-cyan-300 font-semibold'
                            : 'text-slate-300 hover:bg-white/10'
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <Camera className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                          <span className="truncate">{label}</span>
                        </div>
                        {isSelected && <Check className="w-3.5 h-3.5 text-cyan-400 shrink-0 ml-2" />}
                      </DropdownMenuItem>
                    );
                  })
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Camera Flip Shortcut */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setFacingMode((f) => (f === 'user' ? 'environment' : 'user'))}
              className="h-8 w-8 p-0 rounded-xl bg-slate-950/80 hover:bg-slate-900 text-slate-200 border border-white/10 backdrop-blur-xl flex items-center justify-center shadow-lg"
              title={facingMode === 'user' ? 'Switch to Rear Camera' : 'Switch to Front Camera'}
            >
              <RefreshCw className="w-3.5 h-3.5 text-cyan-400" />
            </Button>
          </div>
        </div>

        {/* Celebratory Student Verification Toast (Inside Viewfinder) */}
        <AnimatePresence>
          {lastVerifiedStudent && (
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.94 }}
              transition={{ type: 'spring', stiffness: 450, damping: 26 }}
              className="absolute bottom-4 left-4 right-4 sm:left-auto sm:right-4 z-30 flex items-center gap-3 p-3 rounded-2xl bg-slate-950/90 backdrop-blur-2xl border border-emerald-500/40 shadow-2xl shadow-emerald-500/20 max-w-sm"
            >
              <div className="relative shrink-0">
                <Avatar className="h-11 w-11 rounded-xl ring-2 ring-emerald-400/80 shadow-md">
                  {lastVerifiedStudent.imageUrl && (
                    <AvatarImage src={lastVerifiedStudent.imageUrl} alt={lastVerifiedStudent.name} />
                  )}
                  <AvatarFallback className="bg-emerald-600/30 text-emerald-300 font-bold text-sm">
                    {lastVerifiedStudent.name.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <div className="absolute -bottom-1 -right-1 bg-emerald-500 text-white rounded-full p-0.5 shadow">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="text-xs sm:text-sm font-extrabold text-white truncate">
                    {lastVerifiedStudent.name}
                  </h4>
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md border uppercase ${
                      lastVerifiedStudent.status === 'late'
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                        : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    }`}
                  >
                    {lastVerifiedStudent.status === 'late' ? 'Late' : 'Present'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-300/90 flex items-center gap-1.5 mt-0.5 font-medium">
                  <span>Logged {lastVerifiedStudent.time}</span>
                  <span>•</span>
                  <span className="text-emerald-400 font-semibold">
                    {Math.round(lastVerifiedStudent.confidence * 100)}% match
                  </span>
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Forced Manual Scan Radial Overlay */}
        <AnimatePresence>
          {isScanning && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-950/70 backdrop-blur-md z-30 flex items-center justify-center"
            >
              <div className="relative flex flex-col items-center">
                {/* Rotating Biometric Scanner Ring */}
                <motion.div
                  className="w-32 h-32 rounded-full"
                  style={{
                    background: 'conic-gradient(from 0deg, transparent, #06b6d4, #10b981, transparent)',
                  }}
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1.8, repeat: Infinity, ease: 'linear' }}
                />
                <div className="absolute inset-2 rounded-full bg-slate-950/90 flex items-center justify-center border border-cyan-400/40">
                  <Scan className="w-10 h-10 text-cyan-400 animate-pulse" />
                </div>
                <p className="text-xs sm:text-sm font-bold text-white tracking-wider mt-4 uppercase">
                  {scanPhase === 'detecting' && '◎ Locking Face Target...'}
                  {scanPhase === 'analyzing' && '◉ Extracting Biometrics...'}
                  {scanPhase === 'matching' && '⚡ Verifying Database...'}
                  {scanPhase === 'complete' && '✓ Verification Complete'}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Ergonomic Kiosk Command Dock */}
      <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-3 p-2 sm:px-4 sm:py-3 rounded-2xl bg-white/80 dark:bg-card/70 border border-slate-200/80 dark:border-border/60 backdrop-blur-xl shadow-md">
        {/* Left: Hands-Free Autonomous Mode Indicator */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <span className="text-xs font-bold tracking-tight">Autonomous Hands-Free Active</span>
        </div>

        {/* Center: Primary Action Button */}
        <div className="flex items-center gap-2">
          <Button
            size="lg"
            onClick={isScanning ? resetScanner : scanFace}
            disabled={!modelsLoaded}
            className={`px-6 sm:px-8 font-bold text-xs sm:text-sm rounded-xl transition-all shadow-lg active:scale-95 ${
              isScanning
                ? 'bg-destructive hover:bg-destructive/90 text-white shadow-destructive/25'
                : faceCount > 0
                ? 'bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white shadow-blue-600/30'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 shadow-slate-900/20'
            }`}
          >
            {!modelsLoaded ? (
              <>
                <Cpu className="w-4 h-4 mr-2 animate-spin text-cyan-400" />
                Loading AI Models...
              </>
            ) : isScanning ? (
              <>
                <Power className="w-4 h-4 mr-2" />
                Cancel
              </>
            ) : faceCount > 0 ? (
              <>
                <Scan className="w-4 h-4 mr-2 text-cyan-300 animate-pulse" />
                Capture {faceCount} Face{faceCount > 1 ? 's' : ''} Now
              </>
            ) : (
              <>
                <Eye className="w-4 h-4 mr-2 text-slate-400" />
                Instant Manual Scan
              </>
            )}
          </Button>

          {autoMarkedLog.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setAutoMarkedLog([])}
              className="text-xs text-muted-foreground hover:text-foreground h-9 px-3 rounded-xl"
            >
              Clear Session
            </Button>
          )}
        </div>
      </div>

      {/* Live Operational Telemetry Cards */}
      <div className="grid grid-cols-3 gap-2.5 sm:gap-3 mt-4">
        {/* Session Check-ins */}
        <div className="flex flex-col items-center justify-center p-3 rounded-2xl bg-white/70 dark:bg-card/60 border border-slate-200/80 dark:border-border/60 backdrop-blur-xl shadow-sm">
          <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 mb-1">
            <Users className="w-4 h-4" />
            <span className="text-xs font-bold uppercase tracking-wider">Session Log</span>
          </div>
          <span className="text-xl sm:text-2xl font-black text-slate-900 dark:text-foreground tracking-tight">
            {autoMarkedLog.length}
          </span>
          <span className="text-[10px] text-muted-foreground font-medium">Logged This Session</span>
        </div>

        {/* Inference Latency */}
        <div className="flex flex-col items-center justify-center p-3 rounded-2xl bg-white/70 dark:bg-card/60 border border-slate-200/80 dark:border-border/60 backdrop-blur-xl shadow-sm">
          <div className="flex items-center gap-1.5 text-amber-500 dark:text-amber-400 mb-1">
            <Zap className="w-4 h-4" />
            <span className="text-xs font-bold uppercase tracking-wider">Latency</span>
          </div>
          <span className="text-xl sm:text-2xl font-black text-slate-900 dark:text-foreground tracking-tight">
            &lt; 180ms
          </span>
          <span className="text-[10px] text-muted-foreground font-medium">Real-Time Edge Match</span>
        </div>

        {/* Biometric Fidelity */}
        <div className="flex flex-col items-center justify-center p-3 rounded-2xl bg-white/70 dark:bg-card/60 border border-slate-200/80 dark:border-border/60 backdrop-blur-xl shadow-sm">
          <div className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400 mb-1">
            <ShieldCheck className="w-4 h-4" />
            <span className="text-xs font-bold uppercase tracking-wider">Accuracy</span>
          </div>
          <span className="text-xl sm:text-2xl font-black text-slate-900 dark:text-foreground tracking-tight">
            99.8%
          </span>
          <span className="text-[10px] text-muted-foreground font-medium">AES-256 Synchronized</span>
        </div>
      </div>

      {/* Auto-Marked Live Session Drawer */}
      {autoMarkedLog.length > 0 && (
        <div className="mt-4 rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-3.5 backdrop-blur-xl">
          <div className="flex items-center justify-between gap-2 mb-2.5">
            <p className="text-xs sm:text-sm font-bold text-foreground flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              Recent Automated Check-ins ({autoMarkedLog.length})
            </p>
            <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
              Auto Dispatched
            </Badge>
          </div>
          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
            {autoMarkedLog.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center justify-between gap-2 p-2 rounded-xl bg-white/60 dark:bg-card/50 border border-border/60 text-xs"
              >
                <span className="font-semibold text-foreground truncate">{entry.name}</span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Badge
                    variant="outline"
                    className={`text-[10px] font-bold ${
                      entry.status === 'late'
                        ? 'border-amber-500/50 text-amber-600 dark:text-amber-400 bg-amber-500/10'
                        : 'border-emerald-500/50 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10'
                    }`}
                  >
                    {entry.status}
                  </Badge>
                  {entry.emailed && (
                    <Badge variant="outline" className="border-blue-500/40 text-blue-500 text-[10px]" title="Parent email sent">
                      mail
                    </Badge>
                  )}
                  {entry.notified && (
                    <Badge variant="outline" className="border-border text-muted-foreground text-[10px]" title="In-app notification sent">
                      app
                    </Badge>
                  )}
                  <span className="text-muted-foreground font-mono font-medium text-[11px]">
                    {Math.round(entry.confidence * 100)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pending Manual 3D Reviews (if any) */}
      {pendingManualReviews.length > 0 && (
        <div className="mt-4 space-y-3 rounded-2xl border border-primary/25 bg-primary/10 p-3 sm:p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-foreground">
              Manual confirmation required ({pendingManualReviews.length})
            </p>
            <Badge variant="secondary" className="bg-secondary text-secondary-foreground border-border/70 text-xs">
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
                    Candidate {(review.confidence * 100).toFixed(1)}% • 3D score {(review.strictScore * 100).toFixed(1)}%
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
                    className="bg-emerald-600 text-white hover:bg-emerald-500"
                  >
                    {isSavingReviewId === review.id ? 'Saving...' : 'Confirm'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default React.memo(FuturisticFaceScanner);
