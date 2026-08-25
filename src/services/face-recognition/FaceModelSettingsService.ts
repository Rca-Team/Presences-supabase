import { supabase } from '@/integrations/supabase/client';

export type FaceDetectionModel = 'ssd' | 'tiny';

export interface FaceModelSettings {
  preferredModel: FaceDetectionModel;
  allowFallback: boolean;
}

const MODEL_KEY = 'face_model_preferred';
const FALLBACK_KEY = 'face_model_allow_fallback';

const DEFAULT_SETTINGS: FaceModelSettings = {
  preferredModel: 'ssd',
  allowFallback: true,
};

function parseModel(value: unknown): FaceDetectionModel {
  if (value === 'tiny') return 'tiny';
  return 'ssd';
}

function parseBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return fallback;
}

async function upsertSetting(key: string, value: string): Promise<void> {
  const { data: existing, error: readError } = await supabase
    .from('attendance_settings')
    .select('key')
    .eq('key', key)
    .maybeSingle();

  if (readError) throw readError;

  if (existing) {
    const { error } = await supabase
      .from('attendance_settings')
      .update({ value, updated_at: new Date().toISOString() })
      .eq('key', key);
    if (error) throw error;
    return;
  }

  const { error } = await supabase
    .from('attendance_settings')
    .insert({ key, value });
  if (error) throw error;
}

export async function getFaceModelSettings(): Promise<FaceModelSettings> {
  try {
    const { data, error } = await supabase
      .from('attendance_settings')
      .select('key, value')
      .in('key', [MODEL_KEY, FALLBACK_KEY]);

    if (error) throw error;

    const byKey = new Map((data || []).map((row) => [row.key, row.value]));

    return {
      preferredModel: parseModel(byKey.get(MODEL_KEY) ?? DEFAULT_SETTINGS.preferredModel),
      allowFallback: parseBoolean(byKey.get(FALLBACK_KEY), DEFAULT_SETTINGS.allowFallback),
    };
  } catch (error) {
    console.error('Failed to fetch face model settings, using defaults:', error);
    return DEFAULT_SETTINGS;
  }
}

export async function updateFaceModelSettings(settings: FaceModelSettings): Promise<void> {
  await Promise.all([
    upsertSetting(MODEL_KEY, settings.preferredModel),
    upsertSetting(FALLBACK_KEY, String(settings.allowFallback)),
  ]);
}
