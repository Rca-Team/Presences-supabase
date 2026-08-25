/**
 * Hook for Worker Pool management
 * Provides easy access to parallel face matching capabilities
 */

import { useState, useEffect, useCallback } from 'react';
import {
  initializeWorkerPool,
  matchDescriptorParallel,
  batchMatchDescriptors,
  getWorkerPoolStats,
  terminateWorkerPool,
  isPoolInitialized
} from '@/services/face-recognition/WorkerPoolService';

export interface WorkerPoolStats {
  initialized: boolean;
  workerCount: number;
  availableWorkers: number;
  pendingTasks: number;
  queuedTasks: number;
}

export interface UseWorkerPoolReturn {
  isInitialized: boolean;
  stats: WorkerPoolStats | null;
  initialize: (numWorkers?: number) => Promise<void>;
  matchDescriptor: (
    descriptor: Float32Array | number[],
    registeredFaces: Array<{ id: string; name: string; descriptor: number[] }>,
    threshold?: number
  ) => Promise<{ match: any; distance: number; similarity: number; confidence: number } | null>;
  batchMatch: (
    descriptors: (Float32Array | number[])[],
    registeredFaces: Array<{ id: string; name: string; descriptor: number[] }>,
    threshold?: number
  ) => Promise<Array<{ index: number; match?: any; distance?: number; confidence?: number }>>;
  terminate: () => void;
  refreshStats: () => void;
}

export function useWorkerPool(autoInitialize: boolean = false): UseWorkerPoolReturn {
  const [isInitialized, setIsInitialized] = useState(false);
  const [stats, setStats] = useState<WorkerPoolStats | null>(null);

  const refreshStats = useCallback(() => {
    const currentStats = getWorkerPoolStats();
    setStats(currentStats);
    setIsInitialized(currentStats.initialized);
  }, []);

  const initialize = useCallback(async (numWorkers?: number): Promise<void> => {
    try {
      await initializeWorkerPool(numWorkers);
      refreshStats();
    } catch (error) {
      console.error('Worker pool initialization failed:', error);
      throw error;
    }
  }, [refreshStats]);

  const matchDescriptor = useCallback(async (
    descriptor: Float32Array | number[],
    registeredFaces: Array<{ id: string; name: string; descriptor: number[] }>,
    threshold: number = 0.45
  ) => {
    if (!isPoolInitialized()) {
      await initialize();
    }
    return matchDescriptorParallel(descriptor, registeredFaces, threshold);
  }, [initialize]);

  const batchMatch = useCallback(async (
    descriptors: (Float32Array | number[])[],
    registeredFaces: Array<{ id: string; name: string; descriptor: number[] }>,
    threshold: number = 0.45
  ) => {
    if (!isPoolInitialized()) {
      await initialize();
    }
    return batchMatchDescriptors(descriptors, registeredFaces, threshold);
  }, [initialize]);

  const terminate = useCallback(() => {
    terminateWorkerPool();
    refreshStats();
  }, [refreshStats]);

  // Auto-initialize if enabled
  useEffect(() => {
    if (autoInitialize) {
      initialize();
    }
  }, [autoInitialize, initialize]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Don't terminate on unmount as other components may be using it
    };
  }, []);

  // Refresh stats periodically
  useEffect(() => {
    const interval = setInterval(refreshStats, 2000);
    return () => clearInterval(interval);
  }, [refreshStats]);

  return {
    isInitialized,
    stats,
    initialize,
    matchDescriptor,
    batchMatch,
    terminate,
    refreshStats
  };
}

export default useWorkerPool;
