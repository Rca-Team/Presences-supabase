import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * useLiteFeedback
 * ---------------
 * Tiny, dependency-free feedback layer for Lite mode (smart boards / low-end
 * devices). Persists three toggles — sound, vibrate, flash — in localStorage
 * and exposes a single `signal()` call plus a one-line text status.
 * No animation libraries, no re-render churn while idle.
 */

export type LiteFeedbackKey = 'sound' | 'vibrate' | 'flash';
export type LiteSignalKind = 'ok' | 'warn' | 'fail';

export interface LiteFeedbackPrefs {
  sound: boolean;
  vibrate: boolean;
  flash: boolean;
}

const STORAGE_KEY = 'presences.lite.feedback';
const DEFAULTS: LiteFeedbackPrefs = { sound: true, vibrate: true, flash: true };
const FLASH_MS = 160;

function readPrefs(): LiteFeedbackPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw);
    return {
      sound: typeof parsed?.sound === 'boolean' ? parsed.sound : DEFAULTS.sound,
      vibrate: typeof parsed?.vibrate === 'boolean' ? parsed.vibrate : DEFAULTS.vibrate,
      flash: typeof parsed?.flash === 'boolean' ? parsed.flash : DEFAULTS.flash,
    };
  } catch {
    return DEFAULTS;
  }
}

const TONE: Record<LiteSignalKind, { freq: number; ms: number; buzz: number | number[] }> = {
  ok: { freq: 1040, ms: 90, buzz: 35 },
  warn: { freq: 720, ms: 120, buzz: [25, 40, 25] },
  fail: { freq: 320, ms: 180, buzz: 120 },
};

export function useLiteFeedback() {
  const [prefs, setPrefs] = useState<LiteFeedbackPrefs>(() => readPrefs());
  const [flashKind, setFlashKind] = useState<LiteSignalKind | null>(null);
  const flashTimer = useRef<number | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)); } catch { /* ignore */ }
  }, [prefs]);

  useEffect(() => () => {
    if (flashTimer.current) window.clearTimeout(flashTimer.current);
    try { ctxRef.current?.close(); } catch { /* ignore */ }
  }, []);

  const toggle = useCallback((key: LiteFeedbackKey) => {
    setPrefs(p => ({ ...p, [key]: !p[key] }));
  }, []);

  const signal = useCallback((kind: LiteSignalKind = 'ok') => {
    const tone = TONE[kind];

    if (prefs.sound) {
      try {
        const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
        if (Ctx) {
          const ctx = ctxRef.current || (ctxRef.current = new Ctx());
          if (ctx.state === 'suspended') void ctx.resume?.();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.frequency.value = tone.freq;
          gain.gain.value = 0.12;
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start();
          osc.stop(ctx.currentTime + tone.ms / 1000);
        }
      } catch { /* ignore */ }
    }

    if (prefs.vibrate) {
      try { navigator.vibrate?.(tone.buzz as any); } catch { /* ignore */ }
    }

    if (prefs.flash) {
      if (flashTimer.current) window.clearTimeout(flashTimer.current);
      setFlashKind(kind);
      flashTimer.current = window.setTimeout(() => setFlashKind(null), FLASH_MS) as unknown as number;
    }
  }, [prefs]);

  return { prefs, toggle, signal, flashKind };
}
