import { Request, Response, NextFunction } from 'express';
import { z, ZodSchema } from 'zod';

/**
 * Generic Validation Middleware
 * Validates request body against a Zod schema
 */
export const validate = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Validation failed',
          details: error.errors.map(err => ({
            path: err.path.join('.'),
            message: err.message
          }))
        });
      }
      next(error);
    }
  };
};

/**
 * Query Parameter Validation Middleware
 */
export const validateQuery = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      schema.parse(req.query);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Invalid query parameters',
          details: error.errors.map(err => ({
            path: err.path.join('.'),
            message: err.message
          }))
        });
      }
      next(error);
    }
  };
};

// ============================================================================
// Validation Schemas
// ============================================================================

/**
 * Order Intent Validation Schema
 */
export const orderIntentSchema = z.object({
  symbol: z.string()
    .regex(/^[A-Z]{1,5}$/, 'Symbol must be 1-5 uppercase letters')
    .transform(s => s.toUpperCase()),
  side: z.enum(['buy', 'sell'], {
    errorMap: () => ({ message: 'Side must be either "buy" or "sell"' })
  }),
  qty: z.number()
    .positive('Quantity must be positive')
    .int('Quantity must be a whole number')
    .max(10000, 'Quantity cannot exceed 10,000 shares'),
  orderType: z.enum(['market', 'limit', 'stop', 'stop_limit'], {
    errorMap: () => ({ message: 'Invalid order type' })
  }),
  limitPrice: z.number().positive().optional(),
  stopPrice: z.number().positive().optional(),
  timeInForce: z.enum(['day', 'gtc', 'ioc', 'fok']).default('day'),
  signalPrice: z.number().positive().optional()
}).refine(
  (data) => {
    // Limit orders must have a limit price
    if (data.orderType === 'limit' && !data.limitPrice) {
      return false;
    }
    // Stop orders must have a stop price
    if ((data.orderType === 'stop' || data.orderType === 'stop_limit') && !data.stopPrice) {
      return false;
    }
    return true;
  },
  {
    message: 'Limit/stop orders require corresponding price fields'
  }
);

/**
 * Strategy Parameters Validation Schema
 */
export const strategyParamsSchema = z.object({
  // MA Crossover params
  fastPeriod: z.number()
    .int()
    .min(2, 'Fast period must be at least 2')
    .max(200, 'Fast period cannot exceed 200')
    .optional(),
  slowPeriod: z.number()
    .int()
    .min(5, 'Slow period must be at least 5')
    .max(500, 'Slow period cannot exceed 500')
    .optional(),
  // RSI Mean Reversion params
  rsiPeriod: z.number()
    .int()
    .min(2, 'RSI period must be at least 2')
    .max(200, 'RSI period cannot exceed 200')
    .optional(),
  oversoldThreshold: z.number()
    .min(1)
    .max(49, 'Oversold threshold must be below 50')
    .optional(),
  overboughtThreshold: z.number()
    .min(51, 'Overbought threshold must be above 50')
    .max(99)
    .optional(),
  // Common params
  positionSize: z.number()
    .positive()
    .max(10000, 'Position size cannot exceed $10,000')
    .optional(),
  symbols: z.array(
    z.string().regex(/^[A-Z]{1,5}$/, 'Each symbol must be 1-5 uppercase letters')
  )
    .min(1, 'At least one symbol required')
    .max(10, 'Cannot track more than 10 symbols')
    .optional()
}).passthrough() // Allow additional strategy-specific params to pass through
  .refine(
  (data) => {
    // If both MA periods provided, slow must be > fast
    if (data.fastPeriod && data.slowPeriod && data.fastPeriod >= data.slowPeriod) {
      return false;
    }
    return true;
  },
  {
    message: 'Slow period must be greater than fast period'
  }
);

/**
 * Risk Limit Update Validation Schema
 */
export const riskLimitSchema = z.object({
  limitType: z.string()
    .min(1, 'Limit type is required')
    .regex(/^[a-z_]+$/, 'Limit type must be lowercase with underscores'),
  value: z.number()
    .positive('Limit value must be positive')
    .max(1000000, 'Limit value cannot exceed 1,000,000'),
  unit: z.enum(['USD', 'percent', 'count', 'bps'], {
    errorMap: () => ({ message: 'Invalid unit type' })
  })
});

/**
 * Kill Switch Trigger Validation Schema
 */
export const killSwitchSchema = z.object({
  mode: z.enum(['soft', 'hard'], {
    errorMap: () => ({ message: 'Mode must be either "soft" or "hard"' })
  }),
  reason: z.string()
    .min(10, 'Reason must be at least 10 characters')
    .max(500, 'Reason cannot exceed 500 characters')
});

/**
 * Query Pagination Validation Schema
 */
export const paginationSchema = z.object({
  limit: z.string()
    .optional()
    .transform(val => val ? parseInt(val, 10) : 100)
    .pipe(z.number().int().min(1).max(1000)),
  offset: z.string()
    .optional()
    .transform(val => val ? parseInt(val, 10) : 0)
    .pipe(z.number().int().min(0))
});

/**
 * Symbol Parameter Validation Schema
 */
export const symbolSchema = z.object({
  symbol: z.string()
    .regex(/^[A-Z]{1,5}$/, 'Symbol must be 1-5 uppercase letters')
    .transform(s => s.toUpperCase())
});

/**
 * Date Range Query Validation Schema
 */
export const dateRangeSchema = z.object({
  startDate: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Start date must be in YYYY-MM-DD format')
    .optional(),
  endDate: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'End date must be in YYYY-MM-DD format')
    .optional()
}).refine(
  (data) => {
    if (data.startDate && data.endDate) {
      return new Date(data.startDate) <= new Date(data.endDate);
    }
    return true;
  },
  {
    message: 'End date must be after start date'
  }
);
