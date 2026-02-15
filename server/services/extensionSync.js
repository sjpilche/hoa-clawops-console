/**
 * @file extensionSync.js
 * @description Syncs OpenClaw extensions and their tools into the ClawOps database.
 *
 * Discovery flow:
 * 1. Scan ~/.openclaw/extensions/ for extension directories
 * 2. Parse openclaw.plugin.json manifest from each
 * 3. Extract tool definitions from source files
 * 4. Upsert into extensions and tools tables
 */

const { spawn } = require('child_process');
const { run, get, all } = require('../db/connection');
const crypto = require('crypto');

/**
 * Execute a command in WSL and return stdout.
 */
async function wslExec(command) {
  return new Promise((resolve, reject) => {
    const wslPath = process.env.SystemRoot
      ? `${process.env.SystemRoot}\\System32\\wsl.exe`
      : 'wsl';

    const proc = spawn(wslPath, ['bash', '-c', command], {
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    const timeout = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new Error('WSL command timed out'));
    }, 30000);

    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });

    proc.on('close', (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(`WSL command failed (exit ${code}): ${stderr || stdout}`));
    });

    proc.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

/**
 * Sync all extensions from OpenClaw into the ClawOps database.
 * Scans the extensions directory, parses manifests, and discovers tools.
 *
 * @returns {Object} - { extensions: number, tools: number, errors: string[] }
 */
async function syncExtensions() {
  const errors = [];
  let extensionCount = 0;
  let toolCount = 0;

  try {
    // Step 1: Find all extension directories
    const extensionDirs = await discoverExtensionDirs();
    console.log(`[ExtensionSync] Found ${extensionDirs.length} extension directories`);

    for (const dir of extensionDirs) {
      try {
        // Step 2: Parse manifest
        const manifest = await parseManifest(dir.path);
        if (!manifest) {
          errors.push(`No valid manifest in ${dir.name}`);
          continue;
        }

        // Step 3: Upsert extension record
        const extensionId = manifest.id || dir.name;
        upsertExtension({
          id: extensionId,
          name: manifest.name || extensionId,
          description: manifest.description || '',
          version: manifest.version || 'unknown',
          plugin_path: dir.path,
          config_schema: JSON.stringify(manifest.configSchema || {}),
          status: 'active',
          enabled: 1,
        });
        extensionCount++;

        // Step 4: Discover tools from source files
        const tools = await discoverTools(dir.path, extensionId);
        for (const tool of tools) {
          upsertTool(tool);
          toolCount++;
        }

        // Update tools count
        run(
          'UPDATE extensions SET tools_count = ?, last_sync_at = datetime("now") WHERE id = ?',
          [tools.length, extensionId]
        );

        console.log(`[ExtensionSync] Synced "${extensionId}": ${tools.length} tools`);
      } catch (err) {
        errors.push(`Error syncing ${dir.name}: ${err.message}`);
        console.error(`[ExtensionSync] Error syncing ${dir.name}:`, err.message);
      }
    }
  } catch (err) {
    errors.push(`Discovery failed: ${err.message}`);
    console.error('[ExtensionSync] Discovery failed:', err.message);
  }

  console.log(`[ExtensionSync] Complete: ${extensionCount} extensions, ${toolCount} tools, ${errors.length} errors`);
  return { extensions: extensionCount, tools: toolCount, errors };
}

/**
 * Discover extension directories from OpenClaw's extensions folder.
 * Looks in ~/.openclaw/extensions/ for directories containing openclaw.plugin.json.
 *
 * @returns {Array<{name: string, path: string}>}
 */
async function discoverExtensionDirs() {
  try {
    // List directories in ~/.openclaw/extensions/
    const output = await wslExec(
      'find ~/.openclaw/extensions -maxdepth 1 -mindepth 1 -type d 2>/dev/null | sort'
    );

    if (!output) return [];

    return output.split('\n').filter(Boolean).map(dirPath => ({
      name: dirPath.split('/').pop(),
      path: dirPath,
    }));
  } catch {
    // Also check nsg-marketing consolidated structure
    try {
      const output = await wslExec(
        'find ~/.openclaw/nsg-marketing/extensions -maxdepth 1 -mindepth 1 -type d 2>/dev/null | sort'
      );
      if (!output) return [];
      return output.split('\n').filter(Boolean).map(dirPath => ({
        name: dirPath.split('/').pop(),
        path: dirPath,
      }));
    } catch {
      return [];
    }
  }
}

/**
 * Parse openclaw.plugin.json manifest from an extension directory.
 *
 * @param {string} dirPath - WSL path to extension directory
 * @returns {Object|null} - Parsed manifest or null
 */
async function parseManifest(dirPath) {
  try {
    const content = await wslExec(`cat "${dirPath}/openclaw.plugin.json" 2>/dev/null`);
    return JSON.parse(content);
  } catch {
    // Try package.json with openclaw field
    try {
      const content = await wslExec(`cat "${dirPath}/package.json" 2>/dev/null`);
      const pkg = JSON.parse(content);
      if (pkg.openclaw) {
        return {
          id: pkg.name?.replace('@openclaw/', ''),
          name: pkg.name,
          description: pkg.description,
          version: pkg.version,
          configSchema: pkg.openclaw.configSchema || {},
        };
      }
    } catch { /* no package.json either */ }
    return null;
  }
}

/**
 * Discover MCP tools from extension source files.
 * Looks for registerTool() calls and tool definition patterns.
 *
 * @param {string} dirPath - WSL path to extension directory
 * @param {string} extensionId - Extension ID
 * @returns {Array<Object>} - Tool definitions
 */
