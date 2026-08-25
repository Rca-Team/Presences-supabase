import { useState, useEffect, useCallback } from 'react';
import * as faceapi from 'face-api.js';
import { 
  loadModels, 
  getFaceDescriptor,
  areModelsLoaded,
  recognizeFace,
  recordAttendance,
  storeUnrecognizedFace,
  getAttendanceCutoffTime,
  isPastCutoffTime
} from '@/services/FaceRecognitionService';
import { storeFaceSample } from '@/services/face-recognition/ProgressiveTrainingService';
import { analyzeFace, detectMultipleFaces } from '@/services/ai/FaceAnalysisService';
import { enhanceFaceImage } from '@/services/ai/FaceEnhancementService';
import { smartAlertsService } from '@/services/ai/SmartAlertsService';
import { toast } from 'sonner';

export interface FaceRecognitionResult {
  recognized: boolean;
  employee?: any;
  status?: 'present' | 'late' | 'unauthorized';
  confidence?: number;
  timestamp?: string;
  imageUrl?: string;
  faceAnalysis?: {
    age?: number;
    gender?: 'male' | 'female';
    expressions?: any;
    quality?: any;
    liveness?: any;
    faceCount?: number;
  };
}

export const useFaceRecognition = () => {
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isModelLoading, setIsModelLoading] = useState<boolean>(true);
  const [result, setResult] = useState<FaceRecognitionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cutoffTime, setCutoffTime] = useState<{ hour: number, minute: number }>({ hour: 9, minute: 0 });
  
  useEffect(() => {
    const initializeModels = async () => {
      try {
        setIsModelLoading(true);
        setError(null);
        console.log('Starting face recognition model initialization...');
        await loadModels();
        setIsModelLoading(false);
        console.log('Models loaded successfully');
      } catch (err) {
        console.error('Error loading face recognition models:', err);
        setError('Failed to load face recognition models. Please refresh the page.');
        setIsModelLoading(false);
        toast.error('Failed to load face recognition models. Please refresh the page.');
      }
    };
    
    console.log('Starting model initialization');
    if (!areModelsLoaded()) {
      initializeModels();
    } else {
      setIsModelLoading(false);
      console.log('Models already loaded');
    }
    
    const loadCutoffTime = async () => {
      try {
        const time = await getAttendanceCutoffTime();
        setCutoffTime(time);
        console.log(`Loaded attendance cutoff time: ${time.hour}:${time.minute}`);
      } catch (err) {
        console.error('Error loading cutoff time:', err);
      }
    };
    
    loadCutoffTime();
  }, []);
  
  const processFace = useCallback(async (mediaElement: HTMLVideoElement | HTMLImageElement): Promise<FaceRecognitionResult | null> => {
    if (isProcessing) {
      console.log('Already processing a face');
      return null;
    }
    
    if (isModelLoading) {
      console.log('Models still loading, cannot process face yet');
      setError('Face recognition models are still loading. Please wait...');
      toast.error('Face recognition models are still loading. Please wait...');
      return null;
    }
    
    try {
      console.log('Starting face processing with', mediaElement instanceof HTMLVideoElement ? 'video' : 'image');
      setIsProcessing(true);
      setError(null);
      
      console.log('Media dimensions:', 
        mediaElement instanceof HTMLVideoElement 
          ? `${mediaElement.videoWidth || 'unknown width'} x ${mediaElement.videoHeight || 'unknown height'}`
          : `${mediaElement.width || 'unknown width'} x ${mediaElement.height || 'unknown height'}`
      );
      
      if (mediaElement instanceof HTMLVideoElement) {
        console.log('Video state:', mediaElement.readyState, 'Video dimensions:', mediaElement.videoWidth, 'x', mediaElement.videoHeight);
        
        let attempts = 0;
        const maxAttempts = 5;
        
        while ((mediaElement.readyState < 2 || mediaElement.videoWidth === 0) && attempts < maxAttempts) {
          console.log(`Video not ready for processing, attempt ${attempts + 1}/${maxAttempts}`);
          await new Promise(resolve => setTimeout(resolve, 1000));
          attempts++;
        }
        
        if (mediaElement.readyState < 2 || mediaElement.videoWidth === 0) {
          setError('Camera stream not ready. Please restart the camera and try again.');
          setIsProcessing(false);
          toast.error('Camera stream not ready. Please restart the camera and try again.');
          return null;
        }
      }
      
      const faceDescriptor = await getFaceDescriptor(mediaElement);
      
      if (!faceDescriptor) {
        console.log('No face detected');
        setError('No face detected in the image');
        setIsProcessing(false);
        toast.error('No face detected. Please try again.');
        return null;
      }
      
      // AI-powered face analysis
      console.log('Performing AI face analysis...');
      const faceAnalysis = await analyzeFace(mediaElement);
      const multipleFaces = await detectMultipleFaces(mediaElement);
      
      // Enhance image quality if needed
      if (faceAnalysis?.quality && faceAnalysis.quality.score < 0.6) {
        console.log('Enhancing image quality...');
        await enhanceFaceImage(mediaElement);
      }
      
      console.log('Face descriptor obtained, recognizing face...');
      const recognitionResult = await recognizeFace(faceDescriptor);
      
      if (!recognitionResult.recognized) {
        console.log('Face not recognized, storing as unrecognized');
        let imageUrl;
        if (mediaElement instanceof HTMLVideoElement) {
          const canvas = document.createElement('canvas');
          canvas.width = mediaElement.videoWidth;
          canvas.height = mediaElement.videoHeight;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(mediaElement, 0, 0, canvas.width, canvas.height);
          
          const imageData = canvas.toDataURL('image/png');
          await storeUnrecognizedFace(imageData)
            .catch(err => console.error('Failed to store unrecognized face, but continuing:', err));
          
          imageUrl = imageData;
        }
        
        const result: FaceRecognitionResult = {
          recognized: false,
          status: 'unauthorized',
          imageUrl: imageUrl,
          faceAnalysis: {
            ...faceAnalysis,
            faceCount: multipleFaces.count
          }
        };
        
        // Trigger smart alerts
        smartAlertsService.evaluateEvent({
          timestamp: new Date(),
          status: 'unauthorized',
          faceAnalysis: result.faceAnalysis
        });
        
        toast.error('Face not recognized.');
        setResult(result);
        setIsProcessing(false);
        return result;
      }
      
      const isPastCutoff = isPastCutoffTime(cutoffTime);
      const status: 'present' | 'late' = isPastCutoff ? 'late' : 'present';
      console.log(`Attendance status determined: ${status} (past cutoff: ${isPastCutoff})`);
      
      // Capture the frame for notification email
      let capturedImageDataUrl: string | undefined;
      if (mediaElement instanceof HTMLVideoElement) {
        const capCanvas = document.createElement('canvas');
        capCanvas.width = mediaElement.videoWidth;
        capCanvas.height = mediaElement.videoHeight;
        const capCtx = capCanvas.getContext('2d');
        capCtx?.drawImage(mediaElement, 0, 0);
        capturedImageDataUrl = capCanvas.toDataURL('image/jpeg', 0.85);
      }
      
      await recordAttendance(
        recognitionResult.employee.id, 
        status, 
        recognitionResult.confidence,
        undefined,
        capturedImageDataUrl,
        'ai-scan'
      );
      
      // Store face sample for progressive training (improves accuracy over time)
      if (recognitionResult.confidence && recognitionResult.confidence > 0.75) {
        try {
          // Capture current frame as blob for training
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
            faceDescriptor,
            imageBlob,
            recognitionResult.employee.name,
            recognitionResult.confidence
          );
          console.log('Progressive training sample stored successfully');
        } catch (trainError) {
          console.error('Failed to store training sample:', trainError);
          // Don't fail the main flow if training fails
        }
      }
      
      const timestamp = new Date().toISOString();
      
      const result: FaceRecognitionResult = {
        recognized: true,
        employee: recognitionResult.employee,
        status: status,
        confidence: recognitionResult.confidence,
        timestamp,
        imageUrl: recognitionResult.employee.firebase_image_url,
        faceAnalysis: {
          ...faceAnalysis,
          faceCount: multipleFaces.count
        }
      };
      
      // Trigger smart alerts
      smartAlertsService.evaluateEvent({
        userId: recognitionResult.employee.id,
        userName: recognitionResult.employee.name,
        timestamp: new Date(),
        status: status,
        confidence: recognitionResult.confidence,
        faceAnalysis: result.faceAnalysis
      });
      
      if (status === 'present') {
        toast.success(`Welcome, ${recognitionResult.employee.name}!`);
      } else {
        toast.warning(`Hello ${recognitionResult.employee.name}! You're marked as late.`);
      }
      
      setResult(result);
      setIsProcessing(false);
      console.log('Face processing complete', result);
      return result;
    } catch (err) {
      console.error('Error processing face:', err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError('Error processing face: ' + errorMessage);
      setIsProcessing(false);
      toast.error('Error processing face: ' + errorMessage);
      return null;
    }
  }, [isProcessing, isModelLoading, cutoffTime]);
  
  const resetResult = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);
  
  return {
    processFace,
    isProcessing,
    isModelLoading,
    result,
    error,
    resetResult,
    cutoffTime
  };
};

export default useFaceRecognition;
