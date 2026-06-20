/**
 * Fee Calculator Service
 * 
 * SX Launchpad fee structure:
 * - Mint Fee: 12% (retained by protocol)
 * - Spread: 5% (market maker spread)
 * - Platform Transfer Fee (PTF): 1% (platform fee)
 * - Withdrawal Fee: 6% + 1% PTF
 * - Minting Cost: 2%
 */

const FEE_RATES = {
  MINT_FEE: 0.12,
  SPREAD: 0.05,
  PLATFORM_TRANSFER_FEE: 0.01,
  WITHDRAWAL_FEE: 0.06,
  MINTING_COST: 0.02,
  EARLY_EXIT_PENALTY: 0.15,
  REFERRAL_REWARD: 0.005,
};

/**
 * Calculate the output amount when buying stables
 * $1000 * (1 - 0.12) * (1 - 0.05) * (1 - 0.01) = $827.64
 * @param {number} amount - Input amount in source currency
 * @returns {{ grossAmount: number, feeAmount: number, netAmount: number }}
 */
function calculateBuyStablesOutput(amount) {
  const afterMint = amount * (1 - FEE_RATES.MINT_FEE);
  const afterSpread = afterMint * (1 - FEE_RATES.SPREAD);
  const netAmount = afterSpread * (1 - FEE_RATES.PLATFORM_TRANSFER_FEE);
  const feeAmount = amount - netAmount;

  return {
    grossAmount: round(amount),
    feeAmount: round(feeAmount),
    netAmount: round(netAmount),
  };
}

/**
 * Calculate withdrawal fee (6% withdrawal + 1% PTF)
 * @param {number} amount - Withdrawal amount
 * @returns {{ grossAmount: number, feeAmount: number, netAmount: number }}
 */
function calculateWithdrawalFee(amount) {
  const withdrawalFee = amount * FEE_RATES.WITHDRAWAL_FEE;
  const ptf = amount * FEE_RATES.PLATFORM_TRANSFER_FEE;
  const totalFee = withdrawalFee + ptf;
  const netAmount = amount - totalFee;

  return {
    grossAmount: round(amount),
    feeAmount: round(totalFee),
    netAmount: round(netAmount),
  };
}

/**
 * Calculate minting cost (2%)
 * @param {number} amount
 * @returns {{ grossAmount: number, feeAmount: number, netAmount: number }}
 */
function calculateMintingCost(amount) {
  const fee = amount * FEE_RATES.MINTING_COST;
  return {
    grossAmount: round(amount),
    feeAmount: round(fee),
    netAmount: round(amount - fee),
  };
}

/**
 * Calculate spread (5%)
 * @param {number} amount
 * @returns {{ grossAmount: number, feeAmount: number, netAmount: number }}
 */
function calculateSpread(amount) {
  const fee = amount * FEE_RATES.SPREAD;
  return {
    grossAmount: round(amount),
    feeAmount: round(fee),
    netAmount: round(amount - fee),
  };
}

/**
 * Calculate early exit penalty (15%)
 * @param {number} amount
 * @returns {{ grossAmount: number, penaltyAmount: number, netAmount: number }}
 */
function calculateEarlyExitPenalty(amount) {
  const penalty = amount * FEE_RATES.EARLY_EXIT_PENALTY;
  return {
    grossAmount: round(amount),
    penaltyAmount: round(penalty),
    netAmount: round(amount - penalty),
  };
}

/**
 * Calculate referral reward
 * @param {number} amount - Transaction amount that triggered the referral
 * @returns {number}
 */
function calculateReferralReward(amount) {
  return round(amount * FEE_RATES.REFERRAL_REWARD);
}

/**
 * Round to 2 decimal places
 */
function round(value) {
  return Math.round(value * 100) / 100;
}

module.exports = {
  FEE_RATES,
  calculateBuyStablesOutput,
  calculateWithdrawalFee,
  calculateMintingCost,
  calculateSpread,
  calculateEarlyExitPenalty,
  calculateReferralReward,
};
