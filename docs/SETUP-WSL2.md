# WSL2 Setup Guide

## Prerequisites

1. **Windows 11** with WSL2 enabled
2. **Ubuntu** distribution installed in WSL2
3. **Node.js 18+** (recommend 22 LTS)
4. **VS Code** with Remote-WSL extension

## Install Node.js in WSL2

```bash
# Install via NodeSource (recommended)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify
node --version  # Should be v22.x
npm --version   # Should be v10.x
```

## Clone and Run

```bash
cd ~
git clone <your-repo-url> clawops-console
cd clawops-console
chmod +x scripts/setup.sh
./scripts/setup.sh
npm run dev
```

## Common WSL2 Issues

### "Port already in use"
```bash
# Find what's using port 3001
lsof -i :3001
# Kill it
kill -9 <PID>
```

### "Cannot reach localhost:5173 from Windows browser"
WSL2 should forward ports automatically. If not:
1. Open PowerShell as Admin
2. Run: `wsl --shutdown`
3. Restart WSL2

### "node-gyp build fails"
We use sql.js (pure JavaScript) to avoid this. If you see native module
errors from other packages:
```bash
sudo apt-get install -y python3 make g++ build-essential
```