async function discoverTools(dirPath, extensionId) {
  const tools = [];

  try {
    // Strategy 1: Search for tool name patterns in source files
    const grepOutput = await wslExec(
      `grep -rn "name:\\s*['\"]" "${dirPath}/src/tools/" 2>/dev/null || ` +
      `grep -rn "name:\\s*['\"]" "${dirPath}/src/" 2>/dev/null || echo ""`
    );

    if (grepOutput) {
      const namePattern = /name:\s*['"]([a-z_]+)['"]/g;
      let match;
      const seenNames = new Set();

      while ((match = namePattern.exec(grepOutput)) !== null) {
        const toolName = match[1];
        if (seenNames.has(toolName)) continue;
        seenNames.add(toolName);

        // Try to extract description too
        const descMatch = grepOutput.match(
          new RegExp(`name:\\s*['"]${toolName}['"][\\s\\S]*?description:\\s*['"]([^'"]+)['"]`)
        );

        tools.push({
          id: crypto.randomUUID(),
          extension_id: extensionId,
          name: toolName,
          display_name: toolName.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
          description: descMatch ? descMatch[1] : '',
          category: inferCategory(toolName),
          input_schema: '{}',
        });
      }
    }

    // Strategy 2: If no tools found via grep, check index.ts for tool sets
    if (tools.length === 0) {
      const indexContent = await wslExec(`cat "${dirPath}/index.ts" 2>/dev/null || echo ""`);
      if (indexContent) {
        const toolSetPattern = /{ name: "(\w+)", defs: (\w+) }/g;
        let tsMatch;
        while ((tsMatch = toolSetPattern.exec(indexContent)) !== null) {
          tools.push({
            id: crypto.randomUUID(),
            extension_id: extensionId,
            name: tsMatch[1].toLowerCase(),
            display_name: tsMatch[1],
            description: `Tools from ${tsMatch[1]} category`,
            category: tsMatch[1].toLowerCase(),
            input_schema: '{}',
          });
        }
      }
    }
  } catch (err) {
    console.warn(`[ExtensionSync] Tool discovery failed for ${extensionId}:`, err.message);
  }

  return tools;
}

/**
 * Infer tool category from tool name convention.
 */
function inferCategory(toolName) {
  if (toolName.startsWith('crm_')) return 'crm';
  if (toolName.startsWith('campaign_')) return 'campaign';
  if (toolName.startsWith('marketing_')) return 'send';
  if (toolName.startsWith('analytics_')) return 'analytics';
  if (toolName.startsWith('linkedin_')) return 'linkedin';
  if (toolName.startsWith('inbound_')) return 'inbound';
  if (toolName.startsWith('sms_')) return 'sms';
  if (toolName.startsWith('voice_')) return 'voice';
  return 'general';
}

/**
 * Upsert extension into database (insert or update on conflict).
 */
function upsertExtension(ext) {
  const existing = get('SELECT id FROM extensions WHERE id = ?', [ext.id]);

  if (existing) {
    run(
      `UPDATE extensions SET
        name = ?, description = ?, version = ?, plugin_path = ?,
        config_schema = ?, status = ?, last_sync_at = datetime('now'),
        updated_at = datetime('now')
       WHERE id = ?`,
      [ext.name, ext.description, ext.version, ext.plugin_path,
       ext.config_schema, ext.status, ext.id]
    );
  } else {
    run(
      `INSERT INTO extensions (id, name, description, version, plugin_path, config_schema, status, enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))`,
      [ext.id, ext.name, ext.description, ext.version, ext.plugin_path, ext.config_schema, ext.status]
    );
  }
}

/**
 * Upsert tool into database.
 */
function upsertTool(tool) {
  const existing = get(
    'SELECT id FROM tools WHERE extension_id = ? AND name = ?',
    [tool.extension_id, tool.name]
  );

  if (existing) {
    run(
      `UPDATE tools SET
        display_name = ?, description = ?, category = ?,
        input_schema = ?, updated_at = datetime('now')
       WHERE extension_id = ? AND name = ?`,
      [tool.display_name, tool.description, tool.category,
       tool.input_schema, tool.extension_id, tool.name]
    );
  } else {
    run(
      `INSERT INTO tools (id, extension_id, name, display_name, description, category, input_schema)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [tool.id, tool.extension_id, tool.name, tool.display_name, tool.description, tool.category, tool.input_schema]
    );
  }
}

/**
 * Get all extensions from the database.
 */
function getAllExtensions() {
  return all('SELECT * FROM extensions ORDER BY name');
}

/**
 * Get extension by ID.
 */
function getExtension(id) {
  return get('SELECT * FROM extensions WHERE id = ?', [id]);
}

/**
 * Get tools for an extension.
 */
function getExtensionTools(extensionId) {
  return all('SELECT * FROM tools WHERE extension_id = ? ORDER BY category, name', [extensionId]);
}

/**
 * Get all tools.
 */
function getAllTools() {
  return all(`
    SELECT t.*, e.name as extension_name, e.domain_id
    FROM tools t
    JOIN extensions e ON t.extension_id = e.id
    ORDER BY t.category, t.name
  `);
}

/**
 * Get tools by category.
 */
function getToolsByCategory(category) {
  return all(`
    SELECT t.*, e.name as extension_name
    FROM tools t
    JOIN extensions e ON t.extension_id = e.id
    WHERE t.category = ?
    ORDER BY t.name
  `, [category]);
}

module.exports = {
  syncExtensions,
  discoverExtensionDirs,
  parseManifest,
  discoverTools,
  getAllExtensions,
  getExtension,
  getExtensionTools,
  getAllTools,
  getToolsByCategory,
  upsertExtension,
  upsertTool,
};
