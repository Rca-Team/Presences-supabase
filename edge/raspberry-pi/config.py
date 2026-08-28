import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env file from the current directory
BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

# ─── Supabase Cloud Credentials ───────────────────────────────────────────────
SUPABASE_URL = os.getenv("SUPABASE_URL", "https://your-project-id.supabase.co")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "your-supabase-key-here")

# ─── Hardware & Camera Configuration ──────────────────────────────────────────
CAMERA_INDEX = int(os.getenv("CAMERA_INDEX", "0"))
CAMERA_WIDTH = int(os.getenv("CAMERA_WIDTH", "640"))
CAMERA_HEIGHT = int(os.getenv("CAMERA_HEIGHT", "480"))
# Downscale factor for real-time face detection on CPU (0.25 = 160x120 for detection, then full res for embedding)
FRAME_SCALE = float(os.getenv("FRAME_SCALE", "0.25"))

# ─── Crazy High-Performance & Accuracy Boosters ──────────────────────────────
# Contrast-Limited Adaptive Histogram Equalization for harsh light / shadows
ENABLE_CLAHE_ENHANCER = os.getenv("ENABLE_CLAHE_ENHANCER", "true").lower() in ("true", "1", "yes")
# Matrix-Vectorized SIMD distance computation (100x faster than loops)
ENABLE_VECTORIZED_SIMD = os.getenv("ENABLE_VECTORIZED_SIMD", "true").lower() in ("true", "1", "yes")
# 3D Head Pose Pitch/Yaw/Roll Liveness Anti-Spoofing
ENABLE_3D_HEAD_POSE = os.getenv("ENABLE_3D_HEAD_POSE", "true").lower() in ("true", "1", "yes")
# Exponential Moving Average smoothing factor for temporal confidence
EMA_SMOOTHING_FACTOR = float(os.getenv("EMA_SMOOTHING_FACTOR", "0.85"))

# ─── Face Recognition & Temporal Stability ────────────────────────────────────
# Strict Euclidean distance threshold (face-api.js same-person distance: 0.30 - 0.42)
MATCH_THRESHOLD = float(os.getenv("MATCH_THRESHOLD", "0.42"))
# Ambiguity ratio: reject if best_dist / second_best_dist > 0.80
AMBIGUITY_RATIO = float(os.getenv("AMBIGUITY_RATIO", "0.80"))
# Minimum calibrated confidence score to auto-mark attendance
MIN_AUTO_MARK_CONF = float(os.getenv("MIN_AUTO_MARK_CONF", "0.70"))
# Consecutive frame hits required before confirming student identity (prevents flicker)
STABILITY_HITS = int(os.getenv("STABILITY_HITS", "3"))
# Sliding time window in seconds for temporal accumulator
STABILITY_WINDOW_SEC = float(os.getenv("STABILITY_WINDOW_SEC", "2.5"))

# ─── Anti-Spoofing & Liveness ────────────────────────────────────────────────
ENABLE_LIVENESS_CHECK = os.getenv("ENABLE_LIVENESS_CHECK", "true").lower() in ("true", "1", "yes")
MIN_EAR_VARIANCE = float(os.getenv("MIN_EAR_VARIANCE", "0.002"))

# ─── Attendance Timing & Period Settings ─────────────────────────────────────
# Cooldown seconds to prevent multi-marking the same student
COOLDOWN_SECONDS = int(os.getenv("COOLDOWN_SECONDS", "30"))

# School Bell Timing (24-hour format)
ON_TIME_HOUR = int(os.getenv("ON_TIME_HOUR", "8"))
ON_TIME_MINUTE = int(os.getenv("ON_TIME_MINUTE", "0"))

GRACE_CUTOFF_HOUR = int(os.getenv("GRACE_CUTOFF_HOUR", "8"))
GRACE_CUTOFF_MINUTE = int(os.getenv("GRACE_CUTOFF_MINUTE", "45"))

LATE_CUTOFF_HOUR = int(os.getenv("LATE_CUTOFF_HOUR", "9"))
LATE_CUTOFF_MINUTE = int(os.getenv("LATE_CUTOFF_MINUTE", "0"))

# Background student descriptor sync interval (seconds)
STUDENT_SYNC_INTERVAL_SEC = int(os.getenv("STUDENT_SYNC_INTERVAL_SEC", "300"))

# Terminal & Attendance Info
GATE_NAME = os.getenv("GATE_NAME", "Main School Terminal")
CAPTURE_MODE = os.getenv("CAPTURE_MODE", "scanner")
SOURCE = os.getenv("SOURCE", "scanner")
AUTO_TRIGGER_PARENT_ALERTS = os.getenv("AUTO_TRIGGER_PARENT_ALERTS", "true").lower() in ("true", "1", "yes")

# ─── Futuristic Cyberpunk HUD & Audio Feedback ──────────────────────────────
SHOW_WINDOW = os.getenv("SHOW_WINDOW", "true").lower() in ("true", "1", "yes")
ENABLE_AUDIO = os.getenv("ENABLE_AUDIO", "true").lower() in ("true", "1", "yes")
ENABLE_VOICE_GREETING = os.getenv("ENABLE_VOICE_GREETING", "true").lower() in ("true", "1", "yes")
ENABLE_HOLOGRAPHIC_HUD = os.getenv("ENABLE_HOLOGRAPHIC_HUD", "true").lower() in ("true", "1", "yes")

# Local SQLite DB & Audio Assets
DB_PATH = str(BASE_DIR / "local_cache.db")
CHIME_PATH = str(BASE_DIR / "success_chime.wav")
