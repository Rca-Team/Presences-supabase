import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface NotificationChannels {
  email: boolean;
  inapp: boolean;
  sms: boolean;
  whatsapp: boolean;
}

export interface SchoolSettings {
  // Attendance & Timing
  cutoffTime: string;
  saveFaceSamples: boolean;
  requireScanConfirmation: boolean;

  // Pilot Rollout
  pilotEnabled: boolean;
  pilotClass: string;
  pilotSection: string;

  // Notifications
  oneStudentOneEmail: boolean;
  notifyChannels: NotificationChannels;
  twilioSid: string;
  twilioToken: string;
  twilioFrom: string;
  msgTemplatePresent: string;
  msgTemplateLate: string;
  msgTemplateAbsent: string;

  // AI & Model
  faceModelPreferred: 'ssd' | 'tiny';
  faceModelAllowFallback: boolean;
}

export const DEFAULT_SETTINGS: SchoolSettings = {
  cutoffTime: '08:00',
  saveFaceSamples: true,
  requireScanConfirmation: true,
  pilotEnabled: false,
  pilotClass: '8',
  pilotSection: 'A',
  oneStudentOneEmail: true,
  notifyChannels: {
    email: true,
    inapp: true,
    sms: false,
    whatsapp: false,
  },
  twilioSid: '',
  twilioToken: '',
  twilioFrom: '',
  msgTemplatePresent: 'Dear Parent, your child {student_name} has arrived at school at {time}.',
  msgTemplateLate: 'Dear Parent, your child {student_name} arrived late at school at {time}.',
  msgTemplateAbsent: 'Dear Parent, your child {student_name} was marked absent today.',
  faceModelPreferred: 'ssd',
  faceModelAllowFallback: true,
};

/**
 * useRealtimeSettings
 * Provides live, synchronized school settings across all admin devices, cameras, and gate terminals.
 */
