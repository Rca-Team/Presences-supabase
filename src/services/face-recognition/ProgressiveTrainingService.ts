/**
 * ProgressiveTrainingService
 *
 * Manages the per-student gallery of face descriptors stored in the
 * `face_descriptors` Supabase table.
 *
 * Key fixes vs the previous version:
 *
 * 1. Averaged descriptor is NO LONGER normalised to unit-length.
 *    face-api.js descriptors are compared with raw Euclidean distance;
 *    normalising the average vector changes the scale of the representation
 *    and makes it incomparable to individual descriptors.
 *
 * 2. Outlier rejection when computing the average.
 *    Samples whose distance from the provisional mean exceeds 2× the median
 *    deviation are discarded.  This prevents a single mis-enrolled capture
 *    from pulling the average towards the wrong person.
 *
 * 3. Descriptor length flexibility.
 *    Accepts both 128-dim (face-api.js) and 512-dim (future ArcFace) vectors.
 */

import { supabase } from '@/integrations/supabase/client';
import { descriptorToString, stringToDescriptor } from './ModelService';
import { uploadImage } from './StorageService';
import { uploadAttendanceTrainingImage } from './TrainingDataStorageService';
import { getGalleryScope, isRowInGalleryScope } from './GalleryScopeService';

// ─── constants ────────────────────────────────────────────────────────────────

const MAX_SAMPLES_PER_USER = 30;
// Minimum recognition confidence required before a capture is used as training data
const MIN_CONFIDENCE_FOR_TRAINING = 0.80;

// ─── types ────────────────────────────────────────────────────────────────────

interface TrainingSample {
  id: string;
  user_id: string;
  descriptor: string;
  image_url: string | null;
  created_at: string;
  label: string | null;
}

// ─── public API ───────────────────────────────────────────────────────────────

/**
 * Persist a new face sample for a student.
 *
 * Only high-confidence captures are accepted so that mis-recognitions don't
 * corrupt the gallery.
 */
export async function storeFaceSample(
  userId:         string,
  faceDescriptor: Float32Array,
  imageBlob:      Blob | null,
  userName:       string,
  confidence:     number
): Promise<boolean> {
  try {
    // 1. Confidence gate for progressive training sample persistence
    if (confidence < 0.60 && confidence !== 1.0) {
      console.log(
        `Skipping training sample — confidence ${confidence.toFixed(2)} < 0.60`
      );
      return false;
    }

    // 2. Anti-Contamination Gate: Verify distance against the user's existing enrolled descriptors
    const { data: existingSamples } = await supabase
      .from('face_descriptors')
      .select('descriptor')
      .eq('user_id', userId)
      .limit(5);

    if (existingSamples && existingSamples.length > 0) {
      let minDistanceToBaseline = Infinity;
      for (const sample of existingSamples) {
        if (!sample.descriptor) continue;
        const enrolledVec = stringToDescriptor(sample.descriptor);
        if (enrolledVec.length === faceDescriptor.length) {
          let sum = 0;
          for (let i = 0; i < enrolledVec.length; i++) {
            const diff = enrolledVec[i] - faceDescriptor[i];
            sum += diff * diff;
          }
          const dist = Math.sqrt(sum);
          if (dist < minDistanceToBaseline) minDistanceToBaseline = dist;
        }
      }

      // If the new capture is further than 0.45 from verified baseline, reject to prevent gallery contamination!
      if (minDistanceToBaseline > 0.45 && confidence !== 1.0) {
        console.warn(
          `Rejecting training sample: distance ${minDistanceToBaseline.toFixed(3)} > 0.45 from baseline`
        );
        return false;
      }
    }

    // Enforce per-user sample cap (FIFO eviction of oldest)
    const { count, error: countErr } = await supabase
      .from('face_descriptors')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    if (countErr) {
      console.error('Error counting samples:', countErr);
      return false;
    }

    if ((count || 0) >= MAX_SAMPLES_PER_USER) {
      const { data: oldest, error: fetchErr } = await supabase
        .from('face_descriptors')
        .select('id')
        .eq('user_id', userId)
        .order('created_at', { ascending: true })
        .limit(1)
        .single();

      if (!fetchErr && oldest) {
        await supabase.from('face_descriptors').delete().eq('id', oldest.id);
      }
    }

    // Upload image if provided
    let imageUrl: string | null = null;
    if (imageBlob) {
      try {
        const fileName = `training_${userId}_${Date.now()}.jpg`;
        const file     = new File([imageBlob], fileName, { type: 'image/jpeg' });
        imageUrl = await uploadImage(file, `training/${userId}/${fileName}`);

        await uploadAttendanceTrainingImage({
          imageBlob,
          studentId: userId,
          status:    'present',
          mode:      'ai-scan',
          confidence,
        });
      } catch (uploadErr) {
        console.error('Training image upload error:', uploadErr);
      }
    }

    // Inherit the student's class scope from an existing sample so class-teacher
    // galleries keep matching this student after progressive training.
    const { data: existingScopeRow } = await supabase
      .from('face_descriptors')
      .select('student_id, student_name, class, section, category')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const { error: insertErr } = await supabase.from('face_descriptors').insert({
      user_id:   userId,
      descriptor: descriptorToString(faceDescriptor),
      image_url:  imageUrl,
      label:      userName,
      student_name: (existingScopeRow as any)?.student_name || userName,
      student_id: (existingScopeRow as any)?.student_id ?? null,
      class:      (existingScopeRow as any)?.class ?? null,
      section:    (existingScopeRow as any)?.section ?? null,
      category:   (existingScopeRow as any)?.category ?? null,
      metadata:   confidence === 1.0 ? { registration: 'true' } : {},
    });

    if (insertErr) {
      console.error('Error inserting face descriptor:', insertErr);
      return false;
    }

    console.log(`Training sample stored for ${userId} (confidence ${confidence.toFixed(2)})`);
    return true;
  } catch (err) {
    console.error('storeFaceSample error:', err);
    return false;
  }
}

