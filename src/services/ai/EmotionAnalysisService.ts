import { supabase } from '@/integrations/supabase/client';

type EmotionLabel = 'focused' | 'happy' | 'calm' | 'neutral' | 'stressed' | 'tired';

interface EmotionScores {
  focused: number;
  happy: number;
  calm: number;
  neutral: number;
  stressed: number;
  tired: number;
}

export interface EmotionAnalysis {
  label: EmotionLabel;
  confidence: number;
  valence: number;
  arousal: number;
  scores: EmotionScores;
}

interface SaveEmotionEventInput {
  userId?: string | null;
  studentId?: string | null;
  source: 'ai-scan' | 'gate-mode' | 'qr-scan';
  descriptor: Float32Array;
  recognitionConfidence?: number;
  metadata?: Record<string, unknown>;
}

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

const avg = (values: number[]) =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

const std = (values: number[]) => {
  const mean = avg(values);
  const variance = avg(values.map((value) => (value - mean) ** 2));
  return Math.sqrt(variance);
};

const normalizeScores = (scores: EmotionScores): EmotionScores => {
  const total = Object.values(scores).reduce((sum, value) => sum + value, 0);
  if (total <= 0) return scores;

  return {
    focused: scores.focused / total,
    happy: scores.happy / total,
    calm: scores.calm / total,
    neutral: scores.neutral / total,
    stressed: scores.stressed / total,
    tired: scores.tired / total,
  };
};

export function analyzeEmotionFromDescriptor(descriptor: Float32Array): EmotionAnalysis {
  const values = Array.from(descriptor || []);
  const head = values.slice(0, 24);
  const mid = values.slice(24, 80);
  const tail = values.slice(80, 128);

  const energy = clamp(avg(head.map((value) => Math.abs(value))) * 2.2);
  const stability = clamp(1 - std(mid) * 2.8);
  const warmth = clamp((avg(tail) + 0.3) * 1.25);
  const stress = clamp((1 - stability) * 0.65 + energy * 0.35);
  const tired = clamp((1 - energy) * 0.7 + (1 - warmth) * 0.3);

  const rawScores: EmotionScores = {
    focused: clamp(energy * 0.55 + stability * 0.45),
    happy: clamp(warmth * 0.65 + stability * 0.35),
    calm: clamp(stability * 0.72 + (1 - stress) * 0.28),
    neutral: 0.55,
    stressed: clamp(stress),
    tired: clamp(tired),
  };

  const scores = normalizeScores(rawScores);
  const ranked = (Object.entries(scores) as [EmotionLabel, number][])?.sort((a, b) => b[1] - a[1]);
  const label = ranked[0]?.[0] || 'neutral';
  const confidence = clamp(ranked[0]?.[1] || 0);

  const valence = clamp(
    scores.happy * 0.9 + scores.calm * 0.5 - scores.stressed * 0.7 - scores.tired * 0.45,
    -1,
    1,
  );
  const arousal = clamp(energy * 2 - 1, -1, 1);

  return {
    label,
    confidence,
    valence,
    arousal,
    scores,
  };
}

export async function saveEmotionEvent({
  userId,
  studentId,
  source,
  descriptor,
  recognitionConfidence,
  metadata,
}: SaveEmotionEventInput): Promise<void> {
  try {
    const analysis = analyzeEmotionFromDescriptor(descriptor);

    const payload = {
      user_id: userId ?? null,
      student_id: studentId ?? null,
      source,
      emotion_label: analysis.label,
      confidence_score: analysis.confidence,
      valence_score: analysis.valence,
      arousal_score: analysis.arousal,
      metadata: {
        ...(metadata || {}),
        recognition_confidence: recognitionConfidence ?? null,
        emotion_scores: analysis.scores,
      },
    };

    const { error } = await supabase.from('emotion_events').insert(payload);
    if (error) {
      console.error('Failed to save emotion event:', error);
    }
  } catch (error) {
    console.error('Emotion analysis save failed:', error);
  }
}