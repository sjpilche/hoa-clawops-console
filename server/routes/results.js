/**
 * @file results.js (routes)
 * @description Data extraction results endpoints (Phase 6).
 * Scaffolded — will be implemented when results explorer is built.
 */

const { Router } = require('express');
const { authenticate } = require('../middleware/auth');

const router = Router();
router.use(authenticate);

router.get('/', (_req, res) => {
  res.json({ results: [], message: 'Results explorer coming in Phase 6' });
});

module.exports = router;
