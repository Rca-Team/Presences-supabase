/**
 * EmergencyAlarmService
 * Production-grade alarm system with multi-layered audio, speech synthesis,
 * and continuous vibration for school emergency alerts.
 */

export type AlertType = 'fire' | 'lockdown' | 'evacuation' | 'earthquake' | 'medical' | 'intruder' | 'allclear' | 'custom';

// Voice announcements per alert type
const ANNOUNCEMENTS: Record<AlertType, string> = {
  fire: 'Attention. Fire alarm activated. Evacuate the building immediately using the nearest exit. Do not use elevators. Proceed to the designated assembly point.',
  lockdown: 'Attention. Lockdown in effect. Lock all doors. Stay away from windows. Remain silent and stay in place until further notice.',
  evacuation: 'Attention. Evacuation order issued. Leave the building immediately through the nearest exit. Proceed to the assembly point calmly.',
  earthquake: 'Attention. Earthquake alert. Drop, cover, and hold on. Get under a desk or sturdy furniture. Stay away from windows and heavy objects.',
  medical: 'Attention. Medical emergency reported. First aid team respond immediately. Keep corridors clear for emergency responders.',
  intruder: 'Attention. Intruder alert. Lock all doors immediately. Hide and stay silent. Do not open doors for anyone. Wait for all clear signal.',
  allclear: 'All clear. The emergency has been resolved. You may resume normal activities. Thank you for your cooperation.',
  custom: 'Attention. Emergency announcement. Please listen for further instructions.',
};

// Vibration patterns (ms on/off)
const VIBRATION_PATTERNS: Record<AlertType, number[]> = {
  fire: [1000, 200, 1000, 200, 1000, 200, 1000],
  lockdown: [500, 100, 500, 100, 500, 100, 2000],
  evacuation: [800, 200, 800, 200, 800, 200, 800],
  earthquake: [300, 100, 300, 100, 1500, 200, 300, 100, 300],
  medical: [600, 300, 600, 300, 600],
  intruder: [200, 100, 200, 100, 200, 100, 2000, 200, 200, 100, 200],
  allclear: [200, 100, 200],
  custom: [400, 200, 400],
};

class EmergencyAlarmService {
  private audioCtx: AudioContext | null = null;
  private oscillators: OscillatorNode[] = [];
  private gainNode: GainNode | null = null;
  private vibrationInterval: ReturnType<typeof setInterval> | null = null;
  private speechUtterance: SpeechSynthesisUtterance | null = null;
  private alarmLoopInterval: ReturnType<typeof setInterval> | null = null;
  private isPlaying = false;

  /** Start full emergency alarm: siren + speech + vibration */
  startAlarm(type: AlertType, customMessage?: string) {
    this.stopAlarm(); // Clear any existing
    this.isPlaying = true;

    // 1. Start siren sound
    this.playSiren(type);

    // 2. Loop siren every 6s for non-allclear
    if (type !== 'allclear') {
      this.alarmLoopInterval = setInterval(() => {
        if (!this.isPlaying) return;
        this.playSiren(type);
      }, 6000);
    }

    // 3. Start vibration loop
    this.startVibration(type);

    // 4. Speak announcement after a short delay (so siren is heard first)
    setTimeout(() => {
      if (this.isPlaying) {
        this.speakAnnouncement(type, customMessage);
      }
    }, 2000);
  }

  /** Stop all alarm outputs */
  stopAlarm() {
    this.isPlaying = false;

    // Stop oscillators
    this.oscillators.forEach(osc => {
      try { osc.stop(); } catch {}
    });
    this.oscillators = [];

    // Close audio context
    if (this.audioCtx) {
      try { this.audioCtx.close(); } catch {}
      this.audioCtx = null;
      this.gainNode = null;
    }

    // Stop vibration
    if (this.vibrationInterval) {
      clearInterval(this.vibrationInterval);
      this.vibrationInterval = null;
    }
    if ('vibrate' in navigator) navigator.vibrate(0);

    // Stop speech
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    this.speechUtterance = null;

    // Stop alarm loop
    if (this.alarmLoopInterval) {
      clearInterval(this.alarmLoopInterval);
      this.alarmLoopInterval = null;
    }
  }

