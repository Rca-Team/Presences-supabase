/**
 * Utility for Android .APK downloads and version checking.
 * Allows users to always download the latest up-to-date APK directly.
 */

import { toast } from 'sonner';

export interface ApkReleaseInfo {
  version: string;
  releaseDate: string;
  fileSize: string;
  downloadUrl: string;
  fallbackUrl: string;
  notes: string[];
}

export const LATEST_APK_CONFIG: ApkReleaseInfo = {
  version: 'v2.4.2',
  releaseDate: 'September 2026',
  fileSize: '18.4 MB',
  downloadUrl: 'https://github.com/Rca-Team/Presences-supabase/releases/latest/download/Presences-latest.apk',
  fallbackUrl: 'https://github.com/Rca-Team/Presences-supabase/releases',
  notes: [
    'True native 4x2 & 2x1 Android Home Screen Widgets',
    '3x faster instant camera & offline face verification',
    'Background sync & zero battery drain in idle',
  ],
};

/**
 * Trigger immediate download of the latest Android APK
 */
export const downloadLatestApk = (customUrl?: string): void => {
  const url = customUrl || LATEST_APK_CONFIG.downloadUrl;
  
  toast.success(`Downloading Presences ${LATEST_APK_CONFIG.version} APK...`, {
    description: `File size: ${LATEST_APK_CONFIG.fileSize}. Open downloaded file to install/update.`,
    duration: 5000,
  });

  try {
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Presences-${LATEST_APK_CONFIG.version}.apk`);
    link.setAttribute('target', '_blank');
    link.setAttribute('rel', 'noopener noreferrer');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch {
    window.open(url, '_blank');
  }
};
