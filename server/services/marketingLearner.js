/**
 * @file marketingLearner.js
 * @description Self-recursive learning engine for the marketing fleet.
 *
 * THE LOOP:
 *   Write content → Publish → Distribute → Measure engagement/leads
 *   → Score each piece → Extract patterns → Feed back to writers → Write BETTER content
 *
 * This service runs on a schedule (weekly, Sunday night) to:
 *   1. Score all content pieces from the past week
 *   2. Score outreach variants (A/B test results)
 *   3. Extract winning/losing patterns
 *   4. Store learnings in marketing_learnings table
 *   5. Generate next month's content calendar weighted toward winners
 *   6. Build "writer briefing" injected into content agent prompts
 *
 * EXPORTS:
 *   scoreAllContent()           — Score all unscored content pieces
 *   extractLearnings()          — Mine patterns from scored content
 *   generateWriterBriefing(agent) — Build brain context for a content writer
 *   generateNextCalendarMonth() — Auto-generate weighted calendar entries
 *   runLearningCycle()          — Full cycle: score → learn → brief → calendar
 */

const { get, all, run } = require('../db/connection');

// ─── 1. Content Scoring ──────────────────────────────────────────────────────

/**
 * Score all unscored published content pieces.
 * Score = weighted sum of: leads generated, email clicks, social engagement, page views.
 */
function scoreAllContent() {
  const unscored = all(`
    SELECT id, title, pillar, channel, target_keyword, calendar_id, source_agent, created_at
    FROM cfo_content_pieces
    WHERE status = 'published' AND (scored_at IS NULL OR scored_at < datetime('now', '-7 days'))
  `) || [];

  let scored = 0;
  for (const piece of unscored) {
    const score = scoreContentPiece(piece.id);
    if (score !== null) scored++;
  }

  return { scored, total: unscored.length };
}

/**
 * Score a single content piece based on downstream metrics.
 */
function scoreContentPiece(contentId) {
  const piece = get('SELECT * FROM cfo_content_pieces WHERE id = ?', [contentId]);
  if (!piece) return null;

  // Count leads generated with this content as source
  // (leads where notes mention this title, or revenue events link to it)
  // Count inbound leads whose notes mention words from this post's title
  const titleWords = (piece.title || '').toLowerCase().split(/\s+/).filter(w => w.length > 4).slice(0, 3);
  let leadsGenerated = 0;
  for (const word of titleWords) {
    try {
      const match = get("SELECT COUNT(*) as n FROM cfo_leads WHERE source LIKE 'inbound_%' AND LOWER(notes) LIKE ?", [`%${word}%`]);
      leadsGenerated = Math.max(leadsGenerated, match?.n || 0);
    } catch {}
  }

  // Count engagement events linked to this content (via outreach sequences that reference it)
  const engagementEvents = get(`
    SELECT COUNT(*) as n FROM engagement_events
    WHERE email_subject LIKE ?
  `, [`%${(piece.title || '').slice(0, 30)}%`]);
  const emailClicks = engagementEvents?.n || 0;

  // Count social posts derived from this content
  const socialPosts = get(`
    SELECT COUNT(*) as n FROM audit_log
    WHERE action IN ('linkedin_post', 'twitter_post', 'facebook_post')
      AND details LIKE ?
  `, [`%${(piece.title || '').slice(0, 30)}%`]);
  const socialShares = socialPosts?.n || 0;

  // Newsletter broadcast clicks
  const broadcastClicks = get(`
    SELECT COALESCE(click_count, 0) as clicks FROM newsletter_broadcasts
    WHERE subject LIKE ?
  `, [`%${(piece.title || '').slice(0, 40)}%`]);
  const newsletterClicks = broadcastClicks?.clicks || 0;

  // Composite score (0-100)
  // Heavily weighted toward lead generation (that's what matters)
  const score = Math.min(100, Math.round(
    leadsGenerated * 30 +    // Each lead = 30 points (capped)
    emailClicks * 5 +        // Each click = 5 points
    socialShares * 10 +      // Each social share = 10 points
    newsletterClicks * 3     // Each newsletter click = 3 points
  ));

  // Update the content piece
  run(`UPDATE cfo_content_pieces SET
    performance_score = ?, leads_generated = ?, email_clicks = ?,
    social_shares = ?, newsletter_clicks = ?, scored_at = datetime('now')
    WHERE id = ?`,
    [score, leadsGenerated, emailClicks, socialShares, newsletterClicks, contentId]);

  // Update calendar entry if linked
  if (piece.calendar_id) {
    run(`UPDATE content_calendar SET performance_score = ?, leads_generated = ?, scored_at = datetime('now')
      WHERE id = ?`, [score, leadsGenerated, piece.calendar_id]);
  }

  return { contentId, score, leadsGenerated, emailClicks, socialShares, newsletterClicks };
}

