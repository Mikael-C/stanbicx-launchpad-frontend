/**
 * SX Launchpad Backend - Express Server Entry Point
 * 
 * Sets up Express with security middleware, mounts all routes,
 * initializes Prisma, starts the event indexer, and runs
 * HTTP + WebSocket on the same port.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const express = require('express');
const http = require('http');
const helmet = require('helmet');
const cors = require('cors');
const { WebSocketServer } = require('ws');
const { PrismaClient } = require('@prisma/client');

const logger = require('./utils/logger');
const { generalLimiter } = require('./middleware/rateLimiter');
const EventIndexer = require('./indexer/indexer');

// ─── Initialize Prisma ──────────────────────────────────────────────
const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development'
    ? [{ emit: 'event', level: 'warn' }, { emit: 'event', level: 'error' }]
    : [{ emit: 'event', level: 'error' }],
});

prisma.$on('error', (e) => logger.error('Prisma error', { message: e.message }));
prisma.$on('warn', (e) => logger.warn('Prisma warning', { message: e.message }));

// ─── Express App ────────────────────────────────────────────────────
const app = express();

// Security headers
app.use(helmet({
  contentSecurityPolicy: false, // Let frontend handle CSP
  crossOriginEmbedderPolicy: false,
}));

// CORS
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'x-wallet-address',
    'x-signature',
    'x-message',
    'DPoP',
  ],
  credentials: true,
}));

// Body parsing
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Global rate limiter
app.use(generalLimiter);

// Request logging (non-health)
app.use((req, res, next) => {
  if (req.path !== '/api/health') {
    logger.info(`${req.method} ${req.path}`, {
      ip: req.ip,
      query: Object.keys(req.query).length ? req.query : undefined,
    });
  }
  next();
});

// ─── Mount Routes ───────────────────────────────────────────────────
const healthRoutes = require('./routes/health');
const accountRoutes = require('./routes/account');
const stablesRoutes = require('./routes/stables');
const launchpadRoutes = require('./routes/launchpad');
const marketplaceRoutes = require('./routes/marketplace');
const referralRoutes = require('./routes/referral');
const adminRoutes = require('./routes/admin');
const eventsRoutes = require('./routes/events');
const chatRoutes = require('./routes/chat');
const statsRoutes = require('./routes/stats');

// Rate limiter imports for specific routes
const { transactionLimiter, chatLimiter, adminLimiter } = require('./middleware/rateLimiter');

app.use('/api/health', healthRoutes);
app.use('/api/account', transactionLimiter, accountRoutes(prisma));
app.use('/api/stables', transactionLimiter, stablesRoutes(prisma));
app.use('/api/launchpad', transactionLimiter, launchpadRoutes(prisma));
app.use('/api/marketplace', transactionLimiter, marketplaceRoutes(prisma));
app.use('/api/referral', referralRoutes(prisma));
app.use('/api/leaderboard', referralRoutes(prisma));
app.use('/api/admin', adminLimiter, adminRoutes(prisma));
app.use('/api/events', eventsRoutes(prisma));
app.use('/api/chat', chatLimiter, chatRoutes(prisma));
app.use('/api/stats', statsRoutes(prisma));

// ─── 404 Handler ────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`,
    timestamp: new Date().toISOString(),
  });
});

// ─── Global Error Handler ───────────────────────────────────────────
app.use((err, req, res, _next) => {
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  res.status(err.status || 500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
    timestamp: new Date().toISOString(),
  });
});

// ─── HTTP + WebSocket Server ────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '3001', 10);
const server = http.createServer(app);

// WebSocket server on same port
const wss = new WebSocketServer({ server, path: '/ws' });

// Connected WebSocket clients
const wsClients = new Set();

wss.on('connection', (ws, req) => {
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  logger.info('WebSocket client connected', { ip: clientIp });

  wsClients.add(ws);

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      logger.debug('WebSocket message received', { type: message.type });

      // Handle ping
      if (message.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
      }
    } catch (err) {
      logger.warn('Invalid WebSocket message', { error: err.message });
    }
  });

  ws.on('close', () => {
    wsClients.delete(ws);
    logger.debug('WebSocket client disconnected');
  });

  ws.on('error', (err) => {
    logger.error('WebSocket error', { error: err.message });
    wsClients.delete(ws);
  });

  // Send welcome message
  ws.send(JSON.stringify({
    type: 'connected',
    message: 'Connected to SX Launchpad WebSocket',
    timestamp: Date.now(),
  }));
});

/**
 * Broadcast a message to all connected WebSocket clients
 * @param {string} type - Message type
 * @param {object} data - Message data
 */
