/**
 * Event Indexer
 * 
 * Connects to Hoodi and Base Sepolia via public RPCs.
 * Subscribes to contract events, stores them in the database,
 * tracks checkpoints, handles reorgs, and retries with exponential backoff.
 */

const { ethers } = require('ethers');
const logger = require('../utils/logger');
const { getProvider, getLatestBlock, CHAINS } = require('../services/blockchain');

// Indexer configuration
const POLL_INTERVAL_MS = 15000; // 15 seconds
const MAX_BLOCK_RANGE = 500;
const MAX_RETRIES = 5;
const BASE_RETRY_DELAY_MS = 1000;
const CONFIRMATION_BLOCKS = 6; // Blocks to wait before considering final

// Contract addresses to index (placeholder - update with real addresses)
const CONTRACTS_TO_INDEX = {
  17000: [
    // Hoodi contracts (placeholders)
  ],
  84532: [
    // Base Sepolia contracts (placeholders)
  ],
};

// Generic ERC-20 / protocol events ABI for indexing
const GENERIC_EVENTS_ABI = [
  'event StablesPurchased(address indexed user, uint256 inputAmount, string sourceCurrency, uint256 finalAmount, uint256 totalFees)',
  'event UserRegistered(address indexed user, uint256 timestamp)',
  'event Deposited(address indexed user, address indexed token, uint256 amount, bool isCommitted, uint256 subAccountId)',
  'event Withdrawn(address indexed user, uint256 amount, uint256 fee, uint256 netReceived)',
  'event YieldAccrued(address indexed user, uint256 indexed subAccountId, uint256 yieldAmount)',
  'event SubAccountCreated(address indexed user, uint256 indexed subAccountId, uint256 principal, uint256 maturityTimestamp)',
  'event ProjectCreated(uint256 indexed projectId, string name, uint256 price)',
  'event TokensPurchased(address indexed user, uint256 indexed projectId, uint256 amount, uint256 vestingEndTimestamp)',
  'event VestedTokensClaimed(address indexed user, uint256 indexed purchaseId, uint256 amount, uint256 mintingCostPaid)',
  'event ForfeitureExecuted(address indexed user, uint256 indexed purchaseId, uint256 forfeitedAmount)',
  'event TokensListed(address indexed seller, uint256 amount, uint256 pricePerToken, uint256 indexed listingId)',
  'event TokensCancelled(uint256 indexed listingId, address indexed seller)',
  'event ReferralRegistered(address indexed referrer, address indexed referee, bytes32 code)',
  'event ReferralCompleted(address indexed referrer, address indexed referee, uint256 rewardAmount)',
  'event FlatBonusAwarded(address indexed referrer, uint256 amount)',
  'event KillSwitchActivated(address indexed activatedBy, uint256 timestamp)',
  'event KillSwitchDeactivated(uint256 timestamp)',
  'event FeeUpdated(string feeType, uint256 oldRate, uint256 newRate)',
  'event ProposalCreated(uint256 indexed id, address indexed proposer, string description)',
  'event ProposalApproved(uint256 indexed id, address indexed approver, uint256 approvalCount)',
  'event ProposalExecuted(uint256 indexed id)',
];

class EventIndexer {
  constructor(prisma) {
    this.prisma = prisma;
    this.isRunning = false;
    this.intervals = {};
    this.broadcastWs = null;
  }

  setBroadcast(fn) {
    this.broadcastWs = fn;
  }

  /**
   * Start the indexer for all configured chains
   */
  async start() {
    if (this.isRunning) {
      logger.warn('Indexer is already running');
      return;
    }

    this.isRunning = true;
    logger.info('Starting event indexer');

    for (const chainIdStr of Object.keys(CHAINS)) {
      const chainId = parseInt(chainIdStr);
      await this.initializeChain(chainId);
      this.startPolling(chainId);
    }

    logger.info('Event indexer started for all chains');
  }

  /**
   * Stop the indexer
   */
  stop() {
    this.isRunning = false;
    for (const chainId of Object.keys(this.intervals)) {
      clearInterval(this.intervals[chainId]);
    }
    this.intervals = {};
    logger.info('Event indexer stopped');
  }

