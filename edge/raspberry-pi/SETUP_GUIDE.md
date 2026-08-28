# 🎓 Presences AI — Complete Raspberry Pi 3 Setup & Deployment Guide

This guide walks you through setting up a **Raspberry Pi 3** with a **USB Webcam** as a dedicated, **Plug & Play** attendance kiosk for your school. Once configured, simply plugging the Raspberry Pi into power starts attendance scanning automatically and sends real-time records to your **Presences Cloud Database (Supabase)** and **Web App**.

---

## 📑 Table of Contents
1. [System Architecture](#-system-architecture)
2. [Hardware Checklist](#-hardware-checklist)
3. [Step 1: Flash SD Card with Raspberry Pi Imager](#step-1-flash-sd-card-with-raspberry-pi-imager)
4. [Step 2: Connect Hardware & Boot the Pi](#step-2-connect-hardware--boot-the-pi)
5. [Step 3: Transfer the Setup Folder to the Pi](#step-3-transfer-the-setup-folder-to-the-pi)
6. [Step 4: Run the 1-Click Automated Installer](#step-4-run-the-1-click-automated-installer)
7. [Step 5: Configure Supabase Cloud Credentials](#step-5-configure-supabase-cloud-credentials)
8. [Step 6: Test & Verify Face Recognition](#step-6-test--verify-face-recognition)
9. [Step 7: Activate the Plug & Play Auto-Start Service](#step-7-activate-the-plug--play-auto-start-service)
10. [Daily School Operation](#-daily-school-operation)
11. [Troubleshooting & FAQs](#-troubleshooting--faqs)

---

## 🏗️ System Architecture

```
 ┌─────────────────────────────────────────────────────────────┐
 │                Raspberry Pi 3 Terminal                      │
 │                                                             │
 │  1. Power ON ➔ Auto-starts background attendance daemon     │
 │  2. USB Webcam captures student at gate                     │
 │  3. Fast 128-D vector matching against cached profiles      │
 │  4. Success Chime Plays ➔ "Beep! Marked Present"            │
 │  5. Optional Display shows Name & Status                    │
 └──────────────────────────────┬──────────────────────────────┘
                                │ HTTPS REST (Direct Sync)
                                ▼
 ┌─────────────────────────────────────────────────────────────┐
 │                      Supabase Cloud                         │
 │                                                             │
 │  • Table: attendance_records (Present / Late + Timestamp)   │
 │  • Table: face_descriptors (Synchronizes registered faces)  │
 └──────────────────────────────┬──────────────────────────────┘
                                │ Realtime WebSockets
                                ▼
 ┌─────────────────────────────────────────────────────────────┐
 │                    Presences Web App                        │
 │                                                             │
 │  • Live Dashboard updates instantly in school office        │
 │  • Teacher Portal / Gate Mode displays attendance           │
 │  • Automated Parent Notification (Email / WhatsApp)         │
 └─────────────────────────────────────────────────────────────┘
```

---

## 🛠️ Hardware Checklist

| Item | Specification | Notes |
|---|---|---|
| **Board** | Raspberry Pi 3 Model B or B+ | Quad-Core 1.2GHz, 1GB RAM |
| **Power Supply** | Official 5V 2.5A or 3A Micro-USB adapter | Ensures stable voltage |
| **Camera** | Standard USB Webcam (UVC compliant) | e.g. Logitech C270, 720p/1080p generic webcam |
| **Storage** | 16GB or 32GB Class 10 / A1 MicroSD card | High endurance recommended |
| **Audio (Optional)** | 3.5mm Speaker, USB Speaker, or Buzzer | For audio feedback chime |
| **Display (Optional)** | HDMI Monitor or 3.5"–7" LCD Touchscreen | If you want students to see their name on screen |

---

## Step 1: Flash SD Card with Raspberry Pi Imager

1. Download and install **[Raspberry Pi Imager](https://www.raspberrypi.com/software/)** on your PC/Mac.
2. Insert your MicroSD card into your computer.
3. In Raspberry Pi Imager:
   - **Device:** Select `Raspberry Pi 3`
   - **Operating System:** Select `Raspberry Pi OS (64-bit)` or `Raspberry Pi OS (32-bit)` (Recommended: Raspberry Pi OS with desktop or Lite).
   - **Storage:** Select your MicroSD Card.
4. Click **Next**, and when prompted to apply custom settings, click **EDIT SETTINGS**:
   - **Hostname:** `presences-gate`
   - **Username and Password:** Set username to `pi` and choose a secure password.
   - **Configure Wireless LAN:** Enter your school Wi-Fi SSID and Password.
   - **Services tab:** Check **Enable SSH** (use password authentication).
5. Click **Save** and **Write** to flash the card.

---

## Step 2: Connect Hardware & Boot the Pi

1. Insert the flashed MicroSD card into the Raspberry Pi 3.
2. Plug your **USB Webcam** into any of the 4 USB ports.
3. *(Optional)* Connect your speaker (to 3.5mm audio jack or USB) and HDMI display.
4. Plug in the power supply.
5. Wait ~45 seconds for the initial boot and Wi-Fi connection.

---

## Step 3: Transfer the Setup Folder to the Pi

You can connect to the Raspberry Pi from your computer using SSH or terminal:

```bash
ssh pi@presences-gate.local
# Or ssh pi@<RASPBERRY_PI_IP_ADDRESS>
```

Navigate to your home directory and place the `raspberry-pi-setup` folder here:

```bash
cd ~
# If using git:
git clone <YOUR_GIT_REPO_URL> Presences-AI
cd Presences-AI/raspberry-pi-setup

# OR if you transferred the folder directly:
cd ~/raspberry-pi-setup
```

---

## Step 4: Run the 1-Click Automated Installer

Make `setup.sh` executable and run it:

```bash
chmod +x setup.sh
./setup.sh
```

### What this script automatically does:
- Updates system package repositories (`apt`).
- Installs OpenCV, CMake, BLAS, and audio drivers (`alsa-utils`).
- Installs Python dependencies (`face_recognition`, `numpy`, `requests`, `pygame`, `python-dotenv`).
- Generates the offline audio chime asset (`success_chime.wav`).
- Creates your `.env` configuration file.
- Registers the `presences-attendance.service` auto-boot system daemon.

---

## Step 5: Configure Supabase Cloud Credentials

Open the `.env` configuration file:

```bash
nano .env
```

Enter your school's credentials:

```env
# Supabase Cloud Configuration
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Hardware & Camera
CAMERA_INDEX=0
CAMERA_WIDTH=640
CAMERA_HEIGHT=480
FRAME_SCALE=0.25

# Recognition Settings
MATCH_THRESHOLD=0.45
AMBIGUITY_RATIO=0.85
COOLDOWN_SECONDS=30

# Late Cutoff (24h format: 9:00 AM)
CUTOFF_HOUR=9
CUTOFF_MINUTE=0

# Periodic Refresh (sync new student faces every 5 minutes)
STUDENT_SYNC_INTERVAL_SEC=300

# School Gate info
GATE_NAME=Main School Gate
CAPTURE_MODE=gate-mode

# Feedback Settings
SHOW_WINDOW=true
ENABLE_AUDIO=true
```

> **Tip:** If running completely headless without an HDMI screen attached, set `SHOW_WINDOW=false`.

Save and exit: Press `CTRL + O`, then `Enter`, then `CTRL + X`.

---

## Step 6: Test & Verify Face Recognition

Run the script manually first to test the camera feed and recognition:

```bash
python3 attendance_engine.py
```

### What to look for:
1. The terminal displays:
   ```
   [CloudSync] Successfully fetched X enrolled face profiles from Supabase.
   [Engine] Ready with X active student face models.
   [Engine] Starting camera index 0 (640x480)...
   [Engine] Terminal is ACTIVE.
   ```
2. Look at the camera:
   - Green bounding box appears around recognized face.
   - Chime plays.
   - Terminal logs: `[✓ RECOGNIZED] Student: John Doe | Status: PRESENT`.
   - Record is sent directly to Supabase cloud.
3. Open your **Presences Web App** on your browser $\rightarrow$ Check the live Attendance table or Gate Mode to confirm the record appeared!
4. Press `q` or `CTRL + C` to stop the manual test.

---

## Step 7: Activate the Plug & Play Auto-Start Service

To make the Raspberry Pi start taking attendance automatically every time it is plugged in:

```bash
# Start the background service now
sudo systemctl start presences-attendance.service

# Check that the service is running actively
sudo systemctl status presences-attendance.service
```

### Useful Management Commands:
- **View Live Logs in Real-time:**
  ```bash
  sudo journalctl -u presences-attendance.service -f
  ```
- **Restart the Service:**
  ```bash
  sudo systemctl restart presences-attendance.service
  ```
- **Stop the Service:**
  ```bash
  sudo systemctl stop presences-attendance.service
  ```
- **Disable Auto-Start on Boot:**
  ```bash
  sudo systemctl disable presences-attendance.service
  ```

---

## 🏫 Daily School Operation

1. **Power ON:** Plug the Raspberry Pi power adapter into the wall.
2. **Boot:** The Pi boots up and auto-starts the attendance service within ~20 seconds.
3. **Taking Attendance:** 
   - Students walk up to the camera.
   - The system recognizes their face $\rightarrow$ plays a chime $\rightarrow$ records their status as `present` (or `late` if after cutoff time).
   - Duplicate prevention prevents marking the same student twice within the cooldown window (e.g. 30 seconds).
4. **Offline Handling:** If school Wi-Fi goes down, records are saved safely on the Pi (`local_cache.db`) and automatically uploaded the moment Wi-Fi reconnects.
5. **Power OFF:** At the end of the day, you can safely turn off or unplug the terminal.

---

## ❓ Troubleshooting & FAQs

### 1. Camera not opening (`Camera index 0 failed`)
- Check USB connection: Run `lsusb` to verify your webcam is detected.
- Verify video device path: Run `ls -l /dev/video*`. If your camera is `/dev/video1`, edit `.env` and set `CAMERA_INDEX=1`.

### 2. Audio Chime not playing
- Test audio output with: `aplay success_chime.wav`.
- If using 3.5mm headphone jack, ensure audio output is routed to headphones:
  ```bash
  sudo raspi-config
  # Navigate to: System Options -> Audio -> select 3.5mm Jack or Headphones
  ```

### 3. Student faces not syncing from Supabase
- Verify that `SUPABASE_URL` and `SUPABASE_KEY` in `.env` are correct.
- Ensure your `face_descriptors` table in Supabase contains registered student embeddings from the Presences web app.
- Check network connectivity: `ping -c 3 google.com`.

### 4. Improving FPS / Performance on Pi 3
- The system defaults to `FRAME_SCALE=0.25` (downscaling to 160x120 for detection before computing embeddings), which provides smooth real-time performance on Pi 3 CPU.
- If running headless (no HDMI display connected), ensure `SHOW_WINDOW=false` in `.env` to save CPU resources.

---

🎉 **You are all set! Your Raspberry Pi 3 is now a fully automated, cloud-synced school attendance terminal.**
