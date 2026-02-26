/**
 * @file email.js (routes)
 * @description Email sending endpoint — uses SendGrid as primary sender.
 *
 * ENDPOINTS:
 *   POST /api/email/send   — Send an email (HTML or plain text)
 *   GET  /api/email/status — Check email configuration
 */

const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');
const sg = require('../services/sendgrid');

const router = Router();
router.use(authenticate);

/**
 * POST /api/email/send
 * Body: { to, subject, body, html?, from?, fromName? }
 */
router.post('/send', async (req, res, next) => {
  try {
    const { to, subject, body, html, from, fromName } = req.body;

    if (!to) throw new AppError('Missing "to" field', 'VALIDATION_ERROR', 400);
    if (!subject) throw new AppError('Missing "subject" field', 'VALIDATION_ERROR', 400);
    if (!body && !html) throw new AppError('Missing "body" or "html" field', 'VALIDATION_ERROR', 400);

    const result = await sg.send({ to, subject, html: html || body, text: body, from, fromName });

    if (!result.success) {
      throw new AppError(`Failed to send email: ${result.error || result.reason}`, 'EMAIL_SEND_FAILED', 500);
    }

    res.json({ message: 'Email sent successfully', messageId: result.messageId, to, subject });
  } catch (error) {
    if (error instanceof AppError) return next(error);
    next(new AppError(`Failed to send email: ${error.message}`, 'EMAIL_SEND_FAILED', 500));
  }
});

/**
 * GET /api/email/status
 */
router.get('/status', (req, res) => {
  const status = sg.status();
  res.json({
    configured: status.configured,
    provider: 'SendGrid',
    from: status.from,
    fromName: status.fromName,
    message: status.configured ? 'SendGrid ready' : 'SENDGRID_API_KEY not set in .env.local',
  });
});

module.exports = router;
