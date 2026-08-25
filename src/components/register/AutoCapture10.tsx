import React, { useRef, useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, CheckCircle2, RotateCcw, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getFaceDescriptorFromImage } from '@/services/face-recognition/OptimizedRegistrationService';

interface AutoCapture10Props {
  onComplete: (
    averagedDescriptor: Float32Array,
    primaryImage: string,
    rawDescriptors: Float32Array[],
    rawImages: string[]
  ) => void;
  isModelLoading: boolean;
  totalShots?: number;
  durationMs?: number;
}

/**
 * Auto-captures N face descriptors over a few seconds while the user slowly
 * turns their head. Designed for fast 50+ student onboarding.
 */
const AutoCapture10: React.FC<AutoCapture10Props> = ({
  onComplete,
  isModelLoading,
  totalShots = 10,
  durationMs = 5000,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const runningRef = useRef(false);

  const [cameraReady, setCameraReady] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [shots, setShots] = useState<{ image: string; descriptor: Float32Array }[]>([]);
  const [hint, setHint] = useState('Tap Start, then slowly turn your head');

  // Start camera
  useEffect(() => {
    const start = async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        });
        streamRef.current = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          await videoRef.current.play();
          setCameraReady(true);
        }
      } catch (e) {
        console.error('Camera start failed:', e);
      }
    };
    start();
    return () => {
      runningRef.current = false;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const HINTS = [
    'Look straight ahead 👀',
    'Slowly turn left ⬅️',
    'Now turn right ➡️',
    'Tilt up slightly ⬆️',
    'Tilt down slightly ⬇️',
    'Smile! 😄',
    'Almost done…',
  ];

  const captureOne = useCallback(async (): Promise<{ image: string; descriptor: Float32Array } | null> => {
    if (!videoRef.current || !canvasRef.current) return null;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0);
    const image = canvas.toDataURL('image/jpeg', 0.9);
    try {
      const descriptor = await getFaceDescriptorFromImage(video);
      if (!descriptor) return null;
      return { image, descriptor };
    } catch {
      return null;
    }
  }, []);

  const start = useCallback(async () => {
    if (isRunning || done || isModelLoading || !cameraReady) return;
    setIsRunning(true);
    runningRef.current = true;
    setShots([]);
    setHint(HINTS[0]);

    const interval = Math.floor(durationMs / totalShots);
    const collected: { image: string; descriptor: Float32Array }[] = [];

    for (let i = 0; i < totalShots * 3 && collected.length < totalShots; i++) {
      if (!runningRef.current) break;
      // Update guidance hint progressively
      const hintIdx = Math.min(
        HINTS.length - 1,
        Math.floor((collected.length / totalShots) * HINTS.length)
      );
      setHint(HINTS[hintIdx]);

      const shot = await captureOne();
      if (shot) {
        collected.push(shot);
        setShots([...collected]);
      }
      // Small wait between attempts
      await new Promise((r) => setTimeout(r, interval));
    }

    runningRef.current = false;
    setIsRunning(false);

    if (collected.length < 4) {
      setHint('Not enough faces detected. Tap Retry and stay in frame.');
      return;
    }

    // Average all descriptors
    const averaged = new Float32Array(collected[0].descriptor.length);
    for (let i = 0; i < averaged.length; i++) {
      let s = 0;
      for (const c of collected) s += c.descriptor[i];
      averaged[i] = s / collected.length;
    }

    setDone(true);
    setHint(`Captured ${collected.length} samples!`);
    onComplete(
      averaged,
      collected[0].image,
      collected.map((c) => c.descriptor),
      collected.map((c) => c.image)
    );
  }, [captureOne, cameraReady, done, durationMs, isModelLoading, isRunning, onComplete, totalShots]);

  const reset = useCallback(() => {
    setShots([]);
    setDone(false);
    setHint('Tap Start, then slowly turn your head');
  }, []);

  const progress = Math.min(100, Math.round((shots.length / totalShots) * 100));

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Sparkles className="h-4 w-4 text-primary" />
          <span>Auto-Capture: {shots.length}/{totalShots} samples</span>
        </div>
        <div className="text-xs text-muted-foreground">~{Math.round(durationMs / 1000)}s</div>
      </div>

      {/* Progress bar */}
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <motion.div
          className="h-full bg-gradient-to-r from-cyan-500 to-violet-500"
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>

      {/* Camera */}
      <div className="relative rounded-xl overflow-hidden bg-black aspect-[4/3]">
        <video
          ref={videoRef}
          muted
          playsInline
          className="w-full h-full object-cover"
          style={{ transform: 'scaleX(-1)' }}
        />
        <canvas ref={canvasRef} className="hidden" />

        {/* Face guide oval */}
        {!done && cameraReady && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <motion.div
              animate={{ scale: isRunning ? [1, 1.04, 1] : 1 }}
              transition={{ duration: 1.2, repeat: Infinity }}
              className="w-48 h-60 border-2 border-dashed border-white/50 rounded-[50%]"
            />
          </div>
        )}

        {/* Hint overlay */}
        {cameraReady && (
          <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-4 text-center">
            <AnimatePresence mode="wait">
              <motion.p
                key={hint}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="text-white font-semibold"
              >
                {hint}
              </motion.p>
            </AnimatePresence>
          </div>
        )}

        {/* Loading overlay */}
        {isModelLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
            <div className="text-center text-white">
              <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <p className="text-sm">Loading face models…</p>
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      {!done && (
        <Button
          onClick={start}
          disabled={isRunning || !cameraReady || isModelLoading}
          className="w-full h-12 text-base bg-gradient-to-r from-cyan-600 to-violet-600 hover:opacity-90"
        >
          {isRunning ? (
            <>
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
              Capturing…
            </>
          ) : (
            <>
              <Camera className="h-5 w-5 mr-2" />
              Start Auto-Capture (10 photos)
            </>
          )}
        </Button>
      )}

      {done && (
        <div className="flex gap-2">
          <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-lg bg-green-500/10 border border-green-500/30 text-green-700 dark:text-green-400">
            <CheckCircle2 className="h-5 w-5" />
            <span className="text-sm font-semibold">Captured {shots.length} samples</span>
          </div>
          <Button variant="outline" onClick={reset}>
            <RotateCcw className="h-4 w-4 mr-1" />
            Redo
          </Button>
        </div>
      )}

      {/* Thumbnails */}
      {shots.length > 0 && (
        <div className="grid grid-cols-5 gap-1.5">
          {Array.from({ length: totalShots }).map((_, i) => {
            const shot = shots[i];
            return (
              <div
                key={i}
                className={`aspect-square rounded-md overflow-hidden border-2 transition-colors ${
                  shot ? 'border-green-500' : 'border-dashed border-muted-foreground/30 bg-muted/30'
                }`}
              >
                {shot && (
                  <img
                    src={shot.image}
                    alt={`shot-${i}`}
                    className="w-full h-full object-cover"
                    style={{ transform: 'scaleX(-1)' }}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AutoCapture10;