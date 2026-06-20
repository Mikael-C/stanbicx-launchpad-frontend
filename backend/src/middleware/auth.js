/**
 * Auth Middleware
 * 
 * Wallet-based authentication via signed messages.
 * In dev mode, allows a simpler wallet query-param auth for testing.
 */

const { ethers } = require('ethers');
const logger = require('../utils/logger');
const { isValidAddress, getChecksumAddress } = require('../services/blockchain');

/**
 * Verify wallet signature auth middleware.
 * 
 * Expects headers:
 *   x-wallet-address: <0x...>
 *   x-signature: <signature>
 *   x-message: <signed message>  (should include timestamp to prevent replay)
 *
 * In development mode (NODE_ENV=development), also accepts
 * the wallet address from the request body or query param without signature.
 */
function authMiddleware(req, res, next) {
  try {
    const walletAddress =
      req.headers['x-wallet-address'] ||
      req.body?.wallet ||
      req.query?.wallet;

    if (!walletAddress) {
      return res.status(401).json({ error: 'Wallet address required' });
    }

    if (!isValidAddress(walletAddress)) {
      return res.status(400).json({ error: 'Invalid wallet address' });
    }

    // Development mode: skip signature verification
    if (process.env.NODE_ENV === 'development') {
      req.walletAddress = getChecksumAddress(walletAddress);
      return next();
    }

    // Production: verify signature
    const signature = req.headers['x-signature'];
    const message = req.headers['x-message'];

    if (!signature || !message) {
      return res.status(401).json({
        error: 'Signature and message headers required for authentication',
      });
    }

    // Verify the message isn't too old (5 minutes)
    const messageParts = message.split(':');
    const timestamp = parseInt(messageParts[messageParts.length - 1], 10);
    if (Date.now() - timestamp > 5 * 60 * 1000) {
      return res.status(401).json({ error: 'Message expired, please sign a new message' });
    }

    // Recover address from signature
    const recoveredAddress = ethers.verifyMessage(message, signature);

    if (recoveredAddress.toLowerCase() !== walletAddress.toLowerCase()) {
      return res.status(401).json({ error: 'Signature does not match wallet address' });
    }

    req.walletAddress = getChecksumAddress(walletAddress);
    next();
  } catch (err) {
    logger.error('Auth middleware error', { error: err.message });
    return res.status(401).json({ error: 'Authentication failed' });
  }
}

/**
 * Admin-only middleware. Must be used AFTER authMiddleware.
 * Checks if the wallet is in the ADMIN_WALLETS list.
 */
function adminMiddleware(req, res, next) {
  const adminWallets = (process.env.ADMIN_WALLETS || '')
    .split(',')
    .map((w) => w.trim().toLowerCase())
    .filter(Boolean);

  if (!req.walletAddress) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (!adminWallets.includes(req.walletAddress.toLowerCase())) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  next();
}

module.exports = { authMiddleware, adminMiddleware };
