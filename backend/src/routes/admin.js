/**
 * Admin Routes
 * 
 * 3-of-3 governance proposals, kill switch, and audit log.
 */

const express = require('express');
const router = express.Router();
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const { isValidAddress } = require('../services/blockchain');
const logger = require('../utils/logger');

// In-memory kill switch state (would be on-chain in production)
let killSwitchState = {
  isPaused: false,
  pausedBy: null,
  pausedAt: null,
};

module.exports = function (prisma) {

  /**
   * GET /api/admin/proposals
   * Returns all proposals with approval counts
   */
  router.get('/proposals', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const { status } = req.query;
      const where = status ? { status } : {};

      const proposals = await prisma.proposal.findMany({
        where,
        orderBy: { createdAt: 'desc' },
      });

      res.json({
        proposals: proposals.map((p) => ({
          id: p.id,
          proposer: p.proposer,
          description: p.description,
          calldata: p.calldata,
          approvals: JSON.parse(p.approvals),
          approvalCount: p.approvalCount,
          requiredApprovals: p.requiredApprovals,
          status: p.status,
          executedAt: p.executedAt,
          createdAt: p.createdAt,
        })),
      });
    } catch (err) {
      logger.error('Get proposals error', { error: err.message });
      res.status(500).json({ error: 'Failed to retrieve proposals' });
    }
  });

  /**
   * POST /api/admin/proposals
   * body: { wallet, description, calldata }
   * Create a new governance proposal
   */
  router.post('/proposals', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const { wallet, description, calldata } = req.body;

      if (!description) {
        return res.status(400).json({ error: 'Description required' });
      }

      const proposal = await prisma.proposal.create({
        data: {
          proposer: wallet.toLowerCase(),
          description,
          calldata: calldata || null,
          approvals: JSON.stringify([wallet.toLowerCase()]),
          approvalCount: 1,
        },
      });

      // Log admin action
      await prisma.adminAction.create({
        data: {
          wallet: wallet.toLowerCase(),
          action: 'create_proposal',
          description: `Created proposal: ${description}`,
          metadata: JSON.stringify({ proposalId: proposal.id }),
        },
      });

      logger.info('Proposal created', { wallet, proposalId: proposal.id });

      res.status(201).json({
        success: true,
        proposalId: proposal.id,
        approvalsRemaining: proposal.requiredApprovals - 1,
      });
    } catch (err) {
      logger.error('Create proposal error', { error: err.message });
      res.status(500).json({ error: 'Failed to create proposal' });
    }
  });

  /**
   * POST /api/admin/proposals/:id/approve
   * body: { wallet }
   * Approve a proposal (3-of-3 required to execute)
   */
  router.post('/proposals/:id/approve', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const { id } = req.params;
      const { wallet } = req.body;

      const proposal = await prisma.proposal.findUnique({
        where: { id },
      });

      if (!proposal) {
        return res.status(404).json({ error: 'Proposal not found' });
      }
      if (proposal.status !== 'pending') {
        return res.status(400).json({ error: `Proposal is already ${proposal.status}` });
      }

      const approvals = JSON.parse(proposal.approvals);

      if (approvals.includes(wallet.toLowerCase())) {
        return res.status(400).json({ error: 'You have already approved this proposal' });
      }

      approvals.push(wallet.toLowerCase());
      const newApprovalCount = approvals.length;
      const executed = newApprovalCount >= proposal.requiredApprovals;

      await prisma.proposal.update({
        where: { id },
        data: {
          approvals: JSON.stringify(approvals),
          approvalCount: newApprovalCount,
          status: executed ? 'executed' : 'pending',
          executedAt: executed ? new Date() : null,
        },
      });

      // Log admin action
      await prisma.adminAction.create({
        data: {
          wallet: wallet.toLowerCase(),
          action: executed ? 'execute_proposal' : 'approve_proposal',
          description: `${executed ? 'Executed' : 'Approved'} proposal: ${proposal.description}`,
          metadata: JSON.stringify({ proposalId: id, approvalCount: newApprovalCount }),
        },
      });

      logger.info('Proposal approved', {
        wallet,
        proposalId: id,
        approvalCount: newApprovalCount,
        executed,
      });

      res.json({
        success: true,
        approvalCount: newApprovalCount,
        approvalsRemaining: Math.max(0, proposal.requiredApprovals - newApprovalCount),
        executed,
      });
    } catch (err) {
      logger.error('Approve proposal error', { error: err.message });
      res.status(500).json({ error: 'Failed to approve proposal' });
    }
  });

  /**
   * POST /api/admin/proposals/:id/reject
   * body: { wallet }
   * Reject a pending proposal
   */
  router.post('/proposals/:id/reject', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const { id } = req.params;
      const { wallet } = req.body;

      const proposal = await prisma.proposal.findUnique({
        where: { id },
      });

      if (!proposal) {
        return res.status(404).json({ error: 'Proposal not found' });
      }
      if (proposal.status !== 'pending') {
        return res.status(400).json({ error: `Proposal is already ${proposal.status}` });
      }

      await prisma.proposal.update({
        where: { id },
        data: {
          status: 'rejected',
        },
      });

      // Log admin action
      await prisma.adminAction.create({
        data: {
          wallet: wallet.toLowerCase(),
          action: 'reject_proposal',
          description: `Rejected proposal: ${proposal.description}`,
          metadata: JSON.stringify({ proposalId: id }),
        },
      });

      logger.info('Proposal rejected', { wallet, proposalId: id });

      res.json({
        success: true,
        status: 'rejected',
      });
    } catch (err) {
      logger.error('Reject proposal error', { error: err.message });
      res.status(500).json({ error: 'Failed to reject proposal' });
    }
  });

  /**
   * GET /api/admin/kill-switch/status
   * Returns current kill switch state
   */
  router.get('/kill-switch/status', async (req, res) => {
    res.json(killSwitchState);
  });

  /**
   * POST /api/admin/kill-switch/toggle
   * body: { wallet, action: 'activate' | 'deactivate' }
   */
  router.post('/kill-switch/toggle', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const { wallet, action } = req.body;

      if (!['activate', 'deactivate'].includes(action)) {
        return res.status(400).json({ error: 'Action must be "activate" or "deactivate"' });
      }

      if (action === 'activate') {
        killSwitchState = {
          isPaused: true,
          pausedBy: wallet.toLowerCase(),
          pausedAt: new Date().toISOString(),
        };
      } else {
        killSwitchState = {
          isPaused: false,
          pausedBy: null,
          pausedAt: null,
        };
      }

      // Log admin action
      await prisma.adminAction.create({
        data: {
          wallet: wallet.toLowerCase(),
          action: `kill_switch_${action}`,
          description: `Kill switch ${action}d`,
        },
      });

      logger.warn('Kill switch toggled', { wallet, action, state: killSwitchState });

      res.json({
        success: true,
        ...killSwitchState,
      });
    } catch (err) {
      logger.error('Kill switch error', { error: err.message });
      res.status(500).json({ error: 'Failed to toggle kill switch' });
    }
  });

  /**
   * GET /api/admin/audit-log
   * Returns admin action history
   */
  router.get('/audit-log', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const { limit = 50, offset = 0, action } = req.query;
      const where = action ? { action } : {};

      const [actions, total] = await Promise.all([
        prisma.adminAction.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: parseInt(offset),
          take: parseInt(limit),
        }),
        prisma.adminAction.count({ where }),
      ]);

      res.json({
        actions: actions.map((a) => ({
          id: a.id,
          wallet: a.wallet,
          action: a.action,
          description: a.description,
          metadata: a.metadata ? JSON.parse(a.metadata) : null,
          createdAt: a.createdAt,
        })),
        total,
        offset: parseInt(offset),
        limit: parseInt(limit),
      });
    } catch (err) {
      logger.error('Audit log error', { error: err.message });
      res.status(500).json({ error: 'Failed to retrieve audit log' });
    }
  });

  /**
   * GET /api/admin/devices
   * Returns registered master devices (DMS)
   */
  router.get('/devices', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const adminWallets = (process.env.ADMIN_WALLETS || '').split(',').map(w => w.trim().toLowerCase());
      
      const devices = await prisma.user.findMany({
        where: {
          walletAddress: { in: adminWallets },
          deviceHash: { not: null },
        },
        select: {
          walletAddress: true,
          deviceHash: true,
          updatedAt: true,
        },
      });

      res.json({
        devices: devices.map(d => ({
          wallet: d.walletAddress,
          deviceHash: d.deviceHash,
          lastSeen: d.updatedAt,
          status: 'active',
        })),
        total: devices.length,
      });
    } catch (err) {
      logger.error('Devices error', { error: err.message });
      res.status(500).json({ error: 'Failed to retrieve devices' });
    }
  });

  /**
   * GET /api/admin/verification/status
   * Returns formal verification status from DB
   */
  router.get('/verification/status', async (req, res) => {
    try {
      const results = await prisma.verificationResult.findMany({
        orderBy: { contractName: 'asc' },
      });

      // If no results yet, return defaults for all contracts
      const contractNames = [
        'SXUACore', 'LaunchpadCore', 'ResellingMarketplace', 'FeeManager',
        'KillSwitch', 'TimelockController', 'ReferralSystem', 'BuyStablesPortal',
      ];

      const contracts = contractNames.map(name => {
        const result = results.find(r => r.contractName === name);
        return {
          name,
          status: result?.status || 'pending',
          propertiesVerified: result?.propertiesVerified || 0,
          propertiesTotal: result?.propertiesTotal || 0,
          lastVerified: result?.lastVerified || null,
          rules: result?.rulesResults ? JSON.parse(result.rulesResults) : [],
        };
      });

      res.json({
        contracts,
        totalContracts: contracts.length,
        verifiedCount: contracts.filter(c => c.status === 'passed').length,
        allVerified: contracts.every(c => c.status === 'passed'),
      });
    } catch (err) {
      logger.error('Verification status error', { error: err.message });
      res.status(500).json({ error: 'Failed to retrieve verification status' });
    }
  });

  /**
   * POST /api/admin/verification/results
   * Receives verification results from the certora/verify.js CLI script
   */
  router.post('/verification/results', async (req, res) => {
    try {
      const { results } = req.body;
      if (!results || !Array.isArray(results)) {
        return res.status(400).json({ error: 'Results array required' });
      }

      for (const result of results) {
        await prisma.verificationResult.upsert({
          where: { contractName: result.contractName },
          update: {
            status: result.status,
            propertiesVerified: result.propertiesVerified,
            propertiesTotal: result.propertiesTotal,
            rulesResults: JSON.stringify(result.rules || []),
            lastVerified: new Date(),
            verifiedBy: result.verifiedBy || 'system',
          },
          create: {
            contractName: result.contractName,
            status: result.status,
            propertiesVerified: result.propertiesVerified,
            propertiesTotal: result.propertiesTotal,
            rulesResults: JSON.stringify(result.rules || []),
            lastVerified: new Date(),
            verifiedBy: result.verifiedBy || 'system',
          },
        });
      }

      // Log admin action
      await prisma.adminAction.create({
        data: {
          wallet: 'system',
          action: 'verification_completed',
          description: `Formal verification completed for ${results.length} contracts`,
          metadata: JSON.stringify({
            contractsVerified: results.length,
            allPassed: results.every(r => r.status === 'passed'),
          }),
        },
      });

      logger.info('Verification results received', { count: results.length });
      res.json({ success: true, updated: results.length });
    } catch (err) {
      logger.error('Verification results error', { error: err.message });
      res.status(500).json({ error: 'Failed to save verification results' });
    }
  });

  /**
   * POST /api/admin/verification/run
   * Triggers verification from the admin UI (spawns verify.js in background)
   */
  router.post('/verification/run', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const { spawn } = require('child_process');
      const path = require('path');
      const scriptPath = path.resolve(__dirname, '../../../certora/verify.js');

      // Mark all contracts as running
      const contractNames = [
        'SXUACore', 'LaunchpadCore', 'ResellingMarketplace', 'FeeManager',
        'KillSwitch', 'TimelockController', 'ReferralSystem', 'BuyStablesPortal',
      ];
      for (const name of contractNames) {
        await prisma.verificationResult.upsert({
          where: { contractName: name },
          update: { status: 'running' },
          create: { contractName: name, status: 'running' },
        });
      }

      // Spawn verification in background
      const child = spawn('node', [scriptPath, '--simulate'], {
        cwd: path.resolve(__dirname, '../../..'),
        detached: true,
        stdio: 'ignore',
      });
      child.unref();

      logger.info('Verification run triggered');
      res.json({ success: true, message: 'Verification started in background. Check status for updates.' });
    } catch (err) {
      logger.error('Verification run error', { error: err.message });
      res.status(500).json({ error: 'Failed to start verification' });
    }
  });

  /**
   * POST /api/admin/verification/deploy
   * Checks DB verification status before allowing deployment
   */
  router.post('/verification/deploy', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const { contractName } = req.body;

      // Check verification status from DB
      const verification = await prisma.verificationResult.findUnique({
        where: { contractName: contractName || '' },
      });

      if (!verification || verification.status !== 'passed') {
        return res.status(403).json({
          error: 'Contract not formally verified',
          message: `Cannot deploy ${contractName}: All formal verification checks must pass before deployment is allowed.`,
          status: verification?.status || 'not_verified',
        });
      }

      res.json({
        success: true,
        message: `${contractName} is verified and ready for deployment.`,
        instructions: [
          '1. Set DEPLOYER_PRIVATE_KEY in .env',
          '2. Run: npx hardhat run scripts/deploy.js --network hoodi',
          '3. Update contract addresses in backend .env',
          '4. Restart the backend server',
        ],
      });
    } catch (err) {
      logger.error('Deploy error', { error: err.message });
      res.status(500).json({ error: 'Deployment failed' });
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  //  DEMO-ONLY ENDPOINTS (for security feature demonstrations)
  // ═══════════════════════════════════════════════════════════════════

  // The "valid" device fingerprint for demo purposes
  const VALID_DEVICE_FINGERPRINT = 'a1b2c3d4e5f6789012345678abcdef90';

  /**
   * POST /api/admin/demo/dpop-test
   * body: { wallet, deviceFingerprint, method, uri }
   * Simulates DPoP token binding verification.
   * If deviceFingerprint doesn't match the "valid" fingerprint,
   * returns 401 as if a stolen token was replayed from a different device.
   */
  router.post('/demo/dpop-test', async (req, res) => {
    try {
      const { wallet, deviceFingerprint, method, uri } = req.body;

      if (!wallet || !deviceFingerprint) {
        return res.status(400).json({ error: 'wallet and deviceFingerprint required' });
      }

      const isValid = deviceFingerprint === VALID_DEVICE_FINGERPRINT;

      // Log the attempt
      await prisma.adminAction.create({
        data: {
          wallet: (wallet || 'unknown').toLowerCase(),
          action: isValid ? 'dpop_verify_success' : 'dpop_verify_rejected',
          description: isValid
            ? 'DPoP token binding verified — device fingerprint matches'
            : `DPoP REJECTED — stolen token replay detected. Expected device ${VALID_DEVICE_FINGERPRINT.slice(0, 8)}..., got ${deviceFingerprint.slice(0, 8)}...`,
          metadata: JSON.stringify({
            deviceFingerprint,
            expectedFingerprint: VALID_DEVICE_FINGERPRINT,
            method: method || 'POST',
            uri: uri || '/api/account/withdraw',
            timestamp: new Date().toISOString(),
          }),
        },
      });

      if (!isValid) {
        logger.warn('DPoP demo: stolen token replay detected', {
          wallet,
          attackerFingerprint: deviceFingerprint,
          expectedFingerprint: VALID_DEVICE_FINGERPRINT,
        });

        return res.status(401).json({
          error: 'Unauthorized',
          code: 'DPOP_DEVICE_BINDING_MISMATCH',
          message: 'DPoP device binding mismatch — this token was issued to a different device. The request has been rejected and logged.',
          details: {
            expectedDevice: `${VALID_DEVICE_FINGERPRINT.slice(0, 8)}...${VALID_DEVICE_FINGERPRINT.slice(-4)}`,
            requestDevice: `${deviceFingerprint.slice(0, 8)}...${deviceFingerprint.slice(-4)}`,
            method: method || 'POST',
            uri: uri || '/api/account/withdraw',
            rejectedAt: new Date().toISOString(),
          },
        });
      }

      logger.info('DPoP demo: token binding verified', { wallet });

      return res.json({
        success: true,
        message: 'DPoP token binding verified — device fingerprint matches.',
        device: `${VALID_DEVICE_FINGERPRINT.slice(0, 8)}...${VALID_DEVICE_FINGERPRINT.slice(-4)}`,
      });
    } catch (err) {
      logger.error('DPoP demo error', { error: err.message });
      res.status(500).json({ error: 'DPoP test failed' });
    }
  });

  /**
   * POST /api/admin/demo/dig-check
   * body: { wallet, deviceFingerprint, simulateCompromised }
   * Simulates Device Integrity Guard (DIG) scanning.
   * If simulateCompromised is true, returns a compromised device response.
   */
  router.post('/demo/dig-check', async (req, res) => {
    try {
      const { wallet, deviceFingerprint, simulateCompromised } = req.body;

      const isCompromised = simulateCompromised === true;

      // Log the check
      await prisma.adminAction.create({
        data: {
          wallet: (wallet || 'unknown').toLowerCase(),
          action: isCompromised ? 'dig_compromised_detected' : 'dig_check_passed',
          description: isCompromised
            ? 'DIG ALERT — Device integrity check FAILED. Device appears jailbroken/rooted.'
            : 'DIG check passed — device integrity verified.',
          metadata: JSON.stringify({
            deviceFingerprint: deviceFingerprint || 'unknown',
            checkResults: isCompromised
              ? {
                  rootDetection: 'FAILED',
                  signatureVerification: 'FAILED',
                  tamperDetection: 'ALERT',
                  debuggerAttached: true,
                  emulatorDetected: false,
                }
              : {
                  rootDetection: 'PASSED',
                  signatureVerification: 'PASSED',
                  tamperDetection: 'CLEAR',
                  debuggerAttached: false,
                  emulatorDetected: false,
                },
            timestamp: new Date().toISOString(),
          }),
        },
      });

      if (isCompromised) {
        logger.warn('DIG demo: compromised device detected', { wallet });

        return res.status(403).json({
          error: 'Device Compromised',
          code: 'DIG_INTEGRITY_FAILURE',
          message: 'Device integrity check failed. This device appears to be jailbroken or rooted. All operations are suspended.',
          checks: {
            rootDetection: 'FAILED',
            signatureVerification: 'FAILED',
            tamperDetection: 'ALERT',
            debuggerAttached: true,
            emulatorDetected: false,
          },
          deviceFingerprint: deviceFingerprint || 'unknown',
          detectedAt: new Date().toISOString(),
        });
      }

      return res.json({
        success: true,
        message: 'Device integrity verified — all checks passed.',
        checks: {
          rootDetection: 'PASSED',
          signatureVerification: 'PASSED',
          tamperDetection: 'CLEAR',
          debuggerAttached: false,
          emulatorDetected: false,
        },
      });
    } catch (err) {
      logger.error('DIG demo error', { error: err.message });
      res.status(500).json({ error: 'DIG check failed' });
    }
  });

  return router;
};
