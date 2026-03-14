/**
 * @file domExtractor.js
 * @description DOM extraction for Playwright pages — inspired by Page Agent's dom_tree.
 *
 * Instead of porting the full 1700-line Page Agent DOM tree extractor, this provides
 * a focused extraction pipeline for contact enrichment:
 *
 *   1. extractPageText(page) → clean text from Playwright page (innerText, structured)
 *   2. extractWithLLM(page, companyName) → LLM-assisted contact extraction ($0 via Ollama)
 *
 * The LLM extraction uses a simplified DOM representation (not the full Page Agent
 * interactive element indexing — we don't need to click/navigate, just read).
 *
 * COST: $0 when using Ollama. ~$0.01-0.02 per page with GPT-4o fallback.
 *
 * USAGE:
 *   const { extractWithLLM } = require('./domExtractor');
 *   const result = await extractWithLLM(page, 'Acme Construction LLC');
 *   // { emails: ['john@acme.com'], phones: ['(555) 123-4567'], names: ['John Smith'], title: 'Owner' }
 */

'use strict';

const { chat, chatJSON, isModelAvailable } = require('./llmClient');

// ── Playwright page.evaluate() script ──────────────────────────────────────
// Injected into the browser context — extracts structured text from DOM.
// Inspired by Page Agent's flatTreeToString() but focused on contact info.

const DOM_EXTRACT_SCRIPT = `() => {
  const MAX_TEXT_LENGTH = 8000; // Cap to keep LLM tokens reasonable

  // Get all text nodes with their context
  const sections = [];
  const seen = new Set();

  // Extract meta tags (often contain contact info)
  const metas = document.querySelectorAll('meta[content]');
  for (const m of metas) {
    const name = (m.getAttribute('name') || m.getAttribute('property') || '').toLowerCase();
    const content = m.getAttribute('content') || '';
    if (content && (name.includes('author') || name.includes('contact') || name.includes('email'))) {
      sections.push('[META] ' + name + ': ' + content);
    }
  }

  // Extract structured data (JSON-LD, Schema.org)
  const jsonlds = document.querySelectorAll('script[type="application/ld+json"]');
  for (const jl of jsonlds) {
    try {
      const data = JSON.parse(jl.textContent);
      const flat = JSON.stringify(data);
      if (flat.includes('@') || flat.includes('telephone') || flat.includes('email')) {
        // Only include relevant JSON-LD
        sections.push('[SCHEMA] ' + flat.substring(0, 500));
      }
    } catch {}
  }

  // Extract mailto: links
  const mailLinks = document.querySelectorAll('a[href^="mailto:"]');
  for (const a of mailLinks) {
    const email = a.href.replace('mailto:', '').split('?')[0];
    if (email && !seen.has(email)) {
      sections.push('[MAILTO] ' + email);
      seen.add(email);
    }
  }

  // Extract tel: links
  const telLinks = document.querySelectorAll('a[href^="tel:"]');
  for (const a of telLinks) {
    const phone = a.href.replace('tel:', '').replace(/[^0-9+()-\\s]/g, '');
    if (phone && !seen.has(phone)) {
      sections.push('[TEL] ' + phone);
      seen.add(phone);
    }
  }

  // Extract visible text from key sections
  const contactSelectors = [
    // Contact pages
    '#contact', '.contact', '[class*="contact"]', '[id*="contact"]',
    // About pages
    '#about', '.about', '[class*="about"]',
    // Team/staff sections
    '.team', '#team', '[class*="team"]', '[class*="staff"]',
    // Footer (often has contact info)
    'footer', '.footer', '#footer',
    // Header (sometimes has phone/email)
    'header .contact-info', '.header-contact', '.top-bar',
  ];

  for (const selector of contactSelectors) {
    try {
      const els = document.querySelectorAll(selector);
      for (const el of els) {
        const text = (el.innerText || '').trim();
        if (text && text.length > 10 && text.length < 3000 && !seen.has(text.substring(0, 50))) {
          sections.push('[SECTION:' + selector + '] ' + text.substring(0, 1500));
          seen.add(text.substring(0, 50));
        }
      }
    } catch {}
  }

  // If we don't have much yet, get the full body text (truncated)
  if (sections.join('\\n').length < 500) {
    const bodyText = (document.body?.innerText || '').trim();
    if (bodyText) {
      sections.push('[BODY] ' + bodyText.substring(0, 4000));
    }
  }

  const result = sections.join('\\n').substring(0, MAX_TEXT_LENGTH);
  return result;
}`;

// ── LLM extraction prompt ──────────────────────────────────────────────────

