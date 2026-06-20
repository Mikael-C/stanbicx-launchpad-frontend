/**
 * Rate Limiter Middleware
 * 
 * Express rate-limit configuration for different endpoint groups.
 * In development mode, rate limits are effectively disabled to
 * allow rapid polling without 429 errors during demos.
 */

const rateLimit = require('express-rate-limit');

const isDev = process.env.NODE_ENV === 'development';

/**
 * General API rate limiter
 * Dev: 10,000 requests per 15 minutes (effectively unlimited)
 * Prod: 200 requests per 15 minutes per IP
 */
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDev ? 10000 : 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many requests, please try again later.',
    retryAfter: '15 minutes',
  },
});

/**
 * Auth / sensitive endpoints rate limiter
 * Dev: 500 | Prod: 20 requests per 15 minutes per IP
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDev ? 500 : 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many authentication attempts, please try again later.',
    retryAfter: '15 minutes',
  },
});

/**
 * Transaction endpoints rate limiter
 * Dev: 500 | Prod: 30 requests per minute per IP
 */
const transactionLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: isDev ? 500 : 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many transaction requests, please try again later.',
    retryAfter: '1 minute',
  },
});

/**
 * Chat endpoint rate limiter
 * Dev: 500 | Prod: 60 requests per minute per IP
 */
const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: isDev ? 500 : 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Chat rate limit exceeded, please slow down.',
    retryAfter: '1 minute',
  },
});

/**
 * Admin endpoint rate limiter
 * Dev: 500 | Prod: 50 requests per 15 minutes per IP
 */
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDev ? 500 : 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Admin rate limit exceeded.',
    retryAfter: '15 minutes',
  },
});

module.exports = {
  generalLimiter,
  authLimiter,
  transactionLimiter,
  chatLimiter,
  adminLimiter,
};

