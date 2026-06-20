import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWallet } from '../context/WalletContext';
import { useToast } from '../components/Toast';
import { getBalance, deposit, withdraw, getTransactionHistory, getTokenBalance, getVesting } from '../services/api';
import SubAccountCard from '../components/SubAccountCard';
import ConfirmationDialog from '../components/ConfirmationDialog';
import ProgressBar from '../components/ProgressBar';
import './DashboardPage.css';

export default function DashboardPage({ isPaused = false }) {
  const { account, isConnected } = useWallet();
  const toast = useToast();
  const navigate = useNavigate();

  const [balanceData, setBalanceData] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [depositForm, setDepositForm] = useState({ amount: '', stablecoin: 'USDC', committedPercent: 50 });
  const [withdrawForm, setWithdrawForm] = useState({ amount: '', type: 'uncommitted' });
  const [submitting, setSubmitting] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [tokenHoldings, setTokenHoldings] = useState(null);
  const [vestingPositions, setVestingPositions] = useState([]);

  useEffect(() => {
    if (account) fetchData();
  }, [account]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [bal, txns, tokens, vestings] = await Promise.all([
        getBalance(account).catch(() => ({
          totalBalance: 0,
          uncommittedBalance: 0,
          committedBalance: 0,
          sxpRewards: 0,
          subAccounts: [],
        })),
        getTransactionHistory(account).catch(() => ({ transactions: [] })),
        getTokenBalance(account).catch(() => ({ sxpBalance: 0, holdings: [] })),
        getVesting(account).catch(() => ({ vestings: [] })),
      ]);
      setBalanceData(bal);
      setTransactions(txns.transactions || []);
      setTokenHoldings(tokens);
      setVestingPositions(vestings.vestings || []);
    } finally {
      setLoading(false);
    }
  };

  const handleDeposit = async () => {
    if (!depositForm.amount || Number(depositForm.amount) <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }
    setSubmitting(true);
    try {
      await deposit({
        wallet: account,
        amount: Number(depositForm.amount),
        stablecoin: depositForm.stablecoin,
        committedPercent: depositForm.committedPercent,
      });
      toast.success(`Deposited $${Number(depositForm.amount).toLocaleString()} ${depositForm.stablecoin}`);
      setDepositForm({ amount: '', stablecoin: 'USDC', committedPercent: 50 });
      fetchData();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleWithdraw = (subAccount) => {
    const now = Date.now();
    const maturity = new Date(subAccount?.maturityDate).getTime();
    const isMature = now >= maturity;

    setConfirmDialog({
      title: isMature ? 'Withdraw Funds' : 'Early Withdrawal',
      message: isMature
        ? `Withdraw $${Number(subAccount.principal).toLocaleString()} + accrued yield?`
        : `Withdraw $${Number(subAccount.principal).toLocaleString()} before maturity?`,
      warning: !isMature ? 'Early withdrawal will incur a penalty. You will lose partial yield.' : undefined,
      danger: !isMature,
      onConfirm: async () => {
        try {
          await withdraw({ wallet: account, subAccountId: subAccount.id });
          toast.success('Withdrawal successful');
          setConfirmDialog(null);
          fetchData();
        } catch (err) {
          toast.error(err.message);
        }
      },
    });
  };

  const handleUncommittedWithdraw = async () => {
    if (!withdrawForm.amount || Number(withdrawForm.amount) <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }
    setSubmitting(true);
    try {
      await withdraw({ wallet: account, amount: Number(withdrawForm.amount), type: 'uncommitted' });
      toast.success(`Withdrew $${Number(withdrawForm.amount).toLocaleString()}`);
      setWithdrawForm({ amount: '', type: 'uncommitted' });
      fetchData();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!isConnected) {
    return (
      <div className="container page-enter">
        <div className="empty-state">
          <div className="empty-state-icon">◆</div>
          <div className="empty-state-title">Connect Your Wallet</div>
          <div className="empty-state-message">Connect your wallet to view your SXUA dashboard.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-page page-enter container">
      <div className="page-header">
        <h1 className="page-title">SXUA <span className="text-gradient">Dashboard</span></h1>
        <p className="page-subtitle">Manage your unified account balances and sub-accounts</p>
      </div>

      {/* Balance Overview */}
      <div className="dashboard-balance-section glass-card-static">
        <div className="dashboard-total-balance">
          <span className="dashboard-balance-label">Total Balance</span>
          <span className="dashboard-balance-value">
            ${loading ? '—' : Number(balanceData?.totalBalance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </span>
        </div>
        <div className="dashboard-balance-split">
          <div className="dashboard-balance-item">
            <span className="text-muted">Uncommitted</span>
            <span className="dashboard-split-value">
              ${Number(balanceData?.uncommittedBalance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div className="dashboard-balance-item">
            <span className="text-muted">Committed</span>
            <span className="dashboard-split-value">
              ${Number(balanceData?.committedBalance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div className="dashboard-balance-item">
            <span className="text-muted">SXP Rewards</span>
            <span className="dashboard-split-value dashboard-sxp">
              {Number(balanceData?.sxpRewards || 0).toLocaleString()} SXP
            </span>
          </div>
        </div>
      </div>

      {/* Token Holdings */}
      {tokenHoldings && tokenHoldings.holdings && tokenHoldings.holdings.length > 0 && (
        <div className="dashboard-token-holdings glass-card-static mt-xl">
          <h3 className="section-title">🪙 Token Holdings</h3>
          <div className="token-holdings-grid">
            {tokenHoldings.holdings.map((h, idx) => (
              <div key={idx} className="token-holding-item">
                <div className="token-holding-header">
                  <span className="token-holding-symbol">{h.tokenSymbol}</span>
                  <span className={`badge ${h.status === 'completed' ? 'badge-success' : 'badge-info'}`}>
                    {h.status === 'completed' ? 'Fully Claimed' : 'Partial'}
                  </span>
                </div>
                <div className="token-holding-amount">
                  {Number(h.claimed).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </div>
                <div className="token-holding-project text-muted">{h.projectName}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Vesting Positions Summary */}
      {vestingPositions.length > 0 && (
        <div className="dashboard-vesting-summary glass-card-static mt-lg">
          <div className="flex justify-between items-center mb-md">
            <h3 className="section-title" style={{ margin: 0 }}>📊 Vesting Positions</h3>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/launchpad')}>
              View All →
            </button>
          </div>
          <div className="vesting-summary-grid">
            {vestingPositions.filter(v => v.status === 'active').slice(0, 3).map((v, idx) => {
              const now = Date.now();
              const vestEnd = new Date(v.vestingEndDate).getTime();
              const vestStart = new Date(v.vestingStartDate).getTime();
              const totalDuration = vestEnd - vestStart;
              const elapsed = now - vestStart;
              const pct = totalDuration > 0 ? Math.min(100, Math.max(0, (elapsed / totalDuration) * 100)) : 100;
              const isFullyVested = now >= vestEnd;
              return (
                <div key={v.id || idx} className="vesting-summary-item">
                  <div className="flex justify-between items-center">
                    <span className="vesting-summary-name">{v.projectName}</span>
                    <span className={`badge ${isFullyVested ? 'badge-success' : 'badge-info'}`} style={{ fontSize: '10px' }}>
                      {isFullyVested ? 'Claimable' : 'Vesting in progress'}
                    </span>
                  </div>
                  <div className="vesting-summary-amount">
                    {Number(v.amount).toLocaleString()} {v.tokenSymbol}
                  </div>
                  <ProgressBar value={pct} max={100} label="" size="default" color={isFullyVested ? 'green' : undefined} />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="tabs mt-xl mb-lg">
        <button className={`tab ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveTab('overview')}>
          Overview
        </button>
        <button className={`tab ${activeTab === 'deposit' ? 'active' : ''}`} onClick={() => setActiveTab('deposit')}>
          Deposit
        </button>
        <button className={`tab ${activeTab === 'withdraw' ? 'active' : ''}`} onClick={() => setActiveTab('withdraw')}>
          Withdraw
        </button>
        <button className={`tab ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')}>
          History
        </button>
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="section">
          <h3 className="section-title">📊 Committed Sub-Accounts</h3>
          {loading ? (
            <div className="grid grid-auto">
              {[1, 2, 3].map((i) => <div key={i} className="skeleton skeleton-card" />)}
            </div>
          ) : (balanceData?.subAccounts?.length || 0) > 0 ? (
            <div className="grid grid-auto">
              {balanceData.subAccounts.map((sub, idx) => (
                <SubAccountCard key={sub.id || idx} subAccount={sub} onWithdraw={handleWithdraw} />
              ))}
            </div>
          ) : (
            <div className="glass-card-static empty-state">
              <div className="empty-state-icon">📂</div>
              <div className="empty-state-title">No Sub-Accounts Yet</div>
              <div className="empty-state-message">Make a deposit with committed funds to create sub-accounts.</div>
            </div>
          )}
        </div>
      )}

      {/* Deposit Tab */}
      {activeTab === 'deposit' && (
        <div className="dashboard-form-section glass-card-static">
          <h3 className="section-title">➕ Deposit Funds</h3>

          {isPaused && (
            <div className="platform-paused-warning">
              <span className="platform-paused-icon">⚠</span>
              <div>
                <strong>Platform Paused</strong>
                <p>All deposits are temporarily suspended by admin. Please try again later.</p>
              </div>
            </div>
          )}

          <div className="form-group mb-md">
            <label className="form-label">Stablecoin</label>
            <select
              className="form-select"
              value={depositForm.stablecoin}
              onChange={(e) => setDepositForm({ ...depositForm, stablecoin: e.target.value })}
              disabled={isPaused}
            >
              <option value="USDC">USDC</option>
              <option value="USDT">USDT</option>
              <option value="DAI">DAI</option>
            </select>
          </div>
          <div className="form-group mb-md">
            <label className="form-label">Amount (USD)</label>
            <input
              className="form-input"
              type="number"
              placeholder="Enter amount..."
              value={depositForm.amount}
              onChange={(e) => setDepositForm({ ...depositForm, amount: e.target.value })}
              disabled={isPaused}
            />
          </div>
          <div className="form-group mb-lg">
            <label className="form-label">
              Committed: {depositForm.committedPercent}% / Uncommitted: {100 - depositForm.committedPercent}%
            </label>
            <input
              type="range"
              min="0"
              max="100"
              value={depositForm.committedPercent}
              onChange={(e) => setDepositForm({ ...depositForm, committedPercent: Number(e.target.value) })}
              disabled={isPaused}
            />
            <div className="flex justify-between text-muted" style={{ fontSize: 'var(--font-xs)' }}>
              <span>Uncommitted (Flexible)</span>
              <span>Committed (Higher Yield)</span>
            </div>
          </div>
          {depositForm.amount && (
            <div className="deposit-preview glass-card mb-lg">
              <div className="flex justify-between">
                <span className="text-muted">Committed</span>
                <span>${(Number(depositForm.amount) * depositForm.committedPercent / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Uncommitted</span>
                <span>${(Number(depositForm.amount) * (100 - depositForm.committedPercent) / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
          )}
          <div className="deposit-btn-container">
            <button
              className={`btn btn-primary btn-lg w-full ${submitting ? 'btn-loading' : ''} ${isPaused ? 'btn-paused' : ''}`}
              onClick={handleDeposit}
              disabled={submitting || !depositForm.amount || isPaused}
              title={isPaused ? 'Platform paused — deposits are temporarily suspended' : ''}
            >
              {!submitting && (isPaused ? '🔒 Platform Paused' : 'Deposit')}
            </button>
            {isPaused && (
              <span className="paused-tooltip">Platform paused — deposits suspended by admin</span>
            )}
          </div>
        </div>
      )}

      {/* Withdraw Tab */}
      {activeTab === 'withdraw' && (
        <div className="dashboard-form-section glass-card-static">
          <h3 className="section-title">➖ Withdraw Uncommitted</h3>

          {isPaused && (
            <div className="platform-paused-warning">
              <span className="platform-paused-icon">⚠</span>
              <div>
                <strong>Platform Paused</strong>
                <p>All withdrawals are temporarily suspended by admin. Please try again later.</p>
              </div>
            </div>
          )}

          <div className="form-group mb-md">
            <label className="form-label">Available: ${Number(balanceData?.uncommittedBalance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</label>
            <input
              className="form-input"
              type="number"
              placeholder="Enter amount..."
              value={withdrawForm.amount}
              onChange={(e) => setWithdrawForm({ ...withdrawForm, amount: e.target.value })}
              disabled={isPaused}
            />
          </div>
          <div className="deposit-btn-container">
            <button
              className={`btn btn-secondary btn-lg w-full ${submitting ? 'btn-loading' : ''} ${isPaused ? 'btn-paused' : ''}`}
              onClick={handleUncommittedWithdraw}
              disabled={submitting || !withdrawForm.amount || isPaused}
              title={isPaused ? 'Platform paused — withdrawals are temporarily suspended' : ''}
            >
              {!submitting && (isPaused ? '🔒 Platform Paused' : 'Withdraw')}
            </button>
            {isPaused && (
              <span className="paused-tooltip">Platform paused — withdrawals suspended by admin</span>
            )}
          </div>
        </div>
      )}

      {/* History Tab */}
      {activeTab === 'history' && (
        <div className="glass-card-static">
          <h3 className="section-title">📜 Transaction History</h3>
          {transactions.length > 0 ? (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx, idx) => (
                    <tr key={idx}>
                      <td>
                        <span className={`badge ${tx.type === 'deposit' ? 'badge-success' : 'badge-warning'}`}>
                          {tx.type}
                        </span>
                      </td>
                      <td>${Number(tx.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                      <td>
                        <span className={`badge ${tx.status === 'completed' ? 'badge-success' : 'badge-warning'}`}>
                          {tx.status}
                        </span>
                      </td>
                      <td>{new Date(tx.createdAt).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-state-icon">📜</div>
              <div className="empty-state-title">No Transactions Yet</div>
              <div className="empty-state-message">Your transaction history will appear here.</div>
            </div>
          )}
        </div>
      )}

      {/* Confirmation Dialog */}
      {confirmDialog && (
        <ConfirmationDialog
          isOpen={true}
          title={confirmDialog.title}
          message={confirmDialog.message}
          warning={confirmDialog.warning}
          danger={confirmDialog.danger}
          onConfirm={confirmDialog.onConfirm}
          onCancel={() => setConfirmDialog(null)}
        />
      )}
    </div>
  );
}
