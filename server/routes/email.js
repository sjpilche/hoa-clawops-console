/**
 * @file email.js (routes)
 * @description Email sending endpoint for agent output delivery.
 *
 * ENDPOINTS:
 *   POST /api/email/send — Send an email (HTML or plain text)
 */

const { Router } = require('express');
const nodemailer = require('nodemailer');
const { authenticate } = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');

const router = Router();

// All email routes require authentication
router.use(authenticate);

// SMTP configuration from environment variables
function getTransporter() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    throw new AppError(
      'Email not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASS in .env.local',
      'EMAIL_NOT_CONFIGURED', 503
    );
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

/**
 * POST /api/email/send
 * Send an email with HTML or plain text body.
 *
 * Body: { to, subject, body, html?, from? }
 */
router.post('/send', async (req, res, next) => {
  try {
    const { to, subject, body, html, from } = req.body;

    // Validate required fields
    if (!to) throw new AppError('Missing "to" field', 'VALIDATION_ERROR', 400);
    if (!subject) throw new AppError('Missing "subject" field', 'VALIDATION_ERROR', 400);
    if (!body && !html) throw new AppError('Missing "body" or "html" field', 'VALIDATION_ERROR', 400);

    const transporter = getTransporter();
    const fromAddress = from || process.env.SMTP_FROM || process.env.SMTP_USER;

    const info = await transporter.sendMail({
      from: fromAddress,
      to,
      subject,
      text: body || '',
      html: html || undefined,
    });

    console.log(`[Email] Sent to ${to}: "${subject}" (messageId: ${info.messageId})`);

    res.json({
      message: 'Email sent successfully',
      messageId: info.messageId,
      to,
      subject,
    });
  } catch (error) {
    if (error instanceof AppError) {
      next(error);
    } else {
      console.error('[Email] Send failed:', error.message);
      next(new AppError(
        `Failed to send email: ${error.message}`,
        'EMAIL_SEND_FAILED', 500
      ));
    }
  }
});

/**
 * GET /api/email/status
 * Check if email is configured and working.
 */
router.get('/status', async (req, res, next) => {
  try {
    const host = process.env.SMTP_HOST;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!host || !user || !pass) {
      return res.json({
        configured: false,
        message: 'SMTP not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS in .env.local',
      });
    }

    const transporter = getTransporter();
    await transporter.verify();

    res.json({
      configured: true,
      host,
      user,
      message: 'SMTP connection verified',
    });
  } catch (error) {
    res.json({
      configured: true,
      verified: false,
      message: `SMTP configured but connection failed: ${error.message}`,
    });
  }
});

module.exports = router;
