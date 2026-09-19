#!/bin/bash
# ==============================================================================
# Presences-AI Automated PostgreSQL Backup Script
# Dumps full database schema, attendance records, profiles, and face embeddings
# ==============================================================================

BACKUP_DIR="$(dirname "$0")/backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/presences_backup_$TIMESTAMP.sql.gz"

mkdir -p "$BACKUP_DIR"

# Perform compressed SQL dump
docker exec -t supabase-db pg_dump -U postgres postgres | gzip > "$BACKUP_FILE"

echo "[$(date)] Backup completed: $BACKUP_FILE"

# Keep last 30 daily backups, delete older ones
find "$BACKUP_DIR" -type f -name "presences_backup_*.sql.gz" -mtime +30 -exec rm {} \;