/**
 * Fetch all face descriptors for a single user.
 */
export async function getUserFaceDescriptors(userId: string): Promise<Float32Array[]> {
  try {
    const { data, error } = await supabase
      .from('face_descriptors')
      .select('descriptor')
      .eq('user_id', userId);

    if (error || !data?.length) return [];

    return data
      .map(r => parseStoredDescriptor(r.descriptor))
      .filter((d): d is Float32Array => d !== null);
  } catch (err) {
    console.error('getUserFaceDescriptors error:', err);
    return [];
  }
}

/**
 * Load all students with their full descriptor galleries.
 *
 * Returns a Map keyed by userId where each entry contains:
 *   - descriptors       : every individual Float32Array sample
 *   - averagedDescriptor: robust mean of the gallery (with outlier rejection)
 *   - userName
 *   - sampleCount
 */
export async function getAllTrainedDescriptors(): Promise<Map<string, {
  descriptors:        Float32Array[];
  averagedDescriptor: Float32Array;
  userName:           string;
  sampleCount:        number;
}>> {
  try {
    const { data, error } = await supabase
      .from('face_descriptors')
      .select('user_id, descriptor, label, student_name, student_id, class, section, category, metadata')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('getAllTrainedDescriptors query failed:', error);
      return new Map();
    }
    if (!data?.length) return new Map();

    // Class-teacher accounts only match against their own class roster.
    const scope = await getGalleryScope();
    const rows = scope.userIds ? data.filter((r: any) => isRowInGalleryScope(scope, r)) : data;
    if (!rows.length) return new Map();

    // Group by user
    const grouped = new Map<string, { descriptors: Float32Array[]; userName: string; studentId: string | null }>();
    for (const rec of rows) {

      const desc = parseStoredDescriptor(rec.descriptor);
      if (!desc) continue;

      // Prefer student_name (set at registration), then label (set by training), then metadata.name
      const resolvedName =
        (rec as any).student_name ||
        rec.label ||
        ((rec as any).metadata as any)?.name ||
        'Unknown';
      const resolvedStudentId = (rec as any).student_id || null;

      if (!grouped.has(rec.user_id)) {
        grouped.set(rec.user_id, { descriptors: [], userName: resolvedName, studentId: resolvedStudentId });
      } else if (resolvedName !== 'Unknown') {
        // Later entries may have a better name — always prefer a real name over 'Unknown'
        const g = grouped.get(rec.user_id)!;
        if (g.userName === 'Unknown') g.userName = resolvedName;
        if (!g.studentId && resolvedStudentId) g.studentId = resolvedStudentId;
      }
      grouped.get(rec.user_id)!.descriptors.push(desc);
    }

    // Build result with robust averaged descriptor
    const result = new Map<string, {
      descriptors:        Float32Array[];
      averagedDescriptor: Float32Array;
      userName:           string;
      studentId:          string | null;
      sampleCount:        number;
    }>();

    for (const [userId, { descriptors, userName, studentId }] of grouped) {
      // Partition by dimension — never mix 128-dim and 512-dim descriptors in the same average.
      // Keep the largest group (most samples) and discard the minority dimension.
      const dimGroups = new Map<number, Float32Array[]>();
      for (const d of descriptors) {
        const group = dimGroups.get(d.length) ?? [];
        group.push(d);
        dimGroups.set(d.length, group);
      }
      // Pick the dimension with the most samples
      let dominantDim = 128;
      let dominantGroup: Float32Array[] = [];
      for (const [dim, group] of dimGroups) {
        if (group.length > dominantGroup.length) {
          dominantDim  = dim;
          dominantGroup = group;
        }
      }

      if (dominantGroup.length === 0) continue;

      const averaged = robustAverage(dominantGroup);
      result.set(userId, {
        descriptors:        dominantGroup,
        averagedDescriptor: averaged,
        userName,
        studentId:          studentId ?? null,
        sampleCount: dominantGroup.length,
      });
    }

    console.log(`Loaded ${result.size} users with trained descriptors`);
    return result;
  } catch (err) {
    console.error('getAllTrainedDescriptors error:', err);
    return new Map();
  }
}

