/**
 * OnnxEmbeddingService
 *
 * Optional InsightFace / ArcFace embedder running on ONNX Runtime Web
 * (WebGPU → WASM-SIMD threads). This is the browser equivalent of replacing
 * dlib / `face_recognition` with InsightFace: same recognition contract,
 * 3–10× faster inference and stronger embeddings when the model is available.
 *
 * The model file is NOT bundled. Drop an ArcFace model at
 *   public/models/arcface/w600k_r50.onnx   (or set VITE_ARCFACE_MODEL_URL)
 * and the engine picks it up automatically. Without it, everything falls back
 * to the existing face-api.js embedder — no behaviour change, no errors.
 */

let session: any = null;
let unavailable = false;
let loading: Promise<boolean> | null = null;

const MODEL_URL =
  (import.meta as any).env?.VITE_ARCFACE_MODEL_URL || '/models/arcface/w600k_r50.onnx';

/** ArcFace input: 1x3x112x112, RGB, normalised to [-1, 1] */
const INPUT_SIZE = 112;

async function modelExists(): Promise<boolean> {
  try {
    const res = await fetch(MODEL_URL, { method: 'HEAD' });
    return res.ok && !(res.headers.get('content-type') || '').includes('text/html');
  } catch {
    return false;
  }
}

/** Returns true when the ONNX embedder is ready to use. */
export async function initializeOnnxEmbedder(): Promise<boolean> {
  if (session) return true;
  if (unavailable) return false;
  if (loading) return loading;

  loading = (async () => {
    try {
      if (!(await modelExists())) {
        unavailable = true;
        console.log('ArcFace ONNX model not present — using face-api.js embedder');
        return false;
      }

      const ort: any = await import('onnxruntime-web');
      ort.env.wasm.numThreads = Math.min(4, navigator.hardwareConcurrency || 2);
      ort.env.wasm.simd = true;

      const providers: string[] = [];
      if ('gpu' in navigator) providers.push('webgpu');
      providers.push('wasm');

      session = await ort.InferenceSession.create(MODEL_URL, {
        executionProviders: providers,
        graphOptimizationLevel: 'all',
      });
      console.log('ArcFace ONNX embedder ready:', providers.join(' → '));
      return true;
    } catch (err) {
      unavailable = true;
      console.warn('ONNX embedder unavailable, falling back to face-api.js:', err);
      return false;
    } finally {
      loading = null;
    }
  })();

  return loading;
}

export function isOnnxEmbedderReady(): boolean {
  return !!session;
}

/**
 * Embed an aligned face crop. Returns an L2-normalised embedding, or null when
 * the ONNX path is unavailable (caller should fall back to face-api.js).
 */
export async function embedFaceOnnx(
  source: HTMLCanvasElement | HTMLImageElement | HTMLVideoElement,
): Promise<Float32Array | null> {
  if (!session) {
    const ok = await initializeOnnxEmbedder();
    if (!ok) return null;
  }

  try {
    const canvas = document.createElement('canvas');
    canvas.width = INPUT_SIZE;
    canvas.height = INPUT_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(source as any, 0, 0, INPUT_SIZE, INPUT_SIZE);
    const { data } = ctx.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE);

    const pixels = INPUT_SIZE * INPUT_SIZE;
    const input = new Float32Array(3 * pixels);
    for (let i = 0; i < pixels; i++) {
      input[i] = (data[i * 4] - 127.5) / 127.5;                 // R
      input[pixels + i] = (data[i * 4 + 1] - 127.5) / 127.5;    // G
      input[2 * pixels + i] = (data[i * 4 + 2] - 127.5) / 127.5; // B
    }

    const ort: any = await import('onnxruntime-web');
    const tensor = new ort.Tensor('float32', input, [1, 3, INPUT_SIZE, INPUT_SIZE]);
    const feeds: Record<string, any> = { [session.inputNames[0]]: tensor };
    const output = await session.run(feeds);
    const raw: Float32Array = output[session.outputNames[0]].data;

    let norm = 0;
    for (let i = 0; i < raw.length; i++) norm += raw[i] * raw[i];
    norm = Math.sqrt(norm) || 1;
    const embedding = new Float32Array(raw.length);
    for (let i = 0; i < raw.length; i++) embedding[i] = raw[i] / norm;
    return embedding;
  } catch (err) {
    console.warn('ONNX embedding failed:', err);
    return null;
  }
}
