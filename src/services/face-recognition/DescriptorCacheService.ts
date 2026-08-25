/**
 * Descriptor Cache Service
 * In-memory descriptor index backed entirely by Lovable Cloud (Supabase).
 * No IndexedDB, no localStorage — descriptors are loaded fresh from the
 * database on init and kept in memory only for the current session.
 */

import { supabase } from '@/integrations/supabase/client';

// In-memory state (session only)
let cacheInitialized = false;
let descriptorMap = new Map<string, CachedDescriptor>();
let kdTree: KDTreeNode | null = null;

export interface CachedDescriptor {
  id: string;
  userId: string;
  name: string;
  descriptor: number[];
  imageUrl?: string;
  category?: string;
  createdAt: number;
  lastUsed: number;
}

interface KDTreeNode {
  point: number[];
  data: CachedDescriptor;
  left: KDTreeNode | null;
  right: KDTreeNode | null;
  dimension: number;
}

/**
 * Initialize the in-memory descriptor index by loading from Lovable Cloud.
 */
export async function initializeDescriptorCache(): Promise<void> {
  if (cacheInitialized) {
    console.log('Descriptor index already initialized');
    return;
  }

  cacheInitialized = true;
  await syncFromSupabase();
}

/**
 * Sync descriptors from Lovable Cloud into the in-memory index.
 */
export async function syncFromSupabase(): Promise<number> {
  console.log('Loading descriptors from Lovable Cloud...');
  
  try {
    const { data, error } = await supabase
      .from('face_descriptors')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching descriptors:', error);
      throw error;
    }

    descriptorMap.clear();
    kdTree = null;

    if (!data || data.length === 0) {
      console.log('No descriptors found in Lovable Cloud');
      return 0;
    }

    for (const record of data) {
      const descriptor: CachedDescriptor = {
        id: record.id,
        userId: record.user_id,
        name: record.label || 'Unknown',
        descriptor: record.descriptor as number[],
        imageUrl: record.image_url,
        createdAt: new Date(record.created_at).getTime(),
        lastUsed: Date.now()
      };
      descriptorMap.set(descriptor.id, descriptor);
    }

    const allDescriptors = Array.from(descriptorMap.values());
    if (allDescriptors.length > 0) {
      kdTree = buildKDTree(allDescriptors);
    }

    console.log(`Loaded ${allDescriptors.length} descriptors from Lovable Cloud`);
    return allDescriptors.length;
  } catch (error) {
    console.error('Error loading from Lovable Cloud:', error);
    throw error;
  }
}

/**
 * Add a descriptor to the in-memory index (no persistence).
 * Source of truth remains the database.
 */
export async function cacheDescriptor(descriptor: CachedDescriptor): Promise<void> {
  descriptorMap.set(descriptor.id, descriptor);
  const all = Array.from(descriptorMap.values());
  kdTree = all.length > 0 ? buildKDTree(all) : null;
}

/**
 * Get all cached descriptors
 */
export function getAllCachedDescriptors(): CachedDescriptor[] {
  return Array.from(descriptorMap.values());
}

/**
 * Find nearest match using k-d tree (O(log n) average)
 */
export function findNearestMatch(
  inputDescriptor: number[] | Float32Array,
  threshold: number = 0.45   // Aligned with MATCH_THRESHOLD in RecognitionService
): { descriptor: CachedDescriptor; distance: number } | null {
  if (!kdTree || descriptorMap.size === 0) {
    return null;
  }

  const input = Array.from(inputDescriptor);
  const result = searchKDTree(kdTree, input, threshold);
  
  if (result && result.distance <= threshold) {
    // Update last used time
    result.descriptor.lastUsed = Date.now();
    return result;
  }

  return null;
}

/**
 * Find top K nearest matches
 */
