// =============================================================================
// OpenClaw Fleet — pm2 Ecosystem Config
// =============================================================================
// Keeps the ClawOps army running 24/7:
//   1. ClawOps Server (Express, port 3001) — agent ops, schedules, brain
//   2. ClawOps Client (Vite, port 5174) — dashboard UI
//
// Trader Service lives in its own repo: openclaw-trader (port 3002)
//   → cd ../openclaw-trader && pm2 start ecosystem.config.cjs
//
// Usage:
//   pm2 start ecosystem.config.cjs        — Start all
//   pm2 restart all                       — Restart all
//   pm2 logs                              — Tail all logs
//   pm2 status                            — Dashboard
//   pm2 save                              — Persist for resurrect
//
// Auto-start: Run scripts/install-openclaw-autostart.bat as Admin (once)
// =============================================================================

const ROOT = __dirname;

module.exports = {
  apps: [
    // -----------------------------------------------------------------
    // 1. ClawOps Server — Agent operations, schedules, collective brain
    // -----------------------------------------------------------------
    {
      name: 'clawops-server',
      cwd: ROOT,
      script: 'server/index.js',
      instances: 1,
      exec_mode: 'fork',

      // Logging
      error_file: './logs/server-error.log',
      out_file: './logs/server-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      max_size: '50M',

      // Restart
      autorestart: true,
      max_restarts: 50,
      min_uptime: '10s',
      restart_delay: 5000,
      max_memory_restart: '500M',

      watch: false,
      kill_timeout: 15000,
      listen_timeout: 15000,
      wait_ready: false,
    },

    // -----------------------------------------------------------------
    // 2. ClawOps Client — Vite dev server (dashboard UI)
    // -----------------------------------------------------------------
    {
      name: 'clawops-client',
      cwd: ROOT,
      script: 'scripts/start-vite.cjs',
      instances: 1,
      exec_mode: 'fork',

      // Logging
      error_file: './logs/client-error.log',
      out_file: './logs/client-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      max_size: '20M',

      // Restart
      autorestart: true,
      max_restarts: 20,
      min_uptime: '5s',
      restart_delay: 5000,
      max_memory_restart: '300M',

      watch: false,
      kill_timeout: 8000,
    },

  ],
};
