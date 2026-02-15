/**
 * @file agent.schema.js
 * @description Zod validation schemas for agent management endpoints.
 */

const { z } = require('zod');
const {
  uuidSchema,
  agentStatusSchema,
  agentPermissionsSchema,
  nonEmptyStringSchema,
  optionalNonEmptyStringSchema,
  jsonObjectSchema,
  domainsSchema,
} = require('./common.schema');

/**
 * POST /api/agents
 * Create new agent - request body validation
 */
const createAgentSchema = z.object({
  name: nonEmptyStringSchema
    .min(1, 'Agent name is required')
    .max(100, 'Agent name must not exceed 100 characters'),

  description: z.string()
    .trim()
    .max(500, 'Description must not exceed 500 characters')
    .optional(),

  target_system: z.string()
    .trim()
    .max(200, 'Target system must not exceed 200 characters')
    .optional(),

  config: z.object({
    soul_enabled: z.boolean().optional(),
    soul_evil_enabled: z.boolean().optional(),
    task: z.object({
      message: z.string().max(10000).optional(),
      schedule: z.object({
        enabled: z.boolean().optional(),
        type: z.enum(['daily', 'hourly', 'cron']).optional(),
        cron: z.string().max(100).nullable().optional(),
        timezone: z.string().max(100).optional(),
        time: z.string().max(10).optional(),
      }).optional(),
    }).optional(),
    advanced: z.object({
      enableSoulEvil: z.boolean().optional(),
      customHooks: z.string().optional(),
      envVars: z.array(z.object({
        key: z.string(),
        value: z.string(),
      })).nullish().default([]),
      maxDurationSeconds: z.number().min(10).max(3600).optional(),
      maxCostUSD: z.number().min(0.01).max(1000).optional(),
      maxTokens: z.number().min(1000).max(10000000).optional(),
      webhookUrl: z.string().url().optional().or(z.literal('')),
      webhookEvents: z.array(z.string()).nullish().default([]),
      notifyOnStart: z.boolean().optional(),
      notifyOnComplete: z.boolean().optional(),
      notifyOnError: z.boolean().optional(),
      requireConfirmation: z.boolean().optional(),
      allowedActions: z.array(z.string()).nullish().default([]),
    }).optional(),
  }).optional().default({}),

  domains: domainsSchema,

  permissions: agentPermissionsSchema.optional().default('read-only'),

  status: agentStatusSchema.optional().default('idle'),

  instructions: z.string()
    .trim()
    .max(5000, 'Instructions must not exceed 5000 characters')
    .optional(),
});

/**
 * PUT /api/agents/:id
 * Update agent - request body validation (all fields optional)
 */
const updateAgentSchema = z.object({
  name: z.string()
    .trim()
    .min(1)
    .max(100, 'Agent name must not exceed 100 characters')
    .optional(),

  description: z.string()
    .trim()
    .max(500, 'Description must not exceed 500 characters')
    .optional(),

  target_system: z.string()
    .trim()
    .max(200, 'Target system must not exceed 200 characters')
    .optional(),

  config: z.object({
    soul_enabled: z.boolean().optional(),
    soul_evil_enabled: z.boolean().optional(),
    task: z.object({
      message: z.string().max(10000).optional(),
      schedule: z.object({
        enabled: z.boolean().optional(),
        type: z.enum(['daily', 'hourly', 'cron']).optional(),
        cron: z.string().max(100).nullable().optional(),
        timezone: z.string().max(100).optional(),
        time: z.string().max(10).optional(),
      }).optional(),
    }).optional(),
    advanced: z.object({
      enableSoulEvil: z.boolean().optional(),
      customHooks: z.string().optional(),
      envVars: z.array(z.object({
        key: z.string(),
        value: z.string(),
      })).nullish().default([]),
      maxDurationSeconds: z.number().min(10).max(3600).optional(),
      maxCostUSD: z.number().min(0.01).max(1000).optional(),
      maxTokens: z.number().min(1000).max(10000000).optional(),
      webhookUrl: z.string().url().optional().or(z.literal('')),
      webhookEvents: z.array(z.string()).nullish().default([]),
      notifyOnStart: z.boolean().optional(),
      notifyOnComplete: z.boolean().optional(),
      notifyOnError: z.boolean().optional(),
      requireConfirmation: z.boolean().optional(),
      allowedActions: z.array(z.string()).nullish().default([]),
    }).optional(),
  }).optional().default({}),

  domains: domainsSchema,

  permissions: agentPermissionsSchema.optional(),

  status: agentStatusSchema.optional(),

  instructions: z.string()
    .trim()
    .max(5000, 'Instructions must not exceed 5000 characters')
    .optional(),
});

/**
 * POST /api/agents/:id/run
 * Trigger agent run - request body validation
 */
const runAgentSchema = z.object({
  message: nonEmptyStringSchema
    .min(1, 'Message is required to run an agent')
    .max(10000, 'Message must not exceed 10,000 characters'),

  sessionId: z.string()
    .trim()
    .regex(/^[a-zA-Z0-9_-]+$/, 'Session ID must contain only alphanumeric characters, dashes, and underscores')
    .max(128, 'Session ID must not exceed 128 characters')
    .optional(),

  json: z.boolean().optional().default(true),

  params: jsonObjectSchema,
});

/**
 * GET /api/agents (query parameters)
 * List agents with optional filtering
 */
const listAgentsQuerySchema = z.object({
  status: agentStatusSchema.optional(),

  permissions: agentPermissionsSchema.optional(),

  search: z.string()
    .trim()
    .max(100, 'Search query must not exceed 100 characters')
    .optional(),
});

/**
 * Route parameter validation (agent ID)
 */
const agentIdParamSchema = z.object({
  id: uuidSchema,
});

module.exports = {
  createAgentSchema,
  updateAgentSchema,
  runAgentSchema,
  listAgentsQuerySchema,
  agentIdParamSchema,
};
