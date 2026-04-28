/**
 * @file crm.js
 * @description CRM data access layer — Azure SQL primary, SQLite fallback.
 *
 * All CRM operations go through this module. Services never query cfo_leads
 * or cfo_outreach_sequences directly — they call crm.getLeads(), crm.updateLead(), etc.
 *
 * When Azure is down, transparently falls back to SQLite (same data, synced at migration).
 * Once Azure is confirmed stable, the SQLite fallback can be removed.
 */

const azure = require('./crmConnection');
const sqlite = require('./connection');

// ═══════════════════════════════════════════════════════════════════════════
// LEADS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Find leads needing outreach drafts for a specific domain.
 * Owen queries HOA's lead pool (shared audience, different pitch).
 */
async function findLeadsForOutreach(limit = 10, sourceAgent = null) {
  const leadPool = sourceAgent === 'owen' ? 'hoa' : sourceAgent;
  const draftAgent = sourceAgent || 'jake';

  if (azure.isAvailable()) {
    try {
      const agentClause = leadPool ? 'AND l.source_agent = @p2' : '';
      const params = leadPool ? [draftAgent, limit, leadPool] : [draftAgent, limit];
      const query = `
        SELECT TOP (@p1) l.id, l.company_name, l.contact_name, l.contact_title, l.contact_email,
               l.city, l.state, l.website, l.pilot_fit_score, l.pilot_fit_reason,
               l.notes, l.source, l.source_agent, l.domain
        FROM crm_leads l
        WHERE l.enrichment_status = 'enriched'
          AND l.contact_email IS NOT NULL AND l.contact_email != ''
          AND l.contact_email LIKE '%@%.%'
          AND LEN(l.contact_email) >= 6
          AND l.status IN ('queued', 'new', 'discovered', 'contacted')
          AND NOT EXISTS (
            SELECT 1 FROM crm_outreach_sequences s
            WHERE s.lead_id = l.id AND s.source_agent = @p0
              AND s.status IN ('draft', 'flagged', 'approved', 'sent', 'replied')
          )
          ${agentClause}
        ORDER BY l.pilot_fit_score DESC, l.created_at ASC`;
      return await azure.crmAll(query, params);
    } catch (err) {
      console.warn('[CRM] Azure query failed, falling back to SQLite:', err.message);
    }
  }

  // SQLite fallback — use the same logic from outreachDrafter.js
  const agentClause = leadPool ? ' AND l.source_agent = ?' : '';
  const params = leadPool ? [draftAgent, leadPool, limit] : [draftAgent, limit];
  return sqlite.all(`
    SELECT l.id, l.company_name, l.contact_name, l.contact_title, l.contact_email,
           l.city, l.state, l.website, l.pilot_fit_score, l.pilot_fit_reason,
           l.notes, l.source, l.source_agent
    FROM cfo_leads l
    WHERE l.enrichment_status = 'enriched'
      AND l.contact_email IS NOT NULL AND l.contact_email != ''
      AND l.contact_email LIKE '%@%.%'
      AND length(l.contact_email) >= 6
      AND l.status IN ('queued', 'new', 'discovered', 'contacted')
      AND NOT EXISTS (
        SELECT 1 FROM cfo_outreach_sequences s
        WHERE s.lead_id = l.id AND s.source_agent = ?
          AND s.status IN ('draft', 'flagged', 'approved', 'sent', 'replied')
      )
      ${agentClause}
    ORDER BY l.pilot_fit_score DESC, l.created_at ASC
    LIMIT ?
  `, params);
}

/**
 * Get a lead by ID.
 */
async function getLead(id) {
  if (azure.isAvailable()) {
    try {
      return await azure.crmGet('SELECT * FROM crm_leads WHERE id = @p0', [id]);
    } catch {}
  }
  return sqlite.get('SELECT * FROM cfo_leads WHERE id = ?', [id]);
}

/**
 * Update a lead's fields.
 * @param {number} id
 * @param {Object} fields — key-value pairs to update
 */
async function updateLead(id, fields) {
  // Always write to both Azure and SQLite for now (dual-write)
  const keys = Object.keys(fields);
  const values = Object.values(fields);

  // Azure
  if (azure.isAvailable()) {
    try {
      const setClauses = keys.map((k, i) => `${k} = @p${i}`).join(', ');
      await azure.crmRun(
        `UPDATE crm_leads SET ${setClauses}, updated_at = GETUTCDATE() WHERE id = @p${keys.length}`,
        [...values, id]
      );
    } catch (err) {
      console.warn('[CRM] Azure update failed:', err.message);
    }
  }

  // SQLite (always, as fallback data)
  const sqliteSets = keys.map(k => `${k} = ?`).join(', ');
  sqlite.run(`UPDATE cfo_leads SET ${sqliteSets}, updated_at = datetime('now') WHERE id = ?`, [...values, id]);
}

/**
 * Insert a new lead.
 * @returns {{ id: number }} — the new lead's ID
 */
