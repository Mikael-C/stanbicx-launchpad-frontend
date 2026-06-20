/**
 * Blockchain Service
 * 
 * ethers.js v6 provider setup and contract interaction helpers.
 * Falls back to simulated data when RPC is unavailable.
 */

const { ethers } = require('ethers');
const logger = require('../utils/logger');

// Chain configurations
const CHAINS = {
  17000: {
    name: 'Hoodi',
    rpcUrl: process.env.HOODI_RPC_URL || 'https://ethereum-hoodi-rpc.publicnode.com',
    chainId: 17000,
  },
  84532: {
    name: 'Base Sepolia',
    rpcUrl: process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org',
    chainId: 84532,
  },
};

// Provider cache
const providers = {};

/**
 * Get or create a provider for a chain
 * @param {number} chainId
 * @returns {ethers.JsonRpcProvider}
 */
function getProvider(chainId) {
  if (providers[chainId]) {
    return providers[chainId];
  }

  const chain = CHAINS[chainId];
  if (!chain) {
    throw new Error(`Unsupported chain ID: ${chainId}`);
  }

  try {
    const provider = new ethers.JsonRpcProvider(chain.rpcUrl, chainId);
    providers[chainId] = provider;
    logger.info(`Provider initialized for ${chain.name} (chain ${chainId})`);
    return provider;
  } catch (err) {
    logger.error(`Failed to create provider for chain ${chainId}`, { error: err.message });
    throw err;
  }
}

/**
 * Get the latest block number for a chain
 * @param {number} chainId
 * @returns {Promise<number>}
 */
async function getLatestBlock(chainId) {
  try {
    const provider = getProvider(chainId);
    return await provider.getBlockNumber();
  } catch (err) {
    logger.warn(`Could not fetch latest block for chain ${chainId}, returning simulated`, {
      error: err.message,
    });
    return Math.floor(Date.now() / 12000); // Simulated block number
  }
}

/**
 * Generate a mock transaction hash (for development without live blockchain)
 * @param {...string} seeds - Seeds for deterministic hash
 * @returns {string}
 */
function generateMockTxHash(...seeds) {
  const data = seeds.join(':') + ':' + Date.now();
  return ethers.keccak256(ethers.toUtf8Bytes(data));
}

/**
 * Verify a signed message (wallet signature verification)
 * @param {string} message - Original message
 * @param {string} signature - Signature to verify
 * @returns {string} Recovered wallet address
 */
function recoverAddress(message, signature) {
  try {
    return ethers.verifyMessage(message, signature);
  } catch (err) {
    logger.error('Signature verification failed', { error: err.message });
    throw new Error('Invalid signature');
  }
}

/**
 * Validate an Ethereum address
 * @param {string} address
 * @returns {boolean}
 */
function isValidAddress(address) {
  return ethers.isAddress(address);
}

/**
 * Get checksummed address
 * @param {string} address
 * @returns {string}
 */
function getChecksumAddress(address) {
  return ethers.getAddress(address);
}

/**
 * Get contract instance (placeholder – contracts not yet deployed)
 * @param {string} address - Contract address
 * @param {Array} abi - Contract ABI
 * @param {number} chainId - Chain ID
 * @returns {ethers.Contract}
 */
function getContract(address, abi, chainId) {
  const provider = getProvider(chainId);
  return new ethers.Contract(address, abi, provider);
}

/**
 * Get block timestamp
 * @param {number} chainId
 * @param {number} blockNumber
 * @returns {Promise<Date>}
 */
async function getBlockTimestamp(chainId, blockNumber) {
  try {
    const provider = getProvider(chainId);
    const block = await provider.getBlock(blockNumber);
    return block ? new Date(block.timestamp * 1000) : new Date();
  } catch {
    return new Date();
  }
}

module.exports = {
  CHAINS,
  getProvider,
  getLatestBlock,
  generateMockTxHash,
  recoverAddress,
  isValidAddress,
  getChecksumAddress,
  getContract,
  getBlockTimestamp,
};
