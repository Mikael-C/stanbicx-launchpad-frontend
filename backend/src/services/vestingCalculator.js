/**
 * Vesting Calculator Service
 * 
 * Launchpad token vesting schedule:
 * - Cliff: 30 days (no tokens claimable)
 * - Linear vesting: 150 days total (including cliff)
 * - After cliff, tokens vest linearly over remaining 120 days
 */

const CLIFF_DURATION_DAYS = 30;
const VESTING_DURATION_DAYS = 150;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const CLIFF_DURATION_MS = CLIFF_DURATION_DAYS * MS_PER_DAY;
const VESTING_DURATION_MS = VESTING_DURATION_DAYS * MS_PER_DAY;

/**
 * Get the vesting progress for a purchase
 * @param {Date|number} purchaseTimestamp - Purchase date
 * @returns {{ elapsedDays: number, totalDays: number, percentComplete: number, isCliffPassed: boolean, isFullyVested: boolean }}
 */
function getVestingProgress(purchaseTimestamp) {
  const purchaseTime = new Date(purchaseTimestamp).getTime();
  const now = Date.now();
  const elapsed = now - purchaseTime;
  const elapsedDays = Math.floor(elapsed / MS_PER_DAY);
  const isCliffPassed = elapsed >= CLIFF_DURATION_MS;
  const isFullyVested = elapsed >= VESTING_DURATION_MS;

  let percentComplete = 0;
  if (isFullyVested) {
    percentComplete = 100;
  } else if (isCliffPassed) {
    percentComplete = Math.min(100, (elapsed / VESTING_DURATION_MS) * 100);
  }

  return {
    elapsedDays: Math.min(elapsedDays, VESTING_DURATION_DAYS),
    totalDays: VESTING_DURATION_DAYS,
    percentComplete: Math.round(percentComplete * 100) / 100,
    isCliffPassed,
    isFullyVested,
  };
}

/**
 * Calculate the claimable amount based on vesting schedule
 * @param {number} totalAmount - Total vested token amount
 * @param {Date|number} purchaseTimestamp - Purchase date
 * @param {number} alreadyClaimed - Amount already claimed
 * @returns {number} Claimable amount
 */
function getClaimableAmount(totalAmount, purchaseTimestamp, alreadyClaimed = 0) {
  const purchaseTime = new Date(purchaseTimestamp).getTime();
  const now = Date.now();
  const elapsed = now - purchaseTime;

  // Nothing claimable before cliff
  if (elapsed < CLIFF_DURATION_MS) {
    return 0;
  }

  // Fully vested
  if (elapsed >= VESTING_DURATION_MS) {
    return Math.max(0, totalAmount - alreadyClaimed);
  }

  // Linear vesting after cliff
  const vestedAmount = totalAmount * (elapsed / VESTING_DURATION_MS);
  return Math.max(0, vestedAmount - alreadyClaimed);
}

/**
 * Check if a purchase is fully vested
 * @param {Date|number} purchaseTimestamp - Purchase date
 * @returns {boolean}
 */
function isFullyVested(purchaseTimestamp) {
  const purchaseTime = new Date(purchaseTimestamp).getTime();
  return (Date.now() - purchaseTime) >= VESTING_DURATION_MS;
}

/**
 * Get cliff end date and vesting end date
 * @param {Date|number} purchaseTimestamp
 * @returns {{ cliffEnd: Date, vestingEnd: Date }}
 */
function getVestingDates(purchaseTimestamp) {
  const purchaseTime = new Date(purchaseTimestamp).getTime();
  return {
    cliffEnd: new Date(purchaseTime + CLIFF_DURATION_MS),
    vestingEnd: new Date(purchaseTime + VESTING_DURATION_MS),
  };
}

module.exports = {
  CLIFF_DURATION_DAYS,
  VESTING_DURATION_DAYS,
  CLIFF_DURATION_MS,
  VESTING_DURATION_MS,
  getVestingProgress,
  getClaimableAmount,
  isFullyVested,
  getVestingDates,
};
