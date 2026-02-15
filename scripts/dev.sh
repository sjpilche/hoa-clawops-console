#!/bin/bash
# Start both Express server and Vite dev server
# Uses concurrently to run both in one terminal
echo "🚀 Starting ClawOps Console..."
echo "   Server: http://localhost:3001"
echo "   Client: http://localhost:5173"
echo ""
npx concurrently \
  --names "SERVER,CLIENT" \
  --prefix-colors "cyan,magenta" \
  "node server/index.js" \
  "npx vite"
