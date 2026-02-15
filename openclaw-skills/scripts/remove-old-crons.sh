#!/bin/bash

# Remove Old/Deprecated Cron Jobs
# Last Updated: 2026-02-13
#
# This script removes any old cron jobs that reference:
# - 3x/week publishing schedule
# - HOAReserveWise tool
# - Old agent names
# - Deprecated workflows
#
# Usage:
#   cd /home/sjpilche/projects/openclaw-v1
#   bash scripts/remove-old-crons.sh

set -e  # Exit on error

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Removing Old/Deprecated Cron Jobs"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check if openclaw command exists
if ! command -v openclaw &> /dev/null; then
    echo "❌ Error: 'openclaw' command not found"
    exit 1
fi

# Check if jq is installed
if ! command -v jq &> /dev/null; then
    echo "❌ Error: 'jq' command not found (required for parsing JSON)"
    echo "   Install jq: sudo apt-get install jq"
    exit 1
fi

echo "✅ Prerequisites found (openclaw, jq)"
echo ""

# Get all cron jobs
echo "📋 Fetching current cron jobs..."
CRON_JOBS=$(openclaw cron list --json 2>/dev/null || echo "[]")

if [ "$CRON_JOBS" == "[]" ]; then
    echo "ℹ️  No cron jobs found. Nothing to remove."
    echo ""
    exit 0
fi

echo "Found $(echo "$CRON_JOBS" | jq '. | length') cron job(s)"
echo ""

# Patterns to match for removal
DEPRECATED_PATTERNS=(
    "HOAReserveWise"
    "reserve-wise"
    "reservewise"
    "3x/week"
    "Mon/Wed/Fri"
    "Monday/Wednesday/Friday"
    "0 6 * * 1,3,5"  # Mon/Wed/Fri 6am schedule
    "lead magnet"
    "email signup"
    "download guide"
)

removed_count=0

# Loop through each cron job
while IFS= read -r cron_id; do
    # Get the full cron job details
    cron_details=$(echo "$CRON_JOBS" | jq -r ".[] | select(.id == \"$cron_id\")")

    cron_name=$(echo "$cron_details" | jq -r '.name // "Unnamed"')
    cron_message=$(echo "$cron_details" | jq -r '.message // ""')
    cron_schedule=$(echo "$cron_details" | jq -r '.cron // ""')

    # Check if this cron job matches any deprecated pattern
    should_remove=false
    matched_pattern=""

    for pattern in "${DEPRECATED_PATTERNS[@]}"; do
        if echo "$cron_name $cron_message $cron_schedule" | grep -qi "$pattern"; then
            should_remove=true
            matched_pattern="$pattern"
            break
        fi
    done

    # Remove if it matches a deprecated pattern
    if [ "$should_remove" = true ]; then
        echo "🗑️  Removing: $cron_name"
        echo "   ID: $cron_id"
        echo "   Reason: Matches deprecated pattern '$matched_pattern'"

        openclaw cron remove --id "$cron_id" 2>/dev/null || {
            echo "   ⚠️  Failed to remove (may already be deleted)"
        }

        removed_count=$((removed_count + 1))
        echo ""
    fi
done < <(echo "$CRON_JOBS" | jq -r '.[].id')

# Summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ $removed_count -eq 0 ]; then
    echo "✅ No deprecated cron jobs found"
    echo ""
    echo "All cron jobs appear to be using the current schedule."
else
    echo "✅ Removed $removed_count deprecated cron job(s)"
    echo ""
    echo "Run 'bash scripts/setup-all-crons.sh' to configure the new schedule."
fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Show remaining cron jobs
remaining=$(openclaw cron list --json 2>/dev/null | jq '. | length')
echo "📊 Remaining cron jobs: $remaining"
echo ""
echo "To view active cron jobs:"
echo "   openclaw cron list"
echo ""
