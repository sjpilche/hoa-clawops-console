/**
 * @file hoaWebhook.js (routes)
 * @description API routes for publishing content to the HOA Project Intake website.
 *
 * These endpoints act as a proxy — the OpenClaw agent (or dashboard user) calls
 * these routes, and the server signs and forwards the request to the HOA website's
 * HMAC-protected webhook endpoints.
 *
 * ENDPOINTS:
 *   POST  /api/hoa-webhook/publish   — Push articles to HOA website
 *   POST  /api/hoa-webhook/insights  — Push SEO insights to HOA website
 *   GET   /api/hoa-webhook/status    — Check what's already published
 *   GET   /api/hoa-webhook/health    — Verify webhook connectivity
 */

const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');
const hoaWebhook = require('../tools/hoaWebhookClient');

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * POST /api/hoa-webhook/publish
 * Push articles to the HOA website via signed webhook.
 *
 * Body: { articles: [{ external_id, type, title, ... }] }
 */
router.post('/publish', async (req, res, next) => {
  try {
    const { articles } = req.body;

    if (!articles || !Array.isArray(articles) || articles.length === 0) {
      throw new AppError('Request body must include a non-empty "articles" array', 'INVALID_PAYLOAD', 400);
    }

    // Validate required fields on each article
    for (let i = 0; i < articles.length; i++) {
      const a = articles[i];
      if (!a.external_id) throw new AppError(`articles[${i}] missing required field "external_id"`, 'MISSING_FIELD', 400);
      if (!a.type) throw new AppError(`articles[${i}] missing required field "type"`, 'MISSING_FIELD', 400);
      if (!a.title) throw new AppError(`articles[${i}] missing required field "title"`, 'MISSING_FIELD', 400);
    }

    const result = await hoaWebhook.pushArticles(articles);

    res.json({
      success: true,
      message: `Published ${result.upserted} article(s) to HOA website`,
      result,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/hoa-webhook/insights
 * Push SEO insights to the HOA website via signed webhook.
 *
 * Body: { insights: [{ insight_key, title, ... }] }
 */
router.post('/insights', async (req, res, next) => {
  try {
    const { insights } = req.body;

    if (!insights || !Array.isArray(insights) || insights.length === 0) {
      throw new AppError('Request body must include a non-empty "insights" array', 'INVALID_PAYLOAD', 400);
    }

    for (let i = 0; i < insights.length; i++) {
      const ins = insights[i];
      if (!ins.insight_key) throw new AppError(`insights[${i}] missing required field "insight_key"`, 'MISSING_FIELD', 400);
      if (!ins.title) throw new AppError(`insights[${i}] missing required field "title"`, 'MISSING_FIELD', 400);
    }

    const result = await hoaWebhook.pushInsights(insights);

    res.json({
      success: true,
      message: `Published ${result.upserted} insight(s) to HOA website`,
      result,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/hoa-webhook/status
 * Check what's currently published on the HOA website.
 *
 * Query params: type, category, limit, offset
 */
router.get('/status', async (req, res, next) => {
  try {
    const { type, category, limit, offset } = req.query;
    const articles = await hoaWebhook.getArticles({
      ...(type && { type }),
      ...(category && { category }),
      ...(limit && { limit }),
      ...(offset && { offset }),
    });

    res.json({
      success: true,
      articles,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/hoa-webhook/health
 * Verify webhook connectivity and configuration.
 */
router.get('/health', async (req, res, next) => {
  try {
    const health = await hoaWebhook.checkHealth();

    res.json({
      success: true,
      health,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
