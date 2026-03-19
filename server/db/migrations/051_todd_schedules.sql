-- 051: Todd Pipeline Commander schedules
-- Morning briefing at 7 AM MT (1 PM UTC) + monitoring every 2 hours

INSERT OR IGNORE INTO agents (id, name, description, config, status, created_at, updated_at)
VALUES (
  'pipeline-todd-001',
  'todd-pipeline-commander',
  'Pipeline Commander. Force-activates stuck leads, escalates hot leads, monitors agent health. $0/run.',
  '{"special_handler":"todd_pipeline_commander","openclaw_id":"todd-pipeline-commander"}',
  'idle',
  datetime('now'),
  datetime('now')
);

INSERT OR IGNORE INTO schedules (id, name, description, agent_id, agent_name, cron_expression, message, enabled, created_at, updated_at)
VALUES (
  'sched-todd-morning',
  'Todd Morning Briefing (7 AM)',
  'Pipeline snapshot + core KPIs + hot leads. Posts to Discord.',
  'pipeline-todd-001',
  'todd-pipeline-commander',
  '0 13 * * *',
  '{"briefing":true}',
  1,
  datetime('now'),
  datetime('now')
);

INSERT OR IGNORE INTO schedules (id, name, description, agent_id, agent_name, cron_expression, message, enabled, created_at, updated_at)
VALUES (
  'sched-todd-monitor',
  'Todd Pipeline Monitor (Every 2h)',
  'Force-activate stuck leads, check hot leads, agent health.',
  'pipeline-todd-001',
  'todd-pipeline-commander',
  '0 14,16,18,20,22 * * *',
  '{}',
  1,
  datetime('now'),
  datetime('now')
);
