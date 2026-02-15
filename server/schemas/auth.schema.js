/**
 * @file auth.schema.js
 * @description Zod validation schemas for authentication endpoints.
 */

const { z } = require('zod');
const { emailSchema, passwordSchema, optionalNonEmptyStringSchema } = require('./common.schema');

/**
 * POST /api/auth/login
 * Request body validation
 */
const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'), // Don't validate password complexity on login
});

/**
 * POST /api/auth/register
 * Request body validation
 */
const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema, // Enforce strong password on registration
  name: optionalNonEmptyStringSchema,
  role: z.enum(['admin', 'operator', 'viewer']).optional().default('viewer'),
});

/**
 * POST /api/auth/refresh
 * Request body validation (for token refresh endpoint)
 */
const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

module.exports = {
  loginSchema,
  registerSchema,
  refreshTokenSchema,
};