// ─── 2. Pattern Extraction ───────────────────────────────────────────────────

/**
 * Extract learnings from scored content and outreach variants.
 * Mines patterns: which topics, keywords, pillars, angles, tones work.
 */
function extractLearnings() {
  const learnings = [];

  // ── Topic winners/losers ──
  const topPosts = all(`
    SELECT title, pillar, target_keyword, performance_score, leads_generated, source_agent
    FROM cfo_content_pieces
    WHERE performance_score IS NOT NULL AND status = 'published'
    ORDER BY performance_score DESC LIMIT 5
  `) || [];

  const bottomPosts = all(`
    SELECT title, pillar, target_keyword, performance_score, source_agent
    FROM cfo_content_pieces
    WHERE performance_score IS NOT NULL AND status = 'published' AND performance_score = 0
    ORDER BY created_at DESC LIMIT 5
  `) || [];

  if (topPosts.length > 0 && topPosts[0].performance_score > 0) {
    const best = topPosts[0];
    storeLearning('topic_winner', best.source_agent === 'jake' ? 'jake' : 'hoa',
      `Best performing topic: "${best.title}" (score: ${best.performance_score}, leads: ${best.leads_generated || 0}). Keyword: ${best.target_keyword || 'none'}. Pillar: ${best.pillar || 'unknown'}.`,
      { top5: topPosts.map(p => ({ title: p.title, score: p.performance_score, keyword: p.target_keyword, pillar: p.pillar })) },
      0.8, 'marketing-learner');
  }

  if (bottomPosts.length >= 3) {
    storeLearning('topic_loser', 'both',
      `${bottomPosts.length} posts scored 0 (no leads, no engagement). Topics to avoid or rewrite: ${bottomPosts.map(p => `"${p.title}"`).join(', ')}`,
      { losers: bottomPosts.map(p => ({ title: p.title, pillar: p.pillar, keyword: p.target_keyword })) },
      0.6, 'marketing-learner');
  }

  // ── Pillar performance ──
  const pillarStats = all(`
    SELECT pillar, COUNT(*) as posts, AVG(performance_score) as avg_score,
      SUM(leads_generated) as total_leads
    FROM cfo_content_pieces
    WHERE performance_score IS NOT NULL AND pillar IS NOT NULL
    GROUP BY pillar
    ORDER BY avg_score DESC
  `) || [];

  if (pillarStats.length >= 2) {
    const best = pillarStats[0];
    const worst = pillarStats[pillarStats.length - 1];
    storeLearning('pillar_performance', 'both',
      `Best pillar: "${best.pillar}" (avg score: ${Math.round(best.avg_score)}, ${best.total_leads} leads from ${best.posts} posts). Worst: "${worst.pillar}" (avg score: ${Math.round(worst.avg_score)}).`,
      { pillars: pillarStats },
      0.7, 'marketing-learner');
  }

  // ── Outreach angle performance ──
  const angleStats = all(`
    SELECT angle_type as variant, COUNT(*) as sent,
      SUM(replied) as replies, SUM(converted) as conversions,
      ROUND(SUM(replied) * 100.0 / COUNT(*), 1) as reply_rate,
      ROUND(SUM(converted) * 100.0 / NULLIF(COUNT(*), 0), 1) as conversion_rate
    FROM outreach_variants
    WHERE angle_type IS NOT NULL AND sent_at IS NOT NULL
    GROUP BY angle_type
    HAVING sent >= 5
    ORDER BY conversion_rate DESC
  `) || [];

  if (angleStats.length >= 2) {
    const best = angleStats[0];
    const worst = angleStats[angleStats.length - 1];
    if (best.conversion_rate > 0) {
      storeLearning('angle_winner', 'both',
        `Best outreach angle: "${best.variant}" (${best.conversion_rate}% conversion, ${best.reply_rate}% reply rate from ${best.sent} sent). Worst: "${worst.variant}" (${worst.conversion_rate}% conversion).`,
        { angles: angleStats },
        0.85, 'marketing-learner');
    }
  }

  // ── Tone performance ──
  const toneStats = all(`
    SELECT tone as variant, COUNT(*) as sent,
      SUM(replied) as replies,
      ROUND(SUM(replied) * 100.0 / COUNT(*), 1) as reply_rate
    FROM outreach_variants
    WHERE tone IS NOT NULL AND sent_at IS NOT NULL
    GROUP BY tone
    HAVING sent >= 5
    ORDER BY reply_rate DESC
  `) || [];

  if (toneStats.length >= 2 && toneStats[0].reply_rate > 0) {
    storeLearning('angle_winner', 'both',
      `Best tone: "${toneStats[0].variant}" (${toneStats[0].reply_rate}% reply rate). Worst: "${toneStats[toneStats.length-1].variant}" (${toneStats[toneStats.length-1].reply_rate}%).`,
      { tones: toneStats },
      0.7, 'marketing-learner');
  }

  // ── Market insights ──
  const marketStats = all(`
    SELECT market, COUNT(*) as episodes,
      AVG(outcome_score) as avg_score,
      SUM(CASE WHEN outcome_score >= 0.7 THEN 1 ELSE 0 END) as wins
    FROM brain_fallback_episodes
    WHERE market IS NOT NULL AND market != ''
    GROUP BY market
    HAVING episodes >= 3
    ORDER BY avg_score DESC
  `) || [];

  if (marketStats.length >= 2) {
    const hot = marketStats.filter(m => m.avg_score >= 0.5);
    const cold = marketStats.filter(m => m.avg_score < 0.3);
    if (hot.length > 0) {
      storeLearning('market_insight', 'both',
        `Hot markets: ${hot.map(m => `${m.market} (${m.wins} wins, ${Math.round(m.avg_score*100)}% avg)`).join(', ')}. ${cold.length > 0 ? `Cold markets: ${cold.map(m => m.market).join(', ')}.` : ''}`,
        { hot, cold },
        0.75, 'marketing-learner');
    }
  }

  return { learnings_stored: learnings.length, pillarStats, angleStats, marketStats };
}

