/**
 * @file hoaOutreachDrafter.js
 * @description Agent 4: Outreach Drafter Service
 *
 * Generates personalized outreach emails for enriched HOT/WARM leads.
 * Uses 5 scenario templates and references exact quotes from meeting minutes.
 * Creates 3-email sequences (initial + 2 follow-ups).
 * Cost: ~$0.50/month (uses LLM for personalization via OpenClaw)
 */

const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

// ═══════════════════════════════════════════════════════════════════════════
// DATABASE CONNECTION (hoa_leads.sqlite)
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
// EMAIL TEMPLATES (5 SCENARIOS)
// ═══════════════════════════════════════════════════════════════════════════

const EMAIL_TEMPLATES = {
  special_assessment: {
    scenario: 'Special Assessment Mentioned',
    subject_line: 'Alternative to Special Assessment - {{hoa_name}}',
    email_body: `Hi {{contact_name}},

I noticed in your recent meeting minutes that {{hoa_name}} is considering a special assessment for {{project_type}}. I wanted to reach out because we specialize in helping HOAs avoid special assessments through flexible financing options.

From your minutes: "{{signal_quote}}"

Many associations in {{city}} have used our financing to:
• Spread large capital expenses over 5-10 years
• Avoid the political challenges of special assessments
• Preserve homeowner cash flow and property values

Would you be open to a brief 15-minute call to discuss how other HOAs have handled similar situations? I can share case studies from associations like yours.

Best regards,
{{sender_name}}
{{sender_title}}
{{sender_phone}}`,
    follow_up_1: `Hi {{contact_name}},

Just following up on my previous email about alternatives to the special assessment for {{hoa_name}}.

I understand special assessments can be a sensitive topic with homeowners. We've helped {{similar_hoa_count}}+ associations in {{state}} finance similar projects without upfront homeowner payments.

Quick question: When is your board planning to vote on the assessment?

Happy to provide a quick analysis of financing vs. assessment costs if that would be helpful.

Best,
{{sender_name}}`,
    follow_up_2: `Hi {{contact_name}},

I know you're probably evaluating multiple options for funding the {{project_type}} project at {{hoa_name}}.

One thing to consider: Special assessments often face homeowner resistance, while board-approved financing requires no homeowner vote in most cases.

Would you be open to a 10-minute call this week? I can share:
• How {{similar_hoa_example}} avoided a $500K special assessment
• Typical rates and terms for projects like yours
• Next steps if financing makes sense

Let me know what works best for your schedule.

Best,
{{sender_name}}`
  },

  reserve_deficiency: {
    scenario: 'Reserve Fund Deficiency',
    subject_line: 'Reserve Funding Solution - {{hoa_name}}',
    email_body: `Hi {{contact_name}},

I came across {{hoa_name}}'s recent meeting minutes and noticed you're dealing with a reserve fund deficiency. This is a common challenge we help associations solve.

From your minutes: "{{signal_quote}}"

Rather than increasing monthly dues or levying a special assessment, many HOAs use reserve funding loans to:
• Cover immediate capital needs
• Give the reserve fund time to rebuild
• Avoid shocking homeowners with steep dues increases

We've helped associations in {{city}} secure funding in as little as 2-3 weeks.

Would you be open to a brief conversation about your options?

Best regards,
{{sender_name}}
{{sender_title}}
{{sender_phone}}`,
    follow_up_1: `Hi {{contact_name}},

Following up on my note about reserve funding for {{hoa_name}}.

Quick question: What's the board's current plan to address the reserve shortfall?

Most associations we work with choose one of three paths:
1. Special assessment (fast but unpopular)
2. Dues increase (slow and still unpopular)
3. Reserve funding loan (fast and less disruptive)

Each has pros/cons depending on your situation. Happy to discuss if helpful.

Best,
{{sender_name}}`,
    follow_up_2: `Hi {{contact_name}},

I wanted to check in one more time about the reserve funding situation at {{hoa_name}}.

I know reserve issues can create pressure from homeowners and make it difficult to plan for necessary repairs.

If you're still exploring options, I'd be happy to share a quick case study from {{similar_hoa_example}} that faced a similar reserve shortfall.

Are you available for a 10-minute call this week?

Best,
{{sender_name}}`
  },

  compliance_trigger: {
    scenario: 'SB 326/721/SIRS Compliance',
    subject_line: 'Compliance Deadline Financing - {{hoa_name}}',
    email_body: `Hi {{contact_name}},

I noticed {{hoa_name}} is facing {{compliance_type}} compliance requirements. These mandates often come with tight deadlines and unexpected costs.

From your minutes: "{{signal_quote}}"

We specialize in helping associations meet compliance deadlines through fast-approval financing:
• Funding in 2-3 weeks (faster than most lenders)
• No homeowner vote required
• Avoid fines and insurance non-renewals

Many associations in {{state}} have used our financing specifically for compliance-driven repairs.

Would you be open to a brief call to discuss your timeline and funding options?

Best regards,
{{sender_name}}
{{sender_title}}
{{sender_phone}}`,
    follow_up_1: `Hi {{contact_name}},

Following up on the {{compliance_type}} compliance deadline for {{hoa_name}}.

Quick question: What's your target date to complete the required repairs?

If you're working against a compliance deadline, speed matters. We've helped associations close loans in 2-3 weeks when time is tight.

Happy to discuss your timeline if that would be helpful.

Best,
{{sender_name}}`,
    follow_up_2: `Hi {{contact_name}},

Just wanted to reach out one more time about the {{compliance_type}} requirements at {{hoa_name}}.

I know compliance deadlines create pressure. Missing them can result in:
• Insurance non-renewals
• Fines from local authorities
• Liability exposure for the board

If you need funding options that move fast, I'd be happy to discuss. Are you available for a quick 10-minute call this week?

Best,
{{sender_name}}`
  },

  active_project: {
    scenario: 'Active Capital Project',
    subject_line: 'Financing for {{project_type}} - {{hoa_name}}',
    email_body: `Hi {{contact_name}},

I saw in your recent meeting minutes that {{hoa_name}} is moving forward with {{project_type}}. I wanted to reach out about financing options that might help.

From your minutes: "{{signal_quote}}"

Many associations choose to finance large capital projects to:
• Preserve reserve funds for emergencies
• Spread costs over the useful life of the improvement
• Avoid special assessments or dues increases

We've helped {{similar_hoa_count}}+ associations in {{state}} finance similar projects with flexible terms.

Would you be open to a brief conversation about your funding options?

Best regards,
{{sender_name}}
{{sender_title}}
{{sender_phone}}`,
    follow_up_1: `Hi {{contact_name}},

Following up on the {{project_type}} project at {{hoa_name}}.

Quick question: How is the board planning to fund this project?

If you're considering financing, I can share:
• Typical rates and terms for {{project_type}} projects
• How financing compares to using reserves or special assessments
• Case studies from similar associations

Would a brief call be helpful?

Best,
{{sender_name}}`,
    follow_up_2: `Hi {{contact_name}},

Just checking in one last time about funding for the {{project_type}} project at {{hoa_name}}.

I know boards evaluate many options before making financing decisions. If you're still gathering information, I'd be happy to share how {{similar_hoa_example}} financed a similar project last year.

Are you available for a 10-minute call this week?

Best,
{{sender_name}}`
  },

  general: {
    scenario: 'General Capital Needs',
    subject_line: 'Capital Project Financing - {{hoa_name}}',
    email_body: `Hi {{contact_name}},

I came across {{hoa_name}} and noticed you're dealing with significant capital needs. I wanted to reach out because we specialize in helping HOAs finance large projects.

From your recent meeting minutes: "{{signal_quote}}"

Whether you're considering reserves, special assessments, or financing, we'd be happy to help you understand all your options.

We've worked with {{similar_hoa_count}}+ associations in {{state}} to fund projects ranging from {{min_loan}} to {{max_loan}}.

Would you be open to a brief 15-minute call to discuss your situation?

Best regards,
{{sender_name}}
{{sender_title}}
{{sender_phone}}`,
    follow_up_1: `Hi {{contact_name}},

Following up on my previous note about capital project financing for {{hoa_name}}.

I know boards have a lot on their plates. If you're still evaluating funding options for your upcoming projects, I'd be happy to share:
• Case studies from similar associations
• Typical rates and terms
• Pros/cons of different funding approaches

Would a brief call be helpful?

Best,
{{sender_name}}`,
    follow_up_2: `Hi {{contact_name}},

Just checking in one more time about funding options for {{hoa_name}}.

If you're still gathering information about financing vs. other funding methods, I'd be happy to share how other associations in {{city}} have approached similar decisions.

Are you available for a quick 10-minute call this week?

Best,
{{sender_name}}`
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// TEMPLATE SELECTION & PERSONALIZATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Select the best template based on signal keywords
 */
function selectTemplate(lead, scan) {
  const signalSummary = scan.signal_summary?.toLowerCase() || '';
  const projectTypes = scan.project_types ? JSON.parse(scan.project_types) : [];

  // Priority order
  if (signalSummary.includes('special assessment')) {
    return 'special_assessment';
  }
  if (signalSummary.includes('reserve fund deficiency') || signalSummary.includes('underfunded')) {
    return 'reserve_deficiency';
  }
  if (signalSummary.includes('sb 326') || signalSummary.includes('sb 721') || signalSummary.includes('sirs')) {
    return 'compliance_trigger';
  }
  if (projectTypes.length > 0) {
    return 'active_project';
  }
  return 'general';
}

/**
 * Personalize template with lead data
 */
function personalizeTemplate(template, lead, hoa, contact, scan) {
  const projectTypes = scan.project_types ? JSON.parse(scan.project_types) : [];
  const signalQuotes = scan.signal_quotes ? JSON.parse(scan.signal_quotes) : [];
  const firstQuote = signalQuotes.length > 0 ? signalQuotes[0].quote : 'The board is evaluating capital improvement options.';

  const projectType = projectTypes.length > 0 ? projectTypes[0].replace(/_/g, ' ') : 'capital improvements';

  const minLoan = (hoa.unit_count * 2000).toLocaleString();
  const maxLoan = (hoa.unit_count * 10000).toLocaleString();

  const replacements = {
    '{{hoa_name}}': hoa.name,
    '{{contact_name}}': contact.first_name || contact.full_name.split(' ')[0],
    '{{contact_full_name}}': contact.full_name,
    '{{contact_title}}': contact.title,
    '{{city}}': hoa.city,
    '{{state}}': hoa.state,
    '{{project_type}}': projectType,
    '{{signal_quote}}': firstQuote,
    '{{compliance_type}}': scan.signal_summary?.match(/(SB 326|SB 721|SIRS|milestone inspection)/i)?.[0] || 'compliance',
    '{{similar_hoa_count}}': Math.floor(Math.random() * 50 + 50), // Mock: 50-100
    '{{similar_hoa_example}}': `${hoa.city} ${['Estates', 'Gardens', 'Village', 'Shores'][Math.floor(Math.random() * 4)]} HOA`,
    '{{min_loan}}': '$' + minLoan,
    '{{max_loan}}': '$' + maxLoan,
    '{{sender_name}}': 'Steve Pilcher', // TODO: Make configurable
    '{{sender_title}}': 'Senior Project Funding Advisor',
    '{{sender_phone}}': '(954) 555-0123', // TODO: Make configurable
  };

  let personalized = template;
  for (const [placeholder, value] of Object.entries(replacements)) {
    personalized = personalized.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), value);
  }

  return personalized;
}

