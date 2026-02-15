/**
 * @file rateLimiter.js
 * @description Request rate limiting to prevent abuse.
 *
 * Uses express-rate-limit to cap how many requests a client can make.
 * Separate limits for general API calls vs. agent run triggers.
 */

const rateLimit = require('express-rate-limit');

/**
 * General API rate limit: 100 requests per minute.
 * This is generous for normal use but prevents runaway scripts.
 */
const generalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute window
  max: 100,            // 100 requests per window
  message: {
    error: 'Too many requests',
    message: 'You\'ve exceeded the rate limit (100 requests/minute). Wait a moment and try again.',
    code: 'RATE_LIMIT_EXCEEDED',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Agent run rate limit: Based on MAX_RUNS_PER_HOUR setting.
 * This is deliberately stricter because each agent run consumes
 * real resources (browser instances, API tokens, target system load).
 */
const agentRunLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour window
  max: parseInt(process.env.MAX_RUNS_PER_HOUR || '20', 10),
  message: {
    error: 'Agent run limit exceeded',
    message: `You've reached the maximum number of agent runs per hour (${process.env.MAX_RUNS_PER_HOUR || 20}). ` +
             'This limit exists to prevent accidental runaway costs. ' +
             'Adjust MAX_RUNS_PER_HOUR in .env.local if needed.',
    code: 'AGENT_RUN_LIMIT',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = { generalLimiter, agentRunLimiter };
