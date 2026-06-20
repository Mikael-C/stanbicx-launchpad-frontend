/**
 * Events Routes
 * 
 * Query indexed blockchain events.
 */

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');

module.exports = function (prisma) {
  /**
   * GET /api/events?chainId=17000&eventName=Deposited&limit=100&offset=0
   * Query events with filters
   */
  router.get('/', async (req, res) => {
    try {
      const {
        chainId,
        eventName,
        contractAddress,
        fromBlock,
        toBlock,
        limit = 100,
        offset = 0,
      } = req.query;

      const where = {};

      if (chainId) {
        where.chainId = parseInt(chainId);
      }
      if (eventName) {
        where.eventName = eventName;
      }
      if (contractAddress) {
        where.contractAddress = contractAddress.toLowerCase();
      }
      if (fromBlock || toBlock) {
        where.blockNumber = {};
        if (fromBlock) where.blockNumber.gte = parseInt(fromBlock);
        if (toBlock) where.blockNumber.lte = parseInt(toBlock);
      }

      const [events, total] = await Promise.all([
        prisma.event.findMany({
          where,
          orderBy: { blockNumber: 'desc' },
          skip: parseInt(offset),
          take: Math.min(parseInt(limit), 1000), // Cap at 1000
        }),
        prisma.event.count({ where }),
      ]);

      const page = Math.floor(parseInt(offset) / parseInt(limit)) + 1;

      res.json({
        events: events.map((e) => ({
          id: e.id,
          chainId: e.chainId,
          contractAddress: e.contractAddress,
          eventName: e.eventName,
          blockNumber: e.blockNumber,
          transactionHash: e.transactionHash,
          logIndex: e.logIndex,
          eventData: JSON.parse(e.eventData || '{}'),
          blockTimestamp: e.blockTimestamp,
          processedAt: e.processedAt,
        })),
        total,
        page,
        limit: parseInt(limit),
        offset: parseInt(offset),
      });
    } catch (err) {
      logger.error('Get events error', { error: err.message });
      res.status(500).json({ error: 'Failed to retrieve events' });
    }
  });

  /**
   * GET /api/events/:chainId/:transactionHash
   * Get all events from a specific transaction
   */
  router.get('/:chainId/:transactionHash', async (req, res) => {
    try {
      const { chainId, transactionHash } = req.params;

      const events = await prisma.event.findMany({
        where: {
          chainId: parseInt(chainId),
          transactionHash,
        },
        orderBy: { logIndex: 'asc' },
      });

      if (events.length === 0) {
        return res.status(404).json({ error: 'No events found for this transaction' });
      }

      res.json({
        transactionHash,
        chainId: parseInt(chainId),
        events: events.map((e) => ({
          id: e.id,
          contractAddress: e.contractAddress,
          eventName: e.eventName,
          blockNumber: e.blockNumber,
          logIndex: e.logIndex,
          eventData: JSON.parse(e.eventData || '{}'),
          blockTimestamp: e.blockTimestamp,
        })),
      });
    } catch (err) {
      logger.error('Get tx events error', { error: err.message });
      res.status(500).json({ error: 'Failed to retrieve transaction events' });
    }
  });

  return router;
};
