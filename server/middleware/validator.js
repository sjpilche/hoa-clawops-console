/**
 * @file validator.js
 * @description Zod-based request validation middleware.
 *
 * Usage:
 *   const { validate } = require('../middleware/validator');
 *   const { loginSchema } = require('../schemas');
 *
 *   router.post('/login', validate(loginSchema), (req, res) => {
 *     // req.validated.body contains validated data
 *   });
 */

const { AppError } = require('./errorHandler');

/**
 * Validation target types
 */
const ValidationTarget = {
  BODY: 'body',
  PARAMS: 'params',
  QUERY: 'query',
};

/**
 * Create a validation middleware for a given Zod schema.
 *
 * @param {Object} schema - Zod schema to validate against
 * @param {string} target - What part of request to validate ('body', 'params', 'query')
 * @returns {Function} Express middleware function
 */
function validate(schema, target = ValidationTarget.BODY) {
  return (req, res, next) => {
    try {
      // Get the data to validate based on target
      const dataToValidate = req[target];

      // Validate using Zod schema
      const result = schema.safeParse(dataToValidate);

      if (!result.success) {
        // Extract validation errors from Zod (safely handle missing errors array)
        const errorsList = result.error?.errors || result.error?.issues || [];
        const errors = errorsList.map((err) => ({
          field: err.path?.join('.') || 'unknown',
          message: err.message || 'Unknown validation error',
          code: err.code || 'UNKNOWN',
        }));

        // Create a user-friendly error message
        const firstError = errors[0] || { field: '', message: 'Validation failed' };
        const errorMessage = firstError.field
          ? `${firstError.field}: ${firstError.message}`
          : firstError.message;

        throw new AppError(
          errorMessage,
          'VALIDATION_ERROR',
          400,
          errors // Include all validation errors in metadata
        );
      }

      // Attach validated data to request for use in route handlers
      if (!req.validated) {
        req.validated = {};
      }
      req.validated[target] = result.data;

      next();
    } catch (error) {
      // If it's already an AppError, pass it through
      if (error instanceof AppError) {
        next(error);
      } else {
        // Unexpected validation error
        next(
          new AppError(
            `Validation failed: ${error.message}`,
            'VALIDATION_ERROR',
            400
          )
        );
      }
    }
  };
}

/**
 * Convenience function to validate request body
 * @param {Object} schema - Zod schema
 */
function validateBody(schema) {
  return validate(schema, ValidationTarget.BODY);
}

/**
 * Convenience function to validate route parameters
 * @param {Object} schema - Zod schema
 */
function validateParams(schema) {
  return validate(schema, ValidationTarget.PARAMS);
}

/**
 * Convenience function to validate query parameters
 * @param {Object} schema - Zod schema
 */
function validateQuery(schema) {
  return validate(schema, ValidationTarget.QUERY);
}

/**
 * Middleware to validate multiple targets at once
 * @param {Object} options - { body?: schema, params?: schema, query?: schema }
 */
function validateMultiple(options = {}) {
  return (req, res, next) => {
    try {
      req.validated = {};

      // Validate body if schema provided
      if (options.body) {
        const result = options.body.safeParse(req.body);
        if (!result.success) {
          const errors = result.error.errors.map((err) => ({
            field: `body.${err.path.join('.')}`,
            message: err.message,
            code: err.code,
          }));
          throw new AppError(
            `Body validation failed: ${errors[0].message}`,
            'VALIDATION_ERROR',
            400,
            errors
          );
        }
        req.validated.body = result.data;
      }

      // Validate params if schema provided
      if (options.params) {
        const result = options.params.safeParse(req.params);
        if (!result.success) {
          const errors = result.error.errors.map((err) => ({
            field: `params.${err.path.join('.')}`,
            message: err.message,
            code: err.code,
          }));
          throw new AppError(
            `Route parameter validation failed: ${errors[0].message}`,
            'VALIDATION_ERROR',
            400,
            errors
          );
        }
        req.validated.params = result.data;
      }

      // Validate query if schema provided
      if (options.query) {
        const result = options.query.safeParse(req.query);
        if (!result.success) {
          const errors = result.error.errors.map((err) => ({
            field: `query.${err.path.join('.')}`,
            message: err.message,
            code: err.code,
          }));
          throw new AppError(
            `Query parameter validation failed: ${errors[0].message}`,
            'VALIDATION_ERROR',
            400,
            errors
          );
        }
        req.validated.query = result.data;
      }

      next();
    } catch (error) {
      if (error instanceof AppError) {
        next(error);
      } else {
        next(
          new AppError(
            `Validation failed: ${error.message}`,
            'VALIDATION_ERROR',
            400
          )
        );
      }
    }
  };
}

module.exports = {
  validate,
  validateBody,
  validateParams,
  validateQuery,
  validateMultiple,
  ValidationTarget,
};
