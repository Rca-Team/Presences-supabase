/**
 * Worker Pool Service
 * Manages Web Workers for parallel face recognition processing
 */

// Worker task types
export type WorkerTaskType = 
  | 'MATCH_DESCRIPTOR'
  | 'BATCH_MATCH'
  | 'COMPUTE_DISTANCE'
  | 'NORMALIZE_DESCRIPTOR';

export interface WorkerTask {
  id: string;
  type: WorkerTaskType;
  data: any;
}

export interface WorkerResult {
  id: string;
  success: boolean;
  data?: any;
  error?: string;
}

// Pool configuration
const MAX_WORKERS = navigator.hardwareConcurrency || 4;
const TASK_TIMEOUT = 10000; // 10 seconds

// Worker pool state
let workers: Worker[] = [];
let workerAvailability: boolean[] = [];
let taskQueue: { task: WorkerTask; resolve: (result: WorkerResult) => void; reject: (error: Error) => void }[] = [];
let poolInitialized = false;

// Worker code as a blob URL
const workerCode = `
// Face matching worker
const descriptorCache = new Map();

// Euclidean distance calculation
function euclideanDistance(desc1, desc2) {
  if (!desc1 || !desc2 || desc1.length !== desc2.length) {
    return Infinity;
  }
  
  let sum = 0;
  for (let i = 0; i < desc1.length; i++) {
    const diff = desc1[i] - desc2[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

// Cosine similarity for improved accuracy
function cosineSimilarity(desc1, desc2) {
  if (!desc1 || !desc2 || desc1.length !== desc2.length) {
    return 0;
  }
  
  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;
  
  for (let i = 0; i < desc1.length; i++) {
    dotProduct += desc1[i] * desc2[i];
    norm1 += desc1[i] * desc1[i];
    norm2 += desc2[i] * desc2[i];
  }
  
  if (norm1 === 0 || norm2 === 0) return 0;
  return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
}

// Find best match among registered faces
function findBestMatch(inputDescriptor, registeredFaces, threshold = 0.45) {
  let bestMatch = null;
  let bestDistance = Infinity;
  let bestSimilarity = -1;
  
  for (const face of registeredFaces) {
    const distance = euclideanDistance(inputDescriptor, face.descriptor);
    const similarity = cosineSimilarity(inputDescriptor, face.descriptor);
    
    // Use combined scoring: low distance AND high similarity
    if (distance < threshold && similarity > 0.7) {
      if (distance < bestDistance) {
        bestDistance = distance;
        bestSimilarity = similarity;
        bestMatch = face;
      }
    }
  }
  
  return bestMatch ? {
    match: bestMatch,
    distance: bestDistance,
    similarity: bestSimilarity,
    confidence: 1 - bestDistance
  } : null;
}

// Batch match multiple descriptors
function batchMatch(inputDescriptors, registeredFaces, threshold = 0.45) {
  const results = [];
  
  for (let i = 0; i < inputDescriptors.length; i++) {
    const result = findBestMatch(inputDescriptors[i], registeredFaces, threshold);
    results.push({
      index: i,
      ...result
    });
  }
  
  return results;
}

// Normalize descriptor
function normalizeDescriptor(descriptor) {
  const norm = Math.sqrt(descriptor.reduce((sum, val) => sum + val * val, 0));
  if (norm === 0) return descriptor;
  return descriptor.map(val => val / norm);
}

// Handle incoming messages
self.onmessage = function(e) {
  const { id, type, data } = e.data;
  
  try {
    let result;
    
    switch (type) {
      case 'MATCH_DESCRIPTOR':
        result = findBestMatch(data.descriptor, data.registeredFaces, data.threshold);
        break;
        
      case 'BATCH_MATCH':
        result = batchMatch(data.descriptors, data.registeredFaces, data.threshold);
        break;
        
      case 'COMPUTE_DISTANCE':
        result = {
          euclidean: euclideanDistance(data.desc1, data.desc2),
          cosine: cosineSimilarity(data.desc1, data.desc2)
        };
        break;
        
      case 'NORMALIZE_DESCRIPTOR':
        result = normalizeDescriptor(data.descriptor);
        break;
        
      case 'UPDATE_CACHE':
        descriptorCache.set(data.key, data.faces);
        result = { cached: true };
        break;
        
      default:
        throw new Error('Unknown task type: ' + type);
    }
    
    self.postMessage({ id, success: true, data: result });
  } catch (error) {
    self.postMessage({ id, success: false, error: error.message });
  }
};
`;

/**
 * Initialize the worker pool
 */
export async function initializeWorkerPool(numWorkers?: number): Promise<void> {
  if (poolInitialized) {
    console.log('Worker pool already initialized');
    return;
  }

  const workerCount = Math.min(numWorkers || MAX_WORKERS, MAX_WORKERS);
  console.log(`Initializing worker pool with ${workerCount} workers...`);

  try {
    // Create blob URL for worker
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    const workerUrl = URL.createObjectURL(blob);

    // Create workers
    for (let i = 0; i < workerCount; i++) {
      const worker = new Worker(workerUrl);
      
      worker.onmessage = (e: MessageEvent<WorkerResult>) => {
        handleWorkerResponse(i, e.data);
      };

      worker.onerror = (error) => {
        console.error(`Worker ${i} error:`, error);
        workerAvailability[i] = true;
        processQueue();
      };

      workers.push(worker);
      workerAvailability.push(true);
    }

    poolInitialized = true;
    console.log(`Worker pool initialized with ${workerCount} workers`);
  } catch (error) {
    console.error('Failed to initialize worker pool:', error);
    throw error;
  }
}

