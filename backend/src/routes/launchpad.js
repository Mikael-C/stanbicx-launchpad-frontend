/**
 * Launchpad Routes
 * 
 * Manage launchpad projects, purchases, vesting, and claims.
 */

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { authMiddleware } = require('../middleware/auth');
const {
  getVestingProgress,
  getClaimableAmount,
  getVestingDates,
  isFullyVested,
} = require('../services/vestingCalculator');
const { calculateEarlyExitPenalty } = require('../services/feeCalculator');
const { generateMockTxHash, isValidAddress } = require('../services/blockchain');
const logger = require('../utils/logger');

module.exports = function (prisma) {
  /**
   * GET /api/launchpad/projects
   * Returns all launchpad projects
   */
  router.get('/projects', async (req, res) => {
    try {
      const { status } = req.query;
      const where = status ? { status } : {};

      const projects = await prisma.launchpadProject.findMany({
        where,
        orderBy: { createdAt: 'desc' },
      });

      // If no projects exist, seed some demo projects
      if (projects.length === 0) {
        const demoProjects = await seedDemoProjects(prisma);
        const enriched = demoProjects.map(addVestingScheduleInfo);
        return res.json({ projects: enriched, total: enriched.length });
      }

      const enriched = projects.map(addVestingScheduleInfo);
      res.json({ projects: enriched, total: enriched.length });
    } catch (err) {
      logger.error('Get projects error', { error: err.message });
      res.status(500).json({ error: 'Failed to retrieve projects' });
    }
  });

  /**
   * POST /api/launchpad/purchase
   * body: { wallet, projectId, amount }
   * amount is in USD
   */
  router.post('/purchase', authMiddleware, async (req, res) => {
    try {
      const { wallet, projectId, amount } = req.body;

      if (!wallet || !isValidAddress(wallet)) {
        return res.status(400).json({ error: 'Valid wallet address required' });
      }
      if (!projectId) {
        return res.status(400).json({ error: 'Project ID required' });
      }
      if (!amount || amount <= 0) {
        return res.status(400).json({ error: 'Amount must be greater than 0' });
      }

      // Verify project exists and is active
      const project = await prisma.launchpadProject.findUnique({
        where: { id: projectId },
      });

      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
      if (project.status !== 'active') {
        return res.status(400).json({ error: 'Project is not currently active' });
      }
      if (amount > project.availableSupply * project.tokenPrice) {
        return res.status(400).json({ error: 'Insufficient project supply' });
      }

      // Get or create user
      let user = await prisma.user.findUnique({
        where: { walletAddress: wallet.toLowerCase() },
      });

      if (!user) {
        user = await prisma.user.create({
          data: {
            walletAddress: wallet.toLowerCase(),
            sxId: `SX-${uuidv4().slice(0, 8).toUpperCase()}`,
            sxuaBalance: 50000, // Demo: seed with $50k for demo purposes
          },
        });
      }

      // Check user balance — in demo mode, auto-top-up if insufficient
      if (user.sxuaBalance < amount) {
        if (process.env.NODE_ENV === 'development') {
          await prisma.user.update({
            where: { id: user.id },
            data: { sxuaBalance: amount + 10000 },
          });
          user.sxuaBalance = amount + 10000;
        } else {
          return res.status(400).json({
            error: 'Insufficient balance',
            required: amount,
            available: user.sxuaBalance,
          });
        }
      }

      const tokenAmount = amount / project.tokenPrice;
      const now = new Date();
      const { cliffEnd, vestingEnd } = getVestingDates(now);

      // Deduct balance and create purchase
      await prisma.user.update({
        where: { id: user.id },
        data: { sxuaBalance: { decrement: amount } },
      });

      // Update project supply
      await prisma.launchpadProject.update({
        where: { id: projectId },
        data: { availableSupply: { decrement: tokenAmount } },
      });

      const purchase = await prisma.launchpadPurchase.create({
        data: {
          userId: user.id,
          projectId,
          amount,
          tokenAmount,
          purchasePrice: project.tokenPrice,
          vestingStartDate: now,
          vestingEndDate: vestingEnd,
          cliffEndDate: cliffEnd,
        },
      });

      const txHash = generateMockTxHash('purchase', wallet, projectId, amount.toString());

      // Record transaction
      await prisma.transaction.create({
        data: {
          userId: user.id,
          type: 'purchase',
          amount,
          netAmount: tokenAmount,
          token: project.symbol,
          transactionHash: txHash,
          status: 'confirmed',
          metadata: JSON.stringify({ projectId, tokenAmount, purchasePrice: project.tokenPrice }),
        },
      });

      logger.info('Launchpad purchase', { wallet, projectId, amount, tokenAmount });

      res.json({
        purchaseId: purchase.id,
        tokenAmount,
        vestingStartTimestamp: now.toISOString(),
        vestingEndTimestamp: vestingEnd.toISOString(),
        cliffEndTimestamp: cliffEnd.toISOString(),
        transactionHash: txHash,
      });
    } catch (err) {
      logger.error('Purchase error', { error: err.message });
      res.status(500).json({ error: 'Failed to process purchase' });
    }
  });

  /**
   * GET /api/launchpad/vesting/:purchaseIdOrWallet
   * Returns vesting info — field names aligned with frontend expectations
   */
  router.get('/vesting/:purchaseIdOrWallet', async (req, res) => {
    try {
      const { purchaseIdOrWallet } = req.params;

      // If it looks like a wallet address, return all vestings for that wallet
      if (purchaseIdOrWallet.startsWith('0x') && purchaseIdOrWallet.length === 42) {
        const wallet = purchaseIdOrWallet.toLowerCase();
        const user = await prisma.user.findUnique({
          where: { walletAddress: wallet },
        });

        if (!user) {
          return res.json({ vestings: [], total: 0 });
        }

        const purchases = await prisma.launchpadPurchase.findMany({
          where: { userId: user.id },
          include: { project: true },
          orderBy: { createdAt: 'desc' },
        });

        const vestings = purchases.map((purchase) => {
          const progress = getVestingProgress(purchase.vestingStartDate);
          const claimable = getClaimableAmount(
            purchase.tokenAmount,
            purchase.vestingStartDate,
            purchase.totalClaimed
          );

          return {
            id: purchase.id,
            purchaseId: purchase.id,
            projectName: purchase.project.name,
            tokenSymbol: purchase.project.symbol,
            amount: purchase.tokenAmount,
            usdPaid: purchase.amount,
            claimedAmount: purchase.totalClaimed,
            claimableAmount: Math.round(claimable * 100) / 100,
            vestingStartDate: purchase.vestingStartDate.toISOString(),
            cliffEndDate: purchase.cliffEndDate.toISOString(),
            vestingEndDate: purchase.vestingEndDate.toISOString(),
            isCliffPassed: progress.isCliffPassed,
            isFullyVested: progress.isFullyVested,
            progress: progress.percentComplete,
            elapsedDays: progress.elapsedDays,
            totalDays: progress.totalDays,
            status: purchase.status,
          };
        });

        return res.json({ vestings, total: vestings.length });
      }

      // Otherwise treat as a purchase ID
      const purchaseId = purchaseIdOrWallet;
      const purchase = await prisma.launchpadPurchase.findUnique({
        where: { id: purchaseId },
        include: { project: true },
      });

      if (!purchase) {
        return res.status(404).json({ error: 'Purchase not found' });
      }

      const progress = getVestingProgress(purchase.vestingStartDate);
      const claimable = getClaimableAmount(
        purchase.tokenAmount,
        purchase.vestingStartDate,
        purchase.totalClaimed
      );

      res.json({
        id: purchase.id,
        purchaseId: purchase.id,
        projectName: purchase.project.name,
        tokenSymbol: purchase.project.symbol,
        amount: purchase.tokenAmount,
        usdPaid: purchase.amount,
        claimedAmount: purchase.totalClaimed,
        claimableAmount: Math.round(claimable * 100) / 100,
        vestingStartDate: purchase.vestingStartDate.toISOString(),
        cliffEndDate: purchase.cliffEndDate.toISOString(),
        vestingEndDate: purchase.vestingEndDate.toISOString(),
        isCliffPassed: progress.isCliffPassed,
        isFullyVested: progress.isFullyVested,
        progress: progress.percentComplete,
        elapsedDays: progress.elapsedDays,
        totalDays: progress.totalDays,
        status: purchase.status,
      });
    } catch (err) {
      logger.error('Vesting info error', { error: err.message });
      res.status(500).json({ error: 'Failed to retrieve vesting info' });
    }
  });


  /**
   * POST /api/launchpad/claim
   * body: { wallet, purchaseId } or { wallet, vestingId }
   */
  router.post('/claim', authMiddleware, async (req, res) => {
    try {
      const { wallet, purchaseId, vestingId } = req.body;
      const resolvedId = purchaseId || vestingId; // Accept both field names

      if (!wallet || !isValidAddress(wallet)) {
        return res.status(400).json({ error: 'Valid wallet address required' });
      }

      const purchase = await prisma.launchpadPurchase.findUnique({
        where: { id: resolvedId },
        include: { user: true, project: true },
      });

      if (!purchase) {
        return res.status(404).json({ error: 'Purchase not found' });
      }
      if (purchase.user.walletAddress !== wallet.toLowerCase()) {
        return res.status(403).json({ error: 'Not authorized to claim this purchase' });
      }
      if (purchase.status !== 'active') {
        return res.status(400).json({ error: 'Purchase is not active' });
      }

      const claimable = getClaimableAmount(
        purchase.tokenAmount,
        purchase.vestingStartDate,
        purchase.totalClaimed
      );

      if (claimable <= 0) {
        return res.status(400).json({ error: 'No tokens available to claim yet' });
      }

      const roundedClaimable = Math.round(claimable * 100) / 100;

      // Calculate 2% minting cost
      const MINTING_COST_RATE = 0.02;
      const mintingCost = Math.round(roundedClaimable * MINTING_COST_RATE * 100) / 100;
      const netTokens = Math.round((roundedClaimable - mintingCost) * 100) / 100;

      const txHash = generateMockTxHash('claim', wallet, resolvedId, roundedClaimable.toString());

      // Record the claim
      await prisma.vestingClaim.create({
        data: {
          purchaseId: resolvedId,
          amount: roundedClaimable,
          transactionHash: txHash,
          claimType: 'vested',
        },
      });

      const newTotalClaimed = purchase.totalClaimed + roundedClaimable;
      const fullyVested = isFullyVested(purchase.vestingStartDate);

      // Update purchase
      await prisma.launchpadPurchase.update({
        where: { id: resolvedId },
        data: {
          totalClaimed: newTotalClaimed,
          status: fullyVested && newTotalClaimed >= purchase.tokenAmount ? 'completed' : 'active',
        },
      });

      // Credit user's SXP balance (net of minting cost)
      await prisma.user.update({
        where: { id: purchase.userId },
        data: { sxpBalance: { increment: netTokens } },
      });

      // Record transaction
      await prisma.transaction.create({
        data: {
          userId: purchase.userId,
          type: 'claim',
          amount: roundedClaimable,
          feeAmount: mintingCost,
          netAmount: netTokens,
          token: purchase.project.symbol,
          transactionHash: txHash,
          status: 'confirmed',
          metadata: JSON.stringify({ purchaseId: resolvedId, mintingCost, mintingCostRate: '2%' }),
        },
      });

      logger.info('Vesting claim', { wallet, purchaseId: resolvedId, amount: roundedClaimable, mintingCost, netTokens });

      res.json({
        success: true,
        claimedAmount: roundedClaimable,
        mintingCost,
        mintingCostRate: '2%',
        netTokens,
        totalClaimed: newTotalClaimed,
        remaining: Math.max(0, purchase.tokenAmount - newTotalClaimed),
        transactionHash: txHash,
      });
    } catch (err) {
      logger.error('Claim error', { error: err.message });
      res.status(500).json({ error: 'Failed to process claim' });
    }
  });

  /**
   * POST /api/launchpad/early-exit
   * body: { wallet, purchaseId } or { wallet, vestingId }
   */
  router.post('/early-exit', authMiddleware, async (req, res) => {
    try {
      const { wallet, purchaseId, vestingId } = req.body;
      const resolvedId = purchaseId || vestingId; // Accept both field names

      if (!wallet || !isValidAddress(wallet)) {
        return res.status(400).json({ error: 'Valid wallet address required' });
      }

      const purchase = await prisma.launchpadPurchase.findUnique({
        where: { id: resolvedId },
        include: { user: true },
      });

      if (!purchase) {
        return res.status(404).json({ error: 'Purchase not found' });
      }
      if (purchase.user.walletAddress !== wallet.toLowerCase()) {
        return res.status(403).json({ error: 'Not authorized' });
      }
      if (purchase.status !== 'active') {
        return res.status(400).json({ error: 'Purchase is not active' });
      }

      const remaining = purchase.tokenAmount - purchase.totalClaimed;
      const penalty = calculateEarlyExitPenalty(remaining);
      const txHash = generateMockTxHash('early_exit', wallet, resolvedId);

      // Record early exit claim
      await prisma.vestingClaim.create({
        data: {
          purchaseId: resolvedId,
          amount: penalty.netAmount,
          transactionHash: txHash,
          claimType: 'early_exit',
        },
      });

      // Update purchase status
      await prisma.launchpadPurchase.update({
        where: { id: resolvedId },
        data: {
          totalClaimed: purchase.totalClaimed + penalty.netAmount,
          status: 'early_exit',
        },
      });

      // Credit user (with penalty applied)
      await prisma.user.update({
        where: { id: purchase.userId },
        data: { sxpBalance: { increment: penalty.netAmount } },
      });

      // Record transaction
      await prisma.transaction.create({
        data: {
          userId: purchase.userId,
          type: 'claim',
          amount: remaining,
          feeAmount: penalty.penaltyAmount,
          netAmount: penalty.netAmount,
          transactionHash: txHash,
          status: 'confirmed',
          metadata: JSON.stringify({ purchaseId: resolvedId, type: 'early_exit', penalty: penalty.penaltyAmount }),
        },
      });

      logger.info('Early exit', { wallet, purchaseId: resolvedId, remaining, penalty: penalty.penaltyAmount });

      res.json({
        success: true,
        remainingTokens: remaining,
        penaltyAmount: penalty.penaltyAmount,
        netReceived: penalty.netAmount,
        transactionHash: txHash,
      });
    } catch (err) {
      logger.error('Early exit error', { error: err.message });
      res.status(500).json({ error: 'Failed to process early exit' });
    }
  });

  /**
   * POST /api/launchpad/demo/simulate-vesting
   * body: { wallet, purchaseId }
   * Demo-only: backdates vesting to make it claimable immediately
   */
  router.post('/demo/simulate-vesting', async (req, res) => {
    try {
      if (process.env.NODE_ENV !== 'development') {
        return res.status(403).json({ error: 'Demo endpoints are only available in development' });
      }

      const { purchaseId } = req.body;

      if (!purchaseId) {
        return res.status(400).json({ error: 'Purchase ID required' });
      }

      const purchase = await prisma.launchpadPurchase.findUnique({
        where: { id: purchaseId },
      });

      if (!purchase) {
        return res.status(404).json({ error: 'Purchase not found' });
      }

      // Backdate purchase to 151 days ago so it's fully vested
      const backdatedStart = new Date(Date.now() - 151 * 24 * 60 * 60 * 1000);
      const { cliffEnd, vestingEnd } = getVestingDates(backdatedStart);

      await prisma.launchpadPurchase.update({
        where: { id: purchaseId },
        data: {
          vestingStartDate: backdatedStart,
          cliffEndDate: cliffEnd,
          vestingEndDate: vestingEnd,
        },
      });

      logger.info('Demo: Simulated vesting completion', { purchaseId });

      res.json({
        success: true,
        message: 'Vesting backdated — tokens are now fully vested and claimable',
        vestingStartDate: backdatedStart.toISOString(),
        cliffEndDate: cliffEnd.toISOString(),
        vestingEndDate: vestingEnd.toISOString(),
      });
    } catch (err) {
      logger.error('Demo simulate error', { error: err.message });
      res.status(500).json({ error: 'Failed to simulate vesting' });
    }
  });

  /**
   * GET /api/launchpad/token-balance/:wallet
   * Returns the user's claimed token balance (SXP)
   */
  router.get('/token-balance/:wallet', async (req, res) => {
    try {
      const wallet = req.params.wallet.toLowerCase();
      const user = await prisma.user.findUnique({
        where: { walletAddress: wallet },
      });

      if (!user) {
        return res.json({ tokenBalance: 0, sxpBalance: 0 });
      }

      // Get claimed tokens grouped by project
      const purchases = await prisma.launchpadPurchase.findMany({
        where: { userId: user.id },
        include: { project: true },
      });

      const holdings = purchases
        .filter(p => p.totalClaimed > 0)
        .map(p => ({
          projectName: p.project.name,
          tokenSymbol: p.project.symbol,
          claimed: p.totalClaimed,
          total: p.tokenAmount,
          status: p.status,
        }));

      res.json({
        sxpBalance: user.sxpBalance,
        holdings,
      });
    } catch (err) {
      logger.error('Token balance error', { error: err.message });
      res.status(500).json({ error: 'Failed to retrieve token balance' });
    }
  });

  return router;
};

