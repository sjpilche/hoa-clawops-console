/**
 * @file leadDossierGenerator.js
 * @description ClawOps 2.0 Upgrade B — Lead Dossier Generator
 *
 * Assembles a personalized, narrative-rich Markdown dossier for each lead.
 * Zero LLM cost — pure string assembly from DB signals + Collective Brain.
 *
 * Sources pulled:
 *   1. Lead row: company, contact, location, ERP, urgency_score, urgency_signals
 *   2. Brain Layer 3 episodes: top-3 similar wins (same market / ERP / pain type)
 *   3. Brain Layer 4 KB: 2-3 winning outreach angles matching lead's pain profile
 *
 * Output structure (Markdown):
 *   # [Company] — Outreach Dossier
 *   ## Situation Snapshot
 *   ## Pain Narrative (3-5 bullets)
 *   ## Proof: Similar Wins
 *   ## Recommended Next Step
 *   ---
 *   [Signature block]
 *
 * EXPORTS:
 *   generateDossier(leadId, product)            — one cfo_lead
 *   generateEngagementDossier(engagementId)     — one lg_engagement_queue row
 *   generateDossierForBatch(product, limit)     — batch (rate-limited: 20/min)
 */

'use strict';

const { get, all, run } = require('../db/connection');

// ── Rate limiter state (in-process, resets on server restart) ──────────────
let _batchCallsThisMinute = 0;
let _batchWindowStart    = Date.now();
const BATCH_RATE_LIMIT   = 20;  // max leads per minute in batch mode

function checkRateLimit() {
  const now = Date.now();
  if (now - _batchWindowStart > 60000) {
    _batchCallsThisMinute = 0;
    _batchWindowStart = now;
  }
  if (_batchCallsThisMinute >= BATCH_RATE_LIMIT) return false;
  _batchCallsThisMinute++;
  return true;
}

// ── Pain signal → readable label map ─────────────────────────────────────
const PAIN_LABELS = {
  // Jake / CFO signals
  'quickbooks': 'QuickBooks chaos',
  'qb':         'QuickBooks chaos',
  'excel':      'Excel-based accounting',
  'spreadsheet':'Excel-based accounting',
  'sage':       'legacy Sage system',
  'ar backlog': 'AR collections backlog',
  'collections problem': 'collections backlog',
  'cash flow':  'cash flow visibility gaps',
  'overrun':    'job cost overruns',
  'job costing':'manual job costing',
  'hiring':     'open finance hire (high intent)',
  'controller': 'open Controller/CFO role',
  'permit':     'active construction project (permit signal)',
  'bid awarded':'recently awarded contract',
  'lien':       'lien exposure risk',
  'erp migration': 'evaluating ERP options',
  'switching erp': 'actively switching ERP',
  // HOA signals
  'special assessment': 'special assessment needed',
  'reserve fund':       'underfunded reserve',
  'underfunded':        'underfunded reserve',
  'roof replacement':   'major capital project pending',
  'hvac replacement':   'major capital project pending',
  'budget shortfall':   'budget shortfall',
  'need funding':       'actively seeking funding',
  'loan':               'researching loans',
  'delinquent dues':    'delinquent dues problem',
  // Unified CFO + AI + data signals
  'multiple systems':   'disconnected systems — automation opportunity',
  'manual process':     'manual processes burning staff hours',
  'manual reconciliation': 'manual reconciliation — automation candidate',
  'no visibility':      'no real-time financial visibility',
  'growing fast':       'scaling without finance infrastructure',
  'rapid growth':       'scaling without finance infrastructure',
  'dual systems':       'running parallel systems — data cleanup needed',
  'data migration':     'mid-migration — data integrity at risk',
  'multi-entity':       'multi-entity complexity — automation opportunity',
};

function humanizeSignal(rawSignal) {
  const lower = rawSignal.toLowerCase();
  for (const [key, label] of Object.entries(PAIN_LABELS)) {
    if (lower.includes(key)) return label;
  }
  return rawSignal;
}

// ─────────────────────────────────────────────────────────────────────────────
// JAKE / CFO DOSSIER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a dossier for one cfo_leads row.
 * @param {number} leadId
 * @param {'jake'|'cfo'} [product='jake']
 * @returns {Promise<{success:boolean, dossier:string, length:number, sourcesUsed:object}>}
 */
