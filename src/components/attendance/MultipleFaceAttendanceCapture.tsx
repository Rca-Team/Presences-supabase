import React, { useRef, useState, useEffect } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage } from '@/components/ui/avatar';
import { Camera, Users, CheckCircle, XCircle, AlertCircle, Loader2, Sparkles, SwitchCamera, RotateCcw } from 'lucide-react';
import * as faceapi from 'face-api.js';
import { loadNets } from '@/services/face-recognition/NetLoaderService';
import { recognizeFace, recordAttendance } from '@/services/face-recognition/RecognitionService';
import { getFaceDescriptor } from '@/services/face-recognition/ModelService';

interface ProcessedFace {
  id: string;
  name: string;
  status: 'present' | 'late' | 'unrecognized';
  confidence?: number;
  imageUrl?: string;
}

const STORAGE_BASE_URL = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/face-images/`;

const MultipleFaceAttendanceCapture = () => {
  const { toast } = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [modelStatus, setModelStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [previewModelReady, setPreviewModelReady] = useState(false);
  const [detectedFaces, setDetectedFaces] = useState<any[]>([]);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processedResults, setProcessedResults] = useState<ProcessedFace[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [captureFlash, setCaptureFlash] = useState(false);
  const detectionFrameRef = useRef<number>();
  const streamRef = useRef<MediaStream | null>(null);
  const lastDetectionTime = useRef<number>(0);
  const [cameraFacing, setCameraFacing] = useState<'user' | 'environment'>('user');

  // Load face-api.js models
  useEffect(() => {
    let isMounted = true;

    const loadModels = async () => {
      try {
        console.log('Loading face-api.js models...');
        
        // Load TinyFaceDetector for fast preview
        await loadNets(['tinyFaceDetector']);
        
        if (isMounted) {
          setPreviewModelReady(true);
          console.log('Preview model ready');
          startCamera();
        }

        // Load full recognition models
        await loadNets(['ssdMobilenetv1', 'faceLandmark68Net', 'faceRecognitionNet']);

        if (isMounted) {
          setModelStatus('ready');
          console.log('All recognition models ready');
          toast({
            title: "Models Ready",
            description: "Face recognition is ready to use",
            duration: 2000,
          });
        }
      } catch (err) {
        console.error('Error loading models:', err);
        if (isMounted) {
          setModelStatus('error');
          toast({
            title: "Error",
            description: "Failed to load face recognition models.",
            variant: "destructive",
          });
        }
      }
    };

    loadModels();

    return () => {
      isMounted = false;
      stopCamera();
      if (detectionFrameRef.current) {
        cancelAnimationFrame(detectionFrameRef.current);
      }
    };
  }, []);

  const startCamera = async () => {
    try {
      stopCamera();

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: cameraFacing
        }
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        
        videoRef.current.onloadedmetadata = () => {
          if (videoRef.current) {
            videoRef.current.play().catch(e => {
              console.error('Error playing video:', e);
            });
            startFaceDetection();
          }
        };
      }
    } catch (err) {
      console.error('Error starting camera:', err);
      toast({
        title: "Camera Error",
        description: "Unable to access camera. Please check permissions.",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    if (previewModelReady && !showResults) {
      startCamera();
    }
  }, [cameraFacing]);

  const toggleCamera = () => {
    setCameraFacing(prev => prev === 'user' ? 'environment' : 'user');
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };

  const startFaceDetection = () => {
    if (detectionFrameRef.current) {
      cancelAnimationFrame(detectionFrameRef.current);
    }

    const detectFaces = async () => {
      if (!videoRef.current || !canvasRef.current || isCapturing || isProcessing || showResults) {
        detectionFrameRef.current = requestAnimationFrame(detectFaces);
        return;
      }

      if (videoRef.current.videoWidth === 0 || videoRef.current.videoHeight === 0) {
        detectionFrameRef.current = requestAnimationFrame(detectFaces);
        return;
      }

      const now = performance.now();
      if (now - lastDetectionTime.current < 300) {
        detectionFrameRef.current = requestAnimationFrame(detectFaces);
        return;
      }

      lastDetectionTime.current = now;

      try {
        const detections = await faceapi.detectAllFaces(
          videoRef.current, 
          new faceapi.TinyFaceDetectorOptions({
            inputSize: 160,
            scoreThreshold: 0.5
          })
        );

        const formattedDetections = detections.map((det) => ({
          detection: det,
          confidence: det.score
        }));

        if (formattedDetections.length !== detectedFaces.length) {
          setDetectedFaces(formattedDetections);
        }
        drawFaceBoxes(formattedDetections);
      } catch (err) {
        console.error('Face detection error:', err);
      }

      detectionFrameRef.current = requestAnimationFrame(detectFaces);
    };

    detectionFrameRef.current = requestAnimationFrame(detectFaces);
  };

  const drawFaceBoxes = (detections: any[]) => {
    if (!canvasRef.current || !videoRef.current) return;

    const canvas = canvasRef.current;
    const video = videoRef.current;
    
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const facesToDraw = detections.slice(0, 20);
    
    facesToDraw.forEach((detection, index) => {
      const box = detection.detection.box;
      
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 2;
      ctx.strokeRect(box.x, box.y, box.width, box.height);
      
      const badgeWidth = 35;
      const badgeHeight = 22;
      ctx.fillStyle = '#10b981';
      ctx.fillRect(box.x, box.y - badgeHeight, badgeWidth, badgeHeight);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText(`#${index + 1}`, box.x + 6, box.y - 6);
    });
  };

  const handleCapture = async () => {
    if (detectedFaces.length === 0) {
      toast({
        title: "No Faces Detected",
        description: "Please ensure people are visible in the camera.",
        variant: "destructive",
      });
      return;
    }

    if (modelStatus !== 'ready') {
      toast({
        title: "Please Wait",
        description: "Face recognition models are still loading...",
        variant: "destructive",
      });
      return;
    }

    setIsCapturing(true);
    
    if (detectionFrameRef.current) {
      cancelAnimationFrame(detectionFrameRef.current);
    }

    setCaptureFlash(true);
    setTimeout(() => setCaptureFlash(false), 300);

    try {
      toast({
        title: "Processing...",
        description: `Analyzing ${detectedFaces.length} faces with high accuracy...`,
      });

      await new Promise(resolve => setTimeout(resolve, 350));
      
      setIsProcessing(true);

      if (!videoRef.current) {
        throw new Error('Video not available');
      }

      console.log('Starting face detection and recognition...');
      
      // Use SSD MobileNet for high-accuracy detection with landmarks and descriptors
      if (videoRef.current.videoWidth === 0 || videoRef.current.videoHeight === 0) {
        throw new Error('Camera frame not ready yet. Please try again.');
      }

      const fullDetections = await faceapi
        .detectAllFaces(videoRef.current, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
        .withFaceLandmarks()
        .withFaceDescriptors();

      console.log(`Detected ${fullDetections.length} faces with descriptors`);

      const processed: ProcessedFace[] = [];
      let recognizedCount = 0;

      for (const detection of fullDetections) {
        const descriptor = detection.descriptor;
        
        try {
          const recognition = await recognizeFace(descriptor);
          
          if (recognition.recognized && recognition.employee) {
            // Determine status based on cutoff time
            const now = new Date();
            const cutoffHour = 9; // 9 AM default
            const isPastCutoff = now.getHours() >= cutoffHour;
            const attendanceStatus = isPastCutoff ? 'late' : 'present';
            
            // Record attendance
            await recordAttendance(
              recognition.employee.id,
              attendanceStatus,
              recognition.confidence
            );
            
            processed.push({
              id: recognition.employee.id,
              name: recognition.employee.name || 'Unknown',
              status: attendanceStatus,
              confidence: recognition.confidence,
              imageUrl: recognition.employee.avatar_url || recognition.employee.firebase_image_url
            });
            recognizedCount++;
          } else {
            processed.push({
              id: `face-${Math.random()}`,
              name: 'Unknown Person',
              status: 'unrecognized',
              confidence: detection.detection.score
            });
          }
        } catch (recognitionErr) {
          console.error('Recognition error for face:', recognitionErr);
          processed.push({
            id: `face-${Math.random()}`,
            name: 'Unknown Person',
            status: 'unrecognized',
            confidence: detection.detection.score
          });
        }
      }

      // If no faces detected with SSD, use preview detections
      if (fullDetections.length === 0 && detectedFaces.length > 0) {
        for (let i = 0; i < detectedFaces.length; i++) {
          processed.push({
            id: `face-${Math.random()}`,
            name: 'Unknown Person',
            status: 'unrecognized',
            confidence: detectedFaces[i].confidence
          });
        }
      }

      setProcessedResults(processed);
      setShowResults(true);
      setIsProcessing(false);
      setIsCapturing(false);

      toast({
        title: "Processing Complete",
        description: `${recognizedCount} recognized, ${processed.length - recognizedCount} unrecognized`,
      });

    } catch (err) {
      console.error('Capture error:', err);
      setIsProcessing(false);
      setIsCapturing(false);
      
      const isStreamActive = streamRef.current?.active && 
                            videoRef.current?.srcObject === streamRef.current;
      
      if (!isStreamActive) {
        console.log('Camera stream lost after error, restarting...');
        await startCamera();
      } else {
        startFaceDetection();
      }
      
      toast({
        title: "Processing Error",
        description: err instanceof Error ? err.message : "Failed to process faces",
        variant: "destructive",
      });
    }
  };

  const handleReset = async () => {
    setShowResults(false);
    setProcessedResults([]);
    setDetectedFaces([]);
    setIsCapturing(false);
    
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
    }
    
    const isStreamActive = streamRef.current?.active && 
                          videoRef.current?.srcObject === streamRef.current &&
                          videoRef.current?.readyState >= 2;
    
    if (!isStreamActive) {
      console.log('Camera stream inactive, restarting camera...');
      stopCamera();
      await startCamera();
    } else {
      startFaceDetection();
    }
    
    toast({
      title: "Reset Complete",
      description: "Ready to capture new attendance",
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'present': return 'text-green-600 bg-green-100 border-green-300';
      case 'late': return 'text-yellow-600 bg-yellow-100 border-yellow-300';
      case 'unrecognized': return 'text-red-600 bg-red-100 border-red-300';
      default: return 'text-gray-600 bg-gray-100 border-gray-300';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'present': return <CheckCircle className="h-5 w-5" />;
      case 'late': return <AlertCircle className="h-5 w-5" />;
      case 'unrecognized': return <XCircle className="h-5 w-5" />;
      default: return null;
    }
  };

  return (
    <Card className="p-6">
      <CardHeader className="px-0 pt-0">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Multiple Face Attendance
              <Sparkles className="h-4 w-4 text-primary animate-pulse" />
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Capture up to 50 faces simultaneously with high-accuracy detection
            </p>
          </div>
          <div className="flex gap-2">
            <Badge variant={previewModelReady ? 'default' : 'secondary'} className="bg-green-500 text-white">
              {previewModelReady ? 'Preview Ready' : 'Loading...'}
            </Badge>
            <Badge variant={modelStatus === 'ready' ? 'default' : 'secondary'} className="bg-blue-500 text-white">
              {modelStatus === 'loading' && 'Loading Models...'}
              {modelStatus === 'ready' && 'Recognition Ready'}
              {modelStatus === 'error' && 'Error'}
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-0 pb-0">
        {modelStatus === 'error' ? (
          <div className="bg-destructive/10 border border-destructive rounded-lg p-4">
            <p className="text-sm text-destructive">
              Failed to load face recognition models. Please refresh the page.
            </p>
          </div>
        ) : !previewModelReady ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
            <p className="text-sm text-muted-foreground">Loading face detection models...</p>
          </div>
        ) : (
          <div className="space-y-4">
            {!showResults ? (
              <>
                {/* Camera View */}
                <div className="relative rounded-lg overflow-hidden bg-black aspect-video">
                  {captureFlash && (
                    <div className="absolute inset-0 bg-white animate-[fade-out_0.3s_ease-out] z-20" />
                  )}
                  
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                    style={{ transform: cameraFacing === 'user' ? 'scaleX(-1)' : 'none' }}
                  />
                  
                  <canvas
                    ref={canvasRef}
                    className="absolute inset-0 w-full h-full pointer-events-none"
                    style={{ transform: cameraFacing === 'user' ? 'scaleX(-1)' : 'none' }}
                  />
                  
                  {/* Face count overlay */}
                  <div className="absolute top-4 left-4 bg-black/70 text-white px-3 py-2 rounded-lg flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    <span className="font-medium">{detectedFaces.length} face(s)</span>
                  </div>

                  {/* Camera switch button */}
                  <Button
                    variant="secondary"
                    size="icon"
                    className="absolute top-4 right-4 bg-black/70 hover:bg-black/90 text-white"
                    onClick={toggleCamera}
                  >
                    <SwitchCamera className="h-4 w-4" />
                  </Button>

                  {/* Processing overlay */}
                  {isProcessing && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-10">
                      <div className="bg-background/90 rounded-lg p-6 flex flex-col items-center">
                        <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
                        <p className="text-sm font-medium">Processing {detectedFaces.length} faces...</p>
                        <p className="text-xs text-muted-foreground">Using high-accuracy recognition</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Capture Button */}
                <div className="flex justify-center">
                  <Button
                    size="lg"
                    onClick={handleCapture}
                    disabled={isCapturing || isProcessing || detectedFaces.length === 0 || modelStatus !== 'ready'}
                    className="w-full max-w-md"
                  >
                    {isCapturing || isProcessing ? (
                      <>
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <Camera className="mr-2 h-5 w-5" />
                        Capture {detectedFaces.length} Face(s)
                      </>
                    )}
                  </Button>
                </div>
              </>
            ) : (
              <div className="space-y-6">
                {/* Summary Cards */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl p-5 text-center text-white shadow-lg">
                    <CheckCircle className="h-8 w-8 mx-auto mb-2 opacity-90" />
                    <p className="text-3xl font-bold">
                      {processedResults.filter(r => r.status === 'present').length}
                    </p>
                    <p className="text-sm opacity-90">Present</p>
                  </div>
                  <div className="bg-gradient-to-br from-yellow-500 to-orange-500 rounded-xl p-5 text-center text-white shadow-lg">
                    <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-90" />
                    <p className="text-3xl font-bold">
                      {processedResults.filter(r => r.status === 'late').length}
                    </p>
                    <p className="text-sm opacity-90">Late</p>
                  </div>
                  <div className="bg-gradient-to-br from-red-500 to-rose-600 rounded-xl p-5 text-center text-white shadow-lg">
                    <XCircle className="h-8 w-8 mx-auto mb-2 opacity-90" />
                    <p className="text-3xl font-bold">
                      {processedResults.filter(r => r.status === 'unrecognized').length}
                    </p>
                    <p className="text-sm opacity-90">Unknown</p>
                  </div>
                </div>

                {/* Results List - Enhanced Cards */}
                <div className="space-y-3 max-h-[450px] overflow-y-auto pr-2">
                  {processedResults.map((result, index) => (
                    <div 
                      key={result.id}
                      className={`flex items-center gap-4 p-4 rounded-xl border-2 shadow-sm transition-all hover:shadow-md ${
                        result.status === 'present' ? 'bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800' : 
                        result.status === 'late' ? 'bg-yellow-50 border-yellow-200 dark:bg-yellow-950/30 dark:border-yellow-800' : 
                        'bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800'
                      }`}
                    >
                      {/* Profile Photo */}
                      <div className="relative">
                        <Avatar className={`h-16 w-16 ring-2 ring-offset-2 ring-offset-background shadow-md ${
                          result.status === 'present' ? 'ring-green-500' : 
                          result.status === 'late' ? 'ring-yellow-500' : 
                          'ring-red-500'
                        }`}>
                          {result.imageUrl ? (
                            <AvatarImage 
                              src={result.imageUrl.startsWith('http') ? result.imageUrl : `${STORAGE_BASE_URL}${result.imageUrl}`} 
                              alt={result.name} 
                              className="object-cover"
                            />
                          ) : (
                            <div className="h-full w-full bg-muted flex items-center justify-center">
                              <Users className="h-8 w-8 text-muted-foreground" />
                            </div>
                          )}
                        </Avatar>
                        {/* Status Badge */}
                        <div className={`absolute -bottom-1 -right-1 rounded-full p-1.5 shadow-sm ${
                          result.status === 'present' ? 'bg-green-500 text-white' : 
                          result.status === 'late' ? 'bg-yellow-500 text-white' : 
                          'bg-red-500 text-white'
                        }`}>
                          {getStatusIcon(result.status)}
                        </div>
                      </div>

                      {/* User Info */}
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-lg truncate">
                          {result.status === 'unrecognized' ? 'Unrecognized Person' : result.name}
                        </h3>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge 
                            variant={result.status === 'present' ? 'default' : result.status === 'late' ? 'secondary' : 'destructive'}
                            className="text-xs"
                          >
                            {result.status === 'present' ? 'Present' : result.status === 'late' ? 'Late' : 'Not Registered'}
                          </Badge>
                          {result.confidence && (
                            <span className="text-xs text-muted-foreground">
                              {(result.confidence * 100).toFixed(0)}% match
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Index */}
                      <div className="text-2xl font-bold text-muted-foreground/30">
                        #{index + 1}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Reset Button */}
                <div className="flex justify-center pt-2">
                  <Button
                    size="lg"
                    onClick={handleReset}
                    className="w-full max-w-md bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600"
                  >
                    <RotateCcw className="mr-2 h-5 w-5" />
                    Scan More Faces
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default MultipleFaceAttendanceCapture;
