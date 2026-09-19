# 🏫 Presences-AI — Complete Step-by-Step Setup Guide From Zero (0 to 100)

This is the **definitive, zero-to-hero blueprint** for setting up your unlimited, 100% free self-hosted attendance system on **Oracle Cloud Always-Free Tier ($0 Forever)** or a **Local School PC**.

---

## 📋 Table of Contents
1. [Prerequisites](#1-prerequisites)
2. [Step 1: Create Oracle Cloud Account ($0 Free Forever)](#step-1-create-oracle-cloud-account-0-free-forever)
3. [Step 2: Create the Always-Free Linux VM Instance](#step-2-create-the-always-free-linux-vm-instance)
4. [Step 3: Open Cloud Firewall Ports](#step-3-open-cloud-firewall-ports)
5. [Step 4: Connect via SSH and Run the 1-Click Installer](#step-4-connect-via-ssh-and-run-the-1-click-installer)
6. [Step 5: Migrate All Existing Data from Supabase Cloud](#step-5-migrate-all-existing-data-from-supabase-cloud)
7. [Step 6: Connect Presences Web App & Spotlight Engine](#step-6-connect-presences-web-app--spotlight-engine)
8. [Step 7: Verification & Testing](#step-7-verification--testing)
9. [Step 8: Maintenance, Backups & Monitoring](#step-8-maintenance-backups--monitoring)

---

## 1. Prerequisites
* A computer with internet access.
* A valid debit or credit card for Oracle identity verification (Oracle will charge a temporary \$1 test hold and refund it immediately; total cost = **$0**).
* Your existing Supabase Cloud project credentials (if you want to copy existing student data).

---

## Step 1: Create Oracle Cloud Account ($0 Free Forever)
1. Go to **[https://cloud.oracle.com](https://cloud.oracle.com)** and click **Start for free**.
2. Enter your Country, Name, and Email.
3. **Select Home Region:** Pick the location closest to your school (e.g., `India South (Hyderabad)`, `India West (Mumbai)`, `Singapore`, `Frankfurt`, or `US East`).
4. Enter payment method for identity check.
5. Once your account is active, log into the **Oracle Cloud Infrastructure (OCI) Console**.

---

## Step 2: Create the Always-Free Linux VM Instance
1. In the OCI Console search bar, type **Instances** and select **Instances (Compute)**.
2. Click **Create Instance**.
3. Fill in the following:
   * **Name:** `presences-backend`
   * **Placement / Availability Domain:** Leave default (e.g. `AD-1`).
   * **Image and Shape:**
     * Click **Edit** or **Change Shape**.
     * Image: Select **Ubuntu 22.04** or **Ubuntu 24.04**.
     * Shape: Select **Ampere (ARM Processor)** → **VM.Standard.A1.Flex**.
     * Set **OCPUs:** `4` and **Memory:** `24 GB` (This is 100% *Always Free Eligible*).
   * **Networking:**
     * Select *Create new virtual cloud network (VCN)*.
     * Ensure *Assign a public IPv4 address* is checked.
   * **Add SSH Keys:**
     * Select **Generate a key pair for me**.
     * Click **Save Private Key** (saves as `ssh-key-*.key`).
4. Click **Create** at the bottom.
5. In ~60 seconds, the status will turn **Green (Running)**.
6. Copy your **Public IP Address** (e.g., `129.154.42.100`).

---

## Step 3: Open Cloud Firewall Ports
Allow web traffic to reach your Supabase database and Studio UI:

1. In the OCI Console, navigate to:
   **Networking → Virtual Cloud Networks → Click your VCN → Security Lists → Default Security List**.
2. Click **Add Ingress Rules**:
   * **Source Type:** CIDR
   * **Source CIDR:** `0.0.0.0/0`
   * **IP Protocol:** `TCP`
   * **Destination Port Range:** `80, 443, 3001, 8000, 5432`
   * **Description:** `Presences Supabase API, Studio & Web Ports`
3. Click **Add Ingress Rules**.

---

## Step 4: Connect via SSH and Run the 1-Click Installer
1. Open PowerShell or Terminal on your computer:
   ```bash
   ssh -i "C:\path\to\your\private_key.key" ubuntu@<YOUR_PUBLIC_IP>
   ```

2. Once logged in, run these 3 commands:
   ```bash
   # Clone the 'ai' branch
   git clone -b ai https://github.com/Rca-Team/Presences-supabase.git

   # Enter directory
   cd Presences-supabase/self-hosted-supabase

   # Run automated installer
   chmod +x deploy-oracle.sh
   ./deploy-oracle.sh
   ```

3. The installer will:
   * Install Docker & Docker Compose.
   * Open Linux firewall rules.
   * Create all SQL tables, face descriptor indexes, and storage buckets.
   * Start PostgreSQL, Auth, PostgREST, Realtime, and Supabase Studio.
   * Register automatic keep-alive and daily backup scripts.

4. **Test Studio UI:** Open your browser and go to:
   `http://<YOUR_PUBLIC_IP>:3001`
   *(You will see the official Supabase Studio dashboard showing all your tables!)*

---

## Step 5: Migrate All Existing Data from Supabase Cloud
To copy all your students, face embeddings, and past attendance logs into your new server:

1. On the server (or locally), run:
   ```bash
   python3 migrate_from_cloud.py
   ```
2. Enter your old Supabase URL & Service Role Key.
3. Enter your new Self-Hosted URL (`http://localhost:8000`) & Service Role Key (found in `self-hosted-supabase/.env`).
4. The script will automatically copy all rows with zero data loss!

---

## Step 6: Connect Presences Web App & Spotlight Engine

### A. Web Application (Vercel or Local)
In your frontend `.env` or Vercel Environment Variables:
```env
VITE_SUPABASE_URL=http://<YOUR_PUBLIC_IP>:8000
VITE_SUPABASE_PUBLISHABLE_KEY=<ANON_KEY_FROM_.ENV>
```

### B. Python Spotlight Edge Camera Engine
In `Presences-Spotlight-Engine/.env`:
```env
SUPABASE_URL=http://<YOUR_PUBLIC_IP>:8000
SUPABASE_KEY=<SERVICE_ROLE_KEY_FROM_.ENV>
```

---

## Step 7: Verification & Testing
1. **Student Login:** Open the web app and log in with student or admin accounts.
2. **Realtime Scan:** Run `START_SPOTLIGHT.bat` on the gate PC. Look into the camera — attendance marks instantly on the screen and syncs to the server.
3. **Admin Dashboard:** Open the attendance analytics calendar and verify the live record appears in real time.

---

## Step 8: Maintenance, Backups & Monitoring
* **Automated Daily Backups:** Backups are created every night at 2:00 AM in `self-hosted-supabase/backups/`.
* **Restarting Services:** If you ever restart the VM:
  ```bash
  cd Presences-supabase/self-hosted-supabase
  docker compose up -d
  ```
* **Keep-Alive:** Oracle will never flag the VM as idle because the automated cron job runs hourly.
