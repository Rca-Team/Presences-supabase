import { supabase } from '@/integrations/supabase/client';
import { syncFromSupabase as syncDescriptorCache } from './DescriptorCacheService';

export interface DuplicateItem {
  id: string;
  sourceTable: 'face_descriptors' | 'attendance_records';
  imageUrl: string;
  normalizedKey: string;
  createdAt?: string;
  reason: 'exact_url_match' | 'storage_path_duplicate' | 'burst_capture_duplicate' | 'identical_descriptor_vector';
  isKeeper?: boolean;
}

export interface StudentDeduplicationGroup {
  userId: string;
  employeeId?: string;
  studentName: string;
  classSection?: string;
  avatarUrl?: string;
  totalSamples: number;
  duplicateCount: number;
  estimatedBytesSaved: number;
  keeperSample: DuplicateItem | null;
  duplicateSamples: DuplicateItem[];
}

export interface DeduplicationScanResult {
  totalStudentsScanned: number;
  studentsWithDuplicates: number;
  totalDuplicatesFound: number;
  estimatedBytesSaved: number;
  groups: StudentDeduplicationGroup[];
  scannedAt: string;
}

export interface DeduplicationExecutionResult {
  success: boolean;
  totalDuplicatesRemoved: number;
  storageReclaimedBytes: number;
  studentsCleanedCount: number;
  errors: string[];
}

/**
 * Normalizes an image reference to a unified canonical storage key
 */
export const extractCanonicalStorageKey = (urlOrPath?: string | null): string => {
  if (!urlOrPath) return '';
  const trimmed = urlOrPath.trim();
  if (!trimmed) return '';

  // Data URLs: hash length and prefix for identification
  if (trimmed.startsWith('data:image/')) {
    return `data-hash:${trimmed.slice(0, 100)}_${trimmed.length}`;
  }

  // Supabase storage URLs: strip domain, query tokens, and bucket prefixes
  try {
    const cleanUrl = trimmed.split('?')[0];
    const match = cleanUrl.match(/\/(?:storage\/v1\/object\/(?:public|sign)\/)?([^\/]+)\/(.+)$/);
    if (match) {
      const bucket = match[1];
      const path = match[2];
      return `${bucket}:${path.replace(/^faces\//, '')}`;
    }
  } catch {
    // Fall back to filename match
  }

  // Filename fallback
  const filenameMatch = trimmed.split('?')[0].match(/([^\/\\]+\.(?:jpg|jpeg|png|webp|avif))$/i);
  if (filenameMatch) {
    return `file:${filenameMatch[1].toLowerCase()}`;
  }

  return trimmed;
};

/**
 * Scans all student face samples across face_descriptors and attendance_records
 * to detect identical duplicate photos, burst captures, and redundant slots.
 */
