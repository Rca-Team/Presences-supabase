import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Webcam from 'react-webcam';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { getAttendanceCutoffTime, isPastCutoffTime } from '@/services/attendance/AttendanceSettingsService';
import { recordAttendance } from '@/services/face-recognition/RecognitionService';
import { sendAutoParentNotification } from '@/services/notification/AutoNotificationService';
import {
  QrCode,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Zap,
  ZapOff,
  Scan,
  Maximize2,
  Minimize2,
  User,
  Clock,
  ShieldCheck,
} from 'lucide-react';
import jsQR from 'jsqr';

interface QRCodeScannerProps {
  onScanComplete?: (result: { success: boolean; name?: string; userId?: string }) => void;
  autoStart?: boolean;
  hideManualControls?: boolean;
}

interface QRData {
  id: string;
  user_id?: string;
  student_id?: string;
  name: string;
  employee_id: string;
  category: string;
  timestamp: number;
}

const QRCodeScanner: React.FC<QRCodeScannerProps> = ({
  onScanComplete,
  autoStart = false,
  hideManualControls = false,
}) => {
  const { toast } = useToast();
  const webcamRef = useRef<Webcam>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const autofocusIntervalRef = useRef<number | null>(null);
  const isLoopActiveRef = useRef(false);
  const isProcessingScanRef = useRef(false);
  const lastFrameAtRef = useRef(0);
  const inFlightDecodeRef = useRef(false);
  const frameCounterRef = useRef(0);
  const recentScanRef = useRef<Map<string, number>>(new Map());
  const barcodeDetectorRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const roiCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const upscaleCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastCanvasSizeRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 });
  const lastVideoTimeRef = useRef(-1);
  const missStreakRef = useRef(0);
  const nativeDetectorReadyRef = useRef(false);
  const scanQueueRef = useRef<string[]>([]);
  const queueSeenRef = useRef<Set<string>>(new Set());
  const lastLumaCheckRef = useRef(0);
  const [lowLight, setLowLight] = useState(false);

  // Perf tuning: decode ~20 fps decode with a 60fps preview. Cheap on modern devices.
  const SCAN_FRAME_INTERVAL_MS = 50;
  const CENTER_SCAN_RATIO = 0.78;
  const DUPLICATE_SCAN_COOLDOWN_MS = 15_000;
  const MAX_SCAN_WIDTH = 720;
  
  
  const containerRef = useRef<HTMLDivElement>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<{ success: boolean; name?: string; employeeId?: string } | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [lastScannedId, setLastScannedId] = useState<string | null>(null);
  const [focusAssistEnabled, setFocusAssistEnabled] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [recentScans, setRecentScans] = useState<Array<{ id: string; name: string; employeeId?: string; time: number }>>([]);
  const stopAutoFocusLoop = () => {
    if (autofocusIntervalRef.current) {
      window.clearInterval(autofocusIntervalRef.current);
      autofocusIntervalRef.current = null;
    }
  };

  const applyAutoFocus = useCallback(async () => {
    const video = webcamRef.current?.video;
    const stream = video?.srcObject as MediaStream | null;
    const track = stream?.getVideoTracks?.()[0];
    if (!track?.applyConstraints) return false;

    try {
      const capabilities = typeof track.getCapabilities === 'function' ? track.getCapabilities() : ({} as any);
      const advanced: Record<string, unknown> = {};

      if (Array.isArray((capabilities as any).focusMode)) {
        if ((capabilities as any).focusMode.includes('continuous')) {
          advanced.focusMode = 'continuous';
        } else if ((capabilities as any).focusMode.includes('single-shot')) {
          advanced.focusMode = 'single-shot';
        }
      }
      if (Array.isArray((capabilities as any).exposureMode) && (capabilities as any).exposureMode.includes('continuous')) {
        advanced.exposureMode = 'continuous';
      }
      if (Array.isArray((capabilities as any).whiteBalanceMode) && (capabilities as any).whiteBalanceMode.includes('continuous')) {
        advanced.whiteBalanceMode = 'continuous';
      }

      if (Object.keys(advanced).length === 0) return false;

      await track.applyConstraints({ advanced: [advanced] as any });
      return true;
    } catch {
      return false;
    }
  }, []);

  const startAutoFocusLoop = useCallback(async () => {
    stopAutoFocusLoop();
    const enabled = await applyAutoFocus();
    setFocusAssistEnabled(enabled);

    autofocusIntervalRef.current = window.setInterval(async () => {
      if (!isLoopActiveRef.current) return;
      const ok = await applyAutoFocus();
      if (ok) setFocusAssistEnabled(true);
    }, 1200);
  }, [applyAutoFocus]);


  const normalizeValue = (value: unknown) => String(value ?? '').trim();

  const parseQRPayload = (rawValue: string): QRData | null => {
    const raw = normalizeValue(rawValue);
    if (!raw) return null;

    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return {
          id: normalizeValue((parsed as any).id || (parsed as any).user_id || (parsed as any).student_id),
          user_id: normalizeValue((parsed as any).user_id),
          student_id: normalizeValue((parsed as any).student_id),
          name: normalizeValue((parsed as any).name || 'Student'),
          employee_id: normalizeValue((parsed as any).employee_id || (parsed as any).student_id || (parsed as any).id),
          category: normalizeValue((parsed as any).category || 'General'),
          timestamp: Number((parsed as any).timestamp || Date.now()),
        };
      }
    } catch {
      // Support plain-text QR payloads (legacy cards): treat as ID/employee_id.
      return {
        id: raw,
        user_id: raw,
        student_id: raw,
        name: 'Student',
        employee_id: raw,
        category: 'General',
        timestamp: Date.now(),
      };
    }

    return null;
  };

  const getScanIdentity = (qrData: QRData) =>
    String(qrData.user_id || qrData.id || qrData.student_id || qrData.employee_id || qrData.name || '').trim().toLowerCase();

  const looksLikeUuid = (value: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

  const resolveAttendanceTargetId = async (qrData: QRData) => {
    const preferred = normalizeValue(qrData.user_id || qrData.id);
    if (preferred && looksLikeUuid(preferred)) return preferred;

    const studentKey = normalizeValue(qrData.student_id || qrData.employee_id || qrData.id);
    if (!studentKey) return preferred || null;

    const [descriptorRes, attendanceRes] = await Promise.all([
      supabase
        .from('face_descriptors')
        .select('user_id')
        .eq('student_id', studentKey)
        .not('user_id', 'is', null)
        .limit(1)
        .maybeSingle(),
      supabase
        .from('attendance_records')
        .select('user_id')
        .eq('student_id', studentKey)
        .not('user_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const resolvedUserId =
      normalizeValue(descriptorRes.data?.user_id) ||
      normalizeValue(attendanceRes.data?.user_id) ||
      preferred ||
      studentKey;

    return resolvedUserId || null;
  };

  const isDuplicateScan = (identity: string) => {
    const now = Date.now();
    const lastSeen = recentScanRef.current.get(identity);
    if (lastSeen && now - lastSeen < DUPLICATE_SCAN_COOLDOWN_MS) return true;
    recentScanRef.current.set(identity, now);

    for (const [key, timestamp] of recentScanRef.current.entries()) {
      if (now - timestamp > DUPLICATE_SCAN_COOLDOWN_MS * 2) {
        recentScanRef.current.delete(key);
      }
    }
    return false;
  };

  // Enqueue a raw QR value for processing. Dedupes rapid repeats and lets
  // multiple students in one frame all get marked in sequence.
  const enqueueRawValue = (rawValue: string) => {
    const key = rawValue.trim();
    if (!key) return;
    if (queueSeenRef.current.has(key)) return;
    queueSeenRef.current.add(key);
    scanQueueRef.current.push(key);
    // Kick the queue drain (fire and forget)
    void drainQueue();
    // Auto-forget the dedupe key after cooldown so a legit re-scan later still works
    window.setTimeout(() => queueSeenRef.current.delete(key), DUPLICATE_SCAN_COOLDOWN_MS);
  };

  const drainQueue = async () => {
    if (isProcessingScanRef.current) return;
    while (scanQueueRef.current.length > 0) {
      const next = scanQueueRef.current.shift();
      if (!next) break;
      await processQRCode(next);
    }
  };

  // Smart multi-pass QR detection: native multi-code → jsQR ROI → adaptive upscale/invert.
  const detectQRCode = useCallback(async () => {
    if (inFlightDecodeRef.current || !webcamRef.current || !canvasRef.current || !isLoopActiveRef.current) return;

    const video = webcamRef.current.video;
    if (!video || video.readyState !== 4) return;

    // Skip identical consecutive frames — no new pixels to decode.
    if (video.currentTime === lastVideoTimeRef.current) return;
    lastVideoTimeRef.current = video.currentTime;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D | null;
    if (!ctx) return;

    const srcWidth = video.videoWidth;
    const srcHeight = video.videoHeight;
    if (!srcWidth || !srcHeight) return;
    const scale = srcWidth > MAX_SCAN_WIDTH ? MAX_SCAN_WIDTH / srcWidth : 1;
    const targetWidth = Math.max(320, Math.round(srcWidth * scale));
    const targetHeight = Math.max(240, Math.round(srcHeight * scale));

    if (lastCanvasSizeRef.current.w !== targetWidth || lastCanvasSizeRef.current.h !== targetHeight) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      lastCanvasSizeRef.current = { w: targetWidth, h: targetHeight };
    }

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    inFlightDecodeRef.current = true;
    try {
      frameCounterRef.current += 1;
      let foundAny = false;

      // 1) Native BarcodeDetector — decodes ALL codes in the frame at once (multi-QR).
      if (nativeDetectorReadyRef.current || 'BarcodeDetector' in window) {
        if (!barcodeDetectorRef.current) {
          try {
            barcodeDetectorRef.current = new (window as any).BarcodeDetector({ formats: ['qr_code'] });
            nativeDetectorReadyRef.current = true;
          } catch {
            nativeDetectorReadyRef.current = false;
          }
        }
        if (barcodeDetectorRef.current) {
          try {
            const barcodes = await barcodeDetectorRef.current.detect(canvas);
            for (const b of barcodes) {
              if (b?.rawValue) {
                enqueueRawValue(String(b.rawValue));
                foundAny = true;
              }
            }
          } catch {
            // fall through to jsQR
          }
        }
      }

      // 2) jsQR ROI pass — always run when native missed, so far/printed QRs on ID cards still catch.
      if (!foundAny) {
        const roiWidth = Math.round(canvas.width * CENTER_SCAN_RATIO);
        const roiHeight = Math.round(canvas.height * CENTER_SCAN_RATIO);
        const roiX = Math.round((canvas.width - roiWidth) / 2);
        const roiY = Math.round((canvas.height - roiHeight) / 2);
        const roiImage = ctx.getImageData(roiX, roiY, roiWidth, roiHeight);

        // Ambient-light sample from ROI luma every ~2s (very cheap: strided).
        const nowTs = performance.now();
        if (nowTs - lastLumaCheckRef.current > 2000) {
          lastLumaCheckRef.current = nowTs;
          const data = roiImage.data;
          let sum = 0;
          let n = 0;
          const step = 40 * 4; // sample sparsely
          for (let i = 0; i < data.length; i += step) {
            sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            n++;
          }
          const avg = n ? sum / n : 128;
          setLowLight(avg < 55);
        }

        const decoded = jsQR(roiImage.data, roiWidth, roiHeight, { inversionAttempts: 'dontInvert' });
        if (decoded?.data) {
          enqueueRawValue(decoded.data);
          foundAny = true;
          missStreakRef.current = 0;
        }

        // 3) Adaptive rescue passes for small/far or printed cards.
        if (!foundAny) {
          missStreakRef.current += 1;

          // Every 3rd miss: try inverted (helps glossy/printed cards with reflections).
          if (missStreakRef.current % 3 === 0) {
            const decodedInv = jsQR(roiImage.data, roiWidth, roiHeight, { inversionAttempts: 'onlyInvert' });
            if (decodedInv?.data) {
              enqueueRawValue(decodedInv.data);
              foundAny = true;
              missStreakRef.current = 0;
            }
          }

          // Every 5th miss: upscale center 2x with attemptBoth for far/small QRs.
          if (!foundAny && missStreakRef.current % 5 === 0) {
            if (!upscaleCanvasRef.current) upscaleCanvasRef.current = document.createElement('canvas');
            const up = upscaleCanvasRef.current;
            // Tighter center to boost apparent QR size when it's far away.
            const tight = 0.55;
            const tw = Math.round(canvas.width * tight);
            const th = Math.round(canvas.height * tight);
            const tx = Math.round((canvas.width - tw) / 2);
            const ty = Math.round((canvas.height - th) / 2);
            const uw = tw * 2;
            const uh = th * 2;
            up.width = uw;
            up.height = uh;
            const uctx = up.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D | null;
            if (uctx) {
              uctx.imageSmoothingEnabled = false;
              uctx.drawImage(canvas, tx, ty, tw, th, 0, 0, uw, uh);
              const upImg = uctx.getImageData(0, 0, uw, uh);
              const decodedUp = jsQR(upImg.data, uw, uh, { inversionAttempts: 'attemptBoth' });
              if (decodedUp?.data) {
                enqueueRawValue(decodedUp.data);
                foundAny = true;
                missStreakRef.current = 0;
              }
            }
          }
        }
      } else {
        missStreakRef.current = 0;
      }
    } catch {
      // Silently fail for detection errors
    } finally {
      inFlightDecodeRef.current = false;
    }
  }, []);

  const playSuccessSound = () => {
    try {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return;

      if (!audioContextRef.current) {
        audioContextRef.current = new Ctx();
      }

      const ctx = audioContextRef.current;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(1320, now + 0.09);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.16, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.16);
    } catch {
      // ignore audio failures
    }
  };

  const processQRCode = async (qrDataString: string) => {
    if (isProcessingScanRef.current) return;
    const qrData = parseQRPayload(qrDataString);
    if (!qrData) {
      setScanResult({ success: false });
      toast({
        title: 'Invalid QR Code',
        description: 'This QR code format is not supported.',
        variant: 'destructive',
      });
      setTimeout(() => {
        setScanResult(null);
      }, 1500);
      return;
    }

    isProcessingScanRef.current = true;
    try {
      const identity = getScanIdentity(qrData);
      if (!identity) {
        isProcessingScanRef.current = false;
        return;
      }
      
      // Prevent duplicate scans within cooldown window (spam protection)
      if (isDuplicateScan(identity)) return;
      if ((qrData.user_id || qrData.id) === lastScannedId) return;

      const attendanceTargetId = await resolveAttendanceTargetId(qrData);
      if (!attendanceTargetId) {
        throw new Error('No valid student identity found in QR payload.');
      }
      
      setLastScannedId(qrData.user_id || qrData.id || attendanceTargetId);
      
      // Record attendance — use the admin-configured cutoff time
      const cutoff = await getAttendanceCutoffTime();
      const status = isPastCutoffTime(cutoff) ? 'late' : 'present';

      await recordAttendance(
        attendanceTargetId,
        status,
        1,
        {
          source: 'qr-scanner',
          type: 'qr_code',
          scanned_at: new Date().toISOString(),
          metadata: {
            name: qrData.name,
            employee_id: qrData.employee_id,
            category: qrData.category,
          },
        },
        undefined,
        'qr-scan',
      );

      setScanResult({ success: true, name: qrData.name, employeeId: qrData.employee_id });
      playSuccessSound();
      try { navigator.vibrate?.(60); } catch {}

      setRecentScans((prev) => {
        const next = [{ id: attendanceTargetId, name: qrData.name, employeeId: qrData.employee_id, time: Date.now() }, ...prev.filter(r => r.id !== attendanceTargetId)];
        return next.slice(0, 6);
      });

      toast({
        title: "✓ Attendance Recorded",
        description: `Welcome, ${qrData.name}! Status: ${status}`,
      });

      onScanComplete?.({ success: true, name: qrData.name, userId: attendanceTargetId });

      // Parent channels + local/background push in one unified flow
      sendAutoParentNotification(attendanceTargetId, qrData.name, status).catch(() => undefined);

      // Keep scanning continuously; just clear visual badge quickly.
      setTimeout(() => {
        setScanResult(null);
      }, 1200);

      setTimeout(() => {
        setLastScannedId(null);
      }, 1000);

    } catch (err) {
      console.error('QR processing error:', err);
      setScanResult({ success: false });
      toast({
        title: "QR Scan Failed",
        description: "Unable to verify this card right now. Try again.",
        variant: "destructive"
      });
      
      setTimeout(() => {
        setScanResult(null);
      }, 900);
    } finally {
      isProcessingScanRef.current = false;
    }
  };

  const startScanning = () => {
    if (isLoopActiveRef.current) return;
    setIsScanning(true);
    setScanResult(null);

    isLoopActiveRef.current = true;
    inFlightDecodeRef.current = false;
    frameCounterRef.current = 0;

    startAutoFocusLoop();

    const loop = async (timestamp: number) => {
      if (!isLoopActiveRef.current) return;
      if (timestamp - lastFrameAtRef.current >= SCAN_FRAME_INTERVAL_MS) {
        lastFrameAtRef.current = timestamp;
        await detectQRCode();
      }
      if (isLoopActiveRef.current) {
        rafRef.current = requestAnimationFrame(loop);
      }
    };

    rafRef.current = requestAnimationFrame(loop);
  };

  const stopScanning = () => {
    setIsScanning(false);
    isLoopActiveRef.current = false;
    inFlightDecodeRef.current = false;
    isProcessingScanRef.current = false;
    stopAutoFocusLoop();
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      isLoopActiveRef.current = false;
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
      stopAutoFocusLoop();
    };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      startScanning();
    }, 300);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Detect torch capability whenever the stream changes
  useEffect(() => {
    const id = window.setInterval(() => {
      const stream = webcamRef.current?.video?.srcObject as MediaStream | null;
      const track = stream?.getVideoTracks?.()[0];
      if (!track) return;
      const caps: any = track.getCapabilities?.() ?? {};
      setTorchSupported(!!caps.torch);
    }, 800);
    return () => window.clearInterval(id);
  }, [facingMode]);

  const toggleTorch = useCallback(async () => {
    const stream = webcamRef.current?.video?.srcObject as MediaStream | null;
    const track = stream?.getVideoTracks?.()[0];
    if (!track) return;
    try {
      const next = !torchOn;
      await track.applyConstraints({ advanced: [{ torch: next } as any] });
      setTorchOn(next);
    } catch {
      toast({ title: 'Flash not supported', description: 'This camera does not support torch.', variant: 'destructive' });
    }
  }, [torchOn, toast]);

  const toggleFullscreen = useCallback(async () => {
    const el = containerRef.current;
    if (!el) return;
    try {
      if (!document.fullscreenElement) {
        await el.requestFullscreen?.();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen?.();
        setIsFullscreen(false);
      }
    } catch {}
  }, []);

  useEffect(() => {
    const onFs = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  return (
    <div ref={containerRef} className="relative w-full">
      <canvas ref={canvasRef} className="hidden" />

      {/* Scanner Container */}
      <div className="relative aspect-[3/4] sm:aspect-video rounded-3xl overflow-hidden bg-slate-950 shadow-2xl shadow-purple-500/20 ring-1 ring-purple-500/20">
        {/* Webcam Feed */}
        <Webcam
          ref={webcamRef}
          audio={false}
          screenshotFormat="image/jpeg"
          className="absolute inset-0 w-full h-full object-cover"
          videoConstraints={{
            facingMode,
            width: { ideal: 1920, min: 1280 },
            height: { ideal: 1080, min: 720 },
            frameRate: { ideal: 30, min: 24 },
          }}
        />

        {/* Vignette + subtle grid */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_45%,rgba(0,0,0,0.65)_100%)]" />

        {/* Top bar */}
        <div className="absolute top-3 left-3 right-3 z-30 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900/70 backdrop-blur-md border border-white/10">
            <div className={`w-2 h-2 rounded-full ${isScanning ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
            <span className="text-xs font-semibold text-white/90 tracking-wide">
              {isScanning ? 'LIVE SCANNING' : 'CAMERA READY'}
            </span>
            {focusAssistEnabled && (
              <Badge className="h-5 px-1.5 text-[10px] bg-emerald-500/20 text-emerald-200 border-emerald-400/30">AF</Badge>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {torchSupported && (
              <button
                onClick={toggleTorch}
                aria-label="Toggle flash"
                className={`h-9 w-9 rounded-full grid place-items-center backdrop-blur-md border border-white/10 transition ${torchOn ? 'bg-yellow-400/90 text-slate-900' : 'bg-slate-900/70 text-white/90 hover:bg-slate-800/80'}`}
              >
                {torchOn ? <Zap className="w-4 h-4" /> : <ZapOff className="w-4 h-4" />}
              </button>
            )}
            <button
              onClick={() => setFacingMode(f => (f === 'user' ? 'environment' : 'user'))}
              aria-label="Flip camera"
              className="h-9 w-9 rounded-full grid place-items-center bg-slate-900/70 text-white/90 hover:bg-slate-800/80 backdrop-blur-md border border-white/10 transition"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={toggleFullscreen}
              aria-label="Toggle fullscreen"
              className="h-9 w-9 rounded-full grid place-items-center bg-slate-900/70 text-white/90 hover:bg-slate-800/80 backdrop-blur-md border border-white/10 transition"
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Scanning Frame */}
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          <motion.div
            className="relative w-[68%] max-w-[360px] aspect-square"
            animate={{ scale: [1, 1.015, 1] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
          >
            {/* Corner brackets */}
            <span className="absolute -top-0.5 -left-0.5 w-10 h-10 border-t-[3px] border-l-[3px] border-white rounded-tl-2xl" />
            <span className="absolute -top-0.5 -right-0.5 w-10 h-10 border-t-[3px] border-r-[3px] border-white rounded-tr-2xl" />
            <span className="absolute -bottom-0.5 -left-0.5 w-10 h-10 border-b-[3px] border-l-[3px] border-white rounded-bl-2xl" />
            <span className="absolute -bottom-0.5 -right-0.5 w-10 h-10 border-b-[3px] border-r-[3px] border-white rounded-br-2xl" />

            {/* Moving scan line */}
            <motion.div
              className="absolute left-3 right-3 h-[2px] rounded-full bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_18px_2px_rgba(52,211,153,0.85)]"
              animate={{ top: ['6%', '94%', '6%'] }}
              transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
            />
          </motion.div>
        </div>

        {/* Hint */}
        <div className="absolute bottom-4 left-0 right-0 z-10 text-center px-6">
          <p className="text-sm sm:text-base font-medium text-white/90 drop-shadow">
            Show your QR — phone screen or ID card
          </p>
          <p className="text-xs text-white/60 mt-0.5">Smart scan · multiple students supported · no tap needed</p>
          {lowLight && torchSupported && !torchOn && (
            <button
              onClick={toggleTorch}
              className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-yellow-400/90 text-slate-900 text-xs font-semibold shadow"
            >
              <Zap className="w-3 h-3" /> Low light — tap for flash
            </button>
          )}
        </div>


        {/* Success/Error Overlay */}
        <AnimatePresence>
          {scanResult && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className={`absolute inset-0 z-20 flex items-center justify-center backdrop-blur-sm ${
                scanResult.success ? 'bg-emerald-950/60' : 'bg-red-950/60'
              }`}
            >
              <motion.div
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                transition={{ type: 'spring', damping: 16, stiffness: 260 }}
                className="text-center px-6"
              >
                {scanResult.success ? (
                  <>
                    <motion.div
                      className="w-24 h-24 mx-auto rounded-full bg-emerald-500/25 ring-4 ring-emerald-400/40 flex items-center justify-center mb-4"
                      animate={{ scale: [1, 1.08, 1] }}
                      transition={{ duration: 1.2, repeat: Infinity }}
                    >
                      <CheckCircle className="w-12 h-12 text-emerald-300" />
                    </motion.div>
                    <p className="text-2xl font-bold text-emerald-200 tracking-wide">Attendance Marked</p>
                    <p className="text-lg text-white/95 mt-1">{scanResult.name}</p>
                    {scanResult.employeeId && (
                      <p className="text-xs text-white/70 mt-0.5">ID: {scanResult.employeeId}</p>
                    )}
                  </>
                ) : (
                  <>
                    <div className="w-24 h-24 mx-auto rounded-full bg-red-500/25 ring-4 ring-red-400/40 flex items-center justify-center mb-4">
                      <AlertCircle className="w-12 h-12 text-red-300" />
                    </div>
                    <p className="text-2xl font-bold text-red-200">Invalid QR</p>
                  </>
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Recent scans */}
      {recentScans.length > 0 && (
        <div className="mt-5">
          <div className="flex items-center justify-between mb-2 px-1">
            <p className="text-sm font-semibold text-foreground/80 flex items-center gap-1.5">
              <Clock className="w-4 h-4" /> Recent scans
            </p>
            <span className="text-xs text-muted-foreground">{recentScans.length}</span>
          </div>
          <div className="space-y-2">
            <AnimatePresence initial={false}>
              {recentScans.map((r) => (
                <motion.div
                  key={`${r.id}-${r.time}`}
                  layout
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className="flex items-center gap-3 p-3 rounded-2xl bg-card border border-border/60 shadow-sm"
                >
                  <div className="h-9 w-9 rounded-full bg-emerald-500/15 text-emerald-600 grid place-items-center">
                    <User className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{r.name}</p>
                    {r.employeeId && <p className="text-xs text-muted-foreground truncate">ID: {r.employeeId}</p>}
                  </div>
                  <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/15">
                    <ShieldCheck className="w-3 h-3 mr-1" /> Marked
                  </Badge>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* Optional manual controls — hidden in kiosk mode */}
      {!hideManualControls && (
        <div className="flex flex-wrap gap-3 mt-5 justify-center">
          <Button
            variant="outline"
            onClick={() => setFacingMode(f => (f === 'user' ? 'environment' : 'user'))}
          >
            <RefreshCw className="w-4 h-4 mr-2" /> Flip Camera
          </Button>
          <Button
            variant={isScanning ? 'destructive' : 'default'}
            onClick={isScanning ? stopScanning : startScanning}
          >
            <Scan className="w-4 h-4 mr-2" />
            {isScanning ? 'Pause' : 'Resume'}
          </Button>
        </div>
      )}
    </div>
  );
};

export default QRCodeScanner;
