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

export const resolveStudentPhotoUrl = async (raw?: string | null): Promise<string> => {
  const value = raw?.toString().trim();
  if (!value) return '';
  if (value.startsWith('data:')) return value;

  const storageRef = extractStorageRef(value);
  if (!storageRef || !storageRef.path) {
    // If it's an absolute URL pointing to an old Supabase project, rewrite to current project
    if (/^https?:\/\//i.test(value)) {
      return value.replace(/https:\/\/[a-z0-9-]+\.supabase\.co/gi, 'https://cvdcbcsonlianbfeessy.supabase.co').split('?')[0].replace('/storage/v1/object/sign/', '/storage/v1/object/public/');
    }
    return value;
  }

  const bucket = storageRef.bucket || FACE_BUCKET;
  const bucketPath = storageRef.path;

  const cacheKey = `${bucket}:${bucketPath}`;
  if (signedUrlCache.has(cacheKey)) return signedUrlCache.get(cacheKey)!;

  try {
    const { data: publicData } = supabase.storage.from(bucket).getPublicUrl(bucketPath);
    if (publicData?.publicUrl) {
      signedUrlCache.set(cacheKey, publicData.publicUrl);
      return publicData.publicUrl;
    }
  } catch (err) {
    console.warn('Public URL resolution fallback:', err);
  }

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(bucketPath, 60 * 60 * 24 * 365);

  if (!error && data?.signedUrl) {
    signedUrlCache.set(cacheKey, data.signedUrl);
    return data.signedUrl;
  }

  return `https://cvdcbcsonlianbfeessy.supabase.co/storage/v1/object/public/${bucket}/${bucketPath}`;
};
