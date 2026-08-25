import React, { useRef, useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, CheckCircle2, RotateCcw, ArrowUp, ArrowLeft, ArrowRight, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getFaceDescriptorFromImage } from '@/services/face-recognition/OptimizedRegistrationService';

interface CapturedAngle {
  label: string;
  icon: React.ReactNode;
  instruction: string;
  image: string | null;
  descriptor: Float32Array | null;
}

interface MultiAngleCaptureProps {
  onComplete: (averagedDescriptor: Float32Array, primaryImage: string) => void;
  isModelLoading: boolean;
}

const ANGLES: Omit<CapturedAngle, 'image' | 'descriptor'>[] = [
  { label: 'Front', icon: <User className="h-5 w-5" />, instruction: 'Look straight at the camera' },
  { label: 'Left', icon: <ArrowLeft className="h-5 w-5" />, instruction: 'Turn your head slightly left' },
  { label: 'Right', icon: <ArrowRight className="h-5 w-5" />, instruction: 'Turn your head slightly right' },
  { label: 'Up', icon: <ArrowUp className="h-5 w-5" />, instruction: 'Tilt your chin slightly up' },
];

const MultiAngleCapture: React.FC<MultiAngleCaptureProps> = ({ onComplete, isModelLoading }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [currentAngle, setCurrentAngle] = useState(0);
  const [captures, setCaptures] = useState<CapturedAngle[]>(
    ANGLES.map(a => ({ ...a, image: null, descriptor: null }))
  );
  const [isCapturing, setIsCapturing] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);

  useEffect(() => {
    const startCamera = async () => {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }
        });
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
          await videoRef.current.play();
          setCameraReady(true);
        }
        setStream(mediaStream);
      } catch {
        console.error('Camera access failed');
      }
    };
    startCamera();
    return () => { stream?.getTracks().forEach(t => t.stop()); };
  }, []);

  const captureCurrentAngle = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || isModelLoading || isCapturing) return;
    setIsCapturing(true);

    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(video, 0, 0);
      const imageData = canvas.toDataURL('image/png');

      const descriptor = await getFaceDescriptorFromImage(video);
      if (!descriptor) {
        setIsCapturing(false);
        return null;
      }

      const updated = [...captures];
      updated[currentAngle] = { ...updated[currentAngle], image: imageData, descriptor };
      setCaptures(updated);

      // Move to next uncaptured angle or finish
      const nextEmpty = updated.findIndex((c, i) => i > currentAngle && !c.image);
      if (nextEmpty !== -1) {
        setCurrentAngle(nextEmpty);
      } else {
        // Check if all are captured
        const allCaptured = updated.every(c => c.descriptor);
        if (allCaptured) {
          // Average all descriptors
          const descriptors = updated.map(c => c.descriptor!);
          const averaged = new Float32Array(descriptors[0].length);
          for (let i = 0; i < averaged.length; i++) {
            averaged[i] = descriptors.reduce((sum, d) => sum + d[i], 0) / descriptors.length;
          }
          onComplete(averaged, updated[0].image!);
        }
      }
    } catch (err) {
      console.error('Capture error:', err);
    } finally {
      setIsCapturing(false);
    }
  }, [currentAngle, captures, isModelLoading, isCapturing, onComplete]);

  const retakeAngle = (index: number) => {
    const updated = [...captures];
    updated[index] = { ...ANGLES[index], image: null, descriptor: null };
    setCaptures(updated);
    setCurrentAngle(index);
  };

  const completedCount = captures.filter(c => c.image).length;
  const allDone = completedCount === 4;

  return (
    <div className="space-y-4">
      {/* Progress dots */}
      <div className="flex items-center justify-center gap-3 mb-2">
        {captures.map((cap, i) => (
          <button
            key={i}
            onClick={() => !cap.image && setCurrentAngle(i)}
            className={`flex flex-col items-center gap-1 transition-all ${
              i === currentAngle ? 'scale-110' : 'opacity-60'
            }`}
          >
            <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-colors ${
              cap.image
                ? 'bg-green-500 border-green-500 text-white'
                : i === currentAngle
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-muted-foreground/30 text-muted-foreground'
            }`}>
              {cap.image ? <CheckCircle2 className="h-5 w-5" /> : cap.icon}
            </div>
            <span className="text-[10px] font-medium text-muted-foreground">{cap.label}</span>
          </button>
        ))}
      </div>

      {/* Camera view */}
      <div className="relative rounded-xl overflow-hidden bg-black aspect-[4/3]">
        <video
          ref={videoRef}
          muted
          playsInline
          className="w-full h-full object-cover"
          style={{ transform: 'scaleX(-1)' }}
        />
        <canvas ref={canvasRef} className="hidden" />

        {/* Instruction overlay */}
        {!allDone && cameraReady && (
          <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-4">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentAngle}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="text-center"
              >
                <p className="text-white font-semibold text-lg flex items-center justify-center gap-2">
                  {captures[currentAngle].icon}
                  {captures[currentAngle].label} View
                </p>
                <p className="text-white/70 text-sm">{captures[currentAngle].instruction}</p>
              </motion.div>
            </AnimatePresence>
          </div>
        )}

        {/* Face guide oval */}
        {!allDone && cameraReady && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-48 h-60 border-2 border-dashed border-white/40 rounded-[50%]" />
          </div>
        )}

        {isModelLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
            <div className="text-center text-white">
              <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <p className="text-sm">Loading face models...</p>
            </div>
          </div>
        )}
      </div>

      {/* Capture button */}
      {!allDone && cameraReady && !isModelLoading && (
        <Button
          onClick={captureCurrentAngle}
          disabled={isCapturing}
          className="w-full h-12 text-base bg-gradient-to-r from-blue-600 to-blue-500"
        >
          {isCapturing ? (
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
          ) : (
            <Camera className="h-5 w-5 mr-2" />
          )}
          Capture {captures[currentAngle].label} ({completedCount}/4)
        </Button>
      )}

      {/* Captured thumbnails */}
      {completedCount > 0 && (
        <div className="grid grid-cols-4 gap-2">
          {captures.map((cap, i) => (
            <div key={i} className="relative group">
              {cap.image ? (
                <>
                  <img
                    src={cap.image}
                    alt={cap.label}
                    className="w-full aspect-square object-cover rounded-lg border-2 border-green-500"
                    style={{ transform: 'scaleX(-1)' }}
                  />
                  <button
                    onClick={() => retakeAngle(i)}
                    className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center"
                  >
                    <RotateCcw className="h-4 w-4 text-white" />
                  </button>
                  <span className="absolute bottom-0.5 left-0.5 text-[9px] bg-green-500 text-white px-1 rounded">
                    {cap.label}
                  </span>
                </>
              ) : (
                <div className="w-full aspect-square rounded-lg border-2 border-dashed border-muted-foreground/30 flex items-center justify-center">
                  <span className="text-[10px] text-muted-foreground">{cap.label}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* All done message */}
      {allDone && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center p-4 bg-green-500/10 border border-green-500/20 rounded-xl"
        >
          <CheckCircle2 className="h-8 w-8 text-green-500 mx-auto mb-2" />
          <p className="font-semibold text-green-600 dark:text-green-400">All 4 angles captured!</p>
          <p className="text-sm text-muted-foreground">Face descriptor averaged for maximum accuracy</p>
        </motion.div>
      )}
    </div>
  );
};

export default MultiAngleCapture;
