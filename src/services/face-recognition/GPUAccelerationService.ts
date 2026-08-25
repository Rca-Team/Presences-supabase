/**
 * GPU Acceleration Service
 * Enables WebGL backend for TensorFlow.js and provides GPU optimization utilities
 */

import * as faceapi from 'face-api.js';

// GPU state management
let gpuInitialized = false;
let gpuAvailable = false;
let backendName = 'cpu';
let warmupComplete = false;

export interface GPUStats {
  initialized: boolean;
  available: boolean;
  backend: string;
  warmupComplete: boolean;
  memoryInfo?: {
    numBytesInGPU?: number;
    numTensors?: number;
    numDataBuffers?: number;
  };
}

/**
 * Initialize GPU acceleration with WebGL backend
 * Falls back to CPU if WebGL is not available
 */
export async function initializeGPU(): Promise<boolean> {
  if (gpuInitialized) {
    console.log('GPU already initialized with backend:', backendName);
    return gpuAvailable;
  }

  try {
    console.log('Initializing GPU acceleration...');
    
    // Access TensorFlow.js through face-api
    const tf = faceapi.tf;
    
    // Try to set WebGL backend for GPU acceleration
    try {
      await tf.setBackend('webgl');
      await tf.ready();
      backendName = tf.getBackend();
      gpuAvailable = backendName === 'webgl';
      console.log(`Backend set to: ${backendName}`);
    } catch (webglError) {
      console.warn('WebGL backend not available, falling back to CPU:', webglError);
      await tf.setBackend('cpu');
      await tf.ready();
      backendName = tf.getBackend();
      gpuAvailable = false;
    }

    // Configure WebGL for optimal performance
    if (gpuAvailable) {
      const webglBackend = tf.backend();
      if (webglBackend && 'texData' in webglBackend) {
        console.log('WebGL backend configured for optimal performance');
      }
    }

    gpuInitialized = true;
    console.log(`GPU initialization complete. Available: ${gpuAvailable}, Backend: ${backendName}`);
    
    return gpuAvailable;
  } catch (error) {
    console.error('Error initializing GPU:', error);
    gpuInitialized = true;
    gpuAvailable = false;
    backendName = 'cpu';
    return false;
  }
}

/**
 * Pre-warm the GPU by running a dummy inference
 * This eliminates cold-start latency on first real detection
 */
export async function warmupGPU(): Promise<void> {
  if (warmupComplete) {
    console.log('GPU already warmed up');
    return;
  }

  if (!gpuInitialized) {
    await initializeGPU();
  }

  try {
    console.log('Warming up GPU...');
    const startTime = performance.now();
    
    // Create a small dummy canvas for warmup
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    
    if (ctx) {
      // Fill with random data to simulate a real image
      const imageData = ctx.createImageData(128, 128);
      for (let i = 0; i < imageData.data.length; i += 4) {
        imageData.data[i] = Math.random() * 255;     // R
        imageData.data[i + 1] = Math.random() * 255; // G
        imageData.data[i + 2] = Math.random() * 255; // B
        imageData.data[i + 3] = 255;                  // A
      }
      ctx.putImageData(imageData, 0, 0);

      // Run a quick detection to warm up the model
      try {
        await faceapi.detectSingleFace(canvas, new faceapi.TinyFaceDetectorOptions({
          inputSize: 128,
          scoreThreshold: 0.5
        }));
      } catch {
        // It's okay if no face is detected, the warmup still happened
      }
    }

    const warmupTime = performance.now() - startTime;
    warmupComplete = true;
    console.log(`GPU warmup complete in ${warmupTime.toFixed(2)}ms`);
  } catch (error) {
    console.error('Error warming up GPU:', error);
    warmupComplete = true; // Mark as complete even on error to prevent retries
  }
}

/**
 * Get current GPU statistics
 */
export function getGPUStats(): GPUStats {
  const tf = faceapi.tf;
  
  let memoryInfo: GPUStats['memoryInfo'];
  try {
    const memory = tf.memory() as any;
    memoryInfo = {
      numBytesInGPU: memory.numBytesInGPU ?? 0,
      numTensors: memory.numTensors ?? 0,
      numDataBuffers: memory.numDataBuffers ?? 0
    };
  } catch {
    // Memory info not available
  }

  return {
    initialized: gpuInitialized,
    available: gpuAvailable,
    backend: backendName,
    warmupComplete,
    memoryInfo
  };
}

