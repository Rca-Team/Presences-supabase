/**
 * Turbo Face Recognition Hook
 * High-performance face recognition with automatic initialization
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  initializeTurboPipeline,
  turboDetectAndRecognize,
  turboRecognizeSingle,
  turboClassroomScan,
  getTurboPerformanceStats,
  isTurboPipelineReady,
  resetTurboStats,
  type TurboDetectionResult,
  type TurboFace,
  type TurboOptions
} from '@/services/face-recognition/TurboRecognitionService';
import { recordAttendance } from '@/services/face-recognition/RecognitionService';
import { getAttendanceCutoffTime, isPastCutoffTime } from '@/services/attendance/AttendanceSettingsService';
import { toast } from 'sonner';

export interface UseTurboRecognitionReturn {
  // State
  isInitialized: boolean;
  isProcessing: boolean;
  error: string | null;
  
  // Results
  lastResult: TurboDetectionResult | null;
  recognizedFaces: TurboFace[];
  
  // Stats
  averageProcessingTime: number;
  facesPerSecond: number;
  totalProcessed: number;
  
  // Actions
  initialize: () => Promise<void>;
  detectFaces: (input: HTMLVideoElement | HTMLImageElement, options?: TurboOptions) => Promise<TurboDetectionResult>;
  detectSingle: (input: HTMLVideoElement | HTMLImageElement) => Promise<TurboFace | null>;
  classroomScan: (input: HTMLVideoElement | HTMLImageElement) => Promise<TurboDetectionResult>;
  recordAttendanceForFaces: (faces: TurboFace[]) => Promise<{ recorded: number; errors: string[] }>;
  reset: () => void;
  
  // Continuous processing
  startContinuous: (videoElement: HTMLVideoElement, options?: TurboOptions) => void;
  stopContinuous: () => void;
  isContinuousActive: boolean;
}

export function useTurboRecognition(autoInitialize: boolean = false): UseTurboRecognitionReturn {
  const [isInitialized, setIsInitialized] = useState(isTurboPipelineReady());
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<TurboDetectionResult | null>(null);
  const [recognizedFaces, setRecognizedFaces] = useState<TurboFace[]>([]);
  const [stats, setStats] = useState({ averageProcessingTime: 0, facesPerSecond: 0, totalProcessed: 0 });
  const [isContinuousActive, setIsContinuousActive] = useState(false);
  
  const continuousIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const cutoffTimeRef = useRef<{ hour: number; minute: number } | null>(null);

  // Load cutoff time
  useEffect(() => {
    getAttendanceCutoffTime().then(time => {
      cutoffTimeRef.current = time;
    });
  }, []);

  // Refresh stats periodically
  useEffect(() => {
    const interval = setInterval(() => {
      const perfStats = getTurboPerformanceStats();
      setStats({
        averageProcessingTime: perfStats.averageProcessingTime,
        facesPerSecond: perfStats.facesPerSecond,
        totalProcessed: perfStats.totalProcessedFaces
      });
      setIsInitialized(perfStats.pipelineReady);
    }, 1000);
    
    return () => clearInterval(interval);
  }, []);

  const initialize = useCallback(async (): Promise<void> => {
    try {
      setError(null);
      await initializeTurboPipeline();
      setIsInitialized(true);
      toast.success('Turbo recognition ready!', {
        description: 'GPU acceleration and parallel processing enabled'
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Initialization failed';
      setError(message);
      toast.error('Failed to initialize', { description: message });
      throw err;
    }
  }, []);

  const detectFaces = useCallback(async (
    input: HTMLVideoElement | HTMLImageElement,
    options?: TurboOptions
  ): Promise<TurboDetectionResult> => {
    setIsProcessing(true);
    setError(null);
    
    try {
      const result = await turboDetectAndRecognize(input, options);
      setLastResult(result);
      
      // Update recognized faces list
      const newRecognized = result.faces.filter(f => f.recognition.recognized);
      setRecognizedFaces(prev => {
        // Merge with existing, avoiding duplicates
        const existing = new Set(prev.map(f => f.recognition.userId));
        const unique = newRecognized.filter(f => !existing.has(f.recognition.userId));
        return [...prev, ...unique];
      });
      
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Detection failed';
      setError(message);
      throw err;
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const detectSingle = useCallback(async (
    input: HTMLVideoElement | HTMLImageElement
  ): Promise<TurboFace | null> => {
    setIsProcessing(true);
    setError(null);
    
    try {
      const face = await turboRecognizeSingle(input);
      if (face) {
        setLastResult({
          faces: [face],
          totalFaces: 1,
          recognizedCount: face.recognition.recognized ? 1 : 0,
          unrecognizedCount: face.recognition.recognized ? 0 : 1,
          processingTimeMs: 0,
          gpuAccelerated: true,
          usedWorkers: true,
          usedCache: true
        });
        
        if (face.recognition.recognized) {
          setRecognizedFaces(prev => {
            if (prev.some(f => f.recognition.userId === face.recognition.userId)) {
              return prev;
            }
            return [...prev, face];
          });
        }
      }
      return face;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Detection failed';
      setError(message);
      throw err;
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const classroomScan = useCallback(async (
    input: HTMLVideoElement | HTMLImageElement
  ): Promise<TurboDetectionResult> => {
    setIsProcessing(true);
    setError(null);
    
    try {
      const result = await turboClassroomScan(input);
      setLastResult(result);
      
      const newRecognized = result.faces.filter(f => f.recognition.recognized);
      setRecognizedFaces(prev => {
        const existing = new Set(prev.map(f => f.recognition.userId));
        const unique = newRecognized.filter(f => !existing.has(f.recognition.userId));
        return [...prev, ...unique];
      });
      
      toast.success(`Classroom scan complete`, {
        description: `${result.recognizedCount}/${result.totalFaces} students recognized in ${result.processingTimeMs.toFixed(0)}ms`
      });
      
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Classroom scan failed';
      setError(message);
      toast.error('Scan failed', { description: message });
      throw err;
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const recordAttendanceForFaces = useCallback(async (
    faces: TurboFace[]
  ): Promise<{ recorded: number; errors: string[] }> => {
    const result = { recorded: 0, errors: [] as string[] };
    
    const isPastCutoff = cutoffTimeRef.current ? isPastCutoffTime(cutoffTimeRef.current) : false;
    const status = isPastCutoff ? 'late' : 'present';
    
    for (const face of faces) {
      if (face.recognition.recognized && face.recognition.userId) {
        try {
          await recordAttendance(
            face.recognition.userId,
            status,
            face.recognition.matchConfidence
          );
          result.recorded++;
        } catch (err) {
          const message = `Failed to record for ${face.recognition.name}: ${err instanceof Error ? err.message : 'Unknown error'}`;
          result.errors.push(message);
        }
      }
    }
    
    if (result.recorded > 0) {
      toast.success(`Attendance recorded`, {
        description: `${result.recorded} ${status === 'late' ? 'late arrivals' : 'students present'}`
      });
    }
    
    return result;
  }, []);

  const startContinuous = useCallback((
    videoElement: HTMLVideoElement,
    options?: TurboOptions
  ): void => {
    if (continuousIntervalRef.current) {
      stopContinuous();
    }
    
    setIsContinuousActive(true);
    
    // Process at 10 FPS for smooth continuous detection
    continuousIntervalRef.current = setInterval(async () => {
      if (!videoElement.paused && !videoElement.ended) {
        try {
          await detectFaces(videoElement, options);
        } catch {
          // Ignore errors in continuous mode
        }
      }
    }, 100);
  }, [detectFaces]);

  const stopContinuous = useCallback((): void => {
    if (continuousIntervalRef.current) {
      clearInterval(continuousIntervalRef.current);
      continuousIntervalRef.current = null;
    }
    setIsContinuousActive(false);
  }, []);

  const reset = useCallback((): void => {
    stopContinuous();
    setLastResult(null);
    setRecognizedFaces([]);
    setError(null);
    resetTurboStats();
  }, [stopContinuous]);

  // Auto-initialize
  useEffect(() => {
    if (autoInitialize && !isInitialized) {
      initialize();
    }
  }, [autoInitialize, isInitialized, initialize]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopContinuous();
    };
  }, [stopContinuous]);

  return {
    isInitialized,
    isProcessing,
    error,
    lastResult,
    recognizedFaces,
    averageProcessingTime: stats.averageProcessingTime,
    facesPerSecond: stats.facesPerSecond,
    totalProcessed: stats.totalProcessed,
    initialize,
    detectFaces,
    detectSingle,
    classroomScan,
    recordAttendanceForFaces,
    reset,
    startContinuous,
    stopContinuous,
    isContinuousActive
  };
}

export default useTurboRecognition;
