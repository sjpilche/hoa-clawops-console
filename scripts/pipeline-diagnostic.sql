-- Pipeline Diagnostic — Ground truth on whether this machine has ever actually fired.
-- Run: node scripts/run-diagnostic.js

-- 1. Have any emails ever actually been sent?
SELECT
  COUNT(*)                    AS total_sent,
  MIN(sent_at)                AS first_send,
  MAX(sent_at)                AS last_send,
  COUNT(DISTINCT lead_id)     AS unique_leads_contacted
FROM cfo_outreach_sequences
WHERE status = 'sent' AND sent_at IS NOT NULL;

-- 2. Outreach sequences by status — where are things stuck?
SELECT
  status,
  COUNT(*)                    AS count,
  MAX(created_at)             AS most_recent,
  MIN(created_at)             AS oldest
FROM cfo_outreach_sequences
GROUP BY status
ORDER BY count DESC;

-- 3. Leads by pipeline stage — where is the funnel backed up?
SELECT
  COALESCE(pipeline_stage, status) AS stage,
  COUNT(*)                         AS count,
  MAX(updated_at)                  AS last_touched
FROM cfo_leads
GROUP BY COALESCE(pipeline_stage, status)
ORDER BY count DESC;

-- 4. Agent runs last 7 days — who is running, who is failing?
SELECT
  agent_id,
  COUNT(*)                                                    AS total_runs,
  SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END)      AS success,
  SUM(CASE WHEN status = 'failed'    THEN 1 ELSE 0 END)      AS failed,
  SUM(CASE WHEN status = 'pending'   THEN 1 ELSE 0 END)      AS pending,
  MAX(created_at)                                             AS last_run
FROM runs
WHERE created_at >= DATE('now', '-7 days')
GROUP BY agent_id
ORDER BY total_runs DESC;

-- 5. Anything currently pending approval?
SELECT
  id, agent_id, created_at, status,
  SUBSTR(COALESCE(result_data,''), 1, 100) AS result_preview
FROM runs
WHERE status IN ('pending', 'approved')
ORDER BY created_at DESC;

-- 6. Recent failures — what is broken?
SELECT
  agent_id,
  COUNT(*)                              AS failures,
  MAX(created_at)                       AS last_failure,
  SUBSTR(MAX(COALESCE(error_msg,'')), 1, 120) AS error_sample
FROM runs
WHERE status = 'failed'
  AND created_at >= DATE('now', '-7 days')
GROUP BY agent_id
ORDER BY failures DESC;

-- 7. Agents with zero runs in last 7 days (check against seed)
SELECT a.id AS agent_id, a.name, a.status, a.updated_at AS last_updated
FROM agents a
WHERE a.status = 'active'
  AND NOT EXISTS (
    SELECT 1 FROM runs r
    WHERE r.agent_id = a.id
      AND r.created_at >= DATE('now', '-7 days')
  )
ORDER BY a.updated_at ASC;
