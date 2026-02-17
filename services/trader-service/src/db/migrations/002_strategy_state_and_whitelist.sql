-- Migration 002: Strategy State Persistence and Symbol Whitelist
-- Purpose: Add tables for strategy state persistence and symbol whitelist for risk checks

-- ============================================================================
-- Strategy State Table
-- ============================================================================
-- Store strategy state across restarts (e.g., last signal, position state, etc.)
CREATE TABLE IF NOT EXISTS trd_strategy_state (
  strategy_id UUID NOT NULL REFERENCES trd_strategy(strategy_id) ON DELETE CASCADE,
  state_key VARCHAR(100) NOT NULL,
  state_value_json JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (strategy_id, state_key)
);

CREATE INDEX idx_strategy_state_strategy ON trd_strategy_state(strategy_id);
CREATE INDEX idx_strategy_state_updated ON trd_strategy_state(updated_at DESC);

-- ============================================================================
-- Symbol Whitelist Table
-- ============================================================================
-- Defines which symbols are allowed for trading
CREATE TABLE IF NOT EXISTS trd_symbol_whitelist (
  symbol VARCHAR(20) PRIMARY KEY,
  asset_class VARCHAR(20) NOT NULL CHECK (asset_class IN ('us_equity', 'crypto', 'forex')),
  enabled BOOLEAN NOT NULL DEFAULT true,
  reason TEXT,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  added_by VARCHAR(100) NOT NULL DEFAULT 'system'
);

CREATE INDEX idx_symbol_whitelist_enabled ON trd_symbol_whitelist(enabled) WHERE enabled = true;
CREATE INDEX idx_symbol_whitelist_asset_class ON trd_symbol_whitelist(asset_class);

-- Seed default US equity symbols (commonly traded stocks)
INSERT INTO trd_symbol_whitelist (symbol, asset_class, enabled, reason, added_by) VALUES
  ('AAPL', 'us_equity', true, 'Apple Inc - Default whitelist', 'system'),
  ('MSFT', 'us_equity', true, 'Microsoft Corp - Default whitelist', 'system'),
  ('GOOGL', 'us_equity', true, 'Alphabet Inc Class A - Default whitelist', 'system'),
  ('AMZN', 'us_equity', true, 'Amazon.com Inc - Default whitelist', 'system'),
  ('META', 'us_equity', true, 'Meta Platforms Inc - Default whitelist', 'system'),
  ('TSLA', 'us_equity', true, 'Tesla Inc - Default whitelist', 'system'),
  ('NVDA', 'us_equity', true, 'NVIDIA Corp - Default whitelist', 'system'),
  ('JPM', 'us_equity', true, 'JPMorgan Chase & Co - Default whitelist', 'system'),
  ('V', 'us_equity', true, 'Visa Inc - Default whitelist', 'system'),
  ('JNJ', 'us_equity', true, 'Johnson & Johnson - Default whitelist', 'system'),
  ('WMT', 'us_equity', true, 'Walmart Inc - Default whitelist', 'system'),
  ('PG', 'us_equity', true, 'Procter & Gamble Co - Default whitelist', 'system'),
  ('UNH', 'us_equity', true, 'UnitedHealth Group Inc - Default whitelist', 'system'),
  ('HD', 'us_equity', true, 'Home Depot Inc - Default whitelist', 'system'),
  ('MA', 'us_equity', true, 'Mastercard Inc - Default whitelist', 'system'),
  ('DIS', 'us_equity', true, 'Walt Disney Co - Default whitelist', 'system'),
  ('NFLX', 'us_equity', true, 'Netflix Inc - Default whitelist', 'system'),
  ('ADBE', 'us_equity', true, 'Adobe Inc - Default whitelist', 'system'),
  ('CRM', 'us_equity', true, 'Salesforce Inc - Default whitelist', 'system'),
  ('CSCO', 'us_equity', true, 'Cisco Systems Inc - Default whitelist', 'system')
ON CONFLICT (symbol) DO NOTHING;

-- ============================================================================
-- Mode Switch Cooldown Table
-- ============================================================================
-- Track mode switches (paper <-> live) with cooldown enforcement
CREATE TABLE IF NOT EXISTS trd_mode_switch (
  switch_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_mode VARCHAR(10) NOT NULL CHECK (from_mode IN ('paper', 'live')),
  to_mode VARCHAR(10) NOT NULL CHECK (to_mode IN ('paper', 'live')),
  switched_by VARCHAR(100) NOT NULL,
  switched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reason TEXT
);

CREATE INDEX idx_mode_switch_time ON trd_mode_switch(switched_at DESC);

-- ============================================================================
-- Comments
-- ============================================================================
COMMENT ON TABLE trd_strategy_state IS 'Persists strategy-specific state across service restarts';
COMMENT ON TABLE trd_symbol_whitelist IS 'Defines allowed symbols for trading (risk check #6)';
COMMENT ON TABLE trd_mode_switch IS 'Tracks paper<->live mode switches with cooldown enforcement';

COMMENT ON COLUMN trd_strategy_state.state_key IS 'State key (e.g., last_signal_ts, position_qty, ma_fast, ma_slow)';
COMMENT ON COLUMN trd_strategy_state.state_value_json IS 'State value as JSON (flexible schema)';

COMMENT ON COLUMN trd_symbol_whitelist.asset_class IS 'Asset class: us_equity, crypto, forex';
COMMENT ON COLUMN trd_symbol_whitelist.enabled IS 'Whether symbol is currently allowed for trading';
COMMENT ON COLUMN trd_symbol_whitelist.reason IS 'Why symbol was added/disabled';

COMMENT ON COLUMN trd_mode_switch.from_mode IS 'Previous trading mode';
COMMENT ON COLUMN trd_mode_switch.to_mode IS 'New trading mode';
COMMENT ON COLUMN trd_mode_switch.switched_by IS 'User ID or system that triggered switch';
