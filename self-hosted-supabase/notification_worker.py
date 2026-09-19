"""
Presences-AI — Real-Time WhatsApp & SMS Parent Notification Worker
Listens to new attendance records and automatically sends instant WhatsApp, SMS, and Email alerts to parents.
Can run 24/7 on Oracle Cloud or on the Gate PC.
"""

import os
import sys
import time
import json
import requests
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL", "http://localhost:8000")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")

# ─── WhatsApp & SMS Configuration ─────────────────────────────────────────────
# 1. Meta WhatsApp Cloud API (Free 1,000 conversations/month)
WHATSAPP_PHONE_ID = os.getenv("WHATSAPP_PHONE_NUMBER_ID", "")
WHATSAPP_TOKEN = os.getenv("WHATSAPP_ACCESS_TOKEN", "")

# 2. Fast2SMS / SMS Gateway (India)
FAST2SMS_API_KEY = os.getenv("FAST2SMS_API_KEY", "")

# 3. Resend / SMTP Email (Optional)
RESEND_API_KEY = os.getenv("RESEND_API_KEY", "")

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json"
}

def send_whatsapp(phone: str, student_name: str, status: str, time_str: str, gate: str) -> bool:
    """Dispatches instant WhatsApp message via WhatsApp Cloud API."""
    if not WHATSAPP_PHONE_ID or not WHATSAPP_TOKEN:
        print(f"   [WhatsApp Simulated] To: {phone} | Student: {student_name} marked {status} at {time_str}")
        return False

    clean_phone = "".join(filter(str.isdigit, phone))
    if len(clean_phone) == 10:
        clean_phone = "91" + clean_phone  # Add India country code by default

    msg = (
        f"🏫 *School Attendance Alert*\n\n"
        f"Dear Parent,\n"
        f"Your child *{student_name}* was marked *{status.upper()}* at {time_str}.\n"
        f"📍 Entry Gate: {gate}\n\n"
        f"— *Presence Smart System*"
    )

    url = f"https://graph.facebook.com/v18.0/{WHATSAPP_PHONE_ID}/messages"
    payload = {
        "messaging_product": "whatsapp",
        "to": clean_phone,
        "type": "text",
        "text": {"body": msg}
    }
    headers = {
        "Authorization": f"Bearer {WHATSAPP_TOKEN}",
        "Content-Type": "application/json"
    }

    try:
        resp = requests.post(url, json=payload, headers=headers, timeout=10)
        return resp.status_code in (200, 201)
    except Exception as e:
        print(f"❌ WhatsApp Error: {e}")
        return False

def send_sms(phone: str, student_name: str, status: str, time_str: str) -> bool:
    """Dispatches SMS via Fast2SMS."""
    if not FAST2SMS_API_KEY:
        return False

    clean_phone = "".join(filter(str.isdigit, phone))[-10:]
    msg = f"Dear Parent, {student_name} marked {status} at {time_str} in school. - Presence"

    url = "https://www.fast2sms.com/dev/bulkV2"
    payload = {
        "authorization": FAST2SMS_API_KEY,
        "route": "q",
        "message": msg,
        "numbers": clean_phone
    }
    try:
        resp = requests.post(url, json=payload, timeout=10)
        return resp.status_code == 200
    except Exception as e:
        print(f"❌ SMS Error: {e}")
        return False

def get_student_parent_info(student_id: str):
    """Fetches parent phone & email from profiles table."""
    try:
        url = f"{SUPABASE_URL}/rest/v1/profiles?or=(user_id.eq.{student_id},id.eq.{student_id},roll_number.eq.{student_id},admission_number.eq.{student_id})&limit=1"
        resp = requests.get(url, headers=HEADERS, timeout=5)
        if resp.status_code == 200:
            records = resp.json()
            if records:
                return records[0]
    except Exception as e:
        print(f"Error fetching profile: {e}")
    return {}

def poll_and_dispatch():
    """Polls un-notified attendance records and dispatches alerts."""
    print("================================================================")
    print("   📱 Presences-AI Real-Time Parent Notification Worker")
    print(f"   Connecting to: {SUPABASE_URL}")
    print("================================================================")

    last_checked = datetime.utcnow().isoformat()

    while True:
        try:
            # Query recent attendance records created after last_checked
            url = f"{SUPABASE_URL}/rest/v1/attendance_records?created_at=gt.{last_checked}&order=created_at.asc&limit=20"
            resp = requests.get(url, headers=HEADERS, timeout=10)

            if resp.status_code == 200:
                records = resp.json()
                for rec in records:
                    student_id = rec.get("student_id") or rec.get("user_id")
                    student_name = rec.get("student_name", "Student")
                    status = rec.get("status", "present")
                    timestamp = rec.get("timestamp") or rec.get("created_at")
                    gate = rec.get("gate_name", "Main Gate")

                    # Parse readable time
                    try:
                        dt = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
                        time_str = dt.strftime("%I:%M %p")
                    except:
                        time_str = "Now"

                    # Get parent details
                    profile = get_student_parent_info(student_id)
                    parent_phone = profile.get("parent_phone") or profile.get("phone")
                    parent_name = profile.get("parent_name", "Parent")

                    print(f"\n🔔 New Scan: {student_name} ({status.upper()}) at {time_str}")
                    if parent_phone:
                        print(f"   📲 Dispatching alert to Parent ({parent_name}): {parent_phone}")
                        send_whatsapp(parent_phone, student_name, status, time_str, gate)
                        send_sms(parent_phone, student_name, status, time_str)
                    else:
                        print(f"   ⚠️ No parent phone number registered for {student_name}")

                    # Update last_checked timestamp
                    last_checked = rec.get("created_at")

            time.sleep(3)  # Poll every 3 seconds

        except KeyboardInterrupt:
            print("\nShutting down notification worker...")
            break
        except Exception as err:
            print(f"Worker Loop Error: {err}")
            time.sleep(5)

if __name__ == "__main__":
    poll_and_dispatch()
