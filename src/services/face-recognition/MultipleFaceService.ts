import * as faceapi from 'face-api.js';
import { detectFacesOptimized, trackFace } from './OptimizedModelService';
import { recognizeFace } from './RecognitionService';
import { recordAttendance } from './RecognitionService';
import { storeFaceSample } from './ProgressiveTrainingService';

export interface DetectedFace {
  id: string;
  descriptor: Float32Array;
  boundingBox: faceapi.Rect;
  confidence: number;
  landmarks: faceapi.FaceLandmarks68;
  recognition?: {
    recognized: boolean;
    employee?: any;
    confidence?: number;
  };
  tracking: {
    isTracked: boolean;
    lastSeen: number;
    needsProcessing: boolean;
  };
}

export interface MultipleFaceResult {
  faces: DetectedFace[];
  totalFaces: number;
  recognizedFaces: DetectedFace[];
  unrecognizedFaces: DetectedFace[];
  processingTime: number;
}

// Face ID generation for tracking
let faceIdCounter = 0;
const activeFaces = new Map<string, DetectedFace>();

// Configuration
const RECOGNITION_CONFIDENCE_THRESHOLD = 0.55; // Stricter threshold for better accuracy (1 - 0.45 distance)
const FACE_TRACKING_TIMEOUT = 10000; // 10 seconds
const MAX_FACES_PER_FRAME = 60; // Increased for classroom scenarios (50+)

export async function detectMultipleFaces(
  input: HTMLVideoElement | HTMLImageElement,
  options: {
    enableRecognition?: boolean;
    enableTracking?: boolean;
    maxFaces?: number;
    classroomMode?: boolean; // New: optimized for classroom scenarios
  } = {}
): Promise<MultipleFaceResult> {
  
  const startTime = Date.now();
  
  try {
    console.log('Starting multiple face detection...');
    
    // Enable classroom mode automatically when maxFaces > 20
    const classroomMode = options.classroomMode || (options.maxFaces && options.maxFaces > 20);
    
    // Detect all faces with optimized pipeline
    const detections = await detectFacesOptimized(input, {
      maxFaces: options.maxFaces || MAX_FACES_PER_FRAME,
      enableTracking: options.enableTracking !== false,
      skipFrames: !classroomMode, // Don't skip frames in classroom mode for accuracy
      classroomMode // Pass classroom mode for optimized settings
    });

    const detectedFaces: DetectedFace[] = [];
    
    for (const detection of detections) {
      const face = await processSingleDetection(detection, options);
      if (face) {
        detectedFaces.push(face);
      }
    }

    // Clean up old tracked faces
    cleanupOldFaces();

    // Categorize faces
    const recognizedFaces = detectedFaces.filter(f => f.recognition?.recognized);
    const unrecognizedFaces = detectedFaces.filter(f => !f.recognition?.recognized);

    const result: MultipleFaceResult = {
      faces: detectedFaces,
      totalFaces: detectedFaces.length,
      recognizedFaces,
      unrecognizedFaces,
      processingTime: Date.now() - startTime
    };

    console.log(`Multiple face detection completed: ${result.totalFaces} faces found (${recognizedFaces.length} recognized)`);
    
    return result;
    
  } catch (error) {
    console.error('Error in multiple face detection:', error);
    return {
      faces: [],
      totalFaces: 0,
      recognizedFaces: [],
      unrecognizedFaces: [],
      processingTime: Date.now() - startTime
    };
  }
}

async function processSingleDetection(
  detection: faceapi.WithFaceDescriptor<faceapi.WithFaceLandmarks<{ detection: faceapi.FaceDetection; }, faceapi.FaceLandmarks68>>,
  options: {
    enableRecognition?: boolean;
    enableTracking?: boolean;
  }
): Promise<DetectedFace | null> {

  try {
    // Generate face ID based on position and descriptor
    const faceId = generateFaceId(detection.descriptor, detection.detection.box);
    
    // Check if we need to process this face
    const needsProcessing = !options.enableTracking || 
      trackFace(faceId, detection.descriptor, detection.detection.box);

    const face: DetectedFace = {
      id: faceId,
      descriptor: detection.descriptor,
      boundingBox: detection.detection.box,
      confidence: detection.detection.score,
      landmarks: detection.landmarks,
      tracking: {
        isTracked: true,
        lastSeen: Date.now(),
        needsProcessing
      }
    };

    // Perform recognition if enabled and needed
    if (options.enableRecognition !== false && needsProcessing) {
      try {
        const recognitionResult = await recognizeFace(detection.descriptor);
        face.recognition = {
          recognized: recognitionResult.recognized,
          employee: recognitionResult.employee,
          confidence: recognitionResult.confidence
        };

        // Record attendance for recognized faces
        if (recognitionResult.recognized && recognitionResult.employee) {
          console.log(`Recording attendance for ${recognitionResult.employee.name}`);
          // Note: You might want to add debouncing here to avoid duplicate records
          await recordAttendance(
            recognitionResult.employee.id,
            'present', // You can add logic for late detection
            recognitionResult.confidence
          );
        }
      } catch (recognitionError) {
        console.error('Error in face recognition:', recognitionError);
        face.recognition = { recognized: false };
      }
    }

    // Update active faces tracking
    activeFaces.set(faceId, face);
    
    return face;
    
  } catch (error) {
    console.error('Error processing single face detection:', error);
    return null;
  }
}

