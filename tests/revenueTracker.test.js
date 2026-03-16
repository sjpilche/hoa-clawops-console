/**
 * Tests for server/services/revenueTracker.js
 *
 * Covers: recordEvent, recordDeal, updateEngagementScore, getFunnelStats,
 * stage advancement, cycle time, A/B variants, table allowlist.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setupTestDb, teardownTestDb, testGet, testAll, testRun, seedTestLead, seedTestSequence } from './testDb.js';

describe('revenueTracker', () => {
  let revenue;

  beforeEach(async () => {
    await setupTestDb();
    // Fresh import after mock is in place
    revenue = (await import('../server/services/revenueTracker.js')).default || (await import('../server/services/revenueTracker.js'));
  });

  afterEach(() => {
    teardownTestDb();
    vi.resetModules();
  });

  // ── recordEvent ──────────────────────────────────────────────────────────

  describe('recordEvent', () => {
    it('should record a revenue event and return stage transition', () => {
      const lead = seedTestLead({ revenue_stage: 'discovered' });
      const result = revenue.recordEvent(lead.id, 'contacted', { agent: 'outreach-sender' });

      expect(result).not.toBeNull();
      expect(result.stageBefore).toBe('discovered');
      expect(result.stageAfter).toBe('contacted');
      expect(result.eventType).toBe('contacted');
    });

    it('should advance revenue_stage forward on the lead', () => {
      const lead = seedTestLead({ revenue_stage: 'discovered' });
      revenue.recordEvent(lead.id, 'contacted');

      const updated = testGet('SELECT revenue_stage FROM cfo_leads WHERE id = ?', [lead.id]);
      expect(updated.revenue_stage).toBe('contacted');
    });

    it('should NOT go backward (replied → discovered)', () => {
      const lead = seedTestLead({ revenue_stage: 'replied' });
      revenue.recordEvent(lead.id, 'contacted');

      const updated = testGet('SELECT revenue_stage FROM cfo_leads WHERE id = ?', [lead.id]);
      expect(updated.revenue_stage).toBe('replied'); // unchanged
    });

    it('should insert into revenue_events table', () => {
      const lead = seedTestLead();
      revenue.recordEvent(lead.id, 'contacted', { agent: 'test-agent', channel: 'email' });

      const events = testAll('SELECT * FROM revenue_events WHERE lead_id = ?', [lead.id]);
      expect(events.length).toBe(1);
      expect(events[0].event_type).toBe('contacted');
      expect(events[0].agent_name).toBe('test-agent');
      expect(events[0].channel).toBe('email');
    });

    it('should return null for non-existent lead', () => {
      const result = revenue.recordEvent(99999, 'contacted');
      expect(result).toBeNull();
    });

    it('should reject invalid table names (SQL injection prevention)', () => {
      const lead = seedTestLead();
      // Should fall back to cfo_leads, not crash
      const result = revenue.recordEvent(lead.id, 'contacted', { leadTable: 'evil_table; DROP TABLE agents;--' });
      expect(result).not.toBeNull(); // Falls back to cfo_leads
    });
  });

  // ── recordDeal ───────────────────────────────────────────────────────────

  describe('recordDeal', () => {
    it('should record deal value in cents', () => {
      const lead = seedTestLead({ revenue_stage: 'pilot' });
      revenue.recordDeal(lead.id, 250000, 'manual'); // $2,500.00

      const updated = testGet('SELECT deal_value_cents, deal_closed_at, deal_closed_by, revenue_stage FROM cfo_leads WHERE id = ?', [lead.id]);
      expect(updated.deal_value_cents).toBe(250000);
      expect(updated.deal_closed_by).toBe('manual');
      expect(updated.deal_closed_at).not.toBeNull();
      expect(updated.revenue_stage).toBe('closed_won');
    });

    it('should compute days_to_close', () => {
      // Create lead with known creation date
      const lead = seedTestLead({ revenue_stage: 'pilot' });
      // Backdate creation
      testRun("UPDATE cfo_leads SET created_at = datetime('now', '-30 days') WHERE id = ?", [lead.id]);

      revenue.recordDeal(lead.id, 100000, 'jake-meeting-booker');

      const updated = testGet('SELECT days_to_close FROM cfo_leads WHERE id = ?', [lead.id]);
      expect(updated.days_to_close).toBeGreaterThanOrEqual(29);
      expect(updated.days_to_close).toBeLessThanOrEqual(31);
    });
  });

  // ── updateEngagementScore ────────────────────────────────────────────────

  describe('updateEngagementScore', () => {
    it('should increment engagement score on open (+10)', () => {
      const lead = seedTestLead({ engagement_score: 0 });
      revenue.updateEngagementScore(lead.id, 'open');

      const updated = testGet('SELECT engagement_score FROM cfo_leads WHERE id = ?', [lead.id]);
      expect(updated.engagement_score).toBe(10);
    });

    it('should increment on click (+25)', () => {
      const lead = seedTestLead({ engagement_score: 10 });
      revenue.updateEngagementScore(lead.id, 'click');

      const updated = testGet('SELECT engagement_score FROM cfo_leads WHERE id = ?', [lead.id]);
      expect(updated.engagement_score).toBe(35);
    });

    it('should cap at 100', () => {
      const lead = seedTestLead({ engagement_score: 90 });
      revenue.updateEngagementScore(lead.id, 'reply'); // +50

      const updated = testGet('SELECT engagement_score FROM cfo_leads WHERE id = ?', [lead.id]);
      expect(updated.engagement_score).toBe(100); // capped
    });

    it('should log engagement event', () => {
      const lead = seedTestLead();
      revenue.updateEngagementScore(lead.id, 'open', { subject: 'Test email' });

      const events = testAll('SELECT * FROM engagement_events WHERE lead_id = ?', [lead.id]);
      expect(events.length).toBe(1);
      expect(events[0].event_type).toBe('open');
      expect(events[0].email_subject).toBe('Test email');
    });
  });

  // ── getFunnelStats ───────────────────────────────────────────────────────

  describe('getFunnelStats', () => {
    it('should return counts at each stage', () => {
      seedTestLead({ revenue_stage: 'discovered' });
      seedTestLead({ id: 2, contact_email: 'a@test.com', revenue_stage: 'discovered' });
      seedTestLead({ id: 3, contact_email: 'b@test.com', revenue_stage: 'contacted' });
      seedTestLead({ id: 4, contact_email: 'c@test.com', revenue_stage: 'replied' });

      const stats = revenue.getFunnelStats();
      expect(stats.counts.discovered).toBe(2);
      expect(stats.counts.contacted).toBe(1);
      expect(stats.counts.replied).toBe(1);
    });

    it('should compute conversion rates', () => {
      seedTestLead({ revenue_stage: 'discovered' });
      seedTestLead({ id: 2, contact_email: 'a@test.com', revenue_stage: 'contacted' });
      seedTestLead({ id: 3, contact_email: 'b@test.com', revenue_stage: 'replied' });

      const stats = revenue.getFunnelStats();
      // discovered_to_contacted: 2 out of 3 reached contacted or beyond
      expect(stats.rates.discovered_to_contacted).toBeGreaterThan(0);
    });

    it('should compute total revenue', () => {
      const lead = seedTestLead({ revenue_stage: 'closed_won' });
      testRun('UPDATE cfo_leads SET deal_value_cents = 500000 WHERE id = ?', [lead.id]);

      const stats = revenue.getFunnelStats();
      expect(stats.totalRevenueCents).toBe(500000);
      expect(stats.totalRevenueDollars).toBe('5000.00');
    });
  });

  // ── A/B Variants ─────────────────────────────────────────────────────────

  describe('outreach variants', () => {
    it('should record an outreach variant', () => {
      const lead = seedTestLead();
      const seq = seedTestSequence(lead.id);

      revenue.recordOutreachVariant(seq.id, lead.id, {
        subjectLine: 'Quick question about your AP process',
        angleType: 'spend_leak',
        tone: 'consultative',
      });

      const variants = testAll('SELECT * FROM outreach_variants WHERE sequence_id = ?', [seq.id]);
      expect(variants.length).toBe(1);
      expect(variants[0].angle_type).toBe('spend_leak');
      expect(variants[0].tone).toBe('consultative');
    });

    it('should update variant outcomes', () => {
      const lead = seedTestLead();
      const seq = seedTestSequence(lead.id);
      revenue.recordOutreachVariant(seq.id, lead.id, { subjectLine: 'Test' });

      revenue.updateVariantOutcome(seq.id, 'opened', 1);
      revenue.updateVariantOutcome(seq.id, 'replied', 1);
      revenue.updateVariantOutcome(seq.id, 'reply_sentiment', 'INTERESTED');

      const variant = testGet('SELECT * FROM outreach_variants WHERE sequence_id = ?', [seq.id]);
      expect(variant.opened).toBe(1);
      expect(variant.replied).toBe(1);
      expect(variant.reply_sentiment).toBe('INTERESTED');
    });
  });

  // ── Stage Transitions ────────────────────────────────────────────────────

  describe('full stage progression', () => {
    it('should progress through entire funnel', () => {
      const lead = seedTestLead({ revenue_stage: 'discovered' });

      revenue.recordEvent(lead.id, 'contacted');
      expect(testGet('SELECT revenue_stage FROM cfo_leads WHERE id = ?', [lead.id]).revenue_stage).toBe('contacted');

      revenue.recordEvent(lead.id, 'replied');
      expect(testGet('SELECT revenue_stage FROM cfo_leads WHERE id = ?', [lead.id]).revenue_stage).toBe('replied');

      revenue.recordEvent(lead.id, 'meeting_booked');
      expect(testGet('SELECT revenue_stage FROM cfo_leads WHERE id = ?', [lead.id]).revenue_stage).toBe('meeting');

      revenue.recordEvent(lead.id, 'pilot_started');
      expect(testGet('SELECT revenue_stage FROM cfo_leads WHERE id = ?', [lead.id]).revenue_stage).toBe('pilot');

      revenue.recordDeal(lead.id, 500000, 'manual');
      expect(testGet('SELECT revenue_stage FROM cfo_leads WHERE id = ?', [lead.id]).revenue_stage).toBe('closed_won');

      // Verify all events recorded
      const events = testAll('SELECT * FROM revenue_events WHERE lead_id = ? ORDER BY id', [lead.id]);
      expect(events.length).toBe(6); // 5 stages + deal_won
    });
  });
});
