import React, { useRef, useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, CheckCircle2, RotateCcw, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getFaceDescriptorFromImage, detectFaceInVideo, getFaceBoxFromImage } from '@/services/face-recognition/OptimizedRegistrationService';

interface Scan3DCaptureProps {
  onComplete: (
    averagedDescriptor: Float32Array,
    primaryImage: string,
    allDescriptors: Float32Array[],
    rawImages?: string[]
  ) => void;
  isModelLoading: boolean;
}

const MIN_SAMPLES = 8;
const SCAN_DURATION_MS = 8000;
const PARTICLE_COUNT = 40;

// --- Sound Engine (Web Audio API) ---
class ScanSoundEngine {
  private ctx: AudioContext | null = null;
  private sampleIndex = 0;

  private getCtx() {
    if (!this.ctx) this.ctx = new AudioContext();
    return this.ctx;
  }

  playSampleBeep() {
    try {
      const ctx = this.getCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      // Rising pitch for each successive sample
      const baseFreq = 600 + this.sampleIndex * 80;
      osc.frequency.setValueAtTime(baseFreq, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(baseFreq + 200, ctx.currentTime + 0.08);
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);

      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.12);
      this.sampleIndex++;
    } catch {}
  }

  playScanStart() {
    try {
      const ctx = this.getCtx();
      this.sampleIndex = 0;
      // Two-tone start chime
      [440, 660].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = freq;
        osc.type = 'sine';
        gain.gain.setValueAtTime(0.12, ctx.currentTime + i * 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.1 + 0.2);
        osc.start(ctx.currentTime + i * 0.1);
        osc.stop(ctx.currentTime + i * 0.1 + 0.2);
      });
    } catch {}
  }

  playComplete() {
    try {
      const ctx = this.getCtx();
      // Triumphant 3-note ascending chime
      [523, 659, 784, 1047].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = freq;
        osc.type = 'sine';
        const start = ctx.currentTime + i * 0.12;
        gain.gain.setValueAtTime(0.18, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.35);
        osc.start(start);
        osc.stop(start + 0.35);
      });
    } catch {}
  }

  playFail() {
    try {
      const ctx = this.getCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(300, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(150, ctx.currentTime + 0.3);
      osc.type = 'sawtooth';
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
    } catch {}
  }
}

// --- Particle System ---
interface Particle {
  angle: number;
  radius: number;
  speed: number;
  size: number;
  hue: number;
  alpha: number;
  drift: number;
  life: number;
  maxLife: number;
}

const createParticle = (): Particle => ({
  angle: Math.random() * Math.PI * 2,
  radius: 0.85 + Math.random() * 0.35,
  speed: (0.3 + Math.random() * 0.7) * (Math.random() > 0.5 ? 1 : -1),
  size: 1.5 + Math.random() * 3,
  hue: 160 + Math.random() * 40, // cyan-green range
  alpha: 0.3 + Math.random() * 0.7,
  drift: (Math.random() - 0.5) * 0.02,
  life: 0,
  maxLife: 60 + Math.random() * 120,
});

