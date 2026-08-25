import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface EnhanceResult {
  enhanced: boolean;
  imageBase64: string;
}

/**
 * Detects if a captured image is low quality by analyzing brightness, contrast, and blur.
 * Returns a score 0-1 (lower = worse quality).
 */
function assessImageQuality(canvas: HTMLCanvasElement): number {
  const ctx = canvas.getContext('2d');
  if (!ctx) return 1;

  const w = Math.min(canvas.width, 256);
  const h = Math.min(canvas.height, 256);
  const small = document.createElement('canvas');
  small.width = w;
  small.height = h;
  const sCtx = small.getContext('2d')!;
  sCtx.drawImage(canvas, 0, 0, w, h);
  const { data } = sCtx.getImageData(0, 0, w, h);
  const pixels = data.length / 4;

  // Brightness
  let totalBrightness = 0;
  for (let i = 0; i < data.length; i += 4) {
    totalBrightness += (data[i] + data[i + 1] + data[i + 2]) / 3;
  }
  const avgBrightness = totalBrightness / pixels / 255;
  const brightnessScore = 1 - Math.abs(avgBrightness - 0.5) * 2; // optimal ~0.5

  // Contrast (standard deviation)
  let variance = 0;
  for (let i = 0; i < data.length; i += 4) {
    const gray = (data[i] + data[i + 1] + data[i + 2]) / 3 / 255;
    variance += (gray - avgBrightness) ** 2;
  }
  const contrastScore = Math.min(Math.sqrt(variance / pixels) * 4, 1);

  // Sharpness (Laplacian variance)
  let laplacianVar = 0;
  let laplacianMean = 0;
  let count = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = (y * w + x) * 4;
      const gray = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
      const top = (data[((y - 1) * w + x) * 4] + data[((y - 1) * w + x) * 4 + 1] + data[((y - 1) * w + x) * 4 + 2]) / 3;
      const bot = (data[((y + 1) * w + x) * 4] + data[((y + 1) * w + x) * 4 + 1] + data[((y + 1) * w + x) * 4 + 2]) / 3;
      const lft = (data[(y * w + x - 1) * 4] + data[(y * w + x - 1) * 4 + 1] + data[(y * w + x - 1) * 4 + 2]) / 3;
      const rgt = (data[(y * w + x + 1) * 4] + data[(y * w + x + 1) * 4 + 1] + data[(y * w + x + 1) * 4 + 2]) / 3;
      const lap = Math.abs(4 * gray - top - bot - lft - rgt);
      laplacianMean += lap;
      count++;
    }
  }
  laplacianMean /= count || 1;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = (y * w + x) * 4;
      const gray = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
      const top = (data[((y - 1) * w + x) * 4] + data[((y - 1) * w + x) * 4 + 1] + data[((y - 1) * w + x) * 4 + 2]) / 3;
      const bot = (data[((y + 1) * w + x) * 4] + data[((y + 1) * w + x) * 4 + 1] + data[((y + 1) * w + x) * 4 + 2]) / 3;
      const lft = (data[(y * w + x - 1) * 4] + data[(y * w + x - 1) * 4 + 1] + data[(y * w + x - 1) * 4 + 2]) / 3;
      const rgt = (data[(y * w + x + 1) * 4] + data[(y * w + x + 1) * 4 + 1] + data[(y * w + x + 1) * 4 + 2]) / 3;
      const lap = Math.abs(4 * gray - top - bot - lft - rgt);
      laplacianVar += (lap - laplacianMean) ** 2;
    }
  }
  const sharpness = Math.sqrt(laplacianVar / (count || 1));
  const sharpnessScore = Math.min(sharpness / 30, 1); // normalize

  return (brightnessScore * 0.3 + contrastScore * 0.3 + sharpnessScore * 0.4);
}

export function usePhotoEnhancer() {
  const { toast } = useToast();
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [lastQualityScore, setLastQualityScore] = useState<number | null>(null);

  const QUALITY_THRESHOLD = 0.45; // Below this → auto-enhance

  /**
   * Assess quality from a canvas or data URL. Returns true if enhancement is needed.
   */
  const needsEnhancement = useCallback((source: HTMLCanvasElement | string): boolean => {
    let canvas: HTMLCanvasElement;
    if (typeof source === 'string') {
      // Can't synchronously assess a data URL, assume it might need enhancement
      return true;
    }
    canvas = source;
    const score = assessImageQuality(canvas);
    setLastQualityScore(score);
    return score < QUALITY_THRESHOLD;
  }, []);

  /**
   * Enhance a photo via the AI edge function.
   * Input: base64 data URL. Returns enhanced data URL or original on failure.
   */
  const enhancePhoto = useCallback(async (imageDataUrl: string): Promise<string> => {
    setIsEnhancing(true);
    try {
      const { data, error } = await supabase.functions.invoke('enhance-photo', {
        body: { imageBase64: imageDataUrl },
      });

      if (error) {
        console.error('Enhancement function error:', error);
        throw error;
      }

      const result = data as EnhanceResult;
      if (result.enhanced && result.imageBase64) {
        toast({
          title: '✨ Photo Enhanced',
          description: 'Low-quality image was automatically improved by AI.',
        });
        return result.imageBase64;
      }

      return imageDataUrl; // Return original if not enhanced
    } catch (err: any) {
      console.warn('AI enhancement failed, using original:', err);
      if (err?.message?.includes('429')) {
        toast({ title: 'Enhancement skipped', description: 'Rate limit reached. Using original photo.', variant: 'destructive' });
      } else if (err?.message?.includes('402')) {
        toast({ title: 'Enhancement skipped', description: 'Credits needed for AI enhancement.', variant: 'destructive' });
      }
      return imageDataUrl;
    } finally {
      setIsEnhancing(false);
    }
  }, [toast]);

  /**
   * Auto-enhance: checks quality, enhances only if needed.
   */
  const autoEnhance = useCallback(async (
    imageDataUrl: string,
    canvas?: HTMLCanvasElement
  ): Promise<string> => {
    // Assess quality if canvas is provided
    if (canvas) {
      const score = assessImageQuality(canvas);
      setLastQualityScore(score);
      console.log(`Image quality score: ${(score * 100).toFixed(1)}% (threshold: ${QUALITY_THRESHOLD * 100}%)`);
      if (score >= QUALITY_THRESHOLD) {
        console.log('Image quality is acceptable, skipping enhancement');
        return imageDataUrl;
      }
      console.log('Low quality detected, enhancing with AI...');
    }

    return enhancePhoto(imageDataUrl);
  }, [enhancePhoto]);

  return {
    isEnhancing,
    lastQualityScore,
    needsEnhancement,
    enhancePhoto,
    autoEnhance,
    QUALITY_THRESHOLD,
  };
}