  /** Play a short preview of the siren (for admin testing) */
  previewSiren(type: AlertType) {
    this.stopAlarm();
    this.playSiren(type, 2);
    if ('vibrate' in navigator) {
      navigator.vibrate(VIBRATION_PATTERNS[type] || [200, 100, 200]);
    }
    // Auto stop after 2.5s
    setTimeout(() => this.stopAlarm(), 2500);
  }

  /** Preview speech announcement */
  previewAnnouncement(type: AlertType, customMessage?: string) {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const text = customMessage || ANNOUNCEMENTS[type] || ANNOUNCEMENTS.custom;
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.9;
      utterance.pitch = 0.8;
      utterance.volume = 1;
      utterance.lang = 'en-US';
      window.speechSynthesis.speak(utterance);
    }
  }

  private getOrCreateAudioCtx(): AudioContext {
    if (!this.audioCtx || this.audioCtx.state === 'closed') {
      this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.gainNode = this.audioCtx.createGain();
      this.gainNode.connect(this.audioCtx.destination);
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    return this.audioCtx;
  }

  private playSiren(type: AlertType, durationSec = 5) {
    try {
      const ctx = this.getOrCreateAudioCtx();
      const gain = this.gainNode!;
      const now = ctx.currentTime;
      const end = now + durationSec;

      // Master volume - LOUD
      gain.gain.setValueAtTime(0.6, now);

      switch (type) {
        case 'fire':
        case 'evacuation': {
          // Two-tone wailing siren (like a real fire alarm)
          const osc1 = ctx.createOscillator();
          osc1.type = 'sawtooth';
          const oscGain = ctx.createGain();
          oscGain.gain.value = 0.5;
          osc1.connect(oscGain);
          oscGain.connect(gain);
          for (let t = now; t < end; t += 0.8) {
            osc1.frequency.setValueAtTime(880, t);
            osc1.frequency.linearRampToValueAtTime(1200, t + 0.4);
            osc1.frequency.linearRampToValueAtTime(880, t + 0.8);
          }
          osc1.start(now);
          osc1.stop(end);
          this.oscillators.push(osc1);

          // Add harsh overlay
          const osc2 = ctx.createOscillator();
          osc2.type = 'square';
          const osc2Gain = ctx.createGain();
          osc2Gain.gain.value = 0.15;
          osc2.connect(osc2Gain);
          osc2Gain.connect(gain);
          osc2.frequency.value = 440;
          for (let t = now; t < end; t += 0.4) {
            osc2Gain.gain.setValueAtTime(0.15, t);
            osc2Gain.gain.setValueAtTime(0, t + 0.2);
          }
          osc2.start(now);
          osc2.stop(end);
          this.oscillators.push(osc2);
          break;
        }

        case 'lockdown':
        case 'intruder': {
          // Rapid staccato beeping (urgent, attention-grabbing)
          const osc = ctx.createOscillator();
          osc.type = 'square';
          osc.frequency.value = 1100;
          const oscGain = ctx.createGain();
          osc.connect(oscGain);
          oscGain.connect(gain);
          for (let t = now; t < end; t += 0.25) {
            oscGain.gain.setValueAtTime(0.5, t);
            oscGain.gain.setValueAtTime(0, t + 0.12);
          }
          osc.start(now);
          osc.stop(end);
          this.oscillators.push(osc);

          // Low undertone
          const bass = ctx.createOscillator();
          bass.type = 'sine';
          bass.frequency.value = 150;
          const bassGain = ctx.createGain();
          bassGain.gain.value = 0.25;
          bass.connect(bassGain);
          bassGain.connect(gain);
          bass.start(now);
          bass.stop(end);
          this.oscillators.push(bass);
          break;
        }

        case 'earthquake': {
          // Deep rumbling with crescendo
          const osc = ctx.createOscillator();
          osc.type = 'sine';
          osc.frequency.value = 80;
          const oscGain = ctx.createGain();
          osc.connect(oscGain);
          oscGain.connect(gain);
          for (let t = now; t < end; t += 1.2) {
            oscGain.gain.linearRampToValueAtTime(0.6, t + 0.6);
            oscGain.gain.linearRampToValueAtTime(0.15, t + 1.2);
            osc.frequency.linearRampToValueAtTime(160, t + 0.6);
            osc.frequency.linearRampToValueAtTime(80, t + 1.2);
          }
          osc.start(now);
          osc.stop(end);
          this.oscillators.push(osc);

          // Rattling effect
          const noise = ctx.createOscillator();
          noise.type = 'sawtooth';
          noise.frequency.value = 45;
          const nGain = ctx.createGain();
          nGain.gain.value = 0.2;
          noise.connect(nGain);
          nGain.connect(gain);
          noise.start(now);
          noise.stop(end);
          this.oscillators.push(noise);
          break;
        }

        case 'medical': {
          // Ambulance-style wail
          const osc = ctx.createOscillator();
          osc.type = 'sine';
          const oscGain = ctx.createGain();
          oscGain.gain.value = 0.5;
          osc.connect(oscGain);
          oscGain.connect(gain);
          for (let t = now; t < end; t += 1.5) {
            osc.frequency.setValueAtTime(500, t);
            osc.frequency.linearRampToValueAtTime(1000, t + 0.75);
            osc.frequency.linearRampToValueAtTime(500, t + 1.5);
          }
          osc.start(now);
          osc.stop(end);
          this.oscillators.push(osc);
          break;
        }

        case 'allclear': {
          // Pleasant descending chimes
          const notes = [784, 659, 523, 659, 784];
          notes.forEach((freq, i) => {
            const osc = ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.value = freq;
            const oscGain = ctx.createGain();
            oscGain.gain.setValueAtTime(0.4, now + i * 0.3);
            oscGain.gain.linearRampToValueAtTime(0, now + i * 0.3 + 0.5);
            osc.connect(oscGain);
            oscGain.connect(gain);
            osc.start(now + i * 0.3);
            osc.stop(now + i * 0.3 + 0.5);
            this.oscillators.push(osc);
          });
          break;
        }

        default: {
          // Generic alert tone
          const osc = ctx.createOscillator();
          osc.type = 'triangle';
          osc.frequency.value = 800;
          const oscGain = ctx.createGain();
          osc.connect(oscGain);
          oscGain.connect(gain);
          for (let t = now; t < end; t += 0.5) {
            oscGain.gain.setValueAtTime(0.4, t);
            oscGain.gain.setValueAtTime(0, t + 0.25);
          }
          osc.start(now);
          osc.stop(end);
          this.oscillators.push(osc);
        }
      }
    } catch (e) {
      console.warn('Could not play siren:', e);
    }
  }

  private startVibration(type: AlertType) {
    const pattern = VIBRATION_PATTERNS[type] || VIBRATION_PATTERNS.custom;
    if (!('vibrate' in navigator)) return;

    navigator.vibrate(pattern);

    if (type !== 'allclear') {
      const patternDuration = pattern.reduce((a, b) => a + b, 0);
      this.vibrationInterval = setInterval(() => {
        if (this.isPlaying) navigator.vibrate(pattern);
      }, patternDuration + 200);
    }
  }

  private speakAnnouncement(type: AlertType, customMessage?: string) {
    if (!('speechSynthesis' in window)) return;

    // Lower siren volume during speech
    if (this.gainNode) {
      this.gainNode.gain.linearRampToValueAtTime(0.15, this.audioCtx!.currentTime + 0.5);
    }

    const baseText = ANNOUNCEMENTS[type] || ANNOUNCEMENTS.custom;
    const fullText = customMessage ? `${baseText} ${customMessage}` : baseText;

    const utterance = new SpeechSynthesisUtterance(fullText);
    utterance.rate = 0.85;
    utterance.pitch = 0.7;
    utterance.volume = 1;
    utterance.lang = 'en-US';

    utterance.onend = () => {
      // Restore siren volume after speech
      if (this.gainNode && this.isPlaying) {
        this.gainNode.gain.linearRampToValueAtTime(0.6, this.audioCtx!.currentTime + 0.5);
      }
      // Repeat announcement for critical types
      if (this.isPlaying && type !== 'allclear' && type !== 'custom') {
        setTimeout(() => {
          if (this.isPlaying) this.speakAnnouncement(type, customMessage);
        }, 8000);
      }
    };

    this.speechUtterance = utterance;
    window.speechSynthesis.speak(utterance);
  }

  getAnnouncement(type: AlertType): string {
    return ANNOUNCEMENTS[type] || ANNOUNCEMENTS.custom;
  }

  getVibrationPattern(type: AlertType): number[] {
    return VIBRATION_PATTERNS[type] || VIBRATION_PATTERNS.custom;
  }
}

export const emergencyAlarmService = new EmergencyAlarmService();