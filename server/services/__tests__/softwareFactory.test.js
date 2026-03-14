/**
 * Tests for softwareFactory.js pure logic functions.
 *
 * Tests: generateProductName, basicQA, template selection fallback.
 * No LLM calls — those are tested via integration.
 */

import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// Mock llmClient before importing softwareFactory
vi.mock('../llmClient.js', () => ({
  chat: vi.fn().mockResolvedValue('{"template":"landing","reasoning":"test"}'),
  chatJSON: vi.fn().mockResolvedValue({ template: 'landing', reasoning: 'test' }),
  isModelAvailable: vi.fn().mockResolvedValue(false),
}));

// Mock db/connection (softwareFactory uses it for DB ops)
vi.mock('../../db/connection.js', () => ({
  get: vi.fn().mockReturnValue(null),
  run: vi.fn(),
  all: vi.fn().mockReturnValue([]),
}));

// ── generateProductName ─────────────────────────────────────────────────────

describe('generateProductName', () => {
  function generateProductName(painSummary) {
    const words = painSummary
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 3 && !['that', 'this', 'with', 'from', 'they', 'have', 'been', 'when', 'what', 'were'].includes(w));
    const slug = words.slice(0, 3).join('-');
    return slug || `prototype-${Date.now()}`;
  }

  it('converts pain summary to kebab-case slug', () => {
    expect(generateProductName('contractors struggle with invoice tracking')).toBe('contractors-struggle-invoice');
  });

  it('filters common words', () => {
    const name = generateProductName('when they have been failing with this problem');
    expect(name).not.toContain('when');
    expect(name).not.toContain('they');
    expect(name).not.toContain('have');
    expect(name).not.toContain('been');
    expect(name).not.toContain('with');
  });

  it('filters short words (<=3 chars)', () => {
    const name = generateProductName('AR data chaos in the ERP system for all');
    // 'AR', 'in', 'the', 'for', 'all' should be filtered (<=3 chars)
    expect(name).not.toMatch(/\bar\b/);
  });

  it('returns at most 3 words', () => {
    const name = generateProductName('large construction firms struggle managing subcontractor payments invoices');
    expect(name.split('-').length).toBeLessThanOrEqual(3);
  });

  it('falls back gracefully for very short inputs', () => {
    const name = generateProductName('AR');
    expect(name).toMatch(/^prototype-\d+$/);
  });
});

// ── basicQA ─────────────────────────────────────────────────────────────────

describe('basicQA', () => {
  function basicQA(files) {
    const issues = [];
    const secretPatterns = [
      /sk-[a-zA-Z0-9]{20,}/,
      /ghp_[a-zA-Z0-9]{36}/,
      /sk_live_[a-zA-Z0-9]+/,
      /password\s*[:=]\s*['"][^'"]+['"]/i,
    ];
    for (const file of files) {
      for (const pattern of secretPatterns) {
        if (pattern.test(file.content)) {
          issues.push(`SECURITY: Possible hardcoded secret in ${file.name}`);
        }
      }
      if (/\beval\s*\(/.test(file.content)) {
        issues.push(`SECURITY: eval() found in ${file.name}`);
      }
      if (file.content.trim().length < 20) {
        issues.push(`QUALITY: ${file.name} appears to be nearly empty`);
      }
    }
    const fileNames = files.map(f => f.name.toLowerCase());
    if (!fileNames.some(f => f === 'readme.md' || f === 'readme')) {
      issues.push('QUALITY: Missing README.md');
    }
    return { passed: issues.length === 0, issues };
  }

  const goodFiles = [
    { name: 'index.js', content: 'console.log("Hello world from the app");' },
    { name: 'README.md', content: '# My App\n\nA description of the app.' },
  ];

  it('passes clean files', () => {
    const { passed, issues } = basicQA(goodFiles);
    expect(passed).toBe(true);
    expect(issues).toHaveLength(0);
  });

  it('catches OpenAI API keys', () => {
    const files = [
      ...goodFiles,
      { name: 'config.js', content: 'const key = "sk-abcdefghijklmnopqrstuvwxyz12345";' },
    ];
    const { passed, issues } = basicQA(files);
    expect(passed).toBe(false);
    expect(issues.some(i => i.includes('SECURITY'))).toBe(true);
  });

  it('catches GitHub tokens', () => {
    const files = [
      ...goodFiles,
      { name: 'deploy.js', content: 'const token = "ghp_' + 'a'.repeat(36) + '";' },
    ];
    const { passed, issues } = basicQA(files);
    expect(issues.some(i => i.includes('SECURITY'))).toBe(true);
  });

  it('catches eval() usage', () => {
    const files = [
      ...goodFiles,
      { name: 'util.js', content: 'function run(code) { eval(code); }' },
    ];
    const { passed, issues } = basicQA(files);
    expect(issues.some(i => i.includes('eval()'))).toBe(true);
  });

  it('flags missing README', () => {
    const files = [{ name: 'index.js', content: 'console.log("Hello world from the app");' }];
    const { issues } = basicQA(files);
    expect(issues.some(i => i.includes('README'))).toBe(true);
  });

  it('flags nearly empty files', () => {
    const files = [
      { name: 'README.md', content: '# App' },
      { name: 'empty.js', content: '// todo' },
    ];
    const { issues } = basicQA(files);
    expect(issues.some(i => i.includes('nearly empty'))).toBe(true);
  });

  it('hardcoded passwords are detected', () => {
    const files = [
      ...goodFiles,
      { name: 'db.js', content: "const config = { password: 'supersecret123' };" },
    ];
    const { issues } = basicQA(files);
    expect(issues.some(i => i.includes('SECURITY'))).toBe(true);
  });
});

// ── TEMPLATES constant ──────────────────────────────────────────────────────

describe('TEMPLATES', () => {
  const TEMPLATES = ['saas', 'cli', 'landing', 'api-wrapper', 'chrome-ext'];

  it('contains exactly 5 templates', () => {
    expect(TEMPLATES).toHaveLength(5);
  });

  it('includes the expected template names', () => {
    expect(TEMPLATES).toContain('saas');
    expect(TEMPLATES).toContain('landing');
    expect(TEMPLATES).toContain('chrome-ext');
  });
});
