/**
 * Account Routes
 * 
 * Handles user balances, deposits, and withdrawals.
 */

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { authMiddleware } = require('../middleware/auth');
const { calculateWithdrawalFee } = require('../services/feeCalculator');
const { generateMockTxHash, isValidAddress } = require('../services/blockchain');
const logger = require('../utils/logger');

module.exports = function (prisma) {
  /**
   * GET /api/account/balance?wallet=0x...
   * Returns unified and committed balances
   */
  router.get('/balance', async (req, res) => {
    try {
      const { wallet } = req.query;

      if (!wallet || !isValidAddress(wallet)) {
        return res.status(400).json({ error: 'Valid wallet address required' });
      }

      let user = await prisma.user.findUnique({
        where: { walletAddress: wallet.toLowerCase() },
        include: {
          subAccounts: {
            where: { status: 'active' },
            orderBy: { creationTimestamp: 'asc' },
          },
        },
      });

      // Auto-create user if not found (for dev convenience)
      if (!user) {
        user = await prisma.user.create({
          data: {
            walletAddress: wallet.toLowerCase(),
            sxId: `SX-${uuidv4().slice(0, 8).toUpperCase()}`,
            sxuaBalance: 0,
            sxpBalance: 0,
          },
        });
        user.subAccounts = [];
      }

      const committedBalances = user.subAccounts.map((sa) => {
        const now = Date.now();
        const creation = new Date(sa.creationTimestamp).getTime();
        const maturity = new Date(sa.maturityTimestamp).getTime();
        const totalDuration = maturity - creation;
        const elapsed = Math.min(now - creation, totalDuration);
        const progress = totalDuration > 0 ? Math.round((elapsed / totalDuration) * 10000) / 100 : 0;

        return {
          subAccountId: sa.subAccountId,
          principal: sa.principal,
          yieldAccrued: sa.yieldAccrued,
          creationDate: sa.creationTimestamp,
          maturityDate: sa.maturityTimestamp,
          status: sa.status,
          progress: Math.min(progress, 100),
        };
      });

      const committedTotal = committedBalances.reduce((sum, b) => sum + b.principal, 0);
      const accruedYield = committedBalances.reduce((sum, b) => sum + b.yieldAccrued, 0);

      res.json({
        wallet: wallet,
        sxId: user.sxId,
        totalBalance: user.sxuaBalance + committedTotal,
        unifiedBalance: user.sxuaBalance + committedTotal,
        committedBalance: committedTotal,
        committedBalances,
        uncommittedBalance: user.sxuaBalance,
        accruedYield: Math.round(accruedYield * 100) / 100,
        sxpRewards: user.sxpBalance,
        sxpBalance: user.sxpBalance,
        subAccounts: committedBalances,
        totalDeposited: user.totalDeposited,
        totalWithdrawn: user.totalWithdrawn,
        isRegistered: user.isRegistered,
      });
    } catch (err) {
      logger.error('Get balance error', { error: err.message });
      res.status(500).json({ error: 'Failed to retrieve balance' });
    }
  });

  /**
   * POST /api/account/deposit
   * body: { wallet, token, amount, committedPercent }
   */
  router.post('/deposit', authMiddleware, async (req, res) => {
    try {
      const { wallet, token, amount, committedPercent } = req.body;

      if (!wallet || !isValidAddress(wallet)) {
        return res.status(400).json({ error: 'Valid wallet address required' });
      }
      if (!amount || amount <= 0) {
        return res.status(400).json({ error: 'Amount must be greater than 0' });
      }

      const committedPct = Math.min(Math.max(committedPercent || 0, 0), 100);
      const committedAmount = amount * (committedPct / 100);
      const uncommittedAmount = amount - committedAmount;

      // Upsert user
      let user = await prisma.user.findUnique({
        where: { walletAddress: wallet.toLowerCase() },
      });

      if (!user) {
        user = await prisma.user.create({
          data: {
            walletAddress: wallet.toLowerCase(),
            sxId: `SX-${uuidv4().slice(0, 8).toUpperCase()}`,
            sxuaBalance: uncommittedAmount,
            totalDeposited: amount,
          },
        });
      } else {
        user = await prisma.user.update({
          where: { id: user.id },
          data: {
            sxuaBalance: { increment: uncommittedAmount },
            totalDeposited: { increment: amount },
          },
        });
      }

      let subAccountId = null;

      // Create committed sub-account if needed
      if (committedAmount > 0) {
        const existingCount = await prisma.committedSubAccount.count({
          where: { userId: user.id },
        });

        const subAccount = await prisma.committedSubAccount.create({
          data: {
            userId: user.id,
            subAccountId: existingCount + 1,
            principal: committedAmount,
            maturityTimestamp: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
          },
        });
        subAccountId = subAccount.subAccountId;
      }

      const txHash = generateMockTxHash('deposit', wallet, amount.toString());

      // Record transaction
      await prisma.transaction.create({
        data: {
          userId: user.id,
          type: 'deposit',
          amount,
          netAmount: amount,
          token: token || 'SXUA',
          transactionHash: txHash,
          status: 'confirmed',
          metadata: JSON.stringify({ committedPercent: committedPct, committedAmount, uncommittedAmount }),
        },
      });

      logger.info('Deposit processed', { wallet, amount, committedPct });

      // ─── Complete pending referral if qualifying deposit ──────────
      const REFERRAL_THRESHOLD = 100; // $100 minimum deposit for demo
      const REFERRAL_REWARD = 50;     // 50 SXP per successful referral

      if (amount >= REFERRAL_THRESHOLD) {
        // Find pending referral where this user is the referred party
        const pendingReferral = await prisma.referral.findFirst({
          where: {
            referredId: user.id,
            status: { in: ['pending', 'registered'] },
          },
        });

        if (pendingReferral) {
          // Mark referral as successful and award SXP
          await prisma.referral.update({
            where: { id: pendingReferral.id },
            data: {
              status: 'successful',
              rewardAmount: REFERRAL_REWARD,
              completedAt: new Date(),
            },
          });

          // Award SXP to referrer
          await prisma.user.update({
            where: { id: pendingReferral.referrerId },
            data: {
              sxpRewards: { increment: REFERRAL_REWARD },
            },
          });

          // Award SXP to referred user too
          await prisma.user.update({
            where: { id: user.id },
            data: {
              sxpRewards: { increment: REFERRAL_REWARD },
            },
          });

          // Invalidate leaderboard cache so it rebuilds
          await prisma.leaderboardCache.deleteMany({}).catch(() => {});

          logger.info('Referral completed', {
            referrer: pendingReferral.referrerId,
            referred: wallet,
            reward: REFERRAL_REWARD,
          });
        }
      }

      res.json({
        success: true,
        newBalance: user.sxuaBalance,
        subAccountId,
        transactionHash: txHash,
      });
    } catch (err) {
      logger.error('Deposit error', { error: err.message });
      res.status(500).json({ error: 'Failed to process deposit' });
    }
  });

  /**
   * POST /api/account/withdraw
   * body: { wallet, subAccountId, amount }
   */
  router.post('/withdraw', authMiddleware, async (req, res) => {
    try {
      const { wallet, subAccountId, amount } = req.body;

      if (!wallet || !isValidAddress(wallet)) {
        return res.status(400).json({ error: 'Valid wallet address required' });
      }
      if (!amount || amount <= 0) {
        return res.status(400).json({ error: 'Amount must be greater than 0' });
      }

      const user = await prisma.user.findUnique({
        where: { walletAddress: wallet.toLowerCase() },
      });

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // If withdrawing from committed sub-account
      if (subAccountId !== undefined && subAccountId !== null) {
        const subAccount = await prisma.committedSubAccount.findFirst({
          where: { userId: user.id, subAccountId: parseInt(subAccountId), status: 'active' },
        });

        if (!subAccount) {
          return res.status(404).json({ error: 'Sub-account not found or already withdrawn' });
        }

        if (amount > subAccount.principal + subAccount.yieldAccrued) {
          return res.status(400).json({ error: 'Insufficient sub-account balance' });
        }

        const fees = calculateWithdrawalFee(amount);

        await prisma.committedSubAccount.update({
          where: { id: subAccount.id },
          data: { status: 'withdrawn', withdrawnAt: new Date() },
        });

        await prisma.user.update({
          where: { id: user.id },
          data: { totalWithdrawn: { increment: fees.netAmount } },
        });

        const txHash = generateMockTxHash('withdraw', wallet, amount.toString(), subAccountId.toString());

        await prisma.transaction.create({
          data: {
            userId: user.id,
            type: 'withdraw',
            amount,
            feeAmount: fees.feeAmount,
            netAmount: fees.netAmount,
            transactionHash: txHash,
            status: 'confirmed',
            metadata: JSON.stringify({ subAccountId }),
          },
        });

        logger.info('Sub-account withdrawal', { wallet, subAccountId, amount, fee: fees.feeAmount });

        return res.json({
          success: true,
          amountWithdrawn: amount,
          feeAmount: fees.feeAmount,
          netReceived: fees.netAmount,
          transactionHash: txHash,
        });
      }

      // Withdraw from uncommitted balance
      if (amount > user.sxuaBalance) {
        return res.status(400).json({ error: 'Insufficient uncommitted balance' });
      }

      const fees = calculateWithdrawalFee(amount);

      await prisma.user.update({
        where: { id: user.id },
        data: {
          sxuaBalance: { decrement: amount },
          totalWithdrawn: { increment: fees.netAmount },
        },
      });

      const txHash = generateMockTxHash('withdraw', wallet, amount.toString());

      await prisma.transaction.create({
        data: {
          userId: user.id,
          type: 'withdraw',
          amount,
          feeAmount: fees.feeAmount,
          netAmount: fees.netAmount,
          transactionHash: txHash,
          status: 'confirmed',
        },
      });

      logger.info('Withdrawal processed', { wallet, amount, fee: fees.feeAmount });

      res.json({
        success: true,
        amountWithdrawn: amount,
        feeAmount: fees.feeAmount,
        netReceived: fees.netAmount,
        transactionHash: txHash,
      });
    } catch (err) {
      logger.error('Withdraw error', { error: err.message });
      res.status(500).json({ error: 'Failed to process withdrawal' });
    }
  });

  /**
   * GET /api/account/registration?wallet=0x...
   * Check if a wallet is registered
   */
  router.get('/registration', async (req, res) => {
    try {
      const { wallet } = req.query;
      if (!wallet || !isValidAddress(wallet)) {
        return res.status(400).json({ error: 'Valid wallet address required' });
      }

      const user = await prisma.user.findUnique({
        where: { walletAddress: wallet.toLowerCase() },
      });

      res.json({
        isRegistered: !!user?.isRegistered,
        sxId: user?.sxId || null,
        wallet: wallet.toLowerCase(),
      });
    } catch (err) {
      logger.error('Registration check error', { error: err.message });
      res.status(500).json({ error: 'Failed to check registration status' });
    }
  });

  /**
   * POST /api/account/register
   * Register a new user (SXSE registration)
   */
  router.post('/register', async (req, res) => {
    try {
      const { wallet, deviceHash, referralCode } = req.body;
      if (!wallet || !isValidAddress(wallet)) {
        return res.status(400).json({ error: 'Valid wallet address required' });
      }

      const existing = await prisma.user.findUnique({
        where: { walletAddress: wallet.toLowerCase() },
      });

      if (existing?.isRegistered) {
        return res.status(400).json({ error: 'Wallet already registered' });
      }

      const sxId = `SX-${wallet.slice(2, 10).toUpperCase()}`;

      const user = await prisma.user.upsert({
        where: { walletAddress: wallet.toLowerCase() },
        update: {
          isRegistered: true,
          sxId,
          deviceHash: deviceHash || null,
        },
        create: {
          walletAddress: wallet.toLowerCase(),
          sxId,
          sxuaBalance: 0,
          sxpBalance: 0,
          totalDeposited: 0,
          totalWithdrawn: 0,
          isRegistered: true,
          isLocked: false,
          deviceHash: deviceHash || null,
        },
      });

      // Handle referral code if provided
      if (referralCode) {
        const referrer = await prisma.user.findFirst({
          where: { sxId: referralCode },
        });
        if (referrer) {
          await prisma.referral.create({
            data: {
              referrerId: referrer.id,
              referredId: user.id,
              referralCode: referralCode,
              status: 'registered',
              rewardAmount: 0,
            },
          });
        }
      }

      logger.info('User registered', { wallet, sxId });

      res.json({
        success: true,
        sxId,
        wallet: wallet.toLowerCase(),
        isRegistered: true,
      });
    } catch (err) {
      logger.error('Registration error', { error: err.message });
      res.status(500).json({ error: 'Failed to register user' });
    }
  });

  /**
   * GET /api/account/transactions?wallet=0x...
   * Returns transaction history for a wallet
   */
  router.get('/transactions', async (req, res) => {
    try {
      const { wallet } = req.query;
      if (!wallet || !isValidAddress(wallet)) {
        return res.status(400).json({ error: 'Valid wallet address required' });
      }

      const user = await prisma.user.findUnique({
        where: { walletAddress: wallet.toLowerCase() },
      });

      if (!user) {
        return res.json({ transactions: [], total: 0 });
      }

      const transactions = await prisma.transaction.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });

      res.json({
        transactions: transactions.map((tx) => ({
          id: tx.id,
          type: tx.type,
          amount: tx.amount,
          fee: tx.feeAmount || 0,
          net: tx.netAmount || tx.amount,
          hash: tx.transactionHash,
          status: tx.status,
          date: tx.createdAt,
        })),
        total: transactions.length,
      });
    } catch (err) {
      logger.error('Transaction history error', { error: err.message });
      res.status(500).json({ error: 'Failed to fetch transactions' });
    }
  });

  return router;
};
