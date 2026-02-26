/**
 * Quick diagnostic: test enricher on 3 Denver companies.
 * Shows exactly what Google finds, what website is found, and what emails are extracted.
 */
'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const { chromium } = require('playwright');
const initSqlJs = require('sql.js');
const fs = require('fs');

const SPAM_TRAP_EMAILS = new Set([
  'noreply@', 'no-reply@', 'donotreply@', 'do-not-reply@',
  'webmaster@', 'postmaster@', 'mailer-daemon@',
]);

function extractEmails(text) {
  if (!text) return [];
  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
  const matches = text.match(emailRegex) || [];
  return matches.filter(email => {
    const lower = email.toLowerCase();
    const prefix = lower.split('@')[0] + '@';
    if (SPAM_TRAP_EMAILS.has(prefix)) return false;
    if (lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.gif')) return false;
    return true;
  });
}

async function main() {
  // Load 3 Denver leads from DB
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync('./data/clawops.db'));
  const stmt = db.prepare(
    "SELECT id, company_name, city, state FROM cfo_leads WHERE source='google_maps_discovery' AND state='CO' ORDER BY pilot_fit_score DESC LIMIT 3"
  );
  const leads = [];
  while (stmt.step()) leads.push(stmt.getAsObject());
  db.close();

  console.log('Testing enrichment for:', leads.map(l => l.company_name).join(', '), '\n');

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  for (const lead of leads) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Company: ${lead.company_name} (${lead.city}, ${lead.state})`);

    const ctx = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    });
    const page = await ctx.newPage();

    const query = `"${lead.company_name}" ${lead.city} ${lead.state} contact email owner`;
    console.log(`Query: ${query}`);

    try {
      await page.goto(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
        waitUntil: 'domcontentloaded', timeout: 15000,
      });
      await page.waitForTimeout(2000);

      const title = await page.title();
      if (title.toLowerCase().includes('captcha') || title.toLowerCase().includes('unusual')) {
        console.log('  CAPTCHA DETECTED!');
        continue;
      }

      const text = await page.evaluate(() => document.body.innerText);
      const links = await page.evaluate(() => {
        const found = [];
        document.querySelectorAll('a.result__a, a.result__url').forEach(a => {
          const href = a.href || '';
          if (href.startsWith('http') && !href.includes('duckduckgo.com')) found.push(href);
        });
        if (found.length === 0) {
          document.querySelectorAll('a[href]').forEach(a => {
            if (a.href && a.href.startsWith('http') && !a.href.includes('duckduckgo.com')) found.push(a.href);
          });
        }
        return found.slice(0, 8);
      });

      const emails = extractEmails(text);
      console.log(`  Snippet: ${text.slice(0, 300).replace(/\n/g, ' ')}`);
      console.log(`  Emails found: ${emails.join(', ') || 'none'}`);
      console.log(`  Links: ${links.slice(0, 4).join(' | ')}`);

      // Try to find and scrape the website
      const candidateLink = links.find(l => {
        const domain = l.replace(/^https?:\/\//, '').split('/')[0].toLowerCase();
        return !domain.includes('facebook') && !domain.includes('linkedin') &&
               !domain.includes('yelp') && !domain.includes('bbb') &&
               !domain.includes('houzz') && !domain.includes('angies') &&
               !domain.includes('thumbtack') && !domain.includes('homeadvisor');
      });

      if (candidateLink) {
        console.log(`  Candidate website: ${candidateLink}`);
        const page2 = await ctx.newPage();
        try {
          await page2.goto(candidateLink, { waitUntil: 'domcontentloaded', timeout: 10000 });
          await page2.waitForTimeout(1500);
          const siteText = await page2.evaluate(() => document.body.innerText);
          const siteEmails = extractEmails(siteText);
          console.log(`  Website emails: ${siteEmails.slice(0, 5).join(', ') || 'none'}`);
          if (siteEmails.length === 0) {
            console.log(`  Website snippet: ${siteText.slice(0, 200).replace(/\n/g, ' ')}`);
          }
        } catch (e) {
          console.log(`  Website error: ${e.message}`);
        }
        await page2.close();
      } else {
        console.log('  No candidate website found');
      }
    } catch (err) {
      console.log(`  Error: ${err.message}`);
    }

    await ctx.close();
    await new Promise(r => setTimeout(r, 2000));
  }

  await browser.close();
  console.log('\nDone.');
}

main().catch(console.error);
