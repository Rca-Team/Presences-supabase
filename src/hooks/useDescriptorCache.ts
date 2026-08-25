/**
 * Hook for Descriptor Cache management
 * Provides access to IndexedDB-cached face descriptors with k-d tree matching
 */

import { useState, useEffect, useCallback } from 'react';
import {
  initializeDescriptorCache,
  syncFromSupabase,
  getAllCachedDescriptors,
  findNearestMatch,
  findKNearestMatches,
  cacheDescriptor,
  removeFromCache,
  clearCache,
  getCacheStats,
  isCacheReady,
  type CachedDescriptor
} from '@/services/face-recognition/DescriptorCacheService';

export interface CacheStats {
  initialized: boolean;
  descriptorCount: number;
  hasKDTree: boolean;
  memoryUsageEstimate: string;
}

export interface UseDescriptorCacheReturn {
  isReady: boolean;
  stats: CacheStats | null;
  descriptorCount: number;
  initialize: () => Promise<void>;
  syncFromServer: () => Promise<number>;
  findMatch: (descriptor: number[] | Float32Array, threshold?: number) => { descriptor: CachedDescriptor; distance: number } | null;
  findTopMatches: (descriptor: number[] | Float32Array, k?: number, threshold?: number) => Array<{ descriptor: CachedDescriptor; distance: number }>;
  getAllDescriptors: () => CachedDescriptor[];
  addDescriptor: (descriptor: CachedDescriptor) => Promise<void>;
  removeDescriptor: (id: string) => Promise<void>;
  clear: () => Promise<void>;
  refreshStats: () => void;
}

export function useDescriptorCache(autoInitialize: boolean = false): UseDescriptorCacheReturn {
  const [isReady, setIsReady] = useState(false);
  const [stats, setStats] = useState<CacheStats | null>(null);
  const [descriptorCount, setDescriptorCount] = useState(0);

  const refreshStats = useCallback(() => {
    const currentStats = getCacheStats();
    setStats(currentStats);
    setIsReady(isCacheReady());
    setDescriptorCount(currentStats.descriptorCount);
  }, []);

  const initialize = useCallback(async (): Promise<void> => {
    try {
      console.log('Initializing descriptor cache...');
      await initializeDescriptorCache();
      
      // Sync from Supabase after initialization
      await syncFromSupabase();
      
      refreshStats();
    } catch (error) {
      console.error('Cache initialization failed:', error);
      throw error;
    }
  }, [refreshStats]);

  const syncFromServer = useCallback(async (): Promise<number> => {
    const count = await syncFromSupabase();
    refreshStats();
    return count;
  }, [refreshStats]);

  const findMatch = useCallback((
    descriptor: number[] | Float32Array,
    threshold: number = 0.45
  ) => {
    return findNearestMatch(descriptor, threshold);
  }, []);

  const findTopMatches = useCallback((
    descriptor: number[] | Float32Array,
    k: number = 5,
    threshold: number = 0.6
  ) => {
    return findKNearestMatches(descriptor, k, threshold);
  }, []);

  const getAllDescriptors = useCallback(() => {
    return getAllCachedDescriptors();
  }, []);

  const addDescriptor = useCallback(async (descriptor: CachedDescriptor): Promise<void> => {
    await cacheDescriptor(descriptor);
    refreshStats();
  }, [refreshStats]);

  const removeDescriptor = useCallback(async (id: string): Promise<void> => {
    await removeFromCache(id);
    refreshStats();
  }, [refreshStats]);

  const clear = useCallback(async (): Promise<void> => {
    await clearCache();
    refreshStats();
  }, [refreshStats]);

  // Auto-initialize if enabled
  useEffect(() => {
    if (autoInitialize) {
      initialize();
    }
  }, [autoInitialize, initialize]);

  // Refresh stats periodically
  useEffect(() => {
    const interval = setInterval(refreshStats, 5000);
    return () => clearInterval(interval);
  }, [refreshStats]);

  return {
    isReady,
    stats,
    descriptorCount,
    initialize,
    syncFromServer,
    findMatch,
    findTopMatches,
    getAllDescriptors,
    addDescriptor,
    removeDescriptor,
    clear,
    refreshStats
  };
}

export default useDescriptorCache;
