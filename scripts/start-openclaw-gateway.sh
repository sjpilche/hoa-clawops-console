#!/bin/bash
# Start OpenClaw Gateway on port 8000
# This script should be run from WSL2 to start the OpenClaw Gateway service.

set -e  # Exit on error

echo "========================================"
echo "  Starting OpenClaw Gateway on port 8000"
echo "========================================"
echo ""

# Load NVM (Node Version Manager)
if [ -f "$HOME/.nvm/nvm.sh" ]; then
  echo "Loading NVM..."
  source "$HOME/.nvm/nvm.sh"
else
  echo "⚠️  NVM not found. Make sure Node.js is available."
fi

# Navigate to OpenClaw directory
OPENCLAW_DIR="/home/sjpilche/projects/openclaw-v1"

if [ ! -d "$OPENCLAW_DIR" ]; then
  echo "❌ Error: OpenClaw directory not found at $OPENCLAW_DIR"
  exit 1
fi

cd "$OPENCLAW_DIR"
echo "📁 Working directory: $(pwd)"
echo ""

# Check if .env file exists
if [ ! -f ".env" ]; then
  echo "⚠️  Warning: .env file not found in $OPENCLAW_DIR"
  echo "   OpenClaw may not have API keys configured."
fi

# Start the gateway
echo "🚀 Starting OpenClaw Gateway..."
echo "   Port: 8000"
echo "   WebSocket URL: ws://127.0.0.1:8000"
echo "   Dashboard: http://127.0.0.1:8000/"
echo ""
echo "Press Ctrl+C to stop the gateway."
echo ""

# Run the gateway on port 8000
openclaw gateway run --port 8000
