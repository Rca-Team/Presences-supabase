import { useState, useEffect, useCallback, useRef } from 'react';
import { loadOptimizedModels, areOptimizedModelsLoaded, detectSingleFaceOptimized, resetTracking } from '@/services/face-recognition/OptimizedModelService';
import { detectMultipleFaces, processBatchAttendance, getTrackingStats, MultipleFaceResult } from '@/services/face-recognition/MultipleFaceService';
import { getAttendanceCutoffTime } from '@/services/attendance/AttendanceSettingsService';
import { storeFaceSample } from '@/services/face-recognition/ProgressiveTrainingService';
import { toast } from 'sonner';

export interface OptimizedFaceRecognitionResult {
  type: 'single' | 'multiple';
  single?: {
    recognized: boolean;
    employee?: any;
    status?: 'present' | 'late' | 'unauthorized';
    confidence?: number;
    qualityScore?: number;
    autoMarked?: boolean;
    strictEligible?: boolean;
    processingTime?: number;
  };
  multiple?: MultipleFaceResult;
  timestamp: string;
}

export interface ProcessingOptions {
  enableMultipleFaces?: boolean;
  maxFaces?: number;
  enableTracking?: boolean;
  skipFrames?: boolean;
  batchProcessing?: boolean;
  classScope?: {
    className?: string;
    section?: string;
    subject?: string;
  };
}

