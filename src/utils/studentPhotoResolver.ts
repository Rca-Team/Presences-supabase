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
