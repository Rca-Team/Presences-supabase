import { pipeline, env } from '@huggingface/transformers';

// Configure transformers.js for browser usage
env.allowLocalModels = false;
env.useBrowserCache = true;

class VideoEnhancementService {
  private upscaler: any = null;
  private isInitialized = false;

  async initialize() {
    if (this.isInitialized) return;
    
    try {
      console.log('Initializing video enhancement service...');
      
      // Use Real-ESRGAN for super-resolution enhancement
      this.upscaler = await pipeline(
        'image-to-image',
        'Xenova/swin2SR-classical-sr-x2-64',
        { 
          device: 'webgpu',
          dtype: 'fp32'
        }
      );
      
      this.isInitialized = true;
      console.log('Video enhancement service initialized successfully');
    } catch (error) {
      console.error('Failed to initialize video enhancement service:', error);
      // Fallback without enhancement
      this.isInitialized = false;
    }
  }

  async enhanceVideoFrame(videoElement: HTMLVideoElement): Promise<HTMLCanvasElement> {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      throw new Error('Could not get canvas context');
    }

    // Set canvas dimensions to video dimensions
    canvas.width = videoElement.videoWidth;
    canvas.height = videoElement.videoHeight;
    
    // Draw current video frame to canvas
    ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
    
    // If enhancement is available, apply it
    if (this.isInitialized && this.upscaler) {
      try {
        console.log('Enhancing video frame for better recognition...');
        
        // Convert canvas to image data
        const imageData = canvas.toDataURL('image/jpeg', 0.9);
        
        // Apply AI enhancement
        const enhancedResult = await this.upscaler(imageData);
        
        if (enhancedResult && enhancedResult.length > 0) {
          // Create new image from enhanced result
          const enhancedImage = new Image();
          await new Promise((resolve, reject) => {
            enhancedImage.onload = resolve;
            enhancedImage.onerror = reject;
            enhancedImage.src = enhancedResult[0];
          });
          
          // Draw enhanced image back to canvas
          canvas.width = enhancedImage.width;
          canvas.height = enhancedImage.height;
          ctx.drawImage(enhancedImage, 0, 0);
          
          console.log('Video frame enhanced successfully');
        }
      } catch (error) {
        console.warn('Enhancement failed, using original frame:', error);
        // Continue with original frame
      }
    } else {
      console.log('Enhancement not available, using original frame');
    }
    
    return canvas;
  }

  async enhanceImageForRecognition(imageElement: HTMLImageElement): Promise<Blob> {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      throw new Error('Could not get canvas context');
    }

    // Apply basic image enhancement techniques
    canvas.width = imageElement.naturalWidth * 2; // 2x upscaling
    canvas.height = imageElement.naturalHeight * 2;
    
    // Enable image smoothing for better quality
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    
    // Draw and scale the image
    ctx.drawImage(imageElement, 0, 0, canvas.width, canvas.height);
    
    // Apply contrast and sharpening
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    
    // Enhance contrast and brightness
    for (let i = 0; i < data.length; i += 4) {
      // Apply contrast enhancement
      data[i] = Math.min(255, Math.max(0, (data[i] - 128) * 1.2 + 128));     // Red
      data[i + 1] = Math.min(255, Math.max(0, (data[i + 1] - 128) * 1.2 + 128)); // Green
      data[i + 2] = Math.min(255, Math.max(0, (data[i + 2] - 128) * 1.2 + 128)); // Blue
      // Alpha channel remains unchanged
    }
    
    ctx.putImageData(imageData, 0, 0);
    
    // Convert canvas to blob
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Failed to create enhanced image blob'));
          }
        },
        'image/jpeg',
        0.9
      );
    });
  }

  isEnhancementAvailable(): boolean {
    return this.isInitialized && this.upscaler !== null;
  }
}

export const videoEnhancementService = new VideoEnhancementService();
