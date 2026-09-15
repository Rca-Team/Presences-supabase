#!/usr/bin/env bash
# ==============================================================================
# Presences AI — Automated Setup Script for Raspberry Pi 3 Terminal
# ==============================================================================

set -e

echo "=================================================================="
echo "  Setting up Presences AI Attendance Terminal on Raspberry Pi     "
echo "=================================================================="

CURRENT_USER=$(whoami)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "[1/6] Updating system packages & installing required libraries..."
sudo apt-get update
sudo apt-get install -y \
    python3 \
    python3-pip \
    python3-dev \
    python3-venv \
    python3-opencv \
    python3-numpy \
    build-essential \
    cmake \
    libatlas-base-dev \
    libopenblas-dev \
    liblapack-dev \
    libjpeg-dev \
    libv4l-dev \
    v4l-utils \
    alsa-utils

# Check & increase swap size if swap is < 1GB (prevents dlib compile OOM on 1GB RAM Pi 3)
SWAP_SIZE=$(free -m | awk '/Swap:/ {print $2}')
if [ "$SWAP_SIZE" -lt 1000 ] && [ -f /etc/dphys-swapfile ]; then
    echo "[Notice] Temporarily expanding swap file to 1024MB for smooth dlib compilation..."
    sudo dphys-swapfile swapoff || true
    sudo sed -i 's/^CONF_SWAPSIZE=.*/CONF_SWAPSIZE=1024/' /etc/dphys-swapfile
    sudo dphys-swapfile setup || true
    sudo dphys-swapfile swapon || true
fi

echo "[2/6] Creating Python virtual environment with system site packages..."
if [ ! -d "$SCRIPT_DIR/venv" ]; then
    python3 -m venv "$SCRIPT_DIR/venv" --system-site-packages
fi

source "$SCRIPT_DIR/venv/bin/activate"
pip install --upgrade pip setuptools wheel
pip install requests python-dotenv pygame

# Install face_recognition (falls back automatically to OpenCV if dlib is skipped)
pip install face_recognition || {
    echo "[Notice] dlib pre-build skipped. Terminal will use hardware-accelerated OpenCV Haar Cascade detector."
}

echo "[3/6] Generating audio chime feedback asset..."
"$SCRIPT_DIR/venv/bin/python3" "$SCRIPT_DIR/sound_generator.py"

echo "[4/6] Checking configuration..."
if [ ! -f "$SCRIPT_DIR/.env" ]; then
    echo "Creating .env from .env.example..."
    cp "$SCRIPT_DIR/.env.example" "$SCRIPT_DIR/.env"
    echo ""
    echo "⚠️  IMPORTANT: Please update $SCRIPT_DIR/.env with your SUPABASE_URL and SUPABASE_KEY."
    echo ""
fi

echo "[5/6] Configuring systemd Auto-Start Service..."
SERVICE_FILE="/etc/systemd/system/presences-attendance.service"

sudo bash -c "cat <<EOF > $SERVICE_FILE
[Unit]
Description=Presences AI Smart Attendance Terminal
After=network-online.target sound.target
Wants=network-online.target

[Service]
Type=simple
User=$CURRENT_USER
WorkingDirectory=$SCRIPT_DIR
ExecStart=$SCRIPT_DIR/venv/bin/python3 $SCRIPT_DIR/attendance_engine.py
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
Environment=PYTHONUNBUFFERED=1
Environment=DISPLAY=:0

[Install]
WantedBy=multi-user.target
EOF"

echo "[6/6] Enabling and registering system service..."
sudo systemctl daemon-reload
sudo systemctl enable presences-attendance.service

echo ""
echo "=================================================================="
echo "  🎉 Installation Complete! Plug & Play Ready!                    "
echo "=================================================================="
echo "To start the terminal service now, run:"
echo "    sudo systemctl start presences-attendance.service"
echo ""
echo "To check real-time service logs, run:"
echo "    sudo journalctl -u presences-attendance.service -f"
echo ""
echo "To run manually for testing, run:"
echo "    $SCRIPT_DIR/venv/bin/python3 $SCRIPT_DIR/attendance_engine.py"
echo "=================================================================="
