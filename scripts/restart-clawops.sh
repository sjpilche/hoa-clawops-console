#!/bin/bash
# ClawOps Full Restart — Git Bash / WSL
set -e
cd "$(dirname "$0")/.."

echo ""
echo "=== ClawOps Full Restart ==="
echo ""

# Kill all node processes
echo "[1/4] Killing all node processes..."
taskkill //F //IM node.exe 2>/dev/null || true
sleep 3

# Clean PM2 state
echo "[2/4] Cleaning PM2 daemon..."
rm -f "$HOME/.pm2/pm2.pid" "$HOME/.pm2/rpc.sock" "$HOME/.pm2/pub.sock" 2>/dev/null || true

# Ensure directories
echo "[3/4] Ensuring directories..."
mkdir -p logs

# Start PM2
echo "[4/4] Starting ClawOps via PM2..."
pm2 start ecosystem.config.cjs
sleep 5
pm2 status

echo ""
echo "=== ClawOps is running ==="
echo ""
echo "  Server:  http://localhost:3001"
echo "  Console: http://localhost:5174"
echo "  Login:   admin@clawops.local / changeme123"
echo ""
