
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
      return '08:00'; // Default cutoff time (8:00 AM)
    }

    if (data && data.value) {
      // Handle the value as a string (since it's stored as TEXT in the database)
      const value = data.value;
      const resolved = typeof value === 'string' ? value : '08:00';
      cutoffTimeCache = {
        value: resolved,
        expiresAt: Date.now() + CUTOFF_CACHE_TTL_MS,
      };
      return resolved;
    }

    cutoffTimeCache = {
      value: '08:00',
      expiresAt: Date.now() + CUTOFF_CACHE_TTL_MS,
    };
    return '08:00'; // Default cutoff time if no data
  } catch (error) {
    console.error('Error in getCutoffTime:', error);
    return '08:00'; // Default cutoff time
  }
};

/**
 * Invalidate cutoff cache so next read is immediate
 */
export const invalidateCutoffCache = () => {
  cutoffTimeCache = null;
};

// Real-time synchronization listeners to invalidate cache on any change across whole school
if (typeof window !== 'undefined') {
  window.addEventListener('presence:settings-updated', (e: Event) => {
    const custom = e as CustomEvent<{ key?: string }>;
    if (!custom.detail?.key || custom.detail.key === 'cutoff_time') {
      invalidateCutoffCache();
    }
  });

  supabase
    .channel('attendance_cutoff_service_sync')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_settings', filter: 'key=eq.cutoff_time' }, () => {
      invalidateCutoffCache();
    })
    .subscribe();
}

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

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('presence:settings-updated', { detail: { key: 'cutoff_time', value: time } }));
    window.dispatchEvent(new CustomEvent('presence:cutoff-time-changed', { detail: { time } }));
  }

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
      hour: parseInt(hourStr) || 8,
      minute: parseInt(minuteStr) || 0
    };
  } catch (error) {
    console.error('Error getting attendance cutoff time:', error);
    return { hour: 8, minute: 0 }; // Default to 8:00 AM
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

// ── Save Attendance Face Samples Setting (Real-Time) ─────────────────────────

const SAVE_SAMPLES_CACHE_TTL_MS = 60 * 1000;
let saveSamplesCache: { value: boolean; expiresAt: number } | null = null;
const LOCAL_STORAGE_KEY_SAVE_SAMPLES = 'presence:save_attendance_face_samples';

/**
 * Synchronously checks if saving attendance images as face samples is enabled.
 * Designed for sub-millisecond execution inside continuous video recognition loops.
 */
export const isSaveAttendanceFaceSamplesEnabledSync = (): boolean => {
  if (saveSamplesCache && saveSamplesCache.expiresAt > Date.now()) {
    return saveSamplesCache.value;
  }
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY_SAVE_SAMPLES);
      if (stored !== null) {
        const val = stored === 'true';
        saveSamplesCache = { value: val, expiresAt: Date.now() + SAVE_SAMPLES_CACHE_TTL_MS };
        return val;
      }
    } catch {}
  }
  return true; // Default enabled
};

/**
 * Get the save attendance face samples setting from the database
 */
export const getSaveAttendanceFaceSamples = async (): Promise<boolean> => {
  try {
    if (saveSamplesCache && saveSamplesCache.expiresAt > Date.now()) {
      return saveSamplesCache.value;
    }

    const { data, error } = await supabase
      .from('attendance_settings')
      .select('*')
      .eq('key', 'save_attendance_face_samples')
      .maybeSingle();

    if (error) {
      console.warn('Error fetching save_attendance_face_samples:', error.message);
      return isSaveAttendanceFaceSamplesEnabledSync();
    }

    let resolved = true; // default enabled
    if (data && data.value !== undefined && data.value !== null) {
      resolved = String(data.value).toLowerCase() === 'true' || data.value === true || data.value === 1 || data.value === '1';
    }

    saveSamplesCache = {
      value: resolved,
      expiresAt: Date.now() + SAVE_SAMPLES_CACHE_TTL_MS,
    };

    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY_SAVE_SAMPLES, String(resolved));
      } catch {}
    }

    return resolved;
  } catch (err) {
    console.error('Error in getSaveAttendanceFaceSamples:', err);
    return isSaveAttendanceFaceSamplesEnabledSync();
  }
};

/**
 * Update the save attendance face samples setting in database and broadcast in real time
 */
export const updateSaveAttendanceFaceSamples = async (enabled: boolean): Promise<boolean> => {
  const valueStr = enabled ? 'true' : 'false';

  saveSamplesCache = {
    value: enabled,
    expiresAt: Date.now() + SAVE_SAMPLES_CACHE_TTL_MS,
  };

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY_SAVE_SAMPLES, valueStr);
      window.dispatchEvent(new CustomEvent('presence:save-samples-setting-changed', { detail: { enabled } }));
    } catch {}
  }

  const { data, error } = await supabase
    .from('attendance_settings')
    .select('*')
    .eq('key', 'save_attendance_face_samples')
    .maybeSingle();

  if (error) {
    console.warn('Error checking save_attendance_face_samples setting:', error.message);
  }

  if (data) {
    const { error: updateError } = await supabase
      .from('attendance_settings')
      .update({ value: valueStr, updated_at: new Date().toISOString() })
      .eq('key', 'save_attendance_face_samples');

    if (updateError) {
      console.error('Error updating save_attendance_face_samples:', updateError);
      throw new Error(updateError.message);
    }
  } else {
    const { error: insertError } = await supabase
      .from('attendance_settings')
      .insert({ key: 'save_attendance_face_samples', value: valueStr });

    if (insertError) {
      console.error('Error inserting save_attendance_face_samples:', insertError);
      throw new Error(insertError.message);
    }
  }

  return true;
};