const Scan3DCapture: React.FC<Scan3DCaptureProps> = ({ onComplete, isModelLoading }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [samplesCollected, setSamplesCollected] = useState(0);
  const [scanComplete, setScanComplete] = useState(false);
  const [primaryImage, setPrimaryImage] = useState<string | null>(null);
  const [faceDetected, setFaceDetected] = useState(false);
  const [statusText, setStatusText] = useState('Position your face in the frame');

  const descriptorsRef = useRef<Float32Array[]>([]);
  const sampleImagesRef = useRef<string[]>([]);
  const scanStartRef = useRef<number>(0);
  const animFrameRef = useRef<number>(0);
  const scanIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const soundRef = useRef(new ScanSoundEngine());
  const particlesRef = useRef<Particle[]>([]);
  const progressRef = useRef(0);
  const scanningRef = useRef(false);
  const scanCompleteRef = useRef(false);
  const faceDetectedRef = useRef(false);

  // Keep refs in sync with state
  useEffect(() => { progressRef.current = progress; }, [progress]);
  useEffect(() => { scanningRef.current = scanning; }, [scanning]);
  useEffect(() => { scanCompleteRef.current = scanComplete; }, [scanComplete]);
  useEffect(() => { faceDetectedRef.current = faceDetected; }, [faceDetected]);

  // Start camera
  useEffect(() => {
    let mounted = true;
    const startCamera = async () => {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }
        });
        if (!mounted) { mediaStream.getTracks().forEach(t => t.stop()); return; }
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
          await videoRef.current.play();
          setCameraReady(true);
        }
        setStream(mediaStream);
      } catch { console.error('Camera access failed'); }
    };
    startCamera();
    return () => { mounted = false; stream?.getTracks().forEach(t => t.stop()); };
  }, []);

  // Face detection loop
  useEffect(() => {
    if (!cameraReady || scanning || scanComplete || isModelLoading) return;
    const interval = setInterval(async () => {
      if (videoRef.current) {
        const detected = await detectFaceInVideo(videoRef.current);
        setFaceDetected(detected);
      }
    }, 500);
    return () => clearInterval(interval);
  }, [cameraReady, scanning, scanComplete, isModelLoading]);

  // 3D scanning overlay + particles
  useEffect(() => {
    if (!overlayCanvasRef.current || !cameraReady) return;
    const canvas = overlayCanvasRef.current;
    const ctx = canvas.getContext('2d')!;
    let running = true;

    // Initialize particles
    particlesRef.current = Array.from({ length: PARTICLE_COUNT }, createParticle);

    const draw = () => {
      if (!running) return;
      const w = canvas.width = canvas.clientWidth * 2;
      const h = canvas.height = canvas.clientHeight * 2;
      ctx.clearRect(0, 0, w, h);

      const cx = w / 2;
      const cy = h / 2;
      const rx = w * 0.28;
      const ry = h * 0.38;
      const t = Date.now() / 1000;
      const isScanning = scanningRef.current;
      const prog = progressRef.current;
      const isFaceDetected = faceDetectedRef.current;
      const isComplete = scanCompleteRef.current;

      // Outer oval guide
      ctx.strokeStyle = isScanning
        ? `hsla(${142 + prog * 1.2}, 80%, 55%, ${0.5 + Math.sin(t * 3) * 0.2})`
        : isFaceDetected
          ? 'hsla(142, 70%, 50%, 0.6)'
          : 'hsla(220, 50%, 60%, 0.4)';
      ctx.lineWidth = isScanning ? 4 : 2;
      ctx.setLineDash(isScanning ? [] : [8, 8]);
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      if (isScanning) {
        const angle = (prog / 100) * Math.PI * 2 - Math.PI / 2;

        // Sweep glow
        const grad = ctx.createConicGradient(angle - 0.5, cx, cy);
        grad.addColorStop(0, 'hsla(170, 90%, 50%, 0)');
        grad.addColorStop(0.08, 'hsla(170, 90%, 50%, 0.15)');
        grad.addColorStop(0.12, 'hsla(170, 90%, 50%, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx + 20, ry + 20, 0, 0, Math.PI * 2);
        ctx.fill();

        // Scan line
        const lx = cx + Math.cos(angle) * rx;
        const ly = cy + Math.sin(angle) * ry;
        ctx.strokeStyle = 'hsla(170, 90%, 60%, 0.9)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(lx, ly);
        ctx.stroke();

        // Scan dot with glow
        ctx.shadowColor = 'hsla(170, 90%, 60%, 0.8)';
        ctx.shadowBlur = 12;
        ctx.fillStyle = 'hsla(170, 90%, 70%, 1)';
        ctx.beginPath();
        ctx.arc(lx, ly, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Progress arc
        ctx.strokeStyle = 'hsla(170, 90%, 55%, 0.8)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx + 12, ry + 12, 0, -Math.PI / 2, angle);
        ctx.stroke();

        // Sample dots on ring
        descriptorsRef.current.forEach((_, i) => {
          const sAngle = (i / MIN_SAMPLES) * Math.PI * 2 - Math.PI / 2;
          const sx = cx + Math.cos(sAngle) * (rx + 12);
          const sy = cy + Math.sin(sAngle) * (ry + 12);
          ctx.shadowColor = 'hsla(142, 80%, 55%, 0.6)';
          ctx.shadowBlur = 8;
          ctx.fillStyle = 'hsla(142, 80%, 55%, 0.9)';
          ctx.beginPath();
          ctx.arc(sx, sy, 5, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        });

        // Grid lines (3D depth effect)
        ctx.strokeStyle = 'hsla(170, 60%, 50%, 0.06)';
        ctx.lineWidth = 1;
        for (let i = -4; i <= 4; i++) {
          const offset = i * (ry / 4);
          ctx.beginPath();
          ctx.moveTo(cx - rx * 0.9, cy + offset);
          ctx.lineTo(cx + rx * 0.9, cy + offset);
          ctx.stroke();
        }
        for (let i = -4; i <= 4; i++) {
          const offset = i * (rx / 4);
          ctx.beginPath();
          ctx.moveTo(cx + offset, cy - ry * 0.9);
          ctx.lineTo(cx + offset, cy + ry * 0.9);
          ctx.stroke();
        }

        // *** PARTICLES ***
        particlesRef.current.forEach((p, idx) => {
          p.angle += p.speed * 0.02;
          p.radius += p.drift;
          p.life++;

          // Respawn dead particles
          if (p.life > p.maxLife || p.radius < 0.5 || p.radius > 1.5) {
            particlesRef.current[idx] = createParticle();
            return;
          }

          const px = cx + Math.cos(p.angle) * rx * p.radius;
          const py = cy + Math.sin(p.angle) * ry * p.radius;
          const fadeIn = Math.min(p.life / 15, 1);
          const fadeOut = Math.max(1 - (p.life / p.maxLife), 0);
          const a = p.alpha * fadeIn * fadeOut;

          // Particle glow
          ctx.shadowColor = `hsla(${p.hue}, 90%, 60%, ${a * 0.5})`;
          ctx.shadowBlur = 6;
          ctx.fillStyle = `hsla(${p.hue}, 85%, 65%, ${a})`;
          ctx.beginPath();
          ctx.arc(px, py, p.size, 0, Math.PI * 2);
          ctx.fill();

          // Tail trail
          const tx = cx + Math.cos(p.angle - p.speed * 0.06) * rx * p.radius;
          const ty = cy + Math.sin(p.angle - p.speed * 0.06) * ry * p.radius;
          ctx.strokeStyle = `hsla(${p.hue}, 80%, 60%, ${a * 0.3})`;
          ctx.lineWidth = p.size * 0.5;
          ctx.shadowBlur = 0;
          ctx.beginPath();
          ctx.moveTo(tx, ty);
          ctx.lineTo(px, py);
          ctx.stroke();
        });

        ctx.shadowBlur = 0;
      } else if (!isComplete) {
        // Pulsing corners when idle
        const cornerLen = 24;
        ctx.strokeStyle = isFaceDetected ? 'hsla(142, 70%, 50%, 0.8)' : 'hsla(220, 50%, 60%, 0.5)';
        ctx.lineWidth = 3;
        const corners = [
          [cx - rx, cy - ry], [cx + rx, cy - ry],
          [cx - rx, cy + ry], [cx + rx, cy + ry]
        ];
        corners.forEach(([x, y]) => {
          const dx = x < cx ? 1 : -1;
          const dy = y < cy ? 1 : -1;
          ctx.beginPath();
          ctx.moveTo(x + dx * cornerLen, y);
          ctx.lineTo(x, y);
          ctx.lineTo(x, y + dy * cornerLen);
          ctx.stroke();
        });

        // Idle floating particles when face detected
        if (isFaceDetected) {
          for (let i = 0; i < 8; i++) {
            const pAngle = t * 0.3 + (i / 8) * Math.PI * 2;
            const pRad = 1.05 + Math.sin(t * 2 + i) * 0.05;
            const px = cx + Math.cos(pAngle) * rx * pRad;
            const py = cy + Math.sin(pAngle) * ry * pRad;
            ctx.fillStyle = `hsla(170, 80%, 60%, ${0.3 + Math.sin(t * 3 + i) * 0.15})`;
            ctx.beginPath();
            ctx.arc(px, py, 2, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      animFrameRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => { running = false; cancelAnimationFrame(animFrameRef.current); };
  }, [cameraReady]);

  // Start 3D scan
  const startScan = useCallback(() => {
    if (!cameraReady || isModelLoading || !faceDetected) return;
    setScanning(true);
    setProgress(0);
    setSamplesCollected(0);
    descriptorsRef.current = [];
    sampleImagesRef.current = [];
    scanStartRef.current = Date.now();
    setStatusText('Slowly turn your head in a circle...');
    soundRef.current.playScanStart();

    // Capture face-only primary image for better recognition quality
    const captureImage = async () => {
      if (videoRef.current && canvasRef.current) {
        const video = videoRef.current;
        if (video.readyState >= 2 && video.videoWidth > 0) {
          const canvas = canvasRef.current;
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(video, 0, 0);

            const faceBox = await getFaceBoxFromImage(video);
            if (faceBox) {
              const pad = Math.round(Math.max(faceBox.width, faceBox.height) * 0.35);
              const sx = Math.max(0, Math.floor(faceBox.x - pad));
              const sy = Math.max(0, Math.floor(faceBox.y - pad));
              const sw = Math.min(video.videoWidth - sx, Math.floor(faceBox.width + pad * 2));
              const sh = Math.min(video.videoHeight - sy, Math.floor(faceBox.height + pad * 2));

              const out = document.createElement('canvas');
              out.width = 400;
              out.height = 400;
              const outCtx = out.getContext('2d');
              if (outCtx) {
                outCtx.drawImage(canvas, sx, sy, sw, sh, 0, 0, 400, 400);
                return out.toDataURL('image/jpeg', 0.92);
              }
            }

            return canvas.toDataURL('image/jpeg', 0.92);
          }
        }
      }
      return null;
    };

    captureImage().then((img) => {
      if (img) setPrimaryImage(img);
    });

    scanIntervalRef.current = setInterval(async () => {
      if (!videoRef.current) return;
      const elapsed = Date.now() - scanStartRef.current;
      const p = Math.min((elapsed / SCAN_DURATION_MS) * 100, 100);
      setProgress(p);

      if (p < 25) setStatusText('Look straight... now slowly turn left');
      else if (p < 50) setStatusText('Good! Keep turning... now look right');
      else if (p < 75) setStatusText('Great! Now tilt slightly up');
      else if (p < 95) setStatusText('Almost done... look straight again');
      else setStatusText('Processing your 3D face map...');

      try {
        const descriptor = await getFaceDescriptorFromImage(videoRef.current);
        if (descriptor) {
          descriptorsRef.current.push(descriptor);
          // Capture a per-sample snapshot so every training descriptor has its own image
          try {
            const v = videoRef.current;
            if (v && canvasRef.current && v.videoWidth > 0) {
              const snap = document.createElement('canvas');
              snap.width = v.videoWidth;
              snap.height = v.videoHeight;
              const sctx = snap.getContext('2d');
              if (sctx) {
                sctx.drawImage(v, 0, 0);
                sampleImagesRef.current.push(snap.toDataURL('image/jpeg', 0.9));
              }
            }
          } catch {}
          setSamplesCollected(descriptorsRef.current.length);
          soundRef.current.playSampleBeep();
        }
      } catch {}

      if (elapsed >= SCAN_DURATION_MS) {
        if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
        void finishScan();
      }
    }, 800);
  }, [cameraReady, isModelLoading, faceDetected]);

  const finishScan = useCallback(async () => {
    setScanning(false);
    const descriptors = descriptorsRef.current;

    if (descriptors.length < 3) {
      soundRef.current.playFail();
      setStatusText('Not enough face data captured. Please try again.');
      setProgress(0);
      setSamplesCollected(0);
      return;
    }

    // If primaryImage wasn't captured at start, try capturing now
    let finalImage = primaryImage;
    if (!finalImage && videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      if (video.readyState >= 2 && video.videoWidth > 0) {
        const canvas = canvasRef.current;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0);
          const faceBox = await getFaceBoxFromImage(video);
          if (faceBox) {
            const pad = Math.round(Math.max(faceBox.width, faceBox.height) * 0.35);
            const sx = Math.max(0, Math.floor(faceBox.x - pad));
            const sy = Math.max(0, Math.floor(faceBox.y - pad));
            const sw = Math.min(video.videoWidth - sx, Math.floor(faceBox.width + pad * 2));
            const sh = Math.min(video.videoHeight - sy, Math.floor(faceBox.height + pad * 2));
            const out = document.createElement('canvas');
            out.width = 400;
            out.height = 400;
            const outCtx = out.getContext('2d');
            if (outCtx) {
              outCtx.drawImage(canvas, sx, sy, sw, sh, 0, 0, 400, 400);
              finalImage = out.toDataURL('image/jpeg', 0.92);
            }
          }
          if (!finalImage) finalImage = canvas.toDataURL('image/jpeg', 0.92);
          setPrimaryImage(finalImage);
        }
      }
    }

    if (!finalImage) {
      soundRef.current.playFail();
      setStatusText('Failed to capture face image. Please try again.');
      setProgress(0);
      setSamplesCollected(0);
      return;
    }

    const averaged = new Float32Array(descriptors[0].length);
    for (let i = 0; i < averaged.length; i++) {
      averaged[i] = descriptors.reduce((sum, d) => sum + d[i], 0) / descriptors.length;
    }

    soundRef.current.playComplete();
    setScanComplete(true);
    setStatusText(`3D scan complete! ${descriptors.length} samples captured.`);
    onComplete(averaged, finalImage, descriptors, sampleImagesRef.current.slice());
  }, [onComplete, primaryImage]);

  const resetScan = () => {
    if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
    setScanComplete(false);
    setScanning(false);
    setProgress(0);
    setSamplesCollected(0);
    descriptorsRef.current = [];
    sampleImagesRef.current = [];
    setPrimaryImage(null);
    setStatusText('Position your face in the frame');
  };

  useEffect(() => {
    return () => { if (scanIntervalRef.current) clearInterval(scanIntervalRef.current); };
  }, []);

  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="relative rounded-xl overflow-hidden bg-black aspect-[3/4] sm:aspect-[4/3]">
        <video
          ref={videoRef}
          muted
          playsInline
          className="w-full h-full object-cover"
          style={{ transform: 'scaleX(-1)' }}
        />
        <canvas ref={canvasRef} className="hidden" />
        <canvas
          ref={overlayCanvasRef}
          className="absolute inset-0 w-full h-full pointer-events-none"
        />

        {/* Status text */}
        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-3 sm:p-4 pt-10 sm:pt-12">
          <AnimatePresence mode="wait">
            <motion.p
              key={statusText}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="text-center text-white font-medium text-xs sm:text-sm"
            >
              {statusText}
            </motion.p>
          </AnimatePresence>
          {scanning && (
            <div className="mt-2 flex items-center justify-center gap-2 sm:gap-3">
              <div className="flex-1 h-1.5 bg-white/20 rounded-full overflow-hidden">
                <motion.div
                  className="h-full rounded-full"
                  style={{
                    width: `${progress}%`,
                    background: 'linear-gradient(90deg, hsl(185, 90%, 50%), hsl(142, 80%, 50%))'
                  }}
                />
              </div>
              <span className="text-xs text-white/70 tabular-nums w-14 sm:w-16 text-right">
                {samplesCollected} pts
              </span>
            </div>
          )}
        </div>

        {/* Face detected indicator */}
        {!scanning && !scanComplete && cameraReady && (
          <div className={`absolute top-2 left-2 sm:top-3 sm:left-3 flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${
            faceDetected
              ? 'bg-green-500/20 text-green-300 border border-green-500/30'
              : 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30'
          }`}>
            <span className={`h-1.5 w-1.5 rounded-full ${faceDetected ? 'bg-green-400 animate-pulse' : 'bg-yellow-400'}`} />
            {faceDetected ? 'Face detected' : 'No face'}
          </div>
        )}

        {isModelLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70">
            <div className="text-center text-white">
              <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
              <p className="text-sm">Loading 3D face models...</p>
            </div>
          </div>
        )}

        {/* Scan complete overlay */}
        {scanComplete && primaryImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 bg-black/60 flex items-center justify-center"
          >
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'tween', duration: 0.4 }}
              className="text-center"
            >
              <div className="relative inline-block mb-3">
                <img
                  src={primaryImage}
                  alt="Scanned"
                  className="w-20 h-20 sm:w-28 sm:h-28 rounded-full object-cover border-2 shadow-lg"
                  style={{ transform: 'scaleX(-1)', borderColor: 'hsl(142, 70%, 50%)', boxShadow: '0 0 20px hsla(142, 70%, 50%, 0.3)' }}
                />
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.3 }}
                  className="absolute -bottom-1 -right-1 w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center"
                  style={{ background: 'hsl(142, 70%, 45%)' }}
                >
                  <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                </motion.div>
              </div>
              <p className="font-bold text-base sm:text-lg" style={{ color: 'hsl(142, 70%, 55%)' }}>3D Scan Complete</p>
              <p className="text-white/60 text-xs">{samplesCollected} depth samples averaged</p>
            </motion.div>
          </motion.div>
        )}
      </div>

      {/* Action button - larger touch target on mobile */}
      {!scanComplete ? (
        <Button
          onClick={startScan}
          disabled={!cameraReady || isModelLoading || scanning || !faceDetected}
          className="w-full h-14 sm:h-12 text-base shadow-lg active:scale-[0.98] transition-transform touch-manipulation"
          style={{ background: 'linear-gradient(135deg, hsl(185, 80%, 40%), hsl(220, 70%, 50%))' }}
        >
          {scanning ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Scanning... {Math.round(progress)}%
            </>
          ) : (
            <>
              <Camera className="h-5 w-5 mr-2" />
              {faceDetected ? 'Start 3D Face Scan' : 'Position face to start'}
            </>
          )}
        </Button>
      ) : (
        <Button
          onClick={resetScan}
          variant="outline"
          className="w-full h-14 sm:h-11 active:scale-[0.98] transition-transform touch-manipulation"
        >
          <RotateCcw className="h-4 w-4 mr-2" />
          Rescan
        </Button>
      )}
    </div>
  );
};

export default Scan3DCapture;