/**
 * Add vesting schedule info to project object
 */
function addVestingScheduleInfo(project) {
  return {
    ...project,
    vestingSchedule: `${project.cliffDuration || 30}-day cliff · ${project.vestingDuration || 150}-day vesting`,
    cliffDays: project.cliffDuration || 30,
    vestingDays: project.vestingDuration || 150,
  };
}

/**
 * Seed demo launchpad projects (for dev)
 */
async function seedDemoProjects(prisma) {
  const now = new Date();
  const projects = [
    {
      name: 'SX Protocol',
      symbol: 'SXP',
      description: 'The core protocol token for the SX ecosystem, powering governance and utility across all platform services.',
      tokenPrice: 0.25,
      totalSupply: 10000000,
      availableSupply: 7500000,
      startDate: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
      endDate: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
      status: 'active',
    },
    {
      name: 'DeFi Yield Engine',
      symbol: 'DYE',
      description: 'Automated yield optimization protocol built on top of the SX Launchpad infrastructure.',
      tokenPrice: 0.10,
      totalSupply: 50000000,
      availableSupply: 50000000,
      startDate: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000),
      endDate: new Date(now.getTime() + 45 * 24 * 60 * 60 * 1000),
      status: 'upcoming',
    },
    {
      name: 'Meta Bridge',
      symbol: 'MBR',
      description: 'Cross-chain bridging solution with built-in MEV protection and instant finality.',
      tokenPrice: 0.50,
      totalSupply: 5000000,
      availableSupply: 2000000,
      startDate: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
      endDate: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000),
      status: 'completed',
    },
  ];

  const created = [];
  for (const p of projects) {
    const project = await prisma.launchpadProject.create({ data: p });
    created.push(project);
  }

  return created;
}
