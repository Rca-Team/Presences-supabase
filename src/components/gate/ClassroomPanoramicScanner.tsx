import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Camera,
  Play,
  Square,
  RefreshCw,
  Users,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  ShieldCheck,
  Maximize,
  Minimize,
  Volume2,
  VolumeX,
  UserCheck,
  UserX,
  Layers,
  ChevronRight,
  Filter,
  Eye,
  Sliders,
  ChevronDown,
} from 'lucide-react';
import * as faceapi from 'face-api.js';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { areModelsLoaded, loadModels } from '@/services/face-recognition/ModelService';
import { loadNet } from '@/services/face-recognition/NetLoaderService';
import {
  ensureGalleryIndex,
  matchDescriptorIndexed,
} from '@/services/face-recognition/RealtimeRecognitionEngine';
import { assessFaceQuality } from '@/services/face-recognition/FaceQualityGate';
import { createFaceTracker, type FaceTrack, type Box } from '@/services/face-recognition/FaceTrackerService';
import {
  setExplicitClassScope,
  clearGalleryScope,
} from '@/services/face-recognition/GalleryScopeService';
import {
  DEFAULT_CLASSROOM_TILES,
  cropTile,
  mapTileBoxToGlobal,
  mergeDetectionsAcrossTiles,
  type PanoramicTile,
  type Box2D,
} from '@/services/face-recognition/PanoramicSlicingService';
import { recordAttendance } from '@/services/face-recognition/RecognitionService';
import { sendAutoParentNotification } from '@/services/notification/AutoNotificationService';

export interface EnrolledStudent {
  userId: string;
  name: string;
  rollNumber?: string;
  studentId?: string;
  avatarUrl?: string;
  verified: boolean;
  verifiedAt?: Date;
  status: 'present' | 'late' | 'absent';
  confidence?: number;
  deskCoordinates?: { x: number; y: number };
}

interface ClassroomPanoramicScannerProps {
  onSessionComplete?: (stats: { total: number; present: number; absent: number }) => void;
  onSwitchToGateFlow?: () => void;
}

const DEFAULT_SESSION_DURATION_SEC = 180; // 3-Minute settling window