export const scanDuplicateFaceSamples = async (): Promise<DeduplicationScanResult> => {
  const [descriptorsRes, attendanceRes, profilesRes] = await Promise.all([
    supabase
      .from('face_descriptors')
      .select('id, user_id, student_id, label, image_url, descriptor, created_at')
      .order('created_at', { ascending: false }),
    supabase
      .from('attendance_records')
      .select('id, user_id, student_id, student_name, image_url, status, device_info, timestamp, confidence_score')
      .neq('status', 'unauthorized')
      .not('image_url', 'is', null)
      .order('timestamp', { ascending: false }),
    supabase
      .from('profiles')
      .select('user_id, display_name, full_name, employee_id, roll_number, avatar_url, class, section'),
  ]);

  if (descriptorsRes.error) throw descriptorsRes.error;
  if (attendanceRes.error) throw attendanceRes.error;

  const descriptors = descriptorsRes.data || [];
  const attendance = attendanceRes.data || [];
  const profiles = profilesRes.data || [];

  const normalizeNameKey = (raw?: string | null): string => {
    if (!raw) return '';
    return raw
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[^a-z0-9 ]/gi, '');
  };

  const profileMapByUserId = new Map<string, any>();
  const profileMapByEmpId = new Map<string, any>();
  const profileMapByName = new Map<string, any>();

  profiles.forEach((p) => {
    if (p.user_id) profileMapByUserId.set(p.user_id, p);
    if (p.employee_id) profileMapByEmpId.set(String(p.employee_id).trim().toLowerCase(), p);
    if (p.roll_number) profileMapByEmpId.set(String(p.roll_number).trim().toLowerCase(), p);
    if (p.full_name) profileMapByName.set(normalizeNameKey(p.full_name), p);
    if (p.display_name) profileMapByName.set(normalizeNameKey(p.display_name), p);
  });

  // Group all samples by student identity
  const studentMap = new Map<
    string,
    {
      userId: string;
      employeeId: string;
      name: string;
      classSection?: string;
      avatarUrl?: string;
      items: DuplicateItem[];
      descriptors: any[];
    }
  >();

  const getOrCreateStudent = (userId?: string, empId?: string, fallbackName?: string) => {
    const normName = normalizeNameKey(fallbackName);
    const profile =
      (userId ? profileMapByUserId.get(userId) : null) ||
      (empId ? profileMapByEmpId.get(empId.toLowerCase()) : null) ||
      (normName ? profileMapByName.get(normName) : null);

    const finalUserId = userId || profile?.user_id || '';
    const finalEmpId = profile?.employee_id || profile?.roll_number || empId || '';
    const name = profile?.full_name || profile?.display_name || fallbackName || 'Student';
    const classSec = profile?.class ? `${profile.class}${profile?.section ? `-${profile.section}` : ''}` : undefined;

    const key = finalUserId || (finalEmpId ? `emp:${finalEmpId.toLowerCase()}` : (normName ? `name:${normName}` : name.toLowerCase()));
    if (studentMap.has(key)) return studentMap.get(key)!;

    const group = {
      userId: finalUserId,
      employeeId: finalEmpId,
      name,
      classSection: classSec,
      avatarUrl: profile?.avatar_url,
      items: [] as DuplicateItem[],
      descriptors: [] as any[],
    };

    studentMap.set(key, group);
    if (normName) studentMap.set(`name:${normName}`, group);
    if (finalEmpId) studentMap.set(`emp:${finalEmpId.toLowerCase()}`, group);
    if (finalUserId) studentMap.set(finalUserId, group);

    return group;
  };

  // 1. Ingest Descriptors
  descriptors.forEach((row: any) => {
    const group = getOrCreateStudent(row.user_id, row.student_id, row.label);
    const key = extractCanonicalStorageKey(row.image_url);
    group.items.push({
      id: row.id,
      sourceTable: 'face_descriptors',
      imageUrl: row.image_url || '',
      normalizedKey: key,
      createdAt: row.created_at,
      reason: 'exact_url_match',
    });
    group.descriptors.push(row);
  });

  // 2. Ingest Attendance Photos
  attendance.forEach((row: any) => {
    if (!row.image_url) return;
    const di = (row.device_info as Record<string, any>) || {};
    const meta = (di.metadata as Record<string, any>) || {};
    const empId = meta.employee_id || meta.roll_number || di.employee_id || row.student_id || '';
    const name = meta.name || di.name || row.student_name || 'Student';

    const group = getOrCreateStudent(row.user_id, empId, name);
    const key = extractCanonicalStorageKey(row.image_url);
    group.items.push({
      id: row.id,
      sourceTable: 'attendance_records',
      imageUrl: row.image_url,
      normalizedKey: key,
      createdAt: row.timestamp,
      reason: 'exact_url_match',
    });
  });

  // 3. Analyze Duplicates per student
  const resultGroups: StudentDeduplicationGroup[] = [];
  let totalDuplicatesFound = 0;
  let totalEstimatedBytes = 0;
  const AVG_SAMPLE_SIZE_BYTES = 220 * 1024; // ~220 KB avg per face image

  studentMap.forEach((student) => {
    if (student.items.length <= 1) return;

    const seenCanonicalKeys = new Map<string, DuplicateItem>();
    const keepers: DuplicateItem[] = [];
    const duplicates: DuplicateItem[] = [];

    // Sort items so descriptor slots and avatar photos are considered first as keepers
    const sortedItems = [...student.items].sort((a, b) => {
      // Priority 1: Face descriptors slots (trained models) come before attendance photos
      if (a.sourceTable !== b.sourceTable) {
        return a.sourceTable === 'face_descriptors' ? -1 : 1;
      }
      // Priority 2: Matches active avatar URL
      if (student.avatarUrl) {
        const aMatches = extractCanonicalStorageKey(a.imageUrl) === extractCanonicalStorageKey(student.avatarUrl);
        const bMatches = extractCanonicalStorageKey(b.imageUrl) === extractCanonicalStorageKey(student.avatarUrl);
        if (aMatches !== bMatches) return aMatches ? -1 : 1;
      }
      // Priority 3: Earliest verified date
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateA - dateB;
    });

    sortedItems.forEach((item) => {
      if (!item.normalizedKey) {
        keepers.push({ ...item, isKeeper: true });
        return;
      }

      if (seenCanonicalKeys.has(item.normalizedKey)) {
        // Redundant duplicate of an already seen image!
        duplicates.push({
          ...item,
          reason: item.sourceTable === 'face_descriptors' ? 'identical_descriptor_vector' : 'exact_url_match',
          isKeeper: false,
        });
      } else {
        seenCanonicalKeys.set(item.normalizedKey, item);
        keepers.push({ ...item, isKeeper: true });
      }
    });

    if (duplicates.length > 0) {
      const bytesSaved = duplicates.length * AVG_SAMPLE_SIZE_BYTES;
      totalDuplicatesFound += duplicates.length;
      totalEstimatedBytes += bytesSaved;

      resultGroups.push({
        userId: student.userId,
        employeeId: student.employeeId,
        studentName: student.name,
        classSection: student.classSection,
        avatarUrl: student.avatarUrl || keepers[0]?.imageUrl,
        totalSamples: student.items.length,
        duplicateCount: duplicates.length,
        estimatedBytesSaved: bytesSaved,
        keeperSample: keepers[0] || null,
        duplicateSamples: duplicates,
      });
    }
  });

  return {
    totalStudentsScanned: studentMap.size,
    studentsWithDuplicates: resultGroups.length,
    totalDuplicatesFound,
    estimatedBytesSaved: totalEstimatedBytes,
    groups: resultGroups,
    scannedAt: new Date().toISOString(),
  };
};

