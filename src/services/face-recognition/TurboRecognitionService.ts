/**
 * Turbo Face Recognition Service
 * High-performance face recognition with GPU acceleration, worker pool, and caching
 */

import * as faceapi from 'face-api.js';
import { initializeGPU, warmupGPU, isGPUAvailable, optimizeImageForGPU } from './GPUAccelerationService';
import { initializeWorkerPool, batchMatchDescriptors, matchDescriptorParallel, isPoolInitialized } from './WorkerPoolService';
import { initializeDescriptorCache, syncFromSupabase, findNearestMatch, getAllCachedDescriptors, isCacheReady } from './DescriptorCacheService';
import { loadOptimizedModels, areOptimizedModelsLoaded, detectFacesOptimized } from './OptimizedModelService';

// Pipeline state
let pipelineInitialized = false;
let initializationPromise: Promise<void> | null = null;

// Performance tracking
let totalProcessingTime = 0;
let totalProcessedFaces = 0;
let processingHistory: number[] = [];

export interface TurboDetectionResult {
  faces: TurboFace[];
  totalFaces: number;
  recognizedCount: number;
  unrecognizedCount: number;
  processingTimeMs: number;
  gpuAccelerated: boolean;
  usedWorkers: boolean;
  usedCache: boolean;
}

export interface TurboFace {
  id: string;
  boundingBox: { x: number; y: number; width: number; height: number };
  confidence: number;
  descriptor: Float32Array;
  recognition: {
    recognized: boolean;
    userId?: string;
    name?: string;
    matchConfidence?: number;
    matchDistance?: number;
  };
}

export interface TurboOptions {
  maxFaces?: number;
  matchThreshold?: number;
  useGPU?: boolean;
  useWorkers?: boolean;
  useCache?: boolean;
  classroomMode?: boolean;
  minFaceSize?: number;
}

const DEFAULT_OPTIONS: TurboOptions = {
  maxFaces: 10,
  matchThreshold: 0.45,   // Strict threshold aligned with RecognitionService
  useGPU: true,
  useWorkers: true,
  useCache: true,
  classroomMode: false,
  minFaceSize: 80
};

/**
 * Initialize the turbo recognition pipeline
 * Sets up GPU, workers, cache, and models
 */
export async function initializeTurboPipeline(): Promise<void> {
  if (pipelineInitialized) {
    console.log('Turbo pipeline already initialized');
    return;
  }

  // Prevent multiple simultaneous initializations
  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = (async () => {
    console.log('🚀 Initializing Turbo Face Recognition Pipeline...');
    const startTime = performance.now();

    try {
      // Initialize all components in parallel
      await Promise.all([
        // 1. GPU Acceleration
        (async () => {
          console.log('  ⚡ Initializing GPU...');
          await initializeGPU();
          await warmupGPU();
          console.log(`  ⚡ GPU: ${isGPUAvailable() ? 'WebGL' : 'CPU fallback'}`);
        })(),

        // 2. Worker Pool
        (async () => {
          console.log('  🔧 Initializing Worker Pool...');
          await initializeWorkerPool();
          console.log('  🔧 Workers ready');
        })(),

        // 3. Descriptor Cache
        (async () => {
          console.log('  💾 Initializing Descriptor Cache...');
          await initializeDescriptorCache();
          const synced = await syncFromSupabase();
          console.log(`  💾 Cache ready: ${synced} descriptors loaded`);
        })(),

        // 4. Face Detection Models
        (async () => {
          console.log('  🧠 Loading Face Recognition Models...');
          await loadOptimizedModels();
          console.log('  🧠 Models loaded');
        })()
      ]);

      pipelineInitialized = true;
      const initTime = performance.now() - startTime;
      console.log(`🚀 Turbo Pipeline initialized in ${initTime.toFixed(0)}ms`);
    } catch (error) {
      console.error('Failed to initialize turbo pipeline:', error);
      throw error;
    } finally {
      initializationPromise = null;
    }
  })();

  return initializationPromise;
}

/**
 * Detect and recognize multiple faces with maximum performance
 */
