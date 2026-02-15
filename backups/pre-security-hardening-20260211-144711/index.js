/**
 * @file index.js
 * @description Express server entry point for ClawOps Console BFF.
 *
 * TO RUN: node server/index.js
 * (or use `npm run dev` which starts both server and Vite)
 */

require('dotenv').config({ path: '.env.local' });

const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');

const { initDatabase } = require('./db/connection');
const { initSocketServer } = require('./websocket/socketServer');
const auditLogger = require('./middleware/auditLogger');
const { generalLimiter } = require('./middleware/rateLimiter');
const { errorHandler } = require('./middleware/errorHandler');

const authRoutes = require('./routes/auth');
const agentRoutes = require('./routes/agents');
const chatRoutes = require('./routes/chat');
const runRoutes = require('./routes/runs');
const resultRoutes = require('./routes/results');
const settingRoutes = require('./routes/settings');
const testRoutes = require('./routes/test'); // TEST ONLY - Remove in production

const PORT = process.env.SERVER_PORT || 3001;

async function startServer() {
  try {
    console.log('\n=== ClawOps Console — Starting server ===\n');

    // Initialize database (creates tables on first run)
    await initDatabase();

    const app = express();

    // --- Security & Parsing Middleware ---
    app.use(helmet({ contentSecurityPolicy: false }));
    app.use(cors({ origin: ['http://localhost:5173'], credentials: true }));
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true }));

    // Rate limiting (100 req/min general)
    app.use('/api', generalLimiter);

    // Audit logging — EVERY API call is recorded (safety requirement)
    app.use('/api', auditLogger);

    // --- API Routes ---
    app.use('/api/auth', authRoutes);
    app.use('/api/agents', agentRoutes);
    app.use('/api/chat', chatRoutes);
    app.use('/api/runs', runRoutes);
    app.use('/api/results', resultRoutes);
    app.use('/api/settings', settingRoutes);
    app.use('/api/test', testRoutes); // TEST ONLY - Remove in production

    // Health check (no auth required)
    app.get('/api/health', (_req, res) => {
      res.json({
        status: 'ok',
        service: 'ClawOps Console BFF',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
      });
    });

    // --- Error Handler (must be LAST middleware) ---
    app.use(errorHandler);

    // --- Create HTTP server and attach Socket.io ---
    const httpServer = http.createServer(app);
    initSocketServer(httpServer);

    // --- Start listening ---
    httpServer.listen(PORT, () => {
      console.log(`\n✅ Server running on http://localhost:${PORT}`);
      console.log(`   API:       http://localhost:${PORT}/api`);
      console.log(`   Health:    http://localhost:${PORT}/api/health`);
      console.log(`   WebSocket: ws://localhost:${PORT}`);
      console.log(`\n   Frontend:  http://localhost:5173 (run 'npm run dev:client' separately)\n`);
    });
  } catch (error) {
    console.error('\n❌ Failed to start server:', error.message);
    console.error('   Stack:', error.stack);
    process.exit(1);
  }
}

startServer();
