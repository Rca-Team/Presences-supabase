// Web Audio synthesizer and Classroom Noise Listener

class AudioService {
  private audioCtx: AudioContext | null = null;
  private noiseStream: MediaStream | null = null;
  private noiseAnalyser: AnalyserNode | null = null;
  private noiseAnimId: number | null = null;

  private getAudioContext(): AudioContext {
    if (!this.audioCtx) {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      this.audioCtx = new AudioCtxClass();
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    return this.audioCtx;
  }

  /**
   * Pleasant school bell / timer finished chime
   */
  public playSchoolBell() {
    try {
      const ctx = this.getAudioContext();
      const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.15);

        gain.gain.setValueAtTime(0, ctx.currentTime + idx * 0.15);
        gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + idx * 0.15 + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.15 + 0.9);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(ctx.currentTime + idx * 0.15);
        osc.stop(ctx.currentTime + idx * 0.15 + 0.95);
      });
    } catch (e) {
      console.warn('Audio chime notice:', e);
    }
  }

  /**
   * Positive chime for student problem solved
   */
  public playSuccessChime() {
    try {
      const ctx = this.getAudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.25);

      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    } catch (e) {
      console.warn('Audio notice:', e);
    }
  }

  /**
   * Start listening to classroom noise level via smartboard mic
   */
  public async startNoiseMonitoring(onLevelChange: (levelPercent: number, status: 'quiet' | 'moderate' | 'loud') => void): Promise<boolean> {
    try {
      if (!navigator.mediaDevices?.getUserMedia) return false;
      this.noiseStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const ctx = this.getAudioContext();
      const source = ctx.createMediaStreamSource(this.noiseStream);
      this.noiseAnalyser = ctx.createAnalyser();
      this.noiseAnalyser.fftSize = 256;
      source.connect(this.noiseAnalyser);

      const bufferLength = this.noiseAnalyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const checkVolume = () => {
        if (!this.noiseAnalyser) return;
        this.noiseAnalyser.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const average = sum / bufferLength;
        const normalized = Math.min(100, Math.round((average / 128) * 100));

        let status: 'quiet' | 'moderate' | 'loud' = 'quiet';
        if (normalized > 65) status = 'loud';
        else if (normalized > 35) status = 'moderate';

        onLevelChange(normalized, status);
        this.noiseAnimId = requestAnimationFrame(checkVolume);
      };

      checkVolume();
      return true;
    } catch (err) {
      console.warn('Microphone noise access notice:', err);
      return false;
    }
  }

  /**
   * Stop listening to classroom noise
   */
  public stopNoiseMonitoring() {
    if (this.noiseAnimId) {
      cancelAnimationFrame(this.noiseAnimId);
      this.noiseAnimId = null;
    }
    if (this.noiseStream) {
      this.noiseStream.getTracks().forEach(t => t.stop());
      this.noiseStream = null;
    }
    this.noiseAnalyser = null;
  }
}

export const audioService = new AudioService();
