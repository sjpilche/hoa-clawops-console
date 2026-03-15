/**
 * @file rseCampaignBuilder.js
 * @description Creates marketing campaigns from signals/specs → feeds Jake/CFO pipeline.
 *
 * HOW IT WORKS:
 *   1. Pulls signal + optional build spec + expert library patterns
 *   2. GPT-4o generates campaign (type, audience, angle, content brief)
 *   3. Queues into cfo_content_pieces or cfo_outreach_sequences with source_agent='rse'
 *
 * COST: ~$0.03/run (GPT-4o via OpenClaw bridge)
 */

const { all, run, get } = require('../db/connection');
const { getRelevantPatterns } = require('./rseExpertLibrary');

// ════════════════════════════════════════════════════════════════════════════
// CAMPAIGN GENERATION
// ════════════════════════════════════════════════════════════════════════════

/**
 * Build a campaign for an accepted signal (optionally with build spec).
 */
async function buildCampaign(signalId, buildSpecId = null) {
  const signal = get(
    `SELECT sig.*, s.name AS source_name
     FROM rse_signals sig
     JOIN rse_sources s ON s.id = sig.source_id
     WHERE sig.id = ?`, [signalId]
  );

  if (!signal) return null;

  const spec = buildSpecId
    ? get('SELECT * FROM rse_build_specs WHERE id = ?', [buildSpecId])
    : get('SELECT * FROM rse_build_specs WHERE signal_id = ?', [signalId]);

  let tags = [];
  try { tags = JSON.parse(signal.tags || '[]'); } catch {}
  const patterns = getRelevantPatterns(tags, 2);

  const message = JSON.stringify({
    action: 'build_campaign',
    signal: {
      title: signal.title,
      description: signal.description,
      key_insights: signal.key_insights,
      signal_type: signal.signal_type,
      tags: signal.tags,
      source_name: signal.source_name,
    },
    build_spec: spec ? {
      spec_title: spec.spec_title,
      problem_statement: spec.problem_statement,
      proposed_solution: spec.proposed_solution,
      revenue_model: spec.revenue_model,
    } : null,
    expert_patterns: patterns.map(p => ({
      pattern_name: p.pattern_name,
      description: p.description,
      verified: !!p.verified,
    })),
  });

  let campaignJson;
  try {
    const OpenClawBridge = require('./openclawBridge');
    const bridge = new OpenClawBridge();
    const result = await bridge.runAgent('rse-campaign-builder', { message });
    const parsed = OpenClawBridge.parseOutput(result.output);
    campaignJson = parseJson(parsed.text);
  } catch (err) {
    console.log(`[RSE-Campaign] OpenClaw bridge failed, trying direct: ${err.message}`);
    try {
      const { chat } = require('./llmClient');
      const raw = await chat(CAMPAIGN_SYSTEM_PROMPT, message, {
        model: 'gpt-4o', provider: 'openai', temperature: 0.6, maxTokens: 2048, timeoutMs: 60000,
      });
      campaignJson = parseJson(raw);
    } catch (err2) {
      console.error(`[RSE-Campaign] Direct LLM also failed: ${err2.message}`);
      return null;
    }
  }

  if (!campaignJson) return null;

  // Save campaign
  run(`INSERT INTO rse_campaigns
    (signal_id, build_spec_id, campaign_type, title, description,
     target_audience, messaging_angle, content_brief, status, assigned_agent)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?)`, [
    signalId,
    spec?.id || null,
    campaignJson.campaign_type || 'content',
    campaignJson.title || signal.title,
    campaignJson.description || '',
    campaignJson.target_audience || '',
    campaignJson.messaging_angle || '',
    campaignJson.content_brief || '',
    campaignJson.assigned_agent || 'jake-content-engine',
  ]);

  // Update signal status
  run('UPDATE rse_signals SET status = \'campaign_generated\', updated_at = datetime(\'now\') WHERE id = ?', [signalId]);

  console.log(`[RSE-Campaign] Created: "${campaignJson.title}" (type: ${campaignJson.campaign_type})`);
  return campaignJson;
}

/**
 * Queue a campaign into the existing Jake/CFO marketing pipeline.
 * Inserts into cfo_content_pieces or cfo_outreach_sequences based on type.
 */
