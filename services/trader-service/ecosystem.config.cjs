module.exports = {
  apps: [{
    name: 'openclaw-trader',
    cwd: 'C:\\Users\\SPilcher\\OpenClaw2.0 for linux - Copy\\services\\trader-service',
    script: 'src/server.ts',
    interpreter: 'node',
    interpreter_args: '--import tsx',
    instances: 1,
    exec_mode: 'fork',

    // Logging
    error_file: './logs/error.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,

    // Log rotation (50MB max, keep 10 files)
    max_size: '50M',

    // Auto-restart
    autorestart: true,
    max_restarts: 50,
    min_uptime: '10s',
    restart_delay: 10000,        // 10s between restarts
    max_memory_restart: '500M',  // Restart if memory exceeds 500MB

    // Environment
    env: {
      NODE_ENV: 'production',
    },

    // Watch (disabled — scheduler handles its own loop)
    watch: false,

    // Graceful shutdown
    kill_timeout: 10000,
    listen_timeout: 15000,
  }],
};