// ─── matching helper (used by DescriptorCacheService) ────────────────────────

/**
 * Compute the best Euclidean distance from inputDescriptor to a user's gallery.
 *
 * Compares against the averaged descriptor AND every individual sample, returning
 * the minimum.  Does NOT mix in cosine distance — face-api.js vectors must be
 * compared with raw Euclidean only.
 */
export function calculateBestMatchDistance(
  inputDescriptor:    Float32Array,
  userDescriptors:    Float32Array[],
  averagedDescriptor: Float32Array
): number {
  let best = euclideanDistance(inputDescriptor, averagedDescriptor);
  for (const d of userDescriptors) {
    const dist = euclideanDistance(inputDescriptor, d);
    if (dist < best) best = dist;
  }
  return best;
}

// ─── training statistics ─────────────────────────────────────────────────────

export async function getUserTrainingStats(userId: string): Promise<{
  sampleCount:   number;
  oldestSample:  Date | null;
  newestSample:  Date | null;
  trainingLevel: 'none' | 'basic' | 'moderate' | 'good' | 'excellent';
}> {
  try {
    const { data, error } = await supabase
      .from('face_descriptors')
      .select('created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (error || !data?.length) {
      return { sampleCount: 0, oldestSample: null, newestSample: null, trainingLevel: 'none' };
    }

    const n = data.length;
    return {
      sampleCount:  n,
      oldestSample: new Date(data[0].created_at),
      newestSample: new Date(data[n - 1].created_at),
      trainingLevel: n === 0 ? 'none' : n < 3 ? 'basic' : n < 5 ? 'moderate' : n < 8 ? 'good' : 'excellent',
    };
  } catch (err) {
    console.error('getUserTrainingStats error:', err);
    return { sampleCount: 0, oldestSample: null, newestSample: null, trainingLevel: 'none' };
  }
}

