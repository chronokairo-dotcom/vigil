/**
 * Professional Logging & Error Handling Middleware
 * Provides structured logging, error tracking, and performance monitoring
 */

import { Request, Response, NextFunction, Express } from 'express';
import fs from 'fs';
import path from 'path';

export interface RequestLog {
  timestamp: string;
  method: string;
  path: string;
  status: number;
  duration: number;
  userId?: string;
  userAgent: string;
  ip: string;
  error?: {
    code: string;
    message: string;
  };
}

export class Logger {
  private logDir: string;
  private logLevel: 'debug' | 'info' | 'warn' | 'error';

  constructor(logDir: string = './logs', logLevel: 'debug' | 'info' | 'warn' | 'error' = 'info') {
    this.logDir = logDir;
    this.logLevel = logLevel;
    
    // Ensure log directory exists
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  }

  private getLogFilePath(type: string): string {
    const date = new Date().toISOString().split('T')[0];
    return path.join(this.logDir, `${type}-${date}.log`);
  }

  private write(level: string, message: string, data?: any): void {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      ...(data && { data }),
    };

    const logString = JSON.stringify(logEntry) + '\n';
    const logFile = this.getLogFilePath(level.toLowerCase());

    fs.appendFileSync(logFile, logString, 'utf8');

    // Also log to console in development
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[${timestamp}] [${level}] ${message}`, data || '');
    }
  }

  debug(message: string, data?: any): void {
    if (['debug'].includes(this.logLevel)) {
      this.write('DEBUG', message, data);
    }
  }

  info(message: string, data?: any): void {
    if (['debug', 'info'].includes(this.logLevel)) {
      this.write('INFO', message, data);
    }
  }

  warn(message: string, data?: any): void {
    if (['debug', 'info', 'warn'].includes(this.logLevel)) {
      this.write('WARN', message, data);
    }
  }

  error(message: string, error?: Error | any): void {
    this.write('ERROR', message, {
      name: error?.name,
      message: error?.message,
      stack: error?.stack,
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// REQUEST/RESPONSE LOGGING MIDDLEWARE
// ═══════════════════════════════════════════════════════════════════════════════

export function requestLoggingMiddleware(logger: Logger) {
  return (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    const originalSend = res.send;

    // Intercept response
    res.send = function (data: any) {
      const duration = Date.now() - startTime;
      const log: RequestLog = {
        timestamp: new Date().toISOString(),
        method: req.method,
        path: req.path,
        status: res.statusCode,
        duration,
        userAgent: req.get('user-agent') || 'unknown',
        ip: req.ip || 'unknown',
      };

      // Add user ID if authenticated
      if ((req as any).userId) {
        log.userId = (req as any).userId;
      }

      // Log errors
      if (res.statusCode >= 400) {
        logger.warn(`HTTP ${res.statusCode}`, log);
      } else {
        logger.info(`HTTP ${res.statusCode}`, log);
      }

      return originalSend.call(this, data);
    };

    next();
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// ERROR HANDLING MIDDLEWARE
// ═══════════════════════════════════════════════════════════════════════════════

export interface ApiError extends Error {
  code?: string;
  statusCode?: number;
  details?: any;
}

export class ValidationError extends Error implements ApiError {
  code = 'VALIDATION_ERROR';
  statusCode = 400;

  constructor(message: string, public details?: any) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class AuthenticationError extends Error implements ApiError {
  code = 'AUTHENTICATION_ERROR';
  statusCode = 401;

  constructor(message: string = 'Authentication failed') {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends Error implements ApiError {
  code = 'AUTHORIZATION_ERROR';
  statusCode = 403;

  constructor(message: string = 'Forbidden') {
    super(message);
    this.name = 'AuthorizationError';
  }
}

export class NotFoundError extends Error implements ApiError {
  code = 'NOT_FOUND';
  statusCode = 404;

  constructor(resource: string = 'Resource') {
    super(`${resource} not found`);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends Error implements ApiError {
  code = 'CONFLICT';
  statusCode = 409;

  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

export class RateLimitError extends Error implements ApiError {
  code = 'RATE_LIMIT_EXCEEDED';
  statusCode = 429;

  constructor(message: string = 'Too many requests') {
    super(message);
    this.name = 'RateLimitError';
  }
}

export function errorHandlingMiddleware(logger: Logger) {
  return (error: any, req: Request, res: Response, _next: NextFunction) => {
    const statusCode = error.statusCode || 500;
    const code = error.code || 'INTERNAL_ERROR';
    const message = error.message || 'An unexpected error occurred';

    logger.error(`${code}: ${message}`, error);

    // Don't leak sensitive information in production
    const details = process.env.NODE_ENV === 'development' ? error.details : undefined;

    res.status(statusCode).json({
      success: false,
      error: {
        code,
        message,
        ...(details && { details }),
      },
      timestamp: new Date().toISOString(),
    });
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PERFORMANCE MONITORING
// ═══════════════════════════════════════════════════════════════════════════════

export interface PerformanceMetrics {
  avgResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  errorRate: number;
  requestsPerSecond: number;
}

export class PerformanceMonitor {
  private metrics: Map<string, number[]> = new Map();
  private errors: Map<string, number> = new Map();
  private startTime = Date.now();

  recordRequest(endpoint: string, duration: number, hasError: boolean): void {
    // Record response time
    if (!this.metrics.has(endpoint)) {
      this.metrics.set(endpoint, []);
    }
    this.metrics.get(endpoint)!.push(duration);

    // Record errors
    if (hasError) {
      this.errors.set(endpoint, (this.errors.get(endpoint) || 0) + 1);
    }
  }

  getMetrics(): Map<string, PerformanceMetrics> {
    const result = new Map<string, PerformanceMetrics>();
    const uptime = (Date.now() - this.startTime) / 1000;

    for (const [endpoint, durations] of this.metrics.entries()) {
      const sorted = [...durations].sort((a, b) => a - b);
      const errors = this.errors.get(endpoint) || 0;

      result.set(endpoint, {
        avgResponseTime: sorted.reduce((a, b) => a + b, 0) / sorted.length,
        p95ResponseTime: sorted[Math.floor(sorted.length * 0.95)],
        p99ResponseTime: sorted[Math.floor(sorted.length * 0.99)],
        errorRate: errors / durations.length,
        requestsPerSecond: durations.length / uptime,
      });
    }

    return result;
  }

  clear(): void {
    this.metrics.clear();
    this.errors.clear();
    this.startTime = Date.now();
  }
}
