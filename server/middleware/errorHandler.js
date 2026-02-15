/**
 * @file errorHandler.js
 * @description Centralized error handling middleware.
 *
 * HOW IT WORKS:
 * Any time a route handler throws an error or calls next(error),
 * Express skips all remaining middleware and calls this error handler.
 *
 * WHY CENTRALIZED?
 * Instead of try/catch in every route with different error formats,
 * we catch everything here and return consistent, helpful error responses.
 *
 * USAGE IN ROUTE HANDLERS:
 *   // Option 1: Throw an error (caught by express-async-errors or wrapper)
 *   throw new AppError('Agent not found', 'AGENT_NOT_FOUND', 404);
 *
 *   // Option 2: Pass to next()
 *   next(new AppError('Database error', 'DB_ERROR', 500));
 */

/**
 * Custom error class with error codes and status codes.
 * Use this instead of plain Error objects for better error reporting.
 */
class AppError extends Error {
  constructor(message, code = 'INTERNAL_ERROR', statusCode = 500, details = {}) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

/**
 * Express error-handling middleware.
 * MUST have 4 parameters (err, req, res, next) for Express to recognize it.
 */
function errorHandler(err, req, res, _next) {
  // Log the full error for debugging
  console.error(`[ErrorHandler] ${err.code || 'UNHANDLED'}:`, {
    message: err.message,
    path: req.originalUrl,
    method: req.method,
    stack: err.stack,
    timestamp: new Date().toISOString(),
  });

  // Determine the status code
  const statusCode = err.statusCode || 500;

  // Build the response
  const response = {
    error: err.message || 'An unexpected error occurred',
    code: err.code || 'INTERNAL_ERROR',
    // Only include stack traces in development (never in production!)
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
    ...(err.details && Object.keys(err.details).length > 0 && { details: err.details }),
  };

  res.status(statusCode).json(response);
}

module.exports = { errorHandler, AppError };
