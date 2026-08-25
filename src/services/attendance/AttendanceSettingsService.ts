
import { supabase } from '@/integrations/supabase/client';

const CUTOFF_CACHE_TTL_MS = 60 * 1000;
let cutoffTimeCache: { value: string; expiresAt: number } | null = null;

interface AttendanceSetting {
  key: string;
  value: unknown;
}

/**
 * Get the cutoff time for attendance from the settings table
 */
export const getCutoffTime = async (): Promise<string> => {
  try {
    if (cutoffTimeCache && cutoffTimeCache.expiresAt > Date.now()) {
      return cutoffTimeCache.value;
    }

    const { data, error } = await supabase
      .from('attendance_settings')
      .select('*')
      .eq('key', 'cutoff_time')
      .single();

    if (error) {
      console.error('Error fetching cutoff time:', error);
      return '09:00'; // Default cutoff time
    }

    if (data && data.value) {
      // Handle the value as a string (since it's stored as TEXT in the database)
      const value = data.value;
      const resolved = typeof value === 'string' ? value : '09:00';
      cutoffTimeCache = {
        value: resolved,
        expiresAt: Date.now() + CUTOFF_CACHE_TTL_MS,
      };
      return resolved;
    }

    cutoffTimeCache = {
      value: '09:00',
      expiresAt: Date.now() + CUTOFF_CACHE_TTL_MS,
    };
    return '09:00'; // Default cutoff time if no data
  } catch (error) {
    console.error('Error in getCutoffTime:', error);
    return '09:00'; // Default cutoff time
  }
};

/**
 * Update the cutoff time for attendance in the settings table
 */
export const updateCutoffTime = async (time: string): Promise<boolean> => {
  // First check if setting exists
  const { data, error } = await supabase
    .from('attendance_settings')
    .select('*')
    .eq('key', 'cutoff_time')
    .maybeSingle();

  if (error) {
    console.error('Error checking cutoff time setting:', error);
    throw new Error(error.message);
  }

  if (data) {
    const { error: updateError } = await supabase
      .from('attendance_settings')
      .update({ value: time, updated_at: new Date().toISOString() })
      .eq('key', 'cutoff_time');

    if (updateError) {
      console.error('Error updating cutoff time:', updateError);
      throw new Error(updateError.message);
    }
  } else {
    const { error: insertError } = await supabase
      .from('attendance_settings')
      .insert({ key: 'cutoff_time', value: time });

    if (insertError) {
      console.error('Error inserting cutoff time:', insertError);
      throw new Error(insertError.message);
    }
  }

  console.log('Cutoff time saved successfully:', time);
  cutoffTimeCache = {
    value: time,
    expiresAt: Date.now() + CUTOFF_CACHE_TTL_MS,
  };
  return true;
};

/**
 * Get the formatted cutoff time as hour and minute
 */
export const getAttendanceCutoffTime = async (): Promise<{ hour: number; minute: number }> => {
  try {
    const timeString = await getCutoffTime();
    const [hourStr, minuteStr] = timeString.split(':');
    return {
      hour: parseInt(hourStr) || 9,
      minute: parseInt(minuteStr) || 0
    };
  } catch (error) {
    console.error('Error getting attendance cutoff time:', error);
    return { hour: 9, minute: 0 }; // Default to 9:00 AM
  }
};

/**
 * Update the cutoff time with hour and minute
 */
export const updateAttendanceCutoffTime = async (hour: number, minute: number): Promise<boolean> => {
  const hourStr = hour.toString().padStart(2, '0');
  const minuteStr = minute.toString().padStart(2, '0');
  const timeString = `${hourStr}:${minuteStr}`;
  
  const result = await updateCutoffTime(timeString);
  if (!result) {
    throw new Error('Failed to save cutoff time. Make sure you have admin permissions.');
  }
  return true;
};

/**
 * Format the cutoff time into a human-readable string
 */
export const formatCutoffTime = (time: { hour: number; minute: number }): string => {
  const { hour, minute } = time;
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  const displayMinute = minute.toString().padStart(2, '0');
  return `${displayHour}:${displayMinute} ${period}`;
};

/**
 * Check if the current time is past the cutoff time
 */
export const isPastCutoffTime = (cutoffTime: { hour: number; minute: number }): boolean => {
  const now = new Date();
  const cutoffDate = new Date();
  cutoffDate.setHours(cutoffTime.hour, cutoffTime.minute, 0, 0);
  
  return now > cutoffDate;
};
