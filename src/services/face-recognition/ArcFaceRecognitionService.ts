import { supabase } from '@/integrations/supabase/client';
import { compareEmbeddings } from './RetinaFaceService';

export interface RecognitionResult {
  recognized: boolean;
  userId?: string;
  userName?: string;
  userAvatar?: string;
  confidence: number;
  status?: 'present' | 'late' | 'absent' | 'unauthorized';
}

const RECOGNITION_THRESHOLD = 0.6; // ArcFace typically uses 0.6 threshold for cosine similarity

/**
 * Recognize a face by comparing its embedding with stored embeddings
 */
export async function recognizeFace(embedding: Float32Array): Promise<RecognitionResult> {
  try {
    // Fetch all registered face descriptors
    const { data: faceDescriptors, error } = await supabase
      .from('face_descriptors')
      .select('*');
    
    if (error) throw error;
    
    if (!faceDescriptors || faceDescriptors.length === 0) {
      return {
        recognized: false,
        confidence: 0,
        status: 'unauthorized'
      };
    }
    
    let bestMatch: any = null;
    let bestSimilarity = -1;
    
    // Compare with all stored embeddings
    for (const descriptor of faceDescriptors) {
      const storedEmbedding = stringToEmbedding(descriptor.descriptor);
      const similarity = compareEmbeddings(embedding, storedEmbedding);
      
      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestMatch = descriptor;
      }
    }
    
    // Check if the best match exceeds the threshold
    if (bestSimilarity >= RECOGNITION_THRESHOLD) {
      // Fetch user details
      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name, avatar_url')
        .eq('user_id', bestMatch.user_id)
        .single();
      
      return {
        recognized: true,
        userId: bestMatch.user_id,
        userName: profile?.display_name || 'Unknown',
        userAvatar: profile?.avatar_url,
        confidence: bestSimilarity,
        status: 'present' // Will be adjusted based on cutoff time
      };
    }
    
    return {
      recognized: false,
      confidence: bestSimilarity,
      status: 'unauthorized'
    };
  } catch (error) {
    console.error('Face recognition error:', error);
    throw error;
  }
}

/**
 * Store a face embedding for a user
 */
export async function registerFaceEmbedding(
  userId: string,
  embedding: Float32Array,
  imageUrl?: string
): Promise<void> {
  try {
    const embeddingString = embeddingToString(embedding);
    
    const { error } = await supabase
      .from('face_descriptors')
      .insert({
        user_id: userId,
        descriptor: embeddingString,
        image_url: imageUrl,
        confidence_score: 1.0
      });
    
    if (error) throw error;
  } catch (error) {
    console.error('Error registering face embedding:', error);
    throw error;
  }
}

/**
 * Convert embedding array to string for storage
 */
function embeddingToString(embedding: Float32Array): string {
  return JSON.stringify(Array.from(embedding));
}

/**
 * Convert stored string back to embedding array
 */
function stringToEmbedding(embeddingData: unknown): Float32Array {
  const embeddingString = typeof embeddingData === 'string' 
    ? embeddingData 
    : JSON.stringify(embeddingData);
  const array = JSON.parse(embeddingString);
  return new Float32Array(array);
}

/**
 * Record attendance for a recognized face
 */
export async function recordAttendance(
  userId: string,
  status: 'present' | 'late' | 'absent' | 'unauthorized',
  confidence: number,
  imageUrl?: string
): Promise<any> {
  try {
    const { data, error } = await supabase
      .from('attendance_records')
      .insert({
        user_id: userId,
        status,
        confidence_score: confidence,
        image_url: imageUrl,
        timestamp: new Date().toISOString()
      })
      .select()
      .single();
    
    if (error) throw error;
    
    return data;
  } catch (error) {
    console.error('Error recording attendance:', error);
    throw error;
  }
}
