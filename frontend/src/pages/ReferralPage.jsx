import { useState, useEffect } from 'react';
import { useWallet } from '../context/WalletContext';
import { useToast } from '../components/Toast';
import { getReferralStats, getReferralCode } from '../services/api';
import QRCodeGenerator from '../components/QRCodeGenerator';
import './ReferralPage.css';

export default function ReferralPage() {
  const { account, isConnected } = useWallet();
  const toast = useToast();
  const [stats, setStats] = useState(null);
  const [referralCode, setReferralCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const referralLink = referralCode
    ? `${window.location.origin}/register?ref=${referralCode}`
    : '';

  useEffect(() => {
    if (account) fetchData();
  }, [account]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [statsData, codeData] = await Promise.all([
        getReferralStats(account).catch(() => null),
        getReferralCode(account).catch(() => ({
          code: account ? account.slice(2, 10).toUpperCase() : 'SXLAUNCH',
        })),
      ]);
      // Map backend field names to frontend field names
      if (statsData) {
        setStats({
          totalReferrals: statsData.referralCount || 0,
          successful: statsData.successfulReferrals || 0,
          pending: statsData.pendingReferrals || 0,
          sxpEarned: statsData.totalRewardsEarned || 0,
          rank: statsData.rank !== 'unranked' ? statsData.rank : null,
          recentActivity: statsData.recentActivity || [],
        });
      } else {
        setStats({
          totalReferrals: 0,
          successful: 0,
          pending: 0,
          sxpEarned: 0,
          rank: null,
          recentActivity: [],
        });
      }
      setReferralCode(codeData.code || codeData.referralCode || '');
    } finally {
      setLoading(false);
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(referralLink);
    setCopied(true);
    toast.success('Referral link copied!');
    setTimeout(() => setCopied(false), 2000);
  };

  const shareOnTelegram = () => {
    window.open(`https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent('Join SX Launchpad and earn rewards!')}`, '_blank');
  };

  const shareOnTwitter = () => {
    window.open(`https://twitter.com/intent/tweet?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent('Join SX Launchpad - The Premium DeFi Ecosystem! Use my referral link:')}`, '_blank');
  };

  const shareOnFacebook = () => {
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(referralLink)}`, '_blank');
  };

  if (!isConnected) {
    return (
      <div className="container page-enter">
        <div className="empty-state">
          <div className="empty-state-icon">⟐</div>
          <div className="empty-state-title">Connect Your Wallet</div>
          <div className="empty-state-message">Connect your wallet to access your referral dashboard.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="referral-page page-enter container">
      <div className="page-header">
        <h1 className="page-title">Referral <span className="text-gradient">Program</span></h1>
        <p className="page-subtitle">Invite friends and earn SXP rewards for every successful referral</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-4 mb-xl">
        {[
          { label: 'Total Referrals', value: stats?.totalReferrals || 0, icon: '👥' },
          { label: 'Successful', value: stats?.successful || 0, icon: '✓' },
          { label: 'Pending', value: stats?.pending || 0, icon: '⏳' },
          { label: 'SXP Earned', value: stats?.sxpEarned || 0, icon: '◈', isCurrency: true },
        ].map((stat, idx) => (
          <div key={idx} className="glass-card stat-card">
            {loading ? (
              <>
                <div className="skeleton skeleton-heading" style={{ margin: '0 auto' }} />
                <div className="skeleton skeleton-text-sm" style={{ margin: '0 auto' }} />
              </>
            ) : (
              <>
                <div className="stat-value">
                  {stat.isCurrency
                    ? Number(stat.value).toLocaleString()
                    : stat.value.toLocaleString()}
                </div>
                <div className="stat-label">{stat.label}</div>
              </>
            )}
          </div>
        ))}
      </div>

      {stats?.rank && (
        <div className="glass-card text-center mb-xl referral-rank">
          <span className="text-muted">Your Rank</span>
          <div className="referral-rank-value">#{stats.rank}</div>
        </div>
      )}

      {/* Referral Link & QR */}
      <div className="grid grid-2 mb-xl">
        <div className="glass-card-static">
          <h3 className="section-title">🔗 Your Referral Link</h3>
          <div className="referral-link-box">
            <input
              className="form-input"
              value={referralLink}
              readOnly
            />
            <button className="btn btn-primary" onClick={copyLink}>
              {copied ? '✓ Copied' : '📋 Copy'}
            </button>
          </div>

          <div className="referral-code-display mt-lg">
            <span className="text-muted">Referral Code</span>
            <span className="referral-code">{referralCode}</span>
          </div>

          <div className="referral-share mt-lg">
            <span className="form-label">Share</span>
            <div className="share-buttons">
              <button className="btn btn-secondary btn-sm share-tg" onClick={shareOnTelegram}>
                ✈ Telegram
              </button>
              <button className="btn btn-secondary btn-sm share-tw" onClick={shareOnTwitter}>
                𝕏 Twitter
              </button>
              <button className="btn btn-secondary btn-sm share-fb" onClick={shareOnFacebook}>
                f Facebook
              </button>
            </div>
          </div>
        </div>

        <div className="glass-card-static text-center">
          <h3 className="section-title" style={{ justifyContent: 'center' }}>📱 QR Code</h3>
          <QRCodeGenerator value={referralLink} size={180} />
        </div>
      </div>

      {/* Recent Activity */}
      <div className="glass-card-static">
        <h3 className="section-title">📊 Recent Referral Activity</h3>
        {stats?.recentActivity?.length > 0 ? (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Status</th>
                  <th>Reward</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {stats.recentActivity.map((activity, idx) => (
                  <tr key={idx}>
                    <td style={{ fontFamily: 'monospace' }}>
                      {activity.wallet?.slice(0, 6)}...{activity.wallet?.slice(-4)}
                    </td>
                    <td>
                      <span className={`badge ${activity.status === 'completed' ? 'badge-success' : 'badge-warning'}`}>
                        {activity.status}
                      </span>
                    </td>
                    <td>{Number(activity.reward || 0).toLocaleString()} SXP</td>
                    <td>{new Date(activity.date).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state" style={{ padding: 'var(--space-xl)' }}>
            <div className="empty-state-title">No Referral Activity Yet</div>
            <div className="empty-state-message">Share your referral link to start earning!</div>
          </div>
        )}
      </div>
    </div>
  );
}
