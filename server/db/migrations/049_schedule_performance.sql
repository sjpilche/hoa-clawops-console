-- 049: Schedule performance tracking for smart auto-pause.
-- Tracks health status and auto-pause state per schedule.

ALTER TABLE schedules ADD COLUMN auto_paused INTEGER DEFAULT 0;
ALTER TABLE schedules ADD COLUMN auto_pause_reason TEXT DEFAULT NULL;
ALTER TABLE schedules ADD COLUMN auto_paused_at TEXT DEFAULT NULL;
ALTER TABLE schedules ADD COLUMN performance_health TEXT DEFAULT NULL;
ALTER TABLE schedules ADD COLUMN last_perf_check_at TEXT DEFAULT NULL;
