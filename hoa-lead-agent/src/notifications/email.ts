/**
 * @file email.ts
 * @description Email notification module using nodemailer + Gmail SMTP.
 * Sends summary reports after each lead generation run.
 */

import nodemailer from 'nodemailer';
import { logger } from '../utils/logger';

interface EmailStats {
  stats: {
    totalFound: number;
    newLeads: number;
    updatedLeads: number;
    enriched: number;
    errors: number;
  };
  dbStats: {
    total: number;
    highValue: number;
    byState: Record<string, number>;
  };
  duration: string;
  exportPath: string;
}

// ─── Gmail SMTP Configuration ───────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD, // App password, NOT account password
  },
});

// ─── Build HTML Email ───────────────────────────────────────────────────────
function buildEmailHTML(data: EmailStats): string {
  const { stats, dbStats, duration, exportPath } = data;

  const stateRows = Object.entries(dbStats.byState)
    .sort((a, b) => b[1] - a[1])
    .map(([state, count]) => `<tr><td>${state}</td><td>${count}</td></tr>`)
    .join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
    .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px 20px; text-align: center; }
    .header h1 { margin: 0; font-size: 24px; font-weight: 600; }
    .header p { margin: 8px 0 0; opacity: 0.9; font-size: 14px; }
    .section { padding: 20px; border-bottom: 1px solid #e5e7eb; }
    .section:last-child { border-bottom: none; }
    .section h2 { margin: 0 0 15px; font-size: 16px; color: #374151; font-weight: 600; }
    .stats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .stat-card { background: #f9fafb; padding: 15px; border-radius: 6px; text-align: center; }
    .stat-value { font-size: 28px; font-weight: 700; color: #667eea; margin: 0; }
    .stat-label { font-size: 12px; color: #6b7280; margin: 5px 0 0; text-transform: uppercase; letter-spacing: 0.5px; }
    .highlight { background: #ecfdf5; padding: 15px; border-radius: 6px; border-left: 4px solid #10b981; }
    .highlight-value { font-size: 20px; font-weight: 700; color: #10b981; margin: 0; }
    .highlight-label { font-size: 13px; color: #6b7280; margin: 5px 0 0; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th, td { padding: 8px; text-align: left; border-bottom: 1px solid #e5e7eb; font-size: 13px; }
    th { background: #f9fafb; color: #6b7280; font-weight: 600; text-transform: uppercase; font-size: 11px; letter-spacing: 0.5px; }
    .footer { padding: 20px; background: #f9fafb; text-align: center; font-size: 12px; color: #6b7280; }
    .success { color: #10b981; }
    .warning { color: #f59e0b; }
    .error { color: #ef4444; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🏢 HOA Lead Generation Report</h1>
      <p>Run completed in ${duration} seconds</p>
    </div>

    <div class="section">
      <h2>📊 Run Statistics</h2>
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-value">${stats.totalFound}</div>
          <div class="stat-label">Leads Found</div>
        </div>
        <div class="stat-card">
          <div class="stat-value success">${stats.newLeads}</div>
          <div class="stat-label">New Leads</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${stats.updatedLeads}</div>
          <div class="stat-label">Updated</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${stats.enriched}</div>
          <div class="stat-label">Enriched</div>
        </div>
      </div>
      ${stats.errors > 0 ? `<p style="margin-top: 15px; color: #ef4444; font-size: 13px;">⚠️ ${stats.errors} errors occurred during this run. Check logs for details.</p>` : ''}
    </div>

    <div class="section">
      <h2>💾 Database Overview</h2>
      <div class="highlight">
        <div class="highlight-value">${dbStats.total}</div>
        <div class="highlight-label">Total leads in database</div>
      </div>
      <div class="highlight" style="background: #fef3c7; border-color: #f59e0b; margin-top: 10px;">
        <div class="highlight-value" style="color: #f59e0b;">${dbStats.highValue}</div>
        <div class="highlight-label">High-value leads (score ≥ 8)</div>
      </div>
    </div>

    <div class="section">
      <h2>📍 Leads by State</h2>
      <table>
        <thead>
          <tr>
            <th>State</th>
            <th>Count</th>
          </tr>
        </thead>
        <tbody>
          ${stateRows}
        </tbody>
      </table>
    </div>

    <div class="section">
      <h2>📤 Export</h2>
      <p style="margin: 0; font-size: 13px; color: #6b7280;">CSV file generated:</p>
      <p style="margin: 8px 0 0; font-size: 13px; font-family: monospace; background: #f9fafb; padding: 10px; border-radius: 4px; color: #374151;">${exportPath}</p>
    </div>

    <div class="footer">
      <p style="margin: 0;">HOA Lead Generation Agent</p>
      <p style="margin: 5px 0 0;">Generated on ${new Date().toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' })}</p>
    </div>
  </div>
</body>
</html>
  `;
}

// ─── Build Plain Text Email ─────────────────────────────────────────────────
function buildEmailText(data: EmailStats): string {
  const { stats, dbStats, duration, exportPath } = data;

  let text = `
HOA LEAD GENERATION REPORT
================================================

Run completed in ${duration} seconds

RUN STATISTICS
--------------
Leads Found:    ${stats.totalFound}
New Leads:      ${stats.newLeads}
Updated:        ${stats.updatedLeads}
Enriched:       ${stats.enriched}
${stats.errors > 0 ? `Errors:         ${stats.errors}\n` : ''}

DATABASE OVERVIEW
-----------------
Total Leads:    ${dbStats.total}
High-Value:     ${dbStats.highValue} (score >= 8)

LEADS BY STATE
--------------
`;

  Object.entries(dbStats.byState)
    .sort((a, b) => b[1] - a[1])
    .forEach(([state, count]) => {
      text += `${state}: ${count}\n`;
    });

  text += `\nEXPORT\n------\n${exportPath}\n\n`;
  text += `Generated on ${new Date().toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' })}\n`;

  return text;
}

// ─── Send Email ─────────────────────────────────────────────────────────────
export async function sendSummaryEmail(data: EmailStats): Promise<void> {
  const recipient = process.env.NOTIFICATION_EMAIL || process.env.GMAIL_USER;

  if (!recipient) {
    throw new Error('No notification email configured (NOTIFICATION_EMAIL or GMAIL_USER)');
  }

  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    throw new Error('Gmail credentials not configured (GMAIL_USER, GMAIL_APP_PASSWORD)');
  }

  const subject = `🏢 HOA Leads: ${data.stats.newLeads} new, ${data.dbStats.total} total`;

  const mailOptions = {
    from: `"HOA Lead Agent" <${process.env.GMAIL_USER}>`,
    to: recipient,
    subject,
    text: buildEmailText(data),
    html: buildEmailHTML(data),
  };

  try {
    logger.info(`Sending email to ${recipient}...`);
    const info = await transporter.sendMail(mailOptions);
    logger.info(`Email sent: ${info.messageId}`);
  } catch (error: any) {
    logger.error(`Email send failed: ${error.message}`);
    throw error;
  }
}

// ─── Test Function ──────────────────────────────────────────────────────────
export async function testEmail(): Promise<void> {
  const mockData: EmailStats = {
    stats: {
      totalFound: 42,
      newLeads: 15,
      updatedLeads: 27,
      enriched: 38,
      errors: 2,
    },
    dbStats: {
      total: 287,
      highValue: 54,
      byState: {
        FL: 102,
        CA: 89,
        TX: 54,
        GA: 25,
        NC: 12,
        AZ: 5,
      },
    },
    duration: '124.3',
    exportPath: 'exports/leads_export_2026-02-17.csv',
  };

  await sendSummaryEmail(mockData);
  console.log('✓ Test email sent successfully');
}
