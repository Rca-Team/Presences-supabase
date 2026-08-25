
import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

type AttendanceRecord = {
  id: string;
  name: string;
  date: string;
  time: string;
  status: string;
  timestamp: string;
  user_id?: string;
  image_url?: string;
};

interface AttendanceContextType {
  recentAttendance: AttendanceRecord[];
  refreshAttendance: () => Promise<void>;
}

const AttendanceContext = createContext<AttendanceContextType | undefined>(undefined);

export const useAttendance = () => {
  const context = useContext(AttendanceContext);
  if (!context) {
    throw new Error('useAttendance must be used within an AttendanceProvider');
  }
  return context;
};

export const AttendanceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const db = supabase as any;
  const [recentAttendance, setRecentAttendance] = useState<AttendanceRecord[]>([]);

  const refreshAttendance = async () => {
    try {
      // First, get attendance records
      const { data: attendanceData, error: attendanceError } = await db
        .from('attendance_records')
        .select(`
          id,
          status,
          timestamp,
          confidence_score,
          user_id,
          device_info,
          image_url
        `)
        .order('timestamp', { ascending: false })
        .limit(20);
        
      if (attendanceError) {
        console.error('Error fetching recent attendance:', attendanceError);
        return;
      }
      
      if (attendanceData && attendanceData.length > 0) {
        // Process records similar to AttendanceToday component
        const processedRecords = await Promise.all(
          attendanceData.map(async (record) => {
            // Extract name from device_info or other sources
            let username = 'Unknown';
            let photoUrl = record.image_url || '';
            
            // Try to extract name from device_info
            if (record.device_info) {
              try {
                const deviceInfo = typeof record.device_info === 'string' 
                  ? JSON.parse(record.device_info) 
                  : record.device_info;
                
                // First check if metadata.name exists
                if (deviceInfo.metadata && typeof deviceInfo.metadata === 'object') {
                  username = deviceInfo.metadata.name || username;
                  photoUrl = deviceInfo.metadata.firebase_image_url || photoUrl;
                } 
                // If no metadata.name, check if name exists directly in deviceInfo
                else if (deviceInfo.name) {
                  username = deviceInfo.name;
                }
                
                // Look for photo URL
                if (!photoUrl && deviceInfo.firebase_image_url) {
                  photoUrl = deviceInfo.firebase_image_url;
                }
              } catch (e) {
                console.error('Error parsing device_info:', e);
              }
            }
            
            // If we couldn't find name in device_info, try other sources
            if (username === 'Unknown') {
              // Try to get from attendance_records where it's a registration record
              try {
                if (record.user_id) {
                  const { data: registrationData } = await db
                    .from('attendance_records')
                    .select('device_info')
                    .eq('status', 'registered')
                    .eq('user_id', record.user_id)
                    .maybeSingle();
                    
                  if (registrationData && registrationData.device_info) {
                    const regDeviceInfo = typeof registrationData.device_info === 'string'
                      ? JSON.parse(registrationData.device_info)
                      : registrationData.device_info;
                      
                    if (regDeviceInfo.metadata && regDeviceInfo.metadata.name) {
                      username = regDeviceInfo.metadata.name;
                      photoUrl = regDeviceInfo.metadata.firebase_image_url || photoUrl;
                    }
                  }
                }
              
                // If still unknown, try the profiles table
                if (username === 'Unknown' && record.user_id) {
                  const { data: profileData } = await db
                    .from('profiles')
                    .select('username, avatar_url')
                    .eq('id', record.user_id)
                    .maybeSingle();
                    
                  if (profileData && profileData.username) {
                    username = profileData.username;
                    photoUrl = profileData.avatar_url || photoUrl;
                  }
                }
              } catch (e) {
                console.error('Error fetching additional user data:', e);
              }
            }
            
            // Normalize status
            let normalizedStatus = typeof record.status === 'string' 
              ? record.status.toLowerCase() 
              : 'unknown';
            
            // Map to proper display status
            let displayStatus = 'Unknown';
            if (normalizedStatus.includes('present') || normalizedStatus.includes('unauthorized')) {
              displayStatus = 'Present';
              // Ensure the record is actually stored as 'present' for calendar consistency
              if (normalizedStatus === 'unauthorized') {
                try {
                  await db
                    .from('attendance_records')
                    .update({ status: 'present' })
                    .eq('id', record.id);
                } catch (e) {
                  console.error('Failed to update status:', e);
                }
              }
            } else if (normalizedStatus.includes('late')) {
              displayStatus = 'Late';
            } else if (normalizedStatus.includes('absent')) {
              displayStatus = 'Absent';
            }
            
            const recordDate = new Date(record.timestamp);
            
            return {
              id: record.id,
              name: username,
              date: recordDate.toISOString().split('T')[0], // YYYY-MM-DD format
              time: recordDate.toTimeString().substring(0, 5), // HH:MM format
              status: displayStatus,
              timestamp: record.timestamp,
              user_id: record.user_id,
              image_url: photoUrl // Pass the image URL to the component
            };
          })
        );
        
        setRecentAttendance(processedRecords);
      } else {
        setRecentAttendance([]);
      }
    } catch (error) {
      console.error('Error refreshing attendance:', error);
    }
  };

  useEffect(() => {
    refreshAttendance();
    
    // Set up real-time subscription
    const channel = supabase
      .channel('attendance_changes')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'attendance_records' 
      }, () => {
        refreshAttendance();
      })
      .subscribe();
      
    // Refresh every 30 seconds as a fallback
    const intervalId = setInterval(refreshAttendance, 30000);
    
    return () => {
      supabase.removeChannel(channel);
      clearInterval(intervalId);
    };
  }, []);

  return (
    <AttendanceContext.Provider value={{ recentAttendance, refreshAttendance }}>
      {children}
    </AttendanceContext.Provider>
  );
};
