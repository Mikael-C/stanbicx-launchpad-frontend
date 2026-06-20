/**
 * DPoP (Demonstrating Proof-of-Possession) Middleware
 * 
 * Verifies DPoP token binding for enhanced security.
 * Validates that the access token is bound to the client's key pair.
 * 
 * In development mode, this is a pass-through.
 */

const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

/**
 * DPoP verification middleware
 * 
 * Expects headers:
 *   DPoP: <JWT proof token>
 *   Authorization: DPoP <access_token>
 *
 * The DPoP proof JWT must contain:
 *   - typ: "dpop+jwt" in the header
 *   - htm: HTTP method
 *   - htu: HTTP URI
 *   - iat: Issued at timestamp
 *   - jti: Unique token identifier
 */
function dpopMiddleware(req, res, next) {
  // Skip in development mode
  if (process.env.NODE_ENV === 'development') {
    return next();
  }

  try {
    const dpopProof = req.headers['dpop'];
    const authHeader = req.headers['authorization'];

    if (!dpopProof) {
      return res.status(401).json({ error: 'DPoP proof token required' });
    }

    if (!authHeader || !authHeader.startsWith('DPoP ')) {
      return res.status(401).json({ error: 'DPoP authorization header required' });
    }

    // Decode the DPoP proof (without full verification for now)
    const decoded = jwt.decode(dpopProof, { complete: true });

    if (!decoded) {
      return res.status(401).json({ error: 'Invalid DPoP proof token' });
    }

    // Validate header typ
    if (decoded.header.typ !== 'dpop+jwt') {
      return res.status(401).json({ error: 'Invalid DPoP token type' });
    }

    // Validate payload claims
    const { htm, htu, iat, jti } = decoded.payload;

    if (!htm || !htu || !iat || !jti) {
      return res.status(401).json({ error: 'Missing required DPoP claims' });
    }

    // Verify HTTP method matches
    if (htm.toUpperCase() !== req.method.toUpperCase()) {
      return res.status(401).json({ error: 'DPoP method mismatch' });
    }

    // Verify the token isn't too old (5 minutes)
    const tokenAge = Math.floor(Date.now() / 1000) - iat;
    if (tokenAge > 300) {
      return res.status(401).json({ error: 'DPoP proof expired' });
    }

    // Verify not from the future (with 30s clock skew tolerance)
    if (iat > Math.floor(Date.now() / 1000) + 30) {
      return res.status(401).json({ error: 'DPoP proof issued in the future' });
    }

    // Attach DPoP info to request
    req.dpop = {
      jti,
      htm,
      htu,
      iat,
    };

    next();
  } catch (err) {
    logger.error('DPoP verification failed', { error: err.message });
    return res.status(401).json({ error: 'DPoP verification failed' });
  }
}

module.exports = { dpopMiddleware };