  /**
   * Initialize sync status for a chain
   */
  async initializeChain(chainId) {
    try {
      const existing = await this.prisma.syncStatus.findUnique({
        where: { chainId },
      });

      if (!existing) {
        let startBlock = 0;
        try {
          startBlock = await getLatestBlock(chainId);
        } catch {
          startBlock = 0;
        }

        await this.prisma.syncStatus.create({
          data: {
            chainId,
            lastIndexedBlock: startBlock,
          },
        });

        logger.info(`Initialized chain ${chainId} at block ${startBlock}`);
      } else {
        logger.info(`Chain ${chainId} resuming from block ${existing.lastIndexedBlock}`);
      }
    } catch (err) {
      logger.error(`Failed to initialize chain ${chainId}`, { error: err.message });
    }
  }

  /**
   * Start polling for new blocks/events
   */
  startPolling(chainId) {
    this.intervals[chainId] = setInterval(async () => {
      if (!this.isRunning) return;

      try {
        await this.indexNewBlocks(chainId);
      } catch (err) {
        logger.error(`Polling error for chain ${chainId}`, { error: err.message });
        await this.recordError(chainId, null, 'polling_error', err.message);
      }
    }, POLL_INTERVAL_MS);

    logger.info(`Polling started for chain ${chainId} (every ${POLL_INTERVAL_MS / 1000}s)`);
  }

  /**
   * Index new blocks for a chain
   */
  async indexNewBlocks(chainId) {
    const syncStatus = await this.prisma.syncStatus.findUnique({
      where: { chainId },
    });

    if (!syncStatus) return;

    let latestBlock;
    try {
      latestBlock = await getLatestBlock(chainId);
    } catch (err) {
      logger.warn(`Cannot reach RPC for chain ${chainId}`, { error: err.message });
      return;
    }

    // Wait for confirmations
    const safeBlock = latestBlock - CONFIRMATION_BLOCKS;
    const fromBlock = syncStatus.lastIndexedBlock + 1;

    if (fromBlock > safeBlock) {
      return; // Already up to date
    }

    // Cap the range
    const toBlock = Math.min(fromBlock + MAX_BLOCK_RANGE - 1, safeBlock);

    logger.debug(`Indexing chain ${chainId}: blocks ${fromBlock}-${toBlock} (latest: ${latestBlock})`);

    try {
      // Check for reorgs
      await this.checkForReorg(chainId, fromBlock);

      // Fetch and store events
      const contracts = CONTRACTS_TO_INDEX[chainId] || [];

      for (const contractAddr of contracts) {
        await this.indexContractEvents(chainId, contractAddr, fromBlock, toBlock);
      }

      // Update checkpoint
      await this.prisma.syncStatus.update({
        where: { chainId },
        data: {
          lastIndexedBlock: toBlock,
          lastSyncTime: new Date(),
        },
      });
    } catch (err) {
      logger.error(`Failed to index blocks ${fromBlock}-${toBlock} on chain ${chainId}`, {
        error: err.message,
      });
      await this.recordError(chainId, fromBlock, 'indexing_error', err.message);
    }
  }

  /**
   * Index events for a specific contract
   */
  async indexContractEvents(chainId, contractAddress, fromBlock, toBlock) {
    let retries = 0;

    while (retries < MAX_RETRIES) {
      try {
        const provider = getProvider(chainId);
        const contract = new ethers.Contract(contractAddress, GENERIC_EVENTS_ABI, provider);

        // Query all events in the block range
        const filter = {
          address: contractAddress,
          fromBlock,
          toBlock,
        };

        const logs = await provider.getLogs(filter);

        for (const log of logs) {
          try {
            const parsedLog = contract.interface.parseLog({
              topics: log.topics,
              data: log.data,
            });

            if (parsedLog) {
              await this.storeEvent(chainId, contractAddress, log, parsedLog);
            }
          } catch (parseErr) {
            // Skip events we can't parse (from other contracts)
            logger.debug('Could not parse log', { txHash: log.transactionHash });
          }
        }

        return; // Success
      } catch (err) {
        retries++;
        if (retries >= MAX_RETRIES) {
          throw err;
        }

        const delay = BASE_RETRY_DELAY_MS * Math.pow(2, retries);
        logger.warn(`Retry ${retries}/${MAX_RETRIES} for chain ${chainId}, waiting ${delay}ms`, {
          error: err.message,
        });
        await sleep(delay);
      }
    }
  }

