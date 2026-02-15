/**
 * @file settings.schema.js
 * @description Zod validation schemas for system settings endpoints.
 */

const { z } = require('zod');

/**
 * PUT /api/settings
 * Update system settings - request body validation
 */
const updateSettingsSchema = z.object({
  max_concurrent_agents: z.number()
    .int()
    .min(1, 'Max concurrent agents must be at least 1')
    .max(10, 'Max concurrent agents cannot exceed 10')
    .optional(),

  max_cost_per_run: z.number()
    .min(0.01, 'Max cost per run must be at least $0.01')
    .max(100, 'Max cost per run cannot exceed $100')
    .optional(),

  max_duration_per_run: z.number()
    .int()
    .min(30, 'Max duration must be at least 30 seconds')
    .max(3600, 'Max duration cannot exceed 3600 seconds (1 hour)')
    .optional(),

  max_tokens_per_run: z.number()
    .int()
    .min(100, 'Max tokens must be at least 100')
    .max(1000000, 'Max tokens cannot exceed 1,000,000')
    .optional(),

  max_runs_per_hour: z.number()
    .int()
    .min(1, 'Max runs per hour must be at least 1')
    .max(1000, 'Max runs per hour cannot exceed 1000')
    .optional(),

  openclaw_mode: z.enum(['shell', 'gateway'], {
    errorMap: () => ({ message: 'OpenClaw mode must be: shell or gateway' }),
  }).optional(),

  openclaw_path: z.string()
    .trim()
    .min(1, 'OpenClaw path cannot be empty')
    .max(500, 'OpenClaw path must not exceed 500 characters')
    .optional(),

  log_level: z.enum(['error', 'warn', 'info', 'debug'], {
    errorMap: () => ({ message: 'Log level must be: error, warn, info, or debug' }),
  }).optional(),

  enable_audit_logging: z.boolean().optional(),

  enable_cost_warnings: z.boolean().optional(),

  cost_warning_threshold: z.number()
    .min(0, 'Cost warning threshold cannot be negative')
    .max(100, 'Cost warning threshold cannot exceed $100')
    .optional(),
});

/**
 * GET /api/settings/:key
 * Get specific setting - route parameter validation
 */
const settingKeyParamSchema = z.object({
  key: z.string()
    .trim()
    .min(1, 'Setting key cannot be empty')
    .max(100, 'Setting key must not exceed 100 characters')
    .regex(/^[a-z0-9_]+$/, 'Setting key must contain only lowercase letters, numbers, and underscores'),
});

/**
 * POST /api/settings/:key
 * Update specific setting - request body validation
 */
const updateSettingSchema = z.object({
  value: z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
  ], {
    errorMap: () => ({ message: 'Value must be a string, number, boolean, or null' }),
  }),
});

module.exports = {
  updateSettingsSchema,
  settingKeyParamSchema,
  updateSettingSchema,
};
