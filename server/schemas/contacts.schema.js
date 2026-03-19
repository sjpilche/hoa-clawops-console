/**
 * Zod validation schemas for contacts routes.
 * Validates /api/contacts/leads, /api/contacts/hoa endpoints.
 */

const { z } = require('zod');

const createLeadBodySchema = z.object({
  email: z.string().email('Invalid email format').max(255).optional(),
  phone: z.string().max(30).optional(),
  first_name: z.string().max(100).optional(),
  last_name: z.string().max(100).optional(),
  full_name: z.string().max(200).optional(),
  company: z.string().max(200).optional(),
  title: z.string().max(200).optional(),
  source: z.string().max(100).optional(),
  notes: z.string().max(5000).optional(),
  status: z.enum(['new', 'contacted', 'qualified', 'converted', 'lost']).optional(),
}).refine(data => data.email || data.phone, {
  message: 'Either email or phone is required',
});

const updateLeadBodySchema = z.object({
  email: z.string().email().max(255).optional(),
  phone: z.string().max(30).optional(),
  first_name: z.string().max(100).optional(),
  last_name: z.string().max(100).optional(),
  full_name: z.string().max(200).optional(),
  company: z.string().max(200).optional(),
  title: z.string().max(200).optional(),
  source: z.string().max(100).optional(),
  notes: z.string().max(5000).optional(),
  status: z.enum(['new', 'contacted', 'qualified', 'converted', 'lost']).optional(),
}).strict();

const createHoaBodySchema = z.object({
  name: z.string().min(1, 'HOA name is required').max(300),
  address: z.string().max(500).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(2).optional(),
  zip: z.string().max(10).optional(),
  unit_count: z.number().int().min(1).max(100000).optional(),
  management_company: z.string().max(300).optional(),
  notes: z.string().max(5000).optional(),
});

module.exports = {
  createLeadBodySchema,
  updateLeadBodySchema,
  createHoaBodySchema,
};
