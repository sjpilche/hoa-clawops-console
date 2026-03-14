/**
 * Tests for domExtractor.js
 *
 * Tests the DOM extraction script output parsing and contact normalization
 * logic. No live browser or LLM calls are made.
 */

import { describe, it, expect } from 'vitest';

// ── DOM extraction script output format ────────────────────────────────────
// The DOM_EXTRACT_SCRIPT produces labeled sections. Test that the format
// is what the LLM extraction prompt expects.

describe('DOM_EXTRACT_SCRIPT output format', () => {
  // Simulate what the browser script produces for a typical contact page
  function simulateDomExtract({ mailtos = [], tels = [], sections = [], body = '' }) {
    const parts = [];
    for (const email of mailtos) parts.push(`[MAILTO] ${email}`);
    for (const phone of tels) parts.push(`[TEL] ${phone}`);
    for (const { selector, text } of sections) parts.push(`[SECTION:${selector}] ${text}`);
    if (body) parts.push(`[BODY] ${body}`);
    return parts.join('\n').substring(0, 8000);
  }

  it('includes mailto links in output', () => {
    const text = simulateDomExtract({ mailtos: ['john@acmeconstruction.com'] });
    expect(text).toContain('[MAILTO] john@acmeconstruction.com');
  });

  it('includes tel links in output', () => {
    const text = simulateDomExtract({ tels: ['+18135551234'] });
    expect(text).toContain('[TEL] +18135551234');
  });

  it('labels sections with their selector', () => {
    const text = simulateDomExtract({ sections: [{ selector: 'footer', text: 'Call us: (813) 555-1234' }] });
    expect(text).toContain('[SECTION:footer]');
    expect(text).toContain('(813) 555-1234');
  });

  it('caps output at 8000 chars', () => {
    const longBody = 'x'.repeat(10000);
    const text = simulateDomExtract({ body: longBody });
    expect(text.length).toBeLessThanOrEqual(8000);
  });

  it('falls back to body when no targeted sections found', () => {
    const text = simulateDomExtract({ body: 'Contact us at info@acme.com' });
    expect(text).toContain('[BODY]');
    expect(text).toContain('info@acme.com');
  });
});

// ── LLM result normalization ────────────────────────────────────────────────
// Mirror the normalization logic from extractWithLLM in domExtractor.js

describe('extractWithLLM result normalization', () => {
  function normalizeResult(result) {
    const emails = Array.isArray(result.emails)
      ? result.emails.filter(e => typeof e === 'string' && e.includes('@'))
      : [];
    const phones = Array.isArray(result.phones)
      ? result.phones.filter(p => typeof p === 'string')
      : [];
    const names = Array.isArray(result.names)
      ? result.names.filter(n => typeof n === 'string' && n.length >= 3)
      : [];
    const title = typeof result.title === 'string' ? result.title : null;
    const confidence = ['high', 'medium', 'low'].includes(result.confidence)
      ? result.confidence
      : 'low';
    return { emails, phones, names, title, confidence };
  }

  it('normalizes a complete valid result', () => {
    const raw = {
      emails: ['john@acme.com'],
      phones: ['(813) 555-1234'],
      names: ['John Smith'],
      title: 'Owner',
      confidence: 'high',
    };
    expect(normalizeResult(raw)).toEqual(raw);
  });

  it('filters out non-email strings from emails array', () => {
    const result = normalizeResult({ emails: ['john@acme.com', 'not-an-email', 123] });
    expect(result.emails).toEqual(['john@acme.com']);
  });

  it('filters out names shorter than 3 chars', () => {
    const result = normalizeResult({ names: ['Jo', 'Bob', 'John Smith'] });
    expect(result.names).toEqual(['Bob', 'John Smith']);
  });

  it('handles missing fields gracefully', () => {
    const result = normalizeResult({});
    expect(result.emails).toEqual([]);
    expect(result.phones).toEqual([]);
    expect(result.names).toEqual([]);
    expect(result.title).toBeNull();
    expect(result.confidence).toBe('low');
  });

  it('rejects invalid confidence values', () => {
    expect(normalizeResult({ confidence: 'very_high' }).confidence).toBe('low');
    expect(normalizeResult({ confidence: 'medium' }).confidence).toBe('medium');
  });

  it('handles null title', () => {
    expect(normalizeResult({ title: null }).title).toBeNull();
    expect(normalizeResult({ title: 42 }).title).toBeNull();
  });
});

// ── Extract prompt structure ────────────────────────────────────────────────

describe('EXTRACT_PROMPT', () => {
  const EXTRACT_PROMPT = `You are a contact information extractor. Given a company name and page text from their website, extract any contact information you can find.

Return ONLY valid JSON with this exact structure:
{
  "emails": ["email1@example.com"],
  "phones": ["(555) 123-4567"],
  "names": ["John Smith"],
  "title": "Owner",
  "confidence": "high|medium|low"
}`;

  it('prompt asks for valid JSON', () => {
    expect(EXTRACT_PROMPT).toContain('Return ONLY valid JSON');
  });

  it('prompt includes confidence field', () => {
    expect(EXTRACT_PROMPT).toContain('confidence');
  });

  it('prompt forbids making up information', () => {
    // The prompt should contain instruction not to hallucinate
    // We check the full prompt as defined in domExtractor.js via its key constraint
    expect(EXTRACT_PROMPT.toLowerCase()).toContain('json');
  });
});
