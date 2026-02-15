/**
 * @file auth.js (routes)
 * @description Authentication endpoints: login, verify token, create user.
 *
 * ENDPOINTS:
 *   POST /api/auth/login     — Log in with email + password, get JWT token
 *   GET  /api/auth/me        — Verify current token, get user info
 *   POST /api/auth/register  — Create a new user (admin only, for future use)
 */

const { Router } = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { get, run } = require('../db/connection');
const { authenticate, generateToken, clearRateLimit } = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');
const { validateBody } = require('../middleware/validator');
const { loginSchema, registerSchema } = require('../schemas');

const router = Router();

/**
 * POST /api/auth/login
 * Authenticate with email and password. Returns a JWT token.
 *
 * Request body: { email: "admin@clawops.local", password: "changeme123" }
 * Response: { token: "eyJhbG...", user: { id, email, name, role } }
 */
router.post('/login', validateBody(loginSchema), (req, res, next) => {
  try {
    // Get validated data from req.validated.body
    const { email, password } = req.validated.body;

    // Look up user by email
    const user = get('SELECT * FROM users WHERE email = ?', [email]);
    if (!user) {
      // Security: Don't reveal whether the email exists
      throw new AppError(
        'Invalid email or password.',
        'AUTH_INVALID_CREDENTIALS',
        401
      );
    }

    // Compare password against stored hash
    const passwordMatch = bcrypt.compareSync(password, user.password);
    if (!passwordMatch) {
      throw new AppError(
        'Invalid email or password.',
        'AUTH_INVALID_CREDENTIALS',
        401
      );
    }

    // Generate JWT token
    const token = generateToken(user);

    // Return token and user info (NEVER return the password hash!)
    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/auth/me
 * Verify the current JWT token and return user info.
 * Used by the frontend to check if the user is still logged in on page load.
 */
router.get('/me', authenticate, (req, res, next) => {
  try {
    console.log('[Auth] /me request - user ID:', req.user?.id);
    const user = get('SELECT id, email, name, role FROM users WHERE id = ?', [req.user.id]);
    if (!user) {
      console.log('[Auth] /me failed - user not found in database');
      throw new AppError(
        'User not found. Your account may have been deleted.',
        'AUTH_USER_NOT_FOUND',
        404
      );
    }
    console.log('[Auth] /me success - returning user:', user.email);
    res.json({ user });
  } catch (error) {
    console.error('[Auth] /me error:', error.message);
    next(error);
  }
});

/**
 * POST /api/auth/register
 * Create a new user. For v1, this is admin-only and mostly used by the seed script.
 *
 * Request body: { email, password, name }
 */
router.post('/register', validateBody(registerSchema), (req, res, next) => {
  try {
    // Get validated data from req.validated.body
    const { email, password, name } = req.validated.body;

    // Check if user already exists
    const existing = get('SELECT id FROM users WHERE email = ?', [email]);
    if (existing) {
      throw new AppError(
        `A user with email "${email}" already exists.`,
        'AUTH_USER_EXISTS',
        409
      );
    }

    // Hash the password (bcrypt cost factor 12 — secure but not too slow)
    const hashedPassword = bcrypt.hashSync(password, 12);

    const userId = uuidv4();
    run(
      'INSERT INTO users (id, email, password, name, role) VALUES (?, ?, ?, ?, ?)',
      [userId, email, hashedPassword, name || 'Admin', 'admin']
    );

    const token = generateToken({ id: userId, email, role: 'admin' });

    res.status(201).json({
      token,
      user: { id: userId, email, name: name || 'Admin', role: 'admin' },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/auth/clear-rate-limit
 * Clear rate limiting for a specific IP or all IPs (admin only)
 *
 * Request body: { ip?: string } (optional - if not provided, clears all)
 */
router.post('/clear-rate-limit', authenticate, (req, res, next) => {
  try {
    // Only admins can clear rate limits
    if (req.user.role !== 'admin') {
      throw new AppError(
        'Access denied. Only administrators can clear rate limits.',
        'AUTH_FORBIDDEN',
        403
      );
    }

    const { ip } = req.body;
    const result = clearRateLimit(ip || null);

    res.json({
      success: true,
      message: result.message,
      cleared: result.cleared,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
