import os
from pathlib import Path
from dotenv import load_dotenv

# Base directory for spotlight edge engine
BASE_DIR = Path(__file__).resolve().parent

# Load .env file from the current directory or parent directories
load_dotenv(BASE_DIR / ".env")
load_dotenv(BASE_DIR.parent / ".env")
load_dotenv(BASE_DIR.parent.parent / ".env")

# ─── 1. Supabase Cloud Configuration ──────────────────────────────────────────
SUPABASE_URL = os.getenv("SUPABASE_URL", "https://your-project-id.supabase.co")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "your-supabase-service-or-anon-key")

# ─── 2. Camera & Video Stream Settings ────────────────────────────────────────
# RTSP URL from IP camera (e.g., rtsp://admin:pass@192.168.1.50:554/Streaming/Channels/101)
# Or an integer device index (e.g., 0) for a local USB/integrated webcam
RTSP_URL = os.getenv("RTSP_URL", "0")
CAMERA_WIDTH = int(os.getenv("CAMERA_WIDTH", "1280"))
CAMERA_HEIGHT = int(os.getenv("CAMERA_HEIGHT", "720"))
TARGET_FPS = int(os.getenv("TARGET_FPS", "30"))

# Downscale factor for real-time face detection on CPU/GPU (0.5 = 640x360 for detection, then full res for embedding)
FRAME_SCALE = float(os.getenv("FRAME_SCALE", "0.5"))

# ─── 3. Recognition & Anti-False Attendance Safeguards ───────────────────────
# Maximum Euclidean distance to accept a match (0.40 - 0.44 is recommended for high accuracy)
MATCH_THRESHOLD = float(os.getenv("MATCH_THRESHOLD", "0.42"))

# Ambiguity Ratio: If best_distance / second_best_distance > 0.82, flag as ambiguous to prevent misidentifying similar students
AMBIGUITY_RATIO = float(os.getenv("AMBIGUITY_RATIO", "0.82"))

# Multi-Frame Consensus: Number of consecutive frames that must match the same identity before confirming attendance
CONSENSUS_FRAMES_REQUIRED = int(os.getenv("CONSENSUS_FRAMES_REQUIRED", "3"))
CONSENSUS_WINDOW_SECONDS = float(os.getenv("CONSENSUS_WINDOW_SECONDS", "1.5"))

# Face quality: Minimum bounding box pixel width (e.g., 60px) to consider for recognition
MIN_FACE_SIZE_PX = int(os.getenv("MIN_FACE_SIZE_PX", "60"))

# ─── 4. Attendance & Cutoff Timings ───────────────────────────────────────────
# Cooldown seconds: Prevent marking the same student repeatedly during the arrival session (default: 60s)
COOLDOWN_SECONDS = int(os.getenv("COOLDOWN_SECONDS", "60"))

# Morning Cutoff Time (24-Hour Format) for On-Time vs Late
CUTOFF_HOUR = int(os.getenv("CUTOFF_HOUR", "9"))
CUTOFF_MINUTE = int(os.getenv("CUTOFF_MINUTE", "0"))

# Sync interval in seconds to refresh enrolled students from Supabase (e.g. every 5 min)
STUDENT_SYNC_INTERVAL_SEC = int(os.getenv("STUDENT_SYNC_INTERVAL_SEC", "300"))

# Gate & Device Info
GATE_NAME = os.getenv("GATE_NAME", "Main Building Gate - Spotlight 1")
CAPTURE_MODE = "spotlight-gate"

# ─── 5. Display & Audio Interface ─────────────────────────────────────────────
SHOW_WINDOW = os.getenv("SHOW_WINDOW", "true").lower() in ("true", "1", "yes")
FULLSCREEN_KIOSK = os.getenv("FULLSCREEN_KIOSK", "false").lower() in ("true", "1", "yes")
# Audio verification (Set to False for silent operation)
ENABLE_AUDIO = os.getenv("ENABLE_AUDIO", "false").lower() in ("true", "1", "yes")

# Local Storage
DB_PATH = str(BASE_DIR / "spotlight_local.db")
CHIME_PATH = str(BASE_DIR / "spotlight_chime.wav")
UNKNOWN_LOG_DIR = str(BASE_DIR / "unrecognized_snapshots")
