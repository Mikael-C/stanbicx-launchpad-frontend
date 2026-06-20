/**
 * Stats Routes
 * 
 * Platform-wide statistics.
 */

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');

module.exports = function (prisma) {
  /**
   * GET /api/stats
   * Returns platform-wide statistics
   */
  router.get('/', async (req, res) => {
    try {
      const [
        totalUsers,
        totalTransactions,
        activeProjects,
        totalReferrals,
        totalListings,
        depositAgg,
      ] = await Promise.all([
        prisma.user.count(),
        prisma.transaction.count(),
        prisma.launchpadProject.count({ where: { status: 'active' } }),
        prisma.referral.count(),
        prisma.resellingListing.count({ where: { status: 'active' } }),
        prisma.transaction.aggregate({
          _sum: { amount: true },
          where: { type: 'deposit' },
        }),
      ]);

      // Total volume from all transactions
      const volumeAgg = await prisma.transaction.aggregate({
        _sum: { amount: true },
      });

      res.json({
        totalUsers,
        totalVolume: Math.round((volumeAgg._sum.amount || 0) * 100) / 100,
        activeProjects,
        totalReferrals,
        totalDeposits: Math.round((depositAgg._sum.amount || 0) * 100) / 100,
        totalListings,
        totalTransactions,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      logger.error('Get stats error', { error: err.message });
      res.status(500).json({ error: 'Failed to retrieve stats' });
    }
  });

  router.get('/tables', async (req, res) => {
    try {
      const [events, syncStatus, users, transactions, projects, purchases, vestingClaims, subAccounts, listings, referrals, proposals, adminActions, jailbreakAttempts, verificationResults, leaderboard, reorgLogs, indexingErrors] = await Promise.all([
        prisma.event.count(),
        prisma.syncStatus.findMany(),
        prisma.user.count(),
        prisma.transaction.count(),
        prisma.launchpadProject.count(),
        prisma.launchpadPurchase.count(),
        prisma.vestingClaim.count(),
        prisma.committedSubAccount.count(),
        prisma.resellingListing.count(),
        prisma.referral.count(),
        prisma.proposal.count(),
        prisma.adminAction.count(),
        prisma.jailbreakAttempt.count(),
        prisma.verificationResult.count(),
        prisma.leaderboardCache.count(),
        prisma.reorgLog.count(),
        prisma.indexingError.count(),
      ]);

      res.json({
        tables: [
          { name: 'events', rows: events, category: 'Indexer' },
          { name: 'sync_status', rows: syncStatus.length, category: 'Indexer' },
          { name: 'reorg_log', rows: reorgLogs, category: 'Indexer' },
          { name: 'indexing_errors', rows: indexingErrors, category: 'Indexer' },
          { name: 'users', rows: users, category: 'Accounts' },
          { name: 'transactions', rows: transactions, category: 'Accounts' },
          { name: 'committed_sub_accounts', rows: subAccounts, category: 'Accounts' },
          { name: 'launchpad_projects', rows: projects, category: 'Launchpad' },
          { name: 'launchpad_purchases', rows: purchases, category: 'Launchpad' },
          { name: 'vesting_claims', rows: vestingClaims, category: 'Launchpad' },
          { name: 'reselling_listings', rows: listings, category: 'Marketplace' },
          { name: 'referrals', rows: referrals, category: 'Referrals' },
          { name: 'leaderboard_cache', rows: leaderboard, category: 'Referrals' },
          { name: 'proposals', rows: proposals, category: 'Governance' },
          { name: 'admin_actions', rows: adminActions, category: 'Governance' },
          { name: 'jailbreak_attempts', rows: jailbreakAttempts, category: 'Security' },
          { name: 'verification_results', rows: verificationResults, category: 'Security' },
        ],
        syncStatus,
        totalTables: 17,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      logger.error('Get table counts error', { error: err.message });
      res.status(500).json({ error: 'Failed to retrieve table counts' });
    }
  });

  return router;
};
