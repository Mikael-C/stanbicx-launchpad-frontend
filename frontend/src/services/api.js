const API_URL = import.meta.env.VITE_API_URL || 'https://stanbic-launchpad.onrender.com';

async function request(endpoint, options = {}) {
  const url = `${API_URL}${endpoint}`;
  const config = {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  };

  if (options.wallet) {
    config.headers['x-wallet-address'] = options.wallet;
    delete config.wallet;
  }

  const response = await fetch(url, config);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || data.message || `Request failed with status ${response.status}`);
  }

  return data;
}

// ─── Health ─────────────────────────────────────────────────────────
export const getHealth = () => request('/api/health');

// ─── Buy Stables ────────────────────────────────────────────────────
export const getQuote = (params) =>
  request(`/api/stables/quote?source=${params.source}&amount=${params.amount}`);

export const buyStables = (data) =>
  request('/api/stables/buy', {
    method: 'POST',
    body: JSON.stringify(data),
    wallet: data.wallet,
  });

// ─── SXUA - Deposits & Withdrawals ─────────────────────────────────
export const deposit = (data) =>
  request('/api/account/deposit', {
    method: 'POST',
    body: JSON.stringify(data),
    wallet: data.wallet,
  });

export const withdraw = (data) =>
  request('/api/account/withdraw', {
    method: 'POST',
    body: JSON.stringify(data),
    wallet: data.wallet,
  });

export const getBalance = (wallet) =>
  request(`/api/account/balance?wallet=${wallet}`, { wallet });

export const getTransactionHistory = (wallet) =>
  request(`/api/account/transactions?wallet=${wallet}`, { wallet });

// ─── Launchpad ──────────────────────────────────────────────────────
export const getProjects = () => request('/api/launchpad/projects');

export const getProjectById = (id) => request(`/api/launchpad/projects/${id}`);

export const purchaseTokens = (data) =>
  request('/api/launchpad/purchase', {
    method: 'POST',
    body: JSON.stringify(data),
    wallet: data.wallet,
  });

export const getVesting = (walletOrId) =>
  request(`/api/launchpad/vesting/${walletOrId}`, { wallet: walletOrId });

export const claimTokens = (data) =>
  request('/api/launchpad/claim', {
    method: 'POST',
    body: JSON.stringify(data),
    wallet: data.wallet,
  });

export const earlyExit = (data) =>
  request('/api/launchpad/early-exit', {
    method: 'POST',
    body: JSON.stringify(data),
    wallet: data.wallet,
  });

export const simulateVesting = (data) =>
  request('/api/launchpad/demo/simulate-vesting', {
    method: 'POST',
    body: JSON.stringify(data),
  });

export const getTokenBalance = (wallet) =>
  request(`/api/launchpad/token-balance/${wallet}`, { wallet });

// ─── Marketplace ────────────────────────────────────────────────────
export const getListings = () => request('/api/marketplace/listings');

export const listTokens = (data) =>
  request('/api/marketplace/list', {
    method: 'POST',
    body: JSON.stringify(data),
    wallet: data.wallet,
  });

export const buyListing = (data) =>
  request(`/api/marketplace/buy/${data.listingId}`, {
    method: 'POST',
    body: JSON.stringify(data),
    wallet: data.wallet,
  });

export const cancelListing = (data) =>
  request(`/api/marketplace/listings/${data.listingId}`, {
    method: 'DELETE',
    wallet: data.wallet,
  });

// ─── Referral ───────────────────────────────────────────────────────
export const getReferralStats = (wallet) =>
  request(`/api/referral/stats?wallet=${wallet}`, { wallet });

export const registerReferral = (data) =>
  request('/api/referral/register', {
    method: 'POST',
    body: JSON.stringify(data),
  });

export const getReferralCode = (wallet) =>
  request(`/api/referral/code?wallet=${wallet}`, { wallet });

// ─── Leaderboard ────────────────────────────────────────────────────
export const getLeaderboard = () => request('/api/leaderboard');

