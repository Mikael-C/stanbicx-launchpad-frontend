import { useState, useEffect, useCallback } from 'react';
import { useWallet } from '../context/WalletContext';
import { useToast } from '../components/Toast';
import { getVerificationStatus, runVerification, deployContract } from '../services/api';
import './VerificationPage.css';

export default function VerificationPage() {
  const { account, isConnected } = useWallet();
  const toast = useToast();
  const [contracts, setContracts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deploying, setDeploying] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [expandedContract, setExpandedContract] = useState(null);
  const [summary, setSummary] = useState({ totalContracts: 0, verifiedCount: 0, allVerified: false });

  const fetchStatus = useCallback(async () => {
    try {
      const data = await getVerificationStatus();
      const contractList = data.contracts || data || [];
      setContracts(contractList);
      setSummary({
        totalContracts: data.totalContracts || contractList.length,
        verifiedCount: data.verifiedCount || contractList.filter(c => c.status === 'passed').length,
        allVerified: data.allVerified || false,
      });
    } catch {
      // Fallback when backend doesn't have verification data yet
      const fallback = [
        { name: 'SXUACore', status: 'pending', propertiesVerified: 0, propertiesTotal: 8, lastVerified: null, rules: [] },
        { name: 'LaunchpadCore', status: 'pending', propertiesVerified: 0, propertiesTotal: 6, lastVerified: null, rules: [] },
        { name: 'ResellingMarketplace', status: 'pending', propertiesVerified: 0, propertiesTotal: 6, lastVerified: null, rules: [] },
        { name: 'FeeManager', status: 'pending', propertiesVerified: 0, propertiesTotal: 5, lastVerified: null, rules: [] },
        { name: 'KillSwitch', status: 'pending', propertiesVerified: 0, propertiesTotal: 4, lastVerified: null, rules: [] },
        { name: 'TimelockController', status: 'pending', propertiesVerified: 0, propertiesTotal: 5, lastVerified: null, rules: [] },
        { name: 'ReferralSystem', status: 'pending', propertiesVerified: 0, propertiesTotal: 5, lastVerified: null, rules: [] },
        { name: 'BuyStablesPortal', status: 'pending', propertiesVerified: 0, propertiesTotal: 4, lastVerified: null, rules: [] },
      ];
      setContracts(fallback);
      setSummary({ totalContracts: 8, verifiedCount: 0, allVerified: false });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Poll during verification
  useEffect(() => {
    if (!verifying) return;
    const interval = setInterval(fetchStatus, 3000);
    return () => clearInterval(interval);
  }, [verifying, fetchStatus]);

  // Auto-stop verifying state when all done
  useEffect(() => {
    if (verifying && contracts.length > 0 && !contracts.some(c => c.status === 'running')) {
      if (contracts.some(c => c.status === 'passed' || c.status === 'failed')) {
        setVerifying(false);
        const allPassed = contracts.every(c => c.status === 'passed');
        if (allPassed) {
          toast.success('All contracts verified successfully!');
        }
      }
    }
  }, [contracts, verifying, toast]);

  const handleRunVerification = async () => {
    setVerifying(true);
    try {
      await runVerification(account);
      toast.info('Verification started. Monitoring progress...');
    } catch (err) {
      toast.error(err.message || 'Failed to start verification');
      setVerifying(false);
    }
  };

  const handleDeploy = async (contract) => {
    if (contract.status !== 'passed') {
      toast.error('Contract not formally verified. All verification checks must pass before deployment.');
      return;
    }
    setDeploying(contract.name);
    try {
      await deployContract({ wallet: account, contractName: contract.name });
      toast.success(`${contract.name} deployment initiated`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDeploying(null);
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'passed': return '✅';
      case 'failed': return '❌';
      case 'running': return '🔄';
      default: return '⏳';
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'passed': return 'badge-success';
      case 'failed': return 'badge-danger';
      case 'running': return 'badge-info';
      default: return 'badge-warning';
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'passed': return 'Verified';
      case 'failed': return 'Failed';
      case 'running': return 'Running...';
      default: return 'Pending';
    }
  };

  const formatRuleName = (name) => {
    return name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  return (
    <div className="verification-page page-enter container">
      <div className="page-header">
        <h1 className="page-title">Formal <span className="text-gradient">Verification</span></h1>
        <p className="page-subtitle">Certora Prover — Smart contract verification & deployment controls</p>
      </div>

      {/* Summary Bar */}
      <div className="verification-summary glass-card-static mb-lg">
        <div className="verification-summary-stats">
          <div className="verification-stat">
            <span className="verification-stat-value">{summary.totalContracts}</span>
            <span className="verification-stat-label">Contracts</span>
          </div>
          <div className="verification-stat">
            <span className="verification-stat-value" style={{ color: 'var(--color-success)' }}>
              {summary.verifiedCount}
            </span>
            <span className="verification-stat-label">Verified</span>
          </div>
          <div className="verification-stat">
            <span className="verification-stat-value" style={{ color: summary.allVerified ? 'var(--color-success)' : 'var(--color-warning)' }}>
              {contracts.reduce((sum, c) => sum + (c.propertiesVerified || 0), 0)}
              /
              {contracts.reduce((sum, c) => sum + (c.propertiesTotal || 0), 0)}
            </span>
            <span className="verification-stat-label">Properties</span>
          </div>
          <div className="verification-stat">
            {summary.allVerified ? (
              <span className="verification-stat-value" style={{ color: 'var(--color-success)' }}>✅</span>
            ) : verifying ? (
              <span className="verification-stat-value verification-spinner">🔄</span>
            ) : (
              <span className="verification-stat-value" style={{ color: 'var(--color-warning)' }}>⏳</span>
            )}
            <span className="verification-stat-label">
              {summary.allVerified ? 'All Passed' : verifying ? 'Verifying...' : 'Awaiting'}
            </span>
          </div>
        </div>

        {isConnected && (
          <button
            className={`btn ${verifying ? 'btn-secondary' : 'btn-primary'} ${verifying ? 'btn-loading' : ''}`}
            onClick={handleRunVerification}
            disabled={verifying}
          >
            {!verifying && (
              <>
                <span style={{ marginRight: 8 }}>🔍</span>
                Run Verification
              </>
            )}
          </button>
        )}
      </div>

      {/* Terminal hint */}
      <div className="verification-terminal-hint glass-card mb-lg">
        <span className="verification-terminal-icon">💻</span>
        <div>
          <strong>Terminal Verification</strong>
          <p className="text-muted" style={{ margin: '4px 0 0', fontSize: 'var(--font-xs)' }}>
            Run <code>node certora/verify.js</code> from the project root for detailed terminal output with per-property progress.
          </p>
        </div>
      </div>

      {/* Contract List */}
      <div className="glass-card-static">
        {loading ? (
          <div>
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <div key={i} className="skeleton" style={{ height: 72, marginBottom: 12 }} />
            ))}
          </div>
        ) : (
          <div className="verification-list">
            {contracts.map((contract, idx) => {
              const isPassed = contract.status === 'passed';
              const isFailed = contract.status === 'failed';
              const isRunning = contract.status === 'running';
              const isExpanded = expandedContract === contract.name;
              const rules = contract.rules || [];

              return (
                <div key={idx} className="verification-item-wrapper">
                  <div
                    className={`verification-item ${isFailed ? 'verification-item-failed' : ''} ${isRunning ? 'verification-item-running' : ''} ${isExpanded ? 'verification-item-expanded' : ''}`}
                    onClick={() => setExpandedContract(isExpanded ? null : contract.name)}
                    style={{ cursor: rules.length > 0 ? 'pointer' : 'default' }}
                  >
                    <div className="verification-info">
                      <div className="verification-name">
                        <span className={`status-dot ${isPassed ? 'status-dot-active' : isFailed ? 'status-dot-error' : isRunning ? 'status-dot-running' : 'status-dot-inactive'}`} />
                        <h4>{contract.name}</h4>
                        {rules.length > 0 && (
                          <span className="verification-expand-icon">{isExpanded ? '▼' : '▶'}</span>
                        )}
                      </div>
                      <div className="verification-meta">
                        <span className={`badge ${getStatusBadge(contract.status)}`}>
                          {getStatusIcon(contract.status)} {getStatusLabel(contract.status)}
                        </span>
                        <span className="text-muted">
                          {contract.propertiesVerified}/{contract.propertiesTotal} properties
                        </span>
                        {contract.lastVerified && (
                          <span className="text-muted">
                            {new Date(contract.lastVerified).toLocaleString()}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      className={`btn btn-sm ${isPassed ? 'btn-primary' : 'btn-secondary'} ${deploying === contract.name ? 'btn-loading' : ''}`}
                      onClick={(e) => { e.stopPropagation(); handleDeploy(contract); }}
                      disabled={!isPassed || deploying === contract.name}
                    >
                      {deploying !== contract.name && 'Deploy'}
                    </button>
                  </div>

                  {/* Expanded Rules */}
                  {isExpanded && rules.length > 0 && (
                    <div className="verification-rules">
                      {rules.map((rule, rIdx) => (
                        <div key={rIdx} className="verification-rule">
                          <span className="verification-rule-icon">
                            {rule.status === 'passed' ? '✅' : rule.status === 'failed' ? '❌' : '⏳'}
                          </span>
                          <span className="verification-rule-name">{formatRuleName(rule.name)}</span>
                          <span className={`verification-rule-status ${rule.status === 'passed' ? 'text-success' : rule.status === 'failed' ? 'text-danger' : 'text-muted'}`}>
                            {rule.status === 'passed' ? 'PASSED' : rule.status === 'failed' ? 'FAILED' : 'PENDING'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Deployment Policy Warning */}
      <div className="verification-notice glass-card mt-lg">
        <span>⚠</span>
        <div>
          <strong>Deployment Policy:</strong> Only contracts that have passed all formal verification
          checks can be deployed to production. Unverified contracts will be rejected with
          &quot;Contract not formally verified&quot; error.
        </div>
      </div>
    </div>
  );
}