export function findKNearestMatches(
  inputDescriptor: number[] | Float32Array,
  k: number = 5,
  threshold: number = 0.6
): Array<{ descriptor: CachedDescriptor; distance: number }> {
  const input = Array.from(inputDescriptor);
  const results: Array<{ descriptor: CachedDescriptor; distance: number }> = [];

  // Use brute force for now (can be optimized with k-NN in k-d tree)
  for (const descriptor of descriptorMap.values()) {
    const distance = euclideanDistance(input, descriptor.descriptor);
    if (distance <= threshold) {
      results.push({ descriptor, distance });
    }
  }

  // Sort by distance and return top K
  return results
    .sort((a, b) => a.distance - b.distance)
    .slice(0, k);
}

/**
 * Build k-d tree from descriptors
 */
function buildKDTree(descriptors: CachedDescriptor[], depth: number = 0): KDTreeNode | null {
  if (descriptors.length === 0) return null;

  const k = descriptors[0].descriptor.length; // 128 dimensions for face-api.js
  const dimension = depth % k;

  // Sort by current dimension
  descriptors.sort((a, b) => a.descriptor[dimension] - b.descriptor[dimension]);

  const medianIndex = Math.floor(descriptors.length / 2);
  const medianDescriptor = descriptors[medianIndex];

  return {
    point: medianDescriptor.descriptor,
    data: medianDescriptor,
    left: buildKDTree(descriptors.slice(0, medianIndex), depth + 1),
    right: buildKDTree(descriptors.slice(medianIndex + 1), depth + 1),
    dimension
  };
}

/**
 * Search k-d tree for nearest neighbor
 */
function searchKDTree(
  node: KDTreeNode | null,
  target: number[],
  threshold: number,
  best: { descriptor: CachedDescriptor; distance: number } | null = null
): { descriptor: CachedDescriptor; distance: number } | null {
  if (!node) return best;

  const distance = euclideanDistance(target, node.point);

  if (!best || distance < best.distance) {
    best = { descriptor: node.data, distance };
  }

  // Early termination if we found a very close match
  if (distance < threshold * 0.5) {
    return best;
  }

  const diff = target[node.dimension] - node.point[node.dimension];
  const [first, second] = diff <= 0 ? [node.left, node.right] : [node.right, node.left];

  // Search the closer side first
  best = searchKDTree(first, target, threshold, best);

  // Only search the other side if it could contain a closer point
  if (Math.abs(diff) < best!.distance) {
    best = searchKDTree(second, target, threshold, best);
  }

  return best;
}

/**
 * Euclidean distance calculation
 */
function euclideanDistance(a: number[], b: number[]): number {
  if (a.length !== b.length) return Infinity;
  
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

/**
 * Remove a descriptor from cache
 */
export async function removeFromCache(id: string): Promise<void> {
  descriptorMap.delete(id);
  const allDescriptors = Array.from(descriptorMap.values());
  kdTree = allDescriptors.length > 0 ? buildKDTree(allDescriptors) : null;
}

/**
 * Clear all cached descriptors
 */
export async function clearCache(): Promise<void> {
  descriptorMap.clear();
  kdTree = null;
  console.log('In-memory descriptor index cleared');
}

/**
 * Get cache statistics
 */
export function getCacheStats(): {
  initialized: boolean;
  descriptorCount: number;
  hasKDTree: boolean;
  memoryUsageEstimate: string;
} {
  const descriptorCount = descriptorMap.size;
  // Estimate: each descriptor ~128 floats * 4 bytes + metadata ~50 bytes
  const bytesPerDescriptor = 128 * 4 + 50;
  const totalBytes = descriptorCount * bytesPerDescriptor;
  
  return {
    initialized: cacheInitialized,
    descriptorCount,
    hasKDTree: kdTree !== null,
    memoryUsageEstimate: formatBytes(totalBytes)
  };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

/**
 * Check if cache is ready
 */
export function isCacheReady(): boolean {
  return cacheInitialized && descriptorMap.size > 0;
}
