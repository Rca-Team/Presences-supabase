export interface FaceCluster {
  id: string;
  centroid: Float32Array;
  faces: Array<{
    descriptor: Float32Array;
    metadata: any;
    similarity: number;
  }>;
  size: number;
  avgConfidence: number;
}

export interface ClusteringResult {
  clusters: FaceCluster[];
  totalFaces: number;
  unclusteredFaces: number;
  avgClusterSize: number;
}

// Calculate Euclidean distance between two face descriptors
const calculateDistance = (desc1: Float32Array, desc2: Float32Array): number => {
  let sum = 0;
  for (let i = 0; i < desc1.length; i++) {
    sum += Math.pow(desc1[i] - desc2[i], 2);
  }
  return Math.sqrt(sum);
};

// Calculate centroid of a group of descriptors
const calculateCentroid = (descriptors: Float32Array[]): Float32Array => {
  if (descriptors.length === 0) return new Float32Array(128);
  
  const centroid = new Float32Array(descriptors[0].length);
  
  for (const descriptor of descriptors) {
    for (let i = 0; i < descriptor.length; i++) {
      centroid[i] += descriptor[i];
    }
  }
  
  for (let i = 0; i < centroid.length; i++) {
    centroid[i] /= descriptors.length;
  }
  
  return centroid;
};

// Simple K-means clustering for face descriptors
export const clusterFaces = (
  faces: Array<{ descriptor: Float32Array; metadata: any }>,
  options: {
    maxClusters?: number;
    similarityThreshold?: number;
    minClusterSize?: number;
  } = {}
): ClusteringResult => {
  const {
    maxClusters = Math.ceil(Math.sqrt(faces.length)),
    similarityThreshold = 0.6,
    minClusterSize = 2
  } = options;

  if (faces.length === 0) {
    return {
      clusters: [],
      totalFaces: 0,
      unclusteredFaces: 0,
      avgClusterSize: 0
    };
  }

  // Start with density-based clustering
  const clusters: FaceCluster[] = [];
  const processed = new Set<number>();

  for (let i = 0; i < faces.length; i++) {
    if (processed.has(i)) continue;

    const currentFace = faces[i];
    const clusterFaces = [{ ...currentFace, similarity: 1.0 }];
    processed.add(i);

    // Find similar faces
    for (let j = i + 1; j < faces.length; j++) {
      if (processed.has(j)) continue;

      const distance = calculateDistance(currentFace.descriptor, faces[j].descriptor);
      const similarity = 1 - distance;

      if (similarity >= similarityThreshold) {
        clusterFaces.push({ ...faces[j], similarity });
        processed.add(j);
      }
    }

    // Only create cluster if it meets minimum size requirement
    if (clusterFaces.length >= minClusterSize) {
      const descriptors = clusterFaces.map(f => f.descriptor);
      const centroid = calculateCentroid(descriptors);
      const avgConfidence = clusterFaces.reduce((sum, f) => sum + f.similarity, 0) / clusterFaces.length;

      clusters.push({
        id: `cluster_${clusters.length + 1}`,
        centroid,
        faces: clusterFaces,
        size: clusterFaces.length,
        avgConfidence
      });
    }
  }

  // Sort clusters by size (largest first)
  clusters.sort((a, b) => b.size - a.size);

  // Limit number of clusters if specified
  const finalClusters = clusters.slice(0, maxClusters);
  const clusteredFaces = finalClusters.reduce((sum, cluster) => sum + cluster.size, 0);
  const unclusteredFaces = faces.length - clusteredFaces;
  const avgClusterSize = finalClusters.length > 0 ? 
    clusteredFaces / finalClusters.length : 0;

  return {
    clusters: finalClusters,
    totalFaces: faces.length,
    unclusteredFaces,
    avgClusterSize
  };
};

// Find which cluster a new face belongs to
export const findBestCluster = (
  faceDescriptor: Float32Array,
  clusters: FaceCluster[],
  threshold = 0.6
): { cluster: FaceCluster | null; similarity: number } => {
  let bestCluster: FaceCluster | null = null;
  let bestSimilarity = 0;

  for (const cluster of clusters) {
    const distance = calculateDistance(faceDescriptor, cluster.centroid);
    const similarity = 1 - distance;

    if (similarity > bestSimilarity && similarity >= threshold) {
      bestCluster = cluster;
      bestSimilarity = similarity;
    }
  }

  return { cluster: bestCluster, similarity: bestSimilarity };
};

// Update cluster with new face
export const addFaceToCluster = (
  cluster: FaceCluster,
  face: { descriptor: Float32Array; metadata: any; similarity: number }
): FaceCluster => {
  const updatedFaces = [...cluster.faces, face];
  const descriptors = updatedFaces.map(f => f.descriptor);
  const newCentroid = calculateCentroid(descriptors);
  const newAvgConfidence = updatedFaces.reduce((sum, f) => sum + f.similarity, 0) / updatedFaces.length;

  return {
    ...cluster,
    centroid: newCentroid,
    faces: updatedFaces,
    size: updatedFaces.length,
    avgConfidence: newAvgConfidence
  };
};

// Merge similar clusters
export const mergeSimilarClusters = (
  clusters: FaceCluster[],
  mergeThreshold = 0.8
): FaceCluster[] => {
  const mergedClusters = [...clusters];
  let merged = true;

  while (merged) {
    merged = false;

    for (let i = 0; i < mergedClusters.length - 1; i++) {
      for (let j = i + 1; j < mergedClusters.length; j++) {
        const distance = calculateDistance(
          mergedClusters[i].centroid,
          mergedClusters[j].centroid
        );
        const similarity = 1 - distance;

        if (similarity >= mergeThreshold) {
          // Merge clusters
          const allFaces = [...mergedClusters[i].faces, ...mergedClusters[j].faces];
          const descriptors = allFaces.map(f => f.descriptor);
          const newCentroid = calculateCentroid(descriptors);
          const avgConfidence = allFaces.reduce((sum, f) => sum + f.similarity, 0) / allFaces.length;

          const mergedCluster: FaceCluster = {
            id: `merged_${mergedClusters[i].id}_${mergedClusters[j].id}`,
            centroid: newCentroid,
            faces: allFaces,
            size: allFaces.length,
            avgConfidence
          };

          // Replace first cluster with merged cluster and remove second
          mergedClusters[i] = mergedCluster;
          mergedClusters.splice(j, 1);
          merged = true;
          break;
        }
      }
      if (merged) break;
    }
  }

  return mergedClusters.sort((a, b) => b.size - a.size);
};

// Get cluster statistics
export const getClusterStats = (clusters: FaceCluster[]) => {
  const totalFaces = clusters.reduce((sum, cluster) => sum + cluster.size, 0);
  const avgClusterSize = clusters.length > 0 ? totalFaces / clusters.length : 0;
  const largestCluster = clusters.length > 0 ? Math.max(...clusters.map(c => c.size)) : 0;
  const smallestCluster = clusters.length > 0 ? Math.min(...clusters.map(c => c.size)) : 0;
  const avgConfidence = clusters.length > 0 ? 
    clusters.reduce((sum, c) => sum + c.avgConfidence, 0) / clusters.length : 0;

  return {
    totalClusters: clusters.length,
    totalFaces,
    avgClusterSize,
    largestCluster,
    smallestCluster,
    avgConfidence
  };
};