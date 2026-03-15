/**
 * @file directory.js (routes)
 * @description Agent Directory API — serves SOUL.md content for agent detail drawer.
 *
 * ENDPOINTS:
 *   GET /api/directory/:agentName/soul — Returns SOUL.md content for a given agent
 */

const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
const path = require('path');
const fs = require('fs');

const router = Router();
router.use(authenticate);

const SKILLS_DIR = path.join(__dirname, '../../openclaw-skills');

/**
 * GET /api/directory/:agentName/soul
 * Returns the SOUL.md content for the specified agent.
 */
router.get('/:agentName/soul', (req, res, next) => {
  try {
    const agentName = req.params.agentName;

    // Sanitize: only allow alphanumeric, hyphens, underscores
    if (!/^[a-zA-Z0-9_-]+$/.test(agentName)) {
      return res.status(400).json({ error: 'Invalid agent name' });
    }

    const soulPath = path.join(SKILLS_DIR, agentName, 'SOUL.md');

    // Prevent path traversal
    const resolved = path.resolve(soulPath);
    if (!resolved.startsWith(path.resolve(SKILLS_DIR))) {
      return res.status(400).json({ error: 'Invalid agent name' });
    }

    if (!fs.existsSync(soulPath)) {
      return res.json({ soul: null, agentName });
    }

    const soul = fs.readFileSync(soulPath, 'utf8');
    res.json({ soul, agentName });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
