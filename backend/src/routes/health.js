/**
 * Health Check Route
 */

const express = require('express');
const router = express.Router();
const { getLatestBlock, CHAINS } = require('../services/blockchain');
const logger = require('../utils/logger');

const startTime = Date.now();

// GET /api/health
router.get('/', async (req, res) => {
  try {
    const defaultChainId = parseInt(process.env.HOODI_CHAIN_ID || '17000', 10);
    let lastBlock = 0;
    let chainName = CHAINS[defaultChainId]?.name || 'Unknown';

    try {
      lastBlock = await getLatestBlock(defaultChainId);
    } catch {
      lastBlock = -1; // RPC unreachable
    }

    const uptime = Math.floor((Date.now() - startTime) / 1000);

    res.json({
      status: 'healthy',
      lastBlock,
      chain: chainName,
      chainId: defaultChainId,
      uptime,
      uptimeFormatted: formatUptime(uptime),
      timestamp: new Date().toISOString(),
      version: '1.0.0',
    });
  } catch (err) {
    logger.error('Health check failed', { error: err.message });
    res.status(500).json({
      status: 'unhealthy',
      error: err.message,
      timestamp: new Date().toISOString(),
    });
  }
});

function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${d}d ${h}h ${m}m ${s}s`;
}

module.exports = router;
