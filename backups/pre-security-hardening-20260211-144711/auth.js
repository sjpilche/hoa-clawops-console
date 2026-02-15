/**
 * @file auth.js
 * @description JWT authentication middleware.
 *
 * HOW IT WORKS:
 * 1. Client sends requests with header: Authorization: Bearer <token>
 * 2. This middleware extracts the token, verifies it, and attaches user info to req.user
 * 3. If the token is missing/invalid/expired, the request is rejected with 401
 *
 * USAGE:
 *   const { authenticate } = require('./middleware/auth');
 *   router.get('/agents', authenticate, (req, res) => {
 *     // req.user is now available with { id, email, role }
 *   });
 */

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-secret-change-in-production-abc123def456';

/**
 * Middleware: Verify JWT token and attach user to request.
 * If authentication fails, sends a 401 response with a helpful error message.
 */
function authenticate(req, res, next) {
  // Step 1: Extract the token from the Authorization header
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({
      error: 'Authentication required',
      message: 'No Authorization header found. Include: Authorization: Bearer <your-token>',
      code: 'AUTH_MISSING_TOKEN',
    });
  }

  // The header should look like: "Bearer eyJhbGci..."
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({
      error: 'Malformed Authorization header',
      message: 'Expected format: "Bearer <token>". Check that you\'re sending the token correctly.',
      code: 'AUTH_MALFORMED_HEADER',
    });
  }

  const token = parts[1];

  // Step 2: Verify the token
  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    // Step 3: Attach user info to the request object
    // Now any downstream handler can access req.user.id, req.user.email, etc.
    req.user = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role,
    };

    next(); // Token is valid — continue to the route handler
  } catch (error) {
    // Token verification failed — figure out why and tell the user
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Token expired',
        message: 'Your session has expired. Please log in again.',
        code: 'AUTH_TOKEN_EXPIRED',
      });
    }

    return res.status(401).json({
      error: 'Invalid token',
      message: 'The authentication token is invalid. Try logging out and back in.',
      code: 'AUTH_INVALID_TOKEN',
    });
  }
}

/**
 * Generate a JWT token for a user.
 * Called after successful login.
 *
 * @param {Object} user - { id, email, role }
 * @returns {string} - JWT token string
 */
function generateToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRY || '24h' }
  );
}

module.exports = { authenticate, generateToken, JWT_SECRET };
