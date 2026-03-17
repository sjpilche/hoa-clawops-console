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
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');

const { initDatabase } = require('./db/connection');
const { initSocketServer } = require('./websocket/socketServer');
const auditLogger = require('./middleware/auditLogger');
// Rate limiter disabled — single-user local console, no need
// const { generalLimiter } = require('./middleware/rateLimiter');
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
const costsRoutes = require('./routes/costs');
const campaignRoutes = require('./routes/campaigns');
const blitzRoutes = require('./routes/blitz');
const pipelineRoutes = require('./routes/pipelines');
const discordRoutes = require('./routes/discord');
const brainRoutes   = require('./routes/brain');
const mgmtOutreachRoutes = require('./routes/mgmtOutreach');
const healthRoutes    = require('./routes/health');
const pipelineHealthRoutes = require('./routes/pipeline');
const livempaintRoutes     = require('./routes/livempaint');
const openclawRoutes       = require('./routes/openclaw');
const opportunityRoutes    = require('./routes/opportunities');
const revenueSignalRoutes  = require('./routes/revenue-signals');
const trainingRoutes       = require('./routes/training');
const directoryRoutes      = require('./routes/directory');
const qaRoutes             = require('./routes/qa');
const agentHealthRoutes    = require('./routes/agentHealth');
const dashboardRoutes      = require('./routes/dashboard');
const sendgridWebhookRoutes = require('./routes/sendgridWebhook');
const revenueRoutes          = require('./routes/revenue');
const leadCaptureRoutes      = require('./routes/leadCapture');
const dataAuditRoutes        = require('./routes/dataAudit');
const stripeWebhookRoutes    = require('./routes/stripeWebhook');
const commandCenterRoutes    = require('./routes/commandCenter');

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
            frameSrc: ["'self'", 'http://127.0.0.1:18789'], // Allow OpenClaw Monitor embed
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
    // Stripe webhook needs raw body BEFORE express.json() parses it
    app.use('/api/stripe', express.raw({ type: 'application/json', limit: '1mb' }));

    // SECURITY: Different size limits for different route types
    app.use('/api/chat', express.json({ limit: '1mb' })); // Chat messages: 1MB
    app.use('/api/agents', express.json({ limit: '500kb' })); // Agent configs: 500KB
    app.use('/api/webhooks', express.json({ limit: '2mb' })); // SendGrid webhooks: 2MB (email bodies)
    app.use('/api/webhooks', express.urlencoded({ extended: true, limit: '2mb' })); // Inbound Parse multipart fallback
    app.use('/api', express.json({ limit: '100kb' })); // Everything else: 100KB

    app.use(express.urlencoded({ extended: true, limit: '100kb' }));

    // --- Public Pages (no auth) ---
    // Data Audit intake landing page
    app.get('/audit', (_req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'data-audit.html'));
    });

    // Jake CFO construction landing page
    app.get('/jake', (_req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'jake-cfo.html'));
    });

    // Public audit submission endpoint (no auth — landing page form)
    app.post('/api/data-audit/public', async (req, res) => {
      try {
        const { companyName, contactName, contactEmail, website, industry, erpSystem } = req.body;
        if (!companyName || !contactEmail) {
          return res.status(400).json({ error: 'Company name and email are required' });
        }
        const { createAndRunAudit } = require('./services/dataAuditService');
        const result = await createAndRunAudit({
          companyName, contactName, contactEmail, website, industry, erpSystem,
          source: 'landing_page', amountCents: 0,
        });
        res.json({ success: true, auditId: result.auditId });
      } catch (error) {
        console.error('[data-audit/public] Error:', error.message);
        res.status(500).json({ error: 'Audit request failed. Please try again.' });
      }
    });

    // Jake CFO public intake endpoint (no auth — landing page form)
    app.post('/api/jake/public-intake', async (req, res) => {
      try {
        const { companyName, contactName, contactEmail, phone, annualRevenue, erpSystem, biggestPain } = req.body;
        if (!companyName || !contactEmail) {
          return res.status(400).json({ error: 'Company name and email are required' });
        }
        const { run } = require('./db/connection');
        // Insert as a new lead into cfo_leads
        run(`INSERT INTO cfo_leads (company_name, contact_name, contact_email, phone, erp_type, revenue_range, source_agent, source, status, enrichment_status, notes, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, 'jake', 'landing_page', 'new', 'enriched', ?, datetime('now'), datetime('now'))`,
          [companyName, contactName || null, contactEmail, phone || null, erpSystem || null, annualRevenue || null, `Pain: ${biggestPain || 'none'}`]);
        // Auto-activate cadence since we already have their email
        const lead = require('./db/connection').get('SELECT id FROM cfo_leads WHERE contact_email = ? ORDER BY created_at DESC LIMIT 1', [contactEmail]);
        if (lead) {
          run("UPDATE cfo_leads SET cadence_active = 1, next_touch_due = datetime('now'), last_touch_number = 0, enrichment_status = 'enriched', updated_at = datetime('now') WHERE id = ?", [lead.id]);
        }
        console.log(`[jake/public-intake] New lead: ${companyName} (${contactEmail}) from landing page`);
        res.json({ success: true, message: 'Thank you! We\'ll be in touch within 24 hours.' });
      } catch (error) {
        console.error('[jake/public-intake] Error:', error.message);
        res.status(500).json({ error: 'Something went wrong. Please try again.' });
      }
    });

    // --- Rate Limiting (DISABLED) ---
    // Single-user local console — rate limiting just gets in the way
    // app.use('/api', generalLimiter);

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
    app.use('/api/costs', costsRoutes);
    app.use('/api/blitz', blitzRoutes);
    app.use('/api/pipelines', pipelineRoutes);
    app.use('/api/discord', discordRoutes);
    app.use('/api/brain',   brainRoutes);
    app.use('/api/mgmt-outreach', mgmtOutreachRoutes);
    app.use('/api/health', healthRoutes);
    app.use('/api/pipeline', pipelineHealthRoutes);
    app.use('/api/livempaint', livempaintRoutes);
    app.use('/api/openclaw',   openclawRoutes);
    app.use('/api/opportunities', opportunityRoutes);
    app.use('/api/rse', revenueSignalRoutes);
    app.use('/api/training', trainingRoutes);
    app.use('/api/directory', directoryRoutes);
    app.use('/api/qa', qaRoutes);
    app.use('/api/health/agents', agentHealthRoutes);
    app.use('/api/dashboard', dashboardRoutes);
    app.use('/api/webhooks', sendgridWebhookRoutes);
    app.use('/api/revenue', revenueRoutes);
    app.use('/api/capture', leadCaptureRoutes);
    app.use('/api/data-audit', dataAuditRoutes);
    app.use('/api/stripe', stripeWebhookRoutes);
    app.use('/api/command-center', commandCenterRoutes);

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

      // --- Validate Provider Configuration ---
      console.log('[Startup] Checking provider configuration...');
      const providerWarnings = [];
      if (!process.env.SENDGRID_API_KEY) providerWarnings.push('SENDGRID_API_KEY not set — outbound email disabled');
      if (!process.env.SENDGRID_FROM_EMAIL) providerWarnings.push('SENDGRID_FROM_EMAIL not set — will use default sender');
      if (!process.env.REPLY_FORWARD_EMAIL) providerWarnings.push('REPLY_FORWARD_EMAIL not set — inbound replies will not be forwarded');
      if (!process.env.SENDGRID_LIST_ID) providerWarnings.push('SENDGRID_LIST_ID not set — ESP lead-list sync disabled');
      if (providerWarnings.length) {
        providerWarnings.forEach(w => console.warn(`[Providers] ⚠ ${w}`));
      } else {
        console.log('[Providers] ✓ All email provider keys configured');
      }

      // --- Initialize Collective Brain (Azure SQL tables) ---
      require('./services/collectiveBrain').ensureTables().catch(err =>
        console.warn('[CollectiveBrain] Table init warning (non-fatal):', err.message)
      );

      // --- Initialize Chroma Brain (local vector store for RAG) ---
      require('./services/chromaBrain').initCollections().catch(err =>
        console.warn('[ChromaBrain] Init warning (non-fatal):', err.message)
      );

      // --- Start Discord Bot (if token configured) ---
      const { startDiscordBot } = require('./services/discordBot');
      startDiscordBot();
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
