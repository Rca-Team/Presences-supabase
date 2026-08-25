import React, { useRef, useState, useEffect, useCallback } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { motion, AnimatePresence } from 'framer-motion';
import { useOptimizedFaceRecognition } from '@/hooks/useOptimizedFaceRecognition';
import AttendanceResult from './AttendanceResult';
import { loadOptimizedModels } from '@/services/face-recognition/OptimizedModelService';
import { 
  Camera, 
  FlipHorizontal, 
  Zap, 
  RefreshCw, 
  CheckCircle2, 
  XCircle, 
  User,
  Loader2,
  Scan,
  Volume2
} from 'lucide-react';
import * as faceapi from 'face-api.js';

interface MobileAttendanceCaptureProps {
  onComplete?: () => void;
}

const MobileAttendanceCapture: React.FC<MobileAttendanceCaptureProps> = ({ onComplete }) => {
  const { toast } = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
  const [isLoading, setIsLoading] = useState(true);
  const [cameraReady, setCameraReady] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [detectedFaces, setDetectedFaces] = useState<number>(0);
  const [captureFlash, setCaptureFlash] = useState(false);
  const [processingState, setProcessingState] = useState<'idle' | 'capturing' | 'processing' | 'success' | 'error'>('idle');
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [recognizedPerson, setRecognizedPerson] = useState<any>(null);
  
  const {
    processFace,
    isProcessing,
    isModelLoading,
    result,
    error,
    resetProcessing
  } = useOptimizedFaceRecognition();

  // Initialize camera
  const initCamera = useCallback(async () => {
    try {
      setIsLoading(true);
      
      // Stop existing stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }

      const constraints: MediaStreamConstraints = {
        video: {
          facingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setCameraReady(true);
      }
      
      // Load face detection models
      await loadOptimizedModels();
    } catch (err) {
      console.error('Camera error:', err);
      toast({
        title: "Camera Error",
        description: "Unable to access camera. Please check permissions.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [facingMode, toast]);

  useEffect(() => {
    initCamera();
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [initCamera]);

  // Real-time face detection
  useEffect(() => {
    let isDetecting = false;
    let intervalId: number;

    const detectFaces = async () => {
      if (!videoRef.current || !cameraReady || isProcessing || isDetecting) return;
      
      isDetecting = true;
      try {
        const detections = await faceapi
          .detectAllFaces(videoRef.current, new faceapi.TinyFaceDetectorOptions({ 
            inputSize: 160, 
            scoreThreshold: 0.5 
          }));
        
        setDetectedFaces(detections.length);
        
        // Draw detection overlay
        if (canvasRef.current && videoRef.current) {
          const canvas = canvasRef.current;
          const displaySize = { 
            width: videoRef.current.videoWidth, 
            height: videoRef.current.videoHeight 
          };
          faceapi.matchDimensions(canvas, displaySize);
          
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            if (!displaySize.width || !displaySize.height) {
              return;
            }
            const safeDetections = detections.filter((d) => {
              const b = d?.box;
              return Number.isFinite(b?.x) && Number.isFinite(b?.y) && Number.isFinite(b?.width) && Number.isFinite(b?.height);
            });
            const resizedDetections = faceapi.resizeResults(safeDetections, displaySize);
            resizedDetections.forEach(detection => {
              const box = detection.box;
              
              // Draw animated corners
              ctx.strokeStyle = detections.length === 1 ? '#22c55e' : '#eab308';
              ctx.lineWidth = 3;
              const cornerSize = 20;
              
              // Top-left
              ctx.beginPath();
              ctx.moveTo(box.x, box.y + cornerSize);
              ctx.lineTo(box.x, box.y);
              ctx.lineTo(box.x + cornerSize, box.y);
              ctx.stroke();
              
              // Top-right
              ctx.beginPath();
              ctx.moveTo(box.x + box.width - cornerSize, box.y);
              ctx.lineTo(box.x + box.width, box.y);
              ctx.lineTo(box.x + box.width, box.y + cornerSize);
              ctx.stroke();
              
              // Bottom-left
              ctx.beginPath();
              ctx.moveTo(box.x, box.y + box.height - cornerSize);
              ctx.lineTo(box.x, box.y + box.height);
              ctx.lineTo(box.x + cornerSize, box.y + box.height);
              ctx.stroke();
              
              // Bottom-right
              ctx.beginPath();
              ctx.moveTo(box.x + box.width - cornerSize, box.y + box.height);
              ctx.lineTo(box.x + box.width, box.y + box.height);
              ctx.lineTo(box.x + box.width, box.y + box.height - cornerSize);
              ctx.stroke();
            });
          }
        }
      } catch (err) {
        console.warn('Detection error:', err);
      } finally {
        isDetecting = false;
      }
    };

    if (cameraReady && !isProcessing) {
      intervalId = window.setInterval(detectFaces, 500);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [cameraReady, isProcessing]);

  const handleCapture = async () => {
    if (!videoRef.current || isProcessing || detectedFaces === 0) {
      toast({
        title: "No Face Detected",
        description: "Please position your face in the frame",
        variant: "destructive",
      });
      return;
    }

    try {
      setProcessingState('capturing');
      setCaptureFlash(true);
      setTimeout(() => setCaptureFlash(false), 200);

      // Haptic feedback on mobile
      if ('vibrate' in navigator) {
        navigator.vibrate(50);
      }

      // Capture frame
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Cannot get canvas context');
      
      ctx.drawImage(videoRef.current, 0, 0);
      const imageDataUrl = canvas.toDataURL('image/jpeg', 0.9);
      setCapturedImage(imageDataUrl);
      
      setProcessingState('processing');
      
      // Process face
      const img = new Image();
      img.src = imageDataUrl;
      await new Promise<void>(resolve => { img.onload = () => resolve(); });
      
      const recognitionResult = await processFace(img, {
        enableMultipleFaces: false,
        enableTracking: false
      });

      if (recognitionResult?.type === 'single' && recognitionResult.single) {
        const single = recognitionResult.single;
        
        if (single.recognized && single.employee) {
          setProcessingState('success');
          setRecognizedPerson(single.employee);
          
          // Success haptic
          if ('vibrate' in navigator) {
            navigator.vibrate([100, 50, 100]);
          }
          
          toast({
            title: "Attendance Recorded",
            description: `${single.employee.name} marked as ${single.status}`,
          });
        } else {
          setProcessingState('error');
          toast({
            title: "Face Not Recognized",
            description: "This person is not registered in the system",
            variant: "destructive",
          });
        }
      } else {
        setProcessingState('error');
      }
    } catch (err) {
      console.error('Capture error:', err);
      setProcessingState('error');
      toast({
        title: "Error",
        description: "Failed to process face. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleReset = () => {
    setProcessingState('idle');
    setCapturedImage(null);
    setRecognizedPerson(null);
    resetProcessing();
  };

  const toggleCamera = () => {
    setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
  };

  return (
    <div className="relative flex flex-col h-[100dvh] bg-background">
      {/* Camera View */}
      <div className="relative flex-1 overflow-hidden bg-black">
        {/* Video Feed */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`absolute inset-0 w-full h-full object-cover ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`}
        />
        
        {/* Detection Overlay */}
        <canvas
          ref={canvasRef}
          className={`absolute inset-0 w-full h-full pointer-events-none ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`}
        />
        
        {/* Capture Flash */}
        <AnimatePresence>
          {captureFlash && (
            <motion.div
              initial={{ opacity: 1 }}
              animate={{ opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0 bg-white z-20"
            />
          )}
        </AnimatePresence>

        {/* Status Badge */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
          <Badge 
            variant={detectedFaces === 1 ? "default" : detectedFaces > 1 ? "secondary" : "outline"}
            className="px-4 py-2 text-sm font-medium backdrop-blur-sm bg-background/80"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Initializing...
              </>
            ) : detectedFaces === 0 ? (
              <>
                <Scan className="h-4 w-4 mr-2" />
                Position your face
              </>
            ) : detectedFaces === 1 ? (
              <>
                <CheckCircle2 className="h-4 w-4 mr-2 text-green-500" />
                Face detected - Ready
              </>
            ) : (
              <>
                <User className="h-4 w-4 mr-2" />
                {detectedFaces} faces detected
              </>
            )}
          </Badge>
        </div>

        {/* Camera Controls */}
        <div className="absolute top-4 right-4 z-10 flex flex-col gap-2">
          <Button
            variant="secondary"
            size="icon"
            onClick={toggleCamera}
            className="h-12 w-12 rounded-full backdrop-blur-sm bg-background/80"
          >
            <FlipHorizontal className="h-5 w-5" />
          </Button>
        </div>

        {/* Processing Overlay */}
        <AnimatePresence>
          {processingState !== 'idle' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-30 flex items-center justify-center bg-background/90 backdrop-blur-sm"
            >
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="flex flex-col items-center gap-6 p-8"
              >
                {processingState === 'capturing' && (
                  <>
                    <Loader2 className="h-16 w-16 animate-spin text-primary" />
                    <p className="text-lg font-medium">Capturing...</p>
                  </>
                )}
                
                {processingState === 'processing' && (
                  <>
                    <div className="relative">
                      <Loader2 className="h-16 w-16 animate-spin text-primary" />
                      <Zap className="h-6 w-6 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-primary" />
                    </div>
                    <p className="text-lg font-medium">Processing face...</p>
                  </>
                )}
                
                {processingState === 'success' && recognizedPerson && (
                  <>
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', bounce: 0.5 }}
                    >
                      <CheckCircle2 className="h-20 w-20 text-green-500" />
                    </motion.div>
                    <div className="text-center">
                      <p className="text-2xl font-bold">{recognizedPerson.name}</p>
                      <p className="text-muted-foreground">{recognizedPerson.employee_id}</p>
                      <Badge className="mt-2 bg-green-500 text-white">
                        Attendance Recorded
                      </Badge>
                    </div>
                    <Button onClick={handleReset} className="mt-4">
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Scan Another
                    </Button>
                  </>
                )}
                
                {processingState === 'error' && (
                  <>
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', bounce: 0.5 }}
                    >
                      <XCircle className="h-20 w-20 text-destructive" />
                    </motion.div>
                    <div className="text-center">
                      <p className="text-xl font-bold">Not Recognized</p>
                      <p className="text-muted-foreground">This person is not registered</p>
                    </div>
                    <Button onClick={handleReset} variant="outline" className="mt-4">
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Try Again
                    </Button>
                  </>
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Face Guide Overlay */}
        {processingState === 'idle' && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="relative w-64 h-80 border-2 border-dashed border-primary/50 rounded-[40%]">
              <div className="absolute inset-0 animate-pulse border-4 border-transparent rounded-[40%]" 
                   style={{ 
                     background: 'linear-gradient(90deg, hsl(var(--primary)/0.3), transparent, hsl(var(--primary)/0.3)) border-box'
                   }} 
              />
            </div>
          </div>
        )}
      </div>

      {/* Bottom Controls */}
      <div className="safe-area-bottom bg-background border-t p-4">
        <div className="max-w-md mx-auto">
          {processingState === 'idle' && (
            <Button
              onClick={handleCapture}
              disabled={isLoading || detectedFaces === 0 || isProcessing}
              className="w-full h-14 text-lg font-semibold rounded-full"
              size="lg"
            >
              {isLoading ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                <>
                  <Camera className="h-6 w-6 mr-2" />
                  Mark Attendance
                </>
              )}
            </Button>
          )}
          
          <p className="text-center text-xs text-muted-foreground mt-3">
            Position your face within the guide and tap to mark attendance
          </p>
        </div>
      </div>
    </div>
  );
};

export default MobileAttendanceCapture;
