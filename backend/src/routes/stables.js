/**
 * Stables Routes
 * 
 * Buy stablecoins with fee calculation.
 */

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { authMiddleware } = require('../middleware/auth');
const { calculateBuyStablesOutput } = require('../services/feeCalculator');
const { generateMockTxHash, isValidAddress } = require('../services/blockchain');
const logger = require('../utils/logger');

module.exports = function (prisma) {
  /**
   * GET /api/stables/quote?amount=1000&source=ETH
   * Returns fee breakdown for buying stables
   */
  router.get('/quote', async (req, res) => {
    try {
      const amount = parseFloat(req.query.amount);
      const source = req.query.source || 'ETH';

      if (!amount || amount <= 0) {
        return res.status(400).json({ error: 'Valid amount required' });
      }

      const result = calculateBuyStablesOutput(amount);

      res.json({
        sourceCurrency: source,
        grossAmount: result.grossAmount,
        feeAmount: result.feeAmount,
        netAmount: result.netAmount,
        feeBreakdown: {
          mintFee: Math.round(amount * 0.12 * 100) / 100,
          spread: Math.round(amount * 0.88 * 0.05 * 100) / 100,
          platformFee: Math.round(amount * 0.88 * 0.95 * 0.01 * 100) / 100,
        },
        rate: `1 ${source} = ${result.netAmount / amount} SXUA`,
      });
    } catch (err) {
      logger.error('Stables quote error', { error: err.message });
      res.status(500).json({ error: 'Failed to calculate quote' });
    }
  });

  /**
   * POST /api/stables/buy
   * body: { wallet, amount, sourceCurrency }
   */
  router.post('/buy', authMiddleware, async (req, res) => {
    try {
      const { wallet, amount, sourceCurrency } = req.body;

      if (!wallet || !isValidAddress(wallet)) {
        return res.status(400).json({ error: 'Valid wallet address required' });
      }
      if (!amount || amount <= 0) {
        return res.status(400).json({ error: 'Amount must be greater than 0' });
      }

      const result = calculateBuyStablesOutput(amount);

      // Upsert user and credit balance
      let user = await prisma.user.findUnique({
        where: { walletAddress: wallet.toLowerCase() },
      });

      if (!user) {
        user = await prisma.user.create({
          data: {
            walletAddress: wallet.toLowerCase(),
            sxId: `SX-${uuidv4().slice(0, 8).toUpperCase()}`,
            sxuaBalance: result.netAmount,
            totalDeposited: result.netAmount,
          },
        });
      } else {
        user = await prisma.user.update({
          where: { id: user.id },
          data: {
            sxuaBalance: { increment: result.netAmount },
            totalDeposited: { increment: result.netAmount },
          },
        });
      }

      const txHash = generateMockTxHash('buy_stables', wallet, amount.toString());

      // Record transaction
      await prisma.transaction.create({
        data: {
          userId: user.id,
          type: 'buy_stables',
          amount: result.grossAmount,
          feeAmount: result.feeAmount,
          netAmount: result.netAmount,
          token: sourceCurrency || 'ETH',
          transactionHash: txHash,
          status: 'confirmed',
          metadata: JSON.stringify({ sourceCurrency: sourceCurrency || 'ETH' }),
        },
      });

      logger.info('Stables purchased', {
        wallet,
        amount,
        netAmount: result.netAmount,
      });

      res.json({
        success: true,
        grossAmount: result.grossAmount,
        feeAmount: result.feeAmount,
        finalAmount: result.netAmount,
        transactionHash: txHash,
      });
    } catch (err) {
      logger.error('Buy stables error', { error: err.message });
      res.status(500).json({ error: 'Failed to buy stables' });
    }
  });

  return router;
};
