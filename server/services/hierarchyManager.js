/**
 * @file hierarchyManager.js
 * @description Agent hierarchy management service.
 *
 * Handles parent/child relationships, layer calculation, tree building,
 * and cycle detection for hierarchical agent orchestration.
 */

const { run, get, all } = require('../db/connection');
const crypto = require('crypto');

/**
 * Create a hierarchy relationship (assign agent to a parent).
 */
function createHierarchy(data) {
  const id = data.id || crypto.randomUUID();

  // Calculate layer automatically
  const layer = data.parent_id ? calculateLayer(data.parent_id) + 1 : 0;

  run(
    `INSERT OR REPLACE INTO agent_hierarchies (id, agent_id, parent_id, domain_id, hierarchy_type, layer, order_index)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      data.agent_id,
      data.parent_id || null,
      data.domain_id,
      data.hierarchy_type || 'command',
      layer,
      data.order_index || 0,
    ]
  );

  // Update agent's layer and role
  run(
    'UPDATE agents SET layer = ?, updated_at = datetime("now") WHERE id = ?',
    [layer, data.agent_id]
  );

  return getHierarchy(data.agent_id);
}

/**
 * Get hierarchy record for a specific agent.
 */
function getHierarchy(agentId) {
  return get(
    `SELECT h.*, a.name as agent_name, p.name as parent_name
     FROM agent_hierarchies h
     JOIN agents a ON h.agent_id = a.id
     LEFT JOIN agents p ON h.parent_id = p.id
     WHERE h.agent_id = ?`,
    [agentId]
  );
}

/**
 * Get all hierarchies for a domain.
 */
function getDomainHierarchies(domainId) {
  return all(
    `SELECT h.*, a.name as agent_name, a.status as agent_status,
            a.orchestration_role, p.name as parent_name
     FROM agent_hierarchies h
     JOIN agents a ON h.agent_id = a.id
     LEFT JOIN agents p ON h.parent_id = p.id
     WHERE h.domain_id = ?
     ORDER BY h.layer, h.order_index`,
    [domainId]
  );
}

/**
 * Update a hierarchy relationship.
 */
function updateHierarchy(id, data) {
  const fields = [];
  const params = [];

  if (data.parent_id !== undefined) {
    fields.push('parent_id = ?');
    params.push(data.parent_id || null);
  }
  if (data.hierarchy_type !== undefined) {
    fields.push('hierarchy_type = ?');
    params.push(data.hierarchy_type);
  }
  if (data.order_index !== undefined) {
    fields.push('order_index = ?');
    params.push(data.order_index);
  }

  // Recalculate layer if parent changed
  if (data.parent_id !== undefined) {
    const layer = data.parent_id ? calculateLayer(data.parent_id) + 1 : 0;
    fields.push('layer = ?');
    params.push(layer);
  }

  if (fields.length === 0) return get('SELECT * FROM agent_hierarchies WHERE id = ?', [id]);

  params.push(id);
  run(`UPDATE agent_hierarchies SET ${fields.join(', ')} WHERE id = ?`, params);

  // Also update children's layers recursively
  const record = get('SELECT agent_id FROM agent_hierarchies WHERE id = ?', [id]);
  if (record) {
    recalculateChildLayers(record.agent_id);
  }

  return get('SELECT * FROM agent_hierarchies WHERE id = ?', [id]);
}

/**
 * Delete a hierarchy relationship.
 * Children become root nodes (parent_id = NULL, layer = 0).
 */
function deleteHierarchy(id) {
  const record = get('SELECT agent_id FROM agent_hierarchies WHERE id = ?', [id]);
  if (!record) return;

  // Promote children to root
  const children = all(
    'SELECT id FROM agent_hierarchies WHERE parent_id = ?',
    [record.agent_id]
  );
  for (const child of children) {
    run(
      'UPDATE agent_hierarchies SET parent_id = NULL, layer = 0 WHERE id = ?',
      [child.id]
    );
  }

  run('DELETE FROM agent_hierarchies WHERE id = ?', [id]);
}

/**
 * Build a nested tree structure for a domain.
 *
 * @param {string} domainId
 * @returns {Array} - Array of root nodes, each with a `children` array
 */
function buildHierarchyTree(domainId) {
  const records = all(
    `SELECT h.*, a.name as agent_name, a.description as agent_description,
            a.status as agent_status, a.orchestration_role,
            a.total_runs, a.success_rate, a.last_run_at
     FROM agent_hierarchies h
     JOIN agents a ON h.agent_id = a.id
     WHERE h.domain_id = ?
     ORDER BY h.layer, h.order_index`,
    [domainId]
  );

  // Also include agents in this domain with no hierarchy entry
  const unassigned = all(
    `SELECT a.id as agent_id, a.name as agent_name, a.description as agent_description,
            a.status as agent_status, a.orchestration_role,
            a.total_runs, a.success_rate, a.last_run_at,
            NULL as parent_id, 0 as layer, 'command' as hierarchy_type, 0 as order_index
     FROM agents a
     WHERE a.domain_id = ? AND a.id NOT IN (SELECT agent_id FROM agent_hierarchies WHERE domain_id = ?)`,
    [domainId, domainId]
  );

  const allNodes = [...records, ...unassigned];

  // Build lookup map
  const nodeMap = new Map();
  for (const record of allNodes) {
    nodeMap.set(record.agent_id, { ...record, children: [] });
  }

  // Build tree
  const roots = [];
  for (const node of nodeMap.values()) {
    if (node.parent_id && nodeMap.has(node.parent_id)) {
      nodeMap.get(node.parent_id).children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

/**
 * Get children of an agent.
 */
function getChildren(agentId) {
  return all(
    `SELECT h.*, a.name as agent_name, a.status as agent_status, a.orchestration_role
     FROM agent_hierarchies h
     JOIN agents a ON h.agent_id = a.id
     WHERE h.parent_id = ?
     ORDER BY h.order_index`,
    [agentId]
  );
}

/**
 * Calculate the layer depth of an agent.
 * Layer 0 = root, Layer 1 = direct child of root, etc.
 */
function calculateLayer(agentId, visited = new Set()) {
  if (visited.has(agentId)) return 0; // Cycle protection
  visited.add(agentId);

  const record = get(
    'SELECT parent_id FROM agent_hierarchies WHERE agent_id = ?',
    [agentId]
  );

  if (!record || !record.parent_id) return 0;
  return calculateLayer(record.parent_id, visited) + 1;
}

/**
 * Recalculate layers for all children of an agent recursively.
 */
function recalculateChildLayers(parentAgentId) {
  const children = all(
    'SELECT id, agent_id FROM agent_hierarchies WHERE parent_id = ?',
    [parentAgentId]
  );

  for (const child of children) {
    const newLayer = calculateLayer(child.agent_id);
    run('UPDATE agent_hierarchies SET layer = ? WHERE id = ?', [newLayer, child.id]);
    run('UPDATE agents SET layer = ? WHERE id = ?', [newLayer, child.agent_id]);
    recalculateChildLayers(child.agent_id);
  }
}

/**
 * Validate that creating a parent/child relationship won't create a cycle.
 *
 * @param {string} childId - Agent to be the child
 * @param {string} parentId - Agent to be the parent
 * @returns {boolean} - true if valid (no cycle), false if cycle detected
 */
function validateNoCycle(childId, parentId) {
  if (!parentId) return true; // No parent = always valid
  if (childId === parentId) return false; // Self-reference

  // Walk up the tree from parentId and check if we reach childId
  const visited = new Set();
  let currentId = parentId;

  while (currentId) {
    if (visited.has(currentId)) return true; // Already visited = cycle in existing tree, but not involving childId
    if (currentId === childId) return false; // Would create a cycle
    visited.add(currentId);

    const record = get(
      'SELECT parent_id FROM agent_hierarchies WHERE agent_id = ?',
      [currentId]
    );
    currentId = record?.parent_id || null;
  }

  return true; // No cycle found
}

// ---- Team Management ----

/**
 * Create a team.
 */
function createTeam(data) {
  const id = data.id || crypto.randomUUID();

  run(
    `INSERT INTO agent_teams (id, domain_id, name, description, coordination_strategy)
     VALUES (?, ?, ?, ?, ?)`,
    [id, data.domain_id, data.name, data.description || null, data.coordination_strategy || 'sequential']
  );

  return getTeam(id);
}

/**
 * Get a team by ID.
 */
function getTeam(id) {
  const team = get('SELECT * FROM agent_teams WHERE id = ?', [id]);
  if (team) {
    team.members = all(
      `SELECT tm.*, a.name as agent_name, a.status as agent_status, a.orchestration_role
       FROM agent_team_members tm
       JOIN agents a ON tm.agent_id = a.id
       WHERE tm.team_id = ?
       ORDER BY tm.order_index`,
      [id]
    );
  }
  return team;
}

/**
 * Get all teams, optionally filtered by domain.
 */
function getAllTeams(domainId) {
  const where = domainId ? 'WHERE domain_id = ?' : '';
  const params = domainId ? [domainId] : [];

  const teams = all(`SELECT * FROM agent_teams ${where} ORDER BY name`, params);
  for (const team of teams) {
    team.members = all(
      `SELECT tm.*, a.name as agent_name
       FROM agent_team_members tm
       JOIN agents a ON tm.agent_id = a.id
       WHERE tm.team_id = ?
       ORDER BY tm.order_index`,
      [team.id]
    );
  }
  return teams;
}

/**
 * Update a team.
 */
function updateTeam(id, data) {
  const fields = [];
  const params = [];

  if (data.name !== undefined) { fields.push('name = ?'); params.push(data.name); }
  if (data.description !== undefined) { fields.push('description = ?'); params.push(data.description); }
  if (data.coordination_strategy !== undefined) { fields.push('coordination_strategy = ?'); params.push(data.coordination_strategy); }

  if (fields.length === 0) return getTeam(id);

  fields.push("updated_at = datetime('now')");
  params.push(id);
  run(`UPDATE agent_teams SET ${fields.join(', ')} WHERE id = ?`, params);
  return getTeam(id);
}

/**
 * Delete a team.
 */
function deleteTeam(id) {
  run('DELETE FROM agent_team_members WHERE team_id = ?', [id]);
  run('DELETE FROM agent_teams WHERE id = ?', [id]);
}

/**
 * Add a member to a team.
 */
function addTeamMember(teamId, agentId, role, orderIndex) {
  const id = crypto.randomUUID();
  run(
    'INSERT INTO agent_team_members (id, team_id, agent_id, role, order_index) VALUES (?, ?, ?, ?, ?)',
    [id, teamId, agentId, role || null, orderIndex || 0]
  );
  return getTeam(teamId);
}

/**
 * Remove a member from a team.
 */
function removeTeamMember(teamId, agentId) {
  run('DELETE FROM agent_team_members WHERE team_id = ? AND agent_id = ?', [teamId, agentId]);
  return getTeam(teamId);
}

module.exports = {
  createHierarchy,
  getHierarchy,
  getDomainHierarchies,
  updateHierarchy,
  deleteHierarchy,
  buildHierarchyTree,
  getChildren,
  calculateLayer,
  validateNoCycle,
  createTeam,
  getTeam,
  getAllTeams,
  updateTeam,
  deleteTeam,
  addTeamMember,
  removeTeamMember,
};
