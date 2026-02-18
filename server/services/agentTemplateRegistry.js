/**
 * @file agentTemplateRegistry.js
 * @description Scans openclaw-skills directory and provides agent templates.
 * Agent templates are reusable agent definitions that can be assigned to campaigns.
 */

const fs = require('fs');
const path = require('path');

class AgentTemplateRegistry {
  constructor() {
    this.templates = [];
    this.skillsDir = path.join(__dirname, '../../openclaw-skills');
  }

  /**
   * Load all agent templates from openclaw-skills directory
   */
  loadTemplates() {
    try {
      if (!fs.existsSync(this.skillsDir)) {
        console.log('[AgentTemplateRegistry] openclaw-skills directory not found');
        this.templates = [];
        return;
      }

      const agentDirs = fs.readdirSync(this.skillsDir, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);

      this.templates = agentDirs.map(dir => {
        const soulPath = path.join(this.skillsDir, dir, 'SOUL.md');

        if (!fs.existsSync(soulPath)) {
          return null;
        }

        const soul = fs.readFileSync(soulPath, 'utf-8');

        // Extract name from first heading (# Agent Name)
        const nameMatch = soul.match(/^#\s+(.+)$/m);

        // Extract description from blockquote (> Description)
        const descMatch = soul.match(/^>\s+(.+)$/m);

        return {
          id: dir,
          name: nameMatch?.[1] || this.formatAgentName(dir),
          description: descMatch?.[1] || 'No description available',
          soulPath: `openclaw-skills/${dir}/SOUL.md`,
          defaultSchedule: 'manual',
          category: this.detectCategory(dir),
          agentType: dir,
        };
      }).filter(Boolean);

      console.log(`[AgentTemplateRegistry] Loaded ${this.templates.length} agent templates`);
    } catch (error) {
      console.error('[AgentTemplateRegistry] Error loading templates:', error);
      this.templates = [];
    }
  }

  /**
   * Format agent directory name to human-readable name
   */
  formatAgentName(dir) {
    return dir
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Detect agent category from directory name
   */
  detectCategory(agentId) {
    const id = agentId.toLowerCase();

    if (id.includes('hoa')) return 'lead-gen';
    if (id.includes('content') || id.includes('cms') || id.includes('writer')) return 'content';
    if (id.includes('social') || id.includes('facebook') || id.includes('twitter')) return 'social';
    if (id.includes('email') || id.includes('outreach')) return 'outreach';
    if (id.includes('network') || id.includes('linkedin')) return 'networking';
    if (id.includes('engagement') || id.includes('comment')) return 'engagement';
    if (id.includes('trading') || id.includes('market')) return 'trading';

    return 'general';
  }

  /**
   * Get all agent templates
   */
  getTemplates() {
    if (this.templates.length === 0) {
      this.loadTemplates();
    }
    return this.templates;
  }

  /**
   * Get agent template by ID
   */
  getTemplate(id) {
    const templates = this.getTemplates();
    return templates.find(t => t.id === id);
  }

  /**
   * Get templates by category
   */
  getTemplatesByCategory(category) {
    const templates = this.getTemplates();
    return templates.filter(t => t.category === category);
  }

  /**
   * Refresh templates (re-scan directory)
   */
  refresh() {
    this.loadTemplates();
    return this.templates;
  }
}

// Export singleton instance
module.exports = new AgentTemplateRegistry();
