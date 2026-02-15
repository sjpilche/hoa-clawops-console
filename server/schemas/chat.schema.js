/**
 * @file chat.schema.js
 * @description Zod validation schemas for chat and messaging endpoints.
 */

const { z } = require('zod');
const {
  uuidSchema,
  senderTypeSchema,
  messageTypeSchema,
  nonEmptyStringSchema,
  optionalNonEmptyStringSchema,
  jsonObjectSchema,
} = require('./common.schema');

/**
 * POST /api/chat/threads
 * Create new chat thread - request body validation
 */
const createThreadSchema = z.object({
  title: z.string()
    .trim()
    .max(200, 'Thread title must not exceed 200 characters')
    .optional()
    .default('New Conversation'),
});

/**
 * DELETE /api/chat/threads/:id
 * Delete thread - route parameter validation
 */
const threadIdParamSchema = z.object({
  id: uuidSchema,
});

/**
 * POST /api/chat/threads/:id/messages
 * Add message to thread - request body validation
 */
const createMessageSchema = z.object({
  content: nonEmptyStringSchema
    .min(1, 'Message content is required')
    .max(10000, 'Message content must not exceed 10,000 characters'),

  sender_type: senderTypeSchema.optional().default('user'),

  msg_type: messageTypeSchema.optional().default('text'),

  metadata: jsonObjectSchema,
});

/**
 * PUT /api/chat/messages/:id
 * Update message - request body validation
 */
const updateMessageSchema = z.object({
  content: z.string()
    .trim()
    .min(1)
    .max(10000, 'Message content must not exceed 10,000 characters')
    .optional(),

  metadata: jsonObjectSchema,
});

/**
 * GET /api/chat/threads/:id/messages (query parameters)
 * List messages with optional pagination
 */
const listMessagesQuerySchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1, 'Limit must be at least 1')
    .max(500, 'Limit cannot exceed 500')
    .optional()
    .default(100),

  offset: z.coerce
    .number()
    .int()
    .min(0, 'Offset cannot be negative')
    .optional()
    .default(0),

  sender_type: senderTypeSchema.optional(),
});

module.exports = {
  createThreadSchema,
  threadIdParamSchema,
  createMessageSchema,
  updateMessageSchema,
  listMessagesQuerySchema,
};