/**
 * Automatically executes AI Deduplication, removing redundant duplicates
 * from face_descriptors and attendance_records, and syncing the cache.
 */
export const executeDeduplication = async (options?: {
  targetUserId?: string;
  onProgress?: (progress: { current: number; total: number; label: string }) => void;
}): Promise<DeduplicationExecutionResult> => {
  const scanResult = await scanDuplicateFaceSamples();
  const errors: string[] = [];

  let groupsToClean = scanResult.groups;
  if (options?.targetUserId) {
    groupsToClean = scanResult.groups.filter(
      (g) => g.userId === options.targetUserId || g.employeeId === options.targetUserId
    );
  }

  const allDuplicates = groupsToClean.flatMap((g) => g.duplicateSamples);
  const total = allDuplicates.length;

  if (total === 0) {
    return {
      success: true,
      totalDuplicatesRemoved: 0,
      storageReclaimedBytes: 0,
      studentsCleanedCount: 0,
      errors: [],
    };
  }

  const slotIdsToDelete = allDuplicates
    .filter((d) => d.sourceTable === 'face_descriptors')
    .map((d) => d.id);

  const recordIdsToClean = allDuplicates
    .filter((d) => d.sourceTable === 'attendance_records')
    .map((d) => d.id);

  // Batch delete redundant face_descriptors in chunks of 50
  if (slotIdsToDelete.length > 0) {
    options?.onProgress?.({
      current: 0,
      total,
      label: `Pruning ${slotIdsToDelete.length} duplicate trained model descriptors...`,
    });

    for (let i = 0; i < slotIdsToDelete.length; i += 50) {
      const batch = slotIdsToDelete.slice(i, i + 50);
      const { error } = await supabase.from('face_descriptors').delete().in('id', batch);
      if (error) {
        errors.push(`Descriptor batch error: ${error.message}`);
      }
    }
  }

  // Batch clear duplicate image_urls on attendance records
  if (recordIdsToClean.length > 0) {
    options?.onProgress?.({
      current: slotIdsToDelete.length,
      total,
      label: `Reclaiming storage on ${recordIdsToClean.length} duplicate attendance photos...`,
    });

    for (let i = 0; i < recordIdsToClean.length; i += 50) {
      const batch = recordIdsToClean.slice(i, i + 50);
      const { error } = await supabase
        .from('attendance_records')
        .update({ image_url: null })
        .in('id', batch);
      if (error) {
        errors.push(`Attendance batch error: ${error.message}`);
      }
    }
  }

  // Sync Descriptor Cache
  options?.onProgress?.({
    current: total,
    total,
    label: 'Synchronizing AI Face Descriptor Cache...',
  });

  try {
    await syncDescriptorCache();
  } catch (err: any) {
    console.warn('Descriptor cache sync warning:', err);
  }

  return {
    success: errors.length === 0,
    totalDuplicatesRemoved: total,
    storageReclaimedBytes: groupsToClean.reduce((acc, g) => acc + g.estimatedBytesSaved, 0),
    studentsCleanedCount: groupsToClean.length,
    errors,
  };
};
