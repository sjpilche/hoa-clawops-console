#!/usr/bin/env node
/**
 * @file send-outreach-emails.js
 * @description Send cold outreach emails via Gmail SMTP + cold-outreach skill
 *
 * Usage: node scripts/send-outreach-emails.js <prospect-list.json>
 *
 * Prospect list format:
 * [
 *   { name: "John Doe", email: "john@acme.com", company: "ACME Inc", pain: "cash flow" },
 *   { name: "Jane Smith", email: "jane@tech.com", company: "Tech Corp", pain: "financial planning" }
 * ]
 *
 * Uses:
 * - cold-outreach skill (installed via clayhub) for email generation
 * - Gmail SMTP (augustwest154@gmail.com) for delivery
 * - OpenClaw bridge to run cfo-outreach-agent
 */

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });

const nodemailer = require('nodemailer');

// Email transporter using Gmail SMTP
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.SMTP_USER || 'augustwest154@gmail.com',
    pass: process.env.SMTP_PASS || 'dnqkjgheeflfacnq',
  },
});

async function sendEmail(to, subject, htmlBody) {
  try {
    const result = await transporter.sendMail({
      from: process.env.SMTP_FROM || 'ClawOps Outreach <augustwest154@gmail.com>',
      to,
      subject,
      html: htmlBody,
      text: htmlBody.replace(/<[^>]*>/g, ''), // Strip HTML for plain text
    });

    console.log(`✅ Email sent to ${to}: ${result.messageId}`);
    return result;
  } catch (error) {
    console.error(`❌ Failed to send email to ${to}:`, error.message);
    throw error;
  }
}

async function generateOutreachViaAgent(prospect) {
  const API_URL = process.env.VITE_API_URL || 'http://localhost:3001/api';

  // Get JWT token
  let token;
  try {
    const loginResponse = await fetch(`${API_URL.replace('/api', '')}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@clawops.local',
        password: 'changeme123',
      }),
    });

    if (!loginResponse.ok) {
      console.error('❌ Login failed');
      return null;
    }

    const data = await loginResponse.json();
    token = data.token;
  } catch (error) {
    console.error('❌ Login error:', error.message);
    return null;
  }

  // Run cfo-outreach-agent to generate personalized email
  const prompt = `
Generate a personalized cold outreach email to:
- Name: ${prospect.name}
- Company: ${prospect.company}
- Pain Point: ${prospect.pain}
- Email: ${prospect.email}

The email should:
1. Be personalized to their company and pain point
2. Reference specific pain points (${prospect.pain})
3. Include a single, clear ask
4. Be 5-7 sentences max
5. Sound professional but conversational
6. End with a soft CTA (e.g., "Worth a 15-min call?")

Return ONLY the email body text, no subject line.
`;

  try {
    const response = await fetch(`${API_URL}/runs`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        agent_id: 'cfo-outreach-agent',
        message: prompt,
      }),
    });

    if (!response.ok) {
      console.error('❌ Agent run failed:', response.status);
      return null;
    }

    const run = await response.json();
    const runId = run.run?.id;

    // Wait for run to complete
    let completed = false;
    let attempts = 0;
    let emailBody = '';

    while (!completed && attempts < 30) {
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const statusResponse = await fetch(`${API_URL}/runs/${runId}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (!statusResponse.ok) {
        attempts++;
        continue;
      }

      const statusData = await statusResponse.json();
      if (statusData.run?.status === 'completed') {
        completed = true;
        emailBody = statusData.run?.output || statusData.run?.result_data || '';
        // Try to extract text from result_data if it's JSON
        if (typeof emailBody === 'string' && emailBody.startsWith('{')) {
          try {
            const parsed = JSON.parse(emailBody);
            emailBody = parsed.output || parsed.result || emailBody;
          } catch (_) {
            // Keep as-is if not JSON
          }
        }
      } else if (statusData.run?.status === 'failed') {
        console.error('❌ Agent run failed:', statusData.run?.error);
        return null;
      }

      attempts++;
    }

    if (!completed) {
      console.error('❌ Agent run timed out');
      return null;
    }

    return emailBody;
  } catch (error) {
    console.error('❌ Agent error:', error.message);
    return null;
  }
}

async function main() {
  console.log('📧 Cold Outreach Email Campaign');
  console.log('================================\n');

  // Read prospect list from command line argument or default file
  const prospectFile = process.argv[2] || 'scripts/prospects.json';

  if (!fs.existsSync(prospectFile)) {
    console.error(`❌ Prospect file not found: ${prospectFile}`);
    console.error('\nUsage: node scripts/send-outreach-emails.js <prospect-list.json>');
    console.error('\nExample prospect-list.json:');
    console.error(JSON.stringify(
      [
        { name: 'John Doe', email: 'john@acme.com', company: 'ACME Inc', pain: 'cash flow management' },
        { name: 'Jane Smith', email: 'jane@tech.com', company: 'Tech Corp', pain: 'financial forecasting' },
      ],
      null,
      2
    ));
    process.exit(1);
  }

  let prospects;
  try {
    prospects = JSON.parse(fs.readFileSync(prospectFile, 'utf-8'));
  } catch (error) {
    console.error(`❌ Failed to parse prospect file:`, error.message);
    process.exit(1);
  }

  if (!Array.isArray(prospects)) {
    console.error('❌ Prospect file must contain an array');
    process.exit(1);
  }

  console.log(`📋 Found ${prospects.length} prospects\n`);

  let sent = 0;
  let failed = 0;

  for (const prospect of prospects) {
    console.log(`\n📝 Processing: ${prospect.name} (${prospect.company})`);

    // Generate email via agent
    console.log('  ⏳ Generating personalized email...');
    const emailBody = await generateOutreachViaAgent(prospect);

    if (!emailBody) {
      console.log('  ❌ Failed to generate email');
      failed++;
      continue;
    }

    // Generate subject line
    const subject = `${prospect.pain} — Quick thought for ${prospect.name}`;

    // Format as HTML
    const htmlBody = `
<p>Hi ${prospect.name},</p>
<p>${emailBody}</p>
<p>Best,<br>Steve Pilcher<br>ClawOps CEO</p>
`;

    // Send email
    try {
      await sendEmail(prospect.email, subject, htmlBody);
      sent++;
    } catch (error) {
      console.log(`  ❌ Failed to send email`);
      failed++;
    }

    // Delay to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  console.log('\n' + '='.repeat(50));
  console.log(`📊 Campaign Results: ${sent} sent, ${failed} failed`);
  console.log('='.repeat(50));

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
