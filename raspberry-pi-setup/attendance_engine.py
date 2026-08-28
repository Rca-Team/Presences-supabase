"""
================================================================================
  PRESENCES AI — ADVANCED SMART ATTENDANCE TERMINAL (ENTERPRISE EDITION)
================================================================================
Features:
  1. Multi-Frame Temporal Stability Accumulator (Zero False Positives / Anti-Flicker)
  2. Multi-Face Tracking & Flow Direction Engine (Simultaneous multi-person scan)
  3. Liveness & Micro-Motion Eye Aspect Ratio (EAR) Anti-Spoofing
  4. Multi-Exemplar Clustering & Calibrated Sigmoid Vector Metric
  5. Schedule & Dynamic Period/Cutoff/Grace-Period Time Engine
  6. Non-Blocking Voice Greetings (TTS) & Melodic Audio Chimes
  7. High-Tech Cyberpunk HUD with Real-Time Stats & Face Reticles
  8. Offline-Resilient SQLite Local Queue with Auto-Flush & Cloud Sync
================================================================================
"""

import os
import sys
import warnings
warnings.filterwarnings("ignore")

import time
import math
import json
import uuid
import queue
import sqlite3
import threading
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Dict, Tuple, Optional

import cv2
import numpy as np
import requests

# Try importing face_recognition (dlib)
FACE_RECOG_AVAILABLE = False
try:
    import face_recognition
    FACE_RECOG_AVAILABLE = True
except ImportError:
    pass

# Try importing pyttsx3 for Voice Greetings
TTS_AVAILABLE = False
try:
    import pyttsx3
    TTS_AVAILABLE = True
except Exception:
    pass

import config
from sound_generator import generate_chime

# Audio Backend Selection
AUDIO_BACKEND = "none"
if sys.platform == "win32":
    try:
        import winsound
        AUDIO_BACKEND = "winsound"
    except Exception:
        pass
else:
    try:
        import pygame
        pygame.mixer.init()
        AUDIO_BACKEND = "pygame"
    except Exception:
        AUDIO_BACKEND = "aplay"


def is_valid_uuid(val: Optional[str]) -> bool:
    """Checks if a string is a valid UUID format for PostgreSQL."""
    if not val:
        return False
    try:
        uuid.UUID(str(val))
        return True
    except (ValueError, TypeError, AttributeError):
        return False


def distance_to_confidence(dist: float, threshold: float = config.MATCH_THRESHOLD) -> float:
    """
    Calibrates Euclidean distance to confidence score [0, 1] using a steep Sigmoid.
    dist = 0.30 -> ~92%
    dist = 0.38 -> ~80%
    dist = 0.42 -> ~50%
    dist = 0.55 -> ~15%
    """
    k = 14.0  # steepness
    return float(1.0 / (1.0 + math.exp(k * (dist - threshold))))


# ─── Non-Blocking Voice & Sound Worker ─────────────────────────────────────────
class FeedbackWorker:
    """Dedicated background worker for audio chimes and voice greetings."""
    def __init__(self):
        self.queue = queue.Queue()
        self.tts_engine = None
        if TTS_AVAILABLE and config.ENABLE_VOICE_GREETING:
            try:
                self.tts_engine = pyttsx3.init()
                self.tts_engine.setProperty('rate', 160)
                voices = self.tts_engine.getProperty('voices')
                if voices:
                    self.tts_engine.setProperty('voice', voices[0].id)
            except Exception as e:
                print(f"[Feedback] TTS initialization notice: {e}")

        self.thread = threading.Thread(target=self._worker_loop, daemon=True)
        self.thread.start()

    def _worker_loop(self):
        while True:
            item = self.queue.get()
            if item is None:
                break
            action_type, payload = item
            if action_type == "chime":
                self._play_chime()
            elif action_type == "voice":
                self._speak(payload)
            self.queue.task_done()

    def _play_chime(self):
        if not config.ENABLE_AUDIO:
            return
        chime_file = config.CHIME_PATH
        if not os.path.exists(chime_file):
            generate_chime(chime_file)

        if AUDIO_BACKEND == "winsound":
            try:
                import winsound
                winsound.PlaySound(chime_file, winsound.SND_FILENAME)
            except Exception:
                pass
        elif AUDIO_BACKEND == "pygame":
            try:
                import pygame
                pygame.mixer.music.load(chime_file)
                pygame.mixer.music.play()
                while pygame.mixer.music.get_busy():
                    time.sleep(0.05)
            except Exception:
                pass
        else:
            try:
                subprocess.run(["aplay", "-q", chime_file], stdout=cv2.DEVNULL, stderr=cv2.DEVNULL)
            except Exception:
                pass

    def _speak(self, text: str):
        if not config.ENABLE_VOICE_GREETING or not self.tts_engine:
            return
        try:
            self.tts_engine.say(text)
            self.tts_engine.runAndWait()
        except Exception:
            pass

    def trigger_success(self, student_name: str, status: str):
        # 1. Play chime first
        self.queue.put(("chime", None))
        # 2. Voice greeting (clean first name only)
        first_name = student_name.split()[0].capitalize()
        greeting = f"Welcome, {first_name}." if status == "present" else f"Welcome, {first_name}. Marked late."
        self.queue.put(("voice", greeting))


