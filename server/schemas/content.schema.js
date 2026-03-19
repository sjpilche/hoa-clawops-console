/**
 * Zod validation schemas for content queue routes.
 */

const { z } = require('zod');

const createContentBodySchema = z.object({
  content: z.string().min(1, 'Content is required').max(10000),
  topic: z.string().max(200).optional(),
  platform: z.enum(['facebook', 'linkedin', 'twitter', 'instagram']).default('facebook'),
  post_type: z.enum(['page', 'group', 'story', 'reel']).default('page'),
  scheduled_for: z.string().datetime().optional().nullable(),
  source_agent: z.string().max(100).optional(),
});

const createCampaignBodySchema = z.object({
  name: z.string().min(1, 'Campaign name is required').max(200),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens').optional(),
  description: z.string().max(1000).optional(),
  company: z.string().max(200).optional(),
  type: z.enum(['outbound', 'inbound', 'nurture', 'referral', 'general']).optional(),
  color: z.string().max(20).regex(/^#[0-9a-fA-F]{6}$/, 'Color must be a hex color like #ff0000').optional(),
  icon: z.string().max(10).optional(),
});

module.exports = {
  createContentBodySchema,
  createCampaignBodySchema,
};
