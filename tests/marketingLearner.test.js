/**
 * Tests for server/services/marketingLearner.js
 *
 * Covers: scoreContentPiece, extractLearnings, generateWriterBriefing,
 * learnFromReply, runLearningCycle.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setupTestDb, teardownTestDb, testGet, testAll, testRun, seedTestLead, seedTestSequence } from './testDb.js';

describe('marketingLearner', () => {
  let learner;

  beforeEach(async () => {
    await setupTestDb();
    // Create marketing_learnings table (from migration 038)
    testRun(`CREATE TABLE IF NOT EXISTS marketing_learnings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      learning_type TEXT NOT NULL,
      product TEXT DEFAULT 'both',
      summary TEXT NOT NULL,
      data TEXT DEFAULT NULL,
      confidence REAL DEFAULT 0.5,
      applied INTEGER DEFAULT 0,
      applied_at TEXT DEFAULT NULL,
      source_agent TEXT DEFAULT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )`);
    // Create content_calendar table (from migration 036)
    testRun(`CREATE TABLE IF NOT EXISTS content_calendar (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scheduled_date TEXT NOT NULL,
      product TEXT NOT NULL DEFAULT 'hoa',
      channel TEXT NOT NULL DEFAULT 'blog',
      pillar TEXT DEFAULT NULL,
      topic TEXT NOT NULL,
      target_keyword TEXT DEFAULT NULL,
      secondary_keywords TEXT DEFAULT NULL,
      search_intent TEXT DEFAULT 'informational',
      notes TEXT DEFAULT NULL,
      status TEXT DEFAULT 'planned',
      content_piece_id INTEGER DEFAULT NULL,
      assigned_agent TEXT DEFAULT NULL,
      performance_score INTEGER DEFAULT NULL,
      leads_generated INTEGER DEFAULT 0,
      scored_at TEXT DEFAULT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`);

    learner = (await import('../server/services/marketingLearner.js')).default || (await import('../server/services/marketingLearner.js'));
  });

  afterEach(() => {
    teardownTestDb();
    vi.resetModules();
  });

  describe('scoreContentPiece', () => {
    it('should score a content piece with zero metrics as 0', () => {
      testRun(`INSERT INTO cfo_content_pieces (pillar, channel, title, content_markdown, source_agent, status, created_at)
        VALUES ('reserve_fund', 'blog', 'Test Post', 'content', 'hoa', 'published', datetime('now'))`);
      const piece = testGet("SELECT id FROM cfo_content_pieces ORDER BY id DESC LIMIT 1");

      const result = learner.scoreContentPiece(piece.id);
      expect(result).not.toBeNull();
      expect(result.score).toBe(0);
      expect(result.leadsGenerated).toBe(0);
    });

    it('should return null for non-existent piece', () => {
      const result = learner.scoreContentPiece(99999);
      expect(result).toBeNull();
    });
  });

  describe('generateWriterBriefing', () => {
    it('should return empty string when no data exists', () => {
      const briefing = learner.generateWriterBriefing('hoa-content-writer');
      expect(briefing).toBe('');
    });

    it('should include top performing content when data exists', () => {
      // Seed a published + scored content piece
      testRun(`INSERT INTO cfo_content_pieces (pillar, channel, title, content_markdown, source_agent, status, performance_score, leads_generated, scored_at)
        VALUES ('reserve_fund', 'blog', 'Great Post', 'content', 'hoa', 'published', 90, 3, datetime('now'))`);

      const briefing = learner.generateWriterBriefing('hoa-content-writer');
      expect(briefing).toContain('TOP PERFORMING CONTENT');
      expect(briefing).toContain('Great Post');
    });

    it('should include worst performing content', () => {
      testRun(`INSERT INTO cfo_content_pieces (pillar, channel, title, content_markdown, source_agent, status, performance_score, scored_at)
        VALUES ('governance', 'blog', 'Bad Post', 'content', 'hoa', 'published', 0, datetime('now'))`);

      const briefing = learner.generateWriterBriefing('hoa-content-writer');
      expect(briefing).toContain("DIDN'T PERFORM");
      expect(briefing).toContain('Bad Post');
    });

    it('should include system learnings', () => {
      testRun(`INSERT INTO marketing_learnings (learning_type, product, summary, confidence, source_agent)
        VALUES ('topic_winner', 'hoa', 'Reserve fund posts generate 3x more leads', 0.8, 'marketing-learner')`);

      const briefing = learner.generateWriterBriefing('hoa-content-writer');
      expect(briefing).toContain('SYSTEM HAS LEARNED');
      expect(briefing).toContain('Reserve fund posts');
    });
  });

  describe('extractLearnings', () => {
    it('should store topic winners when scored content exists', () => {
      testRun(`INSERT INTO cfo_content_pieces (pillar, channel, title, content_markdown, source_agent, status, performance_score, leads_generated, target_keyword, scored_at)
        VALUES ('reserve_fund', 'blog', 'Winner Post', 'content', 'hoa', 'published', 90, 5, 'hoa funding', datetime('now'))`);

      learner.extractLearnings();

      const learnings = testAll("SELECT * FROM marketing_learnings WHERE learning_type = 'topic_winner'");
      expect(learnings.length).toBeGreaterThan(0);
      expect(learnings[0].summary).toContain('Winner Post');
    });

    it('should not create duplicate learnings on re-run', () => {
      testRun(`INSERT INTO cfo_content_pieces (pillar, channel, title, content_markdown, source_agent, status, performance_score, leads_generated, scored_at)
        VALUES ('reserve_fund', 'blog', 'Winner', 'content', 'hoa', 'published', 90, 5, datetime('now'))`);

      learner.extractLearnings();
      learner.extractLearnings(); // second run

      const learnings = testAll("SELECT * FROM marketing_learnings WHERE learning_type = 'topic_winner'");
      expect(learnings.length).toBe(1); // not duplicated
    });
  });

  describe('learnFromReply', () => {
    it('should store angle winner on INTERESTED reply', () => {
      const lead = seedTestLead({ city: 'Tampa', state: 'FL', erp_type: 'Vista' });
      const seq = seedTestSequence(lead.id);

      // Record variant first
      testRun(`INSERT INTO outreach_variants (sequence_id, lead_id, subject_line, angle_type, tone, sent_at)
        VALUES (?, ?, 'Test Subject', 'spend_leak', 'consultative', datetime('now'))`,
        [seq.id, lead.id]);

      learner.learnFromReply(lead.id, 'INTERESTED', seq.id);

      const learnings = testAll("SELECT * FROM marketing_learnings WHERE learning_type = 'angle_winner'");
      expect(learnings.length).toBeGreaterThan(0);
      expect(learnings[0].summary).toContain('spend_leak');
      expect(learnings[0].summary).toContain('Tampa');
    });

    it('should NOT store learning on NOT_NOW reply', () => {
      const lead = seedTestLead();
      const seq = seedTestSequence(lead.id);
      testRun(`INSERT INTO outreach_variants (sequence_id, lead_id, subject_line, angle_type, sent_at)
        VALUES (?, ?, 'Test', 'spend_leak', datetime('now'))`, [seq.id, lead.id]);

      learner.learnFromReply(lead.id, 'NOT_NOW', seq.id);

      const learnings = testAll("SELECT * FROM marketing_learnings WHERE learning_type = 'angle_winner'");
      expect(learnings.length).toBe(0);
    });
  });
});
