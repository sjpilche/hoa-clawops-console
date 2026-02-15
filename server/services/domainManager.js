/**
 * @file domainManager.js
 * @description Domain management service for the multi-domain platform.
 *
 * Handles domain CRUD, database connection testing, and dashboard info.
 */

const { run, get, all } = require('../db/connection');
const crypto = require('crypto');

/**
 * Create a new domain.
 */
function createDomain(data) {
  const id = data.id || crypto.randomUUID();

  run(
    `INSERT INTO domains (id, name, display_name, description, icon, color, status, db_type, db_config, dashboard_url, dashboard_port)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      data.name,
      data.display_name,
      data.description || null,
      data.icon || 'Box',
      data.color || '#6366f1',
      data.status || 'active',
      data.db_type || null,
      data.db_config ? JSON.stringify(data.db_config) : null,
      data.dashboard_url || null,
      data.dashboard_port || null,
    ]
  );

  return getDomain(id);
}

/**
 * Get a domain by ID.
 */
function getDomain(id) {
  const domain = get('SELECT * FROM domains WHERE id = ?', [id]);
  if (domain && domain.db_config) {
    try {
      domain.db_config = JSON.parse(domain.db_config);
    } catch { /* keep as string */ }
  }
  return domain;
}

/**
 * Get all domains.
 */
function getAllDomains() {
  const domains = all('SELECT * FROM domains ORDER BY display_name');
  return domains.map(d => {
    if (d.db_config) {
      try { d.db_config = JSON.parse(d.db_config); } catch { /* keep as string */ }
    }
    return d;
  });
}

/**
 * Update a domain.
 */
function updateDomain(id, data) {
  const fields = [];
  const params = [];

  const allowedFields = [
    'name', 'display_name', 'description', 'icon', 'color',
    'status', 'db_type', 'dashboard_url', 'dashboard_port',
  ];

  for (const field of allowedFields) {
    if (data[field] !== undefined) {
      fields.push(`${field} = ?`);
      params.push(data[field]);
    }
  }

  // Handle db_config specially (JSON serialize)
  if (data.db_config !== undefined) {
    fields.push('db_config = ?');
    params.push(data.db_config ? JSON.stringify(data.db_config) : null);
  }

  if (fields.length === 0) return getDomain(id);

  fields.push("updated_at = datetime('now')");
  params.push(id);

  run(`UPDATE domains SET ${fields.join(', ')} WHERE id = ?`, params);
  return getDomain(id);
}

/**
 * Delete a domain.
 * Unlinks agents (sets domain_id to NULL) rather than deleting them.
 */
function deleteDomain(id) {
  // Unlink agents from this domain
  run('UPDATE agents SET domain_id = NULL WHERE domain_id = ?', [id]);
  // Unlink extensions
  run('UPDATE extensions SET domain_id = NULL WHERE domain_id = ?', [id]);
  // Delete hierarchies for this domain
  run('DELETE FROM agent_hierarchies WHERE domain_id = ?', [id]);
  // Delete teams for this domain
  run('DELETE FROM agent_team_members WHERE team_id IN (SELECT id FROM agent_teams WHERE domain_id = ?)', [id]);
  run('DELETE FROM agent_teams WHERE domain_id = ?', [id]);
  // Delete the domain
  run('DELETE FROM domains WHERE id = ?', [id]);
}

/**
 * Get agents belonging to a domain.
 */
function getDomainAgents(domainId) {
  return all(
    `SELECT a.*, h.layer, h.parent_id, h.hierarchy_type
     FROM agents a
     LEFT JOIN agent_hierarchies h ON a.id = h.agent_id
     WHERE a.domain_id = ?
     ORDER BY COALESCE(h.layer, 999), a.name`,
    [domainId]
  );
}

/**
 * Get domain statistics (agent count, recent runs, success rate).
 */
function getDomainStats(domainId) {
  const agentCount = get(
    'SELECT COUNT(*) as count FROM agents WHERE domain_id = ?',
    [domainId]
  );

  const extensionCount = get(
    'SELECT COUNT(*) as count FROM extensions WHERE domain_id = ?',
    [domainId]
  );

  const recentRuns = get(
    `SELECT COUNT(*) as count FROM runs r
     JOIN agents a ON r.agent_id = a.id
     WHERE a.domain_id = ? AND r.created_at > datetime('now', '-7 days')`,
    [domainId]
  );

  const successRate = get(
    `SELECT
       CASE WHEN COUNT(*) > 0
         THEN ROUND(100.0 * SUM(CASE WHEN r.status = 'success' THEN 1 ELSE 0 END) / COUNT(*), 1)
         ELSE 0
       END as rate
     FROM runs r
     JOIN agents a ON r.agent_id = a.id
     WHERE a.domain_id = ?`,
    [domainId]
  );

  return {
    agents: agentCount?.count || 0,
    extensions: extensionCount?.count || 0,
    recent_runs: recentRuns?.count || 0,
    success_rate: successRate?.rate || 0,
  };
}

/**
 * Test an external database connection.
 * Currently supports PostgreSQL connection testing via WSL.
 */
async function testDatabaseConnection(domainId) {
  const domain = getDomain(domainId);
  if (!domain || !domain.db_type || !domain.db_config) {
    return { success: false, error: 'No database configured for this domain' };
  }

  const config = typeof domain.db_config === 'string'
    ? JSON.parse(domain.db_config)
    : domain.db_config;

  if (domain.db_type === 'postgresql') {
    try {
      const { spawn } = require('child_process');
      const wslPath = process.env.SystemRoot
        ? `${process.env.SystemRoot}\\System32\\wsl.exe`
        : 'wsl';

      return new Promise((resolve) => {
        const cmd = `PGPASSWORD='${config.password || ''}' psql -h ${config.host} -p ${config.port || 5432} -U ${config.user || 'postgres'} -d ${config.database} -c 'SELECT 1' 2>&1 | head -1`;

        const proc = spawn(wslPath, ['bash', '-c', cmd], { shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
        let output = '';

        const timeout = setTimeout(() => {
          proc.kill('SIGKILL');
          resolve({ success: false, error: 'Connection timed out' });
        }, 10000);

        proc.stdout.on('data', (d) => { output += d.toString(); });
        proc.stderr.on('data', (d) => { output += d.toString(); });

        proc.on('close', (code) => {
          clearTimeout(timeout);
          resolve({
            success: code === 0,
            error: code !== 0 ? output.trim() : null,
            message: code === 0 ? 'Connection successful' : undefined,
          });
        });
      });
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  return { success: false, error: `Unsupported database type: ${domain.db_type}` };
}

module.exports = {
  createDomain,
  getDomain,
  getAllDomains,
  updateDomain,
  deleteDomain,
  getDomainAgents,
  getDomainStats,
  testDatabaseConnection,
};
