#!/bin/bash
# =============================================================================
# OpenClaw 2.0 — New Machine Setup Script
# Target: EEKOM A9 Max (Ryzen AI 9 HX 370, 64GB DDR5, Ubuntu 24.04 LTS)
# =============================================================================
#
# BEFORE RUNNING THIS SCRIPT:
#   1. Install Ubuntu 24.04 LTS Desktop
#   2. Copy this entire repo to ~/openclaw on the new machine
#   3. Make sure data/clawops.db is in place (from backup)
#   4. Make sure ~/.openclaw/ is copied from backup
#
# USAGE:
#   chmod +x setup-new-machine.sh
#   ./setup-new-machine.sh
#
# This script is safe to re-run. It checks before installing.
# =============================================================================

set -e  # Exit on any error

OPENCLAW_DIR="$HOME/openclaw"
LOG_FILE="$OPENCLAW_DIR/setup-log-$(date +%Y%m%d-%H%M%S).txt"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log() { echo -e "${GREEN}[✓]${NC} $1" | tee -a "$LOG_FILE"; }
warn() { echo -e "${YELLOW}[!]${NC} $1" | tee -a "$LOG_FILE"; }
fail() { echo -e "${RED}[✗]${NC} $1" | tee -a "$LOG_FILE"; }
step() { echo -e "\n${BLUE}━━━ $1 ━━━${NC}" | tee -a "$LOG_FILE"; }

# =============================================================================
step "PHASE 0: Pre-Flight Checks"
# =============================================================================

echo "Setup log: $LOG_FILE"

# Check we're on Linux
if [[ "$(uname)" != "Linux" ]]; then
    fail "This script is for Linux (Ubuntu 24.04). Detected: $(uname)"
    exit 1
fi

# Check repo exists
if [[ ! -f "$OPENCLAW_DIR/package.json" ]]; then
    fail "OpenClaw repo not found at $OPENCLAW_DIR"
    echo "  Copy the repo to $OPENCLAW_DIR first, then re-run this script."
    exit 1
fi

# Check database exists
if [[ -f "$OPENCLAW_DIR/data/clawops.db" ]]; then
    DB_SIZE=$(du -h "$OPENCLAW_DIR/data/clawops.db" | cut -f1)
    log "Database found: data/clawops.db ($DB_SIZE)"
else
    warn "data/clawops.db NOT FOUND — agents will start with empty database"
    echo "  If you have a backup, copy it to $OPENCLAW_DIR/data/clawops.db now."
    read -p "  Continue anyway? (y/N) " -n 1 -r
    echo
    [[ $REPLY =~ ^[Yy]$ ]] || exit 1
fi

# Check ~/.openclaw/ config
if [[ -d "$HOME/.openclaw" ]]; then
    log "~/.openclaw/ config found"
else
    warn "~/.openclaw/ NOT FOUND — OpenClaw CLI will use restrictive defaults"
    echo "  Copy from: backups/openclaw-config/ → ~/.openclaw/"
    if [[ -d "$OPENCLAW_DIR/backups/openclaw-config" ]]; then
        cp -r "$OPENCLAW_DIR/backups/openclaw-config" "$HOME/.openclaw"
        log "Restored ~/.openclaw/ from backups/openclaw-config/"
    else
        warn "No backup found either. You'll need to configure OpenClaw CLI manually."
    fi
fi

# Check trader brain
if [[ -f "$OPENCLAW_DIR/services/trader-service/data/trader-brain.sqlite" ]]; then
    log "Trader brain found"
else
    warn "trader-brain.sqlite not found — trader will start with fresh brain"
fi

# =============================================================================
step "PHASE 1: System Dependencies"
# =============================================================================

log "Updating system packages..."
sudo apt update -y | tail -1 | tee -a "$LOG_FILE"
sudo apt upgrade -y | tail -1 | tee -a "$LOG_FILE"

log "Installing build tools and utilities..."
sudo apt install -y build-essential git curl wget unzip software-properties-common \
    python3 python3-pip python3-venv \
    | tail -1 | tee -a "$LOG_FILE"

log "System dependencies installed"

# =============================================================================
step "PHASE 2: Node.js 24 via nvm"
# =============================================================================

if command -v node &> /dev/null && [[ "$(node --version)" == v24* ]]; then
    log "Node.js $(node --version) already installed"
else
    log "Installing nvm..."
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash

    # Load nvm into current shell
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

    log "Installing Node.js 24..."
    nvm install 24
    nvm use 24
    nvm alias default 24

    log "Node.js $(node --version) installed"
fi

# Make sure nvm is loaded
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

log "npm $(npm --version)"

# =============================================================================
step "PHASE 3: Global CLIs"
# =============================================================================