const EXTRACT_PROMPT = `You are a contact information extractor. Given a company name and page text from their website, extract any contact information you can find.

Return ONLY valid JSON with this exact structure:
{
  "emails": ["email1@example.com"],
  "phones": ["(555) 123-4567"],
  "names": ["John Smith"],
  "title": "Owner",
  "confidence": "high|medium|low"
}

Rules:
- emails: Array of email addresses found. Prefer personal emails (john@...) over generic (info@...). Exclude noreply@, webmaster@, postmaster@.
- phones: Array of phone numbers in (XXX) XXX-XXXX format.
- names: Array of person names that appear to be decision-makers (Owner, CFO, President, etc.)
- title: The title of the most relevant contact person, or null if unknown.
- confidence: "high" if you found a clear personal email, "medium" if only generic info@, "low" if guessing.
- If a field has no data, use an empty array [] or null.
- Do NOT make up information. Only extract what is clearly present in the text.
- Do NOT include emails from obvious third-party services (google.com, facebook.com, etc.)`;

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Extract structured text from a Playwright page.
 * Returns a string with labeled sections: [META], [MAILTO], [TEL], [SECTION], [BODY].
 *
 * @param {import('playwright').Page} page - Playwright page (already navigated)
 * @returns {Promise<string>} Structured text from the page
 */
async function extractPageText(page) {
  try {
    return await page.evaluate(DOM_EXTRACT_SCRIPT);
  } catch (err) {
    console.error('[DomExtractor] Failed to extract page text:', err.message);
    return '';
  }
}

/**
 * LLM-assisted contact extraction from a Playwright page.
 * Uses structured DOM extraction + LLM to find contacts that regex missed.
 *
 * @param {import('playwright').Page} page - Playwright page (already navigated)
 * @param {string} companyName - Company name for context
 * @param {object} [opts]
 * @param {string} [opts.model] - Ollama model (default: llama3.2:3b)
 * @param {boolean} [opts.allowGPT] - Fall back to GPT-4o if Ollama fails
 * @returns {Promise<{emails: string[], phones: string[], names: string[], title: string|null, confidence: string, method: string}>}
 */
async function extractWithLLM(page, companyName, opts = {}) {
  const model = opts.model || process.env.OLLAMA_DEFAULT_MODEL || 'llama3.2:3b';
  const url = await page.url().catch(() => 'unknown');

  console.log(`[DomExtractor] LLM extraction for "${companyName}" on ${url}`);

  // Step 1: Extract structured text from page
  const pageText = await extractPageText(page);
  if (!pageText || pageText.length < 20) {
    console.log('[DomExtractor] Page text too short, skipping LLM extraction');
    return { emails: [], phones: [], names: [], title: null, confidence: 'low', method: 'no_text' };
  }

  // Step 2: Call LLM to extract contacts
  const userMessage = `Company: ${companyName}\nPage URL: ${url}\n\nPage content:\n${pageText}`;

  let result = null;
  let method = 'llm_ollama';

  try {
    // Try Ollama first ($0)
    const ollamaAvailable = await isModelAvailable(model);
    if (ollamaAvailable) {
      result = await chatJSON(EXTRACT_PROMPT, userMessage, {
        model, provider: 'ollama', maxTokens: 512, temperature: 0.2, timeoutMs: 30000,
      });
    }
  } catch (err) {
    console.log(`[DomExtractor] Ollama extraction failed: ${err.message}`);
  }

  // Fallback to GPT-4o if allowed and Ollama failed
  if (!result && opts.allowGPT) {
    try {
      result = await chatJSON(EXTRACT_PROMPT, userMessage, {
        model: 'gpt-4o', provider: 'openai', maxTokens: 512, temperature: 0.1,
      });
      method = 'llm_gpt4o';
    } catch (err) {
      console.log(`[DomExtractor] GPT-4o extraction failed: ${err.message}`);
    }
  }

  if (!result) {
    return { emails: [], phones: [], names: [], title: null, confidence: 'low', method: 'llm_failed' };
  }

  // Normalize response
  const emails = Array.isArray(result.emails) ? result.emails.filter(e => typeof e === 'string' && e.includes('@')) : [];
  const phones = Array.isArray(result.phones) ? result.phones.filter(p => typeof p === 'string') : [];
  const names = Array.isArray(result.names) ? result.names.filter(n => typeof n === 'string' && n.length >= 3) : [];
  const title = typeof result.title === 'string' ? result.title : null;
  const confidence = ['high', 'medium', 'low'].includes(result.confidence) ? result.confidence : 'low';

  console.log(`[DomExtractor] LLM found: ${emails.length} emails, ${phones.length} phones, ${names.length} names (${confidence})`);

  return { emails, phones, names, title, confidence, method };
}

// ── Exports ────────────────────────────────────────────────────────────────

module.exports = {
  extractPageText,
  extractWithLLM,
  DOM_EXTRACT_SCRIPT,
};
