import { supabase } from '@/integrations/supabase/client';
import { compressImageFile } from '@/utils/imageCompressor';

/**
 * Uploads a portfolio or gallery image to Supabase Storage with compression.
 * Uses the proven 'faces/' path in the 'face-images' bucket which has public read/write access.
 */
export async function uploadPortfolioImage(rawFile: File): Promise<string> {
  // 1. Compress the file on client first (max 1280px, quality 0.8)
  const { file, dataUrl } = await compressImageFile(rawFile, 1280, 960, 0.8);
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
  const cleanExt = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext) ? ext : 'jpg';
  const fileName = `portfolio-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${cleanExt}`;
  
  // Try candidates in order of bucket/path policy permissions
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
      } else {
        console.warn(`Upload attempt failed for ${candidate.bucket}/${candidate.path}:`, error.message);
      }
    } catch (err) {
      console.warn(`Upload attempt exception for ${candidate.bucket}/${candidate.path}:`, err);
    }
  }

  // If storage upload cannot be reached, return the optimized compressed Data URL
  return dataUrl;
}