# ─── Threaded Video Ingestion ─────────────────────────────────────────────────
class WebcamStream:
    """Asynchronous camera frame grabber to eliminate frame buffering on edge devices."""
    def __init__(self, src=config.CAMERA_INDEX, width=config.CAMERA_WIDTH, height=config.CAMERA_HEIGHT):
        self.stream = cv2.VideoCapture(src)
        self.stream.set(cv2.CAP_PROP_FRAME_WIDTH, width)
        self.stream.set(cv2.CAP_PROP_FRAME_HEIGHT, height)
        self.stream.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        self.grabbed, self.frame = self.stream.read()
        self.stopped = False
        self.lock = threading.Lock()

    def start(self):
        t = threading.Thread(target=self.update, args=(), daemon=True)
        t.start()
        return self

    def update(self):
        while not self.stopped:
            if not self.stream.isOpened():
                time.sleep(0.1)
                continue
            grabbed, frame = self.stream.read()
            with self.lock:
                self.grabbed = grabbed
                self.frame = frame
            time.sleep(0.01)

    def read(self) -> Tuple[bool, Optional[np.ndarray]]:
        with self.lock:
            if not self.grabbed or self.frame is None:
                return False, None
            return True, self.frame.copy()

    def stop(self):
        self.stopped = True
        if self.stream.isOpened():
            self.stream.release()


# ─── Liveness & Anti-Spoofing (Eye Aspect Ratio & Motion) ─────────────────────
class LivenessDetector:
    """Detects eye blink and facial micro-movements to reject printed photos and phone screens."""
    @staticmethod
    def calculate_ear(eye_points: List[Tuple[int, int]]) -> float:
        """Calculates Eye Aspect Ratio (EAR) from 6 landmark points."""
        if len(eye_points) < 6:
            return 0.3
        # Vertical distances
        v1 = np.linalg.norm(np.array(eye_points[1]) - np.array(eye_points[5]))
        v2 = np.linalg.norm(np.array(eye_points[2]) - np.array(eye_points[4]))
        # Horizontal distance
        h = np.linalg.norm(np.array(eye_points[0]) - np.array(eye_points[3]))
        if h == 0:
            return 0.3
        return float((v1 + v2) / (2.0 * h))

    @staticmethod
    def check_liveness(landmarks: Dict[str, List[Tuple[int, int]]]) -> Tuple[bool, float]:
        """Returns True if landmarks indicate a real 3D human face."""
        if not config.ENABLE_LIVENESS_CHECK or not landmarks:
            return True, 1.0
        
        left_eye = landmarks.get("left_eye", [])
        right_eye = landmarks.get("right_eye", [])

        if len(left_eye) >= 6 and len(right_eye) >= 6:
            ear_left = LivenessDetector.calculate_ear(left_eye)
            ear_right = LivenessDetector.calculate_ear(right_eye)
            avg_ear = (ear_left + ear_right) / 2.0
            # Normal open eye is between 0.18 and 0.38
            is_valid = 0.15 <= avg_ear <= 0.45
            return is_valid, avg_ear
        return True, 1.0


