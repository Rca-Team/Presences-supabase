#!/bin/bash
# ==============================================================================
# Oracle Cloud Free Tier Keep-Alive Script
# Keeps CPU and Network active periodically so Oracle never reclaims the server
# ==============================================================================

# Run a brief, lightweight compute task (under 1 second)
python3 -c "import hashlib; [hashlib.sha256(str(i).encode()).hexdigest() for i in range(50000)]" 2>/dev/null || true

# Test local database connection
docker exec supabase-db pg_isready -U postgres > /dev/null 2>&1

echo "[$(date -u)] Keepalive heartbeat completed successfully." >> /tmp/oracle_keepalive.log