async function insertLead(data) {
  const keys = Object.keys(data);
  const values = Object.values(data);

  // SQLite first (gets the auto-increment ID)
  const placeholders = keys.map(() => '?').join(', ');
  sqlite.run(
    `INSERT INTO cfo_leads (${keys.join(', ')}, created_at, updated_at) VALUES (${placeholders}, datetime('now'), datetime('now'))`,
    values
  );
  const row = sqlite.get('SELECT last_insert_rowid() as id');
  const sqliteId = row?.id;

  // Azure (mirror)
  if (azure.isAvailable()) {
    try {
      const azureParams = keys.map((_, i) => `@p${i}`).join(', ');
      await azure.crmRun(
        `INSERT INTO crm_leads (old_id, domain, ${keys.join(', ')}, created_at, updated_at)
         VALUES (@p${keys.length}, @p${keys.length + 1}, ${azureParams}, GETUTCDATE(), GETUTCDATE())`,
        [...values, sqliteId, data.source_agent ? domainFromSourceAgent(data.source_agent) : 'jake']
      );
    } catch (err) {
      console.warn('[CRM] Azure insert failed (SQLite has the data):', err.message);
    }
  }

  return { id: sqliteId };
}

// ═══════════════════════════════════════════════════════════════════════════
// OUTREACH SEQUENCES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get approved sequences ready to send.
 */
async function getApprovedSequences(limit = 50) {
  if (azure.isAvailable()) {
    try {
      return await azure.crmAll(`
        SELECT TOP (@p0) s.id, s.lead_id, s.email_subject, s.email_body, s.source_agent,
               s.pilot_offer, s.sequence_position, s.domain,
               l.company_name, l.contact_name, l.contact_email, l.contact_title,
               l.city, l.state, l.urgency_score
        FROM crm_outreach_sequences s
        JOIN crm_leads l ON l.id = s.lead_id
        WHERE s.status = 'approved'
          AND l.contact_email IS NOT NULL
          AND l.status NOT IN ('unsubscribed', 'bounced', 'closed_lost')
        ORDER BY COALESCE(l.urgency_score, 0) DESC, s.created_at ASC
      `, [limit]);
    } catch {}
  }

  return sqlite.all(`
    SELECT s.id, s.lead_id, s.email_subject, s.email_body, s.source_agent,
           s.pilot_offer, s.sequence_position,
           l.company_name, l.contact_name, l.contact_email, l.contact_title,
           l.city, l.state, l.urgency_score
    FROM cfo_outreach_sequences s
    JOIN cfo_leads l ON l.id = s.lead_id
    WHERE s.status = 'approved'
      AND l.contact_email IS NOT NULL
      AND l.status NOT IN ('unsubscribed', 'bounced', 'closed_lost')
    ORDER BY COALESCE(l.urgency_score, 0) DESC, s.created_at ASC
    LIMIT ?
  `, [limit]);
}

/**
 * Insert an outreach sequence.
 */
async function insertSequence(data) {
  const keys = Object.keys(data);
  const values = Object.values(data);

  const placeholders = keys.map(() => '?').join(', ');
  sqlite.run(
    `INSERT INTO cfo_outreach_sequences (${keys.join(', ')}, created_at) VALUES (${placeholders}, datetime('now'))`,
    values
  );
  const row = sqlite.get('SELECT last_insert_rowid() as id');

  if (azure.isAvailable()) {
    try {
      const azureParams = keys.map((_, i) => `@p${i}`).join(', ');
      await azure.crmRun(
        `INSERT INTO crm_outreach_sequences (old_id, domain, ${keys.join(', ')}, created_at)
         VALUES (@p${keys.length}, @p${keys.length + 1}, ${azureParams}, GETUTCDATE())`,
        [...values, row?.id, data.source_agent ? domainFromSourceAgent(data.source_agent) : 'jake']
      );
    } catch (err) {
      console.warn('[CRM] Azure sequence insert failed:', err.message);
    }
  }

  return { id: row?.id };
}

/**
 * Update a sequence's status.
 */
async function updateSequence(id, fields) {
  const keys = Object.keys(fields);
  const values = Object.values(fields);

  if (azure.isAvailable()) {
    try {
      const setClauses = keys.map((k, i) => `${k} = @p${i}`).join(', ');
      // Use old_id since Azure IDs differ from SQLite IDs
      await azure.crmRun(`UPDATE crm_outreach_sequences SET ${setClauses} WHERE old_id = @p${keys.length}`, [...values, id]);
    } catch {}
  }

  const sqliteSets = keys.map(k => `${k} = ?`).join(', ');
  sqlite.run(`UPDATE cfo_outreach_sequences SET ${sqliteSets} WHERE id = ?`, [...values, id]);
}

// ═══════════════════════════════════════════════════════════════════════════
// STATS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get lead counts by domain and status.
 */
async function getDomainStats() {
  if (azure.isAvailable()) {
    try {
      return await azure.crmAll(`
        SELECT domain, status, COUNT(*) as cnt
        FROM crm_leads
        GROUP BY domain, status
        ORDER BY domain, cnt DESC
      `);
    } catch {}
  }

  return sqlite.all(`
    SELECT source_agent as domain, status, COUNT(*) as cnt
    FROM cfo_leads
    GROUP BY source_agent, status
    ORDER BY source_agent, cnt DESC
  `);
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function domainFromSourceAgent(agent) {
  const map = { jake: 'jake', hoa: 'hoa', owen: 'owen', cfo: 'jake', 'data-rehab': 'data-rehab', data_rehab: 'data-rehab' };
  return map[agent] || 'jake';
}

module.exports = {
  findLeadsForOutreach,
  getLead,
  updateLead,
  insertLead,
  getApprovedSequences,
  insertSequence,
  updateSequence,
  getDomainStats,
  domainFromSourceAgent,
};
