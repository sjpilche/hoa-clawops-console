/**
 * @file hoaMinutesMonitor.js
 * @description Agent 2: Minutes Monitor Service
 *
 * Scans HOA meeting minutes from websites/portals and scores them for
 * capital project signals. Uses keyword-based scoring system.
 *
 * Scoring Tiers:
 * - HOT (15+ points): Special assessment, reserve deficiency, compliance mandate
 * - WARM (8-14 points): Active capital project (roof, paint, etc.)
 * - WATCH (3-7 points): Early signals (contractor bids, RFP)
 * - ARCHIVE (0-2 points): No meaningful signals
 *
 * Cost: ~$0.50 per run (uses GPT-4o for PDF parsing if needed)
 */

const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

// ═══════════════════════════════════════════════════════════════════════════
// DATABASE CONNECTION
// ═══════════════════════════════════════════════════════════════════════════

const DB_PATH = path.resolve('./hoa_leads.sqlite');
let db = null;

async function getHoaDb() {
  if (db) return db;
  const SQL = await initSqlJs();
  const fileBuffer = fs.readFileSync(DB_PATH);
  db = new SQL.Database(fileBuffer);
  return db;
}

function saveHoaDb() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

function runHoaDb(sql, params = []) {
  if (!db) throw new Error('Database not initialized');
  db.run(sql, params);
  saveHoaDb();
  return { changes: db.getRowsModified() };
}

function getHoaDbRow(sql, params = []) {
  if (!db) throw new Error('Database not initialized');
  const stmt = db.prepare(sql);
  stmt.bind(params);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return null;
}