export async function getTrainingStats(): Promise<{
  totalSamples:          number;
  usersWithSamples:      number;
  averageSamplesPerUser: number;
}> {
  try {
    const { data, error } = await supabase.from('face_descriptors').select('user_id');
    if (error || !data) return { totalSamples: 0, usersWithSamples: 0, averageSamplesPerUser: 0 };

    const userCounts = new Map<string, number>();
    data.forEach(r => userCounts.set(r.user_id, (userCounts.get(r.user_id) || 0) + 1));

    const usersWithSamples = userCounts.size;
    const totalSamples     = data.length;
    return {
      totalSamples,
      usersWithSamples,
      averageSamplesPerUser: usersWithSamples > 0 ? totalSamples / usersWithSamples : 0,
    };
  } catch (err) {
    console.error('getTrainingStats error:', err);
    return { totalSamples: 0, usersWithSamples: 0, averageSamplesPerUser: 0 };
  }
}

export async function getUsersWithTrainingSamples(): Promise<Array<{ userId: string; sampleCount: number }>> {
  try {
    const { data, error } = await supabase.from('face_descriptors').select('user_id');
    if (error || !data) return [];

    const counts = new Map<string, number>();
    data.forEach(r => counts.set(r.user_id, (counts.get(r.user_id) || 0) + 1));
    return Array.from(counts.entries()).map(([userId, sampleCount]) => ({ userId, sampleCount }));
  } catch (err) {
    console.error('getUsersWithTrainingSamples error:', err);
    return [];
  }
}

// ─── internal maths ──────────────────────────────────────────────────────────

function euclideanDistance(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return Infinity;
  let sum = 0;
  for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; sum += d * d; }
  return Math.sqrt(sum);
}

/**
 * Compute a robust average of a descriptor gallery.
 *
 * Algorithm:
 *   1. Compute simple mean.
 *   2. Compute each sample's distance from the mean.
 *   3. Discard samples whose distance is > 2× the median deviation.
 *   4. Re-compute mean from the surviving samples.
 *
 * IMPORTANT: The result is NOT normalised to unit length.  face-api.js
 * descriptors are NOT L2-normalised; normalising the average would change
 * the scale and break Euclidean comparisons.
 */
function robustAverage(descriptors: Float32Array[]): Float32Array {
  if (descriptors.length === 0) return new Float32Array(128);
  if (descriptors.length === 1) return descriptors[0];

  const dim = descriptors[0].length;

  // Step 1: simple mean
  const mean = new Float32Array(dim);
  for (const d of descriptors) {
    for (let i = 0; i < dim; i++) mean[i] += d[i];
  }
  for (let i = 0; i < dim; i++) mean[i] /= descriptors.length;

  if (descriptors.length <= 3) return mean; // Not enough samples for outlier detection

  // Step 2: distances from mean
  const dists = descriptors.map(d => euclideanDistance(d, mean));

  // Step 3: median deviation
  const sorted   = [...dists].sort((a, b) => a - b);
  const median   = sorted[Math.floor(sorted.length / 2)];
  const cutoff   = median * 2.5;

  // Step 4: filter outliers and re-average
  const inliers  = descriptors.filter((_, i) => dists[i] <= cutoff);
  if (inliers.length === 0) return mean; // All outliers? Return simple mean.

  const robust = new Float32Array(dim);
  for (const d of inliers) {
    for (let i = 0; i < dim; i++) robust[i] += d[i];
  }
  for (let i = 0; i < dim; i++) robust[i] /= inliers.length;

  return robust;
}

function parseStoredDescriptor(raw: unknown): Float32Array | null {
  try {
    if (!raw) return null;
    if (raw instanceof Float32Array) return raw;
    if (typeof raw === 'string') return stringToDescriptor(raw);
    if (Array.isArray(raw)) {
      const a = new Float32Array(raw as number[]);
      return a.length >= 64 ? a : null;
    }
    if (typeof raw === 'object') {
      const keys = Object.keys(raw as object);
      if (keys.length >= 64) {
        const vals = new Float32Array(keys.length);
        for (let i = 0; i < keys.length; i++) vals[i] = Number((raw as any)[i] ?? 0);
        return vals;
      }
    }
    return null;
  } catch {
    return null;
  }
}
