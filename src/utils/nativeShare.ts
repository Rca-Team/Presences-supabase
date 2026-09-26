/**
 * Native Android & Device File Sharing Utility
 * 
 * Invokes the device's native Share Sheet (WhatsApp, Google Drive, Gmail, Bluetooth)
 * when exporting attendance registers, PDF reports, or CSVs on mobile/tablets.
 * Gracefully falls back to browser file download on desktop PCs.
 */

export interface ShareFileOptions {
  file: File | Blob;
  fileName: string;
  mimeType: string;
  title?: string;
  text?: string;
}

/**
 * Share a file via the native system share sheet or download if unavailable.
 * Returns true if shared via native share sheet, false if downloaded.
 */
export async function shareOrDownloadFile(options: ShareFileOptions): Promise<boolean> {
  const { file, fileName, mimeType, title = 'Presences School Report', text = 'Exported from Presences Smart School System' } = options;

  let shareFile: File;
  if (file instanceof File) {
    shareFile = file;
  } else {
    shareFile = new File([file], fileName, { type: mimeType, lastModified: Date.now() });
  }

  // 1. Try Native Android / Device Web Share API with Files
  if (typeof navigator !== 'undefined' && navigator.share && navigator.canShare) {
    try {
      const shareData = {
        title,
        text,
        files: [shareFile],
      };

      if (navigator.canShare(shareData)) {
        await navigator.share(shareData);
        return true;
      }
    } catch (err: any) {
      // User aborted share sheet or cancelled — do not treat AbortError as fatal error
      if (err?.name === 'AbortError') {
        return true;
      }
      console.warn('[NativeShare] Native share failed, falling back to download:', err);
    }
  }

  // 2. Fallback: Browser file download
  try {
    const url = URL.createObjectURL(shareFile);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, 150);
  } catch (downloadErr) {
    console.error('[NativeShare] File download fallback error:', downloadErr);
  }

  return false;
}

/**
 * Check if the current browser supports native file sharing
 */
export function isNativeFileShareSupported(): boolean {
  if (typeof navigator === 'undefined' || !navigator.share || !navigator.canShare) {
    return false;
  }
  try {
    const testFile = new File(['test'], 'test.txt', { type: 'text/plain' });
    return navigator.canShare({ files: [testFile] });
  } catch {
    return false;
  }
}
