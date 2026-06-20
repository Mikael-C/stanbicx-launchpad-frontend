import { useState, useEffect } from 'react';
import { useWallet } from '../context/WalletContext';
import { getJailbreakAttempts, getJailbreakStats } from '../services/api';
import CountdownTimer from '../components/CountdownTimer';
import './JailbreakDashboardPage.css';

export default function JailbreakDashboardPage() {
  const { account } = useWallet();
  const [attempts, setAttempts] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
    // Issue 5 fix: poll every 3s for real-time updates during demo
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, [account]);

  const fetchData = async () => {
    try {
      const [attemptsData, statsData] = await Promise.all([
        getJailbreakAttempts(account).catch(() => ({ attempts: [] })),
        getJailbreakStats(account).catch(() => ({
          totalAttempts: 0,
          blocked: 0,
          activeLocks: 0,
          rateLimitEvents: 0,
        })),
      ]);
      setAttempts(attemptsData.attempts || attemptsData || []);
      setStats(statsData);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="jailbreak-page page-enter container">
      <div className="page-header">
        <h1 className="page-title">Jailbreak <span className="text-gradient">Monitor</span></h1>
        <p className="page-subtitle">AI security monitoring and threat detection</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-4 mb-xl">
        {[
          { label: 'Total Attempts', value: stats?.totalAttempts || 0, icon: '🎯', color: 'var(--accent-blue)' },
          { label: 'Blocked', value: stats?.blockedCount || 0, icon: '🛡', color: 'var(--accent-red)' },
          { label: 'Active Locks', value: stats?.lockedAccounts || 0, icon: '🔒', color: 'var(--accent-orange)' },
          { label: 'Block Rate', value: `${stats?.blockRate || 0}%`, icon: '⚡', color: 'var(--accent-cyan)' },
        ].map((stat, idx) => (
          <div key={idx} className="glass-card stat-card">
            {loading ? (
              <div className="skeleton skeleton-heading" style={{ margin: '0 auto' }} />
            ) : (
              <>
                <div className="stat-value">{stat.value.toLocaleString()}</div>
                <div className="stat-label">{stat.label}</div>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Locked-Out Users */}
      {stats?.lockedUsers?.length > 0 && (
        <div className="section">
          <h3 className="section-title">🔒 Locked-Out Users</h3>
          <div className="grid grid-auto">
            {stats.lockedUsers.map((user, idx) => (
              <div key={idx} className="glass-card glass-card-error">
                <div className="flex justify-between items-center mb-md">
                  <span style={{ fontFamily: 'monospace' }}>
                    {user.wallet?.slice(0, 6)}...{user.wallet?.slice(-4)}
                  </span>
                  <span className="badge badge-danger">Locked</span>
                </div>
                {user.lockExpiry && (
                  <CountdownTimer targetDate={user.lockExpiry} label="Lock Expires" />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Attempts */}
      <div className="section">
        <h3 className="section-title">📋 Recent Jailbreak Attempts</h3>
        <div className="glass-card-static">
          {loading ? (
            <div>
              {[1, 2, 3, 4].map((i) => <div key={i} className="skeleton" style={{ height: 48, marginBottom: 8 }} />)}
            </div>
          ) : attempts.length > 0 ? (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>User</th>
                    <th>Pattern</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {attempts.map((attempt, idx) => (
                    <tr key={idx}>
                      <td>{new Date(attempt.createdAt).toLocaleString()}</td>
                      <td style={{ fontFamily: 'monospace' }}>
                        {attempt.walletAddress?.slice(0, 6)}...{attempt.walletAddress?.slice(-4)}
                      </td>
                      <td>
                        <span className="jailbreak-pattern">{attempt.patternMatched || 'Unknown'}</span>
                      </td>
                      <td>
                        <span className={`badge ${attempt.blocked ? 'badge-danger' : 'badge-warning'}`}>
                          {attempt.blocked ? 'Blocked' : 'Detected'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state" style={{ padding: 'var(--space-xl)' }}>
              <div className="empty-state-icon">🛡</div>
              <div className="empty-state-title">No Attempts Detected</div>
              <div className="empty-state-message">All clear — no jailbreak attempts recorded.</div>
            </div>
          )}
        </div>
      </div>

      {/* Blocked Prompts */}
      <div className="section">
        <h3 className="section-title">🚫 Blocked Prompt Patterns</h3>
        <div className="glass-card-static">
          <div className="blocked-patterns">
            {['SQL injection', 'Prompt override', 'System prompt extraction', 'Role manipulation', 'Token limit exploit'].map((p, idx) => (
              <div key={idx} className="blocked-pattern-item">
                <span className="status-dot status-dot-error" />
                <span>{p}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
