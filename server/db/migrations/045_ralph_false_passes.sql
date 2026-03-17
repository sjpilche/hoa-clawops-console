-- 045: Ralph False Pass tracking
-- Records when Steve rejects a draft that Ralph QA had approved.
-- Feeds into Dream Team nightly Phase 2 grading for Ralph's False Pass Rate dimension.

CREATE TABLE IF NOT EXISTS ralph_false_passes (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  sequence_id       TEXT,
  lead_id           TEXT,
  agent_id          TEXT,
  ralph_approved_at DATETIME,
  steve_rejected_at DATETIME,
  rejection_reason  TEXT,
  created_at        DATETIME DEFAULT CURRENT_TIMESTAMP
);
