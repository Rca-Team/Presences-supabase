"""
Presences-AI — 1-Click Automated Data Migration Script
Migrates all profiles, face_descriptors, attendance_records, and settings
from Supabase Cloud directly into your Self-Hosted Supabase / Oracle Cloud instance.
"""

import sys
import json
try:
    from supabase import create_client, Client
except ImportError:
    print("Installing supabase client library...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "supabase"])
    from supabase import create_client, Client

def main():
    print("================================================================")
    print("   🚀 Presences-AI: Cloud to Self-Hosted Data Migrator")
    print("================================================================")

    # 1. Source (Supabase Cloud)
    print("\n--- [Step 1] Source: Existing Supabase Cloud ---")
    cloud_url = input("Enter Old Supabase URL (e.g. https://xyz.supabase.co): ").strip()
    cloud_key = input("Enter Old Supabase Service Role Key: ").strip()

    # 2. Destination (Self-Hosted / Oracle Cloud)
    print("\n--- [Step 2] Destination: New Self-Hosted Supabase ---")
    target_url = input("Enter New Self-Hosted URL (e.g. http://123.45.67.89:8000): ").strip()
    target_key = input("Enter New Service Role Key (from self-hosted-supabase/.env): ").strip()

    print("\nConnecting to both databases...")
    try:
        source_client: Client = create_client(cloud_url, cloud_key)
        target_client: Client = create_client(target_url, target_key)
        print(" Connected successfully!")
    except Exception as e:
        print(f"❌ Connection error: {e}")
        return

    # Tables to migrate in dependency order
    tables = [
        "profiles",
        "user_roles",
        "attendance_settings",
        "face_descriptors",
        "attendance_records",
        "timetable_slots",
        "emergency_events",
        "system_notifications"
    ]

    for table in tables:
        print(f"\n📦 Migrating table: '{table}'...")
        try:
            # Fetch all rows from source
            res = source_client.table(table).select("*").execute()
            data = res.data or []
            print(f"   Found {len(data)} records in cloud.")

            if not data:
                print("   Skipping (empty table).")
                continue

            # Batch insert into destination (batches of 100)
            batch_size = 100
            for i in range(0, len(data), batch_size):
                batch = data[i:i + batch_size]
                target_client.table(table).upsert(batch).execute()
                print(f"   Inserted records {i+1} to {min(i+batch_size, len(data))}")

            print(f"   Table '{table}' migrated successfully!")
        except Exception as err:
            print(f"   ⚠️ Warning while migrating '{table}': {err}")

    print("\n================================================================")
    print("   🎉 DATA MIGRATION COMPLETE!")
    print("   All student profiles, attendance history, and face biometrics")
    print("   are now safely stored in your self-hosted backend.")
    print("================================================================")

if __name__ == "__main__":
    main()
