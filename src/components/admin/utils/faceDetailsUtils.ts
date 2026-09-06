
import { supabase } from '@/integrations/supabase/client';
import { FaceInfo } from './types';

// Fetch face details from Supabase
export const fetchSelectedFace = async (faceId: string): Promise<FaceInfo> => {
  try {
    const { data, error } = await supabase
      .from('attendance_records')
      .select('device_info, user_id, image_url, category')
      .eq('id', faceId)
      .single();
        
    if (error) {
      console.error('Error fetching face details from attendance_records:', error);
      
      const { data: userData, error: userError } = await supabase
        .from('attendance_records')
        .select('device_info, image_url, category')
        .eq('user_id', faceId)
        .single();
        
      if (userError) {
        console.error('Error fetching face details by user_id:', userError);
        
        return {
          recordId: faceId,
          name: 'Unknown Student',
          employee_id: faceId,
          department: 'N/A',
          position: 'Student'
        };
      }
      
      if (userData) {
        const deviceInfo = userData.device_info as any;
        const metadata = deviceInfo && typeof deviceInfo === 'object' && !Array.isArray(deviceInfo)
          ? deviceInfo.metadata || deviceInfo
          : {};

        const deptStr = String(metadata.department || metadata.class_section || userData.category || '');
        const deptMatch = deptStr.match(/^(\d{1,2})\s*[-/]?\s*([A-Za-z])$/);

        const imgCandidate = metadata?.face_model?.id_card_photo_url ||
          metadata?.id_card_photo_url ||
          metadata?.firebase_image_url ||
          metadata?.avatar_url ||
          metadata?.photo_url ||
          userData.image_url ||
          undefined;
        
        return {
          recordId: faceId,
          user_id: faceId,
          name: metadata.name || 'Unknown Student',
          class: metadata.class || (deptMatch ? deptMatch[1] : ''),
          section: metadata.section || (deptMatch ? deptMatch[2].toUpperCase() : ''),
          employee_id: metadata.employee_id || faceId,
          department: metadata.department || userData.category || 'N/A',
          position: metadata.position || 'Student',
          image_url: imgCandidate,
          roll_number: metadata.roll_number || '',
          blood_group: metadata.blood_group || '',
          parent_name: metadata.parent_name || '',
          parent_phone: metadata.parent_phone || metadata.phone || '',
          parent_email: metadata.parent_email || '',
          transport_mode: metadata.transport_mode || '',
          address: metadata.address || '',
        };
      }
      
      return {
        recordId: faceId,
        name: 'Unknown Student',
        employee_id: faceId,
        department: 'N/A',
        position: 'Student'
      };
    }

    if (data) {
      const deviceInfo = data.device_info as any;
      const metadata = deviceInfo && typeof deviceInfo === 'object' && !Array.isArray(deviceInfo)
        ? deviceInfo.metadata || deviceInfo
        : {};

      let profileAdmission: string | undefined;
      let profileAvatar: string | undefined;
      if (data.user_id) {
        const { data: profileRow } = await supabase
          .from('profiles')
          .select('admission_number, avatar_url, photo_url')
          .eq('user_id', data.user_id)
          .maybeSingle();
        profileAdmission = (profileRow as any)?.admission_number || undefined;
        profileAvatar = (profileRow as any)?.avatar_url || (profileRow as any)?.photo_url || undefined;
      }

      const deptStr = String(metadata.department || metadata.class_section || data.category || '');
      const deptMatch = deptStr.match(/^(\d{1,2})\s*[-/]?\s*([A-Za-z])$/);

      const resolvedPhoto = profileAvatar ||
        metadata?.face_model?.id_card_photo_url ||
        metadata?.id_card_photo_url ||
        metadata?.firebase_image_url ||
        metadata?.avatar_url ||
        metadata?.photo_url ||
        data.image_url ||
        undefined;
      
      return {
        recordId: faceId,
        user_id: data.user_id,
        name: metadata.name || 'Unknown Student',
        class: metadata.class || (deptMatch ? deptMatch[1] : ''),
        section: metadata.section || (deptMatch ? deptMatch[2].toUpperCase() : ''),
        employee_id: metadata.employee_id || data.user_id || faceId,
        admission_number: profileAdmission || metadata.admission_number || metadata.admission_no || '',
        department: metadata.department || data.category || 'N/A',
        position: metadata.position || 'Student',
        image_url: resolvedPhoto,
        roll_number: metadata.roll_number || '',
        blood_group: metadata.blood_group || '',
        parent_name: metadata.parent_name || '',
        parent_phone: metadata.parent_phone || metadata.phone || '',
        parent_email: metadata.parent_email || '',
        transport_mode: metadata.transport_mode || '',
        address: metadata.address || '',
      };
    }
    
    return {
      recordId: faceId,
      name: 'Unknown Student',
      employee_id: faceId,
      department: 'N/A',
      position: 'Student'
    };
  } catch (error) {
    console.error('Error fetching face details:', error);
    
    return {
      recordId: faceId,
      name: 'Unknown Student',
      employee_id: faceId,
      department: 'N/A',
      position: 'Student'
    };
  }
};
