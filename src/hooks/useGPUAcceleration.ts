/**
 * Hook for GPU acceleration management
 * Provides easy access to GPU initialization and status
 */

import { useState, useEffect, useCallback } from 'react';
import {
  initializeGPU,
  warmupGPU,
  getGPUStats,
  cleanupGPUMemory,
  isGPUAvailable,
  getCurrentBackend,
  type GPUStats
} from '@/services/face-recognition/GPUAccelerationService';

export interface UseGPUAccelerationReturn {
  isInitialized: boolean;
  isAvailable: boolean;
  isWarmedUp: boolean;
  backend: string;
  stats: GPUStats | null;
  initializeAndWarmup: () => Promise<boolean>;
  cleanup: () => void;
  refreshStats: () => void;
}

export function useGPUAcceleration(autoInitialize: boolean = false): UseGPUAccelerationReturn {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isWarmedUp, setIsWarmedUp] = useState(false);
  const [stats, setStats] = useState<GPUStats | null>(null);

  const refreshStats = useCallback(() => {
    const currentStats = getGPUStats();
    setStats(currentStats);
    setIsInitialized(currentStats.initialized);
    setIsWarmedUp(currentStats.warmupComplete);
  }, []);

  const initializeAndWarmup = useCallback(async (): Promise<boolean> => {
    try {
      console.log('Initializing GPU acceleration...');
      await initializeGPU();
      
      console.log('Warming up GPU...');
      await warmupGPU();
      
      refreshStats();
      return isGPUAvailable();
    } catch (error) {
      console.error('GPU initialization failed:', error);
      refreshStats();
      return false;
    }
  }, [refreshStats]);

  const cleanup = useCallback(() => {
    cleanupGPUMemory();
    refreshStats();
  }, [refreshStats]);

  // Auto-initialize if enabled
  useEffect(() => {
    if (autoInitialize) {
      initializeAndWarmup();
    }
  }, [autoInitialize, initializeAndWarmup]);

  // Refresh stats periodically
  useEffect(() => {
    const interval = setInterval(refreshStats, 5000);
    return () => clearInterval(interval);
  }, [refreshStats]);

  return {
    isInitialized,
    isAvailable: isGPUAvailable(),
    isWarmedUp,
    backend: getCurrentBackend(),
    stats,
    initializeAndWarmup,
    cleanup,
    refreshStats
  };
}

export default useGPUAcceleration;