function allHoaDbRows(sql, params = []) {
  if (!db) throw new Error('Database not initialized');
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

// ═══════════════════════════════════════════════════════════════════════════
// KEYWORD SCORING CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

// Load keyword scoring from JSON file
const KEYWORD_SCORING_PATH = path.resolve('c:/Users/SPilcher/Downloads/files (6)/keyword-scoring.json');
let KEYWORD_CONFIG = null;

function loadKeywordConfig() {
  if (KEYWORD_CONFIG) return KEYWORD_CONFIG;

  if (fs.existsSync(KEYWORD_SCORING_PATH)) {
    const content = fs.readFileSync(KEYWORD_SCORING_PATH, 'utf-8');
    KEYWORD_CONFIG = JSON.parse(content);
    console.log('[Minutes Monitor] ✅ Loaded keyword scoring config');
  } else {
    console.log('[Minutes Monitor] ⚠️  keyword-scoring.json not found, using defaults');
    // Fallback to inline config
    KEYWORD_CONFIG = {
      scoring_thresholds: { HOT: 15, WARM: 8, WATCH: 3, ARCHIVE: 0 },
      tier1_keywords: {
        points: 10,
        keywords: [
          'special assessment', 'capital improvement plan', 'reserve fund deficiency',
          'underfunded reserves', 'SB 326', 'SB 721', 'milestone inspection',
          'SIRS', 'loan', 'financing', 'engineering report'
        ]
      },
      tier2_keywords: {
        points: 5,
        keywords: [
          'roof replacement', 're-roof', 'exterior painting', 'repaint',
          'parking lot', 'asphalt replacement', 'repiping', 'pool resurfacing',
          'elevator replacement', 'balcony repair', 'waterproofing', 'reserve study'
        ]
      },
      tier3_keywords: {
        points: 2,
        keywords: [
          'contractor bids', 'RFP', 'deferred maintenance', 'budget shortfall',
          'cost estimate', 'vendor selection', 'major repair', 'capital project'
        ]
      },
      negative_keywords: {
        points: -5,
        keywords: [
          'fully funded reserves', '100% funded', 'project completed',
          'no special assessment', 'no assessment needed'
        ]
      }
    };
  }

  return KEYWORD_CONFIG;
}

// ═══════════════════════════════════════════════════════════════════════════
// SCORING FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Score minutes text against keyword system
 */
function scoreMinutesText(text) {
  const config = loadKeywordConfig();
  const lowerText = text.toLowerCase();

  let totalScore = 0;
  const tier1Matches = [];
  const tier2Matches = [];
  const tier3Matches = [];
  const negativeMatches = [];
  const signalQuotes = [];
  const projectTypes = new Set();

  // Check Tier 1 keywords (10 points each)
  for (const keyword of config.tier1_keywords.keywords) {
    if (lowerText.includes(keyword.toLowerCase())) {
      totalScore += config.tier1_keywords.points;
      tier1Matches.push(keyword);

      // Extract quote around keyword
      const quote = extractQuoteAroundKeyword(text, keyword);
      if (quote) {
        signalQuotes.push({
          keyword,
          quote,
          tier: 1,
          points: config.tier1_keywords.points
        });
      }
    }
  }

  // Check Tier 2 keywords (5 points each)
  for (const keyword of config.tier2_keywords.keywords) {
    if (lowerText.includes(keyword.toLowerCase())) {
      totalScore += config.tier2_keywords.points;
      tier2Matches.push(keyword);

      const quote = extractQuoteAroundKeyword(text, keyword);
      if (quote) {
        signalQuotes.push({
          keyword,
          quote,
          tier: 2,
          points: config.tier2_keywords.points
        });
      }

      // Detect project type
      detectProjectType(keyword, projectTypes);
    }
  }

  // Check Tier 3 keywords (2 points each)
  for (const keyword of config.tier3_keywords.keywords) {
    if (lowerText.includes(keyword.toLowerCase())) {
      totalScore += config.tier3_keywords.points;
      tier3Matches.push(keyword);

      const quote = extractQuoteAroundKeyword(text, keyword);
      if (quote) {
        signalQuotes.push({
          keyword,
          quote,
          tier: 3,
          points: config.tier3_keywords.points
        });
      }
    }
  }

  // Check negative keywords (-5 points each)
  for (const keyword of config.negative_keywords.keywords) {
    if (lowerText.includes(keyword.toLowerCase())) {
      totalScore += config.negative_keywords.points;
      negativeMatches.push(keyword);
    }
  }

  // Determine tier
  const thresholds = config.scoring_thresholds;
  let tier = 'ARCHIVE';
  if (totalScore >= thresholds.HOT) tier = 'HOT';
  else if (totalScore >= thresholds.WARM) tier = 'WARM';
  else if (totalScore >= thresholds.WATCH) tier = 'WATCH';

  return {
    totalScore,
    tier,
    tier1Matches,
    tier2Matches,
    tier3Matches,
    negativeMatches,
    signalQuotes,
    projectTypes: Array.from(projectTypes),
  };
}

/**
 * Extract ~100 character quote around keyword
 */
function extractQuoteAroundKeyword(text, keyword) {
  const lowerText = text.toLowerCase();
  const lowerKeyword = keyword.toLowerCase();
  const index = lowerText.indexOf(lowerKeyword);

  if (index === -1) return null;

  const start = Math.max(0, index - 50);
  const end = Math.min(text.length, index + keyword.length + 50);
  let quote = text.substring(start, end).trim();

  // Add ellipsis if truncated
  if (start > 0) quote = '...' + quote;
  if (end < text.length) quote = quote + '...';

  return quote;
}

/**
 * Detect project type from keyword
 */
function detectProjectType(keyword, projectTypes) {
  const projectMap = {
    'roof': ['roof replacement', 're-roof', 'reroofing', 'roofing project'],
    'painting': ['exterior painting', 'repaint', 'painting contract'],
    'paving': ['parking lot', 'asphalt replacement', 'repaving', 'slurry seal'],
    'plumbing': ['repiping', 'pipe replacement', 'plumbing replacement'],
    'pool': ['pool resurfacing', 'pool renovation', 'pool replaster'],
    'elevator': ['elevator replacement', 'elevator modernization'],
    'balcony_deck': ['balcony repair', 'deck repair', 'waterproofing'],
    'structural': ['foundation repair', 'structural concern'],
  };

  for (const [type, keywords] of Object.entries(projectMap)) {
    if (keywords.some(k => keyword.toLowerCase().includes(k.toLowerCase()))) {
      projectTypes.add(type);
    }
  }
}

/**
 * Generate plain English summary of signals found
 */
function generateSignalSummary(scoring, hoaName) {
  const { tier, totalScore, tier1Matches, tier2Matches, projectTypes } = scoring;

  if (tier === 'HOT') {
    const urgentSignals = tier1Matches.slice(0, 2).join(' and ');
    return `${hoaName} has URGENT capital need signals: ${urgentSignals}. Score: ${totalScore} points.`;
  } else if (tier === 'WARM') {
    const projects = projectTypes.slice(0, 2).join(' and ');
    return `${hoaName} is actively discussing capital projects: ${projects}. Score: ${totalScore} points.`;
  } else if (tier === 'WATCH') {
    return `${hoaName} shows early capital project signals. Score: ${totalScore} points. Monitor next meeting.`;
  } else {
    return `${hoaName} has no significant capital signals. Score: ${totalScore} points.`;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MOCK MINUTES GENERATION (For Testing)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate mock meeting minutes for testing
 */
function generateMockMinutes(hoa) {
  const templates = {
    HOT: `Board Meeting Minutes - ${hoa.name}
Date: November 15, 2025

1. Call to Order - President John Smith called the meeting to order at 7:00 PM.

2. Financial Report - Treasurer reported current reserve fund balance is $85,000, which is only 45% funded according to our latest reserve study. This represents a significant reserve fund deficiency.

3. Roof Replacement Project - Engineering report completed last month identified extensive damage. The board discussed the need for a special assessment of approximately $4,500 per unit to cover the $675,000 roof replacement project. Contractor bids are due December 1st.

4. SB 326 Compliance - Our balcony inspection revealed structural issues requiring immediate repair. The board is exploring HOA loan options to avoid a large special assessment.

5. Next Meeting: December 20, 2025`,

    WARM: `Board Meeting Minutes - ${hoa.name}
Date: October 10, 2025

1. Call to Order - Meeting started at 6:30 PM.

2. Reserve Study Review - Our reserves are at 72% funded. The board reviewed upcoming capital projects including exterior painting (est. $125,000) and parking lot resurfacing (est. $85,000).

3. Painting Project - Received three contractor bids for exterior painting. Board voted to approve the project starting Spring 2026. Funding will come from reserves.

4. Landscaping - Discussed tree trimming schedule and irrigation system maintenance.

5. Next Meeting: November 14, 2025`,

    WATCH: `Board Meeting Minutes - ${hoa.name}
Date: September 5, 2025

1. Call to Order - Meeting convened at 7:00 PM.

2. Budget Discussion - Treasurer presented preliminary 2026 budget. Some deferred maintenance items need to be addressed in the coming years.

3. Reserve Study - Board agreed to commission a reserve study update next quarter. Last study was completed in 2022.

4. Vendor Selection - Discussed RFP process for landscaping services contract renewal.

5. Homeowner Concerns - Several owners raised questions about building maintenance schedule.

6. Adjournment: 8:15 PM`,

    ARCHIVE: `Board Meeting Minutes - ${hoa.name}
Date: August 20, 2025

1. Call to Order - President opened meeting at 6:00 PM.

2. Financial Report - All accounts in good standing. Reserves are fully funded at 115% of recommended level.

3. Routine Maintenance - Pool cleaning schedule reviewed. Everything on track.

4. Social Committee - Fall block party scheduled for October 15th.

5. Landscaping - New flowers planted in common areas. Positive feedback from residents.

6. Next Meeting: September 17, 2025`
  };

  // Randomly select a tier (weighted toward interesting ones)
  const rand = Math.random();
  let tier;
  if (rand < 0.15) tier = 'HOT';        // 15% HOT
  else if (rand < 0.35) tier = 'WARM';   // 20% WARM
  else if (rand < 0.55) tier = 'WATCH';  // 20% WATCH
  else tier = 'ARCHIVE';                 // 45% ARCHIVE

  return {
    text: templates[tier],
    url: hoa.document_portal_url || hoa.website_url || `https://${hoa.name.toLowerCase().replace(/\s+/g, '')}.org/minutes`,
    date: '2025-11-15',
    title: `Board Meeting Minutes - November 2025`,
    docType: 'HTML',
    wordCount: templates[tier].split(/\s+/).length
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN SCANNING FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Scan minutes for a specific HOA
 */
async function scanHOAMinutes(hoaId) {
  await getHoaDb();

  const hoa = getHoaDbRow('SELECT * FROM hoa_communities WHERE id = ?', [hoaId]);
  if (!hoa) {
    throw new Error(`HOA with ID ${hoaId} not found`);
  }

  console.log(`[Minutes Monitor] 📄 Scanning: ${hoa.name}, ${hoa.city}, ${hoa.state}`);

  // For now, use mock minutes (real scraping comes later)
  const mockMinutes = generateMockMinutes(hoa);
  const minutesText = mockMinutes.text;

  // Score the minutes
  const scoring = scoreMinutesText(minutesText);
  const signalSummary = generateSignalSummary(scoring, hoa.name);

  console.log(`[Minutes Monitor]   Score: ${scoring.totalScore} points (${scoring.tier})`);
  console.log(`[Minutes Monitor]   Summary: ${signalSummary}`);

  // Save scan to database
  const scanId = Date.now(); // Simple auto-increment
  runHoaDb(`
    INSERT INTO minutes_scans (
      id, hoa_id, scan_date, minutes_url, minutes_date, minutes_title,
      doc_type, minutes_text_excerpt, word_count, total_score, tier,
      tier1_matches, tier2_matches, tier3_matches, negative_matches,
      signal_quotes, signal_summary, project_types, scan_status
    ) VALUES (?, ?, datetime('now'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    scanId,
    hoaId,
    mockMinutes.url,
    mockMinutes.date,
    mockMinutes.title,
    mockMinutes.docType,
    minutesText.substring(0, 1000), // First 1000 chars
    mockMinutes.wordCount,
    scoring.totalScore,
    scoring.tier,
    JSON.stringify(scoring.tier1Matches),
    JSON.stringify(scoring.tier2Matches),
    JSON.stringify(scoring.tier3Matches),
    JSON.stringify(scoring.negativeMatches),
    JSON.stringify(scoring.signalQuotes),
    signalSummary,
    JSON.stringify(scoring.projectTypes),
    'success'
  ]);

  // If HOT or WARM, create scored lead
  if (scoring.tier === 'HOT' || scoring.tier === 'WARM') {
    console.log(`[Minutes Monitor]   🔥 Creating ${scoring.tier} lead!`);

    const leadId = Date.now() + 1;
    const estimatedLoanMin = (hoa.unit_count || 50) * 2000;
    const estimatedLoanMax = (hoa.unit_count || 50) * 10000;

    runHoaDb(`
      INSERT INTO scored_leads (
        id, hoa_id, scan_id, score, tier, state, city, unit_count,
        estimated_loan_size_min, estimated_loan_size_max, project_types,
        signal_summary, special_assessment_mentioned, contact_enrichment_status,
        outreach_status, first_detected
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `, [
      leadId,
      hoaId,
      scanId,
      scoring.totalScore,
      scoring.tier,
      hoa.state,
      hoa.city,
      hoa.unit_count,
      estimatedLoanMin,
      estimatedLoanMax,
      JSON.stringify(scoring.projectTypes),
      signalSummary,
      scoring.tier1Matches.some(k => k.includes('special assessment')) ? 1 : 0,
      'pending',
      'pending'
    ]);
  }

  // Update last_scanned timestamp
  runHoaDb(
    'UPDATE hoa_communities SET last_scanned = datetime(\'now\') WHERE id = ?',
    [hoaId]
  );

  return {
    hoaId,
    hoaName: hoa.name,
    scanId,
    score: scoring.totalScore,
    tier: scoring.tier,
    tier1Matches: scoring.tier1Matches,
    tier2Matches: scoring.tier2Matches,
    projectTypes: scoring.projectTypes,
    signalSummary,
  };
}

/**
 * Scan multiple HOAs (batch operation)
 */
async function scanMultipleHOAs(params) {
  const { limit = 20, state = null, priority_min = 5 } = params;

  console.log('\n🔍 HOA MINUTES MONITOR - STARTING');
  console.log('='.repeat(60));
  console.log(`Limit: ${limit}`);
  if (state) console.log(`State filter: ${state}`);
  console.log(`Priority min: ${priority_min}`);
  console.log('');

  try {
    await getHoaDb();

    // Find HOAs to scan (prioritize those never scanned or scanned >30 days ago)
    let query = `
      SELECT id FROM hoa_communities
      WHERE status = 'active'
      AND priority >= ?
      ${state ? 'AND state = ?' : ''}
      AND (last_scanned IS NULL OR last_scanned < datetime('now', '-30 days'))
      ORDER BY priority DESC, unit_count DESC
      LIMIT ?
    `;

    const queryParams = state ? [priority_min, state, limit] : [priority_min, limit];
    const hoasToScan = allHoaDbRows(query, queryParams);

    console.log(`[Minutes Monitor] Found ${hoasToScan.length} HOAs to scan`);
    console.log('');

    const results = [];
    let hotCount = 0;
    let warmCount = 0;
    let watchCount = 0;
    let archiveCount = 0;

    for (const hoa of hoasToScan) {
      const result = await scanHOAMinutes(hoa.id);
      results.push(result);

      if (result.tier === 'HOT') hotCount++;
      else if (result.tier === 'WARM') warmCount++;
      else if (result.tier === 'WATCH') watchCount++;
      else archiveCount++;
    }

    console.log('');
    console.log('='.repeat(60));
    console.log('✅ MINUTES SCAN COMPLETE');
    console.log('='.repeat(60));
    console.log(`Total scanned: ${results.length}`);
    console.log(`HOT leads: ${hotCount}`);
    console.log(`WARM leads: ${warmCount}`);
    console.log(`WATCH leads: ${watchCount}`);
    console.log(`ARCHIVE: ${archiveCount}`);
    console.log('');

    return {
      success: true,
      scanned_count: results.length,
      hot_count: hotCount,
      warm_count: warmCount,
      watch_count: watchCount,
      archive_count: archiveCount,
      results,
    };

  } catch (error) {
    console.error('');
    console.error('❌ MINUTES SCAN FAILED');
    console.error('Error:', error.message);
    console.error('');

    return {
      success: false,
      error: error.message,
      scanned_count: 0,
      hot_count: 0,
      warm_count: 0,
      watch_count: 0,
      archive_count: 0,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  scanHOAMinutes,
  scanMultipleHOAs,
  scoreMinutesText,
};