function storeLearning(type, product, summary, data, confidence, agent) {
  // Check for duplicate recent learning
  const existing = get(`
    SELECT id FROM marketing_learnings
    WHERE learning_type = ? AND product = ? AND created_at >= datetime('now', '-7 days')
      AND summary = ?
  `, [type, product, summary]);
  if (existing) return;

  run(`INSERT INTO marketing_learnings (learning_type, product, summary, data, confidence, source_agent)
    VALUES (?, ?, ?, ?, ?, ?)`,
    [type, product, summary, JSON.stringify(data), confidence, agent]);
}

// ─── 3. Writer Briefing ──────────────────────────────────────────────────────

/**
 * Generate a brain briefing for a content writer agent.
 * Injected into the agent's prompt before it writes.
 *
 * Returns a text block (not JSON) — designed to be prepended to the agent message.
 */
function generateWriterBriefing(agentName) {
  const product = agentName.includes('hoa') ? 'hoa' : 'jake';
  const blocks = [];

  // ── Next topic from calendar ──
  try {
    const seo = require('./seoGenerator');
    const nextEntry = seo.getNextCalendarEntry(agentName);
    if (nextEntry) {
      blocks.push(`📋 ASSIGNED TOPIC (from content calendar):
Topic: ${nextEntry.topic}
Target Keyword: ${nextEntry.target_keyword || 'none assigned'}
Secondary Keywords: ${nextEntry.secondary_keywords || 'none'}
Content Pillar: ${nextEntry.pillar || 'general'}
Search Intent: ${nextEntry.search_intent || 'informational'}
${nextEntry.notes ? `Notes: ${nextEntry.notes}` : ''}

IMPORTANT: Write about THIS topic. Target the keyword naturally in your H1, first paragraph, and meta description. Include a CTA linking to the contact form.`);
    }
  } catch {}

  // ── Top performing content ──
  const topPosts = all(`
    SELECT title, pillar, target_keyword, performance_score, leads_generated
    FROM cfo_content_pieces
    WHERE performance_score > 0 AND source_agent LIKE ?
    ORDER BY performance_score DESC LIMIT 3
  `, [`%${product}%`]) || [];

  if (topPosts.length > 0) {
    blocks.push(`🏆 YOUR TOP PERFORMING CONTENT (write more like these):
${topPosts.map((p, i) => `  ${i+1}. "${p.title}" — Score: ${p.performance_score}, Leads: ${p.leads_generated}, Keyword: ${p.target_keyword || 'none'}`).join('\n')}`);
  }

  // ── Worst performing (avoid) ──
  const worstPosts = all(`
    SELECT title, pillar, target_keyword
    FROM cfo_content_pieces
    WHERE performance_score = 0 AND source_agent LIKE ? AND scored_at IS NOT NULL
    ORDER BY created_at DESC LIMIT 3
  `, [`%${product}%`]) || [];

  if (worstPosts.length > 0) {
    blocks.push(`⚠️ CONTENT THAT DIDN'T PERFORM (avoid similar topics):
${worstPosts.map((p, i) => `  ${i+1}. "${p.title}" — 0 leads, 0 engagement`).join('\n')}`);
  }

  // ── Recent learnings ──
  const learnings = all(`
    SELECT summary FROM marketing_learnings
    WHERE (product = ? OR product = 'both') AND confidence >= 0.6
    ORDER BY created_at DESC LIMIT 5
  `, [product]) || [];

  if (learnings.length > 0) {
    blocks.push(`🧠 WHAT THE SYSTEM HAS LEARNED:
${learnings.map(l => `  • ${l.summary}`).join('\n')}`);
  }

  // ── Winning outreach angles (content should support these) ──
  const angles = all(`
    SELECT angle_type, ROUND(SUM(converted) * 100.0 / COUNT(*), 1) as conv_rate
    FROM outreach_variants
    WHERE angle_type IS NOT NULL AND sent_at IS NOT NULL
    GROUP BY angle_type HAVING COUNT(*) >= 5
    ORDER BY conv_rate DESC LIMIT 3
  `) || [];

  if (angles.length > 0 && angles[0].conv_rate > 0) {
    blocks.push(`📊 OUTREACH ANGLES THAT CONVERT (align content with these):
${angles.map(a => `  • "${a.angle_type}" — ${a.conv_rate}% conversion`).join('\n')}`);
  }

  if (blocks.length === 0) {
    return ''; // No learnings yet — agent writes freely
  }

  return `\n--- MARKETING BRAIN BRIEFING ---\n${blocks.join('\n\n')}\n--- END BRIEFING ---\n\n`;
}

