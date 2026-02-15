#!/bin/bash
# OpenClaw Gateway Watchdog
# Keeps the gateway running — restarts it if it crashes.
# Designed to be launched at Windows login via Task Scheduler.

OPENCLAW_DIR="/home/sjpilche/projects/openclaw-v1"
GATEWAY_PORT=8000
RESTART_DELAY=10
LOG_FILE="$OPENCLAW_DIR/gateway-watchdog.log"
MAX_LOG_LINES=500

log() {
  local msg="[$(date '+%Y-%m-%d %H:%M:%S')] $1"
  echo "$msg"
  echo "$msg" >> "$LOG_FILE"

  # Trim log file if too large
  if [ -f "$LOG_FILE" ] && [ "$(wc -l < "$LOG_FILE")" -gt "$MAX_LOG_LINES" ]; then
    tail -n "$MAX_LOG_LINES" "$LOG_FILE" > "$LOG_FILE.tmp" && mv "$LOG_FILE.tmp" "$LOG_FILE"
  fi
}

# Load NVM
if [ -f "$HOME/.nvm/nvm.sh" ]; then
  source "$HOME/.nvm/nvm.sh"
fi

if [ ! -d "$OPENCLAW_DIR" ]; then
  log "ERROR: OpenClaw directory not found at $OPENCLAW_DIR"
  exit 1
fi

cd "$OPENCLAW_DIR"

log "Watchdog started. Gateway will run on port $GATEWAY_PORT."
log "Logs: $LOG_FILE"

while true; do
  log "Starting OpenClaw Gateway on port $GATEWAY_PORT..."
  openclaw gateway run --port "$GATEWAY_PORT" >> "$LOG_FILE" 2>&1
  EXIT_CODE=$?
  log "Gateway exited with code $EXIT_CODE. Restarting in ${RESTART_DELAY}s..."
  sleep "$RESTART_DELAY"
done