function broadcastWs(type, data) {
  const message = JSON.stringify({ type, data, timestamp: Date.now() });
  for (const client of wsClients) {
    if (client.readyState === 1) {
      // WebSocket.OPEN
      client.send(message);
    }
  }
}

// Make broadcast available globally
app.locals.broadcastWs = broadcastWs;

// ─── Start Server ───────────────────────────────────────────────────
async function startServer() {
  try {
    // Test database connection
    await prisma.$connect();
    logger.info('Database connected');

    // Start HTTP + WS server
    server.listen(PORT, () => {
      logger.info(`SX Launchpad Backend running on port ${PORT}`, {
        env: process.env.NODE_ENV || 'development',
        corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
      });

      logger.info('API Routes mounted:');
      logger.info('  GET  /api/health');
      logger.info('  GET  /api/account/balance');
      logger.info('  POST /api/account/deposit');
      logger.info('  POST /api/account/withdraw');
      logger.info('  GET  /api/stables/quote');
      logger.info('  POST /api/stables/buy');
      logger.info('  GET  /api/launchpad/projects');
      logger.info('  POST /api/launchpad/purchase');
      logger.info('  GET  /api/launchpad/vesting/:purchaseId');
      logger.info('  POST /api/launchpad/claim');
      logger.info('  POST /api/launchpad/early-exit');
      logger.info('  GET  /api/marketplace/listings');
      logger.info('  POST /api/marketplace/list');
      logger.info('  POST /api/marketplace/buy/:listingId');
      logger.info('  DEL  /api/marketplace/listings/:listingId');
      logger.info('  GET  /api/referral/stats');
      logger.info('  POST /api/referral/register');
      logger.info('  GET  /api/leaderboard');
      logger.info('  GET  /api/admin/proposals');
      logger.info('  POST /api/admin/proposals');
      logger.info('  POST /api/admin/proposals/:id/approve');
      logger.info('  GET  /api/admin/kill-switch/status');
      logger.info('  POST /api/admin/kill-switch/toggle');
      logger.info('  GET  /api/admin/audit-log');
      logger.info('  GET  /api/events');
      logger.info('  GET  /api/events/:chainId/:transactionHash');
      logger.info('  POST /api/chat');
      logger.info('  GET  /api/chat/jailbreak/attempts');
      logger.info('  GET  /api/chat/jailbreak/stats');
      logger.info('  GET  /api/stats');
      logger.info('  WS   /ws');
    });

    // Start event indexer
    const indexer = new EventIndexer(prisma);
    await indexer.start();
    indexer.setBroadcast(broadcastWs);

  } catch (err) {
    logger.error('Failed to start server', { error: err.message, stack: err.stack });
    process.exit(1);
  }
}

// ─── Graceful Shutdown ──────────────────────────────────────────────
async function shutdown(signal) {
  logger.info(`${signal} received, shutting down gracefully`);

  // Close WebSocket connections
  for (const client of wsClients) {
    client.close(1001, 'Server shutting down');
  }

  // Close HTTP server
  server.close(() => {
    logger.info('HTTP server closed');
  });

  // Disconnect Prisma
  await prisma.$disconnect();
  logger.info('Database disconnected');

  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', { reason: reason?.toString() });
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', { error: err.message, stack: err.stack });
  process.exit(1);
});

// Start
startServer();

module.exports = { app, server, prisma };
