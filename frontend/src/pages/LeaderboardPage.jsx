import { useState, useEffect, useCallback } from 'react';
import { getLeaderboard } from '../services/api';
import './LeaderboardPage.css';

const trophies = ['🥇', '🥈', '🥉'];

export default function LeaderboardPage() {
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  const fetchLeaderboard = useCallback(async () => {
    try {
      const data = await getLeaderboard();
      setLeaderboard(data.leaderboard || data || []);
      setLastUpdated(new Date());
    } catch {
      setLeaderboard([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLeaderboard();
    const interval = setInterval(fetchLeaderboard, 10000);
    return () => clearInterval(interval);
  }, [fetchLeaderboard]);

  return (
    <div className="leaderboard-page page-enter container">
      <div className="page-header text-center">
        <h1 className="page-title">Referral <span className="text-gradient">Leaderboard</span></h1>
        <p className="page-subtitle" style={{ margin: '0 auto' }}>Top referrers ranked by performance</p>
        {lastUpdated && (
          <p className="text-muted mt-sm" style={{ fontSize: 'var(--font-xs)' }}>
            <span className="status-dot status-dot-active" style={{ marginRight: 6 }} />
            Live — Updated {lastUpdated.toLocaleTimeString()}
          </p>
        )}
      </div>

      {/* Top 3 Podium */}
      {!loading && leaderboard.length >= 3 && (
        <div className="podium mb-xl">
          {[1, 0, 2].map((idx) => {
            const entry = leaderboard[idx];
            if (!entry) return null;
            return (
              <div key={idx} className={`podium-item podium-${idx + 1}`}>
                <div className="podium-trophy">{trophies[idx]}</div>
                <div className="podium-address">
                  {entry.wallet?.slice(0, 6)}...{entry.wallet?.slice(-4)}
                </div>
                <div className="podium-count">{Number(entry.count || entry.referralCount || 0).toLocaleString()} referrals</div>
                <div className="podium-volume">${Number(entry.volume || 0).toLocaleString()}</div>
                <div className={`podium-bar podium-bar-${idx + 1}`} />
              </div>
            );
          })}
        </div>
      )}

      {/* Full Table */}
      <div className="glass-card-static">
        {loading ? (
          <div>
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="skeleton" style={{ height: 48, marginBottom: 8 }} />
            ))}
          </div>
        ) : leaderboard.length > 0 ? (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Wallet</th>
                  <th>Referrals</th>
                  <th>Volume</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.slice(0, 10).map((entry, idx) => (
                  <tr key={idx} className={idx < 3 ? 'leaderboard-top' : ''}>
                    <td>
                      <span className="leaderboard-rank">
                        {idx < 3 ? trophies[idx] : `#${idx + 1}`}
                      </span>
                    </td>
                    <td style={{ fontFamily: 'monospace' }}>
                      {entry.wallet?.slice(0, 6)}...{entry.wallet?.slice(-4)}
                    </td>
                    <td>
                      <span style={{ fontWeight: 'var(--weight-bold)' }}>
                        {Number(entry.count || entry.referralCount || 0).toLocaleString()}
                      </span>
                    </td>
                    <td style={{ color: 'var(--accent-green)' }}>
                      ${Number(entry.volume || 0).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-state-icon">★</div>
            <div className="empty-state-title">Leaderboard Empty</div>
            <div className="empty-state-message">Be the first to climb the ranks!</div>
          </div>
        )}
      </div>
    </div>
  );
}
