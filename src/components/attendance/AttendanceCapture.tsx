
import React, { useRef, useState, useEffect } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Webcam } from '@/components/ui/webcam';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useOptimizedFaceRecognition } from '@/hooks/useOptimizedFaceRecognition';
import AttendanceResult from './AttendanceResult';
import UnrecognizedFaceAlert from './UnrecognizedFaceAlert';
import RecognizedFaceAlert from './RecognizedFaceAlert';
import ScanConfirmation from './ScanConfirmation';
import { loadOptimizedModels } from '@/services/face-recognition/OptimizedModelService';
import { videoEnhancementService } from '@/services/ai/VideoEnhancementService';
import { usePhotoEnhancer } from '@/hooks/usePhotoEnhancer';
import { recordAttendance } from '@/services/face-recognition/RecognitionService';
import { AlertCircle, Camera, Wand2 } from 'lucide-react';
import * as faceapi from 'face-api.js';

interface AttendanceCaptureClassScope {
  className?: string;
  section?: string;
  subject?: string;
}

interface AttendanceCaptureProps {
  classScope?: AttendanceCaptureClassScope;
}

const AttendanceCapture: React.FC<AttendanceCaptureProps> = ({ classScope }) => {
  const { toast } = useToast();
  const webcamRef = useRef<HTMLVideoElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const [modelStatus, setModelStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [diagnosticResult, setDiagnosticResult] = useState<{
    accessible: boolean;
    errors: string[];
  } | null>(null);
  const [enhancementEnabled, setEnhancementEnabled] = useState(false);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [captureFlash, setCaptureFlash] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [capturedPhotos, setCapturedPhotos] = useState<string[]>([]);
  const [selectedPhoto, setSelectedPhoto] = useState<number | null>(null);
  const [livePreviewImage, setLivePreviewImage] = useState<string | null>(null);
  const [detectedFaces, setDetectedFaces] = useState<any[]>([]);
  const lastDetectionCountRef = useRef(0);
  const detectionIntervalRef = useRef<number>();
  const previewIntervalRef = useRef<number>();
  const [unrecognizedAlert, setUnrecognizedAlert] = useState<{
    imageUrl: string;
    timestamp: Date;
  } | null>(null);
  
  const [recognizedAlert, setRecognizedAlert] = useState<{
    employee: any;
    status: 'present' | 'late';
    timestamp: Date;
    imageUrl?: string;
  } | null>(null);

  const [pendingConfirm, setPendingConfirm] = useState<{
    employee: any;
    status: 'present' | 'late';
    confidence: number;
    imageUrl: string;
  } | null>(null);
  
  const {
    processFace,
    isProcessing,
    isModelLoading,
    result,
    error,
    resetProcessing: resetResult
  } = useOptimizedFaceRecognition();

  const { isEnhancing: isAIEnhancing, autoEnhance, lastQualityScore } = usePhotoEnhancer();

  // Wrapper to reset all state including captured image and detected faces
  const handleReset = () => {
    resetResult();
    setCapturedImage(null);
    setCapturedPhotos([]);
    setSelectedPhoto(null);
    setLivePreviewImage(null);
    setDetectedFaces([]);
  };
  
  // Initial model availability check with cleanup and debouncing
  useEffect(() => {
    let isMounted = true;
    let timeoutId: NodeJS.Timeout;
    
    const checkModelStatus = async () => {
      // Debounce model loading attempts
      if (timeoutId) clearTimeout(timeoutId);
      
      timeoutId = setTimeout(async () => {
        if (!isMounted) return;
        
        try {
          await loadOptimizedModels();
          if (isMounted) {
            setModelStatus('ready');
            
            // Initialize video enhancement service only once
            if (enhancementEnabled && !videoEnhancementService.isEnhancementAvailable()) {
              try {
                await videoEnhancementService.initialize();
              } catch (enhanceError) {
                console.warn('Video enhancement initialization failed:', enhanceError);
                // Continue without enhancement
              }
            }
          }
        } catch (err) {
          console.error('Error checking model status:', err);
          if (isMounted) {
            setModelStatus('error');
          }
        }
      }, 1000); // 1 second debounce
    };
    
    // Only check if models are not already loaded and component is loading
    if (isModelLoading && modelStatus !== 'ready') {
      checkModelStatus();
    } else if (!isModelLoading) {
      setModelStatus('ready');
    }
    
    return () => {
      isMounted = false;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [isModelLoading, enhancementEnabled, modelStatus]);

  // Live photo preview - shows what will be captured  
  useEffect(() => {
    const updatePreview = () => {
      if (!webcamRef.current || !previewCanvasRef.current || isProcessing || result || capturedImage) return;

      const video = webcamRef.current;
      const canvas = previewCanvasRef.current;
      
      if (video.readyState !== 4) return;

      try {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(video, 0, 0);
        }
      } catch (error) {
        console.warn('Preview update error:', error);
      }
    };

    // Update preview at 5 FPS for smooth but efficient preview
    previewIntervalRef.current = window.setInterval(updatePreview, 200);

    return () => {
      if (previewIntervalRef.current) {
        clearInterval(previewIntervalRef.current);
      }
    };
  }, [isProcessing, result, capturedImage]);

  // Real-time face detection overlay - optimized for performance
  useEffect(() => {
    let isDetecting = false;
    
    const runFaceDetection = async () => {
      if (!webcamRef.current || isProcessing || result || capturedImage || isDetecting) return;

      const video = webcamRef.current;
      if (video.readyState !== 4) return;

      isDetecting = true;
      
      try {
        const detections = await faceapi
          .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 }))
          .withFaceLandmarks(true);

        if (detections.length !== lastDetectionCountRef.current) {
          lastDetectionCountRef.current = detections.length;
          setDetectedFaces(detections);
        }

        // Draw on overlay canvas
        if (overlayCanvasRef.current && detections.length > 0) {
          const canvas = overlayCanvasRef.current;
          const displaySize = { width: video.videoWidth, height: video.videoHeight };
          faceapi.matchDimensions(canvas, displaySize);

          if (!displaySize.width || !displaySize.height) {
            return;
          }
          const safeDetections = detections.filter((d) => {
            const b = d?.detection?.box;
            return Number.isFinite(b?.x) && Number.isFinite(b?.y) && Number.isFinite(b?.width) && Number.isFinite(b?.height);
          });
          const resizedDetections = faceapi.resizeResults(safeDetections, displaySize);
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            // Draw simple bounding boxes
            resizedDetections.forEach((detection) => {
              const box = detection.detection.box;
              
              // Main box with glow effect
              ctx.strokeStyle = 'rgba(16, 185, 129, 0.8)';
              ctx.lineWidth = 3;
              ctx.strokeRect(box.x, box.y, box.width, box.height);
              
              // Corner accents
              const cornerSize = 15;
              ctx.strokeStyle = 'rgba(16, 185, 129, 1)';
              ctx.lineWidth = 4;
              
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
        } else if (overlayCanvasRef.current) {
          const ctx = overlayCanvasRef.current.getContext('2d');
          if (ctx) {
            ctx.clearRect(0, 0, overlayCanvasRef.current.width, overlayCanvasRef.current.height);
          }
        }
      } catch (error) {
        console.warn('Face detection error:', error);
      } finally {
        isDetecting = false;
      }
    };

    if (!result && !isProcessing && !capturedImage && modelStatus === 'ready') {
      // Run detection at 0.5 FPS (2000ms) for better performance
      detectionIntervalRef.current = window.setInterval(runFaceDetection, 2000);
    }

    return () => {
      if (detectionIntervalRef.current) {
        clearInterval(detectionIntervalRef.current);
      }
    };
  }, [isProcessing, result, capturedImage, modelStatus]);
  
  const runDiagnostics = async () => {
    setShowDiagnostics(true);
    try {
      await loadOptimizedModels();
      setDiagnosticResult({
        accessible: true,
        errors: []
      });
    } catch (err) {
      console.error('Error running diagnostics:', err);
      setDiagnosticResult({
        accessible: false,
        errors: [`Diagnostic error: ${err instanceof Error ? err.message : String(err)}`]
      });
    }
  };
  
  const retryModels = async () => {
    setModelStatus('loading');
    setShowDiagnostics(false);
    setDiagnosticResult(null);
    
    try {
      await loadOptimizedModels();
      setModelStatus('ready');
      toast({
        title: "Success",
        description: "Face recognition models loaded successfully.",
        variant: "default",
      });
    } catch (err) {
      console.error('Error reloading models:', err);
      setModelStatus('error');
      toast({
        title: "Error",
        description: "Failed to reload face models. Please refresh the page.",
        variant: "destructive",
      });
    }
  };
  
  const handleCapture = async () => {
    if (!webcamRef.current || isProcessing || isModelLoading) {
      console.log('Cannot capture: webcam not ready, processing in progress, or models still loading');
      return;
    }
    
    try {
      // Trigger flash animation
      setCaptureFlash(true);
      setTimeout(() => setCaptureFlash(false), 300);
      
      console.log('Capturing photo for comparison...');
      
      // Capture instant image
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Could not get canvas context');
      }
      
      canvas.width = webcamRef.current.videoWidth;
      canvas.height = webcamRef.current.videoHeight;
      ctx.drawImage(webcamRef.current, 0, 0);
      
      // Apply video enhancement if enabled (legacy)
      let imageToProcess = canvas;
      if (enhancementEnabled && videoEnhancementService.isEnhancementAvailable()) {
        setIsEnhancing(true);
        try {
          console.log('Enhancing captured image (legacy)...');
          const enhancedCanvas = await videoEnhancementService.enhanceVideoFrame(webcamRef.current);
          imageToProcess = enhancedCanvas;
        } catch (enhanceError) {
          console.warn('Enhancement failed, using original image:', enhanceError);
        } finally {
          setIsEnhancing(false);
        }
      }
      
      let imageDataUrl = imageToProcess.toDataURL('image/jpeg', 0.95);
      
      // AI auto-enhance for low-quality images
      imageDataUrl = await autoEnhance(imageDataUrl, imageToProcess);
      
      // Add to photos array (max 3 photos)
      setCapturedPhotos(prev => {
        const newPhotos = [...prev, imageDataUrl];
        return newPhotos.slice(-3); // Keep only last 3
      });
      
      toast({
        title: "Photo Captured",
        description: "Take more photos or select the best one to process",
      });
    } catch (err) {
      console.error('Capture error:', err);
      toast({
        title: "Capture Error",
        description: "Failed to capture photo. Please try again.",
        variant: "destructive",
      });
    }
  };
  
  const handleProcessSelected = async () => {
    if (selectedPhoto === null || !capturedPhotos[selectedPhoto]) {
      toast({
        title: "No Photo Selected",
        description: "Please select a photo to process",
        variant: "destructive",
      });
      return;
    }
    
    try {
      const imageDataUrl = capturedPhotos[selectedPhoto];
      setCapturedImage(imageDataUrl);
      
      // Create an image element from the captured data
      const img = new Image();
      img.src = imageDataUrl;
      await new Promise<void>((resolve) => {
        img.onload = () => resolve();
      });
      
      console.log('Processing selected photo...');
      
      const recognitionResult = await processFace(img, {
        enableMultipleFaces: false,
        enableTracking: false,
        classScope,
      });
      
      if (!recognitionResult) {
        toast({
          title: "Processing Error",
          description: error || "Failed to process face. Please try again.",
          variant: "destructive",
        });
        return;
      }
      
      // Handle single face result
      if (recognitionResult.type === 'single' && recognitionResult.single) {
        const single = recognitionResult.single;
        
          if (single.recognized && single.employee) {
          const displayStatus = single.status === 'present' ? 'present' : single.status === 'late' ? 'late' : 'unauthorized';
          
          // Use the captured image
          const imageUrl = imageDataUrl || capturedImage || '';

            if (displayStatus === 'present' || displayStatus === 'late') {
            const confidence = single.confidence ?? 0;
              const autoMarked = Boolean(single.autoMarked);

              if (autoMarked) {
                setRecognizedAlert({
                  employee: single.employee,
                  status: displayStatus,
                  timestamp: new Date(),
                  imageUrl,
                });

                toast({
                  title: 'Attendance Confirmed',
                  description: `${single.employee.name} marked as ${displayStatus} (${Math.round(confidence * 100)}% match)`,
                });

                return;
              }

            // Show confirmation screen when strict auto-mark gate is not met
            setPendingConfirm({
              employee: single.employee,
              status: displayStatus,
              confidence,
              imageUrl,
            });
          }
        } else {
          // Unrecognized face - use captured image
          if (capturedImage) {
            setUnrecognizedAlert({
              imageUrl: capturedImage,
              timestamp: new Date()
            });
          }
          
          toast({
            title: "Face Not Recognized",
            description: "This person is not registered in the system. Security alert has been triggered.",
            variant: "destructive",
          });
        }
      }
    } catch (err) {
      console.error('Face recognition error:', err);
      toast({
        title: "Processing Error",
        description: "An error occurred while processing the image.",
        variant: "destructive",
      });
    }
  };
  
  return (
    <Card className="p-4 sm:p-6">
      <h3 className="text-lg font-medium mb-4">Facial Recognition</h3>
        <div className="space-y-4">
        {/* Simple status indicator */}
        <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
          <div className="flex items-center gap-2">
            <Camera className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">Face Recognition Active</span>
            {detectedFaces.length > 0 && (
              <Badge variant="secondary" className="ml-2">
                {detectedFaces.length} face{detectedFaces.length > 1 ? 's' : ''} detected
              </Badge>
            )}
            {isAIEnhancing && (
              <Badge variant="outline" className="ml-2 gap-1 animate-pulse">
                <Wand2 className="h-3 w-3" />
                AI Enhancing...
              </Badge>
            )}
            {lastQualityScore !== null && lastQualityScore < 0.45 && !isAIEnhancing && (
              <Badge variant="outline" className="ml-2 gap-1 text-amber-600 border-amber-300">
                <Wand2 className="h-3 w-3" />
                Low Quality Detected
              </Badge>
            )}
          </div>
        </div>

        {/* Recognized Face Alert */}
        {recognizedAlert && (
          <RecognizedFaceAlert
            employee={recognizedAlert.employee}
            status={recognizedAlert.status}
            timestamp={recognizedAlert.timestamp}
            imageUrl={recognizedAlert.imageUrl}
            onDismiss={() => setRecognizedAlert(null)}
          />
        )}

        {/* Pre-save confirmation screen — shows match + confidence + face crop */}
        {pendingConfirm && (
          <ScanConfirmation
            open={!!pendingConfirm}
            studentName={pendingConfirm.employee.name}
            studentId={pendingConfirm.employee.id}
            rollNumber={pendingConfirm.employee.roll_number || pendingConfirm.employee.employee_id}
            category={pendingConfirm.employee.category}
            confidence={pendingConfirm.confidence}
            status={pendingConfirm.status}
            imageUrl={pendingConfirm.imageUrl}
            onConfirm={async () => {
              const c = pendingConfirm;
              setPendingConfirm(null);

              try {
                await recordAttendance(
                  c.employee.id,
                  c.status,
                  c.confidence,
                  classScope
                    ? {
                        metadata: {
                          class: classScope.className,
                          section: classScope.section,
                          subject: classScope.subject,
                          manual_confirmation: true,
                          force_attendance_save: true,
                        },
                      }
                    : {
                        metadata: {
                          manual_confirmation: true,
                          force_attendance_save: true,
                        },
                      },
                  c.imageUrl,
                  'ai-scan'
                );
              } catch (attendanceErr) {
                console.error('Manual attendance confirmation failed:', attendanceErr);
                toast({
                  title: 'Could not save attendance',
                  description: 'Please try confirming again.',
                  variant: 'destructive',
                });
                return;
              }

              setRecognizedAlert({
                employee: c.employee,
                status: c.status,
                timestamp: new Date(),
                imageUrl: c.imageUrl,
              });
              toast({
                title: 'Attendance Confirmed',
                description: `${c.employee.name} marked as ${c.status}`,
              });
            }}
            onRetake={() => {
              setPendingConfirm(null);
              handleReset();
            }}
          />
        )}

        {/* Unrecognized Face Alert */}
        {unrecognizedAlert && (
          <UnrecognizedFaceAlert
            imageUrl={unrecognizedAlert.imageUrl}
            timestamp={unrecognizedAlert.timestamp}
            onRetry={() => {
              setUnrecognizedAlert(null);
              handleCapture();
            }}
            onRegister={() => {
              setUnrecognizedAlert(null);
              // Navigate to registration page
              window.location.href = '/register';
            }}
          />
        )}

        {modelStatus === 'error' ? (
          <div className="bg-destructive/10 border border-destructive rounded-md p-4 space-y-3">
            <div className="flex items-center">
              <AlertCircle className="w-5 h-5 text-destructive mr-2" />
              <h4 className="font-medium text-destructive">Face Recognition Models Not Loaded</h4>
            </div>
            <p className="text-sm text-muted-foreground">
              The application failed to load face recognition models. This might be due to network issues or missing model files.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={retryModels}
              >
                Retry Loading
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={runDiagnostics}
              >
                Run Diagnostics
              </Button>
            </div>
            
            {showDiagnostics && (
              <div className="bg-muted p-3 rounded-md text-sm space-y-2 max-h-48 overflow-y-auto">
                <h5 className="font-medium">Diagnostic Results:</h5>
                {!diagnosticResult ? (
                  <p>Running diagnostics...</p>
                ) : (
                  <>
                    <p className={diagnosticResult.accessible ? "text-green-600" : "text-destructive"}>
                      Models accessible: {diagnosticResult.accessible ? "Yes" : "No"}
                    </p>
                    {diagnosticResult.errors.length > 0 && (
                      <div>
                        <p className="font-medium">Errors:</p>
                        <ul className="list-disc pl-5 space-y-1">
                          {diagnosticResult.errors.map((err, i) => (
                            <li key={i} className="text-xs">{err}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        ) : capturedPhotos.length > 0 ? (
          <div className="space-y-6">
            {/* Photo comparison grid */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Camera className="h-4 w-4" />
                  Select Best Photo
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Compare your photos and select the best one
                </p>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4 mb-4">
                  {capturedPhotos.map((photo, index) => (
                    <div
                      key={index}
                      onClick={() => setSelectedPhoto(index)}
                      className={`relative cursor-pointer rounded-lg overflow-hidden border-2 transition-all ${
                        selectedPhoto === index
                          ? 'border-primary shadow-lg scale-105'
                          : 'border-muted hover:border-primary/50'
                      }`}
                    >
                      <img src={photo} alt={`Photo ${index + 1}`} className="w-full h-auto" />
                      {selectedPhoto === index && (
                        <div className="absolute top-2 right-2 bg-primary text-primary-foreground rounded-full p-1">
                          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        </div>
                      )}
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                        <p className="text-xs text-white font-medium">Photo {index + 1}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={handleProcessSelected}
                    disabled={selectedPhoto === null || isProcessing}
                    className="flex-1"
                  >
                    {isProcessing ? (
                      <>
                        <div className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin mr-2"></div>
                        Processing...
                      </>
                    ) : (
                      'Process Selected Photo'
                    )}
                  </Button>
                  <Button
                    onClick={() => {
                      setCapturedPhotos([]);
                      setSelectedPhoto(null);
                    }}
                    variant="outline"
                  >
                    Retake All
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Main camera view */}
            <div className="relative">
              {/* Flash animation overlay */}
              {captureFlash && (
                <div className="absolute inset-0 bg-white animate-[fade-out_0.3s_ease-out] z-10 pointer-events-none rounded-xl" />
              )}
              
              <div className="relative">
                <Webcam
                  ref={webcamRef}
                  onCapture={() => handleCapture()}
                  className="w-full"
                  showControls={!isProcessing && !result}
                  autoStart={!result}
                  enhancementEnabled={enhancementEnabled}
                />
                
                {/* Face detection overlay canvas */}
                <canvas
                  ref={overlayCanvasRef}
                  className="absolute inset-0 w-full h-full pointer-events-none"
                  style={{ zIndex: 5 }}
                />
                
                {/* Face detection indicator */}
                {detectedFaces.length > 0 && !capturedImage && (
                  <div className="absolute top-4 left-4 bg-primary/90 text-primary-foreground px-3 py-1.5 rounded-full text-sm font-medium flex items-center gap-2 animate-fade-in" style={{ zIndex: 6 }}>
                    <div className="w-2 h-2 bg-primary-foreground rounded-full animate-pulse" />
                    {detectedFaces.length} detected
                  </div>
                )}
              </div>
            </div>

            {/* Photo preview panel */}
            <div>
              <Card className="h-full">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Camera className="h-4 w-4" />
                    Photo Preview
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">
                    See how your photo will look
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="relative">
                    {detectedFaces.length > 0 ? (
                      <div className="space-y-3">
                        <canvas 
                          ref={previewCanvasRef}
                          className="w-full rounded-lg border-2 border-primary/20 shadow-sm"
                          style={{ transform: 'scaleX(-1)' }}
                        />
                        <div className="flex items-center justify-between p-2 bg-muted/50 rounded-lg">
                          <span className="text-xs text-muted-foreground">Ready to capture</span>
                          <Badge variant="secondary" className="text-xs">
                            {detectedFaces.length} face{detectedFaces.length > 1 ? 's' : ''}
                          </Badge>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-center p-6 border-2 border-dashed border-muted rounded-lg">
                        <Camera className="h-16 w-16 text-muted-foreground/30 mb-4" />
                        <p className="text-sm font-medium text-muted-foreground mb-2">
                          Position yourself in the camera
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Your photo preview will appear here
                        </p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
        
        {isModelLoading && !isProcessing && (
          <div className="flex flex-col items-center py-4">
            <div className="h-10 w-10 rounded-full border-2 border-primary border-t-transparent animate-spin mb-2"></div>
            <p className="text-muted-foreground">Loading face recognition models...</p>
          </div>
        )}
        
        {result && <AttendanceResult result={result} resetResult={handleReset} />}
      </div>
    </Card>
  );
};

export default AttendanceCapture;
