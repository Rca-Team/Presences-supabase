
import { supabase } from '@/integrations/supabase/client';
import { uploadImage } from './StorageService';
import { v4 as uuidv4 } from 'uuid';
import { descriptorToString } from './ModelService';
import { uploadRegistrationTrainingImage } from './TrainingDataStorageService';

// Define an interface for the metadata to ensure type safety
export interface RegistrationMetadata {
  name: string;
  employee_id: string;
  department: string;
  position: string;
  firebase_image_url: string;
  faceDescriptor?: string; // Make this optional since it's added conditionally
}

export const registerFace = async (
  imageBlob: Blob,
  name: string,
  employee_id: string,
  department: string,
  position: string,
  userId: string | undefined,
  faceDescriptor?: Float32Array,
  parentContactInfo?: {
    phone?: string;
    parent_name?: string;
    parent_email?: string;
    parent_phone?: string;
    student_email?: string;
    roll_number?: string;
    blood_group?: string;
    medical_info?: string;
    transport_mode?: string;
    class_section?: string;
    address?: string;
  },
  category?: string,
  faceModel?: {
    sample_count: number;
    capture_mode: 'auto-10' | 'scan-3d';
    storage_model_path?: string;
    id_card_photo_url?: string;
  }
): Promise<any> => {
  try {
    console.log('Starting face registration process', {
      name,
      employee_id,
      department,
      position,
      hasDescriptor: !!faceDescriptor
    });
    
    let faceDescriptorString: string | null = null;
    
    if (!imageBlob || imageBlob.size === 0) {
      console.error('Invalid image blob provided');
      throw new Error('Invalid image: The image blob is empty or invalid');
    }
    
    if (!faceDescriptor) {
      console.warn('No face descriptor provided for registration. This may limit face recognition capabilities.');
    }
    
    // Create a proper File object from the blob
    const uniqueId = uuidv4();
    const file = new File([imageBlob], `face_${uniqueId}.jpg`, { type: 'image/jpeg' });

    // Per-student folder so each student's photos live together in storage.
    const folderId = (employee_id || userId || 'unassigned')
      .toString()
      .replace(/[^a-zA-Z0-9_-]/g, '_');
    const filePath = `students/${folderId}/register_${uniqueId}.jpg`;
    console.log('Uploading with path:', filePath);
    
    // Always store registration images in Lovable Cloud storage
    const imageUrl = await uploadImage(file, filePath);
    console.log('Face image uploaded successfully:', imageUrl);
    
    // Also save the same face in organized registration-training storage hierarchy
    const registrationTrainingPath = await uploadRegistrationTrainingImage({
      imageBlob,
      studentId: employee_id || userId || uniqueId,
      employeeId: employee_id,
      category,
      label: 'registration-primary',
    });

    // Prepare metadata as a plain object that conforms to Json type
    const metadata: Record<string, any> = {
      name,
      employee_id,
      department,
      position,
      firebase_image_url: imageUrl,
      training_registration_path: registrationTrainingPath,
    };

    if (faceDescriptor) {
      faceDescriptorString = descriptorToString(faceDescriptor);
      console.log('Descriptor converted to string, length:', faceDescriptorString.length);
      metadata.faceDescriptor = faceDescriptorString;
    }

    if (faceModel) {
      metadata.face_model = {
        ...faceModel,
        created_at: new Date().toISOString(),
      };
    }
    
    // Create device info as a plain object that conforms to Json type
    const deviceInfo: Record<string, any> = {
      type: 'webcam',
      registration: 'true', // Must be string for RLS policy check
      metadata: {
        ...metadata,
        ...parentContactInfo
      },
      timestamp: new Date().toISOString()
    };

    console.log('Inserting attendance record with metadata');
    
    // Get authenticated user if available (fallback only)
    const { data: { user } } = await supabase.auth.getUser();

    // Avoid duplicate registration rows for the same admission number.
    // If an existing "registered" row exists, refresh it instead of inserting a new one.
    let existingRegistrationId: string | null = null;
    let existingRegistrationUserId: string | null = null;
    if (employee_id?.trim()) {
      const { data: existingRegistration } = await supabase
        .from('attendance_records')
        .select('id, user_id')
        .eq('status', 'registered')
        .eq('student_id', employee_id.trim())
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      existingRegistrationId = existingRegistration?.id ?? null;
      existingRegistrationUserId = existingRegistration?.user_id ?? null;
    }

    // Use a stable student identity id.
    // Priority: existing student record -> passed student id -> auth user (fallback)
    const stableStudentUserId = existingRegistrationUserId || userId || user?.id || null;
    console.log('Using stable student user ID:', stableStudentUserId);

    // Insert/update registration record
    const insertData: Record<string, any> = {
      timestamp: new Date().toISOString(),
      status: 'registered',
      source: 'registration',
      capture_mode: faceModel?.capture_mode ?? 'scan-3d',
      class: (parentContactInfo?.class_section || department || null),
      section: null,
      student_name: name,
      student_id: employee_id || null,
      device_info: deviceInfo,
      image_url: imageUrl,
      face_descriptor: faceDescriptorString,
      category: category || 'A'
    };
    
    // Only include user_id if we have one
    if (stableStudentUserId) {
      insertData.user_id = stableStudentUserId;
    }

    let recordData: any = null;
    let recordError: any = null;

    if (existingRegistrationId) {
      const { data: updated, error: updateError } = await supabase
        .from('attendance_records')
        .update(insertData)
        .eq('id', existingRegistrationId)
        .select()
        .single();

      recordData = updated;
      recordError = updateError;
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from('attendance_records')
        .insert(insertData)
        .select()
        .single();

      recordData = inserted;
      recordError = insertError;
    }

    if (recordError) {
      console.error('Error inserting attendance record:', recordError);
      throw new Error(`Error inserting attendance record: ${recordError.message}`);
    }

    // ── Write to face_descriptors so the recognition engine and admin UI see this student ──
    // Each student must have their OWN stable user_id in face_descriptors.
    // We CANNOT use effectiveUserId (the admin's auth UUID) because all students
    // registered in one session would share that UUID, collapsing them into one
    // identity inside getAllTrainedDescriptors() which groups by user_id.
    let descriptorUserIdUsed: string | null = null;
    if (faceDescriptorString) {
      const studentEmployeeId = employee_id?.trim() || null;

      // 1. Look for an existing face_descriptors row for this student (by student_id)
      let existingFdId: string | null = null;
      let existingFdUserId: string | null = null;
      if (studentEmployeeId) {
        const { data: existingFd } = await supabase
          .from('face_descriptors')
          .select('id, user_id')
          .eq('student_id', studentEmployeeId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        existingFdId = existingFd?.id ?? null;
        existingFdUserId = existingFd?.user_id ?? null;
      }

      // 2. Generate a stable per-student UUID (reuse existing, or create fresh)
      //    Never use the admin's effectiveUserId here.
      const studentDescriptorUserId = existingFdUserId ?? stableStudentUserId ?? uuidv4();
      descriptorUserIdUsed = studentDescriptorUserId;

      // Normalised class scope — "6-A" → class "6", section "A".
      const rawCategory = String(category || parentContactInfo?.class_section || '').trim();
      const catMatch = rawCategory.match(/^(\d+)\s*-\s*([A-Da-d])$/);
      const normalizedCategory = catMatch ? `${catMatch[1]}-${catMatch[2].toUpperCase()}` : (rawCategory || null);

      const fdPayload: Record<string, any> = {
        user_id: studentDescriptorUserId,
        descriptor: faceDescriptorString,
        image_url: imageUrl,
        label: name,                 // DescriptorCacheService primary name field
        student_id: studentEmployeeId,
        student_name: name,
        class: catMatch ? catMatch[1] : null,
        section: catMatch ? catMatch[2].toUpperCase() : null,
        category: normalizedCategory,
        metadata: {
          ...metadata,
          ...parentContactInfo,
          category: normalizedCategory || 'A',
        },
      };

      let fdErr: any = null;
      if (existingFdId) {
        const { error } = await supabase
          .from('face_descriptors')
          .update(fdPayload)
          .eq('id', existingFdId);
        fdErr = error;
      } else {
        const { error } = await supabase
          .from('face_descriptors')
          .insert(fdPayload);
        fdErr = error;
      }

      if (fdErr) {
        console.warn('face_descriptors write failed (non-fatal):', fdErr.message);
      } else {
        console.log('face_descriptors written for', name, '(userId:', studentDescriptorUserId, ')');
      }
    }

    const enrichedRecordData = {
      ...recordData,
      registration_user_id: stableStudentUserId,
      descriptor_user_id: descriptorUserIdUsed ?? stableStudentUserId,
    };

    console.log('Registration completed successfully:', enrichedRecordData);
    return enrichedRecordData;
  } catch (error: any) {
    console.error('Face registration failed:', error);
    throw error;
  }
};

export const uploadFaceImage = async (imageBlob: Blob): Promise<string> => {
  try {
    console.log('Starting face image upload, blob size:', imageBlob.size);
    
    // Validate the blob
    if (!imageBlob || imageBlob.size === 0) {
      throw new Error('Invalid image: The image blob is empty or invalid');
    }
    
    // Create a unique filename
    const uniqueId = uuidv4();
    const file = new File([imageBlob], `face_${uniqueId}.jpg`, { type: 'image/jpeg' });
    const filePath = `${uniqueId}.jpg`;
    
    console.log('Uploading image as:', filePath);
    
    // Use our storage service upload function with 'public' bucket only
    const publicUrl = await uploadImage(file, filePath);
    console.log('Image uploaded successfully:', publicUrl);
    return publicUrl;
  } catch (error) {
    console.error('Error uploading face image:', error);
    throw error;
  }
};

// Store unrecognized face
export const storeUnrecognizedFace = async (imageData: string): Promise<void> => {
  try {
    console.log('Storing unrecognized face');
    
    // Convert base64 image data to a Blob
    const response = await fetch(imageData);
    const blob = await response.blob();
    
    if (!blob || blob.size === 0) {
      console.error('Failed to convert image data to blob');
      return;
    }
    
    // Always store unrecognized captures in Lovable Cloud storage
    const imageUrl = await uploadFaceImage(blob);
    
    // Create a device info object with the current timestamp as a plain object
    const deviceInfo: Record<string, any> = {
      type: 'webcam',
      userAgent: navigator.userAgent,
      timestamp: new Date().toISOString(),
      firebase_image_url: imageUrl,
    };
    
    // Insert a record with status "unauthorized"
    const { error } = await supabase
      .from('attendance_records')
      .insert({
        user_id: null, // No user associated
        status: 'unauthorized',
        device_info: deviceInfo,
        image_url: imageUrl,
      });
    
    if (error) {
      console.error('Error storing unrecognized face:', error);
    } else {
      console.log('Unrecognized face stored successfully');
    }
  } catch (error) {
    console.error('Failed to store unrecognized face:', error);
  }
};
