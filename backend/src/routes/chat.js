/**
 * Chat Routes
 * 
 * Chat endpoint with jailbreak defense.
 */

const express = require('express');
const router = express.Router();
const { jailbreakDefenderMiddleware } = require('../middleware/jailbreakDefender');
const { isValidAddress } = require('../services/blockchain');
const logger = require('../utils/logger');

module.exports = function (prisma) {
  /**
   * POST /api/chat
   * body: { wallet, message }
   * Chat endpoint with jailbreak defense
   */
  router.post('/', jailbreakDefenderMiddleware(prisma), async (req, res) => {
    try {
      const { wallet, message } = req.body;

      if (!wallet || !isValidAddress(wallet)) {
        return res.status(400).json({ error: 'Valid wallet address required' });
      }
      if (!message || typeof message !== 'string') {
        return res.status(400).json({ error: 'Message is required' });
      }
      if (message.length > 2000) {
        return res.status(400).json({ error: 'Message too long (max 2000 characters)' });
      }

      // In production, this would forward to an AI model.
      // For now, return a placeholder response.
      res.json({
        success: true,
        response: 'Thank you for your message. How can I help you with the SX Launchpad?',
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      logger.error('Chat error', { error: err.message });
      res.status(500).json({ error: 'Failed to process chat message' });
    }
  });

  /**
   * GET /api/jailbreak/attempts
   * Returns recent jailbreak attempts (admin dashboard)
   */
  router.get('/jailbreak/attempts', async (req, res) => {
    try {
      const { limit = 50, offset = 0 } = req.query;

      const [attempts, total] = await Promise.all([
        prisma.jailbreakAttempt.findMany({
          orderBy: { createdAt: 'desc' },
          skip: parseInt(offset),
          take: parseInt(limit),
        }),
        prisma.jailbreakAttempt.count(),
      ]);

      res.json({
        attempts: attempts.map((a) => ({
          id: a.id,
          walletAddress: a.walletAddress,
          message: a.message,
          patternMatched: a.patternMatched,
          blocked: a.blocked,
          createdAt: a.createdAt,
        })),
        total,
        offset: parseInt(offset),
        limit: parseInt(limit),
      });
    } catch (err) {
      logger.error('Get jailbreak attempts error', { error: err.message });
      res.status(500).json({ error: 'Failed to retrieve jailbreak attempts' });
    }
  });

  /**
   * GET /api/jailbreak/stats
   * Returns jailbreak statistics
   */
  router.get('/jailbreak/stats', async (req, res) => {
    try {
      const [totalAttempts, blockedCount, lockedAccounts] = await Promise.all([
        prisma.jailbreakAttempt.count(),
        prisma.jailbreakAttempt.count({ where: { blocked: true } }),
        prisma.user.count({ where: { isLocked: true } }),
      ]);

      // Get attempts by pattern
      const patternBreakdown = await prisma.jailbreakAttempt.groupBy({
        by: ['patternMatched'],
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
      });

      res.json({
        totalAttempts,
        blockedCount,
        lockedAccounts,
        blockRate: totalAttempts > 0
          ? Math.round((blockedCount / totalAttempts) * 10000) / 100
          : 0,
        patternBreakdown: patternBreakdown.map((p) => ({
          pattern: p.patternMatched,
          count: p._count.id,
        })),
      });
    } catch (err) {
      logger.error('Get jailbreak stats error', { error: err.message });
      res.status(500).json({ error: 'Failed to retrieve jailbreak stats' });
    }
  });

  return router;
};
