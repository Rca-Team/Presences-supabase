import { supabase } from '@/integrations/supabase/client';
import { uploadImage } from './StorageService';

type AttendanceCaptureMode = 'ai-scan' | 'qr-scan' | 'gate-mode' | string;

interface RegistrationTrainingUploadInput {
  imageBlob: Blob;
  studentId: string;
  employeeId?: string;
  category?: string;
  label?: string;
}

interface AttendanceTrainingUploadInput {
  imageBlob: Blob;
  studentId: string;
  status: 'present' | 'late' | 'absent' | 'unauthorized';
  mode?: AttendanceCaptureMode;
  confidence?: number;
  employeeId?: string;
  category?: string;
}

interface FaceModelUploadInput {
  studentId: string;
  employeeId?: string;
  category?: string;
  captureMode: 'auto-10' | 'scan-3d';
  averagedDescriptor: Float32Array;
  descriptors: Float32Array[];
  sampleImages?: string[];
}

const sanitizeSegment = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'unknown';

const parseClassSection = (category?: string) => {
  const raw = (category || '').trim();
  const [classPart, sectionPart] = raw.includes('-') ? raw.split('-', 2) : [raw, 'unknown'];

  return {
    className: sanitizeSegment(classPart || 'unknown'),
    sectionName: sanitizeSegment(sectionPart || 'unknown'),
  };
};

const getUploaderId = async () => {
  const { data } = await supabase.auth.getUser();
  return data.user?.id || null;
};

export const dataUrlToBlob = async (dataUrl: string): Promise<Blob | null> => {
  try {
    const base64Data = dataUrl.split(',')[1];
    if (!base64Data) return null;

    const byteCharacters = atob(base64Data);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }

    return new Blob([new Uint8Array(byteNumbers)], { type: 'image/jpeg' });
  } catch {
    return null;
  }
};

export const uploadRegistrationTrainingImage = async (
  input: RegistrationTrainingUploadInput,
): Promise<string | null> => {
  const uploaderId = await getUploaderId();
  if (!uploaderId) return null;

  const { className, sectionName } = parseClassSection(input.category);
  const studentKey = sanitizeSegment(input.employeeId || input.studentId);
  const label = sanitizeSegment(input.label || 'register');
  const timestamp = Date.now();

  const path = `${uploaderId}/class-${className}/section-${sectionName}/student-${studentKey}/${timestamp}-${label}.jpg`;

  const { error } = await supabase.storage
    .from('student-registration-faces')
    .upload(path, input.imageBlob, { contentType: 'image/jpeg', upsert: false, cacheControl: '3600' });

  if (error) {
    console.warn('Registration training upload failed:', error.message);
    return null;
  }

  return path;
};

export const uploadAttendanceTrainingImage = async (
  input: AttendanceTrainingUploadInput,
): Promise<string | null> => {
  const uploaderId = await getUploaderId();

  const dateKey = new Date().toISOString().split('T')[0];
  const mode = sanitizeSegment(input.mode || 'ai-scan');
  const studentKey = sanitizeSegment(input.employeeId || input.studentId);
  const status = sanitizeSegment(input.status);
  const confidenceLabel = Math.round(((input.confidence ?? 1) * 100));
  const actorKey = sanitizeSegment(uploaderId || input.studentId || input.employeeId || 'unknown');
  const path = `${actorKey}/date-${dateKey}/mode-${mode}/student-${studentKey}/status-${status}/${Date.now()}-conf-${confidenceLabel}.jpg`;

  const { error } = await supabase.storage
    .from('attendance-training-faces')
    .upload(path, input.imageBlob, { contentType: 'image/jpeg', upsert: false, cacheControl: '3600' });

  if (!error) {
    return path;
  }

  console.warn('Attendance training upload failed, using fallback bucket:', error.message);
  try {
    const file = new File([input.imageBlob], `${Date.now()}-conf-${confidenceLabel}.jpg`, { type: 'image/jpeg' });
    const fallbackPath = `attendance-training/${path}`;
    return await uploadImage(file, fallbackPath, 'face-images');
  } catch (fallbackErr) {
    console.warn('Attendance training fallback upload also failed:', fallbackErr);
    return null;
  }
};

export const uploadRegistrationFaceModel = async (
  input: FaceModelUploadInput,
): Promise<string | null> => {
  const uploaderId = await getUploaderId();
  if (!uploaderId) return null;

  const { className, sectionName } = parseClassSection(input.category);
  const studentKey = sanitizeSegment(input.employeeId || input.studentId);
  const timestamp = Date.now();
  const path = `${uploaderId}/class-${className}/section-${sectionName}/student-${studentKey}/models/${timestamp}-face-model.json`;

  const descriptorCloud = input.descriptors.map((d) => Array.from(d));
  const pointCloud3D = input.descriptors.map((d, idx) => ({
    id: idx + 1,
    x: Number(d[0]?.toFixed(6) || 0),
    y: Number(d[1]?.toFixed(6) || 0),
    z: Number(d[2]?.toFixed(6) || 0),
  }));

  const payload = {
    version: 'face-model-v1',
    created_at: new Date().toISOString(),
    student_id: input.studentId,
    employee_id: input.employeeId || null,
    category: input.category || null,
    capture_mode: input.captureMode,
    sample_count: input.descriptors.length,
    descriptor_dimensions: input.averagedDescriptor.length,
    averaged_descriptor: Array.from(input.averagedDescriptor),
    descriptor_cloud: descriptorCloud,
    point_cloud_3d_equivalent: pointCloud3D,
    sample_images: input.sampleImages || [],
  };

  const jsonBlob = new Blob([JSON.stringify(payload)], { type: 'application/json' });

  const { error } = await supabase.storage
    .from('student-registration-faces')
    .upload(path, jsonBlob, { contentType: 'application/json', upsert: false, cacheControl: '3600' });

  if (error) {
    console.warn('Registration face model upload failed:', error.message);
    return null;
  }

  return path;
};
