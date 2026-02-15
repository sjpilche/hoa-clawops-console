const { z } = require('zod');

/**
 * Lead data schema for WordPress form submissions
 */
const leadCaptureSchema = z.object({
  // Core contact info
  name: z.string().min(1, 'Name is required').max(200),
  email: z.string().email('Invalid email address'),
  phone: z.string().optional(),

  // HOA information
  hoa_name: z.string().min(1, 'HOA name is required').max(300),
  hoa_units: z.coerce.number().int().positive().optional(),

  // Project details
  project_type: z.enum([
    'roof_replacement',
    'pool_renovation',
    'parking_lot',
    'elevator_repair',
    'siding_replacement',
    'hvac_system',
    'landscaping',
    'other'
  ]).optional(),

  project_description: z.string().max(5000).optional(),
  estimated_amount: z.coerce.number().positive().optional(),
  project_urgency: z.enum([
    'immediate',
    'within_3_months',
    'within_6_months',
    'within_year',
    'planning'
  ]).optional(),

  // Additional context
  current_reserve_fund: z.coerce.number().nonnegative().optional(),
  special_assessment_concerns: z.boolean().optional(),
  message: z.string().max(10000).optional(),

  // Metadata
  form_id: z.string().optional(),
  source_url: z.string().url().optional(),
  timestamp: z.string().optional(),
  signature: z.string().optional(), // HMAC signature for verification
});

module.exports = { leadCaptureSchema };
