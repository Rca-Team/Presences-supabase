import { pipeline, env } from '@huggingface/transformers';

// Configure transformers.js for browser usage
env.allowLocalModels = false;
env.useBrowserCache = true;

const MAX_DIMENSION = 512;

export interface EnhancementResult {
  enhancedImage: Blob;
  originalQuality: number;
  enhancedQuality: number;
  improvements: {
    brightnessAdjusted: boolean;
    contrastImproved: boolean;
    noiseReduced: boolean;
    sharpnessEnhanced: boolean;
  };
}

// Basic image enhancement using canvas operations
export const enhanceFaceImage = async (
  imageElement: HTMLImageElement | HTMLVideoElement,
  options: {
    adjustBrightness?: boolean;
    enhanceContrast?: boolean;
    reduceNoise?: boolean;
    sharpen?: boolean;
  } = {}
): Promise<EnhancementResult> => {
  const {
    adjustBrightness = true,
    enhanceContrast = true,
    reduceNoise = true,
    sharpen = true
  } = options;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  if (!ctx) throw new Error('Could not get canvas context');

  // Set canvas dimensions
  if (imageElement instanceof HTMLVideoElement) {
    canvas.width = Math.min(imageElement.videoWidth, MAX_DIMENSION);
    canvas.height = Math.min(imageElement.videoHeight, MAX_DIMENSION);
  } else {
    canvas.width = Math.min(imageElement.width, MAX_DIMENSION);
    canvas.height = Math.min(imageElement.height, MAX_DIMENSION);
  }

  // Draw original image
  ctx.drawImage(imageElement, 0, 0, canvas.width, canvas.height);
  
  // Get original image data
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  
  // Calculate original quality metrics
  const originalQuality = calculateImageQuality(data);
  
  const improvements = {
    brightnessAdjusted: false,
    contrastImproved: false,
    noiseReduced: false,
    sharpnessEnhanced: false
  };

  // Apply enhancements
  if (adjustBrightness) {
    applyBrightnessCorrection(data);
    improvements.brightnessAdjusted = true;
  }

  if (enhanceContrast) {
    applyContrastEnhancement(data);
    improvements.contrastImproved = true;
  }

  if (reduceNoise) {
    applyNoiseReduction(data, canvas.width, canvas.height);
    improvements.noiseReduced = true;
  }

  if (sharpen) {
    applySharpeningFilter(data, canvas.width, canvas.height);
    improvements.sharpnessEnhanced = true;
  }

  // Apply enhanced image data
  ctx.putImageData(imageData, 0, 0);
  
  // Calculate enhanced quality
  const enhancedQuality = calculateImageQuality(data);

  // Convert to blob
  const enhancedImage = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Failed to create blob'));
    }, 'image/png');
  });

  return {
    enhancedImage,
    originalQuality,
    enhancedQuality,
    improvements
  };
};

// Calculate simple image quality score
const calculateImageQuality = (data: Uint8ClampedArray): number => {
  let brightness = 0;
  let contrast = 0;
  const pixels = data.length / 4;

  // Calculate brightness and contrast
  for (let i = 0; i < data.length; i += 4) {
    const gray = (data[i] + data[i + 1] + data[i + 2]) / 3;
    brightness += gray;
  }
  brightness = brightness / pixels / 255;

  // Simple contrast calculation
  let variance = 0;
  for (let i = 0; i < data.length; i += 4) {
    const gray = (data[i] + data[i + 1] + data[i + 2]) / 3 / 255;
    variance += Math.pow(gray - brightness, 2);
  }
  contrast = Math.sqrt(variance / pixels);

  // Quality score based on brightness (optimal around 0.5) and contrast
  const brightnessScore = 1 - Math.abs(brightness - 0.5) * 2;
  const contrastScore = Math.min(contrast * 4, 1);
  
  return (brightnessScore + contrastScore) / 2;
};

// Apply brightness correction
const applyBrightnessCorrection = (data: Uint8ClampedArray) => {
  // Calculate current brightness
  let avgBrightness = 0;
  for (let i = 0; i < data.length; i += 4) {
    avgBrightness += (data[i] + data[i + 1] + data[i + 2]) / 3;
  }
  avgBrightness = avgBrightness / (data.length / 4);

  // Target brightness (around 128 for good visibility)
  const targetBrightness = 128;
  const adjustment = targetBrightness - avgBrightness;

  // Apply brightness adjustment
  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.min(255, Math.max(0, data[i] + adjustment));     // R
    data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + adjustment)); // G
    data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + adjustment)); // B
  }
};

// Apply contrast enhancement
const applyContrastEnhancement = (data: Uint8ClampedArray) => {
  const factor = 1.2; // Contrast enhancement factor
  
  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.min(255, Math.max(0, ((data[i] - 128) * factor) + 128));
    data[i + 1] = Math.min(255, Math.max(0, ((data[i + 1] - 128) * factor) + 128));
    data[i + 2] = Math.min(255, Math.max(0, ((data[i + 2] - 128) * factor) + 128));
  }
};

// Apply simple noise reduction
const applyNoiseReduction = (data: Uint8ClampedArray, width: number, height: number) => {
  const tempData = new Uint8ClampedArray(data);
  
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4;
      
      // Apply 3x3 blur kernel for noise reduction
      for (let c = 0; c < 3; c++) {
        let sum = 0;
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const kidx = ((y + ky) * width + (x + kx)) * 4;
            sum += tempData[kidx + c];
          }
        }
        data[idx + c] = sum / 9;
      }
    }
  }
};

// Apply sharpening filter
const applySharpeningFilter = (data: Uint8ClampedArray, width: number, height: number) => {
  const tempData = new Uint8ClampedArray(data);
  
  // Sharpening kernel
  const kernel = [
    0, -1, 0,
    -1, 5, -1,
    0, -1, 0
  ];
  
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4;
      
      for (let c = 0; c < 3; c++) {
        let sum = 0;
        let kernelIdx = 0;
        
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const kidx = ((y + ky) * width + (x + kx)) * 4;
            sum += tempData[kidx + c] * kernel[kernelIdx];
            kernelIdx++;
          }
        }
        
        data[idx + c] = Math.min(255, Math.max(0, sum));
      }
    }
  }
};

// Auto-enhance face region specifically
export const autoEnhanceFace = async (
  imageElement: HTMLImageElement | HTMLVideoElement,
  faceBox?: { x: number; y: number; width: number; height: number }
): Promise<Blob> => {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  if (!ctx) throw new Error('Could not get canvas context');

  canvas.width = imageElement instanceof HTMLVideoElement ? 
    imageElement.videoWidth : imageElement.width;
  canvas.height = imageElement instanceof HTMLVideoElement ? 
    imageElement.videoHeight : imageElement.height;

  ctx.drawImage(imageElement, 0, 0);

  if (faceBox) {
    // Extract face region
    const faceImageData = ctx.getImageData(
      faceBox.x, faceBox.y, faceBox.width, faceBox.height
    );
    
    // Apply enhancements to face region only
    applyBrightnessCorrection(faceImageData.data);
    applyContrastEnhancement(faceImageData.data);
    
    // Put enhanced face back
    ctx.putImageData(faceImageData, faceBox.x, faceBox.y);
  } else {
    // Enhance entire image
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    applyBrightnessCorrection(imageData.data);
    applyContrastEnhancement(imageData.data);
    ctx.putImageData(imageData, 0, 0);
  }

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Failed to create enhanced image'));
    }, 'image/png');
  });
};