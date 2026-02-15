/**
 * @file domain.schema.js
 * @description Zod schemas for domain, extension, tool, hierarchy, and team endpoints.
 */

const { z } = require('zod');

// ---- Domain Schemas ----

const createDomainSchema = z.object({
  body: z.object({
    name: z.string().trim().min(1).max(50).regex(/^[a-z0-9-]+$/, 'Name must be lowercase alphanumeric with hyphens'),
    display_name: z.string().trim().min(1).max(100),
    description: z.string().max(500).optional(),
    icon: z.string().max(50).optional().default('Box'),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Must be a hex color').optional().default('#6366f1'),
    status: z.enum(['active', 'disabled']).optional().default('active'),
    db_type: z.enum(['postgresql', 'mysql', 'sqlite']).nullish(),
    db_config: z.object({
      host: z.string().optional(),
      port: z.number().int().min(1).max(65535).optional(),
      database: z.string().optional(),
      user: z.string().optional(),
      password: z.string().optional(),
      ssl: z.boolean().optional(),
    }).nullish(),
    dashboard_url: z.string().url().nullish(),
    dashboard_port: z.number().int().min(1).max(65535).nullish(),
  }),
});

const updateDomainSchema = z.object({
  body: z.object({
    name: z.string().trim().min(1).max(50).regex(/^[a-z0-9-]+$/).optional(),
    display_name: z.string().trim().min(1).max(100).optional(),
    description: z.string().max(500).optional(),
    icon: z.string().max(50).optional(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    status: z.enum(['active', 'disabled']).optional(),
    db_type: z.enum(['postgresql', 'mysql', 'sqlite']).nullish(),
    db_config: z.object({
      host: z.string().optional(),
      port: z.number().int().min(1).max(65535).optional(),
      database: z.string().optional(),
      user: z.string().optional(),
      password: z.string().optional(),
      ssl: z.boolean().optional(),
    }).nullish(),
    dashboard_url: z.string().url().nullish(),
    dashboard_port: z.number().int().min(1).max(65535).nullish(),
  }),
});

// ---- Extension Schemas ----

const updateExtensionConfigSchema = z.object({
  body: z.object({
    config: z.record(z.any()),
    domain_id: z.string().uuid().nullish(),
  }),
});

// ---- Hierarchy Schemas ----

const createHierarchySchema = z.object({
  body: z.object({
    agent_id: z.string().uuid(),
    parent_id: z.string().uuid().nullish(),
    domain_id: z.string().uuid(),
    hierarchy_type: z.enum(['command', 'delegation', 'collaboration']).optional().default('command'),
    order_index: z.number().int().min(0).optional().default(0),
  }),
});

const updateHierarchySchema = z.object({
  body: z.object({
    parent_id: z.string().uuid().nullish(),
    hierarchy_type: z.enum(['command', 'delegation', 'collaboration']).optional(),
    order_index: z.number().int().min(0).optional(),
  }),
});

// ---- Team Schemas ----

const createTeamSchema = z.object({
  body: z.object({
    domain_id: z.string().uuid(),
    name: z.string().trim().min(1).max(100),
    description: z.string().max(500).optional(),
    coordination_strategy: z.enum(['sequential', 'parallel', 'conditional']).optional().default('sequential'),
  }),
});

const updateTeamSchema = z.object({
  body: z.object({
    name: z.string().trim().min(1).max(100).optional(),
    description: z.string().max(500).optional(),
    coordination_strategy: z.enum(['sequential', 'parallel', 'conditional']).optional(),
  }),
});

const addTeamMemberSchema = z.object({
  body: z.object({
    agent_id: z.string().uuid(),
    role: z.string().max(50).optional(),
    order_index: z.number().int().min(0).optional().default(0),
  }),
});

module.exports = {
  createDomainSchema,
  updateDomainSchema,
  updateExtensionConfigSchema,
  createHierarchySchema,
  updateHierarchySchema,
  createTeamSchema,
  updateTeamSchema,
  addTeamMemberSchema,
};