# pm2
if command -v pm2 &> /dev/null; then
    log "pm2 $(pm2 --version) already installed"
else
    log "Installing pm2..."
    npm install -g pm2
    log "pm2 $(pm2 --version) installed"
fi

# OpenClaw CLI
if command -v openclaw &> /dev/null; then
    log "OpenClaw $(openclaw --version 2>/dev/null || echo 'installed') found"
else
    log "Installing OpenClaw CLI..."
    npm install -g openclaw
    log "OpenClaw CLI installed"
fi

# yt-dlp
if command -v yt-dlp &> /dev/null; then
    log "yt-dlp $(yt-dlp --version) already installed"
else
    log "Installing yt-dlp..."
    pip install --break-system-packages yt-dlp 2>/dev/null || pip install yt-dlp
    log "yt-dlp installed"
fi

# =============================================================================
step "PHASE 4: Ollama + Models"
# =============================================================================

if command -v ollama &> /dev/null; then
    log "Ollama already installed"
else
    log "Installing Ollama..."
    curl -fsSL https://ollama.com/install.sh | sh
    log "Ollama installed"
fi

# Enable Ollama as system service
sudo systemctl enable ollama 2>/dev/null || true
sudo systemctl start ollama 2>/dev/null || true

# Wait for Ollama to be ready
log "Waiting for Ollama to start..."
for i in {1..30}; do
    if curl -s http://127.0.0.1:11434/api/tags > /dev/null 2>&1; then
        log "Ollama is running"
        break
    fi
    sleep 1
done

# Pull models (largest first — can be interrupted and resumed)
echo ""
echo "  Model downloads — this will take a while with the 70B model."
echo "  You can Ctrl+C and re-run this script later to resume."
echo ""

pull_model() {
    local model=$1
    local desc=$2
    if ollama list 2>/dev/null | grep -q "$(echo $model | cut -d: -f1)"; then
        log "$model already pulled"
    else
        log "Pulling $model ($desc)..."
        ollama pull "$model"
        log "$model ready"
    fi
}

# Pull in order: smallest first so you can start testing sooner
pull_model "llama3.1:8b"               "5 GB — fast general purpose"
pull_model "deepseek-coder-v2:16b"     "9 GB — code gen (existing compat)"
pull_model "qwen2.5-coder:32b"         "20 GB — better code gen"
pull_model "llama3.3:70b-q4_K_M"       "42 GB — primary model, near GPT-4o quality"

echo ""
log "All models pulled. Current inventory:"
ollama list | tee -a "$LOG_FILE"

# =============================================================================
step "PHASE 5: Playwright"
# =============================================================================

log "Installing Playwright system dependencies..."
cd "$OPENCLAW_DIR"
sudo npx playwright install-deps chromium 2>&1 | tail -3 | tee -a "$LOG_FILE"

log "Installing Chromium browser..."
npx playwright install chromium 2>&1 | tail -3 | tee -a "$LOG_FILE"

log "Playwright ready"

# =============================================================================
step "PHASE 6: npm install"
# =============================================================================

cd "$OPENCLAW_DIR"

log "Installing project dependencies..."
npm install 2>&1 | tail -5 | tee -a "$LOG_FILE"

log "npm install complete"

# =============================================================================
step "PHASE 7: Update Configuration"
# =============================================================================

# Update ecosystem.config.cjs ROOT path
ECOSYSTEM_FILE="$OPENCLAW_DIR/ecosystem.config.cjs"
if grep -q "C:\\\\Users\\\\SPilcher" "$ECOSYSTEM_FILE"; then
    log "Updating ecosystem.config.cjs ROOT path..."
    sed -i "s|const ROOT = '.*';|const ROOT = '$OPENCLAW_DIR';|" "$ECOSYSTEM_FILE"
    log "ROOT updated to: $OPENCLAW_DIR"
else
    log "ecosystem.config.cjs ROOT already updated"
fi

