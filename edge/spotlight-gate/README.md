# 🌟 Presences Spotlight AI — Gate Attendance System

**Presences Spotlight AI** is an enterprise-grade, high-throughput walk-through face recognition terminal built specifically for schools and campuses with **2,000+ students**.

---

## 🚀 Key Features

- **Walk-Through Corridor Recognition**: Processes students arriving in single/double lines at the gate corridor.
- **Single PoE Varifocal Camera Support**: Ingests 1080p @ 30 FPS RTSP streams with zero buffer delay.
- **Sub-Millisecond Vector Search**: In-memory vectorized matrix matching searches 2,000+ student embeddings in **< 1 ms**.
- **Anti-False Attendance Safeguards**:
  - **Multi-Frame Consensus Voting**: Requires 3+ consecutive frames agreeing on the same identity before confirming.
  - **Ambiguity Ratio Protection**: Rejects matches when two candidate identities have overly close confidence scores.
  - **1-Student-1-Email-Per-Day Rate Limiting**: Ensures parents receive exactly one arrival email per day.
  - **Daily Session Cooldown**: Locks duplicate marks once a student is verified for the morning.
- **Offline Resilience**: Instant 0ms SQLite logging with background auto-sync to Supabase Cloud.
- **Kiosk HUD**: Live bounding boxes, student profile popups, on-time/late counters, and audio chime feedback.

---

## 🛠️ Quick Start

### 1. Configure Environment
Copy `.env.example` to `.env` and fill in your Supabase credentials and camera RTSP stream URL:
```bash
cp .env.example .env
```

### 2. Multi-Angle Student Enrollment
To enroll a student with 3 camera angles (Frontal, Left 15°, Right 15°):
```bash
python enrollment_tool.py
```

### 3. Launch Spotlight Gate Engine
To start the live gate terminal:
```bash
python spotlight_engine.py
```

### 4. Run Scalability Benchmark
To verify search speed on 2,000+ students:
```bash
python benchmark_2k.py
```
