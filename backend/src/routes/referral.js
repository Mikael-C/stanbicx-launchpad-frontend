/**
 * Referral Routes
 * 
 * Manage referral codes, registrations, and leaderboard.
 */

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { authMiddleware } = require('../middleware/auth');
const { isValidAddress } = require('../services/blockchain');
const logger = require('../utils/logger');

module.exports = function (prisma) {
  /**
   * GET /api/referral/stats?wallet=0x...
   * Returns referral statistics for a user
   */
  router.get('/stats', async (req, res) => {
    try {
      const { wallet } = req.query;

      if (!wallet || !isValidAddress(wallet)) {
        return res.status(400).json({ error: 'Valid wallet address required' });
      }

      const user = await prisma.user.findUnique({
        where: { walletAddress: wallet.toLowerCase() },
      });

      if (!user) {
        return res.status(404).json({ error: 'User not found. Register first.' });
      }

      // Get referral code (first 8 chars of sxId)
      const referralCode = user.sxId;

      const referrals = await prisma.referral.findMany({
        where: { referrerId: user.id },
      });

      const successfulReferrals = referrals.filter((r) => r.status === 'successful');
      const pendingReferrals = referrals.filter((r) => r.status === 'pending' || r.status === 'registered');
      const totalRewardsEarned = referrals.reduce((sum, r) => sum + r.rewardAmount, 0);

      // Calculate rank
      const allReferrers = await prisma.referral.groupBy({
        by: ['referrerId'],
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
      });

      let rank = 0;
      for (let i = 0; i < allReferrers.length; i++) {
        if (allReferrers[i].referrerId === user.id) {
          rank = i + 1;
          break;
        }
      }

      const baseUrl = process.env.CORS_ORIGIN || 'http://localhost:3000';

      res.json({
        referralCode,
        referralLink: `${baseUrl}/ref/${referralCode}`,
        referralCount: referrals.length,
        successfulReferrals: successfulReferrals.length,
        pendingReferrals: pendingReferrals.length,
        totalRewardsEarned: Math.round(totalRewardsEarned * 100) / 100,
        rank: rank || 'unranked',
      });
    } catch (err) {
      logger.error('Referral stats error', { error: err.message });
      res.status(500).json({ error: 'Failed to retrieve referral stats' });
    }
  });

  /**
   * POST /api/referral/register
   * body: { wallet, referrerCode }
   * Register a new user with a referral code
   */
  router.post('/register', async (req, res) => {
    try {
      const { wallet, referrerCode } = req.body;

      if (!wallet || !isValidAddress(wallet)) {
        return res.status(400).json({ error: 'Valid wallet address required' });
      }

      // Check if user already exists
      let user = await prisma.user.findUnique({
        where: { walletAddress: wallet.toLowerCase() },
      });

      if (user) {
        return res.status(400).json({
          error: 'Wallet already registered',
          referralCode: user.sxId,
        });
      }

      // Create new user
      const sxId = `SX-${uuidv4().slice(0, 8).toUpperCase()}`;
      user = await prisma.user.create({
        data: {
          walletAddress: wallet.toLowerCase(),
          sxId,
        },
      });

      // If referrer code provided, create referral relationship
      if (referrerCode) {
        const referrer = await prisma.user.findUnique({
          where: { sxId: referrerCode },
        });

        if (referrer && referrer.id !== user.id) {
          await prisma.referral.create({
            data: {
              referrerId: referrer.id,
              referredId: user.id,
              referralCode: referrerCode,
              status: 'pending',
            },
          });

          logger.info('Referral registered', {
            referrer: referrer.walletAddress,
            referred: wallet,
          });
        }
      }

      res.json({
        success: true,
        referralCode: sxId,
        wallet: wallet.toLowerCase(),
      });
    } catch (err) {
      logger.error('Referral register error', { error: err.message });
      res.status(500).json({ error: 'Failed to register' });
    }
  });

  /**
   * GET /api/referral/code?wallet=0x...
   * Returns the referral code and link for a user
   */
  router.get('/code', async (req, res) => {
    try {
      const { wallet } = req.query;
      if (!wallet || !isValidAddress(wallet)) {
        return res.status(400).json({ error: 'Valid wallet address required' });
      }

      const user = await prisma.user.findUnique({
        where: { walletAddress: wallet.toLowerCase() },
      });

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const referralCode = user.sxId || `SX-${wallet.slice(2, 10).toUpperCase()}`;
      const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

      res.json({
        referralCode,
        referralLink: `${baseUrl}/register?ref=${referralCode}`,
        wallet: wallet.toLowerCase(),
      });
    } catch (err) {
      logger.error('Referral code error', { error: err.message });
      res.status(500).json({ error: 'Failed to get referral code' });
    }
  });

  /**
   * GET /api/leaderboard
   * Returns top 10 referrers
   */
  router.get('/', async (req, res) => {

    try {
      // Try to get cached leaderboard first
      const cached = await prisma.leaderboardCache.findMany({
        orderBy: { rank: 'asc' },
        take: 10,
      });

      if (cached.length > 0) {
        return res.json({
          leaderboard: cached.map((entry) => ({
            rank: entry.rank,
            wallet: entry.wallet,
            count: entry.count,
            volume: entry.volume,
          })),
          updatedAt: cached[0]?.updatedAt,
        });
      }

      // Build leaderboard from referrals
      const referralStats = await prisma.referral.groupBy({
        by: ['referrerId'],
        _count: { id: true },
        _sum: { rewardAmount: true },
        orderBy: { _count: { id: 'desc' } },
        take: 10,
      });

      const leaderboard = [];
      for (let i = 0; i < referralStats.length; i++) {
        const stat = referralStats[i];
        const user = await prisma.user.findUnique({
          where: { id: stat.referrerId },
          select: { walletAddress: true },
        });

        if (user) {
          const entry = {
            rank: i + 1,
            wallet: user.walletAddress,
            count: stat._count.id,
            volume: stat._sum.rewardAmount || 0,
          };
          leaderboard.push(entry);

          // Cache the entry
          await prisma.leaderboardCache.upsert({
            where: { wallet: user.walletAddress },
            create: {
              wallet: user.walletAddress,
              rank: i + 1,
              count: stat._count.id,
              volume: stat._sum.rewardAmount || 0,
            },
            update: {
              rank: i + 1,
              count: stat._count.id,
              volume: stat._sum.rewardAmount || 0,
            },
          });
        }
      }

      res.json({ leaderboard, updatedAt: new Date().toISOString() });
    } catch (err) {
      logger.error('Leaderboard error', { error: err.message });
      res.status(500).json({ error: 'Failed to retrieve leaderboard' });
    }
  });

  return router;
};
