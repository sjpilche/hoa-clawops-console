// Wrapper to start Vite dev server from pm2
// pm2 can't run ESM bin scripts directly on Windows
const { execSync } = require('child_process');
const path = require('path');

const root = path.resolve(__dirname, '..');
process.chdir(root);

// Use child_process to run vite with proper ESM handling
const { spawn } = require('child_process');
const child = spawn('node', ['node_modules/vite/bin/vite.js', '--host'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env },
});

child.on('exit', (code) => process.exit(code || 0));
