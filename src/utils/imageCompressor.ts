/**
 * Image Compressor Utility
 * Resizes and compresses image files using HTML5 Canvas to ensure fast uploads
 * and prevent large payload errors in Supabase storage and database settings.
 */

export async function compressImageFile(
  file: File,
  maxWidth = 1600,
  maxHeight = 1200,
  quality = 0.82,
): Promise<{ file: File; dataUrl: string }> {
  return new Promise((resolve, reject) => {
    // If SVG or GIF, don't re-compress on canvas (preserves animation/vectors)
    if (file.type === 'image/svg+xml' || file.type === 'image/gif') {
      const reader = new FileReader();
      reader.onload = () => resolve({ file, dataUrl: reader.result as string });
      reader.onerror = reject;
      reader.readAsDataURL(file);
      return;
    }

    const img = new Image();
    const reader = new FileReader();

    reader.onload = (e) => {
      img.src = e.target?.result as string;
    };

    reader.onerror = reject;

    img.onload = () => {
      let { width, height } = img;

      if (width > maxWidth || height > maxHeight) {
        if (width / height > maxWidth / maxHeight) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        } else {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        // Fallback without compression
        resolve({ file, dataUrl: img.src });
        return;
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, width, height);

      // Output as WebP or JPEG for high efficiency
      const outputType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
      const compressedDataUrl = canvas.toDataURL(outputType, quality);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve({ file, dataUrl: compressedDataUrl });
            return;
          }
          const compressedFile = new File([blob], file.name, {
            type: outputType,
            lastModified: Date.now(),
          });
          resolve({ file: compressedFile, dataUrl: compressedDataUrl });
        },
        outputType,
        quality,
      );
    };

    img.onerror = () => {
      // If error loading image, fallback to raw file reader
      const r = new FileReader();
      r.onload = () => resolve({ file, dataUrl: r.result as string });
      r.onerror = reject;
      r.readAsDataURL(file);
    };

    reader.readAsDataURL(file);
  });
}
