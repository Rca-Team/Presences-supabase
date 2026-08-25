import * as faceapi from 'face-api.js';

export interface FaceAnalysisResult {
  age?: number;
  gender?: 'male' | 'female';
  genderProbability?: number;
  expressions?: {
    neutral: number;
    happy: number;
    sad: number;
    angry: number;
    fearful: number;
    disgusted: number;
    surprised: number;
  };
  quality?: {
    score: number;
    blur: number;
    brightness: number;
    resolution: number;
  };
  liveness?: {
    isLive: boolean;
    confidence: number;
    checks: {
      blinkDetected: boolean;
      eyeMovement: boolean;
      headMovement: boolean;
    };
  };
}

export interface MultipleFaceResult {
  faces: Array<{
    detection: faceapi.FaceDetection;
    analysis: FaceAnalysisResult;
    descriptor: Float32Array;
    boundingBox: { x: number; y: number; width: number; height: number };
  }>;
  count: number;
}

// Face quality assessment
export const assessFaceQuality = (
  canvas: HTMLCanvasElement,
  detection: faceapi.FaceDetection
): { score: number; blur: number; brightness: number; resolution: number } => {
  const ctx = canvas.getContext('2d');
  if (!ctx) return { score: 0, blur: 0, brightness: 0, resolution: 0 };

  const box = detection.box;
  const imageData = ctx.getImageData(box.x, box.y, box.width, box.height);
  const data = imageData.data;

  // Calculate brightness
  let brightness = 0;
  for (let i = 0; i < data.length; i += 4) {
    brightness += (data[i] + data[i + 1] + data[i + 2]) / 3;
  }
  brightness = brightness / (data.length / 4) / 255;

  // Simple blur detection using edge detection
  let blur = 0;
  const width = imageData.width;
  for (let i = width + 1; i < data.length - width - 1; i += 4) {
    const current = data[i];
    const diff = Math.abs(current - data[i - 4]) + Math.abs(current - data[i + 4]);
    blur += diff;
  }
  blur = 1 - Math.min(blur / (data.length / 4) / 255, 1);

  // Resolution assessment
  const resolution = Math.min(box.width * box.height / (160 * 160), 1);

  // Overall quality score
  const score = (brightness * 0.3 + (1 - blur) * 0.4 + resolution * 0.3);

  return { score, blur, brightness, resolution };
};

// Liveness detection using simple heuristics
export const detectLiveness = async (
  videoElement: HTMLVideoElement,
  previousFrames: ImageData[] = []
): Promise<{ isLive: boolean; confidence: number; checks: any }> => {
  const canvas = document.createElement('canvas');
  canvas.width = videoElement.videoWidth;
  canvas.height = videoElement.videoHeight;
  const ctx = canvas.getContext('2d');
  
  if (!ctx) return { isLive: false, confidence: 0, checks: {} };

  ctx.drawImage(videoElement, 0, 0);
  const currentFrame = ctx.getImageData(0, 0, canvas.width, canvas.height);

  let eyeMovement = false;
  let headMovement = false;
  let blinkDetected = false;

  // Simple movement detection
  if (previousFrames.length > 0) {
    const prevFrame = previousFrames[previousFrames.length - 1];
    let totalDiff = 0;
    
    for (let i = 0; i < currentFrame.data.length; i += 4) {
      const diff = Math.abs(currentFrame.data[i] - prevFrame.data[i]);
      totalDiff += diff;
    }
    
    const avgDiff = totalDiff / (currentFrame.data.length / 4);
    headMovement = avgDiff > 5; // Threshold for movement
    eyeMovement = avgDiff > 2 && avgDiff < 15; // Subtle movement for eyes
    blinkDetected = avgDiff > 3; // Basic blink detection
  }

  // Store frame for next comparison (keep last 5 frames)
  previousFrames.push(currentFrame);
  if (previousFrames.length > 5) {
    previousFrames.shift();
  }

  const checks = { blinkDetected, eyeMovement, headMovement };
  const confidence = Object.values(checks).filter(Boolean).length / 3;
  const isLive = confidence > 0.3; // At least one positive check

  return { isLive, confidence, checks };
};

// Enhanced face analysis with age, gender, and expressions
export const analyzeFace = async (
  imageElement: HTMLImageElement | HTMLVideoElement
): Promise<FaceAnalysisResult | null> => {
  try {
    // Detect face with all features
    const detection = await faceapi
      .detectSingleFace(imageElement, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
      .withFaceExpressions()
      .withAgeAndGender();

    if (!detection) return null;

    const canvas = document.createElement('canvas');
    canvas.width = imageElement instanceof HTMLVideoElement ? 
      imageElement.videoWidth : imageElement.width;
    canvas.height = imageElement instanceof HTMLVideoElement ? 
      imageElement.videoHeight : imageElement.height;
    
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(imageElement, 0, 0);
    }

    // Quality assessment
    const quality = canvas && ctx ? 
      assessFaceQuality(canvas, detection.detection) : 
      { score: 0.5, blur: 0.5, brightness: 0.5, resolution: 0.5 };

    // Liveness detection (only for video)
    let liveness = undefined;
    if (imageElement instanceof HTMLVideoElement) {
      liveness = await detectLiveness(imageElement);
    }

    return {
      age: Math.round(detection.age),
      gender: detection.gender as 'male' | 'female',
      genderProbability: detection.genderProbability,
      expressions: detection.expressions,
      quality,
      liveness
    };
  } catch (error) {
    console.error('Error analyzing face:', error);
    return null;
  }
};

// Multiple face detection and analysis
export const detectMultipleFaces = async (
  imageElement: HTMLImageElement | HTMLVideoElement
): Promise<MultipleFaceResult> => {
  try {
    const detections = await faceapi
      .detectAllFaces(imageElement, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
      .withFaceDescriptors()
      .withFaceExpressions()
      .withAgeAndGender();

    const canvas = document.createElement('canvas');
    canvas.width = imageElement instanceof HTMLVideoElement ? 
      imageElement.videoWidth : imageElement.width;
    canvas.height = imageElement instanceof HTMLVideoElement ? 
      imageElement.videoHeight : imageElement.height;
    
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(imageElement, 0, 0);
    }

    const faces = await Promise.all(
      detections.map(async (detection) => {
        const quality = canvas && ctx ? 
          assessFaceQuality(canvas, detection.detection) : 
          { score: 0.5, blur: 0.5, brightness: 0.5, resolution: 0.5 };

        let liveness = undefined;
        if (imageElement instanceof HTMLVideoElement) {
          liveness = await detectLiveness(imageElement);
        }

        const analysis: FaceAnalysisResult = {
          age: Math.round(detection.age),
          gender: detection.gender as 'male' | 'female',
          genderProbability: detection.genderProbability,
          expressions: detection.expressions,
          quality,
          liveness
        };

        return {
          detection: detection.detection,
          analysis,
          descriptor: detection.descriptor,
          boundingBox: {
            x: detection.detection.box.x,
            y: detection.detection.box.y,
            width: detection.detection.box.width,
            height: detection.detection.box.height
          }
        };
      })
    );

    return {
      faces,
      count: faces.length
    };
  } catch (error) {
    console.error('Error detecting multiple faces:', error);
    return { faces: [], count: 0 };
  }
};
