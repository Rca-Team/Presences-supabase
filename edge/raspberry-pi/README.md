# Presences AI — Raspberry Pi 3 Plug & Play School Attendance Terminal

A dedicated, lightweight edge attendance terminal built for **Raspberry Pi 3** with a standard **USB Webcam**.

---

## 🌟 Highlights

- **True Plug & Play:** Power on the Pi $\rightarrow$ auto-starts attendance tracking in $\approx 20$ seconds without requiring keyboard, mouse, or manual login.
- **Real-Time Supabase Cloud Sync:** Attendance records appear immediately in your Presences web app dashboard and trigger parent notifications.
- **Offline Resilient:** If school Wi-Fi drops, records are queued in local SQLite and auto-uploaded as soon as connection restores.
- **Optimized for Pi 3:** Multi-threaded frame processing and scaled inference ensures smooth tracking without CPU overheating.
- **Audio & Visual Feedback:** Plays a pleasant chime and (optionally) shows live camera tracking on an HDMI screen.

---

## 🛠️ Hardware Requirements

1. **Raspberry Pi 3 (Model B or B+)** + 5V 2.5A/3A Power Supply.
2. **MicroSD Card (16GB or 32GB)** with **Raspberry Pi OS (64-bit or 32-bit with desktop/lite)**.
3. **Standard USB Webcam** (plugged into any USB port).
4. *(Optional)* 3.5mm Speaker / USB Speaker for success audio chime.
5. *(Optional)* HDMI Monitor or Small LCD Display for visual student feedback.

---

## 🚀 5-Step Setup Guide

### Step 1: Prepare the Raspberry Pi
1. Download [Raspberry Pi Imager](https://www.raspberrypi.com/software/).
2. Choose **Raspberry Pi OS (Legacy/Bookworm)**.
3. Click the gear icon (Settings) to enable **SSH**, set your **Wi-Fi username and password**, and set your username (`pi`).
4. Write to the SD card, insert into the Pi, and power it on.

### Step 2: Copy or Clone the Code to Raspberry Pi
Open the terminal on your Raspberry Pi (via SSH or connected keyboard/screen) and run:

```bash
git clone <YOUR_REPOSITORY_URL> Presences-AI
cd Presences-AI/edge/raspberry-pi
```

*(Or simply copy the `edge/raspberry-pi` folder to your Raspberry Pi home directory `/home/pi/Presences-AI/edge/raspberry-pi`).*

---

### Step 3: Run the Automated 1-Click Installer

Make the setup script executable and run it:

```bash
chmod +x setup.sh
./setup.sh
```

This will automatically:
- Install required system libraries (OpenCV, BLAS, ALSA, CMake).
- Install Python dependencies (`face_recognition`, `numpy`, `requests`, `pygame`, `python-dotenv`).
- Generate the pleasant audio chime sound.
- Create your `.env` configuration file.
- Register and enable the `presences-attendance.service` auto-boot daemon.

---

### Step 4: Configure Supabase Cloud Credentials

Edit the `.env` file with your school's Supabase credentials:

```bash
nano .env
```

Set your project variables:
```env
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_KEY=your-supabase-service-role-or-anon-key
CUTOFF_HOUR=9
CUTOFF_MINUTE=0
COOLDOWN_SECONDS=30
GATE_NAME=Main School Gate
SHOW_WINDOW=true
ENABLE_AUDIO=true
```

Save and exit (`CTRL+O`, `Enter`, `CTRL+X`).

---

### Step 5: Test and Start the Plug & Play Service

#### 🧪 Test Manually (to verify camera view and recognition):
```bash
python3 attendance_engine.py
```
*You will see the camera window open, synchronize enrolled student faces from Supabase, and track faces with green boxes and chime when recognized.*

#### 🔌 Start the Background Auto-Boot Service:
```bash
sudo systemctl start presences-attendance.service
```

#### 📜 Check Live Logs:
```bash
sudo journalctl -u presences-attendance.service -f
```

---

## 🏫 Daily School Operation (Plug & Play)

1. **Morning:** Plug in the Raspberry Pi power adapter.
2. **Within 20 seconds:** The system boots and automatically starts scanning faces.
3. **Student Enters:** Looks at the USB camera $\rightarrow$ **Beep Chime** $\rightarrow$ Screen displays `"MARKED PRESENT: [Student Name]"` $\rightarrow$ Supabase records the entry $\rightarrow$ Web App Dashboard reflects it instantly!
4. **End of Day:** Simply unplug or shut down.
