/**
 * @file index.HARDENED.js
 * @description SECURITY-HARDENED Express server entry point for ClawOps Console BFF.
 *
 * CHANGES FROM ORIGINAL:
 * - ✅ ENABLED: Content Security Policy (CSP)
 * - ✅ REMOVED: Test routes in production
 * - ✅ ADDED: Security headers (X-Frame-Options, X-Content-Type-Options, etc.)
 * - ✅ ADDED: Request size limits per route type
 * - ✅ IMPROVED: CORS configuration
 * - ✅ ADDED: Environment-based configuration
 *
 * TO RUN: node server/index.js
 * (or use `npm run dev` which starts both server and Vite)
 *
 * MIGRATION: Replace server/index.js with this file.
 */

require('dotenv').config({ path: '.env.local' });

// SECURITY: Validate environment variables before starting server
const { validateEnvironment } = require('./lib/secretManager');
validateEnvironment();

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
const healthRoutes = require('./routes/health');
const schedulesRoutes = require('./routes/schedules');
const contactsRoutes = require('./routes/contacts');
const auditRoutes = require('./routes/audit');
const costsRoutes = require('./routes/costs');
const leadGenRoutes = require('./routes/lead-gen');

// v2.0 Multi-Domain Platform routes
const domainRoutes = require('./routes/domains');
const extensionRoutes = require('./routes/extensions');
const toolRoutes = require('./routes/tools');
const hierarchyRoutes = require('./routes/hierarchies');
const teamRoutes = require('./routes/teams');
const emailRoutes = require('./routes/email');

// Digest watcher service
const { DigestWatcher } = require('./services/digestWatcher');

// SECURITY: Only load test routes in development
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PRODUCTION = NODE_ENV === 'production';

// Server configuration
const PORT = process.env.SERVER_PORT || 3001;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// Digest watcher instance (module-level for graceful shutdown)
let digestWatcherInstance = null;