# Update .env.local OPENCLAW_PATH
ENV_FILE="$OPENCLAW_DIR/.env.local"
if [[ -f "$ENV_FILE" ]]; then
    OPENCLAW_BIN=$(dirname "$(which openclaw 2>/dev/null || echo '/usr/local/bin/openclaw')")

    if grep -q "OPENCLAW_PATH=" "$ENV_FILE"; then
        sed -i "s|OPENCLAW_PATH=.*|OPENCLAW_PATH=$OPENCLAW_BIN|" "$ENV_FILE"
        log "OPENCLAW_PATH updated to: $OPENCLAW_BIN"
    else
        echo "OPENCLAW_PATH=$OPENCLAW_BIN" >> "$ENV_FILE"
        log "OPENCLAW_PATH added: $OPENCLAW_BIN"
    fi

    # Update Ollama model references for bigger models
    if grep -q "OLLAMA_DEFAULT_MODEL=" "$ENV_FILE"; then
        sed -i "s|OLLAMA_DEFAULT_MODEL=.*|OLLAMA_DEFAULT_MODEL=llama3.3:70b-q4_K_M|" "$ENV_FILE"
        log "OLLAMA_DEFAULT_MODEL updated to llama3.3:70b-q4_K_M"
    else
        echo "OLLAMA_DEFAULT_MODEL=llama3.3:70b-q4_K_M" >> "$ENV_FILE"
        log "OLLAMA_DEFAULT_MODEL added"
    fi

    if grep -q "OLLAMA_CODER_MODEL=" "$ENV_FILE"; then
        sed -i "s|OLLAMA_CODER_MODEL=.*|OLLAMA_CODER_MODEL=qwen2.5-coder:32b|" "$ENV_FILE"
    else
        echo "OLLAMA_CODER_MODEL=qwen2.5-coder:32b" >> "$ENV_FILE"
    fi
    log "Ollama model config updated for 64GB machine"
else
    warn ".env.local not found — you'll need to create it from .env.example"
fi

# Create logs directory
mkdir -p "$OPENCLAW_DIR/logs"
mkdir -p "$OPENCLAW_DIR/services/trader-service/logs"
mkdir -p "$OPENCLAW_DIR/data"
log "Log and data directories created"

# =============================================================================
step "PHASE 8: Seed Database"
# =============================================================================

cd "$OPENCLAW_DIR"

log "Seeding agents..."
node scripts/seed-all-agents.js 2>&1 | tail -3 | tee -a "$LOG_FILE"

log "Seeding schedules..."
node scripts/seed-all-schedules.js --clean 2>&1 | tail -3 | tee -a "$LOG_FILE"

log "Seeding pipelines..."
node scripts/seed-pipelines.js 2>&1 | tail -3 | tee -a "$LOG_FILE"

log "Database seeded"

# =============================================================================
step "PHASE 9: Create Helper Scripts"
# =============================================================================

# start.sh
cat > "$OPENCLAW_DIR/start.sh" << 'SCRIPT'
#!/bin/bash
cd "$(dirname "$0")"
pm2 start ecosystem.config.cjs
pm2 save
echo "OpenClaw fleet started. Run 'pm2 status' to check."
SCRIPT
chmod +x "$OPENCLAW_DIR/start.sh"

# stop.sh
cat > "$OPENCLAW_DIR/stop.sh" << 'SCRIPT'
#!/bin/bash
pm2 stop all
echo "OpenClaw fleet stopped."
SCRIPT
chmod +x "$OPENCLAW_DIR/stop.sh"

# restart.sh
cat > "$OPENCLAW_DIR/restart.sh" << 'SCRIPT'
#!/bin/bash
cd "$(dirname "$0")"
pm2 restart all
echo "OpenClaw fleet restarted."
SCRIPT
chmod +x "$OPENCLAW_DIR/restart.sh"

# status.sh
cat > "$OPENCLAW_DIR/status.sh" << 'SCRIPT'
#!/bin/bash
echo "=== PM2 Services ==="
pm2 status

echo ""
echo "=== Ollama Models ==="
ollama list 2>/dev/null || echo "Ollama not running"

echo ""
echo "=== Database Size ==="
du -h data/clawops.db 2>/dev/null || echo "No database"

echo ""
echo "=== Disk Usage ==="
df -h / | tail -1

echo ""
echo "=== Memory ==="
free -h | head -2

echo ""
echo "=== Health Check ==="
curl -s http://localhost:3001/api/health 2>/dev/null || echo "Server not responding"
SCRIPT
chmod +x "$OPENCLAW_DIR/status.sh"

# smoke-test.sh
cat > "$OPENCLAW_DIR/smoke-test.sh" << 'SCRIPT'
#!/bin/bash
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

pass() { echo -e "${GREEN}[PASS]${NC} $1"; }
fail() { echo -e "${RED}[FAIL]${NC} $1"; }

echo "=== OpenClaw Smoke Test ==="
echo ""

# PM2
pm2 status > /dev/null 2>&1 && pass "PM2 running" || fail "PM2 not running"

# Server
curl -sf http://localhost:3001/api/health > /dev/null 2>&1 && pass "Server :3001 healthy" || fail "Server :3001 not responding"

# Client
curl -sf http://localhost:5174 > /dev/null 2>&1 && pass "Client :5174 serving" || fail "Client :5174 not responding"

# Trader
curl -sf http://localhost:3002/health > /dev/null 2>&1 && pass "Trader :3002 healthy" || fail "Trader :3002 not responding"

# Ollama
curl -sf http://127.0.0.1:11434/api/tags > /dev/null 2>&1 && pass "Ollama :11434 running" || fail "Ollama :11434 not responding"

