#!/bin/bash
# ──────────────────────────────────────────────────
# QuoteApp Database Backup Script
# 
# Usage:
#   ./scripts/backup-db.sh
#   BACKUP_DIR=/custom/path ./scripts/backup-db.sh
#
# Environment:
#   SUPABASE_DB_URL - PostgreSQL connection string
#   BACKUP_DIR      - Directory for backups (default: ./backups)
#   BACKUP_RETAIN   - Days to keep backups (default: 30)
# ──────────────────────────────────────────────────

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Configuration
BACKUP_DIR="${BACKUP_DIR:-./backups}"
BACKUP_RETAIN="${BACKUP_RETAIN:-30}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/quoteapp_backup_${TIMESTAMP}.sql.gz"

echo -e "${GREEN}╔══════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   QuoteApp Database Backup Script    ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════╝${NC}"
echo ""

# Check prerequisites
if ! command -v pg_dump &> /dev/null; then
    echo -e "${RED}Error: pg_dump not found. Install PostgreSQL client tools.${NC}"
    echo "  macOS:  brew install postgresql"
    echo "  Linux:  sudo apt install postgresql-client"
    exit 1
fi

# Check for database URL
if [ -z "${SUPABASE_DB_URL:-}" ]; then
    echo -e "${YELLOW}No SUPABASE_DB_URL set. Trying to build from Supabase config...${NC}"
    
    # Try to get from supabase status
    if command -v supabase &> /dev/null; then
        DB_URL=$(supabase status 2>/dev/null | grep "DB URL" | awk '{print $NF}' || true)
        if [ -n "$DB_URL" ]; then
            SUPABASE_DB_URL="$DB_URL"
            echo -e "${GREEN}Found local Supabase DB URL${NC}"
        fi
    fi
    
    if [ -z "${SUPABASE_DB_URL:-}" ]; then
        echo -e "${RED}Error: Set SUPABASE_DB_URL environment variable${NC}"
        echo "  Example: postgresql://postgres:password@db.xxxx.supabase.co:5432/postgres"
        exit 1
    fi
fi

# Create backup directory
mkdir -p "$BACKUP_DIR"

echo -e "${YELLOW}Starting backup...${NC}"
echo "  Timestamp: $TIMESTAMP"
echo "  Target: $BACKUP_FILE"

# Run pg_dump
pg_dump "$SUPABASE_DB_URL" \
    --no-owner \
    --no-acl \
    --clean \
    --if-exists \
    --schema=public \
    --exclude-table-data='auth.*' \
    --exclude-table-data='storage.*' \
    2>/dev/null | gzip > "$BACKUP_FILE"

# Verify backup
FILESIZE=$(stat -f%z "$BACKUP_FILE" 2>/dev/null || stat --printf="%s" "$BACKUP_FILE" 2>/dev/null)
if [ "$FILESIZE" -lt 100 ]; then
    echo -e "${RED}Error: Backup file is too small (${FILESIZE} bytes). Check connection.${NC}"
    rm -f "$BACKUP_FILE"
    exit 1
fi

FILESIZE_KB=$((FILESIZE / 1024))
echo -e "${GREEN}✓ Backup completed: ${FILESIZE_KB}KB${NC}"

# Cleanup old backups
echo -e "${YELLOW}Cleaning up backups older than ${BACKUP_RETAIN} days...${NC}"
DELETED=$(find "$BACKUP_DIR" -name "quoteapp_backup_*.sql.gz" -mtime +${BACKUP_RETAIN} -delete -print 2>/dev/null | wc -l || echo "0")
echo -e "  Deleted: ${DELETED} old backup(s)"

# Summary
TOTAL=$(ls -1 "$BACKUP_DIR"/quoteapp_backup_*.sql.gz 2>/dev/null | wc -l)
echo ""
echo -e "${GREEN}Backup Summary:${NC}"
echo "  Current: $BACKUP_FILE ($FILESIZE_KB KB)"
echo "  Total backups: $TOTAL"
echo "  Retention: $BACKUP_RETAIN days"
echo ""
echo -e "${GREEN}Done! ✓${NC}"
