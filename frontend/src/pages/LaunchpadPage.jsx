import { useState, useEffect, useCallback } from 'react';
import { useWallet } from '../context/WalletContext';
import { useToast } from '../components/Toast';
import { getProjects, purchaseTokens, getVesting, claimTokens, earlyExit, simulateVesting } from '../services/api';
import ProgressBar from '../components/ProgressBar';
import CountdownTimer from '../components/CountdownTimer';
import ConfirmationDialog from '../components/ConfirmationDialog';
import WalletConfirmDialog from '../components/WalletConfirmDialog';
import DemoControls from '../components/DemoControls';
import './LaunchpadPage.css';

export default function LaunchpadPage() {
  const { account, isConnected } = useWallet();
  const toast = useToast();

  const [projects, setProjects] = useState([]);
  const [vestings, setVestings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('projects');
  const [purchaseModal, setPurchaseModal] = useState(null);
  const [purchaseAmount, setPurchaseAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [walletConfirm, setWalletConfirm] = useState(null);

  const fetchProjects = useCallback(async () => {
    try {
      const data = await getProjects();
      setProjects(data.projects || data || []);
    } catch {
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchVestings = useCallback(async () => {
    if (!account) return;
    try {
      const data = await getVesting(account);
      setVestings(data.vestings || []);
    } catch {
      setVestings([]);
    }
  }, [account]);

  useEffect(() => {
    fetchProjects();
    if (account) fetchVestings();
  }, [account, fetchProjects, fetchVestings]);

  // Auto-refresh vestings every 10s for demo
  useEffect(() => {
    if (!account || activeTab !== 'purchases') return;
    const interval = setInterval(fetchVestings, 10000);
    return () => clearInterval(interval);
  }, [account, activeTab, fetchVestings]);

  const handlePurchase = async () => {
    if (!purchaseAmount || Number(purchaseAmount) <= 0) {
      toast.error('Enter a valid USD amount');
      return;
    }

    const usdAmount = Number(purchaseAmount);
    const tokenAmount = usdAmount / Number(purchaseModal.tokenPrice);

    // Show wallet confirmation dialog first
    setWalletConfirm({
      action: 'Purchase Tokens',
      details: [
        { label: 'Project', value: purchaseModal.name },
        { label: 'Amount', value: `$${usdAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}` },
        { label: 'Token Price', value: `$${Number(purchaseModal.tokenPrice).toFixed(4)}` },
        { label: 'Tokens Received', value: `${tokenAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${purchaseModal.tokenSymbol || purchaseModal.symbol}` },
      ],
      onConfirm: async () => {
        setWalletConfirm(null);
        setSubmitting(true);
        try {
          await purchaseTokens({
            wallet: account,
            projectId: purchaseModal.id,
            amount: usdAmount,
          });
          toast.success(`Purchased ${tokenAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${purchaseModal.symbol} tokens for $${usdAmount.toLocaleString()}`);
          setPurchaseModal(null);
          setPurchaseAmount('');
          setActiveTab('purchases');
          fetchVestings();
          fetchProjects();
        } catch (err) {
          toast.error(err.message);
        } finally {
          setSubmitting(false);
        }
      },
    });
  };

  const handleClaim = (vesting) => {
    const now = Date.now();
    const vestingEnd = new Date(vesting.vestingEndDate).getTime();
    const isFullyVested = now >= vestingEnd;

    if (!isFullyVested) {
      const endDate = new Date(vesting.vestingEndDate).toLocaleDateString();
      toast.info(`Tokens available on ${endDate}`);
      return;
    }

    const amount = Number(vesting.amount);
    const mintingCost = Math.round(amount * 0.02 * 100) / 100;
    const netTokens = Math.round((amount - mintingCost) * 100) / 100;

    setConfirmDialog({
      title: 'Claim Tokens',
      message: `Claim ${amount.toLocaleString()} ${vesting.tokenSymbol} tokens?`,
      warning: `A 2% minting cost of ${mintingCost.toLocaleString()} ${vesting.tokenSymbol} will be deducted. You will receive ${netTokens.toLocaleString()} ${vesting.tokenSymbol} tokens.`,
      confirmText: 'Claim Tokens',
      onConfirm: async () => {
        try {
          await claimTokens({ wallet: account, purchaseId: vesting.id });
          toast.success(`Claimed ${netTokens.toLocaleString()} ${vesting.tokenSymbol} tokens!`);
          setConfirmDialog(null);
          fetchVestings();
        } catch (err) {
          toast.error(err.message);
        }
      },
    });
  };

  const handleEarlyExit = (vesting) => {
    setConfirmDialog({
      title: '⚠ Early Exit Warning',
      message: `Early exit forfeits ALL tokens. You will receive $0. Are you absolutely sure?`,
      warning: 'This action is IRREVERSIBLE. All your purchased tokens will be permanently forfeited.',
      danger: true,
      requireCheck: true,
      checkMessage: 'I understand I will lose ALL my tokens and receive nothing',
      confirmText: 'Exit & Forfeit All',
      onConfirm: async () => {
        try {
          await earlyExit({ wallet: account, purchaseId: vesting.id });
          toast.info('Early exit processed. Tokens forfeited.');
          setConfirmDialog(null);
          fetchVestings();
        } catch (err) {
          toast.error(err.message);
        }
      },
    });
  };

  const handleSimulateVesting = async (vestingId) => {
    try {
      await simulateVesting({ purchaseId: vestingId });
      toast.success('Vesting fast-forwarded — tokens are now claimable!');
      fetchVestings();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div className="launchpad-page page-enter container">
      <div className="page-header">
        <h1 className="page-title">Token <span className="text-gradient">Launchpad</span></h1>
        <p className="page-subtitle">Discover and invest in curated token launches</p>
      </div>

      <div className="tabs mb-xl">
        <button className={`tab ${activeTab === 'projects' ? 'active' : ''}`} onClick={() => setActiveTab('projects')}>
          Available Projects
        </button>
        {isConnected && (
          <button className={`tab ${activeTab === 'purchases' ? 'active' : ''}`} onClick={() => setActiveTab('purchases')}>
            My Purchases {vestings.length > 0 && <span className="tab-badge">{vestings.length}</span>}
          </button>
        )}
      </div>

      {activeTab === 'projects' && (
        <div className="section">
          {loading ? (
            <div className="grid grid-auto">
              {[1, 2, 3].map((i) => <div key={i} className="skeleton skeleton-card" style={{ height: 280 }} />)}
            </div>
          ) : projects.length > 0 ? (
            <div className="grid grid-auto">
              {projects.map((project) => {
                const sold = project.totalSupply - (project.availableSupply || 0);
                const progress = project.totalSupply > 0
                  ? (sold / project.totalSupply) * 100
                  : 0;
                return (
                  <div key={project.id} className="project-card glass-card">
                    <div className="project-header">
                      <div className="project-icon" style={{ background: `hsl(${(project.id?.charCodeAt?.(0) || 0) * 60 % 360}, 70%, 50%)` }}>
                        {project.name?.[0] || '?'}
                      </div>
                      <div>
                        <h4 className="project-name">{project.name}</h4>
                        <span className="text-muted">{project.symbol}</span>
                      </div>
                      <span className={`badge ${project.status === 'active' ? 'badge-success' : project.status === 'upcoming' ? 'badge-info' : 'badge-warning'}`} style={{ marginLeft: 'auto' }}>
                        {project.status === 'active' ? 'Live' : project.status === 'upcoming' ? 'Upcoming' : 'Completed'}
                      </span>
                    </div>

                    {/* Vesting Schedule Badge */}
                    {project.vestingSchedule && (
                      <div className="vesting-schedule-badge">
                        <span className="vesting-schedule-icon">🔒</span>
                        <span>{project.vestingSchedule}</span>
                      </div>
                    )}

                    <div className="project-price">
                      <span className="text-muted">Price</span>
                      <span>${Number(project.tokenPrice).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>

                    <ProgressBar
                      value={sold || 0}
                      max={project.totalSupply || 1}
                      label="Tokens Sold"
                    />

                    {project.endDate && (
                      <CountdownTimer targetDate={project.endDate} label="Sale Ends" />
                    )}

                    <button
                      className="btn btn-primary w-full mt-md"
                      onClick={() => {
                        if (!isConnected) {
                          toast.warning('Please connect your wallet first');
                          return;
                        }
                        if (project.status !== 'active') {
                          toast.info('This project is not currently accepting purchases');
                          return;
                        }
                        setPurchaseModal(project);
                      }}
                      disabled={project.status !== 'active'}
                    >
                      {project.status === 'active' ? 'Purchase Tokens' : project.status === 'upcoming' ? 'Coming Soon' : 'Sale Ended'}
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="glass-card-static empty-state">
              <div className="empty-state-icon">▲</div>
              <div className="empty-state-title">No Active Projects</div>
              <div className="empty-state-message">New token launches will appear here. Check back soon!</div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'purchases' && (
        <div className="section">
          {vestings.length > 0 ? (
            <div className="grid grid-auto">
              {vestings.map((v, idx) => {
                const now = Date.now();
                const vestEnd = new Date(v.vestingEndDate).getTime();
                const vestStart = new Date(v.vestingStartDate).getTime();
                const cliffEnd = new Date(v.cliffEndDate).getTime();
                const totalDuration = vestEnd - vestStart;
                const elapsed = now - vestStart;
                const vestProgress = totalDuration > 0
                  ? Math.min(100, Math.max(0, (elapsed / totalDuration) * 100))
                  : 100;
                const isFullyVested = now >= vestEnd;
                const isInCliff = now < cliffEnd;
                const endDate = new Date(v.vestingEndDate).toLocaleDateString();

                return (
                  <div key={v.id || idx} className="vesting-card glass-card">
                    <div className="flex justify-between items-center mb-md">
                      <h4>{v.projectName || v.tokenSymbol || 'Token'}</h4>
                      <span className={`badge ${v.status === 'completed' ? 'badge-success' : v.status === 'early_exit' ? 'badge-danger' : isFullyVested ? 'badge-success' : 'badge-info'}`}>
                        {v.status === 'completed' ? 'Claimed' : v.status === 'early_exit' ? 'Exited' : isFullyVested ? 'Fully Vested' : 'Vesting in progress'}
                      </span>
                    </div>

                    <div className="vesting-amount">
                      {Number(v.amount).toLocaleString()} <span className="text-muted">{v.tokenSymbol}</span>
                    </div>

                    {v.usdPaid && (
                      <div className="vesting-usd-paid text-muted">
                        Invested: ${Number(v.usdPaid).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </div>
                    )}

                    <ProgressBar
                      value={vestProgress}
                      max={100}
                      label="Vesting Progress"
                      color={isFullyVested ? 'green' : undefined}
                    />

                    {!isFullyVested && isInCliff && v.cliffEndDate && (
                      <CountdownTimer targetDate={v.cliffEndDate} label="Cliff Ends" />
                    )}

                    {!isFullyVested && !isInCliff && v.vestingEndDate && (
                      <CountdownTimer targetDate={v.vestingEndDate} label="Fully Vested" />
                    )}

                    {v.status === 'active' && (
                      <div className="flex gap-sm mt-md">
                        <div className="tooltip-wrapper" style={{ flex: 1 }}>
                          <button
                            className={`btn w-full ${isFullyVested ? 'btn-success' : 'btn-secondary'}`}
                            onClick={() => handleClaim(v)}
                            disabled={!isFullyVested}
                          >
                            Claim
                          </button>
                          {!isFullyVested && (
                            <span className="tooltip-text">Tokens available on {endDate}</span>
                          )}
                        </div>
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => handleEarlyExit(v)}
                        >
                          Early Exit
                        </button>
                      </div>
                    )}

                    {v.status === 'completed' && (
                      <div className="vesting-completed-label mt-md">
                        ✅ Tokens claimed to your wallet
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="glass-card-static empty-state">
              <div className="empty-state-icon">🎯</div>
              <div className="empty-state-title">No Purchases Yet</div>
              <div className="empty-state-message">Invest in a project to see your tokens here.</div>
            </div>
          )}
        </div>
      )}

      {/* Purchase Modal — USD Input */}
      {purchaseModal && (
        <div className="modal-overlay" onClick={() => setPurchaseModal(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Purchase {purchaseModal.name}</h3>
              <button className="modal-close" onClick={() => setPurchaseModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group mb-md">
                <label className="form-label">Amount (USD)</label>
                <input
                  className="form-input"
                  type="number"
                  placeholder="Enter USD amount (e.g. 1000)"
                  value={purchaseAmount}
                  onChange={(e) => setPurchaseAmount(e.target.value)}
                  min="0"
                  step="100"
                />
              </div>
              {purchaseAmount && Number(purchaseAmount) > 0 && (
                <div className="purchase-summary glass-card" style={{ padding: 'var(--space-md)' }}>
                  <div className="flex justify-between mb-sm">
                    <span className="text-muted">Investment</span>
                    <span style={{ fontWeight: 'var(--weight-bold)' }}>
                      ${Number(purchaseAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="flex justify-between mb-sm">
                    <span className="text-muted">Token Price</span>
                    <span>${Number(purchaseModal.tokenPrice).toFixed(4)}</span>
                  </div>
                  <div className="purchase-divider" />
                  <div className="flex justify-between">
                    <span className="text-muted">Tokens Received</span>
                    <span style={{ fontWeight: 'var(--weight-extrabold)', color: 'var(--color-primary)' }}>
                      {(Number(purchaseAmount) / Number(purchaseModal.tokenPrice)).toLocaleString(undefined, { maximumFractionDigits: 2 })} {purchaseModal.symbol}
                    </span>
                  </div>
                  {purchaseModal.vestingSchedule && (
                    <div className="purchase-vesting-note mt-md">
                      <span className="vesting-schedule-icon">🔒</span>
                      {purchaseModal.vestingSchedule}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setPurchaseModal(null)}>Cancel</button>
              <button
                className={`btn btn-primary ${submitting ? 'btn-loading' : ''}`}
                onClick={handlePurchase}
                disabled={submitting || !purchaseAmount || Number(purchaseAmount) <= 0}
              >
                {!submitting && 'Purchase'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Wallet Confirmation Dialog */}
      {walletConfirm && (
        <WalletConfirmDialog
          isOpen={true}
          action={walletConfirm.action}
          details={walletConfirm.details}
          onConfirm={walletConfirm.onConfirm}
          onCancel={() => setWalletConfirm(null)}
        />
      )}

      {/* Confirmation Dialog (Claim / Early Exit) */}
      {confirmDialog && (
        <ConfirmationDialog
          isOpen={true}
          title={confirmDialog.title}
          message={confirmDialog.message}
          warning={confirmDialog.warning}
          danger={confirmDialog.danger}
          requireCheck={confirmDialog.requireCheck}
          checkMessage={confirmDialog.checkMessage}
          confirmText={confirmDialog.confirmText}
          onConfirm={confirmDialog.onConfirm}
          onCancel={() => setConfirmDialog(null)}
        />
      )}

      {/* Demo Controls */}
      <DemoControls
        vestings={vestings}
        onSimulateVesting={handleSimulateVesting}
      />
    </div>
  );
}