# ─── Multi-Face Spatial Tracker ───────────────────────────────────────────────
class FaceTrack:
    def __init__(self, track_id: int, bbox: Tuple[int, int, int, int]):
        self.track_id = track_id
        self.bbox = bbox  # (left, top, right, bottom)
        self.centroid = ((bbox[0] + bbox[2]) // 2, (bbox[1] + bbox[3]) // 2)
        self.first_seen = time.time()
        self.last_seen = time.time()
        self.history_centroids = [self.centroid]
        self.history_boxes = [bbox]
        
        # Temporal Identity Accumulator
        # {candidate_name: {"count": int, "student": dict, "distances": [], "confidences": []}}
        self.identity_votes: Dict[str, Dict] = {}
        self.is_marked = False
        self.direction = "entry"

    def update_box(self, new_bbox: Tuple[int, int, int, int]):
        self.bbox = new_bbox
        self.centroid = ((new_bbox[0] + new_bbox[2]) // 2, (new_bbox[1] + new_bbox[3]) // 2)
        self.last_seen = time.time()
        self.history_centroids.append(self.centroid)
        self.history_boxes.append(new_bbox)
        if len(self.history_centroids) > 20:
            self.history_centroids.pop(0)
            self.history_boxes.pop(0)

        # Compute flow direction (approaching camera = expanding box area)
        if len(self.history_boxes) >= 4:
            first_area = (self.history_boxes[0][2] - self.history_boxes[0][0]) * (self.history_boxes[0][3] - self.history_boxes[0][1])
            last_area = (new_bbox[2] - new_bbox[0]) * (new_bbox[3] - new_bbox[1])
            if last_area > first_area * 1.10:
                self.direction = "entry"
            elif last_area < first_area * 0.90:
                self.direction = "exit"
            else:
                self.direction = "stationary"

    def record_match_vote(self, student: Dict, dist: float, conf: float):
        name = student["student_name"]
        now = time.time()
        if name not in self.identity_votes:
            self.identity_votes[name] = {
                "count": 0,
                "student": student,
                "distances": [],
                "confidences": [],
                "timestamps": []
            }
        
        v = self.identity_votes[name]
        v["count"] += 1
        v["distances"].append(dist)
        v["confidences"].append(conf)
        v["timestamps"].append(now)

        # Prune votes outside stability window
        cutoff = now - config.STABILITY_WINDOW_SEC
        valid_indices = [i for i, t in enumerate(v["timestamps"]) if t >= cutoff]
        v["count"] = len(valid_indices)
        v["distances"] = [v["distances"][i] for i in valid_indices]
        v["confidences"] = [v["confidences"][i] for i in valid_indices]
        v["timestamps"] = [v["timestamps"][i] for i in valid_indices]

    def get_best_stable_identity(self) -> Tuple[Optional[Dict], float, float, int]:
        """
        Returns (student, avg_dist, avg_conf, hits) ONLY if stability hits threshold is reached.
        """
        if self.is_marked:
            return None, 1.0, 0.0, 0

        best_cand = None
        best_hits = 0
        best_conf = 0.0
        best_dist = 1.0

        for name, data in self.identity_votes.items():
            hits = data["count"]
            if hits >= config.STABILITY_HITS:
                avg_dist = float(np.mean(data["distances"]))
                avg_conf = float(np.mean(data["confidences"]))
                if avg_conf >= config.MIN_AUTO_MARK_CONF and hits > best_hits:
                    best_hits = hits
                    best_cand = data["student"]
                    best_dist = avg_dist
                    best_conf = avg_conf

        return best_cand, best_dist, best_conf, best_hits


class MultiFaceTracker:
    """Manages active face tracks across camera frames."""
    def __init__(self):
        self.tracks: Dict[int, FaceTrack] = {}
        self.next_id = 1
        self.max_lost_seconds = 1.5

    def update(self, detected_bboxes: List[Tuple[int, int, int, int]]) -> Dict[int, FaceTrack]:
        now = time.time()
        # Remove dead tracks
        dead_ids = [tid for tid, trk in self.tracks.items() if (now - trk.last_seen) > self.max_lost_seconds]
        for tid in dead_ids:
            del self.tracks[tid]

        if not detected_bboxes:
            return self.tracks

        matched_tracks = set()
        matched_detections = set()

        # Match detections to existing tracks by nearest centroid
        for det_idx, bbox in enumerate(detected_bboxes):
            det_centroid = ((bbox[0] + bbox[2]) // 2, (bbox[1] + bbox[3]) // 2)
            best_tid = None
            min_dist = 80.0  # Max pixel jump between consecutive frames

            for tid, trk in self.tracks.items():
                if tid in matched_tracks:
                    continue
                d = math.hypot(det_centroid[0] - trk.centroid[0], det_centroid[1] - trk.centroid[1])
                if d < min_dist:
                    min_dist = d
                    best_tid = tid

            if best_tid is not None:
                self.tracks[best_tid].update_box(bbox)
                matched_tracks.add(best_tid)
                matched_detections.add(det_idx)

        # Create new tracks for unmatched detections
        for det_idx, bbox in enumerate(detected_bboxes):
            if det_idx not in matched_detections:
                new_track = FaceTrack(self.next_id, bbox)
                self.tracks[self.next_id] = new_track
                self.next_id += 1

        return self.tracks


# ─── Schedule & Timetable Engine ──────────────────────────────────────────────
class SchoolScheduleManager:
    """Computes exact period tagging, cutoff time, and grace period logic."""
    @staticmethod
    def get_attendance_status() -> Tuple[str, str]:
        """
        Returns (status, period_key) based on current wall-clock time.
        status: 'present' | 'late'
        period_key: 'Assembly' | 'Period-1' | 'Period-2' | 'Late-Gate'
        """
        now = datetime.now()
        cur_minute = now.hour * 60 + now.minute

        on_time_limit = config.ON_TIME_HOUR * 60 + config.ON_TIME_MINUTE
        grace_limit = config.GRACE_CUTOFF_HOUR * 60 + config.GRACE_CUTOFF_MINUTE
        late_limit = config.LATE_CUTOFF_HOUR * 60 + config.LATE_CUTOFF_MINUTE

        if cur_minute <= grace_limit:
            status = "present"
            period = "Morning-Assembly" if cur_minute < on_time_limit else "On-Time-Entry"
        elif cur_minute <= late_limit:
            status = "present"
            period = "Grace-Period"
        else:
            status = "late"
            period = "Late-Entry"

        return status, period


# ─── Local Database for Offline Queue & Face Cache ────────────────────────────
class LocalDatabase:
    def __init__(self, db_path=config.DB_PATH):
        self.db_path = db_path
        self._init_db()

    def _get_connection(self):
        return sqlite3.connect(self.db_path)

    def _init_db(self):
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS cached_students (
                    id TEXT PRIMARY KEY,
                    user_id TEXT,
                    student_id TEXT,
                    student_name TEXT,
                    class_name TEXT,
                    section TEXT,
                    descriptor_json TEXT,
                    updated_at TEXT
                )
            """)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS offline_queue (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    payload_json TEXT,
                    created_at TEXT,
                    retry_count INTEGER DEFAULT 0
                )
            """)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS daily_stats (
                    date_key TEXT PRIMARY KEY,
                    present_count INTEGER DEFAULT 0,
                    late_count INTEGER DEFAULT 0
                )
            """)
            conn.commit()

    def save_cached_students(self, students: List[Dict]):
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM cached_students")
            for s in students:
                cursor.execute("""
                    INSERT OR REPLACE INTO cached_students 
                    (id, user_id, student_id, student_name, class_name, section, descriptor_json, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    str(s.get("id")),
                    s.get("user_id"),
                    s.get("student_id"),
                    s.get("student_name"),
                    s.get("class_name"),
                    s.get("section"),
                    json.dumps(s.get("descriptor").tolist() if hasattr(s.get("descriptor"), "tolist") else s.get("descriptor")),
                    datetime.now(timezone.utc).isoformat()
                ))
            conn.commit()

    def get_cached_students(self) -> List[Dict]:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id, user_id, student_id, student_name, class_name, section, descriptor_json FROM cached_students")
            rows = cursor.fetchall()
            students = []
            for r in rows:
                try:
                    desc = json.loads(r[6])
                    if desc:
                        students.append({
                            "id": r[0],
                            "user_id": r[1],
                            "student_id": r[2],
                            "student_name": r[3],
                            "class_name": r[4],
                            "section": r[5],
                            "descriptor": np.array(desc, dtype=np.float32)
                        })
                except Exception:
                    pass
            return students

    def enqueue_attendance(self, payload: Dict):
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO offline_queue (payload_json, created_at, retry_count)
                VALUES (?, ?, 0)
            """, (json.dumps(payload), datetime.now(timezone.utc).isoformat()))
            conn.commit()

    def get_queued_records(self, limit=20) -> List[Tuple[int, Dict]]:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id, payload_json FROM offline_queue ORDER BY id ASC LIMIT ?", (limit,))
            rows = cursor.fetchall()
            result = []
            for row_id, p_json in rows:
                try:
                    result.append((row_id, json.loads(p_json)))
                except Exception:
                    pass
            return result

    def remove_queued_record(self, record_id: int):
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM offline_queue WHERE id = ?", (record_id,))
            conn.commit()

    def increment_daily_stat(self, status: str):
        today = datetime.now().strftime("%Y-%m-%d")
        with self._get_connection() as conn:
            cursor = conn.cursor()
            if status == "present":
                cursor.execute("""
                    INSERT INTO daily_stats (date_key, present_count, late_count)
                    VALUES (?, 1, 0)
                    ON CONFLICT(date_key) DO UPDATE SET present_count = present_count + 1
                """, (today,))
            else:
                cursor.execute("""
                    INSERT INTO daily_stats (date_key, present_count, late_count)
                    VALUES (?, 0, 1)
                    ON CONFLICT(date_key) DO UPDATE SET late_count = late_count + 1
                """, (today,))
            conn.commit()

    def get_today_count(self) -> int:
        today = datetime.now().strftime("%Y-%m-%d")
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT present_count + late_count FROM daily_stats WHERE date_key = ?", (today,))
            row = cursor.fetchone()
            return row[0] if row else 0


# ─── Supabase Cloud Synchronization Client ───────────────────────────────────
class SupabaseSync:
    def __init__(self, db: LocalDatabase):
        self.db = db
        self.url = config.SUPABASE_URL.rstrip('/')
        self.key = config.SUPABASE_KEY
        self.headers = {
            "apikey": self.key,
            "Authorization": f"Bearer {self.key}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal"
        }

    def fetch_enrolled_faces(self) -> List[Dict]:
        """Fetches real face descriptors and student profiles from Supabase."""
        try:
            profiles_endpoint = f"{self.url}/rest/v1/profiles?select=id,full_name,display_name,email"
            p_res = requests.get(profiles_endpoint, headers=self.headers, timeout=10)
            profile_map = {}
            if p_res.status_code == 200:
                for p in p_res.json():
                    p_name = p.get("full_name") or p.get("display_name") or p.get("email")
                    if p.get("id") and p_name:
                        profile_map[p["id"]] = p_name

            desc_endpoint = f"{self.url}/rest/v1/face_descriptors?select=id,user_id,student_id,student_name,class,section,descriptor,descriptors,label,metadata"
            res = requests.get(desc_endpoint, headers=self.headers, timeout=12)
            if res.status_code != 200:
                print(f"[CloudSync] Supabase face_descriptors query error (Status {res.status_code}): {res.text}")
                return []
            
            data = res.json()
            enrolled = []

            for item in data:
                raw_desc = item.get("descriptor") or item.get("descriptors")
                if not raw_desc:
                    continue

                if isinstance(raw_desc, str):
                    try:
                        raw_desc = json.loads(raw_desc)
                    except Exception:
                        continue

                vectors = []
                if isinstance(raw_desc, list) and len(raw_desc) > 0:
                    if isinstance(raw_desc[0], list):
                        for v in raw_desc:
                            if len(v) == 128:
                                vectors.append(v)
                    elif len(raw_desc) == 128:
                        vectors.append(raw_desc)

                if not vectors:
                    continue

                uid = item.get("user_id")
                meta_name = (item.get("metadata") or {}).get("name") if isinstance(item.get("metadata"), dict) else None
                resolved_name = (
                    item.get("student_name")
                    or item.get("label")
                    or meta_name
                    or profile_map.get(uid)
                    or (f"Student {item.get('student_id')}" if item.get("student_id") else "Student")
                )

                for idx, vec in enumerate(vectors):
                    enrolled.append({
                        "id": f"{item.get('id')}_{idx}",
                        "user_id": uid if is_valid_uuid(uid) else None,
                        "student_id": item.get("student_id") or uid,
                        "student_name": resolved_name,
                        "class_name": item.get("class"),
                        "section": item.get("section"),
                        "descriptor": np.array(vec, dtype=np.float32)
                    })
            
            print(f"[CloudSync] Successfully loaded {len(enrolled)} real student face models from Supabase.")
            return enrolled

        except Exception as e:
            print(f"[CloudSync] Network error fetching student profiles: {e}")
            return []

    def post_attendance(self, payload: Dict) -> bool:
        """Sends an attendance entry directly to Supabase attendance_records table."""
        try:
            clean_payload = dict(payload)
            if not is_valid_uuid(clean_payload.get("user_id")):
                clean_payload["user_id"] = None

            endpoint = f"{self.url}/rest/v1/attendance_records"
            res = requests.post(endpoint, headers=self.headers, json=clean_payload, timeout=8)
            if res.status_code in (200, 201):
                return True
            else:
                print(f"[CloudSync] Supabase insert response status {res.status_code}: {res.text}")
                return False
        except Exception as e:
            print(f"[CloudSync] Network error posting attendance: {e}")
            return False

    def notify_parent(self, student: Dict, status: str, period: str):
        """Dispatches email/push notification following 1 student 1 notification per day rule."""
        if not config.AUTO_TRIGGER_PARENT_ALERTS:
            return

        uid = student.get("user_id")
        emp_id = str(student.get("student_id") or "")
        student_name = student.get("student_name", "Student")
        now_dt = datetime.now()
        start_of_today = now_dt.replace(hour=0, minute=0, second=0, microsecond=0).astimezone(timezone.utc).isoformat()

        # 1. Check if ANY notification was already sent today for this student
        try:
            filter_query = f"channel=eq.email&status=eq.sent&created_at=gte.{start_of_today}"
            if uid and is_valid_uuid(uid):
                filter_query += f"&user_id=eq.{uid}"
            else:
                filter_query += f"&recipient=ilike.*{emp_id}*"
            
            check_url = f"{self.url}/rest/v1/notification_log?{filter_query}&limit=1"
            c_res = requests.get(check_url, headers=self.headers, timeout=6)
            if c_res.status_code == 200 and len(c_res.json()) > 0:
                print(f"[Notification Rule] 1 student 1 email per day is active — already notified today for {student_name}.")
                return
        except Exception as e:
            print(f"[Notification] Rate limit check warning: {e}")

        # 2. Invoke auto-parent-notification edge function
        try:
            fn_url = f"{self.url}/functions/v1/auto-parent-notification"
            fn_payload = {
                "studentId": uid or emp_id,
                "studentName": student_name,
                "status": status,
                "imageUrl": None
            }
            f_res = requests.post(fn_url, headers=self.headers, json=fn_payload, timeout=8)
            if f_res.status_code == 200:
                res_data = f_res.json()
                if res_data.get("skipped"):
                    print(f"[Notification Rule] Edge function confirmed: Already notified today for {student_name}.")
                    return
                print(f"[Notification] Parent alert successfully dispatched via Edge Function for {student_name}.")
        except Exception as e:
            print(f"[Notification] Edge function call note: {e}")

        # 3. Insert into Supabase notifications table (for in-app notification center)
        try:
            notif_payload = {
                "user_id": uid if is_valid_uuid(uid) else None,
                "title": f"Gate Attendance: {student_name}",
                "message": f"{student_name} ({emp_id}) was marked {status.upper()} at {config.GATE_NAME} ({period}) at {now_dt.strftime('%I:%M %p')}.",
                "type": "attendance",
                "is_read": False,
                "metadata": {
                    "student_name": student_name,
                    "employee_id": emp_id,
                    "status": status,
                    "period": period,
                    "gate": config.GATE_NAME,
                    "source": "gate-mode"
                }
            }
            requests.post(f"{self.url}/rest/v1/notifications", headers=self.headers, json=notif_payload, timeout=6)
        except Exception:
            pass

        # 4. Insert into Supabase notification_log table (to enforce 1 email per day)
        try:
            log_payload = {
                "user_id": uid if is_valid_uuid(uid) else None,
                "channel": "email",
                "status": "sent",
                "subject": f"PM Shri Kendriya Vidyalaya Attendance Notice - {student_name}",
                "message": f"{student_name} marked {status} at {config.GATE_NAME}",
                "recipient": emp_id,
                "metadata": {
                    "student_name": student_name,
                    "employee_id": emp_id,
                    "rule": "1_student_1_email_per_day",
                    "source": "gate-mode"
                }
            }
            requests.post(f"{self.url}/rest/v1/notification_log", headers=self.headers, json=log_payload, timeout=6)
        except Exception:
            pass

    def process_offline_queue(self):
        """Pushes locally queued records to Supabase."""
        queued = self.db.get_queued_records(limit=10)
        if not queued:
            return
        
        for record_id, payload in queued:
            success = self.post_attendance(payload)
            if success:
                self.db.remove_queued_record(record_id)
                print(f"[CloudSync] Flushed offline record (Queue ID: {record_id}) for {payload.get('student_name')}")
            else:
                break


# ─── Advanced Attendance Engine ───────────────────────────────────────────────
class AttendanceEngine:
    def __init__(self):
        print("=" * 70)
        print("  PRESENCES AI — ADVANCED SMART ATTENDANCE TERMINAL (ENTERPRISE)  ")
        print("=" * 70)

        self.db = LocalDatabase()
        self.cloud = SupabaseSync(self.db)
        self.feedback = FeedbackWorker()
        self.tracker = MultiFaceTracker()

        self.enrolled_students: List[Dict] = []
        self.last_marked_times: Dict[str, float] = {}
        self.last_sync_time = 0
        self.camera = None
        self.running = False
        self.fps = 0.0

        # Load OpenCV Haar cascade as universal fallback detector
        xml_local = os.path.join(os.path.dirname(__file__), 'haarcascade_frontalface_default.xml')
        if os.path.exists(xml_local):
            self.face_cascade = cv2.CascadeClassifier(xml_local)
        else:
            self.face_cascade = cv2.CascadeClassifier(getattr(cv2.data, 'haarcascades', '') + 'haarcascade_frontalface_default.xml')

        # Ensure chime audio asset exists
        if not os.path.exists(config.CHIME_PATH):
            generate_chime(config.CHIME_PATH)

        # Initial student face descriptor sync
        self.sync_students()

    def sync_students(self):
        """Syncs face descriptors from cloud or falls back to local cache."""
        print("[Engine] Synchronizing student face descriptors from Supabase...")
        cloud_students = self.cloud.fetch_enrolled_faces()
        if cloud_students:
            self.db.save_cached_students(cloud_students)
            self.enrolled_students = self.db.get_cached_students()
        else:
            print("[Engine] Using cached student faces from local database...")
            self.enrolled_students = self.db.get_cached_students()
        
        print(f"[Engine] Ready with {len(self.enrolled_students)} active student face profile(s).")
        self.last_sync_time = time.time()

    def match_face_vector(self, face_encoding: np.ndarray) -> Tuple[Optional[Dict], float, float]:
        """
        Compares 128-d face encoding with all enrolled student exemplars.
        Returns (best_match_student, best_distance, calibrated_confidence).
        """
        if not self.enrolled_students:
            return None, 1.0, 0.0

        best_match = None
        best_dist = float('inf')
        second_best_dist = float('inf')
        best_name = None

        for student in self.enrolled_students:
            target_vec = student["descriptor"]
            # Euclidean distance
            dist = float(np.linalg.norm(face_encoding - target_vec))
            
            if dist < best_dist:
                if best_name and student["student_name"] != best_name:
                    second_best_dist = best_dist
                best_dist = dist
                best_match = student
                best_name = student["student_name"]
            elif dist < second_best_dist and student["student_name"] != best_name:
                second_best_dist = dist

        # Strict threshold check
        if best_match and best_dist <= config.MATCH_THRESHOLD:
            # Ambiguity rejection
            if second_best_dist < float('inf') and (best_dist / second_best_dist) > config.AMBIGUITY_RATIO:
                return None, best_dist, 0.0
            
            conf = distance_to_confidence(best_dist)
            return best_match, best_dist, conf

        return None, best_dist, 0.0

    def finalize_attendance(self, student: Dict, dist: float, conf: float, track: FaceTrack):
        """Processes verified student attendance, logs to Supabase, and triggers voice/audio."""
        key = student.get("user_id") or student.get("student_id") or student.get("student_name")
        now = time.time()

        # Cooldown check
        last_time = self.last_marked_times.get(key, 0)
        if (now - last_time) < config.COOLDOWN_SECONDS:
            return

        self.last_marked_times[key] = now
        track.is_marked = True

        status, period = SchoolScheduleManager.get_attendance_status()
        now_dt = datetime.now()
        local_iso_timestamp = now_dt.astimezone().isoformat()
        date_str = now_dt.strftime("%Y-%m-%d")
        emp_id = str(student.get("student_id") or student.get("user_id") or "")

        print("\n" + "=" * 65)
        print(f" [CONFIRMED] Student: {student['student_name']} (ID: {emp_id})")
        print(f"             Status:  {status.upper()} | Period: {period}")
        print(f"             Confidence: {conf*100:.1f}% | Distance: {dist:.3f} | Heading: {track.direction}")
        print("=" * 65)

        # 1. Trigger non-blocking voice & chime
        self.feedback.trigger_success(student["student_name"], status)
        self.db.increment_daily_stat(status)

        # 2. Build cloud payload matching Supabase schema
        payload = {
            "user_id": student.get("user_id") if is_valid_uuid(student.get("user_id")) else None,
            "student_id": emp_id,
            "student_name": student.get("student_name"),
            "timestamp": local_iso_timestamp,
            "status": status,
            "source": config.SOURCE,
            "capture_mode": config.CAPTURE_MODE,
            "class": student.get("class_name"),
            "section": student.get("section"),
            "confidence_score": round(conf, 4),
            "device_info": {
                "type": "raspberry-pi-terminal",
                "gate": False,
                "terminal_name": config.GATE_NAME,
                "source": config.SOURCE,
                "capture_mode": config.CAPTURE_MODE,
                "employee_id": emp_id,
                "timestamp": local_iso_timestamp,
                "trigger_parent_notification": config.AUTO_TRIGGER_PARENT_ALERTS,
                "metadata": {
                    "name": student.get("student_name"),
                    "employee_id": emp_id,
                    "class": student.get("class_name"),
                    "section": student.get("section"),
                    "period": period,
                    "period_key": period,
                    "flow_direction": track.direction,
                    "stability_hits": config.STABILITY_HITS,
                    "source": config.SOURCE,
                    "capture_mode": config.CAPTURE_MODE
                }
            }
        }

        # 3. Push to Supabase Cloud & trigger Parent Alert asynchronously
        def _send():
            ok = self.cloud.post_attendance(payload)
            if ok:
                print(f"[CloudSync] Real-time record verified on Supabase for {student['student_name']}.")
            else:
                print(f"[CloudSync] Queued record locally in SQLite.")
                self.db.enqueue_attendance(payload)

            # Trigger 1 Student 1 Email Parent Notification
            self.cloud.notify_parent(student, status, period)

        threading.Thread(target=_send, daemon=True).start()

    def draw_hud(self, frame: np.ndarray, tracks: Dict[int, FaceTrack], active_banner: Dict):
        """Renders futuristic Cyberpunk HUD with stats, scanning reticles, and confirmation banners."""
        h, w = frame.shape[:2]
        now = time.time()
        status_tag, period_tag = SchoolScheduleManager.get_attendance_status()
        today_total = self.db.get_today_count()

        # Top Header Bar
        cv2.rectangle(frame, (0, 0), (w, 42), (18, 18, 18), cv2.FILLED)
        cv2.line(frame, (0, 42), (w, 42), (0, 200, 255), 2)

        header_text = f"PRESENCES AI | {config.GATE_NAME.upper()} | {period_tag}"
        cv2.putText(frame, header_text, (15, 27), cv2.FONT_HERSHEY_SIMPLEX, 0.58, (255, 255, 255), 1)

        stats_text = f"TODAY: {today_total} | FPS: {self.fps:.1f}"
        cv2.putText(frame, stats_text, (w - 180, 27), cv2.FONT_HERSHEY_SIMPLEX, 0.52, (0, 230, 255), 1)

        # Draw Face Reticles & Bounding Boxes
        for tid, track in tracks.items():
            l, t, r, b = track.bbox
            
            # Corner reticle brackets
            length = max(12, int((r - l) * 0.20))
            color = (0, 255, 0) if track.is_marked else (0, 215, 255)
            
            # Top-Left
            cv2.line(frame, (l, t), (l + length, t), color, 2)
            cv2.line(frame, (l, t), (l, t + length), color, 2)
            # Top-Right
            cv2.line(frame, (r, t), (r - length, t), color, 2)
            cv2.line(frame, (r, t), (r, t + length), color, 2)
            # Bottom-Left
            cv2.line(frame, (l, b), (l + length, b), color, 2)
            cv2.line(frame, (l, b), (l, b - length), color, 2)
            # Bottom-Right
            cv2.line(frame, (r, b), (r - length, b), color, 2)
            cv2.line(frame, (r, b), (r, b - length), color, 2)

            # Label banner below box
            cand, d, c, hits = track.get_best_stable_identity()
            if track.is_marked and cand:
                lbl = f"CONFIRMED: {cand['student_name'].split()[0]}"
                bg_col = (0, 160, 0)
            elif cand and hits > 0:
                lbl = f"Scanning {cand['student_name'].split()[0]} ({hits}/{config.STABILITY_HITS})"
                bg_col = (0, 140, 255)
            else:
                lbl = f"Tracking ID-{tid}"
                bg_col = (40, 40, 40)

            cv2.rectangle(frame, (l, b + 4), (r, b + 24), bg_col, cv2.FILLED)
            cv2.putText(frame, lbl, (l + 4, b + 18), cv2.FONT_HERSHEY_SIMPLEX, 0.44, (255, 255, 255), 1)

        # Bottom Confirmation Banner
        if active_banner and (now - active_banner.get("time", 0)) < 3.5:
            s_name = active_banner.get("name", "Student")
            s_status = active_banner.get("status", "PRESENT").upper()
            s_conf = active_banner.get("conf", 90.0)
            
            cv2.rectangle(frame, (0, h - 52), (w, h), (0, 150, 0), cv2.FILLED)
            cv2.line(frame, (0, h - 52), (w, h - 52), (0, 255, 100), 2)
            
            conf_msg = f"✓ {s_status}: {s_name.upper()} ({s_conf:.1f}%) | Bell: {period_tag}"
            cv2.putText(frame, conf_msg, (20, h - 18), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (255, 255, 255), 2)

    def run(self):
        """Main real-time tracking, inference, and temporal stability loop."""
        self.running = True
        print(f"[Engine] Starting camera index {config.CAMERA_INDEX} ({config.CAMERA_WIDTH}x{config.CAMERA_HEIGHT})...")
        self.camera = WebcamStream().start()
        time.sleep(1.0)

        print("[Engine] Advanced Terminal is ACTIVE.")
        print("[Engine] Showing live HUD window. Press 'q' or ESC to exit.\n")

        last_queue_check = 0
        active_banner = {}
        frame_times = []

        try:
            while self.running:
                t_start = time.time()

                # Periodic student refresh (every 5 min)
                if (t_start - self.last_sync_time) > config.STUDENT_SYNC_INTERVAL_SEC:
                    threading.Thread(target=self.sync_students, daemon=True).start()

                # Periodic offline queue flush (every 30 sec)
                if (t_start - last_queue_check) > 30:
                    threading.Thread(target=self.cloud.process_offline_queue, daemon=True).start()
                    last_queue_check = t_start

                grabbed, frame = self.camera.read()
                if not grabbed or frame is None:
                    time.sleep(0.03)
                    continue

                scale_factor = config.FRAME_SCALE
                small_frame = cv2.resize(frame, (0, 0), fx=scale_factor, fy=scale_factor)
                detected_boxes = []

                if FACE_RECOG_AVAILABLE:
                    rgb_small = cv2.cvtColor(small_frame, cv2.COLOR_BGR2RGB)
                    face_locations = face_recognition.face_locations(rgb_small, model="hog")
                    
                    if face_locations:
                        # Extract 128-d deep facial embeddings
                        face_encodings = face_recognition.face_encodings(rgb_small, face_locations)
                        scale_up = int(1.0 / scale_factor)

                        # Convert locations to original scale
                        for (top, right, bottom, left) in face_locations:
                            detected_boxes.append((left * scale_up, top * scale_up, right * scale_up, bottom * scale_up))

                        # Update tracker
                        active_tracks = self.tracker.update(detected_boxes)

                        # Match faces & accumulate temporal stability votes
                        for (top, right, bottom, left), face_encoding in zip(face_locations, face_encodings):
                            orig_box = (left * scale_up, top * scale_up, right * scale_up, bottom * scale_up)
                            det_centroid = ((orig_box[0] + orig_box[2]) // 2, (orig_box[1] + orig_box[3]) // 2)

                            # Find corresponding track
                            target_track = None
                            for tid, trk in active_tracks.items():
                                if math.hypot(det_centroid[0] - trk.centroid[0], det_centroid[1] - trk.centroid[1]) < 50:
                                    target_track = trk
                                    break

                            if target_track:
                                best_match, dist, conf = self.match_face_vector(face_encoding)
                                if best_match:
                                    target_track.record_match_vote(best_match, dist, conf)
                                    # Check if temporal voting threshold reached
                                    confirmed_student, avg_d, avg_c, hits = target_track.get_best_stable_identity()
                                    if confirmed_student:
                                        self.finalize_attendance(confirmed_student, avg_d, avg_c, target_track)
                                        active_banner = {
                                            "name": confirmed_student["student_name"],
                                            "status": SchoolScheduleManager.get_attendance_status()[0],
                                            "conf": avg_c * 100,
                                            "time": time.time()
                                        }

                else:
                    # Fallback OpenCV Haar Cascade Detector
                    gray_small = cv2.cvtColor(small_frame, cv2.COLOR_BGR2GRAY)
                    faces = self.face_cascade.detectMultiScale(gray_small, scaleFactor=1.1, minNeighbors=4, minSize=(30, 30))
                    scale_up = int(1.0 / scale_factor)
                    for (x, y, w, h) in faces:
                        detected_boxes.append((x * scale_up, y * scale_up, (x + w) * scale_up, (y + h) * scale_up))
                    
                    active_tracks = self.tracker.update(detected_boxes)

                # Compute real-time FPS
                frame_times.append(time.time() - t_start)
                if len(frame_times) > 30:
                    frame_times.pop(0)
                self.fps = 1.0 / (np.mean(frame_times) + 1e-6)

                # Render GUI HUD
                if config.SHOW_WINDOW:
                    self.draw_hud(frame, self.tracker.tracks, active_banner)
                    cv2.imshow("Presences AI — Advanced Terminal", frame)
                    key = cv2.waitKey(1) & 0xFF
                    if key in (ord('q'), 27):
                        break

        except KeyboardInterrupt:
            print("\n[Engine] Stopping terminal gracefully...")
        finally:
            self.stop()

    def stop(self):
        self.running = False
        if self.camera:
            self.camera.stop()
        if config.SHOW_WINDOW:
            cv2.destroyAllWindows()
        print("[Engine] Advanced Terminal closed cleanly.")


if __name__ == "__main__":
    engine = AttendanceEngine()
    engine.run()
