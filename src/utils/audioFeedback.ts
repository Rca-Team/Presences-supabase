/**
 * Audio and Haptic Feedback Utility
 * ---------------------------------
 * Provides lightweight Web Audio API synthesized chimes and tones for
 * real-time attendance recognition, QR scans, and system alerts.
 * Zero external audio files required — runs instantly on any device.
 */

let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      if (Ctx) {
        sharedAudioCtx = new Ctx();
      }
    }
    if (sharedAudioCtx && sharedAudioCtx.state === 'suspended') {
      void sharedAudioCtx.resume();
    }
    return sharedAudioCtx;
  } catch {
    return null;
  }
}

/**
 * Play a single frequency tone with envelope shaping
 */
function playTone(
  ctx: AudioContext,
  freq: number,
  startOffsetSec: number,
  durationSec: number,
  gain = 0.2,
  type: OscillatorType = 'sine'
) {
  try {
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime + startOffsetSec);

    const now = ctx.currentTime + startOffsetSec;
    amp.gain.setValueAtTime(0.001, now);
    amp.gain.exponentialRampToValueAtTime(Math.max(gain, 0.01), now + 0.02);
    amp.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

    osc.connect(amp);
    amp.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + durationSec + 0.05);
  } catch (err) {
    console.debug('Audio playback note skipped:', err);
  }
}

/**
 * Play a crisp, pleasant major triad success chime (C5 -> E5 -> G5)
 * Triggered whenever a face or QR code is successfully recognized.
 */
export function playSuccessChime(gain = 0.22): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  // Triad ascending chime: C5 (523Hz), E5 (659Hz), G5 (784Hz)
  playTone(ctx, 523.25, 0.0, 0.12, gain, 'sine');
  playTone(ctx, 659.25, 0.08, 0.12, gain, 'sine');
  playTone(ctx, 783.99, 0.16, 0.25, gain * 1.1, 'sine');

  // Trigger gentle tactile vibration if user has interacted with the page
  safeVibrate([40, 30, 40]);
}

/**
 * Play a warm two-tone late arrival notification (A4 -> G4)
 */
export function playLateChime(gain = 0.2): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  playTone(ctx, 440.0, 0.0, 0.14, gain, 'triangle');
  playTone(ctx, 392.0, 0.11, 0.2, gain, 'triangle');

  safeVibrate([60, 40, 60]);
}

/**
 * Play a rapid high-frequency beep for instant QR card detection
 */
export function playQRScanBeep(gain = 0.25): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  playTone(ctx, 1200, 0.0, 0.09, gain, 'sine');

  safeVibrate(35);
}

/**
 * Play a soft warning / retry sound
 */
export function playWarningTone(gain = 0.18): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  playTone(ctx, 349.23, 0.0, 0.12, gain, 'sawtooth');
  playTone(ctx, 311.13, 0.1, 0.16, gain, 'sawtooth');

  safeVibrate([80, 50, 80]);
}

/**
 * Play a high-tech synthesized sound when toggling between Lite and Standard mode
 */
export function playModeSwitchSound(mode: 'lite' | 'standard', gain = 0.2): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  if (mode === 'lite') {
    // Futuristic downward quick slide (high-efficiency power saver engaged)
    playTone(ctx, 740, 0.0, 0.07, gain, 'sine');
    playTone(ctx, 493.88, 0.05, 0.14, gain * 1.1, 'sine');
  } else {
    // Futuristic upward shimmer chime (full graphics & 3D fidelity engaged)
    playTone(ctx, 493.88, 0.07, 0.07, gain, 'sine');
    playTone(ctx, 987.77, 0.06, 0.16, gain * 1.15, 'sine');
  }

  safeVibrate(mode === 'lite' ? [25, 20] : [20, 25, 20]);
}

function safeVibrate(pattern: number | number[]): void {
  try {
    if (
      typeof navigator !== 'undefined' &&
      typeof navigator.vibrate === 'function' &&
      (navigator.userActivation ? navigator.userActivation.hasBeenActive : true)
    ) {
      navigator.vibrate(pattern);
    }
  } catch {
    // Ignore unsupported haptic errors
  }
}