# Playwright
curl -sf http://localhost:3001/api/health/playwright > /dev/null 2>&1 && pass "Playwright pool healthy" || fail "Playwright health unknown"

# Database
if [[ -f data/clawops.db ]]; then
    SIZE=$(du -h data/clawops.db | cut -f1)
    pass "Database present ($SIZE)"
else
    fail "Database missing"
fi

# Agent count
AGENTS=$(curl -sf http://localhost:3001/api/agents 2>/dev/null | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null)
if [[ -n "$AGENTS" && "$AGENTS" -gt 50 ]]; then
    pass "Agents seeded ($AGENTS agents)"
else
    fail "Agent count low or unavailable ($AGENTS)"
fi

# Schedule count
SCHEDULES=$(curl -sf http://localhost:3001/api/schedules 2>/dev/null | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null)
if [[ -n "$SCHEDULES" && "$SCHEDULES" -gt 40 ]]; then
    pass "Schedules seeded ($SCHEDULES schedules)"
else
    fail "Schedule count low or unavailable ($SCHEDULES)"
fi

# Discord
if curl -sf http://localhost:3001/api/discord/status > /dev/null 2>&1; then
    pass "Discord integration configured"
else
    fail "Discord status unknown"
fi

# Ollama models
MODEL_COUNT=$(ollama list 2>/dev/null | tail -n +2 | wc -l)
if [[ "$MODEL_COUNT" -ge 3 ]]; then
    pass "Ollama models loaded ($MODEL_COUNT models)"
else
    fail "Expected 3+ Ollama models, found $MODEL_COUNT"
fi

echo ""
echo "=== Test Complete ==="
SCRIPT
chmod +x "$OPENCLAW_DIR/smoke-test.sh"

log "Helper scripts created: start.sh, stop.sh, restart.sh, status.sh, smoke-test.sh"

# =============================================================================
step "PHASE 10: Start Services"
# =============================================================================

cd "$OPENCLAW_DIR"

log "Starting OpenClaw fleet..."
pm2 start ecosystem.config.cjs 2>&1 | tee -a "$LOG_FILE"

# Wait for services to start
sleep 5

log "PM2 status:"
pm2 status | tee -a "$LOG_FILE"

# =============================================================================
step "PHASE 11: Configure Auto-Start on Boot"
# =============================================================================

log "Saving PM2 process list..."
pm2 save

log "Setting up PM2 startup service..."
echo ""
echo "  Run the following command (pm2 will tell you the exact sudo command):"
echo ""
pm2 startup 2>&1 | grep "sudo" | tee -a "$LOG_FILE"
echo ""
warn "Copy and run the sudo command above to enable auto-start on boot"

# =============================================================================
step "PHASE 12: Smoke Test"
# =============================================================================

sleep 10  # Give services a moment to fully initialize

log "Running smoke tests..."
echo ""
bash "$OPENCLAW_DIR/smoke-test.sh" 2>&1 | tee -a "$LOG_FILE"

# =============================================================================
step "SETUP COMPLETE"
# =============================================================================

echo ""
echo "============================================================"
echo "  OpenClaw 2.0 is running on your new machine!"
echo "============================================================"
echo ""
echo "  Dashboard:  http://localhost:5174"
echo "  Login:      admin@clawops.local / changeme123"
echo "  API:        http://localhost:3001/api"
echo "  Trader:     http://localhost:3002"
echo ""
echo "  Helper scripts:"
echo "    ./start.sh        Start all services"
echo "    ./stop.sh         Stop all services"
echo "    ./restart.sh      Restart all services"
echo "    ./status.sh       Full system status"
echo "    ./smoke-test.sh   Run health checks"
echo ""
echo "  Logs:  pm2 logs"
echo "  Setup log saved to: $LOG_FILE"
echo ""
echo "  NEXT STEPS:"
echo "    1. Run the pm2 startup sudo command above (auto-start on boot)"
echo "    2. Add new machine IP to Azure SQL firewall"
echo "       (Azure Portal → empirecapital → Networking)"
echo "    3. Verify Discord notifications are arriving"
echo "    4. Let it run overnight — check morning digest at 7 AM"
echo "    5. After 24h stable, stop schedules on old machine"
echo ""
echo "  TO UPDATE AGENTS TO USE BIGGER MODELS:"
echo "    Edit server/services/ollamaBridge.js to reference:"
echo "      - llama3.3:70b-q4_K_M (general — replaces llama3.2:3b)"
echo "      - qwen2.5-coder:32b (code — replaces deepseek-coder-v2:16b)"
echo "    Or update OLLAMA_DEFAULT_MODEL in .env.local (already done)"
echo ""
echo "============================================================"
