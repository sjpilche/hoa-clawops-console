/**
 * @file outreachSafety.test.js
 * @description Locks the safety guarantees behind outreach send. These tests
 * verify the *constants and pure logic* — the things that absolutely must not
 * regress without a deliberate code change.
 *
 * Companion to the broader integration tests in tests/agentIntegration.test.js
 * and tests/revenueTracker.test.js (which depend on a fuller DB-mock setup).
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const RUNS_PATH = path.resolve(__dirname, '../server/routes/runs.js');
const AUTO_APPROVAL_PATH = path.resolve(__dirname, '../server/services/autoApprovalEngine.js');
const SETTINGS_PATH = path.resolve(__dirname, '../server/routes/settings.js');
const SENDGRID_WEBHOOK_PATH = path.resolve(__dirname, '../server/routes/sendgridWebhook.js');
const SCHEDULE_RUNNER_PATH = path.resolve(__dirname, '../server/services/scheduleRunner.js');

describe('outreach safety guarantees', () => {
  // ── Auto-send is locked ───────────────────────────────────────────────────

  describe('outreach_sender autoSendCap', () => {
    it('is zero — scheduled runs are preview-only without confirmed=true', () => {
      const src = fs.readFileSync(RUNS_PATH, 'utf-8');
      const m = src.match(/const\s+autoSendCap\s*=\s*(\d+)/);
      expect(m, 'autoSendCap declaration not found in runs.js').not.toBeNull();
      expect(parseInt(m[1], 10)).toBe(0);
    });

    it('still gates on isConfirmed before any send', () => {
      const src = fs.readFileSync(RUNS_PATH, 'utf-8');
      // The preview branch must check !isConfirmed
      expect(src).toContain('if (!isConfirmed)');
      // isConfirmed must require explicit true (not just truthy)
      expect(src).toMatch(/isConfirmed\s*=\s*params\.confirmed\s*===\s*true\s*\|\|\s*params\.confirmed\s*===\s*'true'/);
    });
  });

  // ── Bounce-rate circuit breakers ──────────────────────────────────────────

  describe('bounce rate circuit breakers', () => {
    it('outreach_sender pauses at 5% bounce rate (down from 10%)', () => {
      const src = fs.readFileSync(RUNS_PATH, 'utf-8');
      // The active threshold check
      expect(src).toContain('if (bounceRate > 5)');
      // The minimum sample size for a meaningful rate
      expect(src).toMatch(/recentSends\.length\s*>=\s*10/);
    });

    it('autoApprovalEngine default bounce threshold is 5%', () => {
      const src = fs.readFileSync(AUTO_APPROVAL_PATH, 'utf-8');
      expect(src).toContain("'auto_approval_bounce_threshold', '0.05'");
    });

    it('settings.js seeds auto_approval_bounce_threshold at 0.05', () => {
      const src = fs.readFileSync(SETTINGS_PATH, 'utf-8');
      expect(src).toContain("'auto_approval_bounce_threshold', '0.05'");
    });
  });

  // ── SendGrid webhook signature verification ───────────────────────────────

  describe('sendgrid webhook signature verification', () => {
    it('exists and rejects requests with bad signatures', () => {
      const src = fs.readFileSync(SENDGRID_WEBHOOK_PATH, 'utf-8');
      expect(src).toContain('SENDGRID_WEBHOOK_VERIFICATION_KEY');
      expect(src).toContain('Signature verification FAILED');
      expect(src).toContain('return res.status(403)');
    });
  });
});

describe('schedule runner safety', () => {
  it('drift detection uses cron-parser previous-fire computation, not naive 65-min threshold', () => {
    const src = fs.readFileSync(SCHEDULE_RUNNER_PATH, 'utf-8');
    expect(src).toContain('previousExpectedFire');
    expect(src).toContain('cronParser');
    // Old false-positive logic must be gone
    expect(src).not.toContain('drift > 65 * 60 * 1000');
  });

  it('zombie reaper marks runs stuck >2h as failed', () => {
    const src = fs.readFileSync(SCHEDULE_RUNNER_PATH, 'utf-8');
    expect(src).toContain('reapStaleRuns');
    expect(src).toMatch(/datetime\(['"]now['"],\s*['"]-2 hours['"]\)/);
  });
});

describe('outreach auto-approval engine is opt-in', () => {
  it('master switch defaults to false in code AND in seeded settings', () => {
    const engineSrc = fs.readFileSync(AUTO_APPROVAL_PATH, 'utf-8');
    const settingsSrc = fs.readFileSync(SETTINGS_PATH, 'utf-8');
    expect(engineSrc).toContain("getSetting('auto_approval_enabled', 'false')");
    expect(settingsSrc).toContain("'auto_approval_enabled', 'false'");
  });

  it('processNewDraft early-returns when auto-approval is disabled', () => {
    const src = fs.readFileSync(AUTO_APPROVAL_PATH, 'utf-8');
    expect(src).toContain('if (!isEnabled())');
    expect(src).toContain("'Auto-approval not enabled'");
  });
});

describe('revenue attribution wiring', () => {
  it('apolloLeadMiner records discovery event after each insert', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../server/services/apolloLeadMiner.js'), 'utf-8');
    expect(src).toContain("revenueTracker').recordEvent");
    expect(src).toContain("'discovered'");
    expect(src).toContain("agent: 'apollo-lead-miner'");
  });

  it('jakeConstructionDiscovery records discovery event after each insert', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../server/services/jakeConstructionDiscovery.js'), 'utf-8');
    expect(src).toContain("revenueTracker').recordEvent");
    expect(src).toContain("agent: 'jake-construction-discovery'");
  });

  it('cfoLeadScout records discovery event after each insert', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../server/services/cfoLeadScout.js'), 'utf-8');
    expect(src).toContain("revenueTracker').recordEvent");
    expect(src).toContain("agent: 'cfo-lead-scout'");
  });

  it('postProcessor records discovery event for LLM-scouted leads', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../server/services/postProcessor.js'), 'utf-8');
    expect(src).toContain("revenueTracker').recordEvent");
    expect(src).toContain("channel: 'llm_scout'");
  });

  it('connection.run() returns lastInsertRowid for attribution', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../server/db/connection.js'), 'utf-8');
    expect(src).toContain('lastInsertRowid');
    expect(src).toContain('last_insert_rowid()');
  });
});