/**
 * Submit a task to the worker pool
 */
export function submitTask(task: WorkerTask): Promise<WorkerResult> {
  return new Promise((resolve, reject) => {
    taskQueue.push({ task, resolve, reject });
    processQueue();
  });
}

/**
 * Submit multiple tasks in parallel
 */
export async function submitBatch(tasks: WorkerTask[]): Promise<WorkerResult[]> {
  const promises = tasks.map(task => submitTask(task));
  return Promise.all(promises);
}

/**
 * Process the task queue
 */
function processQueue(): void {
  if (taskQueue.length === 0) return;

  // Find available worker
  const availableIndex = workerAvailability.findIndex(available => available);
  if (availableIndex === -1) return; // No available workers

  // Get next task
  const { task, resolve, reject } = taskQueue.shift()!;
  
  // Mark worker as busy
  workerAvailability[availableIndex] = false;

  // Set up timeout
  const timeoutId = setTimeout(() => {
    workerAvailability[availableIndex] = true;
    reject(new Error(`Task ${task.id} timed out`));
    processQueue();
  }, TASK_TIMEOUT);

  // Store callback for this task
  pendingTasks.set(task.id, { resolve, reject, timeoutId, workerIndex: availableIndex });

  // Send task to worker
  workers[availableIndex].postMessage(task);
}

// Pending tasks map
const pendingTasks = new Map<string, {
  resolve: (result: WorkerResult) => void;
  reject: (error: Error) => void;
  timeoutId: NodeJS.Timeout;
  workerIndex: number;
}>();

/**
 * Handle worker response
 */
function handleWorkerResponse(workerIndex: number, result: WorkerResult): void {
  const pending = pendingTasks.get(result.id);
  
  if (pending) {
    clearTimeout(pending.timeoutId);
    pendingTasks.delete(result.id);
    workerAvailability[workerIndex] = true;
    
    if (result.success) {
      pending.resolve(result);
    } else {
      pending.reject(new Error(result.error || 'Unknown worker error'));
    }
    
    // Process next task in queue
    processQueue();
  }
}

/**
 * Match a descriptor against registered faces using workers
 */
export async function matchDescriptorParallel(
  descriptor: Float32Array | number[],
  registeredFaces: Array<{ id: string; name: string; descriptor: number[] }>,
  threshold: number = 0.45
): Promise<{ match: any; distance: number; similarity: number; confidence: number } | null> {
  if (!poolInitialized) {
    await initializeWorkerPool();
  }

  const taskId = `match_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  const result = await submitTask({
    id: taskId,
    type: 'MATCH_DESCRIPTOR',
    data: {
      descriptor: Array.from(descriptor),
      registeredFaces: registeredFaces.map(f => ({
        ...f,
        descriptor: Array.isArray(f.descriptor) ? f.descriptor : Array.from(f.descriptor)
      })),
      threshold
    }
  });

  return result.data;
}

/**
 * Batch match multiple descriptors
 */
export async function batchMatchDescriptors(
  descriptors: (Float32Array | number[])[],
  registeredFaces: Array<{ id: string; name: string; descriptor: number[] }>,
  threshold: number = 0.45
): Promise<Array<{ index: number; match?: any; distance?: number; confidence?: number }>> {
  if (!poolInitialized) {
    await initializeWorkerPool();
  }

  // Split into chunks for parallel processing
  const chunkSize = Math.ceil(descriptors.length / workers.length);
  const chunks: (Float32Array | number[])[][] = [];
  
  for (let i = 0; i < descriptors.length; i += chunkSize) {
    chunks.push(descriptors.slice(i, i + chunkSize));
  }

  // Process chunks in parallel
  const chunkResults = await Promise.all(
    chunks.map((chunk, chunkIndex) => {
      const taskId = `batch_${Date.now()}_${chunkIndex}`;
      return submitTask({
        id: taskId,
        type: 'BATCH_MATCH',
        data: {
          descriptors: chunk.map(d => Array.from(d)),
          registeredFaces: registeredFaces.map(f => ({
            ...f,
            descriptor: Array.isArray(f.descriptor) ? f.descriptor : Array.from(f.descriptor)
          })),
          threshold
        }
      });
    })
  );

  // Flatten results and adjust indices
  const allResults: any[] = [];
  let offset = 0;
  
  for (const result of chunkResults) {
    if (result.data) {
      for (const item of result.data) {
        allResults.push({
          ...item,
          index: item.index + offset
        });
      }
      offset += chunkSize;
    }
  }

  return allResults;
}

/**
 * Get worker pool statistics
 */
export function getWorkerPoolStats(): {
  initialized: boolean;
  workerCount: number;
  availableWorkers: number;
  pendingTasks: number;
  queuedTasks: number;
} {
  return {
    initialized: poolInitialized,
    workerCount: workers.length,
    availableWorkers: workerAvailability.filter(a => a).length,
    pendingTasks: pendingTasks.size,
    queuedTasks: taskQueue.length
  };
}

/**
 * Terminate all workers
 */
export function terminateWorkerPool(): void {
  for (const worker of workers) {
    worker.terminate();
  }
  
  workers = [];
  workerAvailability = [];
  taskQueue = [];
  pendingTasks.clear();
  poolInitialized = false;
  
  console.log('Worker pool terminated');
}

/**
 * Check if pool is initialized
 */
export function isPoolInitialized(): boolean {
  return poolInitialized;
}
