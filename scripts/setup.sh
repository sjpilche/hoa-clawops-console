#!/bin/bash
# ==============================================================================
# ClawOps Console — One-Command Setup Script
# ==============================================================================
# Run this in WSL2:
#   chmod +x scripts/setup.sh
#   ./scripts/setup.sh
#
# What it does:
# 1. Checks prerequisites (Node.js, npm)
# 2. Installs npm dependencies
# 3. Creates .env.local from template if it doesn't exist
# 4. Creates the data directory
# 5. Seeds the database with default admin user
# 6. Tells you how to start the dev server
# ==============================================================================

set -e  # Exit on any error

echo ""
echo "========================================"
echo "  ClawOps Console — Setup"
echo "========================================"
echo ""

# --- Check Node.js ---
if ! command -v node &> /dev/null; then
  echo "❌ Node.js not found. Install it first:"
  echo "   curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -"
  echo "   sudo apt-get install -y nodejs"
  exit 1
fi

NODE_VERSION=$(node --version)
echo "✅ Node.js: $NODE_VERSION"

# --- Check npm ---
if ! command -v npm &> /dev/null; then
  echo "❌ npm not found. It should come with Node.js."
  exit 1
fi

NPM_VERSION=$(npm --version)
echo "✅ npm: $NPM_VERSION"

# --- Install dependencies ---
echo ""
echo "📦 Installing npm dependencies..."
npm install

# --- Create .env.local if missing ---
if [ ! -f .env.local ]; then
  echo ""
  echo "📝 Creating .env.local from .env.example..."
  cp .env.example .env.local
  echo "   ⚠️  Edit .env.local to set your own JWT_SECRET before production!"
fi

# --- Create data directory ---
mkdir -p data
echo "📁 Data directory: ./data/"

# --- Seed database ---
echo ""
echo "🌱 Seeding database..."
node scripts/seed-demo.js

# --- Done ---
echo ""
echo "========================================"
echo "  ✅ Setup complete!"
echo "========================================"
echo ""
echo "  Start development:"
echo "    npm run dev"
echo ""
echo "  This starts both:"
echo "    - Express server on http://localhost:3001"
echo "    - Vite dev server on http://localhost:5173"
echo ""
echo "  Login with:"
echo "    Email:    admin@clawops.local"
echo "    Password: changeme123"
echo ""
