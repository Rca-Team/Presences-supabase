
import { supabase } from '@/integrations/supabase/client';
import { FaceInfo } from './types';

// Fetch face details from Supabase
export const fetchSelectedFace = async (faceId: string): Promise<FaceInfo> => {
  try {
    const { data, error } = await supabase
      .from('attendance_records')
      .select('device_info, user_id')
      .eq('id', faceId)
      .single();
        
    if (error) {
      console.error('Error fetching face details from attendance_records:', error);
      
      const { data: userData, error: userError } = await supabase
        .from('attendance_records')
        .select('device_info')
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
        if (deviceInfo && typeof deviceInfo === 'object' && !Array.isArray(deviceInfo)) {
          const metadata = deviceInfo.metadata && typeof deviceInfo.metadata === 'object' && !Array.isArray(deviceInfo.metadata) 
            ? deviceInfo.metadata 
            : {};
          
          return {
            recordId: faceId,
            name: metadata.name || 'Unknown Student',
            employee_id: metadata.employee_id || faceId,
            department: metadata.department || 'N/A',
            position: metadata.position || 'Student',
          };
        }
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
      if (deviceInfo && typeof deviceInfo === 'object' && !Array.isArray(deviceInfo)) {
        const metadata = deviceInfo.metadata && typeof deviceInfo.metadata === 'object' && !Array.isArray(deviceInfo.metadata) 
          ? deviceInfo.metadata 
          : {};

        let profileAdmission: string | undefined;
        if (data.user_id) {
          const { data: profileRow } = await supabase
            .from('profiles')
            .select('admission_number')
            .eq('user_id', data.user_id)
            .maybeSingle();
          profileAdmission = (profileRow as any)?.admission_number || undefined;
        }
        
        return {
          recordId: faceId,
          user_id: data.user_id,
          name: metadata.name || 'Unknown Student',
          class: metadata.class || '',
          section: metadata.section || '',
          employee_id: metadata.employee_id || data.user_id || faceId,
          admission_number: profileAdmission || metadata.admission_number || metadata.admission_no || '',
          department: metadata.department || 'N/A',
          position: metadata.position || 'Student',
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
        user_id: data.user_id,
        name: 'Unknown Student',
        employee_id: data.user_id || faceId,
        department: 'N/A',
        position: 'Student'
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
