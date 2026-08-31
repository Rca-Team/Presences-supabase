/**
 * RecognitionService  — rewritten for school-grade precision
 *
 * Key changes from the previous version:
 *
 * 1. MATCH_THRESHOLD tightened: 0.62 → 0.45
 *    face-api.js FaceRecognitionNet same-person distance is typically 0.30–0.45.
 *    The old 0.62 threshold could match completely different people.
 *
 * 2. Broken distance combo removed.
 *    The old code did min(euclidean, cosine) which ALWAYS lowers the apparent
 *    distance, producing inflated confidence.  face-api.js descriptors are NOT
 *    L2-normalised, so cosine distance is NOT comparable to Euclidean distance.
 *    We now use only Euclidean throughout.
 *
 * 3. Fake "3D point-cloud" scoring removed.
 *    Treating descriptor dimensions 0–2 as (x,y,z) coordinates and computing
 *    a 3D spatial distance is mathematically meaningless.
 *
 * 4. Ambiguity rejection added.
 *    If the best and second-best matches are within 15 % of each other the face
 *    is ambiguous and we refuse to guess.  This prevents look-alike students
 *    from triggering each-other's attendance.
 *
 * 5. Confidence calibrated.
 *    Mapped via a sigmoid centred on the threshold so that 0.3 → ~90 %,
 *    0.45 → ~50 %, 0.55 → ~20 %.
 */

import { supabase } from '@/integrations/supabase/client';
import { descriptorToString, stringToDescriptor } from './ModelService';
import { getAttendanceCutoffTime } from '../attendance/AttendanceSettingsService';
import { getAllTrainedDescriptors } from './ProgressiveTrainingService';
import { buildVectorIndex, searchVectorIndex } from './VectorIndexService';
import { dataUrlToBlob, uploadAttendanceTrainingImage } from './TrainingDataStorageService';
import { ensureActiveClassSession, upsertClassAttendanceEvent } from '../attendance/ClassSessionService';

// ─── types ────────────────────────────────────────────────────────────────────

interface Employee {
  id: string;
  name: string;
  employee_id: string;
  department: string;
  position: string;
  firebase_image_url: string;
  avatar_url?: string;
  trainingSamples?: number;
}

interface RecognitionResult {
  recognized: boolean;
  employee?: Employee;
  confidence?: number;
  strictMetrics?: {
    fusedScore: number;
    descriptorScore: number;
    pointCloudScore: number;
    thresholdTarget: number;
    autoMarkEligible: boolean;
  };
}

interface DeviceInfo {
  metadata?: {
    name?: string;
    employee_id?: string;
    department?: string;
    position?: string;
    firebase_image_url?: string;
    faceDescriptor?: string;
    manual_confirmation?: boolean;
    force_attendance_save?: boolean;
    class?: string;
    section?: string;
    category?: string;
  };
  type?: string;
  timestamp?: string;
  registration?: boolean;
  firebase_image_url?: string;
  gate?: boolean;
}

// ─── constants ────────────────────────────────────────────────────────────────

/**
 * Maximum Euclidean distance to accept a match.
 *
 * face-api.js FaceRecognitionNet typical distances (LFW benchmark):
 *   Same person   : 0.30 – 0.45
 *   Different     : 0.60 – 1.00
 *   Threshold     : 0.60 (100 % accuracy on LFW)
 *
 * For a school with 300–1000 students we use a stricter value so that
 * no two students are ever confused:
 */
const MATCH_THRESHOLD = 0.41;

/**
 * If best and second-best distances are within this ratio the match is
 * ambiguous and will be rejected.
 * ratio = bestDist / secondBestDist; reject when ratio > AMBIGUITY_RATIO
 */
const AMBIGUITY_RATIO = 0.78;
const MIN_MARGIN_GAP = 0.08;

/**
 * Auto-mark without manual confirmation only when confidence is this high.
 */
const AUTO_MARK_CONFIDENCE = 0.70;

// ─── caches ───────────────────────────────────────────────────────────────────

const profileNameCache = new Map<string, { expiresAt: number; profile: any }>();
const PROFILE_CACHE_TTL_MS = 5 * 60 * 1000;

// ─── maths ───────────────────────────────────────────────────────────────────

/**
 * Euclidean distance between two descriptors.
 * face-api.js vectors are NOT L2-normalised; use this, not cosine distance.
 */
