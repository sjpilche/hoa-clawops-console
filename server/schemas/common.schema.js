/**
 * @file common.schema.js
 * @description Common Zod schemas reused across multiple endpoints.
 */

const { z } = require('zod');

/**
 * UUID v4 format validation
 */
const uuidSchema = z.string().uuid({
  message: 'Must be a valid UUID v4',
});

/**
 * Email format validation
 */
const emailSchema = z
  .string()
  .email({ message: 'Must be a valid email address' })
  .min(3, 'Email must be at least 3 characters')
  .max(254, 'Email must not exceed 254 characters'); // RFC 5321

/**
 * Password validation (8+ chars, at least one letter and one number)
 */
const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must not exceed 128 characters')
  .regex(/[a-zA-Z]/, 'Password must contain at least one letter')
  .regex(/[0-9]/, 'Password must contain at least one number');

/**
 * Agent status enum
 */
const agentStatusSchema = z.enum(['idle', 'running', 'paused', 'failed'], {
  errorMap: () => ({ message: 'Status must be: idle, running, paused, or failed' }),
});

/**
 * Agent permissions enum
 */
const agentPermissionsSchema = z.enum(['read-only', 'read-write', 'form-submit'], {
  errorMap: () => ({
    message: 'Permissions must be: read-only, read-write, or form-submit',
  }),
});

/**
 * Run status enum
 */
const runStatusSchema = z.enum(['pending', 'running', 'completed', 'failed', 'stopped'], {
  errorMap: () => ({
    message: 'Status must be: pending, running, completed, failed, or stopped',
  }),
});

/**
 * Message sender type enum
 */
const senderTypeSchema = z.enum(['user', 'agent', 'system'], {
  errorMap: () => ({ message: 'Sender type must be: user, agent, or system' }),
});

/**
 * Message type enum
 */
const messageTypeSchema = z.enum(['text', 'code', 'error', 'status'], {
  errorMap: () => ({ message: 'Message type must be: text, code, error, or status' }),
});

/**
 * Non-empty string (trimmed)
 */
const nonEmptyStringSchema = z
  .string()
  .trim()
  .min(1, 'Cannot be empty');

/**
 * Optional non-empty string
 */
const optionalNonEmptyStringSchema = z
  .string()
  .trim()
  .min(1)
  .optional();

/**
 * JSON object schema (for config, metadata, etc.)
 */
const jsonObjectSchema = z.record(z.any()).optional().default({});

/**
 * Array of domain strings (URLs or wildcards)
 */
const domainsSchema = z
  .array(
    z
      .string()
      .trim()
      .min(1, 'Domain cannot be empty')
      .regex(/^[a-zA-Z0-9\-\.\*]+$/, 'Invalid domain format')
  )
  .optional()
  .default([]);

/**
 * Pagination parameters
 */
const paginationSchema = z.object({
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
});

/**
 * ISO 8601 date string
 */
const isoDateSchema = z
  .string()
  .datetime({ message: 'Must be a valid ISO 8601 date string' });

module.exports = {
  uuidSchema,
  emailSchema,
  passwordSchema,
  agentStatusSchema,
  agentPermissionsSchema,
  runStatusSchema,
  senderTypeSchema,
  messageTypeSchema,
  nonEmptyStringSchema,
  optionalNonEmptyStringSchema,
  jsonObjectSchema,
  domainsSchema,
  paginationSchema,
  isoDateSchema,
};