async function generateDossier(leadId, product = 'jake') {
  const lead = get('SELECT * FROM cfo_leads WHERE id = ?', [leadId]);
  if (!lead) throw new Error(`Lead ${leadId} not found`);

  const sourcesUsed = { episodes: 0, kb_examples: 0, urgency_signals: 0 };

  // ── 1. Parse urgency signals ────────────────────────────────────────────
  let urgencySignals = [];
  try {
    urgencySignals = JSON.parse(lead.urgency_signals || '[]');
  } catch {}
  sourcesUsed.urgency_signals = urgencySignals.length;

  // Extract pain items from signal array
  const painItems = [];
  for (const sig of urgencySignals) {
    if (sig.type === 'pain_signals' && Array.isArray(sig.items)) {
      painItems.push(...sig.items.map(humanizeSignal));
    }
    if (sig.type === 'erp_fit' && sig.erp) {
      painItems.push(`uses ${humanizeSignal(sig.erp)}`);
    }
  }

  // Build enrichment quality note
  const enrichNote = lead.contact_email
    ? `Email verified ✓${lead.phone ? '  ·  Phone on file' : ''}`
    : lead.contact_linkedin
    ? 'LinkedIn profile found — email pending enrichment'
    : 'Contact needs enrichment before outreach';

  // Recency note
  const refDate = lead.enriched_at || lead.created_at;
  const ageDays = refDate
    ? Math.round((Date.now() - new Date(refDate).getTime()) / 86400000) : null;
  const recencyNote = ageDays !== null
    ? (ageDays <= 3 ? 'Discovered this week — act fast' :
       ageDays <= 14 ? `Discovered ${ageDays} days ago` :
       `In pipeline ${ageDays} days — time-sensitive`)
    : 'Recency unknown';

  // ── 2. Pull Brain Layer 3 episodes (similar wins) ───────────────────────
  let episodes = [];
  try {
    const brain = require('./collectiveBrain');
    episodes = await brain.getSimilarEpisodes({
      market:      lead.state ? undefined : undefined,   // broad match — ERP is more useful
      erpContext:  lead.erp_type || undefined,
      outcomeType: 'replied',
      minScore:    0.5,
      limit:       3,
    });
    sourcesUsed.episodes = episodes.length;
  } catch (brainErr) {
    console.warn(`[DossierGen] Brain Layer 3 unavailable for lead ${leadId}:`, brainErr.message);
  }

  // ── 3. Pull Brain Layer 4 KB examples ──────────────────────────────────
  let kbExamples = [];
  try {
    const brain = require('./collectiveBrain');
    kbExamples = await brain.getKnowledgeExamples('outreach_email', {
      erpContext: lead.erp_type || undefined,
      limit:      2,
    });
    sourcesUsed.kb_examples = kbExamples.length;
  } catch (kbErr) {
    console.warn(`[DossierGen] Brain Layer 4 unavailable for lead ${leadId}:`, kbErr.message);
  }

  // ── 3b. Chroma RAG — semantic proof bullets ────────────────────────────
  let ragProofBullets = '';
  try {
    const chromaBrain = require('./chromaBrain');
    if (chromaBrain.isReady()) {
      const queryText = [
        `winning outreach for`,
        lead.erp_type || 'construction',
        'in',
        [lead.city, lead.state].filter(Boolean).join(', ') || 'unknown market',
        'with',
        painItems.slice(0, 3).join(', ') || 'cash flow pain',
      ].join(' ');

      const ragResults = await chromaBrain.queryRelevant(queryText, 3, {
        outcome_score_min: 0.7,
        collection: 'both',
      });

      if (ragResults.length > 0) {
        const bulletLines = ragResults.map((r, i) => {
          const meta = r.metadata || {};
          const market  = meta.market        || 'similar market';
          const erp     = meta.erp           || '';
          const score   = meta.outcome_score != null ? `${Math.round(meta.outcome_score * 100)}%` : '';
          const days    = meta.days_to_outcome ? ` in ${meta.days_to_outcome} days` : '';
          const type    = meta.outcome_type  || meta.content_type || 'outcome';
          const erpNote = erp ? ` (${erp})` : '';
          return `${i + 1}. *${market} company${erpNote}*: ${type}${days}${score ? ' — ' + score + ' confidence' : ''}`;
        });
        ragProofBullets = `\n\n### RAG: Semantically Similar Wins\n\n${bulletLines.join('\n')}\n\n*(Matched via vector similarity — anonymized)*`;
        sourcesUsed.chroma_rag = ragResults.length;
      }
    }
  } catch (ragErr) {
    console.warn(`[DossierGen] Chroma RAG unavailable for lead ${leadId}:`, ragErr.message);
  }

  // ── 4. Assemble Markdown dossier ────────────────────────────────────────
  const voiceTag  = product === 'cfo' ? 'Steve' : 'Jake';
  const ctaLink   = process.env.CALENDLY_URL || '[INSERT CALENDLY LINK]';
  const location  = [lead.city, lead.state].filter(Boolean).join(', ') || 'Unknown location';
  const score     = lead.urgency_score || 0;
  const erpLabel  = lead.erp_type && lead.erp_type !== 'unknown' ? lead.erp_type : 'Unknown ERP';
  const revenueNote = lead.revenue_range ? `  ·  Est. revenue: ${lead.revenue_range}` : '';

  // Key trigger line — pick the strongest signal
  let triggerLine = 'Identified as high-fit construction finance lead';
  if (painItems.some(p => p.includes('permit'))) {
    triggerLine = 'Active construction project (recent permit signal)';
  } else if (painItems.some(p => p.includes('contract') || p.includes('bid'))) {
    triggerLine = 'Recently awarded contract — scaling pressure imminent';
  } else if (painItems.some(p => p.includes('hire') || p.includes('Controller'))) {
    triggerLine = 'Open finance hire — high-intent buying signal';
  } else if (painItems.some(p => p.includes('ERP') || p.includes('switching'))) {
    triggerLine = 'Actively evaluating ERP options';
  } else if (painItems.some(p => p.includes('QuickBooks') || p.includes('Excel'))) {
    triggerLine = 'Still running on QuickBooks/Excel — prime Jake candidate';
  }

  // Pain narrative bullets
  const painBullets = painItems.length > 0
    ? painItems.slice(0, 5).map(p => `- **${p}**`).join('\n')
    : '- No specific signals captured — run urgency-scorer first';

  // Proof section from episodes
  let proofSection = '';
  if (episodes.length > 0) {
    const proofLines = episodes.slice(0, 2).map((ep, i) => {
      const ctx = [ep.erp_context, ep.market].filter(Boolean).join(', ') || 'similar GC';
      const days = ep.days_to_outcome ? ` in ${ep.days_to_outcome} days` : '';
      // Anonymize: no company names — just context
      return `${i + 1}. *${ctx} company*: ${ep.outcome}${days}`;
    });
    proofSection = `## Proof: Similar Wins\n\n${proofLines.join('\n')}\n`;
  } else {
    proofSection = `## Proof: Similar Wins\n\n*(No matching episodes yet — will populate as pipeline matures)*\n`;
  }

  // KB winning angles
  let kbSection = '';
  if (kbExamples.length > 0) {
    const kbLines = kbExamples.slice(0, 2).map((ex, i) => {
      const snippet = (ex.content || '').slice(0, 200).replace(/\n/g, ' ');
      return `${i + 1}. **${ex.title || 'Approved angle'}** *(${ex.source_agent})*\n   > ${snippet}${ex.content.length > 200 ? '...' : ''}`;
    });
    kbSection = `## Winning Angles from Knowledge Base\n\n${kbLines.join('\n\n')}\n`;
  }

  // CTA — product-specific
  const ctaText = product === 'cfo'
    ? `Book a 20-minute **CFO Diagnostic** → ${ctaLink}\nWe'll show you exactly where your current system is leaking cash.`
    : `Book a 20-minute **Jake Demo** → ${ctaLink}\nWe'll map your exact pain to a concrete fix in the first call.`;

  // Signature block — product-specific voice
  const signatureBlock = product === 'cfo'
    ? `*— Steve Pilcher, CFO · Empire CashMart*\n*"We built Jake because we lived this problem."*`
    : `*— Jake (the AI CFO platform)*\n*Built by construction CFOs for construction CFOs.*`;

  const dossier = `# ${lead.company_name} — Outreach Dossier

**Urgency Score:** ${score}/100  ·  **Location:** ${location}  ·  **ERP:** ${erpLabel}${revenueNote}
**Contact:** ${lead.contact_name || 'Unknown'}${lead.contact_title ? ` · ${lead.contact_title}` : ''}
**Enrichment:** ${enrichNote}
**Timing:** ${recencyNote}

---

## Situation Snapshot

> *${triggerLine}*

${lead.pilot_fit_reason ? `**Why they fit:** ${lead.pilot_fit_reason}\n` : ''}
**Pipeline score breakdown:**
- Fit score: ${lead.pilot_fit_score || 0}/100
- Urgency score: ${score}/100
${lead.website ? `- Website: ${lead.website}` : ''}
${lead.contact_linkedin ? `- LinkedIn: ${lead.contact_linkedin}` : ''}

---

## Pain Narrative

${painBullets}

${urgencySignals.some(s => s.type === 'recency') ? `**Timing signal:** ${recencyNote}` : ''}

---

${proofSection}${ragProofBullets}
---

${kbSection ? kbSection + '\n---\n\n' : ''}## Recommended Next Step

${ctaText}

**Draft outreach angle to use:**
Lead with the strongest pain signal — *${painItems[0] || 'construction finance complexity'}* —
then reference a specific number (AR days, cost overrun %, close timeline).
Keep email under 120 words. No pitch. One question at the end.

---

*Dossier generated: ${new Date().toISOString().slice(0, 19).replace('T', ' ')} UTC*
*Sources: ${sourcesUsed.urgency_signals} urgency signals · ${sourcesUsed.episodes} brain episodes · ${sourcesUsed.kb_examples} KB examples${sourcesUsed.chroma_rag ? ' · ' + sourcesUsed.chroma_rag + ' Chroma RAG matches' : ''}*

${signatureBlock}
`;

  // ── 5. Persist to DB ────────────────────────────────────────────────────
  const currentVersion = lead.dossier_version || 0;
  run(
    `UPDATE cfo_leads
     SET dossier=?, dossier_generated_at=datetime('now'), dossier_version=?, updated_at=datetime('now')
     WHERE id=?`,
    [dossier, currentVersion + 1, leadId]
  );

  console.log(`[DossierGen] ✅ Jake lead ${leadId} (${lead.company_name}) — ${dossier.length} chars | sources: ${JSON.stringify(sourcesUsed)}${sourcesUsed.chroma_rag ? ' [Chroma ✅]' : ''}`);

  return { success: true, dossier, length: dossier.length, sourcesUsed };
}