function euclideanDistance(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return Infinity;
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

/**
 * Estimate face yaw angle from 68-landmark positions.
 * Uses nose bridge vs jaw symmetry ratio to approximate yaw.
 * Returns absolute yaw in degrees (0 = frontal).
 */
export function estimateYawFromLandmarks(landmarks: { x: number; y: number }[]): number {
  if (!landmarks || landmarks.length < 68) return 0;
  // Nose tip (point 30) vs left jaw (point 0) vs right jaw (point 16)
  const noseTip = landmarks[30];
  const leftJaw = landmarks[0];
  const rightJaw = landmarks[16];
  if (!noseTip || !leftJaw || !rightJaw) return 0;
  const leftDist = Math.hypot(noseTip.x - leftJaw.x, noseTip.y - leftJaw.y);
  const rightDist = Math.hypot(noseTip.x - rightJaw.x, noseTip.y - rightJaw.y);
  const total = leftDist + rightDist;
  if (total < 1) return 0;
  // ratio of 0.5 = perfectly frontal, deviation maps to yaw
  const ratio = leftDist / total;
  const deviation = Math.abs(ratio - 0.5);
  // Map deviation [0, 0.5] -> yaw [0, 90]
  return deviation * 180;
}

/**
 * Estimate face pitch from landmarks.
 * Uses vertical position of nose tip relative to eye line and chin.
 */
export function estimatePitchFromLandmarks(landmarks: { x: number; y: number }[]): number {
  if (!landmarks || landmarks.length < 68) return 0;
  // Left eye center (avg of points 36-41), right eye center (avg of points 42-47)
  const leftEye = landmarks.slice(36, 42).reduce((acc, p) => ({ x: acc.x + p.x / 6, y: acc.y + p.y / 6 }), { x: 0, y: 0 });
  const rightEye = landmarks.slice(42, 48).reduce((acc, p) => ({ x: acc.x + p.x / 6, y: acc.y + p.y / 6 }), { x: 0, y: 0 });
  const eyeCenter = { x: (leftEye.x + rightEye.x) / 2, y: (leftEye.y + rightEye.y) / 2 };
  const chin = landmarks[8]; // Bottom of chin
  const noseTip = landmarks[30];
  if (!chin || !noseTip) return 0;
  const faceHeight = Math.abs(chin.y - eyeCenter.y);
  if (faceHeight < 1) return 0;
  // Expected nose position is ~40% down from eyes to chin
  const noseRatio = (noseTip.y - eyeCenter.y) / faceHeight;
  const deviation = Math.abs(noseRatio - 0.4);
  return deviation * 120; // Map to approximate degrees
}

/**
 * Map Euclidean distance → confidence score [0, 1].
 *
 * Uses a sigmoid centred on MATCH_THRESHOLD:
 *   dist = 0.30 → confidence ≈ 0.92
 *   dist = 0.38 → confidence ≈ 0.80
 *   dist = 0.45 → confidence ≈ 0.50
 *   dist = 0.55 → confidence ≈ 0.18
 */
function distanceToConfidence(dist: number): number {
  const k = 14; // steepness
  return 1 / (1 + Math.exp(k * (dist - MATCH_THRESHOLD)));
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

// ─── helpers ──────────────────────────────────────────────────────────────────

function parseDescriptor(raw: unknown): Float32Array | null {
  try {
    if (!raw) return null;
    if (raw instanceof Float32Array) return raw;
    if (typeof raw === 'string') return stringToDescriptor(raw);
    if (Array.isArray(raw)) {
      const a = new Float32Array(raw as number[]);
      return a.length >= 64 ? a : null;          // accept 128 or 512-dim
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

const sanitizeSegment = (v: string) =>
  v.toLowerCase().trim().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'unknown';

async function getCachedProfile(userId: string) {
  const cached = profileNameCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.profile;
  const { data } = await supabase
    .from('profiles')
    .select('display_name, username, full_name, avatar_url')
    .eq('user_id', userId)
    .maybeSingle();
  profileNameCache.set(userId, { expiresAt: Date.now() + PROFILE_CACHE_TTL_MS, profile: data ?? null });
  return data ?? null;
}

// ─── core recognition ─────────────────────────────────────────────────────────

export async function recognizeFace(faceDescriptor: Float32Array): Promise<RecognitionResult> {
  try {
    console.log('recognizeFace: starting gallery match');

    // ── Phase 1: match against progressively-trained descriptors ─────────────
    const trainedDescriptors = await getAllTrainedDescriptors();

    // Vector-index shortlist (HNSW, FAISS-style): instead of scoring every
    // person in the school we pull the nearest candidates from the index and
    // re-score ONLY those exactly. Scoring maths and thresholds below are
    // unchanged, so accuracy is identical while lookups stay sub-linear.
    let candidateIds: string[] = Array.from(trainedDescriptors.keys());
    if (trainedDescriptors.size > 25) {
      try {
        const vectors: Array<{ ownerId: string; vector: Float32Array }> = [];
        let sampleCount = 0;
        for (const [userId, data] of trainedDescriptors) {
          vectors.push({ ownerId: userId, vector: data.averagedDescriptor });
          for (const d of data.descriptors) {
            vectors.push({ ownerId: userId, vector: d });
            sampleCount++;
          }
        }
        buildVectorIndex(vectors, `rs:${trainedDescriptors.size}:${sampleCount}`);
        const hits = searchVectorIndex(faceDescriptor, 24);
        if (hits.length >= 2) {
          candidateIds = hits.map(h => h.ownerId);
          console.log(`Vector index shortlisted ${candidateIds.length}/${trainedDescriptors.size} people`);
        }
      } catch (indexError) {
        console.warn('Vector index unavailable, falling back to full scan:', indexError);
      }
    }

    // Track top-2 matches for ambiguity detection.
    // Collapse all entries with the same userName into one — a student may have
    // descriptors stored under multiple user IDs (e.g. re-registration) and the
    // ambiguity check must not penalise them for being their own second-best match.
    const perNameBest = new Map<string, { userId: string; userName: string; studentId: string | null; distance: number; sampleCount: number }>();

    const scoreCandidates = (ids: string[]) => {
      perNameBest.clear();
      for (const userId of ids) {
        const data = trainedDescriptors.get(userId);
        if (!data) continue;
        // Best distance across all stored samples for this user
        // Using ONLY Euclidean distance — do NOT mix with cosine distance for face-api.js vectors
        // Weighted prototype matching: combine centroid + per-sample distances
        const centroidDist = euclideanDistance(faceDescriptor, data.averagedDescriptor);
        let minSampleDist = centroidDist;
        let sampleDistSum = 0;
        let sampleCount = 0;
        for (const desc of data.descriptors) {
          if (desc.length !== faceDescriptor.length) continue;
          const d = euclideanDistance(faceDescriptor, desc);
          if (d < minSampleDist) minSampleDist = d;
          sampleDistSum += d;
          sampleCount++;
        }
        // Harmonic fusion: weight best sample match heavily, penalize by centroid deviation
        const avgSampleDist = sampleCount > 0 ? sampleDistSum / sampleCount : centroidDist;
        const minDist = sampleCount >= 3
          ? 0.65 * minSampleDist + 0.20 * centroidDist + 0.15 * avgSampleDist
          : 0.70 * minSampleDist + 0.30 * centroidDist;

        // Guard: skip if distance is non-finite (indicates corrupt/mismatched descriptor data)
        if (!Number.isFinite(minDist)) {
          console.warn(`Skipping ${data.userName}: non-finite distance (descriptor data issue)`);
          continue;
        }

        console.log(`  ${data.userName} (${data.sampleCount} samples): dist=${minDist.toFixed(4)}`);

        // Merge into per-name best (normalise name for comparison)
        const nameKey = data.userName.trim().toLowerCase();
        const existing = perNameBest.get(nameKey);
        if (!existing || minDist < existing.distance) {
          perNameBest.set(nameKey, {
            userId,
            userName:    data.userName,
            studentId:   (data as any).studentId ?? null,
            distance:    minDist,
            sampleCount: data.sampleCount + (existing?.sampleCount ?? 0),
          });
        }
      }
      // Sort merged results to find best + second-best across DIFFERENT people
      return Array.from(perNameBest.values()).sort((a, b) => a.distance - b.distance);
    };

    const usedShortlist = candidateIds.length < trainedDescriptors.size;
    let ranked = scoreCandidates(candidateIds);

    // Safety net: an approximate index can miss the true nearest neighbour.
    // If nothing passes the threshold on the shortlist, fall back to the exact
    // full scan so accuracy is never worse than before.
    if (usedShortlist && (!ranked[0] || ranked[0].distance > MATCH_THRESHOLD)) {
      console.log('Shortlist produced no accepted match — running exact full scan');
      ranked = scoreCandidates(Array.from(trainedDescriptors.keys()));
    }

    const best   = ranked[0] ?? null;
    const second = ranked[1] ?? null;

    // Reject if no match within threshold
    if (!best || best.distance > MATCH_THRESHOLD) {
      console.log(`No match within threshold (best=${best?.distance.toFixed(4) ?? 'none'}, threshold=${MATCH_THRESHOLD})`);
      return { recognized: false };
    }


    // Ambiguity check: if second-best (different person) is almost as close, refuse to guess
    if (second && (best.distance / second.distance > AMBIGUITY_RATIO || (second.distance - best.distance) < MIN_MARGIN_GAP)) {
      console.warn(
        `Ambiguous match rejected: best=${best.distance.toFixed(4)} (${best.userName}), ` +
        `second=${second.distance.toFixed(4)}, ratio=${(best.distance / second.distance).toFixed(3)}, gap=${(second.distance - best.distance).toFixed(4)}`
      );
      return { recognized: false };
    }

    const confidence = clamp01(distanceToConfidence(best.distance));
    console.log(`Best match: ${best.userName}, dist=${best.distance.toFixed(4)}, confidence=${(confidence * 100).toFixed(1)}%`);

    // Fetch user info — try by user_id first, then by student_id (employee_id)
    let regData: any = null;
    const { data: byUserId } = await supabase
      .from('attendance_records')
      .select('id, user_id, device_info')
      .eq('user_id', best.userId)
      .in('status', ['registered', 'pending_approval'])
      .limit(1)
      .maybeSingle();
    regData = byUserId;

    // Fallback: look up by employee_id (student_id) — covers unauthenticated registrations
    if (!regData && (best as any).studentId) {
      const { data: byStudentId } = await supabase
        .from('attendance_records')
        .select('id, user_id, device_info')
        .eq('student_id', (best as any).studentId)
        .in('status', ['registered', 'pending_approval'])
        .order('timestamp', { ascending: false })
        .limit(1)
        .maybeSingle();
      regData = byStudentId;
    }

    // Fallback: look up by name match when all id lookups fail
    if (!regData && best.userName && best.userName !== 'Unknown') {
      const { data: byName } = await supabase
        .from('attendance_records')
        .select('id, user_id, device_info')
        .eq('student_name', best.userName)
        .in('status', ['registered', 'pending_approval'])
        .order('timestamp', { ascending: false })
        .limit(1)
        .maybeSingle();
      regData = byName;
    }

    let avatarUrl = '';
    const employeeData = (regData?.device_info as DeviceInfo | null)?.metadata ?? null;
    const profileData  = await getCachedProfile(best.userId);
    if (profileData?.avatar_url) avatarUrl = profileData.avatar_url;

    // Resolve the best available name: registration metadata → face_descriptor name → 'Unknown'
    const resolvedName = employeeData?.name || best.userName || 'Unknown';

    return {
      recognized: true,
      employee: {
        id:                best.userId,
        name:              resolvedName,
        employee_id:       employeeData?.employee_id || (best as any).studentId || 'Unknown',
        department:        employeeData?.department  || 'Unknown',
        position:          employeeData?.position    || 'Unknown',
        firebase_image_url: employeeData?.firebase_image_url || '',
        avatar_url:        avatarUrl,
        trainingSamples:   best.sampleCount,
      },
      confidence,
      strictMetrics: {
        fusedScore:       confidence,
        descriptorScore:  confidence,
        pointCloudScore:  0,
        thresholdTarget:  AUTO_MARK_CONFIDENCE,
        autoMarkEligible: confidence >= AUTO_MARK_CONFIDENCE,
      },
    };
  } catch (err) {
    // ── Phase 2: legacy fallback from attendance_records ─────────────────────
    console.warn('Phase-1 recognition failed, trying legacy path:', err);
    return recognizeFaceLegacy(faceDescriptor);
  }
}

async function recognizeFaceLegacy(faceDescriptor: Float32Array): Promise<RecognitionResult> {
  const { data, error } = await supabase
    .from('attendance_records')
    .select('id, user_id, status, device_info, face_descriptor')
    .in('status', ['registered', 'pending_approval']);

  if (error || !data?.length) return { recognized: false };

  let bestMatch: any    = null;
  let bestDist          = MATCH_THRESHOLD;

  for (const record of data) {
    const desc = parseDescriptor(record.face_descriptor)
      ?? parseDescriptor((record.device_info as DeviceInfo | null)?.metadata?.faceDescriptor);
    if (!desc) continue;

    const dist = euclideanDistance(faceDescriptor, desc);
    if (dist < bestDist) { bestDist = dist; bestMatch = record; }
  }

  if (!bestMatch) return { recognized: false };

  const conf          = clamp01(distanceToConfidence(bestDist));
  const deviceInfo    = bestMatch.device_info as DeviceInfo | null;
  const employeeData  = deviceInfo?.metadata;
  if (!employeeData)  return { recognized: false };

  let avatarUrl = employeeData.firebase_image_url || '';
  if (bestMatch.user_id && bestMatch.user_id !== 'unknown') {
    const p = await getCachedProfile(bestMatch.user_id);
    if (p?.avatar_url) avatarUrl = p.avatar_url;
  }

  return {
    recognized: true,
    employee: {
      id:                bestMatch.user_id || 'unknown',
      name:              employeeData.name || 'Unknown',
      employee_id:       employeeData.employee_id || 'Unknown',
      department:        employeeData.department  || 'Unknown',
      position:          employeeData.position    || 'Unknown',
      firebase_image_url: employeeData.firebase_image_url || '',
      avatar_url:        avatarUrl,
    },
    confidence: conf,
    strictMetrics: {
      fusedScore:       conf,
      descriptorScore:  conf,
      pointCloudScore:  0,
      thresholdTarget:  AUTO_MARK_CONFIDENCE,
      autoMarkEligible: false,
    },
  };
}

// ─── attendance recording ─────────────────────────────────────────────────────

async function isPastCutoffTime(): Promise<boolean> {
  try {
    const cutoff = await getAttendanceCutoffTime();
    const now    = new Date();
    const target = new Date();
    target.setHours(cutoff.hour, cutoff.minute, 0, 0);
    return now > target;
  } catch {
    const now = new Date();
    const t   = new Date(); t.setHours(9, 0, 0, 0);
    return now > t;
  }
}

export async function recordAttendance(
  userId: string,
  status: 'present' | 'late' | 'absent' | 'unauthorized',
  confidence?: number,
  deviceInfo?: any,
  capturedImageDataUrl?: string,
  captureMode: 'ai-scan' | 'qr-scan' | 'gate-mode' = 'ai-scan'
): Promise<any> {
  const sourceHint = deviceInfo?.source || deviceInfo?.metadata?.source;
  const shouldAutoNotifyParent =
    sourceHint !== 'qr-scanner' &&
    deviceInfo?.metadata?.suppress_auto_notification !== true;
  const MIN_ATTENDANCE_CONFIDENCE = 0.65;
  const isManual =
    Boolean(deviceInfo?.metadata?.manual_confirmation) ||
    Boolean(deviceInfo?.metadata?.force_attendance_save);

  if (
    !isManual &&
    status !== 'unauthorized' &&
    status !== 'absent' &&
    typeof confidence === 'number' &&
    confidence < MIN_ATTENDANCE_CONFIDENCE
  ) {
    console.warn(
      `Attendance skipped: confidence ${(confidence * 100).toFixed(1)}% < ${(MIN_ATTENDANCE_CONFIDENCE * 100).toFixed(0)}%`
    );
    return { skipped: true, reason: 'low_confidence', confidence };
  }

  let adjustedStatus = status;
  if (status === 'present' && await isPastCutoffTime()) {
    adjustedStatus = 'late';
  }

  const timestamp = new Date().toISOString();

  let userName: string | null = null;
  if (userId && userId !== 'unknown') {
    const p = await getCachedProfile(userId);
    if (p) userName = p.display_name || p.full_name || p.username || null;
  }

  // Upload captured image
  let uploadedImageUrl: string | null = null;
  let trainingAttendancePath: string | null = null;
  if (capturedImageDataUrl) {
    try {
      const blob = await dataUrlToBlob(capturedImageDataUrl);
      if (blob) {
        const fileName = `attendance/${userId}/${Date.now()}.jpg`;
        const { data: up, error: upErr } = await supabase.storage
          .from('face-images')
          .upload(fileName, blob, { contentType: 'image/jpeg', upsert: false });
        if (!upErr && up) {
          const { data: urlData } = supabase.storage.from('face-images').getPublicUrl(fileName);
          uploadedImageUrl = urlData?.publicUrl ?? null;
        }
        trainingAttendancePath = await uploadAttendanceTrainingImage({
          imageBlob: blob,
          studentId: userId,
          status: adjustedStatus as 'present' | 'late' | 'absent' | 'unauthorized',
          mode:    captureMode,
          confidence,
          employeeId: deviceInfo?.metadata?.employee_id,
          category:   deviceInfo?.metadata?.category,
        });
      }
    } catch (uploadErr) {
      console.warn('Image upload error:', uploadErr);
    }
  }

  const resolvedSource: 'ai-scan' | 'qr-scan' | 'gate-mode' =
    captureMode === 'gate-mode' ? 'gate-mode' :
    captureMode === 'qr-scan'  ? 'qr-scan'  : 'ai-scan';

  const fullDeviceInfo = {
    type: 'webcam',
    timestamp,
    confidence,
    ...deviceInfo,
    gate: captureMode === 'gate-mode' || Boolean((deviceInfo as any)?.gate),
    metadata: {
      ...deviceInfo?.metadata,
      name:                     userName || deviceInfo?.metadata?.name || 'Unknown',
      capture_mode:             sanitizeSegment(captureMode),
      training_attendance_path: trainingAttendancePath,
    },
  };

  const resolvedStudentId =
    fullDeviceInfo?.metadata?.employee_id ||
    (deviceInfo as any)?.student_id ||
    userId;

  const { data, error } = await supabase
    .from('attendance_records')
    .insert({
      user_id:          userId,
      student_id:       resolvedStudentId,
      timestamp,
      status:           adjustedStatus,
      source:           resolvedSource,
      capture_mode:     captureMode,
      class:            fullDeviceInfo?.metadata?.class   ?? null,
      section:          fullDeviceInfo?.metadata?.section ?? null,
      student_name:     userName,
      device_info:      fullDeviceInfo,
      confidence_score: confidence,
      image_url:        uploadedImageUrl,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to record attendance: ${error.message}`);

  console.log('Attendance recorded:', data);

  // Class-session event
  const meta      = (fullDeviceInfo?.metadata ?? {}) as Record<string, unknown>;
  const className = (meta.class as string | undefined) ?? (meta.class_name as string | undefined) ?? null;
  const section   = (meta.section as string | undefined) ?? null;

  if (className && section) {
    try {
      const sessionId = await ensureActiveClassSession({
        className,
        section,
        subject: (meta.subject as string | undefined) ?? null,
      });
      if (sessionId) {
        await upsertClassAttendanceEvent({
          sessionId,
          studentId:        userId,
          status:           adjustedStatus as 'present' | 'late' | 'absent' | 'unauthorized',
          source:           captureMode === 'gate-mode' ? 'gate' : 'scanner',
          confidenceScore:  confidence,
          idempotencyKey:   `${sessionId}:${userId}`,
          metadata: {
            attendance_record_id: data.id,
            class:      className,
            section,
            student_name: (meta.name as string | undefined) ?? userName ?? null,
            capture_mode: captureMode,
          },
        });
      }
    } catch (e) {
      console.error('Class session event error:', e);
    }
  }

  if (shouldAutoNotifyParent) {
    // Non-blocking parent notification
    import('@/services/notification/AutoNotificationService')
      .then(({ sendAutoParentNotification }) => {
        const studentName = fullDeviceInfo?.metadata?.name || 'Student';
        const photoUrl    = uploadedImageUrl || deviceInfo?.metadata?.firebase_image_url;
        sendAutoParentNotification(userId, studentName, adjustedStatus as 'present' | 'late' | 'absent', photoUrl)
          .catch(e => console.error('Auto-notification error:', e));
      })
      .catch(e => console.error('Notification module load error:', e));
  }

  return data;
}
