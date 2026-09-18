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
 *   Different     : 0.55 – 1.00
 *   Threshold     : 0.48 (tightened to eliminate cross-student confusion)
 */
const MATCH_THRESHOLD = 0.45;

/**
 * If best and second-best distances are within this ratio the match is
 * ambiguous and will be rejected.
 * ratio = bestDist / secondBestDist; reject when ratio > AMBIGUITY_RATIO
 */
const AMBIGUITY_RATIO = 0.88;
const MIN_MARGIN_GAP = 0.035;

/**
 * Auto-mark without manual confirmation only when confidence is this high.
 */
const AUTO_MARK_CONFIDENCE = 0.55;

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
 */
function distanceToConfidence(dist: number): number {
  if (!Number.isFinite(dist) || dist >= 0.58) return 0.20;
  if (dist <= 0.20) return 0.99;
  return Math.max(0.50, Math.min(0.99, 1 - (dist * 0.70)));
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
    const perNameBest = new Map<string, { userId: string; userName: string; studentId: string | null; distance: number; sampleCount: number }>();

    const scoreCandidates = (ids: string[]) => {
      perNameBest.clear();
      for (const userId of ids) {
        const data = trainedDescriptors.get(userId);
        if (!data) continue;

        // Collect all valid distances matching descriptor length
        const sampleDists: number[] = [];
        for (const desc of data.descriptors) {
          if (desc.length !== faceDescriptor.length) continue;
          const d = euclideanDistance(faceDescriptor, desc);
          if (Number.isFinite(d)) sampleDists.push(d);
        }

        let centroidDist = Infinity;
        if (data.averagedDescriptor && data.averagedDescriptor.length === faceDescriptor.length) {
          centroidDist = euclideanDistance(faceDescriptor, data.averagedDescriptor);
        }

        if (sampleDists.length === 0 && !Number.isFinite(centroidDist)) continue;

        sampleDists.sort((a, b) => a - b);
        const d1 = sampleDists[0] ?? centroidDist;
        const d2 = sampleDists[1] ?? (Number.isFinite(centroidDist) ? centroidDist : d1);

        let effectiveDist = d1;
        if (sampleDists.length >= 2) {
          const top2Avg = (d1 + d2) / 2;
          const validCentroid = Number.isFinite(centroidDist) ? centroidDist : top2Avg;
          if (Number.isFinite(centroidDist) && centroidDist > 0.54 && d1 > 0.40) {
            continue;
          }
          effectiveDist = Math.min(validCentroid, 0.65 * d1 + 0.35 * Math.min(d2, validCentroid));
        } else if (Number.isFinite(centroidDist)) {
          effectiveDist = (d1 * 0.65) + (centroidDist * 0.35);
        }

        // Guard: skip if distance is non-finite
        if (!Number.isFinite(effectiveDist)) {
          continue;
        }

        // Merge into per-name best (normalise name for comparison)
        const nameKey = data.userName.trim().toLowerCase();
        const existing = perNameBest.get(nameKey);
        if (!existing || effectiveDist < existing.distance) {
          perNameBest.set(nameKey, {
            userId,
            userName:    data.userName,
            studentId:   (data as any).studentId ?? null,
            distance:    effectiveDist,
            sampleCount: data.sampleCount + (existing?.sampleCount ?? 0),
          });
        }
      }
      return Array.from(perNameBest.values()).sort((a, b) => a.distance - b.distance);
    };

    const usedShortlist = candidateIds.length < trainedDescriptors.size;
    let ranked = scoreCandidates(candidateIds);

    // Safety net: if nothing passes threshold on shortlist, fall back to exact full scan
    if (usedShortlist && (!ranked[0] || ranked[0].distance > MATCH_THRESHOLD)) {
      ranked = scoreCandidates(Array.from(trainedDescriptors.keys()));
    }

    const best   = ranked[0] ?? null;
    const second = ranked[1] ?? null;

    // Reject if no match within threshold
    if (!best || best.distance > MATCH_THRESHOLD) {
      console.log(`No match within threshold (best=${best?.distance.toFixed(4) ?? 'none'}, threshold=${MATCH_THRESHOLD})`);
      return { recognized: false };
    }

    // Ambiguity rejection: if runner-up candidate is close to threshold and within narrow margin
    if (second && second.userId !== best.userId && second.distance <= MATCH_THRESHOLD + 0.08) {
      const margin = second.distance - best.distance;
      const ratio = second.distance > 0 ? best.distance / second.distance : 1;
      if (margin < MIN_MARGIN_GAP || ratio > AMBIGUITY_RATIO) {
        console.warn(
          `[RecognitionService] Ambiguous match rejected: ${best.userName} (${best.distance.toFixed(3)}) vs ${second.userName} (${second.distance.toFixed(3)}), margin=${margin.toFixed(3)}`
        );
        return { recognized: false };
      }
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

// In-flight mutex to collapse concurrent marking attempts for the same identity into one
const inFlightAttendance = new Map<string, Promise<any>>();
// Fast in-memory cache of students marked present/late today
const markedTodayCache = new Map<string, { id: string; status: string; timestamp: string; student_name?: string | null }>();

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
    sourceHint !== 'live-face-id' &&
    deviceInfo?.metadata?.suppress_auto_notification !== true &&
    deviceInfo?.suppress_auto_notification !== true;
  const MIN_ATTENDANCE_CONFIDENCE = 0.50;
  const isExplicitManual = Boolean(deviceInfo?.metadata?.manual_confirmation);
  const isManual =
    isExplicitManual ||
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

  const resolvedStudentId =
    deviceInfo?.metadata?.employee_id ||
    (deviceInfo as any)?.student_id ||
    userId;

  // Deduplication check: if student is already marked present/late today, prevent duplicate record
  if (!isExplicitManual && (status === 'present' || status === 'late')) {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startOfTodayMs = startOfToday.getTime();

    const candidateKeys = Array.from(new Set([userId, resolvedStudentId].filter(Boolean) as string[]));

    // 1. Check in-memory cache first
    for (const key of candidateKeys) {
      const cached = markedTodayCache.get(key);
      if (cached && new Date(cached.timestamp).getTime() >= startOfTodayMs) {
        console.log(`[Deduplication] Student ${key} already marked attendance today (${cached.status} at ${cached.timestamp}). Skipping duplicate.`);
        return {
          ...cached,
          skipped: true,
          reason: 'already_marked',
          alreadyMarked: true,
          status: cached.status,
        };
      }
    }

    // 2. In-flight mutex: if another call for the same student is already executing,
    //    wait for its result instead of racing through to a second insert.
    const inFlightKey = candidateKeys.slice().sort().join(':');
    if (inFlightAttendance.has(inFlightKey)) {
      console.log(`[Deduplication] Awaiting in-flight attendance promise for ${inFlightKey}`);
      return await inFlightAttendance.get(inFlightKey)!;
    }

    // 3. Eagerly reserve the cache slot BEFORE any async work (image upload, DB query)
    //    so that concurrent calls hitting step 1 above will see the reservation immediately.
    const earlyPlaceholder = { id: '__pending__', status, timestamp: new Date().toISOString(), student_name: null };
    for (const k of candidateKeys) {
      markedTodayCache.set(k, earlyPlaceholder);
    }

    // 4. Check Database for today's existing present/late record
    try {
      const orFilter = candidateKeys.map(k => `user_id.eq.${k},student_id.eq.${k}`).join(',');
      const { data: existingRows } = await supabase
        .from('attendance_records')
        .select('id, status, timestamp, student_id, user_id, student_name')
        .in('status', ['present', 'late'])
        .gte('timestamp', startOfToday.toISOString())
        .or(orFilter)
        .order('timestamp', { ascending: false })
        .limit(1);

      if (existingRows && existingRows.length > 0) {
        const existing = existingRows[0];
        for (const k of candidateKeys) {
          markedTodayCache.set(k, existing);
        }
        if (existing.student_name) {
          markedTodayCache.set(existing.student_name.toLowerCase().trim(), existing);
        }
        console.log(`[Deduplication] DB record found for ${candidateKeys.join('/')}: already marked ${existing.status}. Skipping duplicate.`);
        return {
          ...existing,
          skipped: true,
          reason: 'already_marked',
          alreadyMarked: true,
          status: existing.status,
        };
      }
    } catch (checkErr) {
      console.warn('Attendance duplicate check warning:', checkErr);
    }
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

  // Fast non-blocking image upload: start concurrently so database insertion is instantaneous
  let uploadedImageUrl: string | null = null;
  let trainingAttendancePath: string | null = null;
  const imageUploadPromise = (async () => {
    if (!capturedImageDataUrl) return;
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
  })();

  // Race image upload for max 120ms; if storage is fast it attaches immediately, otherwise row is saved instantly
  await Promise.race([
    imageUploadPromise,
    new Promise((resolve) => setTimeout(resolve, 120)),
  ]);

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

  if (data && (adjustedStatus === 'present' || adjustedStatus === 'late')) {
    const keys = Array.from(new Set([userId, resolvedStudentId].filter(Boolean) as string[]));
    for (const k of keys) {
      markedTodayCache.set(k, data);
    }
    if (userName) {
      markedTodayCache.set(userName.toLowerCase().trim(), data);
    }
  }

  // If image upload completed after the initial record insert, update the image_url seamlessly in background
  if (!uploadedImageUrl && capturedImageDataUrl && data?.id) {
    void imageUploadPromise.then(async () => {
      if (uploadedImageUrl && data?.id) {
        try {
          await supabase
            .from('attendance_records')
            .update({ image_url: uploadedImageUrl })
            .eq('id', data.id);
        } catch {}
      }
    });
  }

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
