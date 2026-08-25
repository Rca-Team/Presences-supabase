import * as faceapi from 'face-api.js';
import { loadNets } from './NetLoaderService';

let modelsLoaded = false;
let modelsLoading = false;
let loadPromise: Promise<void> | null = null;

/**
 * Optimized model loading with singleton pattern
 * Ensures models are only loaded once
 */
export const loadRegistrationModels = async (): Promise<boolean> => {
  if (modelsLoaded) {
    console.log('Registration models already loaded');
    return true;
  }

  if (modelsLoading && loadPromise) {
    console.log('Models are currently loading, waiting...');
    await loadPromise;
    return modelsLoaded;
  }

  modelsLoading = true;

  loadPromise = (async () => {
    try {
      console.log('Loading registration models...');
      
      // Load models in parallel for speed
      await loadNets(['ssdMobilenetv1', 'tinyFaceDetector', 'faceLandmark68Net', 'faceRecognitionNet']);

      modelsLoaded = true;
      console.log('Registration models loaded successfully');
    } catch (error) {
      console.error('Error loading registration models:', error);
      modelsLoaded = false;
      throw error;
    } finally {
      modelsLoading = false;
    }
  })();

  await loadPromise;
  return modelsLoaded;
};

/**
 * Check if models are loaded
 */
export const areRegistrationModelsLoaded = (): boolean => {
  return modelsLoaded;
};

/**
 * Get face descriptor from an image element
 * Uses optimized detection with fallback
 */
export const getFaceDescriptorFromImage = async (
  imageSource: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement
): Promise<Float32Array | null> => {
  if (!modelsLoaded) {
    console.log('Models not loaded, loading now...');
    await loadRegistrationModels();
  }

  try {
    // Try SSD MobileNet first (more accurate for photos)
    let detection = await faceapi
      .detectSingleFace(imageSource, new faceapi.SsdMobilenetv1Options({ 
        minConfidence: 0.5 
      }))
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (detection) {
      console.log('Face detected with SSD MobileNet, confidence:', detection.detection.score);
      return detection.descriptor;
    }

    // Fallback to TinyFaceDetector (faster, works with more angles)
    console.log('Trying TinyFaceDetector fallback...');
    detection = await faceapi
      .detectSingleFace(imageSource, new faceapi.TinyFaceDetectorOptions({ 
        inputSize: 416, 
        scoreThreshold: 0.4 
      }))
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (detection) {
      console.log('Face detected with TinyFaceDetector');
      return detection.descriptor;
    }

    console.warn('No face detected in image');
    return null;
  } catch (error) {
    console.error('Error getting face descriptor:', error);
    return null;
  }
};

/**
 * Detect face box for face-only image cropping
 */
export const getFaceBoxFromImage = async (
  imageSource: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement
): Promise<{ x: number; y: number; width: number; height: number } | null> => {
  if (!modelsLoaded) {
    await loadRegistrationModels();
  }

  try {
    let detection = await faceapi.detectSingleFace(
      imageSource,
      new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 })
    );

    if (!detection) {
      detection = await faceapi.detectSingleFace(
        imageSource,
        new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.4 })
      );
    }

    if (!detection) return null;
    const box = detection.box;
    return { x: box.x, y: box.y, width: box.width, height: box.height };
  } catch {
    return null;
  }
};

/**
 * Get face descriptor from a Blob
 */
export const getFaceDescriptorFromBlob = async (blob: Blob): Promise<Float32Array | null> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    
    img.onload = async () => {
      try {
        const descriptor = await getFaceDescriptorFromImage(img);
        URL.revokeObjectURL(url);
        resolve(descriptor);
      } catch (error) {
        URL.revokeObjectURL(url);
        reject(error);
      }
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };
    
    img.src = url;
  });
};

/**
 * Detect if a face exists in a video element (for live preview)
 * Uses lightweight detection for performance
 */
export const detectFaceInVideo = async (
  videoElement: HTMLVideoElement
): Promise<boolean> => {
  if (!modelsLoaded) {
    return false;
  }

  try {
    const detection = await faceapi.detectSingleFace(
      videoElement,
      new faceapi.TinyFaceDetectorOptions({ 
        inputSize: 160, 
        scoreThreshold: 0.5 
      })
    );
    
    return !!detection;
  } catch {
    return false;
  }
};
