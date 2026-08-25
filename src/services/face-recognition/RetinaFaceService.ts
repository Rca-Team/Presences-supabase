import { supabase } from '@/integrations/supabase/client';

export interface FaceDetection {
  box: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  confidence: number;
  landmarks: Array<{ x: number; y: number }>;
  embedding?: number[];
}

export interface DetectionResult {
  detections: FaceDetection[];
  processingTime: number;
}

/**
 * Detect faces using RetinaFace backend service
 */
export async function detectFaces(
  imageElement: HTMLVideoElement | HTMLImageElement
): Promise<DetectionResult> {
  const startTime = performance.now();
  
  try {
    // Convert image to base64
    const canvas = document.createElement('canvas');
    canvas.width = imageElement.width || (imageElement as HTMLVideoElement).videoWidth;
    canvas.height = imageElement.height || (imageElement as HTMLVideoElement).videoHeight;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      throw new Error('Failed to get canvas context');
    }
    
    ctx.drawImage(imageElement, 0, 0);
    const imageData = canvas.toDataURL('image/jpeg', 0.95);
    
    // Call backend edge function
    const { data, error } = await supabase.functions.invoke('face-detection', {
      body: {
        image: imageData,
        operation: 'detect'
      }
    });
    
    if (error) throw error;
    
    const processingTime = performance.now() - startTime;
    
    return {
      detections: data.detections || [],
      processingTime
    };
  } catch (error) {
    console.error('RetinaFace detection error:', error);
    throw error;
  }
}

/**
 * Detect faces and get embeddings in one call (more efficient)
 */
export async function detectAndRecognizeFaces(
  imageElement: HTMLVideoElement | HTMLImageElement
): Promise<DetectionResult> {
  const startTime = performance.now();
  
  try {
    // Convert image to base64
    const canvas = document.createElement('canvas');
    canvas.width = imageElement.width || (imageElement as HTMLVideoElement).videoWidth;
    canvas.height = imageElement.height || (imageElement as HTMLVideoElement).videoHeight;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      throw new Error('Failed to get canvas context');
    }
    
    ctx.drawImage(imageElement, 0, 0);
    const imageData = canvas.toDataURL('image/jpeg', 0.95);
    
    // Call backend edge function for combined detection and recognition
    const { data, error } = await supabase.functions.invoke('face-detection', {
      body: {
        image: imageData,
        operation: 'detect-and-recognize'
      }
    });
    
    if (error) throw error;
    
    const processingTime = performance.now() - startTime;
    
    return {
      detections: data.results || [],
      processingTime
    };
  } catch (error) {
    console.error('RetinaFace detection and recognition error:', error);
    throw error;
  }
}

/**
 * Get ArcFace embedding for a face image
 */
export async function getEmbedding(
  imageElement: HTMLVideoElement | HTMLImageElement
): Promise<Float32Array> {
  try {
    // Convert image to base64
    const canvas = document.createElement('canvas');
    canvas.width = imageElement.width || (imageElement as HTMLVideoElement).videoWidth;
    canvas.height = imageElement.height || (imageElement as HTMLVideoElement).videoHeight;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      throw new Error('Failed to get canvas context');
    }
    
    ctx.drawImage(imageElement, 0, 0);
    const imageData = canvas.toDataURL('image/jpeg', 0.95);
    
    // Call backend edge function
    const { data, error } = await supabase.functions.invoke('face-detection', {
      body: {
        image: imageData,
        operation: 'recognize'
      }
    });
    
    if (error) throw error;
    
    return new Float32Array(data.embedding);
  } catch (error) {
    console.error('ArcFace embedding error:', error);
    throw error;
  }
}

/**
 * Compare two embeddings using cosine similarity
 */
export function compareEmbeddings(embedding1: Float32Array, embedding2: Float32Array): number {
  if (embedding1.length !== embedding2.length) {
    throw new Error('Embeddings must have the same length');
  }
  
  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;
  
  for (let i = 0; i < embedding1.length; i++) {
    dotProduct += embedding1[i] * embedding2[i];
    norm1 += embedding1[i] * embedding1[i];
    norm2 += embedding2[i] * embedding2[i];
  }
  
  // Cosine similarity
  return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
}
