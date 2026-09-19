# 🏫 Presences-AI — Complete Step-by-Step Setup Guide From Zero (0 to 100)

This is the **definitive, zero-to-hero blueprint** for setting up your unlimited, 100% free self-hosted attendance system on **Oracle Cloud Always-Free Tier ($0 Forever)** or a **Local School PC**.

---

## 📋 Table of Contents
1. [Prerequisites](#1-prerequisites)
2. [Step 1: Create Oracle Cloud Account ($0 Free Forever)](#step-1-create-oracle-cloud-account-0-free-forever)
3. [Step 2: Create Always-Free Linux VM & Expand to 200GB](#step-2-create-always-free-linux-vm--expand-to-200gb)
4. [Step 3: Open Cloud Firewall Ports (Security Lists)](#step-3-open-cloud-firewall-ports-security-lists)
5. [Step 4: SSH Login & OS Firewall Bypass](#step-4-ssh-login--os-firewall-bypass)
6. [Step 5: Run the 1-Click Automated Installer](#step-5-run-the-1-click-automated-installer)
7. [Step 6: Setup HTTPS / SSL (Required for Browser Cameras)](#step-6-setup-https--ssl-required-for-browser-cameras)
8. [Step 7: Migrate All Existing Data from Supabase Cloud](#step-7-migrate-all-existing-data-from-supabase-cloud)
9. [Step 8: Connect Presences Web App & Spotlight Engine](#step-8-connect-presences-web-app--spotlight-engine)
10. [Step 9: Automated Keep-Alive, Backups & Verification](#step-9-automated-keep-alive-backups--verification)

---

## 1. Prerequisites
* A computer with internet access.
* A valid debit or credit card for Oracle identity verification (Oracle will charge a temporary \$1 test hold and refund it immediately; total cost = **$0**).
* Your existing Supabase Cloud project credentials (if you want to copy existing student data).

---

## Step 1: Create Oracle Cloud Account ($0 Free Forever)
1. Go to **[https://cloud.oracle.com](https://cloud.oracle.com)** and click **Start for free**.
2. Enter your Country, Name, and Email.
3. **CRITICAL — Home Region:** Pick the location closest to your school (e.g., `India South (Hyderabad)`, `India West (Mumbai)`, `Singapore`, `Frankfurt`, or `US East`). *Home region cannot be changed later.*
4. Complete payment verification ($1 hold refunded immediately).
5. Set your password and log into the **Oracle Cloud Console**.

---

## Step 2: Create Always-Free Linux VM & Expand to 200GB
1. In the console menu, go to **Compute → Instances → Create Instance**.
2. **Name:** `presences-backend`
3. **Image & Shape:**
   * Image: Select **Ubuntu 22.04 LTS** or **Ubuntu 24.04 LTS**.
   * Shape: Select **Ampere (ARM-based)** → **VM.Standard.A1.Flex**.
   * Drag slider to **4 OCPUs** and **24 GB Memory** (*Marked Always Free Eligible*).
4. **Networking:**
   * Select *Create new virtual cloud network (VCN)*.
   * Ensure *Assign a public IPv4 address* is checked.
5. **Add SSH Keys:**
   * Select **Generate a key pair for me**.
   * Click **Save Private Key** (downloaded as `ssh-key-*.key`).
6. **CRITICAL — Expand Boot Volume to 200 GB:**
   * Scroll down → Click **Show advanced options** → **Boot Volume**.
   * Check **Specify a custom boot volume size**.
   * Enter **`200`** GB (Always Free allows up to 200 GB for free).
7. Click **Create** at the bottom.
8. Status will turn **Green (Running)** in ~60 seconds. Copy your **Public IP Address** (e.g., `129.154.42.100`).

---

## Step 3: Open Cloud Firewall Ports (Security Lists)
1. In the console, go to **Networking → Virtual Cloud Networks → Click your VCN**.
2. Under **Resources**, click **Security Lists** → Click **Default Security List for [your-vcn]**.
3. Click **Add Ingress Rules**:
   * **Source Type:** CIDR
   * **Source CIDR:** `0.0.0.0/0`
   * **IP Protocol:** `TCP`
   * **Destination Port Range:** `80, 443, 3001, 8000, 5432`
   * **Description:** `Presences Supabase API, Studio, DB & HTTPS`
4. Click **Add Ingress Rules**.

---

## Step 4: SSH Login & OS Firewall Bypass
1. Open PowerShell or Terminal on your computer:
   ```bash
   # Windows PowerShell:
   ssh -i "C:\path\to\your\ssh-key.key" ubuntu@<YOUR_PUBLIC_IP>

   # Linux / macOS:
   chmod 400 ~/Downloads/ssh-key.key
   ssh -i ~/Downloads/ssh-key.key ubuntu@<YOUR_PUBLIC_IP>
   ```

2. Once logged in, unlock Ubuntu's internal firewall:
   ```bash
   sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 8000 -j ACCEPT
   sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 3001 -j ACCEPT
   sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
   sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
   sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 5432 -j ACCEPT
   sudo netfilter-persistent save 2>/dev/null || true
   ```

---

## Step 5: Run the 1-Click Automated Installer
Run these commands on the server:
```bash
# 1. Clone the 'ai' branch
git clone -b ai https://github.com/Rca-Team/Presences-supabase.git

# 2. Enter directory
cd Presences-supabase/self-hosted-supabase

# 3. Run installer
chmod +x deploy-oracle.sh
./deploy-oracle.sh
```

**Verify Studio Dashboard:** Open `http://<YOUR_PUBLIC_IP>:3001` in your browser.

---

## Step 6: Setup HTTPS / SSL (Required for Browser Cameras)
Web browsers require HTTPS to allow cameras on remote domains. Set up free SSL with Caddy:

1. Point your domain's DNS A-records:
   * `api.yourschool.com` ➔ `<YOUR_ORACLE_PUBLIC_IP>`
   * `studio.yourschool.com` ➔ `<YOUR_ORACLE_PUBLIC_IP>`

2. Install Caddy:
   ```bash
   sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
   curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
   curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
   sudo apt update && sudo apt install -y caddy
   ```

3. Configure `/etc/caddy/Caddyfile`:
   ```
   api.yourschool.com {
       reverse_proxy localhost:8000
   }

   studio.yourschool.com {
       reverse_proxy localhost:3001
   }
   ```
4. Reload: `sudo systemctl reload caddy`

---

## Step 7: Migrate All Existing Data from Supabase Cloud
To copy all your students, face embeddings, and past attendance logs:

```bash
cd ~/Presences-supabase/self-hosted-supabase
python3 migrate_from_cloud.py
```
* Enter your old Supabase Cloud credentials.
* Enter your new Self-Hosted Supabase credentials.
* All data is copied automatically without data loss.

---

## Step 8: Connect Presences Web App & Spotlight Engine

### A. Web Application (`.env` or Vercel Settings):
```env
VITE_SUPABASE_URL=https://api.yourschool.com
VITE_SUPABASE_PUBLISHABLE_KEY=<ANON_KEY_FROM_SELF_HOSTED_.ENV>
```

### B. Python Spotlight Gate Camera (`Presences-Spotlight-Engine/.env`):
```env
SUPABASE_URL=https://api.yourschool.com
SUPABASE_KEY=<SERVICE_ROLE_KEY_FROM_SELF_HOSTED_.ENV>
```

---

## Step 9: Automated Keep-Alive, Backups & Verification
* **Automatic Keepalive:** Runs every hour via crontab to prevent Oracle idle server reclamation.
* **Daily SQL Database Backups:** Automatically dumps the full database every night at 2:00 AM into `self-hosted-supabase/backups/`.
* **Testing Gate Recognition:** Run `START_SPOTLIGHT.bat` on the gate PC and verify student face detection & instant attendance sync.
