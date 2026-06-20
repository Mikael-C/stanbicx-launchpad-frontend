/**
 * Marketplace Routes
 * 
 * Reselling / secondary market for tokens.
 */

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { authMiddleware } = require('../middleware/auth');
const { generateMockTxHash, isValidAddress } = require('../services/blockchain');
const logger = require('../utils/logger');

module.exports = function (prisma) {
  /**
   * GET /api/marketplace/listings
   * Returns all active listings
   */
  router.get('/listings', async (req, res) => {
    try {
      const { page = 1, limit = 20, sort = 'listedAt', order = 'desc' } = req.query;
      const skip = (parseInt(page) - 1) * parseInt(limit);

      const [listings, total] = await Promise.all([
        prisma.resellingListing.findMany({
          where: { status: 'active' },
          orderBy: { [sort]: order },
          skip,
          take: parseInt(limit),
          include: {
            seller: {
              select: { walletAddress: true, sxId: true },
            },
          },
        }),
        prisma.resellingListing.count({ where: { status: 'active' } }),
      ]);

      res.json({
        listings: listings.map((l) => ({
          id: l.id,
          seller: l.seller.walletAddress,
          sellerSxId: l.seller.sxId,
          amount: l.amount,
          pricePerToken: l.pricePerToken,
          totalPrice: l.totalPrice,
          listedAt: l.listedAt,
        })),
        total,
        page: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
      });
    } catch (err) {
      logger.error('Get listings error', { error: err.message });
      res.status(500).json({ error: 'Failed to retrieve listings' });
    }
  });

  /**
   * POST /api/marketplace/list
   * body: { wallet, amount, pricePerToken }
   */
  router.post('/list', authMiddleware, async (req, res) => {
    try {
      const { wallet, amount, pricePerToken } = req.body;

      if (!wallet || !isValidAddress(wallet)) {
        return res.status(400).json({ error: 'Valid wallet address required' });
      }
      if (!amount || amount <= 0) {
        return res.status(400).json({ error: 'Amount must be greater than 0' });
      }
      if (!pricePerToken || pricePerToken <= 0) {
        return res.status(400).json({ error: 'Price per token must be greater than 0' });
      }

      const user = await prisma.user.findUnique({
        where: { walletAddress: wallet.toLowerCase() },
      });

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      if (user.sxpBalance < amount) {
        return res.status(400).json({
          error: 'Insufficient SXP balance',
          required: amount,
          available: user.sxpBalance,
        });
      }

      const totalPrice = Math.round(amount * pricePerToken * 100) / 100;

      // Lock tokens from seller's balance
      await prisma.user.update({
        where: { id: user.id },
        data: { sxpBalance: { decrement: amount } },
      });

      const listing = await prisma.resellingListing.create({
        data: {
          sellerId: user.id,
          amount,
          pricePerToken,
          totalPrice,
        },
      });

      const txHash = generateMockTxHash('list', wallet, amount.toString(), pricePerToken.toString());

      // Record transaction
      await prisma.transaction.create({
        data: {
          userId: user.id,
          type: 'list',
          amount,
          netAmount: totalPrice,
          token: 'SXP',
          transactionHash: txHash,
          status: 'confirmed',
          metadata: JSON.stringify({ listingId: listing.id, pricePerToken }),
        },
      });

      logger.info('Listing created', { wallet, amount, pricePerToken, totalPrice });

      res.json({
        listingId: listing.id,
        amount,
        pricePerToken,
        totalPrice,
        transactionHash: txHash,
      });
    } catch (err) {
      logger.error('Create listing error', { error: err.message });
      res.status(500).json({ error: 'Failed to create listing' });
    }
  });

  /**
   * POST /api/marketplace/buy/:listingId
   * body: { wallet }
   */
  router.post('/buy/:listingId', authMiddleware, async (req, res) => {
    try {
      const { listingId } = req.params;
      const { wallet } = req.body;

      if (!wallet || !isValidAddress(wallet)) {
        return res.status(400).json({ error: 'Valid wallet address required' });
      }

      const listing = await prisma.resellingListing.findUnique({
        where: { id: listingId },
        include: { seller: true },
      });

      if (!listing) {
        return res.status(404).json({ error: 'Listing not found' });
      }
      if (listing.status !== 'active') {
        return res.status(400).json({ error: 'Listing is no longer active' });
      }

      // Get or create buyer
      let buyer = await prisma.user.findUnique({
        where: { walletAddress: wallet.toLowerCase() },
      });

      if (!buyer) {
        buyer = await prisma.user.create({
          data: {
            walletAddress: wallet.toLowerCase(),
            sxId: `SX-${uuidv4().slice(0, 8).toUpperCase()}`,
            sxuaBalance: 50000, // Demo: seed with $50k
          },
        });
      }

      if (buyer.id === listing.sellerId) {
        return res.status(400).json({ error: 'Cannot buy your own listing' });
      }

      // Check buyer balance — in demo mode, auto-top-up if insufficient
      if (buyer.sxuaBalance < listing.totalPrice) {
        if (process.env.NODE_ENV === 'development') {
          await prisma.user.update({
            where: { id: buyer.id },
            data: { sxuaBalance: listing.totalPrice + 10000 },
          });
          buyer.sxuaBalance = listing.totalPrice + 10000;
        } else {
          return res.status(400).json({
            error: 'Insufficient SXUA balance',
            required: listing.totalPrice,
            available: buyer.sxuaBalance,
          });
        }
      }

      // Execute the trade
      // Deduct SXUA from buyer
      await prisma.user.update({
        where: { id: buyer.id },
        data: {
          sxuaBalance: { decrement: listing.totalPrice },
          sxpBalance: { increment: listing.amount },
        },
      });

      // Credit SXUA to seller
      await prisma.user.update({
        where: { id: listing.sellerId },
        data: { sxuaBalance: { increment: listing.totalPrice } },
      });

      // Mark listing as sold
      await prisma.resellingListing.update({
        where: { id: listingId },
        data: {
          status: 'sold',
          buyerId: buyer.id,
          soldAt: new Date(),
        },
      });

      const txHash = generateMockTxHash('buy_listing', wallet, listingId);

      // Record buyer transaction
      await prisma.transaction.create({
        data: {
          userId: buyer.id,
          type: 'buy_listing',
          amount: listing.totalPrice,
          netAmount: listing.amount,
          token: 'SXP',
          transactionHash: txHash,
          status: 'confirmed',
          metadata: JSON.stringify({ listingId, sellerId: listing.sellerId }),
        },
      });

      logger.info('Listing purchased', {
        buyer: wallet,
        seller: listing.seller.walletAddress,
        amount: listing.amount,
        price: listing.totalPrice,
      });

      // Fetch updated buyer balance for UI
      const updatedBuyer = await prisma.user.findUnique({ where: { id: buyer.id } });

      res.json({
        success: true,
        amountTransferred: listing.amount,
        pricePaid: listing.totalPrice,
        transactionHash: txHash,
        buyerBalance: {
          sxuaBalance: updatedBuyer.sxuaBalance,
          sxpBalance: updatedBuyer.sxpBalance,
        },
      });
    } catch (err) {
      logger.error('Buy listing error', { error: err.message });
      res.status(500).json({ error: 'Failed to buy listing' });
    }
  });

  /**
   * DELETE /api/marketplace/listings/:listingId
   * Cancel a listing (only seller can cancel)
   */
  router.delete('/listings/:listingId', authMiddleware, async (req, res) => {
    try {
      const { listingId } = req.params;
      const wallet = req.walletAddress || req.body?.wallet;

      const listing = await prisma.resellingListing.findUnique({
        where: { id: listingId },
        include: { seller: true },
      });

      if (!listing) {
        return res.status(404).json({ error: 'Listing not found' });
      }
      if (listing.status !== 'active') {
        return res.status(400).json({ error: 'Listing is no longer active' });
      }
      if (listing.seller.walletAddress !== wallet?.toLowerCase()) {
        return res.status(403).json({ error: 'Only the seller can cancel this listing' });
      }

      // Return tokens to seller
      await prisma.user.update({
        where: { id: listing.sellerId },
        data: { sxpBalance: { increment: listing.amount } },
      });

      // Cancel listing
      await prisma.resellingListing.update({
        where: { id: listingId },
        data: { status: 'cancelled', cancelledAt: new Date() },
      });

      logger.info('Listing cancelled', { wallet, listingId });

      res.json({
        success: true,
        message: 'Listing cancelled and tokens returned',
        listingId,
      });
    } catch (err) {
      logger.error('Cancel listing error', { error: err.message });
      res.status(500).json({ error: 'Failed to cancel listing' });
    }
  });

  return router;
};