// ─── 4. Self-Improving Content Calendar ──────────────────────────────────────

/**
 * Generate next month's content calendar entries, weighted toward winning topics.
 * Reads performance data and creates 12 new entries (4 weeks × 3/week).
 */
function generateNextCalendarMonth() {
  // Find the last scheduled date
  const lastEntry = get('SELECT MAX(scheduled_date) as last_date FROM content_calendar');
  const startDate = lastEntry?.last_date
    ? new Date(new Date(lastEntry.last_date).getTime() + 7 * 24 * 60 * 60 * 1000)
    : new Date();

  // Get winning pillars
  const pillarRanking = all(`
    SELECT pillar, AVG(performance_score) as avg_score, SUM(leads_generated) as total_leads
    FROM cfo_content_pieces
    WHERE performance_score IS NOT NULL AND pillar IS NOT NULL
    GROUP BY pillar
    ORDER BY avg_score DESC
  `) || [];

  // Get winning keywords
  const keywordRanking = all(`
    SELECT target_keyword, performance_score, leads_generated
    FROM cfo_content_pieces
    WHERE performance_score > 0 AND target_keyword IS NOT NULL
    ORDER BY performance_score DESC LIMIT 10
  `) || [];

  // Weight: 60% winning pillars, 20% new exploration, 20% seasonal/timely
  const winningPillars = pillarRanking.filter(p => p.avg_score > 0).map(p => p.pillar);
  const allPillars = {
    hoa: ['reserve_fund', 'special_assessment', 'capital_planning', 'board_governance', 'compliance'],
    jake: ['cash_flow', 'cost_control', 'trust_envelope', 'pilot_proof', 'erp_migration'],
  };

  let created = 0;
  for (let week = 0; week < 4; week++) {
    const monday = new Date(startDate);
    monday.setDate(startDate.getDate() + (week * 7));
    const tuesday = new Date(monday);
    tuesday.setDate(monday.getDate() + 1);

    const fmt = (d) => d.toISOString().slice(0, 10);

    // Pick pillars — weight toward winners
    const hoaPillar = winningPillars.find(p => allPillars.hoa.includes(p))
      || allPillars.hoa[week % allPillars.hoa.length];
    const jakePillar = winningPillars.find(p => allPillars.jake.includes(p))
      || allPillars.jake[week % allPillars.jake.length];

    // Check if entry exists
    const existing1 = get('SELECT id FROM content_calendar WHERE scheduled_date = ? AND product = ?', [fmt(monday), 'hoa']);
    if (!existing1) {
      run(`INSERT INTO content_calendar (scheduled_date, product, channel, pillar, topic, assigned_agent, notes)
        VALUES (?, 'hoa', 'blog', ?, '[AUTO-GENERATED] Write about ${hoaPillar} — this pillar has performed well. Use winning patterns from briefing.', 'hoa-content-writer', 'Auto-generated by learning engine. Agent should check briefing for keyword and angle guidance.')`,
        [fmt(monday), hoaPillar]);
      created++;
    }

    const existing2 = get('SELECT id FROM content_calendar WHERE scheduled_date = ? AND product = ?', [fmt(tuesday), 'jake']);
    if (!existing2) {
      run(`INSERT INTO content_calendar (scheduled_date, product, channel, pillar, topic, assigned_agent, notes)
        VALUES (?, 'jake', 'blog', ?, '[AUTO-GENERATED] Write about ${jakePillar} — this pillar has performed well. Use winning patterns from briefing.', 'jake-content-engine', 'Auto-generated by learning engine. Agent should check briefing for keyword and angle guidance.')`,
        [fmt(tuesday), jakePillar]);
      created++;
    }
  }

  // Store a learning about calendar generation
  storeLearning('format_insight', 'both',
    `Auto-generated ${created} calendar entries for next month. Winning pillars prioritized: ${winningPillars.slice(0, 3).join(', ') || 'none yet (insufficient data)'}`,
    { created, winningPillars, pillarRanking },
    0.5, 'marketing-learner');

  return { created, winningPillars };
}

