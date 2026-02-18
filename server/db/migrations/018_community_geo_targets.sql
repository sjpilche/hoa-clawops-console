-- Migration 018: community_geo_targets junction table
-- Allows the same HOA community to be associated with multiple geo-targets
-- Without this, an HOA found in both South Florida AND San Diego would only
-- be tracked under whichever geo-target discovered it first.

-- Junction table: community <-> geo-target membership
CREATE TABLE IF NOT EXISTS community_geo_targets (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  community_id INTEGER NOT NULL,
  geo_target_id TEXT NOT NULL,
  first_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (community_id) REFERENCES hoa_communities(id),
  FOREIGN KEY (geo_target_id) REFERENCES geo_targets(id),
  UNIQUE(community_id, geo_target_id)
);

CREATE INDEX IF NOT EXISTS idx_cgt_community ON community_geo_targets(community_id);
CREATE INDEX IF NOT EXISTS idx_cgt_geo_target ON community_geo_targets(geo_target_id);