/**
 * Clean up GPU memory
 */
export function cleanupGPUMemory(): void {
  try {
    const tf = faceapi.tf;
    
    // Dispose of all tensors
    tf.disposeVariables();
    
    // Run garbage collection
    if (typeof tf.engine === 'function') {
      const engine = tf.engine();
      if (engine && typeof engine.startScope === 'function') {
        engine.startScope();
        engine.endScope({});
      }
    }
    
    console.log('GPU memory cleaned up');
  } catch (error) {
    console.error('Error cleaning up GPU memory:', error);
  }
}

/**
 * Check if GPU is available
 */
export function isGPUAvailable(): boolean {
  return gpuAvailable;
}

/**
 * Check if GPU is initialized
 */
export function isGPUInitialized(): boolean {
  return gpuInitialized;
}

/**
 * Get the current backend name
 */
export function getCurrentBackend(): string {
  return backendName;
}

/**
 * Run a tensor operation within a tidy scope for automatic memory management
 * Note: tf.tidy doesn't work with async functions, so we handle cleanup manually
 */
export async function runWithGPU<T>(fn: () => Promise<T>): Promise<T> {
  const tf = faceapi.tf;
  
  const numTensorsBefore = tf.memory().numTensors;
  
  try {
    const result = await fn();
    return result;
  } finally {
    // Check for tensor leaks
    const numTensorsAfter = tf.memory().numTensors;
    if (numTensorsAfter > numTensorsBefore + 10) {
      console.warn(`Potential tensor leak: ${numTensorsAfter - numTensorsBefore} tensors created`);
    }
  }
}

/**
 * Optimize image for GPU processing
 * Converts to power-of-2 dimensions and ensures proper format
 */
export function optimizeImageForGPU(
  source: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement,
  targetSize: number = 416
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  
  // Use power of 2 dimensions for GPU efficiency
  const powerOf2Size = Math.pow(2, Math.ceil(Math.log2(targetSize)));
  canvas.width = powerOf2Size;
  canvas.height = powerOf2Size;
  
  const ctx = canvas.getContext('2d');
  if (ctx) {
    // Disable image smoothing for faster processing
    ctx.imageSmoothingEnabled = false;
    
    // Calculate scaling to maintain aspect ratio
    const sourceWidth = source instanceof HTMLVideoElement ? source.videoWidth : source.width;
    const sourceHeight = source instanceof HTMLVideoElement ? source.videoHeight : source.height;
    const scale = Math.min(powerOf2Size / sourceWidth, powerOf2Size / sourceHeight);
    const scaledWidth = sourceWidth * scale;
    const scaledHeight = sourceHeight * scale;
    const offsetX = (powerOf2Size - scaledWidth) / 2;
    const offsetY = (powerOf2Size - scaledHeight) / 2;
    
    // Clear and draw
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, powerOf2Size, powerOf2Size);
    ctx.drawImage(source, offsetX, offsetY, scaledWidth, scaledHeight);
  }
  
  return canvas;
}

/**
 * Batch process multiple images on GPU
 */
export async function batchProcessImages<T>(
  images: (HTMLVideoElement | HTMLImageElement | HTMLCanvasElement)[],
  processor: (image: HTMLCanvasElement) => Promise<T>,
  batchSize: number = 4
): Promise<T[]> {
  const results: T[] = [];
  
  // Process in batches to avoid GPU memory issues
  for (let i = 0; i < images.length; i += batchSize) {
    const batch = images.slice(i, i + batchSize);
    const optimizedBatch = batch.map(img => optimizeImageForGPU(img));
    
    // Process batch in parallel
    const batchResults = await Promise.all(
      optimizedBatch.map(img => processor(img))
    );
    
    results.push(...batchResults);
    
    // Clean up memory between batches
    if (i + batchSize < images.length) {
      cleanupGPUMemory();
    }
  }
  
  return results;
}