export const useOptimizedFaceRecognition = () => {
  const AUTO_MARK_MIN_CONFIDENCE = 0.5;
  const AUTO_MARK_MIN_QUALITY_SCORE = 0;

  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isModelLoading, setIsModelLoading] = useState<boolean>(true);
  const [result, setResult] = useState<OptimizedFaceRecognitionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cutoffTime, setCutoffTime] = useState<{ hour: number, minute: number }>({ hour: 9, minute: 0 });
  const [processingStats, setProcessingStats] = useState({
    averageProcessingTime: 0,
    totalFacesProcessed: 0,
    recognitionRate: 0
  });

  // Performance tracking
  const processingTimes = useRef<number[]>([]);
  const processingCount = useRef(0);
  const recognizedCount = useRef(0);

  // Initialize optimized models with retry logic and memoization
  useEffect(() => {
    let isMounted = true;
    let retryTimeout: NodeJS.Timeout;
    
    const initializeOptimizedModels = async (isRetry = false) => {
      if (!isMounted) return;
      
      try {
        if (!isRetry) {
          setIsModelLoading(true);
          setError(null);
          console.log('Initializing optimized face recognition models...');
        }
        
        await loadOptimizedModels();
        
        if (isMounted) {
          setIsModelLoading(false);
          console.log('Optimized models loaded successfully');
          if (!isRetry) {
            toast.success('Face recognition system ready!');
          }
        }
      } catch (err) {
        console.error('Error loading optimized models:', err);
        if (isMounted) {
          const errorMessage = err instanceof Error ? err.message : 'Failed to load face recognition models';
          setError(errorMessage);
          setIsModelLoading(false);
          
          // Show user-friendly error message
          if (errorMessage.includes('wait')) {
            toast.error('Model loading temporarily disabled. Please try again later.');
          } else if (!isRetry) {
            toast.error('Face recognition models failed to load. Some features may not work.');
          }
        }
      }
    };

    // Only initialize if models aren't loaded
    if (!areOptimizedModelsLoaded()) {
      initializeOptimizedModels();
    } else {
      setIsModelLoading(false);
    }

    // Load cutoff time (memoized)
    const loadCutoffTime = async () => {
      if (!isMounted) return;
      try {
        const time = await getAttendanceCutoffTime();
        if (isMounted) {
          setCutoffTime(time);
        }
      } catch (err) {
        console.error('Error loading cutoff time:', err);
      }
    };

    loadCutoffTime();
    
    return () => {
      isMounted = false;
      if (retryTimeout) clearTimeout(retryTimeout);
    };
  }, []); // Empty dependency array - only run once

  // Process face with optimized pipeline
  const processFace = useCallback(async (
    mediaElement: HTMLVideoElement | HTMLImageElement,
    options: ProcessingOptions = {}
  ): Promise<OptimizedFaceRecognitionResult | null> => {
    
    if (isProcessing) {
      console.log('Already processing - skipping frame');
      return null;
    }

    if (isModelLoading) {
      console.log('Models still loading');
      return null;
    }

    try {
      setIsProcessing(true);
      setError(null);
      
      const startTime = Date.now();
      
      // Ensure media is ready
      if (mediaElement instanceof HTMLVideoElement) {
        if (mediaElement.readyState < 2 || mediaElement.videoWidth === 0) {
          console.log('Video not ready for processing');
          setIsProcessing(false);
          return null;
        }
      }

      let result: OptimizedFaceRecognitionResult;

      if (options.enableMultipleFaces) {
        // Multiple face detection and recognition
        const classroomMode = options.maxFaces && options.maxFaces > 20;
        
        console.log(`Processing multiple faces... ${classroomMode ? '(Classroom Mode: 50+ faces)' : ''}`);
        const multipleResult = await detectMultipleFaces(mediaElement, {
          enableRecognition: true,
          enableTracking: options.enableTracking !== false,
          maxFaces: options.maxFaces || 5,
          classroomMode
        });

        // Batch process attendance if enabled
        if (options.batchProcessing && multipleResult.recognizedFaces.length > 0) {
          await processBatchAttendance(multipleResult.recognizedFaces, cutoffTime);
        }

        result = {
          type: 'multiple',
          multiple: multipleResult,
          timestamp: new Date().toISOString()
        };

        // Show notifications for recognized faces
        multipleResult.recognizedFaces.forEach(face => {
          if (face.recognition?.employee) {
            toast.success(`Welcome, ${face.recognition.employee.name}!`);
          }
        });

        if (multipleResult.unrecognizedFaces.length > 0) {
          toast.warning(`${multipleResult.unrecognizedFaces.length} unrecognized face(s) detected`);
        }

      } else {
        // Single face detection and recognition (faster)
        console.log('Processing single face...');
        const detection = await detectSingleFaceOptimized(mediaElement, {
          enableTracking: options.enableTracking !== false,
          skipFrames: false
        });

        if (detection) {
          // Import recognition function dynamically to avoid circular deps
          const { recognizeFace, recordAttendance } = await import('@/services/face-recognition/RecognitionService');
          
          const recognitionResult = await recognizeFace(detection.descriptor);
          
          if (recognitionResult.recognized) {
            const isPastCutoff = isPastCutoffTime(cutoffTime);
            const status = isPastCutoff ? 'late' : 'present';
            const confidence = recognitionResult.confidence ?? 0;
            const qualityScore = detection.detection.score ?? 0;
            const strictEligible = recognitionResult.strictMetrics?.autoMarkEligible ?? false;
            const autoMarked = strictEligible || (
              confidence >= AUTO_MARK_MIN_CONFIDENCE && qualityScore >= AUTO_MARK_MIN_QUALITY_SCORE
            );
            
            // Capture the current frame as data URL for the notification email
            let capturedImageDataUrl: string | undefined;
            if (mediaElement instanceof HTMLVideoElement) {
              const capCanvas = document.createElement('canvas');
              capCanvas.width = mediaElement.videoWidth;
              capCanvas.height = mediaElement.videoHeight;
              const capCtx = capCanvas.getContext('2d');
              capCtx?.drawImage(mediaElement, 0, 0);
              capturedImageDataUrl = capCanvas.toDataURL('image/jpeg', 0.85);
            } else if (mediaElement instanceof HTMLImageElement) {
              const capCanvas = document.createElement('canvas');
              capCanvas.width = mediaElement.naturalWidth;
              capCanvas.height = mediaElement.naturalHeight;
              const capCtx = capCanvas.getContext('2d');
              capCtx?.drawImage(mediaElement, 0, 0);
              capturedImageDataUrl = capCanvas.toDataURL('image/jpeg', 0.85);
            }
            
            if (autoMarked) {
              await recordAttendance(
                recognitionResult.employee.id,
                status,
                recognitionResult.confidence,
                options.classScope
                  ? {
                      metadata: {
                        class: options.classScope.className,
                        section: options.classScope.section,
                        subject: options.classScope.subject,
                      },
                    }
                  : undefined,
                capturedImageDataUrl,
                'ai-scan'
              );
            }

            // Store face sample for progressive training
            if (recognitionResult.confidence && recognitionResult.confidence > 0.75) {
              try {
                let imageBlob: Blob | null = null;
                if (mediaElement instanceof HTMLVideoElement) {
                  const canvas = document.createElement('canvas');
                  canvas.width = mediaElement.videoWidth;
                  canvas.height = mediaElement.videoHeight;
                  const ctx = canvas.getContext('2d');
                  ctx?.drawImage(mediaElement, 0, 0, canvas.width, canvas.height);
                  imageBlob = await new Promise<Blob | null>((resolve) => {
                    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.85);
                  });
                }
                
                await storeFaceSample(
                  recognitionResult.employee.id,
                  detection.descriptor,
                  imageBlob,
                  recognitionResult.employee.name,
                  recognitionResult.confidence
                );
                console.log('Progressive training sample stored');
              } catch (trainError) {
                console.error('Failed to store training sample:', trainError);
              }
            }

            result = {
              type: 'single',
              single: {
                recognized: true,
                employee: recognitionResult.employee,
                status,
                confidence,
                qualityScore,
                autoMarked,
                strictEligible,
                processingTime: Date.now() - startTime
              },
              timestamp: new Date().toISOString()
            };

            if (autoMarked) {
              toast.success(`Welcome, ${recognitionResult.employee.name}!`);
            } else {
              toast.warning('Face matched, but quality check requires manual confirmation.');
            }
            recognizedCount.current++;
          } else {
            result = {
              type: 'single',
              single: {
                recognized: false,
                status: 'unauthorized',
                processingTime: Date.now() - startTime
              },
              timestamp: new Date().toISOString()
            };

            toast.error('Face not recognized');
          }
        } else {
          result = {
            type: 'single',
            single: {
              recognized: false,
              status: 'unauthorized',
              processingTime: Date.now() - startTime
            },
            timestamp: new Date().toISOString()
          };

          console.log('No face detected');
        }
      }

      // Update performance stats
      const processingTime = Date.now() - startTime;
      processingTimes.current.push(processingTime);
      processingCount.current++;
      
      // Keep only last 100 measurements
      if (processingTimes.current.length > 100) {
        processingTimes.current = processingTimes.current.slice(-100);
      }

      updateStats();
      setResult(result);
      setIsProcessing(false);
      
      console.log(`Face processing completed in ${processingTime}ms`);
      return result;

    } catch (err) {
      console.error('Error in optimized face processing:', err);
      setError(err instanceof Error ? err.message : String(err));
      setIsProcessing(false);
      toast.error('Error processing face');
      return null;
    }
  }, [isProcessing, isModelLoading, cutoffTime]);

  // Continuous processing for video streams
  const startContinuousProcessing = useCallback((
    videoElement: HTMLVideoElement,
    options: ProcessingOptions = {}
  ) => {
    const processFrame = () => {
      if (!isProcessing && !isModelLoading) {
        processFace(videoElement, {
          ...options,
          skipFrames: true, // Always skip frames in continuous mode
        });
      }
    };

    // Process at 10 FPS for balance between performance and accuracy
    const intervalId = setInterval(processFrame, 100);
    
    return () => {
      clearInterval(intervalId);
      resetTracking();
    };
  }, [processFace, isProcessing, isModelLoading]);

  // Reset all tracking and processing state
  const resetProcessing = useCallback(() => {
    setResult(null);
    setError(null);
    resetTracking();
    processingTimes.current = [];
    processingCount.current = 0;
    recognizedCount.current = 0;
    updateStats();
  }, []);

  // Update performance statistics
  const updateStats = useCallback(() => {
    const avgTime = processingTimes.current.length > 0
      ? processingTimes.current.reduce((a, b) => a + b, 0) / processingTimes.current.length
      : 0;
    
    const recognitionRate = processingCount.current > 0
      ? (recognizedCount.current / processingCount.current) * 100
      : 0;

    setProcessingStats({
      averageProcessingTime: Math.round(avgTime),
      totalFacesProcessed: processingCount.current,
      recognitionRate: Math.round(recognitionRate)
    });
  }, []);

  // Helper function for cutoff time checking
  const isPastCutoffTime = (cutoff: { hour: number; minute: number }): boolean => {
    const now = new Date();
    const cutoffTime = new Date();
    cutoffTime.setHours(cutoff.hour, cutoff.minute, 0, 0);
    return now > cutoffTime;
  };

  return {
    // Core functions
    processFace,
    startContinuousProcessing,
    resetProcessing,
    
    // State
    isProcessing,
    isModelLoading,
    result,
    error,
    cutoffTime,
    
    // Performance monitoring
    processingStats,
    trackingStats: getTrackingStats(),
    
    // Utilities
    areModelsLoaded: areOptimizedModelsLoaded,
  };
};

export default useOptimizedFaceRecognition;
