import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWallet } from '../context/WalletContext';
import { useToast } from '../components/Toast';
import {
  getProposals, createProposal, approveProposal, rejectProposal,
  toggleKillSwitch, getKillSwitchStatus, getAuditLog, getAdminDevices
} from '../services/api';
import ConfirmationDialog from '../components/ConfirmationDialog';
import './AdminPage.css';

// Fee types matching FeeManager.sol defaults
const FEE_TYPES = [
  { key: 'SXCP_FEE', label: 'SXCP Fee (Platform Conversion)', defaultBps: 1200 },
  { key: 'SPREAD_FEE', label: 'Spread Fee (Market Spread)', defaultBps: 500 },
  { key: 'PTF', label: 'PTF (Platform Transaction Fee)', defaultBps: 100 },
  { key: 'WITHDRAWAL_FEE', label: 'Withdrawal Fee', defaultBps: 600 },
  { key: 'MINTING_COST', label: 'Minting Cost', defaultBps: 200 },
];

// Demo admin wallets matching backend/.env ADMIN_WALLETS
const DEMO_ADMINS = [
  { label: 'Admin 1 (Proposer)', address: '0x9998d8694e7636f93a52a8330e300a84d67c99d8', color: '#667eea' },
  { label: 'Admin 2', address: '0x0000000000000000000000000000000000000002', color: '#00d2ff' },
  { label: 'Admin 3', address: '0x0000000000000000000000000000000000000003', color: '#00b894' },
];

function bpsToPercent(bps) {
  return (bps / 100).toFixed(2);
}

