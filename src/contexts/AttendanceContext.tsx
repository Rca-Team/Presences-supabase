
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
  const [recentAttendance, setRecentAttendance] = useState<AttendanceRecord[]>([]);

  const refreshAttendance = async () => {
    try {
      // Single fast batch query for the top 20 records
      const { data: attendanceData, error: attendanceError } = await supabase
        .from('attendance_records')
        .select(`
          id,
          status,
          timestamp,
          confidence_score,
          user_id,
          student_name,
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
        const processedRecords: AttendanceRecord[] = attendanceData.map((record: any) => {
          let username = record.student_name || 'Student';
          let photoUrl = record.image_url || '';
          
          if (record.device_info) {
            try {
              const deviceInfo = typeof record.device_info === 'string' 
                ? JSON.parse(record.device_info) 
                : record.device_info;
              
              if (deviceInfo?.metadata && typeof deviceInfo.metadata === 'object') {
                username = deviceInfo.metadata.name || username;
                photoUrl = deviceInfo.metadata.firebase_image_url || photoUrl;
              } else if (deviceInfo?.name) {
                username = deviceInfo.name;
              }
              
              if (!photoUrl && deviceInfo?.firebase_image_url) {
                photoUrl = deviceInfo.firebase_image_url;
              }
            } catch {
              // ignore json parse error
            }
          }
          
          const normalizedStatus = typeof record.status === 'string' 
            ? record.status.toLowerCase() 
            : 'unknown';
          
          let displayStatus = 'Unknown';
          if (normalizedStatus.includes('present') || normalizedStatus.includes('unauthorized')) {
            displayStatus = 'Present';
          } else if (normalizedStatus.includes('late')) {
            displayStatus = 'Late';
          } else if (normalizedStatus.includes('absent')) {
            displayStatus = 'Absent';
          }
          
          const recordDate = new Date(record.timestamp);
          
          return {
            id: record.id,
            name: username,
            date: recordDate.toISOString().split('T')[0],
            time: recordDate.toTimeString().substring(0, 5),
            status: displayStatus,
            timestamp: record.timestamp,
            user_id: record.user_id,
            image_url: photoUrl,
          };
        });
        
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
    
    let debounceTimer: any = null;
    const channel = supabase
      .channel('attendance_changes_light')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'attendance_records' 
      }, () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          if (document.visibilityState === 'visible') {
            refreshAttendance();
          }
        }, 1200);
      })
      .subscribe();
      
    // Only refresh every 60s if the tab is currently active and visible
    const intervalId = setInterval(() => {
      if (document.visibilityState === 'visible') {
        refreshAttendance();
      }
    }, 60000);
    
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
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