// ─────────────────────────────────────────────────────────────────────────────
// HOA ENGAGEMENT DOSSIER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a dossier for one lg_engagement_queue row.
 * @param {number} engagementId
 * @returns {Promise<{success:boolean, dossier:string, length:number, sourcesUsed:object}>}
 */
async function generateEngagementDossier(engagementId) {
  const eng = get('SELECT * FROM lg_engagement_queue WHERE id = ?', [engagementId]);
  if (!eng) throw new Error(`Engagement ${engagementId} not found`);

  const sourcesUsed = { episodes: 0, kb_examples: 0, urgency_signals: 0 };

  // ── 1. Parse urgency signals ─────────────────────────────────────────────
  let urgencySignals = [];
  try { urgencySignals = JSON.parse(eng.urgency_signals || '[]'); } catch {}
  sourcesUsed.urgency_signals = urgencySignals.length;

  const hoaPainItems = [];
  for (const sig of urgencySignals) {
    if (sig.type === 'hoa_pain_signals' && Array.isArray(sig.items)) {
      hoaPainItems.push(...sig.items.map(humanizeSignal));
    }
  }

  const postAge = eng.post_age_hours || 0;
  const ageNote = postAge <= 24  ? 'Posted today — respond fast'
                : postAge <= 72  ? `Posted ${postAge}h ago — still fresh`
                : postAge <= 168 ? `Posted ${Math.round(postAge / 24)} days ago`
                : `Post is ${Math.round(postAge / 24)} days old`;

  // ── 2. Brain episodes ────────────────────────────────────────────────────
  let episodes = [];
  try {
    const brain = require('./collectiveBrain');
    episodes = await brain.getSimilarEpisodes({ outcomeType: 'replied', minScore: 0.5, limit: 3 });
    sourcesUsed.episodes = episodes.length;
  } catch {}

  // ── 3. KB examples ───────────────────────────────────────────────────────
  let kbExamples = [];
  try {
    const brain = require('./collectiveBrain');
    kbExamples = await brain.getKnowledgeExamples('outreach_email', { limit: 2 });
    sourcesUsed.kb_examples = kbExamples.length;
  } catch {}

  // ── 4. Assemble Markdown ──────────────────────────────────────────────────
  const ctaLink = process.env.CALENDLY_URL || '[INSERT CALENDLY LINK]';
  const score   = eng.urgency_score || 0;
  const platform = (eng.platform || 'forum').charAt(0).toUpperCase() + (eng.platform || 'forum').slice(1);

  const painBullets = hoaPainItems.length > 0
    ? hoaPainItems.slice(0, 5).map(p => `- **${p}**`).join('\n')
    : '- Run urgency-scorer to extract pain signals';

  let proofSection = '';
  if (episodes.length > 0) {
    const lines = episodes.slice(0, 2).map((ep, i) => {
      const days = ep.days_to_outcome ? ` in ${ep.days_to_outcome} days` : '';
      return `${i + 1}. *HOA board/member*: ${ep.outcome}${days}`;
    });
    proofSection = `## Proof: Similar Wins\n\n${lines.join('\n')}\n`;
  } else {
    proofSection = `## Proof: Similar Wins\n\n*(No matching episodes yet)*\n`;
  }

  const dossier = `# HOA Engagement Dossier — ${platform} Post

**Urgency Score:** ${score}/100  ·  **Platform:** ${platform}  ·  **Post age:** ${ageNote}
**Post:** ${eng.post_title ? eng.post_title.slice(0, 80) : 'Untitled'}
**Community:** ${eng.community || 'Unknown group'}
**Relevance:** ${eng.relevance_score || 0}/100

---

## Situation Snapshot

> *${eng.post_summary ? eng.post_summary.slice(0, 200) : 'No summary available'}*

---

## Pain Signals

${painBullets}

---

${proofSection}
---

## Recommended Response

${eng.draft_response ? `**Drafted response (ready to post):**\n\n${eng.draft_response}\n` : '*(No draft yet — run outreach drafter)*'}

**After engagement:**
If they reply positively → DM with funding consult offer → ${ctaLink}

---

*Dossier generated: ${new Date().toISOString().slice(0, 19).replace('T', ' ')} UTC*
*Sources: ${sourcesUsed.urgency_signals} urgency signals · ${sourcesUsed.episodes} brain episodes · ${sourcesUsed.kb_examples} KB examples*

*— HOA Project Funding Team*
*"We've helped hundreds of boards avoid special assessments."*
`;

  // ── 5. Persist ───────────────────────────────────────────────────────────
  const currentVersion = eng.dossier_version || 0;
  run(
    `UPDATE lg_engagement_queue
     SET dossier=?, dossier_generated_at=datetime('now'), dossier_version=?, updated_at=datetime('now')
     WHERE id=?`,
    [dossier, currentVersion + 1, engagementId]
  );

  console.log(`[DossierGen] ✅ HOA engagement ${engagementId} — ${dossier.length} chars`);
  return { success: true, dossier, length: dossier.length, sourcesUsed };
}