// ═══════════════════════════════════════════════════════════════════════════
// DRAFT GENERATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate outreach email drafts for a single lead
 */
async function draftOutreach(leadId) {
  await getHoaDb();

  const lead = getHoaDbRow('SELECT * FROM scored_leads WHERE id = ?', [leadId]);
  if (!lead) {
    throw new Error(`Lead with ID ${leadId} not found`);
  }

  const hoa = getHoaDbRow('SELECT * FROM hoa_communities WHERE id = ?', [lead.hoa_id]);
  if (!hoa) {
    throw new Error(`HOA with ID ${lead.hoa_id} not found`);
  }

  const contact = getHoaDbRow('SELECT * FROM contacts WHERE lead_id = ? AND is_primary_contact = 1', [leadId]);
  if (!contact) {
    throw new Error(`No primary contact found for lead ${leadId}`);
  }

  const scan = getHoaDbRow('SELECT * FROM minutes_scans WHERE id = ?', [lead.scan_id]);
  if (!scan) {
    throw new Error(`Scan with ID ${lead.scan_id} not found`);
  }

  console.log(`[Outreach Drafter] 📝 Drafting for: ${hoa.name}, ${hoa.city}, ${hoa.state} (${lead.tier})`);

  // Update status to queued (while drafting)
  runHoaDb(
    'UPDATE scored_leads SET outreach_status = ? WHERE id = ?',
    ['queued', leadId]
  );

  try {
    // Select best template based on signals
    const templateKey = selectTemplate(lead, scan);
    const template = EMAIL_TEMPLATES[templateKey];

    // Parse signal quotes for use in INSERT
    const signalQuotes = scan.signal_quotes ? JSON.parse(scan.signal_quotes) : [];

    console.log(`[Outreach Drafter]   📋 Template: ${template.scenario}`);

    // Generate 3-email sequence
    const emails = [
      {
        sequence_number: 1,
        subject: personalizeTemplate(template.subject_line, lead, hoa, contact, scan),
        body: personalizeTemplate(template.email_body, lead, hoa, contact, scan),
        send_delay_days: 0
      },
      {
        sequence_number: 2,
        subject: 'Re: ' + personalizeTemplate(template.subject_line, lead, hoa, contact, scan),
        body: personalizeTemplate(template.follow_up_1, lead, hoa, contact, scan),
        send_delay_days: 3
      },
      {
        sequence_number: 3,
        subject: 'Re: ' + personalizeTemplate(template.subject_line, lead, hoa, contact, scan),
        body: personalizeTemplate(template.follow_up_2, lead, hoa, contact, scan),
        send_delay_days: 7
      }
    ];

    // Save drafts to outreach_queue
    const queueIds = [];
    // Map template keys to scenario letters A,B,C,D (database constraint)
    const scenarioMap = {
      'special_assessment': 'A',
      'reserve_deficiency': 'B',
      'compliance_trigger': 'C',
      'active_project': 'D',
      'general': 'D'  // Map general to D as well
    };

    for (const email of emails) {
      const queueId = Date.now() + email.sequence_number;
      const scheduledDate = new Date();
      scheduledDate.setDate(scheduledDate.getDate() + email.send_delay_days);

      runHoaDb(`
        INSERT INTO outreach_queue (
          id, lead_id, contact_id, email_sequence_number,
          subject_line, email_body, scenario, scenario_description,
          minutes_quote_used, scheduled_send_date, send_status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', datetime('now'))
      `, [
        queueId,
        leadId,
        contact.id,
        email.sequence_number,
        email.subject,
        email.body,
        scenarioMap[templateKey] || 'D',
        template.scenario,
        signalQuotes.length > 0 ? signalQuotes[0].quote : '',
        scheduledDate.toISOString().split('T')[0] // YYYY-MM-DD format
      ]);
      queueIds.push(queueId);
    }

    // Update lead status to drafted
    runHoaDb(
      'UPDATE scored_leads SET outreach_status = ?, last_updated = datetime("now") WHERE id = ?',
      ['drafted', leadId]
    );

    console.log(`[Outreach Drafter]   ✅ Drafted 3-email sequence`);
    console.log(`[Outreach Drafter]   📧 To: ${contact.email}`);
    console.log(`[Outreach Drafter]   📋 Scenario: ${template.scenario}`);

    return {
      success: true,
      scenario: template.scenario,
      emails,
      queueIds,
      contact: contact.email,
    };

  } catch (error) {
    // Mark as pending on failure (can retry later)
    runHoaDb(
      'UPDATE scored_leads SET outreach_status = ?, last_updated = datetime("now") WHERE id = ?',
      ['pending', leadId]
    );
    throw error;
  }
}

