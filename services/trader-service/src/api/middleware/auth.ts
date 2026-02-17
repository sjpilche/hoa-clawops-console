import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../../config';

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        role: string;
        [key: string]: any;
      };
    }
  }
}

/**
 * JWT Authentication Middleware
 * Verifies JWT tokens from the console and attaches user info to request
 */
export const authenticateJWT = (req: Request, res: Response, next: NextFunction) => {
  // Dev mode: if no JWT public key is configured, bypass auth
  if (!config.consoleJwtPublicKey) {
    req.user = { userId: 'dev', role: 'trd_admin' };
    return next();
  }

  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Missing or invalid authorization header. Expected: Bearer <token>'
    });
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, config.consoleJwtPublicKey, {
      issuer: config.consoleJwtIssuer,
      audience: 'trader-service',
      algorithms: ['RS256']
    }) as any;

    req.user = {
      userId: decoded.sub || decoded.userId,
      role: decoded.role || 'viewer',
      ...decoded
    };

    next();
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Token has expired'
      });
    }

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid token'
      });
    }

    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Token verification failed'
    });
  }
};

/**
 * Role-based Authorization Middleware
 * Requires user to have one of the specified roles
 */
export const requireRole = (...roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required'
      });
    }

    if (!req.user.role || !roles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: `Insufficient permissions. Required role: ${roles.join(' or ')}`
      });
    }

    next();
  };
};

/**
 * Optional Authentication Middleware
 * Attaches user if token is present, but doesn't require it
 */
export const optionalAuth = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, config.consoleJwtPublicKey, {
      issuer: config.consoleJwtIssuer,
      audience: 'trader-service',
      algorithms: ['RS256']
    }) as any;

    req.user = {
      userId: decoded.sub || decoded.userId,
      role: decoded.role || 'viewer',
      ...decoded
    };
  } catch (error) {
    // Ignore errors for optional auth
  }

  next();
};