function queueCampaignExecution(campaignId) {
  const campaign = get('SELECT * FROM rse_campaigns WHERE id = ?', [campaignId]);
  if (!campaign) return { queued: false, reason: 'Campaign not found' };

  try {
    if (campaign.campaign_type === 'content' || campaign.campaign_type === 'social') {
      // Insert into content pipeline
      run(`INSERT INTO cfo_content_pieces
        (pillar, channel, title, content_markdown, cta, source_agent, status, created_at)
        VALUES (?, ?, ?, ?, ?, 'rse', 'draft', datetime('now'))`, [
        'ai_automation',
        campaign.campaign_type === 'social' ? 'linkedin' : 'blog',
        campaign.title,
        campaign.content_brief || campaign.description,
        'Learn more about our AI automation capabilities',
      ]);
    } else if (campaign.campaign_type === 'outreach') {
      // Insert into outreach pipeline (uses email_subject/email_body column names)
      run(`INSERT INTO cfo_outreach_sequences
        (lead_id, sequence_position, email_subject, email_body, source_agent, status, created_at)
        VALUES (NULL, 1, ?, ?, 'rse', 'draft', datetime('now'))`, [
        campaign.messaging_angle || campaign.title,
        campaign.content_brief || campaign.description,
      ]);
    }

    run('UPDATE rse_campaigns SET status = \'queued\', updated_at = datetime(\'now\') WHERE id = ?', [campaignId]);
    return { queued: true, type: campaign.campaign_type };
  } catch (err) {
    console.log(`[RSE-Campaign] Queue failed: ${err.message}`);
    return { queued: false, reason: err.message };
  }
}

/**
 * Batch build campaigns for signals that have specs but no campaigns yet.
 */
async function buildBatch(limit = 3) {
  const signals = all(
    `SELECT sig.id, sig.title, sig.composite_score
     FROM rse_signals sig
     LEFT JOIN rse_campaigns c ON c.signal_id = sig.id
     WHERE sig.status IN ('accepted', 'spec_generated') AND c.id IS NULL
     ORDER BY sig.composite_score DESC
     LIMIT ?`, [limit]
  );

  let built = 0, failed = 0;
  const results = [];

  for (const signal of signals) {
    const campaign = await buildCampaign(signal.id);
    if (campaign) {
      built++;
      results.push({ signalId: signal.id, title: signal.title, campaignTitle: campaign.title, status: 'ok' });
    } else {
      failed++;
      results.push({ signalId: signal.id, title: signal.title, status: 'failed' });
    }
  }

  return { built, failed, total: signals.length, results };
}

// ════════════════════════════════════════════════════════════════════════════
// FALLBACK SYSTEM PROMPT
// ════════════════════════════════════════════════════════════════════════════

const CAMPAIGN_SYSTEM_PROMPT = `You are a campaign builder for an AI automation business run by Steve Pilcher, a construction CFO.
Given a signal (insight from a YouTube creator) and optionally a build spec, create a marketing campaign.

Voice: Practical CFO who fixed his own data problems. No hype. No "AI-powered" buzzwords.
Audience: Construction companies (GCs, subcontractors) struggling with QuickBooks, Excel, messy AR/AP.

Output ONLY valid JSON:
{
  "campaign_type": "content|outreach|social|offer|experiment",
  "title": "Campaign title (max 80 chars)",
  "description": "What this campaign does (1-2 sentences)",
  "target_audience": "Who this is for",
  "messaging_angle": "The hook — what makes them stop scrolling",
  "content_brief": "Detailed brief (enough for a content engine to write from — 2-3 paragraphs)",
  "assigned_agent": "jake-content-engine|cfo-outreach-agent|jake-social-scheduler"
}`;

// ════════════════════════════════════════════════════════════════════════════
// JSON PARSING HELPER
// ════════════════════════════════════════════════════════════════════════════

function parseJson(raw) {
  if (!raw) return null;
  let cleaned = raw.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  }
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch {}
    }
    return null;
  }
}

module.exports = {
  buildCampaign,
  buildBatch,
  queueCampaignExecution,
};
