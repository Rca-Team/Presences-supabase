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
# 0 is usually default USB webcam (/dev/video0)
CAMERA_INDEX = int(os.getenv("CAMERA_INDEX", "0"))
# Video capture resolution (640x480 is optimal for Pi 3 performance)
CAMERA_WIDTH = int(os.getenv("CAMERA_WIDTH", "640"))
CAMERA_HEIGHT = int(os.getenv("CAMERA_HEIGHT", "480"))
# Downscale factor for real-time face detection on CPU (0.25 = 160x120 for detection, then full res for embedding)
FRAME_SCALE = float(os.getenv("FRAME_SCALE", "0.25"))

# ─── Face Recognition Thresholds ─────────────────────────────────────────────
# Maximum Euclidean distance to accept a match (0.40 - 0.48 is typical for school settings)
MATCH_THRESHOLD = float(os.getenv("MATCH_THRESHOLD", "0.45"))
# Ambiguity ratio: if best_dist / second_best_dist > 0.85, mark as ambiguous
AMBIGUITY_RATIO = float(os.getenv("AMBIGUITY_RATIO", "0.85"))

# ─── Attendance & Timing Settings ────────────────────────────────────────────
# Seconds to wait before allowing the same student to be marked again (prevents spam)
COOLDOWN_SECONDS = int(os.getenv("COOLDOWN_SECONDS", "30"))

# Default Cutoff time for marking Late vs Present (24-hour format)
CUTOFF_HOUR = int(os.getenv("CUTOFF_HOUR", "9"))
CUTOFF_MINUTE = int(os.getenv("CUTOFF_MINUTE", "0"))

# Sync interval in seconds to refresh enrolled students from Supabase (e.g. every 5 min)
STUDENT_SYNC_INTERVAL_SEC = int(os.getenv("STUDENT_SYNC_INTERVAL_SEC", "300"))

# Gate/Terminal Name
GATE_NAME = os.getenv("GATE_NAME", "Main School Gate")
CAPTURE_MODE = os.getenv("CAPTURE_MODE", "gate-mode")

# ─── Display & Audio Feedback ────────────────────────────────────────────────
# Set to False if running completely headless without an HDMI screen
SHOW_WINDOW = os.getenv("SHOW_WINDOW", "true").lower() in ("true", "1", "yes")
# Enable audio chime on successful attendance
ENABLE_AUDIO = os.getenv("ENABLE_AUDIO", "true").lower() in ("true", "1", "yes")

# Local SQLite DB for offline queue and cached faces
DB_PATH = str(BASE_DIR / "local_cache.db")
CHIME_PATH = str(BASE_DIR / "success_chime.wav")