// ─── 5. Full Learning Cycle ──────────────────────────────────────────────────

/**
 * Run the complete learning cycle. Call weekly (e.g., Sunday 11 PM).
 *
 * Steps:
 *   1. Score all published content
 *   2. Extract patterns (winners, losers, angles, markets)
 *   3. Store learnings in marketing_learnings table
 *   4. Generate next month's calendar if needed
 *   5. Record brain episode for the cycle itself
 */
async function runLearningCycle() {
  const startTime = Date.now();
  console.log('[MarketingLearner] Starting self-recursive learning cycle...');

  // Step 1: Score content
  let scoring = { scored: 0, total: 0 };
  try {
    scoring = scoreAllContent();
    console.log(`[MarketingLearner] Scored ${scoring.scored}/${scoring.total} content pieces`);
  } catch (err) {
    console.error('[MarketingLearner] Content scoring failed:', err.message);
  }

  // Step 2: Extract learnings
  let patterns = { learnings_stored: 0, pillarStats: [], angleStats: [], marketStats: [] };
  try {
    patterns = extractLearnings();
    console.log(`[MarketingLearner] Extracted patterns — ${patterns.pillarStats.length} pillars, ${patterns.angleStats.length} angles, ${patterns.marketStats.length} markets`);
  } catch (err) {
    console.error('[MarketingLearner] Pattern extraction failed:', err.message);
  }

  // Step 3: Check if calendar needs extending
  let daysLeft = 0;
  try {
    const lastDate = get('SELECT MAX(scheduled_date) as d FROM content_calendar');
    daysLeft = lastDate?.d
      ? Math.floor((new Date(lastDate.d) - new Date()) / (1000 * 60 * 60 * 24))
      : 0;
  } catch {}

  let calendarResult = { created: 0 };
  if (daysLeft < 21) {
    calendarResult = generateNextCalendarMonth();
    console.log(`[MarketingLearner] Calendar extended: ${calendarResult.created} new entries (${daysLeft} days remaining was below 21-day threshold)`);
  }

  // Step 4: Brain episode for this cycle
  try {
    const brain = require('./collectiveBrain');
    brain.recordEpisode('marketing-learner', {
      market: 'all',
      actionTaken: `Weekly learning cycle: scored ${scoring.scored} content, extracted ${patterns.learnings_stored} patterns, generated ${calendarResult.created} calendar entries`,
      outcome: `Top pillar: ${patterns.pillarStats[0]?.pillar || 'unknown'}. Top angle: ${patterns.angleStats[0]?.variant || 'unknown'}.`,
      outcomeType: 'learning',
      outcomeScore: 0.8,
    });
  } catch {}

  // Step 5: Discord summary
  try {
    const discord = require('./discordNotifier');
    const topPost = get('SELECT title, performance_score FROM cfo_content_pieces WHERE performance_score IS NOT NULL ORDER BY performance_score DESC LIMIT 1');
    const totalLearnings = get('SELECT COUNT(*) as n FROM marketing_learnings');

    await discord.sendEmbed({
      title: 'Marketing Learning Cycle Complete',
      color: 0x8b5cf6,
      fields: [
        { name: 'Content Scored', value: `${scoring.scored} pieces`, inline: true },
        { name: 'Patterns Found', value: `${patterns.learnings_stored}`, inline: true },
        { name: 'Calendar Generated', value: `${calendarResult.created} entries`, inline: true },
        { name: 'Top Post', value: topPost ? `"${topPost.title}" (score: ${topPost.performance_score})` : 'No data yet', inline: false },
        { name: 'Total Learnings', value: `${totalLearnings?.n || 0} stored`, inline: true },
      ],
      timestamp: new Date().toISOString(),
      footer: { text: `Learning cycle took ${Math.round((Date.now() - startTime) / 1000)}s` },
    });
  } catch {}

  const durationMs = Date.now() - startTime;
  console.log(`[MarketingLearner] Learning cycle complete in ${durationMs}ms`);

  return {
    scoring,
    patterns,
    calendarResult,
    durationMs,
  };
}