  /**
   * Store a parsed event in the database
   */
  async storeEvent(chainId, contractAddress, log, parsedLog) {
    try {
      const blockTimestamp = await this.getBlockTimestamp(chainId, log.blockNumber);

      await this.prisma.event.upsert({
        where: {
          chainId_transactionHash_logIndex: {
            chainId,
            transactionHash: log.transactionHash,
            logIndex: log.index,
          },
        },
        create: {
          chainId,
          contractAddress: contractAddress.toLowerCase(),
          eventName: parsedLog.name,
          blockNumber: log.blockNumber,
          transactionHash: log.transactionHash,
          logIndex: log.index,
          eventData: JSON.stringify({
            args: Object.fromEntries(
              parsedLog.fragment.inputs.map((input, i) => [
                input.name,
                parsedLog.args[i]?.toString(),
              ])
            ),
          }),
          blockTimestamp,
        },
        update: {}, // No update needed if exists
      });

      // Broadcast to WebSocket clients
      if (this.broadcastWs) {
        this.broadcastWs('new_event', {
          chainId,
          contractAddress,
          eventName: parsedLog.name,
          blockNumber: log.blockNumber,
          transactionHash: log.transactionHash,
        });
      }
    } catch (err) {
      if (!err.message.includes('Unique constraint')) {
        logger.error('Failed to store event', {
          error: err.message,
          txHash: log.transactionHash,
        });
      }
    }
  }

  /**
   * Check for chain reorgs
   */
  async checkForReorg(chainId, expectedBlock) {
    try {
      // Get the last few stored events
      const recentEvents = await this.prisma.event.findMany({
        where: { chainId },
        orderBy: { blockNumber: 'desc' },
        take: 5,
      });

      if (recentEvents.length === 0) return;

      const provider = getProvider(chainId);

      for (const event of recentEvents) {
        try {
          const receipt = await provider.getTransactionReceipt(event.transactionHash);

          if (!receipt || receipt.blockNumber !== event.blockNumber) {
            // Reorg detected
            logger.warn(`Reorg detected on chain ${chainId} at block ${event.blockNumber}`);

            const reorgFrom = event.blockNumber;
            const removed = await this.prisma.event.deleteMany({
              where: {
                chainId,
                blockNumber: { gte: reorgFrom },
              },
            });

            await this.prisma.reorgLog.create({
              data: {
                chainId,
                fromBlock: reorgFrom,
                toBlock: expectedBlock,
                blocksRemoved: expectedBlock - reorgFrom,
                eventsRemoved: removed.count,
              },
            });

            // Reset checkpoint
            await this.prisma.syncStatus.update({
              where: { chainId },
              data: {
                lastIndexedBlock: reorgFrom - 1,
                isReorging: true,
                reorgDepth: expectedBlock - reorgFrom,
              },
            });

            logger.info(`Reorg handled: removed ${removed.count} events, reindexing from ${reorgFrom}`);
            break;
          }
        } catch {
          // RPC error, skip this check
          break;
        }
      }
    } catch (err) {
      logger.error(`Reorg check failed for chain ${chainId}`, { error: err.message });
    }
  }

  /**
   * Get block timestamp with caching
   */
  async getBlockTimestamp(chainId, blockNumber) {
    try {
      const provider = getProvider(chainId);
      const block = await provider.getBlock(blockNumber);
      return block ? new Date(block.timestamp * 1000) : new Date();
    } catch {
      return new Date();
    }
  }

  /**
   * Record an indexing error
   */
  async recordError(chainId, blockNumber, errorType, message) {
    try {
      await this.prisma.indexingError.create({
        data: {
          chainId,
          blockNumber,
          errorType,
          message: message.substring(0, 500),
        },
      });
    } catch {
      // Don't fail if error logging fails
    }
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = EventIndexer;
