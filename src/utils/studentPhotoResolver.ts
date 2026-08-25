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
      return {
        bucket: unwrapPath(storageMatch[1]),
        path: decodeURIComponent(storageMatch[2]),
      };
    }

    const marker = '/face-images/';
    const markerIndex = value.indexOf(marker);
    if (markerIndex >= 0) {
      const pathWithQuery = value.slice(markerIndex + marker.length);
      const [path] = pathWithQuery.split('?');
      return { bucket: FACE_BUCKET, path: unwrapPath(path) };
    }

    return null;
  }

  const normalized = unwrapPath(value);
  const prefixed = normalized.match(/^([^/]+)\/(.+)$/);
  if (prefixed?.[1] && prefixed?.[2]) {
    return {
      bucket: prefixed[1],
      path: unwrapPath(prefixed[2]),
    };
  }

  return {
    bucket: FACE_BUCKET,
    path: unwrapPath(normalized.replace(/^face-images\//, '')),
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

export const resolveStudentPhotoUrl = async (raw?: string | null): Promise<string> => {
  const value = raw?.toString().trim();
  if (!value) return '';
  if (value.startsWith('data:')) return value;

  const storageRef = extractStorageRef(value);
  if (!storageRef || !storageRef.path) return value;

  const bucket = storageRef.bucket || FACE_BUCKET;
  const bucketPath = storageRef.path;

  const cacheKey = `${bucket}:${bucketPath}`;
  if (signedUrlCache.has(cacheKey)) return signedUrlCache.get(cacheKey)!;

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(bucketPath, 60 * 60 * 24 * 7);

  if (!error && data?.signedUrl) {
    signedUrlCache.set(cacheKey, data.signedUrl);
    return data.signedUrl;
  }

  const publicUrl = supabase.storage.from(bucket).getPublicUrl(bucketPath).data.publicUrl;
  return publicUrl || value;
};