// ─────────────────────────────────────────────────────────────────────────────
// BATCH RUNNER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate dossiers for a batch of leads, rate-limited to 20/min.
 * Prioritizes leads with high urgency_score and no existing dossier.
 *
 * @param {'jake'|'cfo'|'hoa'|'both'} [product='both']
 * @param {number} [limit=50]
 * @returns {Promise<{generated:number, skipped:number, errors:number, rateLimited:number, results:object[]}>}
 */
async function generateDossierForBatch(product = 'both', limit = 50) {
  const results = [];
  let generated   = 0;
  let skipped     = 0;
  let errors      = 0;
  let rateLimited = 0;

  // ── Jake + CFO leads ───────────────────────────────────────────────────
  if (product === 'jake' || product === 'cfo' || product === 'both') {
    const agentFilter = (product === 'jake' || product === 'cfo')
      ? ' AND source_agent = ?' : '';
    const agentParam  = (product === 'jake' || product === 'cfo') ? [product] : [];

    const jakeCfoLimit = product === 'both' ? Math.ceil(limit * 0.7) : limit;

    const leads = all(
      `SELECT id, company_name, urgency_score, source_agent
       FROM cfo_leads
       WHERE status NOT IN ('unsubscribed', 'bounced', 'bad_contact')
         AND (dossier_generated_at IS NULL OR DATE(dossier_generated_at) <= DATE('now', '-7 days'))
         ${agentFilter}
       ORDER BY urgency_score DESC, pilot_fit_score DESC
       LIMIT ?`,
      [...agentParam, jakeCfoLimit]
    );

    for (const lead of leads) {
      if (!checkRateLimit()) {
        rateLimited++;
        continue;
      }
      try {
        const productKey = lead.source_agent === 'cfo' ? 'cfo' : 'jake';
        const result = await generateDossier(lead.id, productKey);
        results.push({ type: 'cfo_lead', id: lead.id, company: lead.company_name, ...result });
        generated++;
      } catch (err) {
        console.error(`[DossierGen] Error for lead ${lead.id}:`, err.message);
        notifyError('cfo_lead', lead.id, lead.company_name, err.message);
        errors++;
      }
    }
  }

  // ── HOA engagements ────────────────────────────────────────────────────
  if (product === 'hoa' || product === 'both') {
    const hoaLimit = product === 'both' ? Math.floor(limit * 0.3) : limit;

    const engagements = all(
      `SELECT id, post_title, urgency_score
       FROM lg_engagement_queue
       WHERE status IN ('pending_review', 'approved')
         AND (dossier_generated_at IS NULL OR DATE(dossier_generated_at) <= DATE('now', '-3 days'))
       ORDER BY urgency_score DESC, relevance_score DESC
       LIMIT ?`,
      [hoaLimit]
    );

    for (const eng of engagements) {
      if (!checkRateLimit()) {
        rateLimited++;
        continue;
      }
      try {
        const result = await generateEngagementDossier(eng.id);
        results.push({ type: 'hoa_engagement', id: eng.id, title: eng.post_title, ...result });
        generated++;
      } catch (err) {
        console.error(`[DossierGen] Error for engagement ${eng.id}:`, err.message);
        notifyError('hoa_engagement', eng.id, eng.post_title, err.message);
        errors++;
      }
    }
  }

  const summary = [
    `Dossier Generator: ${generated} generated, ${skipped} skipped, ${errors} errors${rateLimited > 0 ? `, ${rateLimited} rate-limited` : ''}`,
    results.slice(0, 5).map(r => `  ${r.company || r.title || r.id} — ${r.length} chars`).join('\n'),
  ].filter(Boolean).join('\n');

  return { generated, skipped, errors, rateLimited, results, summary };
}

// ── Non-blocking Discord error notification ──────────────────────────────
function notifyError(entityType, entityId, entityName, errorMsg) {
  try {
    const discord = require('./discordNotifier');
    discord.postWebhook({
      embeds: [{
        title: '⚠️ Dossier Generator Error',
        color: 0xe74c3c,
        fields: [
          { name: 'Entity', value: `${entityType} #${entityId} — ${entityName || 'unknown'}`, inline: false },
          { name: 'Error', value: errorMsg.slice(0, 256), inline: false },
        ],
        timestamp: new Date().toISOString(),
        footer: { text: 'ClawOps · Lead Dossier Generator' },
      }],
    }).catch(e => console.warn('[DossierGen] notify failed:', e.message));
  } catch {}
}

module.exports = {
  generateDossier,
  generateEngagementDossier,
  generateDossierForBatch,
};
