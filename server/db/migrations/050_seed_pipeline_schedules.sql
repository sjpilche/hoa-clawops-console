-- 050: Seed pipeline agents and schedules for autonomous operation.
-- These are the core agents that run the Jake outreach pipeline:
--   1. Lead Auto-Warmup   — activates enriched leads into cadence (5:00 AM daily)
--   2. Urgency Scorer      — scores all leads on fit/pain/timeliness (5:30 AM daily)
--   3. Cadence Engine       — computes due touches, dispatches outreach (6 AM, 12 PM, 6 PM)
--   4. Outreach Sender      — sends approved emails via SendGrid (10 AM daily)
--   5. Pending Run Executor — fires queued follow-up agents (every 2 hours)

-- ── Pipeline Agents ──

INSERT OR IGNORE INTO agents (id, name, description, config, status, created_at, updated_at)
VALUES (
  'pipeline-warmup-001',
  'lead-auto-warmup',
  'Activates enriched leads into cadence. Reactivates stale leads. $0/run.',
  '{"special_handler":"lead_auto_warmup"}',
  'idle',
  datetime('now'),
  datetime('now')
);

INSERT OR IGNORE INTO agents (id, name, description, config, status, created_at, updated_at)
VALUES (
  'pipeline-urgency-001',
  'urgency-scorer',
  'Scores leads 0-100 across Fit/Pain/Timeliness/Enrichment. $0/run.',
  '{"special_handler":"urgency_scorer"}',
  'idle',
  datetime('now'),
  datetime('now')
);

INSERT OR IGNORE INTO agents (id, name, description, config, status, created_at, updated_at)
VALUES (
  'pipeline-cadence-001',
  'tenacity-cadence-engine',
  'Computes due touches, dispatches outreach/follow-up agents. Brain-aware. $0/run.',
  '{"special_handler":"tenacity_cadence"}',
  'idle',
  datetime('now'),
  datetime('now')
);

INSERT OR IGNORE INTO agents (id, name, description, config, status, created_at, updated_at)
VALUES (
  'pipeline-sender-001',
  'outreach-sender',
  'Sends approved outreach emails via SendGrid. Preview-only by default, confirmed=true to send.',
  '{"special_handler":"outreach_sender"}',
  'idle',
  datetime('now'),
  datetime('now')
);

INSERT OR IGNORE INTO agents (id, name, description, config, status, created_at, updated_at)
VALUES (
  'pipeline-executor-001',
  'pending-run-executor',
  'Fires queued cadence follow-up runs. $0/run.',
  '{"special_handler":"pending_run_executor"}',
  'idle',
  datetime('now'),
  datetime('now')
);

-- ── Pipeline Schedules ──

INSERT OR IGNORE INTO schedules (id, name, description, agent_id, agent_name, cron_expression, message, enabled, created_at, updated_at)
VALUES (
  'sched-warmup-daily',
  'Lead Warmup (Daily 5 AM)',
  'Activate enriched leads into cadence. Reactivate stale leads.',
  'pipeline-warmup-001',
  'lead-auto-warmup',
  '0 5 * * *',
  '{}',
  1,
  datetime('now'),
  datetime('now')
);

INSERT OR IGNORE INTO schedules (id, name, description, agent_id, agent_name, cron_expression, message, enabled, created_at, updated_at)
VALUES (
  'sched-urgency-daily',
  'Urgency Scorer (Daily 5:30 AM)',
  'Score all leads on fit/pain/timeliness/enrichment.',
  'pipeline-urgency-001',
  'urgency-scorer',
  '30 5 * * *',
  '{"product":"both"}',
  1,
  datetime('now'),
  datetime('now')
);

INSERT OR IGNORE INTO schedules (id, name, description, agent_id, agent_name, cron_expression, message, enabled, created_at, updated_at)
VALUES (
  'sched-cadence-morning',
  'Cadence Engine (Morning 6 AM)',
  'Compute due touches and dispatch outreach agents.',
  'pipeline-cadence-001',
  'tenacity-cadence-engine',
  '0 6 * * *',
  '{"product":"both"}',
  1,
  datetime('now'),
  datetime('now')
);

INSERT OR IGNORE INTO schedules (id, name, description, agent_id, agent_name, cron_expression, message, enabled, created_at, updated_at)
VALUES (
  'sched-cadence-midday',
  'Cadence Engine (Midday 12 PM)',
  'Second cadence check — catches new leads enriched in the morning.',
  'pipeline-cadence-001',
  'tenacity-cadence-engine',
  '0 12 * * *',
  '{"product":"both"}',
  1,
  datetime('now'),
  datetime('now')
);

INSERT OR IGNORE INTO schedules (id, name, description, agent_id, agent_name, cron_expression, message, enabled, created_at, updated_at)
VALUES (
  'sched-cadence-evening',
  'Cadence Engine (Evening 6 PM)',
  'Third cadence check — evening batch.',
  'pipeline-cadence-001',
  'tenacity-cadence-engine',
  '0 18 * * *',
  '{"product":"both"}',
  1,
  datetime('now'),
  datetime('now')
);

INSERT OR IGNORE INTO schedules (id, name, description, agent_id, agent_name, cron_expression, message, enabled, created_at, updated_at)
VALUES (
  'sched-sender-daily',
  'Outreach Sender (Daily 10 AM)',
  'Send approved outreach via SendGrid. Sends up to 50 approved emails.',
  'pipeline-sender-001',
  'outreach-sender',
  '0 10 * * *',
  '{"product":"both","limit":50,"confirmed":true}',
  1,
  datetime('now'),
  datetime('now')
);

INSERT OR IGNORE INTO schedules (id, name, description, agent_id, agent_name, cron_expression, message, enabled, created_at, updated_at)
VALUES (
  'sched-executor-2h',
  'Pending Run Executor (Every 2 Hours)',
  'Fire queued cadence follow-up runs.',
  'pipeline-executor-001',
  'pending-run-executor',
  '0 */2 * * *',
  '{"limit":10}',
  1,
  datetime('now'),
  datetime('now')
);