function generateFaceId(descriptor: Float32Array, box: faceapi.Rect): string {
  // Create a simple hash from descriptor and position
  const descriptorHash = Array.from(descriptor.slice(0, 10))
    .map(n => Math.round(n * 1000))
    .join('');
  
  const positionHash = `${Math.round(box.x)}_${Math.round(box.y)}`;
  
  // Check if this matches any existing face
  for (const [existingId, existingFace] of activeFaces.entries()) {
    const distance = faceapi.euclideanDistance(descriptor, existingFace.descriptor);
    const boxDistance = Math.abs(existingFace.boundingBox.x - box.x) + 
                       Math.abs(existingFace.boundingBox.y - box.y);
    
    // If very similar, return existing ID
    if (distance < 0.4 && boxDistance < 100) {
      return existingId;
    }
  }
  
  // Generate new ID
  return `face_${++faceIdCounter}_${Date.now()}`;
}

function cleanupOldFaces(): void {
  const now = Date.now();
  for (const [id, face] of activeFaces.entries()) {
    if (now - face.tracking.lastSeen > FACE_TRACKING_TIMEOUT) {
      activeFaces.delete(id);
      console.log(`Cleaned up old face: ${id}`);
    }
  }
}

// Batch process multiple faces for attendance
export async function processBatchAttendance(
  faces: DetectedFace[],
  cutoffTime?: { hour: number; minute: number }
): Promise<{
  processed: number;
  recognized: number;
  attendanceRecorded: number;
  errors: string[];
}> {
  
  const result = {
    processed: 0,
    recognized: 0,
    attendanceRecorded: 0,
    errors: [] as string[]
  };

  for (const face of faces) {
    try {
      result.processed++;
      
      if (!face.recognition) {
        // Perform recognition if not done yet
        const recognitionResult = await recognizeFace(face.descriptor);
        face.recognition = {
          recognized: recognitionResult.recognized,
          employee: recognitionResult.employee,
          confidence: recognitionResult.confidence
        };
      }

      if (face.recognition.recognized && face.recognition.employee) {
        result.recognized++;
        
        // Determine status based on cutoff time
        const isPastCutoff = cutoffTime ? 
          isPastCutoffTime(cutoffTime) : false;
        const status = isPastCutoff ? 'late' : 'present';
        
        await recordAttendance(
          face.recognition.employee.id,
          status,
          face.recognition.confidence
        );
        
        // Store for progressive training
        if (face.recognition.confidence && face.recognition.confidence > 0.75) {
          await storeFaceSample(
            face.recognition.employee.id,
            face.descriptor,
            null,
            face.recognition.employee.name,
            face.recognition.confidence
          ).catch(err => console.error('Training sample error:', err));
        }
        
        result.attendanceRecorded++;
        console.log(`Batch attendance recorded for ${face.recognition.employee.name}: ${status}`);
      }
      
    } catch (error) {
      const errorMsg = `Error processing face ${face.id}: ${error.message}`;
      console.error(errorMsg);
      result.errors.push(errorMsg);
    }
  }

  return result;
}

// Helper function to check cutoff time
function isPastCutoffTime(cutoffTime: { hour: number; minute: number }): boolean {
  const now = new Date();
  const cutoff = new Date();
  cutoff.setHours(cutoffTime.hour, cutoffTime.minute, 0, 0);
  return now > cutoff;
}

// Get statistics about currently tracked faces
export function getTrackingStats() {
  const now = Date.now();
  const activeFaceCount = Array.from(activeFaces.values())
    .filter(face => now - face.tracking.lastSeen < FACE_TRACKING_TIMEOUT).length;
  
  return {
    totalTrackedFaces: activeFaces.size,
    activeFaces: activeFaceCount,
    recognizedFaces: Array.from(activeFaces.values())
      .filter(face => face.recognition?.recognized).length
  };
}

// Reset all tracking data
export function resetMultipleFaceTracking(): void {
  activeFaces.clear();
  faceIdCounter = 0;
}

// Get active faces for UI display
export function getActiveFaces(): DetectedFace[] {
  const now = Date.now();
  return Array.from(activeFaces.values())
    .filter(face => now - face.tracking.lastSeen < FACE_TRACKING_TIMEOUT);
}