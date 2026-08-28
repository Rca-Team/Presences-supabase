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
    python3-opencv \
    build-essential \
    cmake \
    libatlas-base-dev \
    libopenblas-dev \
    liblapack-dev \
    libjpeg-dev \
    alsa-utils

echo "[2/6] Installing Python dependencies..."
pip3 install --upgrade pip
pip3 install -r "$SCRIPT_DIR/requirements.txt"

echo "[3/6] Generating audio chime feedback asset..."
python3 "$SCRIPT_DIR/sound_generator.py"

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
ExecStart=$(which python3) $SCRIPT_DIR/attendance_engine.py
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
echo "To run manually for testing on screen, run:"
echo "    python3 $SCRIPT_DIR/attendance_engine.py"
echo "=================================================================="