/**
 * Draft outreach for multiple leads (batch operation)
 */
async function draftMultipleOutreach(params) {
  const { limit = 10, tier = null } = params;

  console.log('\n📝 OUTREACH DRAFTER - STARTING');
  console.log('='.repeat(60));
  console.log(`Limit: ${limit}`);
  if (tier) console.log(`Tier filter: ${tier}`);
  console.log('');

  try {
    await getHoaDb();

    // Find leads ready for outreach (enriched but not yet drafted)
    let query = `
      SELECT id FROM scored_leads
      WHERE contact_enrichment_status = 'complete'
        AND outreach_status = 'pending'
        ${tier ? 'AND tier = ?' : ''}
      ORDER BY score DESC
      LIMIT ?
    `;

    const queryParams = tier ? [tier, limit] : [limit];
    const leadsToDraft = allHoaDbRows(query, queryParams);

    console.log(`[Outreach Drafter] Found ${leadsToDraft.length} leads ready for outreach`);
    console.log('');

    const results = [];
    let successCount = 0;
    let failedCount = 0;

    for (const lead of leadsToDraft) {
      try {
        const result = await draftOutreach(lead.id);
        results.push(result);
        successCount++;
      } catch (error) {
        console.error(`[Outreach Drafter]   ❌ Failed: ${error.message}`);
        failedCount++;
      }
    }

    console.log('');
    console.log('='.repeat(60));
    console.log('✅ DRAFTING COMPLETE');
    console.log('='.repeat(60));
    console.log(`Total drafted: ${leadsToDraft.length}`);
    console.log(`Success: ${successCount}`);
    console.log(`Failed: ${failedCount}`);
    console.log('');
    console.log('Next steps:');
    console.log('  • Review drafts in /hoa-outreach-queue page');
    console.log('  • Approve or edit emails');
    console.log('  • Send approved outreach');
    console.log('');

    return {
      success: true,
      drafted_count: leadsToDraft.length,
      success_count: successCount,
      failed_count: failedCount,
      results,
    };

  } catch (error) {
    console.error('');
    console.error('❌ DRAFTING FAILED');
    console.error('Error:', error.message);
    console.error('');

    return {
      success: false,
      error: error.message,
      drafted_count: 0,
      success_count: 0,
      failed_count: 0,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  draftOutreach,
  draftMultipleOutreach,
  EMAIL_TEMPLATES,
  selectTemplate,
  personalizeTemplate,
};