export default function AdminPage() {
  const { account, isConnected } = useWallet();
  const toast = useToast();
  const navigate = useNavigate();

  // Demo mode state
  const isDemoMode = new URLSearchParams(window.location.search).get('demo') === 'true';
  const [demoWallet, setDemoWallet] = useState(DEMO_ADMINS[0].address);
  const activeWallet = isDemoMode ? demoWallet : account;

  // Page data
  const [proposals, setProposals] = useState([]);
  const [killSwitch, setKillSwitch] = useState(false);
  const [devices, setDevices] = useState([]);
  const [auditLog, setAuditLog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Create proposal form
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedFeeType, setSelectedFeeType] = useState(FEE_TYPES[1].key); // Default to SPREAD_FEE
  const [newFeeBps, setNewFeeBps] = useState('');
  const [proposalNote, setProposalNote] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const wallet = activeWallet;
      const [props, ksStatus, devs, audit] = await Promise.all([
        getProposals(wallet).catch(() => ({ proposals: [] })),
        getKillSwitchStatus().catch(() => ({ isPaused: false })),
        getAdminDevices(wallet).catch(() => ({ devices: [] })),
        getAuditLog(wallet).catch(() => ({ logs: [], actions: [] })),
      ]);
      setProposals(props.proposals || props || []);
      setKillSwitch(ksStatus.isPaused || false);
      setDevices(devs.devices || devs || []);
      setAuditLog(audit.actions || audit.logs || audit || []);
    } finally {
      setLoading(false);
    }
  }, [activeWallet]);

  useEffect(() => {
    if (activeWallet) fetchData();
  }, [activeWallet, fetchData]);

  const currentFeeType = FEE_TYPES.find(f => f.key === selectedFeeType);

  const handleCreateProposal = async () => {
    const bps = parseInt(newFeeBps, 10);
    if (isNaN(bps) || bps < 0 || bps > 5000) {
      toast.error('Fee must be between 0 and 5000 bps (0–50%)');
      return;
    }

    setSubmitting(true);
    try {
      const description = `Change ${selectedFeeType} from ${currentFeeType.defaultBps} bps (${bpsToPercent(currentFeeType.defaultBps)}%) to ${bps} bps (${bpsToPercent(bps)}%)${proposalNote ? ` — ${proposalNote}` : ''}`;

      await createProposal({
        wallet: activeWallet,
        description,
        calldata: `updateFee("${selectedFeeType}", ${bps})`,
      });

      toast.success('Proposal created — 1/3 approvals (yours counted automatically)');
      setShowCreateForm(false);
      setNewFeeBps('');
      setProposalNote('');
      fetchData();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleApprove = async (proposal) => {
    setSubmitting(true);
    try {
      const result = await approveProposal({ wallet: activeWallet, proposalId: proposal.id });
      if (result.executed) {
        toast.success('✅ Proposal executed! All 3 admins approved — fee change is now live.');
      } else {
        toast.success(`Approved — ${result.approvalCount}/3 approvals (${result.approvalsRemaining} remaining)`);
      }
      fetchData();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async (proposal) => {
    setSubmitting(true);
    try {
      await rejectProposal({ wallet: activeWallet, proposalId: proposal.id });
      toast.info('Proposal rejected');
      fetchData();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleKillSwitch = () => {
    setConfirmDialog({
      title: killSwitch ? 'Resume Platform' : '⚠ Pause Platform',
      message: killSwitch
        ? 'Resume all platform operations?'
        : 'This will pause ALL platform operations immediately.',
      danger: !killSwitch,
      requireCheck: !killSwitch,
      checkMessage: 'I understand this will halt all user operations',
      confirmText: killSwitch ? 'Resume' : 'Pause Platform',
      onConfirm: async () => {
        try {
          await toggleKillSwitch({
            wallet: activeWallet,
            action: killSwitch ? 'deactivate' : 'activate',
          });
          setKillSwitch(!killSwitch);
          toast.success(killSwitch ? 'Platform resumed' : 'Platform paused — red banner now visible on all pages');
          setConfirmDialog(null);
        } catch (err) {
          toast.error(err.message);
        }
      },
    });
  };

  // Check if current demo wallet already approved a proposal
  const hasWalletApproved = (proposal) => {
    const approvals = Array.isArray(proposal.approvals) ? proposal.approvals : [];
    return approvals.includes(activeWallet?.toLowerCase());
  };

  if (!isConnected && !isDemoMode) {
    return (
      <div className="container page-enter">
        <div className="empty-state">
          <div className="empty-state-icon">⚙</div>
          <div className="empty-state-title">Admin Access Required</div>
          <div className="empty-state-message">
            Connect your admin wallet to access this page.
            <br />
            <span className="text-muted" style={{ fontSize: 'var(--font-sm)', marginTop: '8px', display: 'block' }}>
              Or add <code>?demo=true</code> to the URL for demo mode.
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-page page-enter container">
      {/* Demo Admin Switcher */}
      {isDemoMode && (
        <div className="demo-admin-switcher">
          <div className="demo-admin-switcher-header">
            <span className="demo-mode-indicator" />
            <span className="demo-mode-tag">DEMO MODE</span>
            <span className="demo-mode-subtitle">Master Device Simulator</span>
          </div>
          <div className="demo-admin-buttons">
            {DEMO_ADMINS.map((admin) => (
              <button
                key={admin.address}
                className={`demo-admin-btn ${activeWallet === admin.address ? 'demo-admin-btn-active' : ''}`}
                style={{ '--admin-color': admin.color }}
                onClick={() => setDemoWallet(admin.address)}
              >
                <span className="demo-admin-dot" />
                <div className="demo-admin-info">
                  <span className="demo-admin-name">{admin.label}</span>
                  <span className="demo-admin-addr">
                    {admin.address.slice(0, 6)}...{admin.address.slice(-4)}
                  </span>
                </div>
                {activeWallet === admin.address && (
                  <span className="demo-admin-active-badge">CONNECTED</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="page-header">
        <h1 className="page-title">Admin <span className="text-gradient">Dashboard</span></h1>
        <p className="page-subtitle">
          Super admin controls and governance
          {isDemoMode && (
            <span className="demo-wallet-display">
              &nbsp;·&nbsp;Acting as: <code>{activeWallet?.slice(0, 8)}...{activeWallet?.slice(-4)}</code>
            </span>
          )}
        </p>
      </div>

      {/* Kill Switch */}
      <div className="section">
        <div className={`killswitch-control glass-card-static ${killSwitch ? 'killswitch-active' : ''}`}>
          <div className="killswitch-info">
            <h3>Kill Switch</h3>
            <p className="text-muted">Emergency platform pause control</p>
          </div>
          <div className="killswitch-toggle">
            <span className={`badge ${killSwitch ? 'badge-danger' : 'badge-success'}`}>
              {killSwitch ? 'PAUSED' : 'ACTIVE'}
            </span>
            <button
              className={`btn ${killSwitch ? 'btn-success' : 'btn-danger'} btn-sm`}
              onClick={handleToggleKillSwitch}
            >
              {killSwitch ? 'Resume' : 'Pause'}
            </button>
          </div>
        </div>
      </div>

      {/* Quick Links */}
      <div className="grid grid-3 mb-xl">
        <button className="admin-quick-link glass-card" onClick={() => navigate('/jailbreak')}>
          <span className="admin-quick-icon">🛡</span>
          <div>
            <h4>Jailbreak Monitor</h4>
            <p className="text-muted">View AI security attempts</p>
          </div>
          <span className="admin-quick-arrow">→</span>
        </button>
        <button className="admin-quick-link glass-card" onClick={() => navigate('/verification')}>
          <span className="admin-quick-icon">✓</span>
          <div>
            <h4>Verification Dashboard</h4>
            <p className="text-muted">Contract verification status</p>
          </div>
          <span className="admin-quick-arrow">→</span>
        </button>
        <button className="admin-quick-link glass-card" onClick={() => navigate(`/security-demo${isDemoMode ? '?demo=true' : ''}`)}>
          <span className="admin-quick-icon">🔐</span>
          <div>
            <h4>Security Demo</h4>
            <p className="text-muted">DIG & DPoP token binding</p>
          </div>
          <span className="admin-quick-arrow">→</span>
        </button>
      </div>

      {/* ─── Create Proposal ─────────────────────────────────────── */}
      <div className="section">
        <div className="section-header-row">
          <h3 className="section-title">📝 Create Fee Change Proposal</h3>
          <button
            className={`btn ${showCreateForm ? 'btn-ghost' : 'btn-primary'} btn-sm`}
            onClick={() => setShowCreateForm(!showCreateForm)}
          >
            {showCreateForm ? '✕ Cancel' : '+ New Proposal'}
          </button>
        </div>

        {showCreateForm && (
          <div className="create-proposal-card glass-card-static">
            <div className="create-proposal-grid">
              {/* Fee Type Selector */}
              <div className="form-group">
                <label className="form-label">Fee Type</label>
                <select
                  className="form-select"
                  value={selectedFeeType}
                  onChange={(e) => setSelectedFeeType(e.target.value)}
                >
                  {FEE_TYPES.map((fee) => (
                    <option key={fee.key} value={fee.key}>
                      {fee.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Current Value (read-only) */}
              <div className="form-group">
                <label className="form-label">Current Value</label>
                <div className="current-fee-display">
                  <span className="current-fee-bps">{currentFeeType.defaultBps} bps</span>
                  <span className="current-fee-percent">{bpsToPercent(currentFeeType.defaultBps)}%</span>
                </div>
              </div>

              {/* New Value */}
              <div className="form-group">
                <label className="form-label">New Value (bps)</label>
                <input
                  type="number"
                  className="form-input"
                  placeholder="e.g. 300"
                  value={newFeeBps}
                  onChange={(e) => setNewFeeBps(e.target.value)}
                  min="0"
                  max="5000"
                />
                <span className="form-hint">
                  {newFeeBps && !isNaN(newFeeBps)
                    ? `= ${bpsToPercent(parseInt(newFeeBps, 10))}%`
                    : '1 bps = 0.01%  ·  Max: 5000 bps (50%)'
                  }
                </span>
              </div>

              {/* Note (optional) */}
              <div className="form-group">
                <label className="form-label">Note (optional)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Reason for fee change..."
                  value={proposalNote}
                  onChange={(e) => setProposalNote(e.target.value)}
                />
              </div>
            </div>

            {/* Fee Change Preview */}
            {newFeeBps && !isNaN(newFeeBps) && (
              <div className="fee-change-preview">
                <div className="fee-change-arrow-container">
                  <div className="fee-change-from">
                    <span className="fee-change-label">Current</span>
                    <span className="fee-change-value">{bpsToPercent(currentFeeType.defaultBps)}%</span>
                    <span className="fee-change-bps">{currentFeeType.defaultBps} bps</span>
                  </div>
                  <div className="fee-change-arrow">
                    {parseInt(newFeeBps, 10) < currentFeeType.defaultBps ? '↓' : parseInt(newFeeBps, 10) > currentFeeType.defaultBps ? '↑' : '='}
                  </div>
                  <div className={`fee-change-to ${parseInt(newFeeBps, 10) < currentFeeType.defaultBps ? 'fee-decrease' : parseInt(newFeeBps, 10) > currentFeeType.defaultBps ? 'fee-increase' : ''}`}>
                    <span className="fee-change-label">Proposed</span>
                    <span className="fee-change-value">{bpsToPercent(parseInt(newFeeBps, 10))}%</span>
                    <span className="fee-change-bps">{newFeeBps} bps</span>
                  </div>
                </div>
              </div>
            )}

            <div className="create-proposal-actions">
              <button
                className={`btn btn-primary ${submitting ? 'btn-loading' : ''}`}
                onClick={handleCreateProposal}
                disabled={submitting || !newFeeBps}
              >
                {!submitting && '🗳 Submit Proposal'}
              </button>
              <span className="form-hint">Your approval is auto-counted (1/3)</span>
            </div>
          </div>
        )}
      </div>

      {/* ─── Pending Proposals ───────────────────────────────────── */}
      <div className="section">
        <h3 className="section-title">📋 Governance Proposals (3-of-3 Approval)</h3>
        {loading ? (
          <div className="skeleton skeleton-card" />
        ) : proposals.length > 0 ? (
          <div className="proposals-list">
            {proposals.map((proposal, idx) => {
              const approvalCount = proposal.approvalCount || 0;
              const approvals = Array.isArray(proposal.approvals) ? proposal.approvals : [];
              const isExecuted = proposal.status === 'executed';
              const isCancelled = proposal.status === 'cancelled';
              const isPending = proposal.status === 'pending';
              const alreadyApproved = hasWalletApproved(proposal);

              return (
                <div
                  key={proposal.id || idx}
                  className={`proposal-card glass-card-static ${isExecuted ? 'proposal-executed' : ''} ${isCancelled ? 'proposal-cancelled' : ''}`}
                >
                  <div className="proposal-header">
                    <div className="proposal-title-row">
                      <h4>{proposal.description || proposal.title || proposal.type || 'Governance Proposal'}</h4>
                      <span className={`badge ${isExecuted ? 'badge-success' : isCancelled ? 'badge-danger' : 'badge-warning'}`}>
                        {isExecuted ? '✅ Executed' : isCancelled ? '✕ Cancelled' : `${approvalCount}/3 Approvals`}
                      </span>
                    </div>
                    {proposal.calldata && (
                      <code className="proposal-calldata">{proposal.calldata}</code>
                    )}
                  </div>

                  {/* Approval Progress */}
                  <div className="approval-progress">
                    <div className="approval-bar">
                      <div
                        className={`approval-bar-fill ${isExecuted ? 'approval-bar-executed' : ''}`}
                        style={{ width: `${(approvalCount / 3) * 100}%` }}
                      />
                    </div>
                    <div className="approval-dots">
                      {DEMO_ADMINS.map((admin, i) => {
                        const approved = approvals.includes(admin.address.toLowerCase());
                        return (
                          <div
                            key={admin.address}
                            className={`approval-dot ${approved ? 'approval-dot-approved' : ''}`}
                            style={{ '--dot-color': admin.color }}
                            title={`${admin.label}: ${approved ? 'Approved' : 'Pending'}`}
                          >
                            <span className="approval-dot-icon">
                              {approved ? '✓' : (i + 1)}
                            </span>
                            <span className="approval-dot-label">{admin.label}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Actions */}
                  {isPending && (
                    <div className="proposal-actions">
                      {alreadyApproved ? (
                        <span className="already-approved-badge">
                          ✓ You approved this proposal
                        </span>
                      ) : (
                        <button
                          className={`btn btn-success btn-sm ${submitting ? 'btn-loading' : ''}`}
                          onClick={() => handleApprove(proposal)}
                          disabled={submitting}
                        >
                          {!submitting && '✓ Approve'}
                        </button>
                      )}
                      <button
                        className={`btn btn-danger btn-sm ${submitting ? 'btn-loading' : ''}`}
                        onClick={() => handleReject(proposal)}
                        disabled={submitting}
                      >
                        {!submitting && '✕ Reject'}
                      </button>
                    </div>
                  )}

                  {/* Execution timestamp */}
                  {isExecuted && proposal.executedAt && (
                    <div className="proposal-executed-info">
                      <span className="text-muted">
                        Executed at {new Date(proposal.executedAt).toLocaleString()}
                      </span>
                    </div>
                  )}

                  <div className="proposal-meta">
                    <span className="text-muted">
                      Proposed by {proposal.proposer?.slice(0, 6)}...{proposal.proposer?.slice(-4)}
                    </span>
                    <span className="text-muted">
                      {new Date(proposal.createdAt).toLocaleString()}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="glass-card-static text-center" style={{ padding: 'var(--space-xl)' }}>
            <p className="text-muted">No proposals yet — create one above to get started.</p>
          </div>
        )}
      </div>

      {/* Master Devices */}
      <div className="section">
        <h3 className="section-title">🔑 Master Devices</h3>
        <div className="glass-card-static">
          {devices.length > 0 ? (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Device</th>
                    <th>Wallet</th>
                    <th>Status</th>
                    <th>Last Active</th>
                  </tr>
                </thead>
                <tbody>
                  {devices.map((device, idx) => (
                    <tr key={idx}>
                      <td>{device.name || `Device ${idx + 1}`}</td>
                      <td style={{ fontFamily: 'monospace' }}>
                        {device.wallet?.slice(0, 6)}...{device.wallet?.slice(-4)}
                      </td>
                      <td>
                        <span className="badge badge-success">Active</span>
                      </td>
                      <td>{device.lastActive ? new Date(device.lastActive).toLocaleString() : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-muted text-center" style={{ padding: 'var(--space-lg)' }}>
              {isDemoMode ? 'Demo mode — using simulated admin wallets' : 'No devices registered'}
            </p>
          )}
        </div>
      </div>

      {/* Audit Log */}
      <div className="section">
        <h3 className="section-title">📜 Audit Log</h3>
        <div className="glass-card-static">
          {auditLog.length > 0 ? (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Action</th>
                    <th>Admin</th>
                    <th>Details</th>
                    <th>Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLog.map((log, idx) => (
                    <tr key={idx}>
                      <td><span className="badge badge-primary">{log.action}</span></td>
                      <td style={{ fontFamily: 'monospace' }}>
                        {log.wallet?.slice(0, 6)}...{log.wallet?.slice(-4)}
                      </td>
                      <td className="text-muted">{log.description || log.details || '—'}</td>
                      <td>{new Date(log.createdAt || log.timestamp).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-muted text-center" style={{ padding: 'var(--space-lg)' }}>
              No audit entries
            </p>
          )}
        </div>
      </div>

      {confirmDialog && (
        <ConfirmationDialog
          isOpen={true}
          title={confirmDialog.title}
          message={confirmDialog.message}
          danger={confirmDialog.danger}
          requireCheck={confirmDialog.requireCheck}
          checkMessage={confirmDialog.checkMessage}
          confirmText={confirmDialog.confirmText}
          onConfirm={confirmDialog.onConfirm}
          onCancel={() => setConfirmDialog(null)}
        />
      )}
    </div>
  );
}