export default function ClassroomPanoramicScanner({
  onSessionComplete,
  onSwitchToGateFlow,
}: ClassroomPanoramicScannerProps) {
  // ── Camera & Hardware state ───────────────────────────────────────────────
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);

  // ── Classroom & Roster state ──────────────────────────────────────────────
  const [selectedClass, setSelectedClass] = useState<string>('6');
  const [selectedSection, setSelectedSection] = useState<string>('A');
  const [availableClasses, setAvailableClasses] = useState<string[]>([
    '6', '7', '8', '9', '10', '11', '12'
  ]);
  const [availableSections] = useState<string[]>(['A', 'B', 'C', 'D']);
  const [roster, setRoster] = useState<EnrolledStudent[]>([]);
  const [isLoadingRoster, setIsLoadingRoster] = useState(false);
  const [rosterFilter, setRosterFilter] = useState<'all' | 'verified' | 'unverified'>('all');

  // ── Scanning & Accumulation state ─────────────────────────────────────────
  const [isScanning, setIsScanning] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(DEFAULT_SESSION_DURATION_SEC);
  const [currentTileLabel, setCurrentTileLabel] = useState<string>('Overview');
  const [activeFaceCount, setActiveFaceCount] = useState(0);
  const [verifiedCount, setVerifiedCount] = useState(0);
  const [showSummaryDialog, setShowSummaryDialog] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);

  // ── Refs ──────────────────────────────────────────────────────────────────
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const tileCanvasRef = useRef<HTMLCanvasElement>(document.createElement('canvas'));
  const sessionTimerRef = useRef<number | null>(null);
  const scanLoopRafRef = useRef<number | null>(null);
  const isRunningRef = useRef(false);
  const currentTileIndexRef = useRef(0);
  const lastTileSwitchTimeRef = useRef(0);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Spatial tracker across all 50-60 seats
  const trackerRef = useRef<ReturnType<typeof createFaceTracker> | null>(null);
  const bestShotByTrackRef = useRef<Map<number, { descriptor: Float32Array; quality: number }>>(
    new Map()
  );
  const verifiedUserIdsRef = useRef<Set<string>>(new Set());

  // ── Audio chime helper ───────────────────────────────────────────────────
  const playChime = useCallback(() => {
    if (!soundEnabled) return;
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioContext();
      }
      if (audioCtxRef.current.state === 'suspended') {
        void audioCtxRef.current.resume();
      }
      const ctx = audioCtxRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12); // A5
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.24);
    } catch {}
  }, [soundEnabled]);

  // ── Enumerate External Video Devices ───────────────────────────────────────
  useEffect(() => {
    async function loadCameras() {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoInputs = devices.filter((d) => d.kind === 'videoinput');
        setVideoDevices(videoInputs);
        if (videoInputs.length > 0 && !selectedDeviceId) {
          // Prefer external / wide-angle camera if label contains 'USB' or 'External' or 'OBS' or 'C920' or '4K'
          const external = videoInputs.find(
            (v) =>
              /external|usb|4k|brio|c920|c922|obs|logitech|wide/i.test(v.label)
          );
          setSelectedDeviceId(external?.deviceId || videoInputs[0].deviceId);
        }
      } catch (err) {
        console.warn('Failed to enumerate video inputs:', err);
      }
    }
    void loadCameras();
  }, [selectedDeviceId]);

  // ── Fetch Enrolled Roster for Class/Section ────────────────────────────────
  const fetchRoster = useCallback(async (cls: string, sec: string) => {
    setIsLoadingRoster(true);
    try {
      const db = supabase as any;
      const combined = `${cls}-${sec}`;

      // Fetch students with both separate class/section AND combined "6-A" format
      const [profilesRes, profCombinedRes, registeredRes, regCombinedRes] = await Promise.all([
        db
          .from('profiles')
          .select('user_id, full_name, display_name, roll_number, employee_id, avatar_url, class, section')
          .eq('class', cls)
          .eq('section', sec),
        db
          .from('profiles')
          .select('user_id, full_name, display_name, roll_number, employee_id, avatar_url, class, section')
          .eq('class', combined),
        db
          .from('attendance_records')
          .select('user_id, student_name, student_id, device_info, class, section')
          .eq('class', cls)
          .eq('section', sec)
          .eq('status', 'registered'),
        db
          .from('attendance_records')
          .select('user_id, student_name, student_id, device_info, class, section')
          .eq('class', combined)
          .eq('status', 'registered'),
      ]);

      const studentsMap = new Map<string, EnrolledStudent>();

      const addProfile = (p: any) => {
        if (!p.user_id) return;
        studentsMap.set(p.user_id, {
          userId: p.user_id,
          name: p.full_name || p.display_name || 'Student',
          rollNumber: p.roll_number || undefined,
          studentId: p.employee_id || undefined,
          avatarUrl: p.avatar_url || undefined,
          verified: false,
          status: 'absent',
        });
      };

      const addRecord = (r: any) => {
        if (!r.user_id) return;
        if (!studentsMap.has(r.user_id)) {
          studentsMap.set(r.user_id, {
            userId: r.user_id,
            name: r.student_name || 'Student',
            studentId: r.student_id || undefined,
            avatarUrl: r.device_info?.avatar_url || undefined,
            verified: false,
            status: 'absent',
          });
        }
      };

      (profilesRes.data || []).forEach(addProfile);
      (profCombinedRes.data || []).forEach(addProfile);
      (registeredRes.data || []).forEach(addRecord);
      (regCombinedRes.data || []).forEach(addRecord);

      // If class-specific search returned 0, load registered students so the session is never blocked
      if (studentsMap.size === 0) {
        const { data: allRegistered } = await db
          .from('attendance_records')
          .select('user_id, student_name, student_id, device_info, class, section')
          .eq('status', 'registered')
          .limit(60);
        (allRegistered || []).forEach(addRecord);
      }

      const studentList = Array.from(studentsMap.values()).sort((a, b) => {
        if (a.rollNumber && b.rollNumber) {
          return parseInt(a.rollNumber, 10) - parseInt(b.rollNumber, 10);
        }
        return a.name.localeCompare(b.name);
      });

      setRoster(studentList);
      verifiedUserIdsRef.current.clear();
      setVerifiedCount(0);
    } catch (err) {
      console.error('Failed to load classroom roster:', err);
      toast.error('Failed to fetch class roster');
    } finally {
      setIsLoadingRoster(false);
    }
  }, []);

  // Update roster & Gallery Scope when class/section changes
  useEffect(() => {
    setExplicitClassScope(selectedClass, selectedSection);
    void fetchRoster(selectedClass, selectedSection);

    return () => {
      setExplicitClassScope(null, null);
      clearGalleryScope();
    };
  }, [selectedClass, selectedSection, fetchRoster]);

  // ── Start External Camera Stream (1080p / 4K) ─────────────────────────────
  const startCamera = useCallback(async () => {
    if (!videoRef.current) return;
    try {
      // High-resolution constraints optimized for panoramic classroom capture
      const constraints: MediaStreamConstraints = {
        video: {
          deviceId: selectedDeviceId ? { exact: selectedDeviceId } : undefined,
          width: { ideal: 1920, max: 3840 },
          height: { ideal: 1080, max: 2160 },
          frameRate: { ideal: 30 },
        },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setIsCameraActive(true);

      // Initialize models & gallery
      if (!areModelsLoaded()) {
        await loadModels();
      }
      await loadNet('tinyFaceDetector');
      await ensureGalleryIndex(true);

      // Initialize FaceTracker with 50-60 seat capacity and extended TTL
      trackerRef.current = createFaceTracker({
        identityTtlMs: 60_000, // Persistent seat identity
        maxMissed: 8, // Tolerant to brief occlusions
      });
      bestShotByTrackRef.current.clear();
    } catch (err: any) {
      console.error('Camera startup failed:', err);
      toast.error(`Camera start error: ${err?.message || 'Check camera permissions'}`);
    }
  }, [selectedDeviceId]);

  // Stop Camera
  const stopCamera = useCallback(() => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((t) => t.stop());
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
  }, []);

  // Toggle Fullscreen
  const toggleFullscreen = useCallback(async () => {
    if (!document.fullscreenElement) {
      await containerRef.current?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      await document.exitFullscreen();
      setIsFullscreen(false);
    }
  }, []);

  // ── Mark Student Verified Helper ──────────────────────────────────────────
  const markStudentVerified = useCallback(
    (userId: string, confidence: number, coords?: { x: number; y: number }) => {
      if (verifiedUserIdsRef.current.has(userId)) return;
      verifiedUserIdsRef.current.add(userId);

      playChime();

      setRoster((prev) =>
        prev.map((s) =>
          s.userId === userId
            ? {
                ...s,
                verified: true,
                status: 'present',
                confidence,
                verifiedAt: new Date(),
                deskCoordinates: coords,
              }
            : s
        )
      );
      setVerifiedCount((c) => c + 1);

      // Background DB write + Auto notification
      void (async () => {
        try {
          const student = roster.find((r) => r.userId === userId);
          const studentName = student?.name || 'Student';
          await recordAttendance(userId, 'present', confidence, {
            metadata: {
              class: selectedClass,
              section: selectedSection,
              mode: 'classroom-panoramic',
              verifiedAt: new Date().toISOString(),
            },
          });
          void sendAutoParentNotification(userId, studentName, 'present').catch(() => {});
        } catch (err) {
          console.warn('Classroom attendance record write failed:', err);
        }
      })();
    },
    [playChime, roster, selectedClass, selectedSection]
  );

  // ── Manual Verify Override (Jarvis Checklist) ──────────────────────────────
  const handleManualVerify = useCallback(
    (student: EnrolledStudent) => {
      markStudentVerified(student.userId, 1.0);
      toast.success(`${student.name} manually marked present`);
    },
    [markStudentVerified]
  );

  // ── Finalize Attendance Session ────────────────────────────────────────────
  const handleFinalize = useCallback(async () => {
    isRunningRef.current = false;
    setIsScanning(false);
    if (sessionTimerRef.current) {
      clearInterval(sessionTimerRef.current);
      sessionTimerRef.current = null;
    }
    if (scanLoopRafRef.current) {
      cancelAnimationFrame(scanLoopRafRef.current);
      scanLoopRafRef.current = null;
    }

    const present = roster.filter((s) => s.verified).length;
    const unverifiedStudents = roster.filter((s) => !s.verified);
    const absent = unverifiedStudents.length;

    setIsFinalizing(true);
    try {
      // Record absent status for all unverified students to ensure 0% remain unmarked
      await Promise.allSettled(
        unverifiedStudents.map(async (student) => {
          try {
            await recordAttendance(student.userId, 'absent', 0, {
              metadata: {
                class: selectedClass,
                section: selectedSection,
                mode: 'classroom-panoramic',
                markedAs: 'absent',
                name: student.name,
              },
            });
            void sendAutoParentNotification(student.userId, student.name, 'absent').catch(() => {});
          } catch (err) {
            console.warn(`Failed to record absent status for ${student.name}:`, err);
          }
        })
      );
    } catch (err) {
      console.warn('Finalize absentee batch recording error:', err);
    } finally {
      setIsFinalizing(false);
    }

    setShowSummaryDialog(true);
    onSessionComplete?.({
      total: roster.length,
      present,
      absent,
    });
  }, [roster, selectedClass, selectedSection, onSessionComplete]);

  // ── Reset Session State ───────────────────────────────────────────────────
  const resetSession = useCallback(() => {
    verifiedUserIdsRef.current.clear();
    setRoster((prev) =>
      prev.map((s) => ({
        ...s,
        verified: false,
        status: 'absent',
        confidence: undefined,
        verifiedAt: undefined,
        deskCoordinates: undefined,
      }))
    );
    setVerifiedCount(0);
    setSecondsRemaining(DEFAULT_SESSION_DURATION_SEC);
  }, []);

  // ── Main Multi-Tile Panoramic Detection Pass ───────────────────────────────
  const runPanoramicPass = useCallback(async () => {
    const video = videoRef.current;
    const canvas = overlayCanvasRef.current;
    if (!video || !canvas || video.readyState < 2 || !isRunningRef.current) {
      return;
    }

    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return;

    if (canvas.width !== vw || canvas.height !== vh) {
      canvas.width = vw;
      canvas.height = vh;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 1. Determine active tile for this tick (Round-robin across 5 quadrants)
    const now = performance.now();
    if (now - lastTileSwitchTimeRef.current > 750) {
      currentTileIndexRef.current =
        (currentTileIndexRef.current + 1) % DEFAULT_CLASSROOM_TILES.length;
      lastTileSwitchTimeRef.current = now;
      setCurrentTileLabel(DEFAULT_CLASSROOM_TILES[currentTileIndexRef.current].label);
    }

    const activeTile = DEFAULT_CLASSROOM_TILES[currentTileIndexRef.current];
    const cropInfo = cropTile(video, activeTile, tileCanvasRef.current, activeTile.inputSize);

    // 2. Run dual detection: Full-Frame Overview + Active High-Res Quadrant
    const allDetectedGlobalBoxes: Box2D[] = [];

    // Pass A: Full-Frame Global Classroom Pass (keeps all seated students tracked simultaneously)
    try {
      const globalDetections = await faceapi
        .detectAllFaces(
          video,
          new faceapi.TinyFaceDetectorOptions({
            inputSize: 512,
            scoreThreshold: 0.20,
          })
        )
        .withFaceLandmarks()
        .withFaceDescriptors();

      for (const det of globalDetections) {
        allDetectedGlobalBoxes.push(det.detection.box);

        if (det.descriptor && det.descriptor.length === 128) {
          const match = await matchDescriptorIndexed(det.descriptor, 0.52);
          if (match && !verifiedUserIdsRef.current.has(match.userId)) {
            markStudentVerified(match.userId, match.confidence, {
              x: det.detection.box.x + det.detection.box.width / 2,
              y: det.detection.box.y + det.detection.box.height / 2,
            });
          }
        }
      }
    } catch (fullErr) {
      // Continue to quadrant pass
    }

    // Pass B: Active High-Res Quadrant Pass (boosts resolution for distant back-row desks)
    if (cropInfo) {
      try {
        const tileDetections = await faceapi
          .detectAllFaces(
            tileCanvasRef.current,
            new faceapi.TinyFaceDetectorOptions({
              inputSize: activeTile.inputSize,
              scoreThreshold: 0.20,
            })
          )
          .withFaceLandmarks()
          .withFaceDescriptors();

        for (const det of tileDetections) {
          const globalBox = mapTileBoxToGlobal(det.detection.box, cropInfo);
          allDetectedGlobalBoxes.push(globalBox);

          if (det.descriptor && det.descriptor.length === 128) {
            const match = await matchDescriptorIndexed(det.descriptor, 0.52);
            if (match && !verifiedUserIdsRef.current.has(match.userId)) {
              markStudentVerified(match.userId, match.confidence, {
                x: globalBox.x + globalBox.width / 2,
                y: globalBox.y + globalBox.height / 2,
              });
            }
          }
        }
      } catch (detErr) {
        // Continue pass on micro-frame hiccup
      }
    }

    // 3. Update spatial tracker
    if (trackerRef.current) {
      const mergedBoxes = mergeDetectionsAcrossTiles(allDetectedGlobalBoxes);
      const tracks = trackerRef.current.update(mergedBoxes);
      setActiveFaceCount(tracks.length);

      // 4. Render Spatial Seat HUD on Canvas
      ctx.clearRect(0, 0, vw, vh);

      // Draw subtle tile inspection indicator
      ctx.save();
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.25)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(
        activeTile.crop.x * vw,
        activeTile.crop.y * vh,
        activeTile.crop.width * vw,
        activeTile.crop.height * vh
      );
      ctx.restore();

      // Draw bounding tags for every seated track
      for (const t of tracks) {
        const isVerified = Array.from(verifiedUserIdsRef.current).some((uid) => {
          const s = roster.find((r) => r.userId === uid);
          if (!s?.deskCoordinates) return false;
          const dist = Math.hypot(
            s.deskCoordinates.x - (t.box.x + t.box.width / 2),
            s.deskCoordinates.y - (t.box.y + t.box.height / 2)
          );
          return dist < 80;
        });

        const student = roster.find(
          (s) =>
            s.verified &&
            s.deskCoordinates &&
            Math.hypot(
              s.deskCoordinates.x - (t.box.x + t.box.width / 2),
              s.deskCoordinates.y - (t.box.y + t.box.height / 2)
            ) < 80
        );

        ctx.save();
        if (isVerified && student) {
          // 🟢 Verified Seat Tag
          ctx.strokeStyle = '#10b981';
          ctx.fillStyle = 'rgba(16, 185, 129, 0.12)';
          ctx.lineWidth = 2.5;

          // Rounded rectangle box
          ctx.beginPath();
          ctx.roundRect(t.box.x, t.box.y, t.box.width, t.box.height, 8);
          ctx.fill();
          ctx.stroke();

          // Badge background
          ctx.fillStyle = '#065f46';
          ctx.beginPath();
          ctx.roundRect(t.box.x, Math.max(0, t.box.y - 28), Math.max(120, t.box.width), 26, 6);
          ctx.fill();

          // Student name text
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 12px Inter, sans-serif';
          ctx.fillText(student.name, t.box.x + 8, Math.max(16, t.box.y - 10));
        } else {
          // 🟡 Acquiring / Identifying Tag
          ctx.strokeStyle = 'rgba(245, 158, 11, 0.85)';
          ctx.fillStyle = 'rgba(245, 158, 11, 0.08)';
          ctx.lineWidth = 1.8;
          ctx.setLineDash([5, 3]);

          ctx.beginPath();
          ctx.roundRect(t.box.x, t.box.y, t.box.width, t.box.height, 6);
          ctx.fill();
          ctx.stroke();

          // Small indicator pill
          ctx.fillStyle = 'rgba(245, 158, 11, 0.85)';
          ctx.beginPath();
          ctx.roundRect(t.box.x, Math.max(0, t.box.y - 20), 80, 18, 4);
          ctx.fill();

          ctx.fillStyle = '#1e293b';
          ctx.font = 'bold 10px Inter, sans-serif';
          ctx.fillText('Identifying...', t.box.x + 6, Math.max(13, t.box.y - 7));
        }
        ctx.restore();
      }
    }
  }, [markStudentVerified, roster]);

  // ── Animation Loop ────────────────────────────────────────────────────────
  useEffect(() => {
    let animId: number;

    const tick = () => {
      if (isRunningRef.current) {
        void runPanoramicPass();
      }
      animId = requestAnimationFrame(tick);
      scanLoopRafRef.current = animId;
    };

    if (isScanning) {
      isRunningRef.current = true;
      animId = requestAnimationFrame(tick);
    } else {
      isRunningRef.current = false;
    }

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [isScanning, runPanoramicPass]);

  // ── Session Countdown Timer ───────────────────────────────────────────────
  const startSession = useCallback(async () => {
    if (!isCameraActive) {
      await startCamera();
    }
    setSecondsRemaining(DEFAULT_SESSION_DURATION_SEC);
    setIsScanning(true);
    isRunningRef.current = true;

    if (sessionTimerRef.current) clearInterval(sessionTimerRef.current);

    sessionTimerRef.current = window.setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          handleFinalize();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [isCameraActive, startCamera, handleFinalize]);

  const startNewSession = useCallback(async () => {
    resetSession();
    await startSession();
  }, [resetSession, startSession]);

  const pauseSession = useCallback(() => {
    setIsScanning(false);
    isRunningRef.current = false;
    if (sessionTimerRef.current) {
      clearInterval(sessionTimerRef.current);
      sessionTimerRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (sessionTimerRef.current) clearInterval(sessionTimerRef.current);
      if (scanLoopRafRef.current) cancelAnimationFrame(scanLoopRafRef.current);
      stopCamera();
    };
  }, [stopCamera]);

  // ── Computed Roster Views ─────────────────────────────────────────────────
  const filteredRoster = useMemo(() => {
    if (rosterFilter === 'verified') return roster.filter((s) => s.verified);
    if (rosterFilter === 'unverified') return roster.filter((s) => !s.verified);
    return roster;
  }, [roster, rosterFilter]);

  const attendancePercentage = roster.length > 0
    ? Math.round((verifiedCount / roster.length) * 100)
    : 0;

  const timerFormatted = useMemo(() => {
    const mins = Math.floor(secondsRemaining / 60);
    const secs = secondsRemaining % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }, [secondsRemaining]);

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full min-h-[calc(100vh-4rem)] flex flex-col bg-slate-950 text-slate-100 select-none overflow-hidden ${
        isFullscreen ? 'fixed inset-0 z-50' : ''
      }`}
    >
      {/* ── Top Command Bar ── */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900/90 backdrop-blur-xl border-b border-slate-800 shadow-xl z-20">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 font-bold text-xs">
            <Sparkles className="w-4 h-4 text-cyan-400 animate-pulse" />
            <span>Classroom Panoramic AI</span>
          </div>

          {/* Class & Section Selectors */}
          <div className="flex items-center gap-1.5">
            <Select
              value={selectedClass}
              onValueChange={setSelectedClass}
              disabled={isScanning}
            >
              <SelectTrigger className="h-8 w-24 text-xs font-bold bg-slate-800/80 border-slate-700 text-slate-100">
                <SelectValue placeholder="Class" />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-800 text-slate-100">
                {availableClasses.map((cls) => (
                  <SelectItem key={cls} value={cls} className="text-xs">
                    Class {cls}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={selectedSection}
              onValueChange={setSelectedSection}
              disabled={isScanning}
            >
              <SelectTrigger className="h-8 w-20 text-xs font-bold bg-slate-800/80 border-slate-700 text-slate-100">
                <SelectValue placeholder="Sec" />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-800 text-slate-100">
                {availableSections.map((sec) => (
                  <SelectItem key={sec} value={sec} className="text-xs">
                    Sec {sec}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* External Camera Selector */}
          {videoDevices.length > 1 && (
            <Select
              value={selectedDeviceId}
              onValueChange={(val) => {
                setSelectedDeviceId(val);
                if (isCameraActive) {
                  void startCamera();
                }
              }}
              disabled={isScanning}
            >
              <SelectTrigger className="h-8 max-w-[200px] text-xs font-medium bg-slate-800/80 border-slate-700 text-slate-100 truncate">
                <Camera className="w-3.5 h-3.5 mr-1 text-cyan-400 shrink-0" />
                <SelectValue placeholder="Select Camera" />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-800 text-slate-100">
                {videoDevices.map((dev) => (
                  <SelectItem key={dev.deviceId} value={dev.deviceId} className="text-xs">
                    {dev.label || `Camera ${dev.deviceId.slice(0, 5)}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Badge
            variant="outline"
            className="hidden sm:inline-flex text-[11px] px-2 py-0.5 border-emerald-500/30 text-emerald-400 bg-emerald-500/10 font-medium"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1.5 animate-pulse" />
            1:60 Class Scope Active
          </Badge>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {/* Sound Mute/Unmute */}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-slate-400 hover:text-slate-100 hover:bg-slate-800"
            onClick={() => setSoundEnabled((v) => !v)}
            title={soundEnabled ? 'Mute Chime' : 'Unmute Chime'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </Button>

          {/* Fullscreen Toggle */}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-slate-400 hover:text-slate-100 hover:bg-slate-800"
            onClick={toggleFullscreen}
          >
            {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
          </Button>

          {/* Switch to Secondary Gate Flow Mode Button */}
          {onSwitchToGateFlow && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs font-semibold border-slate-700 bg-slate-800/80 text-slate-200 hover:bg-slate-700"
              onClick={onSwitchToGateFlow}
            >
              Gate Turnstile Mode
              <ChevronRight className="w-3.5 h-3.5 ml-1 text-slate-400" />
            </Button>
          )}
        </div>
      </div>

      {/* ── Main Split View (72% Panoramic HUD / 28% Jarvis Deficit Sidebar) ── */}
      <div className="flex-1 flex min-h-0 relative">
        {/* Left: Panoramic Video HUD */}
        <div className="flex-[72] relative min-h-0 bg-black flex flex-col justify-center items-center overflow-hidden">
          {/* Native Video Feed */}
          <video
            ref={videoRef}
            playsInline
            muted
            className="w-full h-full object-contain"
          />

          {/* Real-Time Spatial Augmented HUD Canvas */}
          <canvas
            ref={overlayCanvasRef}
            className="absolute inset-0 w-full h-full object-contain pointer-events-none z-10"
          />

          {/* Camera Offline / Standby State */}
          {!isCameraActive && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/90 backdrop-blur-sm z-20 space-y-4">
              <div className="p-4 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 shadow-2xl">
                <Camera className="w-12 h-12 stroke-[1.5]" />
              </div>
              <div className="text-center space-y-1">
                <h3 className="text-lg font-bold text-slate-100">
                  Ready to Scan Class {selectedClass}-{selectedSection}
                </h3>
                <p className="text-xs text-slate-400 max-w-sm">
                  Connect your high-quality external camera facing the seated desks, then click Start.
                </p>
              </div>
              <Button
                size="lg"
                className="bg-cyan-500 hover:bg-cyan-600 text-slate-950 font-extrabold px-6 shadow-lg shadow-cyan-500/25"
                onClick={startSession}
              >
                <Play className="w-4 h-4 mr-2 fill-current" />
                Start 3-Minute Classroom Scan
              </Button>
            </div>
          )}

          {/* Live Scanning HUD Status Bar */}
          {isCameraActive && (
            <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between p-3 rounded-2xl bg-slate-900/85 backdrop-blur-xl border border-slate-800/80 shadow-2xl z-20">
              {/* Tile & Face tracking info */}
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800/80 border border-slate-700/60 text-xs font-semibold text-slate-300">
                  <Layers className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Inspecting: {currentTileLabel}</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-400">
                  <Users className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{activeFaceCount} Seated Faces in View</span>
                </div>
              </div>

              {/* 3-Minute Timer & Controls */}
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 px-3 py-1 rounded-xl bg-slate-950/80 border border-slate-700/80">
                  <Clock className="w-4 h-4 text-amber-400 animate-pulse" />
                  <span className="font-mono text-sm font-bold text-amber-300">
                    {timerFormatted}
                  </span>
                </div>

                {isScanning ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 border-slate-700 text-slate-200 hover:bg-slate-800 text-xs"
                    onClick={pauseSession}
                  >
                    Pause
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    className="h-8 bg-cyan-500 hover:bg-cyan-600 text-slate-950 font-bold text-xs"
                    onClick={startSession}
                  >
                    Resume
                  </Button>
                )}

                <Button
                  size="sm"
                  disabled={isFinalizing}
                  className="h-8 bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs shadow-md shadow-emerald-500/20 disabled:opacity-60"
                  onClick={handleFinalize}
                >
                  {isFinalizing ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                      Finalizing...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                      Finalize Attendance
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Right: Jarvis Deficit Sidebar */}
        <div className="flex-[28] min-w-[320px] max-w-[420px] border-l border-slate-800/80 bg-slate-900/95 backdrop-blur-2xl flex flex-col z-20">
          {/* Header Stats */}
          <div className="p-4 border-b border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-extrabold text-sm text-slate-100 flex items-center gap-2">
                  <span>Class {selectedClass}-{selectedSection} Roster</span>
                  {isLoadingRoster && <RefreshCw className="w-3 h-3 animate-spin text-cyan-400" />}
                </h3>
                <p className="text-[11px] text-slate-400">
                  {roster.length} Total Enrolled Students
                </p>
              </div>
              <div className="text-right">
                <span className="text-2xl font-black text-emerald-400">
                  {verifiedCount}
                </span>
                <span className="text-xs text-slate-500"> / {roster.length}</span>
                <div className="text-[10px] font-bold text-emerald-500">
                  {attendancePercentage}% Verified
                </div>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400"
                initial={{ width: 0 }}
                animate={{ width: `${attendancePercentage}%` }}
                transition={{ duration: 0.4 }}
              />
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-950/70 border border-slate-800/80 text-[11px] font-bold">
              <button
                className={`flex-1 py-1 rounded-md transition-colors ${
                  rosterFilter === 'all'
                    ? 'bg-slate-800 text-slate-100'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                onClick={() => setRosterFilter('all')}
              >
                All ({roster.length})
              </button>
              <button
                className={`flex-1 py-1 rounded-md transition-colors ${
                  rosterFilter === 'verified'
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                onClick={() => setRosterFilter('verified')}
              >
                Verified ({verifiedCount})
              </button>
              <button
                className={`flex-1 py-1 rounded-md transition-colors ${
                  rosterFilter === 'unverified'
                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                onClick={() => setRosterFilter('unverified')}
              >
                Remaining ({roster.length - verifiedCount})
              </button>
            </div>
          </div>

          {/* Student List (Scrollable) */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            <AnimatePresence>
              {filteredRoster.map((student) => (
                <motion.div
                  key={student.userId}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className={`flex items-center justify-between p-2.5 rounded-xl border transition-all ${
                    student.verified
                      ? 'bg-emerald-500/5 border-emerald-500/30'
                      : 'bg-slate-800/40 border-slate-700/60 hover:bg-slate-800/70'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="relative w-9 h-9 rounded-lg bg-slate-800 overflow-hidden shrink-0 border border-slate-700">
                      {student.avatarUrl ? (
                        <img
                          src={student.avatarUrl}
                          alt={student.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-xs font-bold text-slate-400">
                          {student.name.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      {student.verified && (
                        <div className="absolute top-0.5 right-0.5 w-2.5 h-2.5 bg-emerald-500 rounded-full ring-2 ring-slate-900" />
                      )}
                    </div>

                    <div className="min-w-0">
                      <p className="font-bold text-xs text-slate-100 truncate">
                        {student.name}
                      </p>
                      <p className="text-[10px] text-slate-400 truncate">
                        {student.rollNumber ? `Roll: ${student.rollNumber}` : student.studentId || 'Enrolled'}
                      </p>
                    </div>
                  </div>

                  {/* Status / Override Action */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {student.verified ? (
                      <Badge className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-[10px] font-bold">
                        Present
                      </Badge>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[11px] px-2 border-slate-700 hover:border-emerald-500/50 hover:bg-emerald-500/10 text-slate-300 hover:text-emerald-400 font-medium"
                        onClick={() => handleManualVerify(student)}
                      >
                        <UserCheck className="w-3 h-3 mr-1" />
                        Verify
                      </Button>
                    )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {filteredRoster.length === 0 && (
              <div className="text-center py-12 text-slate-500 text-xs">
                No students in this view
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Summary & Commit Dialog ── */}
      <Dialog open={showSummaryDialog} onOpenChange={setShowSummaryDialog}>
        <DialogContent className="bg-slate-900 border-slate-800 text-slate-100 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-extrabold flex items-center gap-2 text-emerald-400">
              <CheckCircle2 className="w-5 h-5" />
              Class {selectedClass}-{selectedSection} Attendance Finalized
            </DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3 py-4">
            <Card className="bg-slate-950 border-emerald-500/30">
              <CardContent className="p-4 text-center">
                <p className="text-3xl font-black text-emerald-400">{verifiedCount}</p>
                <p className="text-xs text-slate-400 font-semibold mt-1">Present (Verified)</p>
              </CardContent>
            </Card>

            <Card className="bg-slate-950 border-red-500/30">
              <CardContent className="p-4 text-center">
                <p className="text-3xl font-black text-red-400">{roster.length - verifiedCount}</p>
                <p className="text-xs text-slate-400 font-semibold mt-1">Absent</p>
              </CardContent>
            </Card>
          </div>

          <p className="text-xs text-slate-400 leading-relaxed">
            Attendance records have been synced to Supabase database. Automated alerts have been
            dispatched to parents.
          </p>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              className="border-slate-700 text-slate-300"
              onClick={() => setShowSummaryDialog(false)}
            >
              Close
            </Button>
            <Button
              className="bg-cyan-500 hover:bg-cyan-600 text-slate-950 font-bold"
              onClick={() => {
                setShowSummaryDialog(false);
                void startNewSession();
              }}
            >
              Start New Class Session
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
