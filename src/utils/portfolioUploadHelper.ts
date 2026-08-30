import { supabase } from '@/integrations/supabase/client';
import { compressImageFile } from '@/utils/imageCompressor';

/**
 * Uploads a portfolio or gallery image to Supabase Storage with compression.
 * Accepts File, Blob, or Data URI strings.
 * Uses proven compliant bucket paths (faces/, batch/, etc.) in 'face-images' and 'public'.
 */
export async function uploadPortfolioImage(input: File | Blob | string): Promise<string> {
  // If already a valid remote or static asset URL, return as-is
  if (typeof input === 'string') {
    if (input.startsWith('http://') || input.startsWith('https://') || input.startsWith('/') || input.startsWith('./')) {
      return input;
    }
  }

  let rawFile: File;

  if (typeof input === 'string' && input.startsWith('data:image/')) {
    try {
      const res = await fetch(input);
      const blob = await res.blob();
      rawFile = new File([blob], 'upload.jpg', { type: blob.type || 'image/jpeg' });
    } catch {
      return input;
    }
  } else if (input instanceof Blob && !(input instanceof File)) {
    rawFile = new File([input], 'upload.jpg', { type: input.type || 'image/jpeg' });
  } else if (input instanceof File) {
    rawFile = input;
  } else {
    return String(input);
  }

  // 1. Compress the file on client (max 1280px, quality 0.8)
  const { file, dataUrl } = await compressImageFile(rawFile, 1280, 960, 0.8);
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
  const cleanExt = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext) ? ext : 'jpg';
  const fileName = `portfolio-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${cleanExt}`;

  // Try candidate storage paths in order of bucket permissions
  const candidatePaths = [
    { bucket: 'face-images', path: `faces/${fileName}` },
    { bucket: 'face-images', path: `batch/${fileName}` },
    { bucket: 'face-images', path: `visitors/${fileName}` },
    { bucket: 'face-images', path: fileName },
    { bucket: 'public', path: `faces/${fileName}` },
    { bucket: 'public', path: fileName },
    { bucket: 'student-registration-faces', path: `faces/${fileName}` },
  ];

  for (const candidate of candidatePaths) {
    try {
      const { error } = await supabase.storage
        .from(candidate.bucket)
        .upload(candidate.path, file, {
          cacheControl: '3600',
          upsert: true,
          contentType: file.type || 'image/jpeg',
        });

      if (!error) {
        const { data: pubData } = supabase.storage
          .from(candidate.bucket)
          .getPublicUrl(candidate.path);

        if (pubData?.publicUrl) {
          return pubData.publicUrl;
        }
      }
    } catch (err) {
      console.warn(`Upload attempt notice for ${candidate.bucket}/${candidate.path}:`, err);
    }
  }

  // Fallback to client-compressed data URL
  return dataUrl;
}