export function useRealtimeSettings() {
  const [settings, setSettings] = useState<SchoolSettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date>(new Date());
  const pendingUpdatesRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Parse raw key-values from Supabase table into SchoolSettings object
  const parseRowsIntoSettings = useCallback((rows: Array<{ key: string; value: string | null }>): SchoolSettings => {
    const map = new Map<string, string>();
    rows.forEach(r => {
      if (r.key && r.value !== null && r.value !== undefined) {
        map.set(r.key, String(r.value));
      }
    });

    let channels: NotificationChannels = { ...DEFAULT_SETTINGS.notifyChannels };
    const rawChannels = map.get('notify_channels');
    if (rawChannels) {
      try {
        const parsed = JSON.parse(rawChannels);
        channels = {
          email: parsed.email ?? true,
          inapp: parsed.inapp ?? true,
          sms: parsed.sms ?? false,
          whatsapp: parsed.whatsapp ?? false,
        };
      } catch {
        /* keep default */
      }
    }

    const parseBool = (val: string | undefined, def: boolean): boolean => {
      if (!val) return def;
      const lower = val.toLowerCase().trim();
      return lower === 'true' || lower === '1' || lower === 'enabled';
    };

    return {
      cutoffTime: map.get('cutoff_time') || DEFAULT_SETTINGS.cutoffTime,
      saveFaceSamples: parseBool(map.get('save_attendance_face_samples'), DEFAULT_SETTINGS.saveFaceSamples),
      requireScanConfirmation: parseBool(map.get('require_scan_confirmation'), DEFAULT_SETTINGS.requireScanConfirmation),
      pilotEnabled: parseBool(map.get('pilot_enabled'), DEFAULT_SETTINGS.pilotEnabled),
      pilotClass: map.get('pilot_class') || DEFAULT_SETTINGS.pilotClass,
      pilotSection: map.get('pilot_section') || DEFAULT_SETTINGS.pilotSection,
      oneStudentOneEmail: parseBool(map.get('one_student_one_email_per_day'), DEFAULT_SETTINGS.oneStudentOneEmail),
      notifyChannels: channels,
      twilioSid: map.get('twilio_account_sid') || '',
      twilioToken: map.get('twilio_auth_token') || '',
      twilioFrom: map.get('twilio_from_number') || '',
      msgTemplatePresent: map.get('msg_template_present') || DEFAULT_SETTINGS.msgTemplatePresent,
      msgTemplateLate: map.get('msg_template_late') || DEFAULT_SETTINGS.msgTemplateLate,
      msgTemplateAbsent: map.get('msg_template_absent') || DEFAULT_SETTINGS.msgTemplateAbsent,
      faceModelPreferred: map.get('face_model_preferred') === 'tiny' ? 'tiny' : 'ssd',
      faceModelAllowFallback: parseBool(map.get('face_model_allow_fallback'), DEFAULT_SETTINGS.faceModelAllowFallback),
    };
  }, []);

  // Fetch initial settings from attendance_settings
  const fetchSettings = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('attendance_settings')
        .select('key, value');

      if (error) {
        console.warn('[useRealtimeSettings] Failed to fetch settings:', error);
        return;
      }

      if (data) {
        setSettings(parseRowsIntoSettings(data));
        setLastSyncedAt(new Date());
      }
    } catch (err) {
      console.error('[useRealtimeSettings] Error loading settings:', err);
    } finally {
      setIsLoading(false);
    }
  }, [parseRowsIntoSettings]);

  // Upsert helper with single-roundtrip Supabase operation
  const upsertSettingToSupabase = useCallback(async (key: string, value: string): Promise<boolean> => {
    try {
      const { data: existing } = await supabase
        .from('attendance_settings')
        .select('id')
        .eq('key', key)
        .maybeSingle();

      if (existing?.id) {
        const { error } = await supabase
          .from('attendance_settings')
          .update({ value, updated_at: new Date().toISOString() })
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('attendance_settings')
          .insert({ key, value });
        if (error) throw error;
      }
      return true;
    } catch (err) {
      console.error(`[useRealtimeSettings] Failed to save setting "${key}":`, err);
      return false;
    }
  }, []);

  // Save with optimistic update + debounce
  const updateSetting = useCallback((key: string, rawValue: string, optimisticUpdate: (prev: SchoolSettings) => SchoolSettings) => {
    // 1. Instant local UI response
    setSettings(optimisticUpdate);
    setIsSaving(true);

    // 2. Clear existing timer for this key if rapid typing/clicking
    if (pendingUpdatesRef.current.has(key)) {
      clearTimeout(pendingUpdatesRef.current.get(key));
    }

    // 3. Debounce network upsert
    const timer = setTimeout(async () => {
      pendingUpdatesRef.current.delete(key);
      const success = await upsertSettingToSupabase(key, rawValue);
      if (success) {
        setLastSyncedAt(new Date());
        // Broadcast custom events for non-react services
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('presence:settings-updated', {
            detail: { key, value: rawValue }
          }));
          if (key === 'save_attendance_face_samples') {
            window.dispatchEvent(new CustomEvent('presence:save-samples-setting-changed', {
              detail: { enabled: rawValue === 'true' }
            }));
          }
        }
      }
      if (pendingUpdatesRef.current.size === 0) {
        setIsSaving(false);
      }
    }, 250);

    pendingUpdatesRef.current.set(key, timer);
  }, [upsertSettingToSupabase]);

  // Convenience Setters
  const setCutoffTime = useCallback((time: string) => {
    updateSetting('cutoff_time', time, prev => ({ ...prev, cutoffTime: time }));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('presence:cutoff-time-changed', { detail: { time } }));
    }
    toast.success('Cutoff Time Updated', {
      description: `Arrivals after ${time} will be flagged as late. (Realtime updated across school)`,
    });
  }, [updateSetting]);

  const setSaveFaceSamples = useCallback((enabled: boolean) => {
    updateSetting('save_attendance_face_samples', String(enabled), prev => ({ ...prev, saveFaceSamples: enabled }));
    toast.info(enabled ? 'Face Photo Captures Enabled' : 'Face Photo Captures Paused', {
      description: enabled
        ? 'High-confidence attendance faces will be saved to student profiles.'
        : 'Attendance is marked without saving face image files.',
    });
  }, [updateSetting]);

  const setPilotMode = useCallback((enabled: boolean, targetClass?: string, targetSection?: string) => {
    updateSetting('pilot_enabled', String(enabled), prev => ({
      ...prev,
      pilotEnabled: enabled,
      pilotClass: targetClass !== undefined ? targetClass : prev.pilotClass,
      pilotSection: targetSection !== undefined ? targetSection : prev.pilotSection,
    }));

    if (targetClass !== undefined) {
      updateSetting('pilot_class', targetClass, prev => ({ ...prev, pilotClass: targetClass }));
    }
    if (targetSection !== undefined) {
      updateSetting('pilot_section', targetSection, prev => ({ ...prev, pilotSection: targetSection }));
    }

    toast.success(enabled ? 'Pilot Mode Activated' : 'Pilot Mode Disabled', {
      description: enabled
        ? `Parent notifications restricted to Class ${targetClass || settings.pilotClass}-${targetSection || settings.pilotSection}.`
        : 'Attendance notifications are now active for all classes.',
    });
  }, [updateSetting, settings.pilotClass, settings.pilotSection]);

  const setPilotClass = useCallback((klass: string) => {
    updateSetting('pilot_class', klass, prev => ({ ...prev, pilotClass: klass }));
  }, [updateSetting]);

  const setPilotSection = useCallback((sec: string) => {
    updateSetting('pilot_section', sec, prev => ({ ...prev, pilotSection: sec }));
  }, [updateSetting]);

  const setOneStudentOneEmail = useCallback((enabled: boolean) => {
    updateSetting('one_student_one_email_per_day', String(enabled), prev => ({ ...prev, oneStudentOneEmail: enabled }));
    toast.info(enabled ? 'Daily Rate Limit Active' : 'Rate Limit Disabled', {
      description: enabled
        ? 'Parents receive maximum 1 email per student per day.'
        : 'Emails sent on every verified scan.',
    });
  }, [updateSetting]);

  const setNotifyChannel = useCallback((channel: keyof NotificationChannels, enabled: boolean) => {
    setSettings(prev => {
      const updatedChannels = { ...prev.notifyChannels, [channel]: enabled };
      updateSetting('notify_channels', JSON.stringify(updatedChannels), p => ({
        ...p,
        notifyChannels: updatedChannels,
      }));
      return { ...prev, notifyChannels: updatedChannels };
    });
    toast.success(`${channel.toUpperCase()} Alerts ${enabled ? 'Enabled' : 'Disabled'}`);
  }, [updateSetting]);

  const setFaceModelStrategy = useCallback((preferred: 'ssd' | 'tiny', allowFallback?: boolean) => {
    const fallback = allowFallback !== undefined ? allowFallback : settings.faceModelAllowFallback;
    updateSetting('face_model_preferred', preferred, prev => ({
      ...prev,
      faceModelPreferred: preferred,
      faceModelAllowFallback: fallback,
    }));
    if (allowFallback !== undefined) {
      updateSetting('face_model_allow_fallback', String(allowFallback), prev => ({
        ...prev,
        faceModelAllowFallback: allowFallback,
      }));
    }
    toast.success('Face AI Strategy Updated', {
      description: `Preferred detector: ${preferred === 'ssd' ? 'SSD MobileNet (High Accuracy)' : 'TinyFace (Fast Mode)'}.`,
    });
  }, [updateSetting, settings.faceModelAllowFallback]);

  const setTwilioConfig = useCallback((updates: { sid?: string; token?: string; from?: string }) => {
    if (updates.sid !== undefined) {
      updateSetting('twilio_account_sid', updates.sid, prev => ({ ...prev, twilioSid: updates.sid! }));
    }
    if (updates.token !== undefined) {
      updateSetting('twilio_auth_token', updates.token, prev => ({ ...prev, twilioToken: updates.token! }));
    }
    if (updates.from !== undefined) {
      updateSetting('twilio_from_number', updates.from, prev => ({ ...prev, twilioFrom: updates.from! }));
    }
  }, [updateSetting]);

  const setMessageTemplate = useCallback((type: 'present' | 'late' | 'absent', text: string) => {
    const key = `msg_template_${type}`;
    updateSetting(key, text, prev => {
      if (type === 'present') return { ...prev, msgTemplatePresent: text };
      if (type === 'late') return { ...prev, msgTemplateLate: text };
      return { ...prev, msgTemplateAbsent: text };
    });
  }, [updateSetting]);

  // Set up Realtime Postgres Subscription
  useEffect(() => {
    fetchSettings();

    const channel = supabase
      .channel('attendance_settings_master_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'attendance_settings' },
        (payload: any) => {
          const row = payload.new;
          if (!row || !row.key) return;

          const key = row.key as string;
          const val = row.value !== null && row.value !== undefined ? String(row.value) : '';

          setSettings(prev => {
            const next = { ...prev };
            const lower = val.toLowerCase().trim();
            const asBool = lower === 'true' || lower === '1' || lower === 'enabled';

            if (key === 'cutoff_time') {
              next.cutoffTime = val || '08:00';
              if (typeof window !== 'undefined' && val) {
                window.dispatchEvent(new CustomEvent('presence:cutoff-time-changed', { detail: { time: val } }));
              }
            }
            else if (key === 'save_attendance_face_samples') next.saveFaceSamples = asBool;
            else if (key === 'pilot_enabled') next.pilotEnabled = asBool;
            else if (key === 'pilot_class') next.pilotClass = val || '8';
            else if (key === 'pilot_section') next.pilotSection = val || 'A';
            else if (key === 'one_student_one_email_per_day') next.oneStudentOneEmail = asBool;
            else if (key === 'face_model_preferred') next.faceModelPreferred = val === 'tiny' ? 'tiny' : 'ssd';
            else if (key === 'face_model_allow_fallback') next.faceModelAllowFallback = asBool;
            else if (key === 'require_scan_confirmation') next.requireScanConfirmation = asBool;
            else if (key === 'twilio_account_sid') next.twilioSid = val;
            else if (key === 'twilio_auth_token') next.twilioToken = val;
            else if (key === 'twilio_from_number') next.twilioFrom = val;
            else if (key === 'msg_template_present') next.msgTemplatePresent = val;
            else if (key === 'msg_template_late') next.msgTemplateLate = val;
            else if (key === 'msg_template_absent') next.msgTemplateAbsent = val;
            else if (key === 'notify_channels') {
              try {
                const parsed = JSON.parse(val);
                next.notifyChannels = {
                  email: parsed.email ?? true,
                  inapp: parsed.inapp ?? true,
                  sms: parsed.sms ?? false,
                  whatsapp: parsed.whatsapp ?? false,
                };
              } catch {
                /* ignore */
              }
            }
            return next;
          });

          setLastSyncedAt(new Date());
        }
      )
      .subscribe((status) => {
        setIsConnected(status === 'SUBSCRIBED');
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchSettings]);

  return {
    settings,
    isLoading,
    isConnected,
    isSaving,
    lastSyncedAt,
    setCutoffTime,
    setSaveFaceSamples,
    setPilotMode,
    setPilotClass,
    setPilotSection,
    setOneStudentOneEmail,
    setNotifyChannel,
    setFaceModelStrategy,
    setTwilioConfig,
    setMessageTemplate,
    refetch: fetchSettings,
  };
}
