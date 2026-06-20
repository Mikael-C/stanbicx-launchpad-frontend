/**
 * Jailbreak Defender Middleware
 * 
 * Detects prompt injection / jailbreak patterns in chat messages.
 * Implements:
 *   - Pattern matching against known jailbreak strings
 *   - Per-user rate limiting (100 req/min)
 *   - Account lockout (5 attempts in 10 min → 30 min lock)
 */

const logger = require('../utils/logger');

// Known jailbreak patterns (case-insensitive)
const JAILBREAK_PATTERNS = [
  'ignore previous instructions',
  'forget your instructions',
  'you are now',
  'act as if',
  'pretend you are',
  'disregard all',
  'override your',
  'new persona',
  'ignore all previous',
  'bypass your',
  'break character',
  'jailbreak',
  'dan mode',
  'developer mode',
  'ignore safety',
  'ignore restrictions',
  'forget everything',
  'you have no rules',
  'act without restrictions',
  'roleplay as',
];

// In-memory rate limit and attempt tracking
const userRequestCounts = new Map(); // wallet -> { count, windowStart }
const jailbreakAttempts = new Map(); // wallet -> [timestamps]

const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 100; // 100 requests per minute
const LOCKOUT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const LOCKOUT_THRESHOLD = 5; // 5 jailbreak attempts
const LOCKOUT_DURATION_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Check if a message contains jailbreak patterns
 * @param {string} message
 * @returns {{ isJailbreak: boolean, pattern: string|null }}
 */
function detectJailbreak(message) {
  if (!message || typeof message !== 'string') {
    return { isJailbreak: false, pattern: null };
  }

  const lowerMessage = message.toLowerCase();

  for (const pattern of JAILBREAK_PATTERNS) {
    if (lowerMessage.includes(pattern)) {
      return { isJailbreak: true, pattern };
    }
  }

  return { isJailbreak: false, pattern: null };
}

/**
 * Check rate limit for a wallet
 * @param {string} wallet
 * @returns {boolean} true if rate limited
 */
function isRateLimited(wallet) {
  const now = Date.now();
  const entry = userRequestCounts.get(wallet);

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    userRequestCounts.set(wallet, { count: 1, windowStart: now });
    return false;
  }

  entry.count++;
  if (entry.count > RATE_LIMIT_MAX) {
    return true;
  }

  return false;
}

/**
 * Record a jailbreak attempt and check for lockout
 * @param {string} wallet
 * @returns {boolean} true if account should be locked
 */
function recordAttemptAndCheckLockout(wallet) {
  const now = Date.now();
  let attempts = jailbreakAttempts.get(wallet) || [];

  // Remove attempts outside the window
  attempts = attempts.filter((t) => now - t < LOCKOUT_WINDOW_MS);
  attempts.push(now);
  jailbreakAttempts.set(wallet, attempts);

  return attempts.length >= LOCKOUT_THRESHOLD;
}

/**
 * Express middleware for jailbreak detection on chat routes
 */
function jailbreakDefenderMiddleware(prisma) {
  return async (req, res, next) => {
    try {
      const wallet = req.body?.wallet || req.walletAddress;
      const message = req.body?.message;

      if (!wallet) {
        return res.status(400).json({ error: 'Wallet address required' });
      }

      // Check if user is locked
      const user = await prisma.user.findUnique({
        where: { walletAddress: wallet.toLowerCase() },
      });

      if (user?.isLocked) {
        if (user.lockExpiresAt && new Date(user.lockExpiresAt) > new Date()) {
          logger.warn('Locked user attempted access', { wallet });
          return res.status(423).json({
            error: 'Account temporarily locked due to suspicious activity',
            lockedUntil: user.lockExpiresAt,
          });
        }
        // Lock expired, unlock the account
        await prisma.user.update({
          where: { walletAddress: wallet.toLowerCase() },
          data: { isLocked: false, lockExpiresAt: null },
        });
      }

      // Rate limit check
      if (isRateLimited(wallet)) {
        logger.warn('Rate limit exceeded', { wallet });
        return res.status(429).json({ error: 'Rate limit exceeded. Please slow down.' });
      }

      // Jailbreak pattern check
      if (message) {
        const { isJailbreak, pattern } = detectJailbreak(message);

        if (isJailbreak) {
          logger.warn('Jailbreak attempt detected', { wallet, pattern });

          // Record attempt in database
          await prisma.jailbreakAttempt.create({
            data: {
              walletAddress: wallet.toLowerCase(),
              userId: user?.id || null,
              message: message.substring(0, 500), // Truncate
              patternMatched: pattern,
              ipAddress: req.ip || req.connection?.remoteAddress || null,
              blocked: true,
            },
          });

          // Check for lockout
          const shouldLock = recordAttemptAndCheckLockout(wallet);

          if (shouldLock && user) {
            const lockExpiry = new Date(Date.now() + LOCKOUT_DURATION_MS);
            await prisma.user.update({
              where: { id: user.id },
              data: { isLocked: true, lockExpiresAt: lockExpiry },
            });

            logger.warn('Account locked due to repeated jailbreak attempts', {
              wallet,
              lockExpiry,
            });

            return res.status(423).json({
              error: 'Account locked for 30 minutes due to repeated policy violations',
              lockedUntil: lockExpiry,
            });
          }

          return res.status(400).json({
            error: 'Message rejected: policy violation detected',
            warning: 'Repeated violations may result in account lockout',
          });
        }
      }

      next();
    } catch (err) {
      logger.error('Jailbreak defender error', { error: err.message });
      next(); // Fail open to not break the service
    }
  };
}

module.exports = {
  JAILBREAK_PATTERNS,
  detectJailbreak,
  isRateLimited,
  recordAttemptAndCheckLockout,
  jailbreakDefenderMiddleware,
};
