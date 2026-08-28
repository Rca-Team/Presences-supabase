"""
Generates a pleasant 3-tone chime (C5 - E5 - G5) WAV file for audio feedback on recognition.
Requires no external libraries (uses standard library `wave`, `struct`, `math`).
"""

import math
import struct
import wave
import os

def generate_chime(output_path: str = "success_chime.wav", sample_rate: int = 44100):
    if os.path.exists(output_path):
        return output_path

    # Sequence of notes: (Frequency Hz, Start time sec, Duration sec, Amplitude 0-1)
    notes = [
        (523.25, 0.00, 0.14, 0.4),  # C5
        (659.25, 0.12, 0.14, 0.4),  # E5
        (783.99, 0.24, 0.25, 0.5),  # G5
    ]

    total_duration = 0.55
    total_samples = int(sample_rate * total_duration)
    audio_data = [0.0] * total_samples

    for freq, start, duration, amp in notes:
        start_sample = int(start * sample_rate)
        note_samples = int(duration * sample_rate)
        
        for i in range(note_samples):
            idx = start_sample + i
            if idx >= total_samples:
                break
            
            # Simple envelope (linear fade-out)
            envelope = 1.0 - (i / note_samples)
            # Sine wave
            t = i / sample_rate
            sample = amp * envelope * math.sin(2.0 * math.pi * freq * t)
            audio_data[idx] += sample

    # Normalize and convert to 16-bit PCM
    with wave.open(output_path, 'wb') as wav_file:
        wav_file.setnchannels(1)  # Mono
        wav_file.setsampwidth(2)  # 16-bit
        wav_file.setframerate(sample_rate)
        
        for s in audio_data:
            clamped = max(-1.0, min(1.0, s))
            val = int(clamped * 32767.0)
            wav_file.writeframes(struct.pack('<h', val))

    return output_path

if __name__ == "__main__":
    generate_chime("success_chime.wav")
    print("Generated success_chime.wav successfully.")
