/**
 * @file run.schema.js
 * @description Zod validation schemas for agent run history endpoints.
 */

const { z } = require('zod');
const {
  uuidSchema,
  runStatusSchema,
  paginationSchema,
  isoDateSchema,
} = require('./common.schema');

/**
 * GET /api/runs (query parameters)
 * List runs with optional filtering and pagination
 */
const listRunsQuerySchema = z.object({
  agent_id: uuidSchema.optional(),

  status: runStatusSchema.optional(),

  limit: z.coerce
    .number()
    .int()
    .min(1, 'Limit must be at least 1')
    .max(1000, 'Limit cannot exceed 1000')
    .optional()
    .default(100),

  offset: z.coerce
    .number()
    .int()
    .min(0, 'Offset cannot be negative')
    .optional()
    .default(0),

  start_date: z.string()
    .datetime({ message: 'Start date must be a valid ISO 8601 date' })
    .optional(),

  end_date: z.string()
    .datetime({ message: 'End date must be a valid ISO 8601 date' })
    .optional(),
});

/**
 * GET /api/runs/:id
 * Get single run - route parameter validation
 */
const runIdParamSchema = z.object({
  id: uuidSchema,
});

/**
 * PUT /api/runs/:id
 * Update run status - request body validation
 */
const updateRunSchema = z.object({
  status: runStatusSchema.optional(),

  error: z.string()
    .max(1000, 'Error message must not exceed 1000 characters')
    .optional(),

  result: z.string()
    .max(50000, 'Result must not exceed 50,000 characters')
    .optional(),

  cost: z.number()
    .min(0, 'Cost cannot be negative')
    .max(1000, 'Cost cannot exceed $1000')
    .optional(),

  tokens_used: z.number()
    .int()
    .min(0, 'Tokens used cannot be negative')
    .max(1000000, 'Tokens used cannot exceed 1,000,000')
    .optional(),

  duration_ms: z.number()
    .int()
    .min(0, 'Duration cannot be negative')
    .max(36000000, 'Duration cannot exceed 10 hours')
    .optional(),
});

/**
 * POST /api/runs/:id/stop
 * Stop a running agent - no body required
 */
const stopRunSchema = z.object({}).strict(); // Empty object, no fields allowed

module.exports = {
  listRunsQuerySchema,
  runIdParamSchema,
  updateRunSchema,
  stopRunSchema,
};
