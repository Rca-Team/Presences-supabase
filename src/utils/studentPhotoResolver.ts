import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

const FACE_BUCKET = 'face-images';
const signedUrlCache = new Map<string, string>();

const unwrapPath = (value: string) => value.replace(/^\/+/, '').trim();

const STORAGE_URL_PATTERN = /\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/([^?]+)/i;

const extractStorageRef = (raw: string): { bucket: string; path: string } | null => {
  const value = raw.trim();
  if (!value || value.startsWith('data:')) return null;

  if (/^https?:\/\//i.test(value)) {
    const storageMatch = value.match(STORAGE_URL_PATTERN);
    if (storageMatch?.[1] && storageMatch?.[2]) {
      const bucket = unwrapPath(storageMatch[1]);
      const rawPath = decodeURIComponent(storageMatch[2]);
      const [cleanPath] = rawPath.split('?');
      return {
        bucket,
        path: unwrapPath(cleanPath),
      };
    }

    const markers = ['/face-images/', '/student-registration-faces/', '/attendance-training-faces/'];
    for (const marker of markers) {
      const markerIndex = value.indexOf(marker);
      if (markerIndex >= 0) {
        const bucket = marker.replace(/\//g, '');
        const pathWithQuery = value.slice(markerIndex + marker.length);
        const [cleanPath] = pathWithQuery.split('?');
        return { bucket, path: unwrapPath(cleanPath) };
      }
    }

    return null;
  }

  const normalized = unwrapPath(value);
  const prefixed = normalized.match(/^([^/]+)\/(.+)$/);
  if (prefixed?.[1] && prefixed?.[2] && ['face-images', 'student-registration-faces', 'attendance-training-faces'].includes(prefixed[1])) {
    const [cleanPath] = prefixed[2].split('?');
    return {
      bucket: prefixed[1],
      path: unwrapPath(cleanPath),
    };
  }

  const [cleanNormalized] = normalized.split('?');
  return {
    bucket: FACE_BUCKET,
    path: unwrapPath(cleanNormalized.replace(/^face-images\//, '')),
  };
};

export const pickPreferredPhotoCandidate = (
  ...candidates: Array<string | null | undefined>
): string => {
  for (const candidate of candidates) {
    const value = candidate?.toString().trim();
    if (value) return value;
  }
  return '';
};

const STORAGE_BUCKETS = ['face-images', 'student-registration-faces', 'attendance-training-faces', 'public'] as const;

export const resolveStudentPhotoUrl = async (raw?: string | null): Promise<string> => {
  const value = raw?.toString().trim();
  if (!value) return '';
  if (value.startsWith('data:') || value.startsWith('blob:')) return value;

  // If already a valid signed URL with token, return directly
  if (/^https?:\/\//i.test(value) && value.includes('token=')) {
    return value;
  }

  const cacheKey = value;
  if (signedUrlCache.has(cacheKey)) return signedUrlCache.get(cacheKey)!;

  const storageRef = extractStorageRef(value);
  const primaryBucket = storageRef?.bucket || FACE_BUCKET;
  const bucketPath = storageRef?.path || unwrapPath(value).replace(/^(?:face-images|student-registration-faces|attendance-training-faces|public)\//, '');

  if (!bucketPath) {
    return value;
  }

  const bucketCandidates = Array.from(new Set([primaryBucket, ...STORAGE_BUCKETS]));

  // Try creating signed URL across buckets first (works for both private & public buckets)
  for (const bucket of bucketCandidates) {
    try {
      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrl(bucketPath, 60 * 60 * 24 * 365);

      if (!error && data?.signedUrl) {
        signedUrlCache.set(cacheKey, data.signedUrl);
        return data.signedUrl;
      }
    } catch {
      // Continue to next bucket
    }
  }

  // Fallback: try public URL
  for (const bucket of bucketCandidates) {
    try {
      const { data: publicData } = supabase.storage.from(bucket).getPublicUrl(bucketPath);
      if (publicData?.publicUrl) {
        signedUrlCache.set(cacheKey, publicData.publicUrl);
        return publicData.publicUrl;
      }
    } catch {
      // Continue
    }
  }

  return value;
};

const coverPhotoCache = new Map<string, string>();
const inFlightCoverPhoto = new Map<string, Promise<string | null>>();

/**
 * Get student's enrolled cover photo (profile avatar / registration photo),
 * NOT the webcam snapshot in which they were recognized.
 */
export async function getStudentCoverPhoto(
  userIdOrId?: string | null,
  name?: string | null,
  employeeId?: string | null
): Promise<string | null> {
  const key = (userIdOrId || employeeId || name || '').trim();
  if (!key) return null;

  if (coverPhotoCache.has(key)) {
    return coverPhotoCache.get(key) || null;
  }
  if (employeeId && coverPhotoCache.has(employeeId.trim())) {
    return coverPhotoCache.get(employeeId.trim()) || null;
  }
  if (name && coverPhotoCache.has(name.trim().toLowerCase())) {
    return coverPhotoCache.get(name.trim().toLowerCase()) || null;
  }

  if (inFlightCoverPhoto.has(key)) {
    return inFlightCoverPhoto.get(key)!;
  }

  const promise = (async () => {
    try {
      // 1. Check profiles table for avatar_url / photo_url
      const orConditions: string[] = [];
      if (userIdOrId) {
        orConditions.push(`user_id.eq.${userIdOrId}`, `id.eq.${userIdOrId}`);
      }
      if (employeeId) {
        orConditions.push(`employee_id.eq.${employeeId}`);
      }
      if (name) {
        orConditions.push(`display_name.ilike.${name}`, `full_name.ilike.${name}`);
      }

      if (orConditions.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('avatar_url, photo_url, user_id, employee_id, display_name')
          .or(orConditions.join(','))
          .limit(5);

        const foundProfile = profiles?.find((p: any) => p.avatar_url || p.photo_url);
        const candidate = foundProfile?.avatar_url || foundProfile?.photo_url;
        if (candidate) {
          const resolved = await resolveStudentPhotoUrl(candidate);
          if (resolved) {
            coverPhotoCache.set(key, resolved);
            if (userIdOrId) coverPhotoCache.set(userIdOrId.trim(), resolved);
            if (employeeId) coverPhotoCache.set(employeeId.trim(), resolved);
            if (name) coverPhotoCache.set(name.trim().toLowerCase(), resolved);
            return resolved;
          }
        }
      }

      // 2. Check registered attendance_records metadata
      const { data: regList } = await supabase
        .from('attendance_records')
        .select('device_info, image_url, user_id, id')
        .eq('status', 'registered');

      const matchedReg = (regList || []).find((r: any) => {
        const di = r.device_info as any;
        const meta = di?.metadata || di || {};
        const emp = String(meta.employee_id || meta.roll_number || '').toLowerCase();
        const nm = String(meta.name || meta.student_name || '').toLowerCase();
        if (employeeId && emp === employeeId.toLowerCase()) return true;
        if (userIdOrId && (r.user_id === userIdOrId || r.id === userIdOrId || emp === userIdOrId.toLowerCase())) return true;
        if (name && nm === name.toLowerCase()) return true;
        return false;
      });

      if (matchedReg) {
        const di = matchedReg.device_info as any;
        const meta = di?.metadata || di || {};
        const candidate = meta.firebase_image_url || meta.id_card_photo_url || meta.avatar_url || meta.photo_url || matchedReg.image_url;
        if (candidate) {
          const resolved = await resolveStudentPhotoUrl(candidate);
          if (resolved) {
            coverPhotoCache.set(key, resolved);
            if (userIdOrId) coverPhotoCache.set(userIdOrId.trim(), resolved);
            if (employeeId) coverPhotoCache.set(employeeId.trim(), resolved);
            if (name) coverPhotoCache.set(name.trim().toLowerCase(), resolved);
            return resolved;
          }
        }

        // If matchedReg has user_id, check face_descriptors
        if (matchedReg.user_id) {
          const { data: descriptor } = await supabase
            .from('face_descriptors')
            .select('image_url')
            .eq('user_id', matchedReg.user_id)
            .order('created_at', { ascending: true })
            .limit(1)
            .maybeSingle();

          if (descriptor?.image_url) {
            const resolved = await resolveStudentPhotoUrl(descriptor.image_url);
            if (resolved) {
              coverPhotoCache.set(key, resolved);
              if (userIdOrId) coverPhotoCache.set(userIdOrId.trim(), resolved);
              if (employeeId) coverPhotoCache.set(employeeId.trim(), resolved);
              if (name) coverPhotoCache.set(name.trim().toLowerCase(), resolved);
              return resolved;
            }
          }
        }
      }

      // 3. Check face_descriptors directly if userIdOrId is available
      if (userIdOrId) {
        const { data: descriptor } = await supabase
          .from('face_descriptors')
          .select('image_url')
          .eq('user_id', userIdOrId)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();

        if (descriptor?.image_url) {
          const resolved = await resolveStudentPhotoUrl(descriptor.image_url);
          if (resolved) {
            coverPhotoCache.set(key, resolved);
            return resolved;
          }
        }
      }
    } catch (e) {
      console.warn('Could not fetch student cover photo:', e);
    } finally {
      inFlightCoverPhoto.delete(key);
    }
    return null;
  })();

  inFlightCoverPhoto.set(key, promise);
  return promise;
}

/**
 * Synchronous cache lookup for instant rendering without lag
 */
export function getCachedStudentCoverPhoto(userIdOrId?: string | null): string | null {
  if (!userIdOrId) return null;
  const key = userIdOrId.trim();
  return coverPhotoCache.get(key) || coverPhotoCache.get(key.toLowerCase()) || null;
}

/**
 * React hook for consuming student cover photo with instant cache hydration
 */
export function useStudentCoverPhoto(student?: {
  id?: string | null;
  user_id?: string | null;
  name?: string | null;
  employee_id?: string | null;
  image_url?: string | null;
  cover_url?: string | null;
} | null): { coverUrl: string | null; loading: boolean } {
  const rawCandidate = student?.cover_url || student?.image_url;
  const initial =
    (rawCandidate && rawCandidate.startsWith('http') && !rawCandidate.includes('/null'))
      ? rawCandidate
      : getCachedStudentCoverPhoto(student?.user_id || student?.id || student?.employee_id || student?.name);

  const [coverUrl, setCoverUrl] = useState<string | null>(initial || null);
  const [loading, setLoading] = useState(!initial);

  useEffect(() => {
    let active = true;

    if (rawCandidate && (rawCandidate.startsWith('data:') || rawCandidate.startsWith('blob:') || (rawCandidate.startsWith('http') && rawCandidate.includes('token=')))) {
      setCoverUrl(rawCandidate);
      setLoading(false);
      return;
    }

    const cached = getCachedStudentCoverPhoto(student?.user_id || student?.id || student?.employee_id || student?.name);
    if (cached) {
      setCoverUrl(cached);
      setLoading(false);
      return;
    }

    (async () => {
      try {
        if (rawCandidate) {
          const resolvedRaw = await resolveStudentPhotoUrl(rawCandidate);
          if (active && resolvedRaw) {
            setCoverUrl(resolvedRaw);
            setLoading(false);
            return;
          }
        }

        const resolved = await getStudentCoverPhoto(
          student?.user_id || student?.id,
          student?.name,
          student?.employee_id
        );
        if (active && resolved) {
          setCoverUrl(resolved);
        }
      } catch {
        /* ignore */
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [student?.id, student?.user_id, student?.employee_id, student?.name, rawCandidate]);

  return { coverUrl, loading };
}

/**
 * Pre-warm cover photos cache for enrolled students
 */
export async function prefetchStudentCoverPhotos(userIds?: string[]): Promise<void> {
  try {
    const query = supabase
      .from('profiles')
      .select('user_id, id, avatar_url, photo_url');

    if (userIds && userIds.length > 0) {
      query.or(`user_id.in.(${userIds.join(',')}),id.in.(${userIds.join(',')})`);
    } else {
      query.not('avatar_url', 'is', null);
    }

    const { data: profiles } = await query.limit(200);

    if (profiles) {
      for (const p of profiles) {
        const url = (p as any)?.photo_url || (p as any)?.avatar_url;
        if (url) {
          const resolved = await resolveStudentPhotoUrl(url);
          if (resolved) {
            if (p.user_id) coverPhotoCache.set(p.user_id, resolved);
            if (p.id) coverPhotoCache.set(p.id, resolved);
          }
        }
      }
    }

    // Also get enrolled descriptors
    const { data: descriptors } = await supabase
      .from('face_descriptors')
      .select('user_id, image_url')
      .not('image_url', 'is', null)
      .order('created_at', { ascending: true })
      .limit(200);

    if (descriptors) {
      for (const d of descriptors) {
        if (d.user_id && !coverPhotoCache.has(d.user_id) && d.image_url) {
          const resolved = await resolveStudentPhotoUrl(d.image_url);
          if (resolved) coverPhotoCache.set(d.user_id, resolved);
        }
      }
    }
  } catch (e) {
    console.warn('Prefetching student cover photos failed:', e);
  }
}
