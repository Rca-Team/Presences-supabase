/**
 * PersonDetector — MediaPipe Tasks Vision ObjectDetector
 * Runs on the main thread with a throttled loop; the model itself uses WebGL/WebGPU.
 */
import { ObjectDetector, FilesetResolver, type Detection } from '@mediapipe/tasks-vision';

export interface PersonBox {
  x: number; y: number; w: number; h: number;
  score: number;
}

let detector: ObjectDetector | null = null;
let loading: Promise<ObjectDetector> | null = null;

async function initDetector(): Promise<ObjectDetector> {
  if (detector) return detector;
  if (loading) return loading;

  loading = (async () => {
    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm'
    );
    const d = await ObjectDetector.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite',
        delegate: 'GPU',
      },
      scoreThreshold: 0.45,
      maxResults: 12,
      runningMode: 'VIDEO',
      categoryAllowlist: ['person'],
    });
    detector = d;
    return d;
  })();

  return loading;
}

export async function warmupPersonDetector(): Promise<void> {
  await initDetector();
}

export async function detectPersons(
  video: HTMLVideoElement,
  timestampMs: number,
): Promise<PersonBox[]> {
  const d = await initDetector();
  if (video.readyState < 2 || video.videoWidth === 0) return [];
  const result = d.detectForVideo(video, timestampMs);
  return (result.detections ?? [])
    .map((det: Detection) => {
      const bb = det.boundingBox;
      if (!bb) return null;
      const cat = det.categories?.[0];
      return {
        x: bb.originX,
        y: bb.originY,
        w: bb.width,
        h: bb.height,
        score: cat?.score ?? 0,
      } as PersonBox;
    })
    .filter((b): b is PersonBox => !!b);
}

export function isPersonDetectorReady(): boolean {
  return detector !== null;
}
