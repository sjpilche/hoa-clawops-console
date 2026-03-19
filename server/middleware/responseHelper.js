/**
 * Standardized API response helpers.
 * Use these instead of raw res.json() to ensure consistent format.
 *
 * Success: { success: true, data: {...} }
 * Error:   { success: false, error: 'message', code: 'ERROR_CODE' }
 */

function sendSuccess(res, data, status = 200) {
  return res.status(status).json({ success: true, ...data });
}

function sendError(res, status, message, code = 'UNKNOWN_ERROR') {
  return res.status(status).json({ success: false, error: message, code });
}

function sendValidationError(res, errors) {
  return res.status(400).json({
    success: false,
    error: 'Validation failed',
    code: 'VALIDATION_ERROR',
    details: errors,
  });
}

module.exports = { sendSuccess, sendError, sendValidationError };