export async function turboDetectAndRecognize(
  input: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement,
  options: TurboOptions = {}
): Promise<TurboDetectionResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const startTime = performance.now();

  // Ensure pipeline is initialized
  if (!pipelineInitialized) {
    await initializeTurboPipeline();
  }

  const result: TurboDetectionResult = {
    faces: [],
    totalFaces: 0,
    recognizedCount: 0,
    unrecognizedCount: 0,
    processingTimeMs: 0,
    gpuAccelerated: opts.useGPU && isGPUAvailable(),
    usedWorkers: opts.useWorkers && isPoolInitialized(),
    usedCache: opts.useCache && isCacheReady()
  };

  try {
    // Step 1: Optimize input for GPU (if using GPU)
    let processInput: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement = input;
    if (opts.useGPU && isGPUAvailable() && !(input instanceof HTMLCanvasElement)) {
      processInput = optimizeImageForGPU(input, opts.classroomMode ? 640 : 416);
    }

    // Step 2: Detect faces
    const detections = await detectFacesOptimized(
      processInput as HTMLVideoElement | HTMLImageElement,
      {
        maxFaces: opts.classroomMode ? 60 : opts.maxFaces,
        classroomMode: opts.classroomMode,
        minFaceSize: opts.minFaceSize,
        scoreThreshold: opts.classroomMode ? 0.5 : 0.6
      }
    );

    if (detections.length === 0) {
      result.processingTimeMs = performance.now() - startTime;
      return result;
    }

    // Step 3: Match descriptors
    const descriptors = detections.map(d => d.descriptor);
    let matchResults: Array<{ match?: any; distance?: number; confidence?: number }> = [];

    if (opts.useCache && isCacheReady()) {
      // Use k-d tree cache for O(log n) matching
      matchResults = descriptors.map(desc => {
        const match = findNearestMatch(Array.from(desc), opts.matchThreshold);
        if (match) {
          return {
            match: match.descriptor,
            distance: match.distance,
            confidence: 1 - match.distance
          };
        }
        return {};
      });
    } else if (opts.useWorkers && isPoolInitialized()) {
      // Use worker pool for parallel matching
      const registeredFaces = getAllCachedDescriptors().map(d => ({
        id: d.id,
        name: d.name,
        descriptor: d.descriptor
      }));
      
      if (registeredFaces.length > 0) {
        const workerResults = await batchMatchDescriptors(
          descriptors,
          registeredFaces,
          opts.matchThreshold
        );
        matchResults = workerResults.map(r => ({
          match: r.match,
          distance: r.distance,
          confidence: r.confidence
        }));
      }
    }

    // Step 4: Build results
    for (let i = 0; i < detections.length; i++) {
      const detection = detections[i];
      const matchResult = matchResults[i] || {};
      
      const face: TurboFace = {
        id: `face_${Date.now()}_${i}`,
        boundingBox: {
          x: detection.detection.box.x,
          y: detection.detection.box.y,
          width: detection.detection.box.width,
          height: detection.detection.box.height
        },
        confidence: detection.detection.score,
        descriptor: detection.descriptor,
        recognition: {
          recognized: !!matchResult.match,
          userId: matchResult.match?.userId,
          name: matchResult.match?.name,
          matchConfidence: matchResult.confidence,
          matchDistance: matchResult.distance
        }
      };

      result.faces.push(face);

      if (face.recognition.recognized) {
        result.recognizedCount++;
      } else {
        result.unrecognizedCount++;
      }
    }

    result.totalFaces = result.faces.length;
    result.processingTimeMs = performance.now() - startTime;

    // Update performance stats
    updatePerformanceStats(result.processingTimeMs, result.totalFaces);

    console.log(`⚡ Turbo detection: ${result.totalFaces} faces in ${result.processingTimeMs.toFixed(0)}ms (${result.recognizedCount} recognized)`);

    return result;
  } catch (error) {
    console.error('Turbo detection error:', error);
    result.processingTimeMs = performance.now() - startTime;
    return result;
  }
}

/**
 * Quick single face detection and recognition
 */
export async function turboRecognizeSingle(
  input: HTMLVideoElement | HTMLImageElement,
  threshold: number = 0.45
): Promise<TurboFace | null> {
  const result = await turboDetectAndRecognize(input, {
    maxFaces: 1,
    matchThreshold: threshold,
    classroomMode: false
  });

  return result.faces[0] || null;
}

/**
 * Classroom mode: Optimized for 50+ faces
 */
export async function turboClassroomScan(
  input: HTMLVideoElement | HTMLImageElement
): Promise<TurboDetectionResult> {
  return turboDetectAndRecognize(input, {
    maxFaces: 60,
    matchThreshold: 0.45,
    classroomMode: true,
    minFaceSize: 60 // Allow smaller faces in classroom setting
  });
}

/**
 * Update performance tracking
 */
function updatePerformanceStats(processingTime: number, faceCount: number): void {
  totalProcessingTime += processingTime;
  totalProcessedFaces += faceCount;
  processingHistory.push(processingTime);
  
  // Keep last 100 measurements
  if (processingHistory.length > 100) {
    processingHistory.shift();
  }
}

/**
 * Get performance statistics
 */
export function getTurboPerformanceStats(): {
  averageProcessingTime: number;
  totalProcessedFaces: number;
  facesPerSecond: number;
  lastProcessingTimes: number[];
  pipelineReady: boolean;
} {
  const avgTime = processingHistory.length > 0
    ? processingHistory.reduce((a, b) => a + b, 0) / processingHistory.length
    : 0;

  return {
    averageProcessingTime: avgTime,
    totalProcessedFaces,
    facesPerSecond: avgTime > 0 ? 1000 / avgTime : 0,
    lastProcessingTimes: [...processingHistory.slice(-10)],
    pipelineReady: pipelineInitialized
  };
}

/**
 * Check if pipeline is ready
 */
export function isTurboPipelineReady(): boolean {
  return pipelineInitialized;
}

/**
 * Reset performance stats
 */
export function resetTurboStats(): void {
  totalProcessingTime = 0;
  totalProcessedFaces = 0;
  processingHistory = [];
}