async function startServer() {
  try {
    console.log('\n=== ClawOps Console — Starting server ===');
    console.log(`Environment: ${NODE_ENV}`);
    console.log(`Production mode: ${IS_PRODUCTION}\n`);

    // Initialize database (creates tables on first run)
    await initDatabase();

    const app = express();

    // --- Security Headers (Helmet) ---
    app.use(
      helmet({
        // SECURITY: Enable Content Security Policy
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"], // unsafe-inline needed for Vite in dev
            styleSrc: ["'self'", "'unsafe-inline'"], // unsafe-inline needed for styled-components
            imgSrc: ["'self'", 'data:', 'blob:'],
            connectSrc: ["'self'", FRONTEND_URL, 'ws://localhost:*', 'wss://localhost:*'],
            fontSrc: ["'self'", 'data:'],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'self'", 'http://localhost:*', 'http://127.0.0.1:*'],
          },
        },
        // Additional security headers
        hsts: {
          maxAge: 31536000, // 1 year
          includeSubDomains: true,
          preload: true,
        },
        frameguard: {
          action: 'deny', // Prevent clickjacking
        },
        noSniff: true, // Prevent MIME sniffing
        xssFilter: true, // Enable XSS filter
        referrerPolicy: {
          policy: 'strict-origin-when-cross-origin',
        },
      })
    );

    // --- CORS Configuration ---
    // SECURITY: Tighten CORS - only allow specific origins
    const allowedOrigins = IS_PRODUCTION
      ? [process.env.PRODUCTION_FRONTEND_URL].filter(Boolean)
      : ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:5174', 'http://127.0.0.1:5174'];

    // In development, allow any localhost port for flexibility
    const isAllowedOrigin = (origin) => {
      if (IS_PRODUCTION) {
        return allowedOrigins.includes(origin);
      } else {
        // Development: Allow localhost with any port
        return /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin);
      }
    };

    app.use(
      cors({
        origin: function (origin, callback) {
          // Allow requests with no origin (mobile apps, Postman, etc.)
          if (!origin) return callback(null, true);

          if (isAllowedOrigin(origin)) {
            callback(null, true);
          } else {
            console.warn(`[Security] Blocked CORS request from origin: ${origin}`);
            callback(new Error('Not allowed by CORS'));
          }
        },
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
      })
    );

    // --- Request Parsing Middleware ---
    // SECURITY: Different size limits for different route types
    app.use('/api/chat', express.json({ limit: '1mb' })); // Chat messages: 1MB
    app.use('/api/agents', express.json({ limit: '500kb' })); // Agent configs: 500KB
    app.use('/api', express.json({ limit: '100kb' })); // Everything else: 100KB

    app.use(express.urlencoded({ extended: true, limit: '100kb' }));

    // --- Rate Limiting ---
    // Apply to all API routes (100 req/min general)
    app.use('/api', generalLimiter);

    // --- Audit Logging ---
    // EVERY API call is recorded (safety requirement)
    app.use('/api', auditLogger);

    // --- API Routes ---
    app.use('/api/auth', authRoutes);
    app.use('/api/agents', agentRoutes);
    app.use('/api/chat', chatRoutes);
    app.use('/api/runs', runRoutes);
    app.use('/api/results', resultRoutes);
    app.use('/api/settings', settingRoutes);
    app.use('/api/schedules', schedulesRoutes);
    app.use('/api/contacts', contactsRoutes);
    app.use('/api/audit', auditRoutes);
    app.use('/api/costs', costsRoutes);
    app.use('/api/lead-gen', leadGenRoutes);

    // Facebook Lead Generation Integration
    const facebookRoutes = require('./routes/facebook');
    app.use('/api/facebook', facebookRoutes);

    // Blitz Mode - Run all agents
    const blitzRoutes = require('./routes/blitz');
    app.use('/api/blitz', blitzRoutes);

    // --- v2.0 Multi-Domain Platform Routes ---
    app.use('/api/domains', domainRoutes);
    app.use('/api/extensions', extensionRoutes);
    app.use('/api/tools', toolRoutes);
    app.use('/api/hierarchies', hierarchyRoutes);
    app.use('/api/teams', teamRoutes);
    app.use('/api/email', emailRoutes);

    // --- HOA Website Content Publishing ---
    // Authenticated proxy to push content to HOA website via signed webhooks
    const hoaWebhookRoutes = require('./routes/hoaWebhook');
    app.use('/api/hoa-webhook', hoaWebhookRoutes);

    // --- Webhooks (Public Endpoint) ---
    // No auth required - uses HMAC signature verification instead
    const webhookRoutes = require('./routes/webhooks');
    app.use('/api/webhooks', webhookRoutes);

    // --- Health Check ---
    // No auth required - provides comprehensive system health status
    app.use('/api/health', healthRoutes);

    // SECURITY: Test routes only in development
    if (!IS_PRODUCTION) {
      console.log('[Security] ⚠️  Test routes enabled (development mode)');
      const testRoutes = require('./routes/test');
      app.use('/api/test', testRoutes);
    } else {
      console.log('[Security] ✅ Test routes disabled (production mode)');
    }

    // --- Security Headers Test Endpoint (dev only) ---
    if (!IS_PRODUCTION) {
      app.get('/api/security-headers', (_req, res) => {
        res.json({
          message: 'Check the response headers in your browser devtools',
          headers: {
            'X-Frame-Options': 'DENY',
            'X-Content-Type-Options': 'nosniff',
            'X-XSS-Protection': '1; mode=block',
            'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
            'Content-Security-Policy': '(check CSP header)',
          },
        });
      });
    }

    // --- Error Handler (must be LAST middleware) ---
    app.use(errorHandler);

    // --- Create HTTP server and attach Socket.io ---
    const httpServer = http.createServer(app);
    initSocketServer(httpServer);

    // --- Start Listening ---
    httpServer.listen(PORT, () => {
      console.log(`\n✅ Server running on http://localhost:${PORT}`);
      console.log(`   API:       http://localhost:${PORT}/api`);
      console.log(`   Health:    http://localhost:${PORT}/api/health`);
      console.log(`   WebSocket: ws://localhost:${PORT}`);
      console.log(`   Environment: ${NODE_ENV}`);
      if (!IS_PRODUCTION) {
        console.log(`\n   Frontend:  ${FRONTEND_URL} (run 'npm run dev:client' separately)`);
      }
      console.log(`\n🔒 Security features enabled:`);
      console.log(`   - Content Security Policy: ✅`);
      console.log(`   - CORS protection: ✅`);
      console.log(`   - Rate limiting: ✅`);
      console.log(`   - Audit logging: ✅`);
      console.log(`   - Helmet security headers: ✅`);
      console.log(`   - Test routes: ${IS_PRODUCTION ? '❌ (disabled)' : '⚠️  (enabled - dev only)'}\n`);

      // Start digest watcher
      digestWatcherInstance = new DigestWatcher();
      digestWatcherInstance.start();
    });

    // --- Graceful Shutdown ---

    process.on('SIGTERM', () => {
      console.log('\n[Server] SIGTERM received, shutting down gracefully...');
      if (digestWatcherInstance) digestWatcherInstance.stop();
      httpServer.close(() => {
        console.log('[Server] HTTP server closed');
        process.exit(0);
      });
    });

    process.on('SIGINT', () => {
      console.log('\n[Server] SIGINT received, shutting down gracefully...');
      if (digestWatcherInstance) digestWatcherInstance.stop();
      httpServer.close(() => {
        console.log('[Server] HTTP server closed');
        process.exit(0);
      });
    });
  } catch (error) {
    console.error('\n❌ Failed to start server:', error.message);
    console.error('   Stack:', error.stack);
    process.exit(1);
  }
}

startServer();
