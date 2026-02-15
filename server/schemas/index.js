/**
 * @file index.js
 * @description Exports all Zod validation schemas for easy importing.
 */

const commonSchemas = require('./common.schema');
const authSchemas = require('./auth.schema');
const agentSchemas = require('./agent.schema');
const chatSchemas = require('./chat.schema');
const runSchemas = require('./run.schema');
const settingsSchemas = require('./settings.schema');
const domainSchemas = require('./domain.schema');

module.exports = {
  // Common schemas
  ...commonSchemas,

  // Auth schemas
  ...authSchemas,

  // Agent schemas
  ...agentSchemas,

  // Chat schemas
  ...chatSchemas,

  // Run schemas
  ...runSchemas,

  // Settings schemas
  ...settingsSchemas,

  // Domain, extension, hierarchy, team schemas (v2.0)
  ...domainSchemas,
};
