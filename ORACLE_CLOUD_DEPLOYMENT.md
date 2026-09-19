# 🚀 Presences-AI — Oracle Cloud Always-Free Deployment Guide

This guide walks you step-by-step through deploying your **unlimited, self-hosted Supabase backend on Oracle Cloud Always-Free Tier ($0 Forever)**.

---

## 🌟 What You Get for $0 / Free
* **24 GB RAM & 4 ARM CPU Cores** (Ampere A1 Compute)
* **200 GB NVMe Storage** (Holds 100,000+ face photos & millions of attendance records)
* **Never Pauses / Sleeps** (Runs 24/7/365 uninterrupted)
* **Zero 500 MB / 1 GB limits**

---

## 🛠️ Step 1: Create Your Oracle Cloud Account
1. Visit [cloud.oracle.com](https://cloud.oracle.com) and click **Start for free**.
2. Fill in your details and select your Home Region (Choose the data center closest to your school).
3. Complete identity verification (Requires a debit/credit card; charges a temporary \$1 authorization check and refunds it immediately).

---

## 🖥️ Step 2: Launch the Always-Free VM Instance
1. In the Oracle Cloud Console, navigate to **Compute → Instances → Create Instance**.
2. Name: `presences-backend`
3. **Image and Shape:**
   * **Image:** `Ubuntu 22.04` or `Ubuntu 24.04 Minimal`
   * **Shape:** Click **Change Shape** → Select **Ampere (ARM-based Processor)** → **VM.Standard.A1.Flex**
   * Configure: **4 OCPUs** and **24 GB Memory** (Marked as *Always Free Eligible*).
4. **Networking:**
   * Select *Create new virtual cloud network (VCN)*
   * Select *Assign a public IPv4 address*.
5. **SSH Keys:**
   * Click **Generate a key pair for me** and download both the **Private Key** and **Public Key** to your computer.
6. Click **Create**. Your server will be provisioned in ~60 seconds. Note down the **Public IP Address** (e.g. `123.45.67.89`).

---

## 🛡️ Step 3: Open Firewall Ports in Oracle Cloud
In order for your app to talk to Supabase, open ports `8000`, `3001`, `80`, `443` in Oracle's security list:

1. In the Oracle Cloud Console, go to **Virtual Cloud Networks → Click your VCN → Default Security List**.
2. Click **Add Ingress Rules**:
   * **Source CIDR:** `0.0.0.0/0`
   * **IP Protocol:** `TCP`
   * **Destination Port Range:** `80,443,3001,8000,5432`
   * **Description:** `Presences Supabase & Studio Ports`
3. Click **Add Ingress Rules**.

---

## ⚡ Step 4: Run the 1-Click Installer
1. Connect to your Oracle VPS using SSH (via PowerShell or Terminal):
   ```bash
   ssh -i /path/to/your_private_key ubuntu@<YOUR_ORACLE_PUBLIC_IP>
   ```

2. Clone this repository onto the server:
   ```bash
   git clone -b ai https://github.com/Rca-Team/Presences-supabase.git
   cd Presences-supabase/self-hosted-supabase
   ```

3. Run the automated deployment script:
   ```bash
   chmod +x deploy-oracle.sh
   ./deploy-oracle.sh
   ```

The script will automatically:
- Install Docker & Docker Compose
- Configure Linux firewall rules
- Generate secure database passwords & JWT keys
- Spin up PostgreSQL (with pgvector), Auth, Storage (`face-images`), Realtime, and Studio
- Apply the complete Presences-AI database schema & permissions
- Set up automatic hourly keepalive (to prevent idle server reclamation)
- Set up daily automatic SQL database backups

---

## 🔗 Step 5: Connect Your Frontend & Python Engine

Once deployed, copy your keys from `self-hosted-supabase/.env`:

### 1. In your Web Frontend (`.env` or Vercel Settings):
```env
VITE_SUPABASE_URL=http://<YOUR_ORACLE_PUBLIC_IP>:8000
VITE_SUPABASE_PUBLISHABLE_KEY=<YOUR_ANON_KEY_FROM_.ENV>
```

### 2. In your Python Spotlight Edge Engine (`config.py` / `.env`):
```env
SUPABASE_URL=http://<YOUR_ORACLE_PUBLIC_IP>:8000
SUPABASE_KEY=<YOUR_SERVICE_ROLE_KEY_FROM_.ENV>
```

### 3. Open Supabase Studio (Web UI):
Open `http://<YOUR_ORACLE_PUBLIC_IP>:3001` in your browser to view all student profiles, real-time attendance logs, and uploaded face samples!

---

## 🔒 Step 6 (Optional): Add Custom Domain & HTTPS
To use a free domain with automatic SSL (HTTPS), run:
```bash
sudo apt install -y caddy
```
Create `/etc/caddy/Caddyfile`:
```
api.yourschool.com {
    reverse_proxy localhost:8000
}

studio.yourschool.com {
    reverse_proxy localhost:3001
}
```
Then run: `sudo systemctl restart caddy`.
