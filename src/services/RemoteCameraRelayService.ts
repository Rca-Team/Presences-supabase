/**
 * RemoteCameraRelayService
 * Real-time cross-device camera frame streaming, node pairing, and remote attendance trigger.
 * Enables an admin/teacher on Device A (controller) to view and mark attendance via Device B (satellite camera node).
 */

import { supabase } from '@/integrations/supabase/client';
import { getDeviceFingerprintId } from '@/services/DeviceTelemetryService';

export interface CameraNodeStatus {
  nodeId: string;
  nodeName: string;
  pairingCode: string;
  isStreaming: boolean;
  activeFaceCount: number;
  lastFrameSnapshot?: string | null; // base64 JPEG thumbnail
  resolution: { width: number; height: number };
  facingMode: 'user' | 'environment';
  updatedAt: number;
}

const RELAY_CHANNEL_NAME = 'broadcast:remote-camera-relay';

let activeMediaStream: MediaStream | null = null;
let broadcastInterval: any = null;

/**
 * Generate 6-digit alphanumeric pairing code
 */
export function generatePairingCode(): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Start Satellite Camera Node on this physical device
 */
export async function startSatelliteCameraNode(
  videoElement: HTMLVideoElement,
  pairingCode: string,
  onRemoteCaptureCommand?: (triggerInfo: any) => void
): Promise<{ stream: MediaStream; stop: () => void }> {
  const deviceId = getDeviceFingerprintId();
  const channel = supabase.channel(RELAY_CHANNEL_NAME);

  // Request camera stream
  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: 'user',
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
    audio: false,
  });

  activeMediaStream = stream;
  videoElement.srcObject = stream;
  await videoElement.play();

  // Hidden canvas for frame thumbnail generation
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  canvas.width = 360;
  canvas.height = 240;

  // Listen for remote attendance trigger commands from controller
  channel
    .on('broadcast', { event: 'remote_capture_trigger' }, (payload) => {
      if (payload.payload?.targetPairingCode === pairingCode || payload.payload?.targetNodeId === deviceId) {
        if (onRemoteCaptureCommand) {
          onRemoteCaptureCommand(payload.payload);
        }
      }
    })
    .subscribe();

  // Broadcast frame snapshots & status every 800ms
  broadcastInterval = setInterval(async () => {
    if (!videoElement || videoElement.paused || videoElement.ended || !ctx) return;
    try {
      ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
      const snapshotBase64 = canvas.toDataURL('image/jpeg', 0.5);

      await channel.send({
        type: 'broadcast',
        event: 'node_frame_update',
        payload: {
          nodeId: deviceId,
          nodeName: `Satellite Camera (${pairingCode})`,
          pairingCode,
          isStreaming: true,
          lastFrameSnapshot: snapshotBase64,
          resolution: { width: videoElement.videoWidth || 1280, height: videoElement.videoHeight || 720 },
          facingMode: 'user',
          updatedAt: Date.now(),
        },
      });
    } catch {}
  }, 800);

  const stop = () => {
    if (broadcastInterval) clearInterval(broadcastInterval);
    if (activeMediaStream) {
      activeMediaStream.getTracks().forEach((track) => track.stop());
      activeMediaStream = null;
    }
    supabase.removeChannel(channel);
  };

  return { stream, stop };
}

/**
 * Controller: Subscribe to live frame updates from satellite camera nodes
 */
export function subscribeToSatelliteNodes(
  onNodeUpdate: (status: CameraNodeStatus) => void
) {
  const channel = supabase.channel(RELAY_CHANNEL_NAME);

  channel
    .on('broadcast', { event: 'node_frame_update' }, (payload) => {
      if (payload.payload) {
        onNodeUpdate(payload.payload as CameraNodeStatus);
      }
    })
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * Controller: Send remote capture & attendance command to a paired camera node
 */
export async function dispatchRemoteCaptureCommand(
  targetPairingCode: string,
  targetNodeId?: string
) {
  const channel = supabase.channel(RELAY_CHANNEL_NAME);
  await channel.send({
    type: 'broadcast',
    event: 'remote_capture_trigger',
    payload: {
      targetPairingCode,
      targetNodeId: targetNodeId || null,
      triggeredAt: Date.now(),
      command: 'SCAN_AND_MARK_ATTENDANCE',
    },
  });
}
