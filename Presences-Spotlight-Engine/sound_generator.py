import os
import math
import wave
import struct

def generate_chime(output_path: str = "spotlight_chime.wav"):
    """
    Generates a crisp, warm two-tone harmonic notification chime (C6 - G6) in standard WAV format.
    No external audio libraries required.
    """
    if os.path.exists(output_path):
        return output_path

    sample_rate = 44100
    duration = 0.45  # seconds
    total_frames = int(sample_rate * duration)

    # Tone 1: C6 (1046.5 Hz), Tone 2: G6 (1567.98 Hz)
    freq1 = 1046.5
    freq2 = 1567.98

    with wave.open(output_path, 'wb') as wav:
        wav.setnchannels(1)        # Mono
        wav.setsampwidth(2)        # 16-bit
        wav.setframerate(sample_rate)

        for i in range(total_frames):
            t = i / sample_rate
            # Exponential decay envelope for a smooth bell/chime feel
            envelope = math.exp(-t * 6.5)

            # Two notes played in slight harmonic sequence
            sample_val = (0.6 * math.sin(2.0 * math.pi * freq1 * t) +
                          0.4 * math.sin(2.0 * math.pi * freq2 * t)) * envelope

            # 16-bit PCM conversion
            int_val = int(sample_val * 32767.0)
            int_val = max(-32768, min(32767, int_val))
            wav.writeframes(struct.pack('<h', int_val))

    return output_path

if __name__ == "__main__":
    path = generate_chime()
    print(f"Generated chime at: {path}")