// ─── Admin ──────────────────────────────────────────────────────────
export const getProposals = (wallet) =>
  request('/api/admin/proposals', { wallet });

export const createProposal = (data) =>
  request('/api/admin/proposals', {
    method: 'POST',
    body: JSON.stringify(data),
    wallet: data.wallet,
  });

export const approveProposal = (data) =>
  request(`/api/admin/proposals/${data.proposalId}/approve`, {
    method: 'POST',
    body: JSON.stringify(data),
    wallet: data.wallet,
  });

export const rejectProposal = (data) =>
  request(`/api/admin/proposals/${data.proposalId}/reject`, {
    method: 'POST',
    body: JSON.stringify(data),
    wallet: data.wallet,
  });

export const toggleKillSwitch = (data) =>
  request('/api/admin/kill-switch/toggle', {
    method: 'POST',
    body: JSON.stringify(data),
    wallet: data.wallet,
  });

export const getKillSwitchStatus = () =>
  request('/api/admin/kill-switch/status');

export const getAdminDevices = (wallet) =>
  request('/api/admin/devices', { wallet });

export const getAuditLog = (wallet) =>
  request('/api/admin/audit-log', { wallet });

// ─── Events & Stats ─────────────────────────────────────────────────
export const getEvents = (params = {}) => {
  const query = new URLSearchParams(params).toString();
  return request(`/api/events${query ? '?' + query : ''}`);
};

export const getStats = () => request('/api/stats');
export const getTableCounts = () => request('/api/stats/tables');

// ─── AI Chat ────────────────────────────────────────────────────────
// Uses raw fetch to preserve HTTP status codes for jailbreak/lockout/rate-limit detection
export const sendChatMessage = async (data) => {
  const API = import.meta.env.VITE_API_URL || 'https://stanbic-launchpad.onrender.com';
  const response = await fetch(`${API}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-wallet-address': data.wallet || '',
    },
    body: JSON.stringify(data),
  });
  const json = await response.json();
  if (!response.ok) {
    const err = new Error(json.error || 'Chat request failed');
    err.status = response.status;
    err.data = json;
    throw err;
  }
  return json;
};

// ─── Jailbreak Monitoring ───────────────────────────────────────────
export const getJailbreakAttempts = (wallet) =>
  request('/api/chat/jailbreak/attempts', { wallet });

export const getJailbreakStats = (wallet) =>
  request('/api/chat/jailbreak/stats', { wallet });

// ─── Verification ───────────────────────────────────────────────────
export const getVerificationStatus = () =>
  request('/api/admin/verification/status');

export const runVerification = (wallet) =>
  request('/api/admin/verification/run', {
    method: 'POST',
    body: JSON.stringify({}),
    wallet,
  });

export const deployContract = (data) =>
  request('/api/admin/verification/deploy', {
    method: 'POST',
    body: JSON.stringify(data),
    wallet: data.wallet,
  });

// ─── Registration ───────────────────────────────────────────────────
export const checkRegistration = (wallet) =>
  request(`/api/account/registration?wallet=${wallet}`);

export const registerUser = (data) =>
  request('/api/account/register', {
    method: 'POST',
    body: JSON.stringify(data),
  });

// ─── Security Demo ──────────────────────────────────────────────────
// These use raw fetch to return full error payloads (including details/code)
const demoRequest = async (endpoint, data) => {
  const url = `${API_URL}${endpoint}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-wallet-address': data.wallet || '',
    },
    body: JSON.stringify(data),
  });
  const json = await response.json();
  if (!response.ok) {
    const err = new Error(json.error || 'Request failed');
    err.status = response.status;
    err.data = json; // Attach full response body
    throw err;
  }
  return json;
};

export const simulateDpopTest = (data) => demoRequest('/api/admin/demo/dpop-test', data);
export const simulateDigCheck = (data) => demoRequest('/api/admin/demo/dig-check', data);
