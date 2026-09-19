#!/bin/bash
# ==============================================================================
# Presences-AI — 1-Click Automated Installer for Oracle Cloud Free Tier / VPS
# ==============================================================================

set -e

echo "================================================================="
echo "   🚀 Presences-AI: Deploying Self-Hosted Supabase Backend"
echo "================================================================="

# 1. Update system packages
echo "📦 [1/6] Updating system packages..."
sudo apt update && sudo apt upgrade -y

# 2. Install Docker and Docker Compose
echo "🐳 [2/6] Installing Docker & Docker Compose..."
sudo apt install -y apt-transport-https ca-certificates curl gnupg lsb-release ufw

if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker $USER
    rm get-docker.sh
fi

if ! docker compose version &> /dev/null; then
    sudo apt install -y docker-compose-plugin
fi

# 3. Configure Firewall (UFW and IPTables for Oracle Cloud)
echo "🛡️  [3/6] Opening ports for Supabase (8000, 3001, 5432)..."
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 8000 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 3001 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 5432 -j ACCEPT

# Save iptables rules if netfilter-persistent exists
if command -v netfilter-persistent &> /dev/null; then
    sudo netfilter-persistent save
fi

# 4. Prepare Environment
echo "🔑 [4/6] Setting up environment configuration..."
cd "$(dirname "$0")"

if [ ! -f .env ]; then
    cp .env.example .env
    # Generate random secure passwords
    RANDOM_PASS=$(openssl rand -base64 16 | tr -dc 'a-zA-Z0-9')
    sed -i "s/PresencesSchoolSuperSecretDBPass2026!/$RANDOM_PASS/g" .env
    echo "Generated random database password in .env"
fi

# 5. Setup Keep-Alive Cron (Prevents Oracle Idle Reclamation)
echo "⏰ [5/6] Setting up Keep-Alive & Backup Cron Jobs..."
chmod +x keepalive.sh backup-db.sh

CRON_JOB="0 * * * * $(pwd)/keepalive.sh >/dev/null 2>&1"
(crontab -l 2>/dev/null | grep -Fv "keepalive.sh" ; echo "$CRON_JOB") | crontab -

BACKUP_JOB="0 2 * * * $(pwd)/backup-db.sh >/dev/null 2>&1"
(crontab -l 2>/dev/null | grep -Fv "backup-db.sh" ; echo "$BACKUP_JOB") | crontab -

# 6. Launch Supabase Containers
echo "🚢 [6/6] Launching Supabase stack with Docker Compose..."
docker compose down || true
docker compose up -d

echo ""
echo "================================================================="
echo "   ✅ Presences-AI Supabase Backend Successfully Deployed!"
echo "================================================================="
echo "   • Supabase API Gateway: http://<YOUR_SERVER_IP>:8000"
echo "   • Supabase Studio UI:   http://<YOUR_SERVER_IP>:3001"
echo "   • PostgreSQL Port:      5432"
echo "   • Storage Buckets:      face-images, avatars, attendance-snapshots"
echo "================================================================="
