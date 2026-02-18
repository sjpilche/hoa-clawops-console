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
const leadGenQueueRoutes = require('./routes/leadGenQueue');
const scannerRoutes = require('./routes/scanner');
const scheduleRoutes = require('./routes/schedules');
const contentQueueRoutes = require('./routes/contentQueue');
const hoaContactsRoutes = require('./routes/hoaContacts');
const hoaLeadsRoutes = require('./routes/hoaLeads');
const discoveryRoutes = require('./routes/discovery');
const mgmtResearchRoutes = require('./routes/mgmtResearch');
const cfoMarketingRoutes = require('./routes/cfoMarketing');
const campaignRoutes = require('./routes/campaigns');

// SECURITY: Only load test routes in development
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PRODUCTION = NODE_ENV === 'production';

// Server configuration
const PORT = process.env.SERVER_PORT || 3001;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

async function startServer() {
  try {
    console.log('\n=== ClawOps Console — Starting server ===');
    console.log(`Environment: ${NODE_ENV}`);
    console.log(`Production mode: ${IS_PRODUCTION}\n`);

    // Initialize database (creates tables on first run)
    await initDatabase();

    // Ensure campaign-specific tables exist for all active campaigns
    const { all } = require('./db/connection');
    const campaignTableManager = require('./services/campaignTableManager');

    console.log('[Startup] Checking campaign tables...');
    const campaigns = all('SELECT id, slug, name FROM campaigns WHERE status != ?', ['archived']);

    for (const campaign of campaigns) {
      if (!campaignTableManager.tablesExist(campaign.slug)) {
        console.log(`[Startup] Creating missing tables for campaign: ${campaign.name} (${campaign.slug})`);
        await campaignTableManager.createCampaignTables(campaign.slug);
      } else {
        console.log(`[Startup] ✓ Tables exist for campaign: ${campaign.name}`);
      }
    }

    console.log(`[Startup] Campaign tables verified for ${campaigns.length} campaign(s)\n`);

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
            frameSrc: ["'none'"],
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
      : [
          'http://localhost:5173', 'http://127.0.0.1:5173',
          'http://localhost:5174', 'http://localhost:5175',
          'http://localhost:5176', 'http://localhost:5177',
          'http://localhost:5178', 'http://localhost:5179'
        ];

    app.use(
      cors({
        origin: function (origin, callback) {
          // Allow requests with no origin (mobile apps, Postman, etc.)
          if (!origin) return callback(null, true);

          if (allowedOrigins.includes(origin)) {
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
    app.use('/api/campaigns', campaignRoutes);
    app.use('/api/agents', agentRoutes);
    app.use('/api/chat', chatRoutes);
    app.use('/api/runs', runRoutes);
    app.use('/api/results', resultRoutes);
    app.use('/api/settings', settingRoutes);
    app.use('/api/lead-gen', leadGenQueueRoutes);
    app.use('/api/scanner', scannerRoutes);
    app.use('/api/schedules', scheduleRoutes);
    app.use('/api/content-queue', contentQueueRoutes);
    app.use('/api/hoa-contacts', hoaContactsRoutes);
    app.use('/api/hoa-leads', hoaLeadsRoutes);
    app.use('/api/discovery', discoveryRoutes);
    app.use('/api/mgmt-research', mgmtResearchRoutes);
    app.use('/api/cfo-marketing', cfoMarketingRoutes);

    // SECURITY: Test routes only in development
    if (!IS_PRODUCTION) {
      console.log('[Security] ⚠️  Test routes enabled (development mode)');
      const testRoutes = require('./routes/test');
      app.use('/api/test', testRoutes);
    } else {
      console.log('[Security] ✅ Test routes disabled (production mode)');
    }

    // --- Health Check ---
    // No auth required, minimal information disclosure
    app.get('/api/health', (_req, res) => {
      res.json({
        status: 'ok',
        service: 'ClawOps Console BFF',
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime()),
        environment: NODE_ENV,
      });
    });

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

      // --- Start Platform Scanner (if credentials are configured) ---
      if (process.env.REDDIT_CLIENT_ID || process.env.FACEBOOK_SESSION) {
        const { startScheduler } = require('./services/scannerScheduler');
        console.log('🔍 Platform Scanner:');
        if (process.env.REDDIT_CLIENT_ID) {
          console.log('   - Reddit: ✅ (enabled)');
        }
        if (process.env.FACEBOOK_SESSION) {
          console.log('   - Facebook: ✅ (enabled)');
        }
        console.log('   - Scans run every 2 hours\n');
        startScheduler();
      } else {
        console.log('🔍 Platform Scanner: ⏸️  (waiting for credentials)');
        console.log('   - See REDDIT-SETUP.md to enable Reddit scanning\n');
      }

      // --- Start Schedule Runner (fires DB-stored cron schedules) ---
      const { startScheduleRunner } = require('./services/scheduleRunner');
      startScheduleRunner();
    });

    // --- Graceful Shutdown ---
    process.on('SIGTERM', () => {
      console.log('\n[Server] SIGTERM received, shutting down gracefully...');
      httpServer.close(() => {
        console.log('[Server] HTTP server closed');
        process.exit(0);
      });
    });

    process.on('SIGINT', () => {
      console.log('\n[Server] SIGINT received, shutting down gracefully...');
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