// ─── 6. Outreach Learning (for reply classifier feedback) ────────────────────

/**
 * After every reply classification, check if we should update learnings.
 * Called by the reply classifier handler (or scheduled batch).
 */
function learnFromReply(leadId, classification, sequenceId) {
  // Get the outreach variant data
  const variant = get('SELECT * FROM outreach_variants WHERE sequence_id = ?', [sequenceId]);
  if (!variant) return;

  // If this is a conversion, record what worked
  if (classification === 'INTERESTED' && variant.angle_type) {
    const lead = get('SELECT city, state, erp_type, contact_title FROM cfo_leads WHERE id = ?', [leadId]);
    const market = lead ? [lead.city, lead.state].filter(Boolean).join(', ') : 'unknown';

    storeLearning('angle_winner', 'both',
      `Angle "${variant.angle_type}" converted lead in ${market} (${lead?.erp_type || 'unknown ERP'}, ${lead?.contact_title || 'unknown title'}). Subject: "${variant.subject_line}". Tone: ${variant.tone || 'unknown'}.`,
      { angle: variant.angle_type, tone: variant.tone, market, erp: lead?.erp_type, title: lead?.contact_title, subject: variant.subject_line },
      0.9, 'marketing-learner');
  }
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  scoreAllContent,
  scoreContentPiece,
  extractLearnings,
  generateWriterBriefing,
  generateNextCalendarMonth,
  runLearningCycle,
  learnFromReply,
};
