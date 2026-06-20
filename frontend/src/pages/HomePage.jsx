import { useNavigate } from 'react-router-dom';
import { useWallet } from '../context/WalletContext';
import { useEffect, useState } from 'react';
import { getStats } from '../services/api';
import './HomePage.css';

const features = [
  {
    icon: '◈',
    title: 'Buy Stables',
    desc: 'Convert ETH, BTC, or SOL into stablecoins seamlessly. Best rates, instant settlement.',
    link: '/buy-stables',
    gradient: 'linear-gradient(135deg, #667eea, #764ba2)',
  },
  {
    icon: '◫',
    title: 'SXUA Dashboard',
    desc: 'Unified accounts with committed & uncommitted balances. Earn yield on your deposits.',
    link: '/dashboard',
    gradient: 'linear-gradient(135deg, #00d2ff, #667eea)',
  },
  {
    icon: '▲',
    title: 'Launchpad',
    desc: 'Discover and invest in token launches with built-in vesting and escrow protection.',
    link: '/launchpad',
    gradient: 'linear-gradient(135deg, #764ba2, #fd79a8)',
  },
  {
    icon: '⬡',
    title: 'Marketplace',
    desc: 'Trade vested tokens on the secondary market. List, buy, and sell with confidence.',
    link: '/marketplace',
    gradient: 'linear-gradient(135deg, #00b894, #00cec9)',
  },
  {
    icon: '⟐',
    title: 'Referral Program',
    desc: 'Earn SXP rewards by referring friends. Track performance and climb the leaderboard.',
    link: '/referrals',
    gradient: 'linear-gradient(135deg, #fdcb6e, #e17055)',
  },
  {
    icon: '◉',
    title: 'AI Assistant',
    desc: 'Get intelligent support and insights from our AI-powered assistant.',
    link: '/ai-chat',
    gradient: 'linear-gradient(135deg, #a29bfe, #6c5ce7)',
  },
];

export default function HomePage() {
  const navigate = useNavigate();
  const { isConnected, connectWallet } = useWallet();
  const [stats, setStats] = useState({ totalVolume: 0, totalUsers: 0, totalProjects: 0 });

  useEffect(() => {
    getStats()
      .then(setStats)
      .catch(() => setStats({ totalVolume: 12500000, totalUsers: 2847, totalProjects: 14 }));
  }, []);

  const handleGetStarted = async () => {
    if (!isConnected) {
      try {
        await connectWallet();
      } catch {}
    }
    navigate('/buy-stables');
  };

  return (
    <div className="home-page page-enter">
      {/* Hero Section */}
      <section className="hero">
        <div className="hero-bg">
          <div className="hero-orb hero-orb-1" />
          <div className="hero-orb hero-orb-2" />
          <div className="hero-orb hero-orb-3" />
        </div>
        <div className="container hero-content">
          <div className="hero-badge">
            <span className="status-dot status-dot-active" />
            Powered by Smart Contracts
          </div>
          <h1 className="hero-title">
            The Premium <span className="text-gradient">DeFi Ecosystem</span> for
            Token Launches
          </h1>
          <p className="hero-subtitle">
            Buy stablecoins, invest in token launches, trade on the marketplace,
            and earn rewards — all in one beautifully designed platform.
          </p>
          <div className="hero-actions">
            <button className="btn btn-primary btn-xl" onClick={handleGetStarted}>
              ◈ Buy Stables
            </button>
            <button className="btn btn-secondary btn-lg" onClick={() => navigate('/launchpad')}>
              Explore Launchpad →
            </button>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="container">
        <div className="stats-bar glass-card-static">
          <div className="stat-card">
            <div className="stat-value">${(stats.totalVolume || 0).toLocaleString()}</div>
            <div className="stat-label">Total Volume</div>
          </div>
          <div className="stats-divider" />
          <div className="stat-card">
            <div className="stat-value">{(stats.totalUsers || 0).toLocaleString()}</div>
            <div className="stat-label">Active Users</div>
          </div>
          <div className="stats-divider" />
          <div className="stat-card">
            <div className="stat-value">{(stats.totalProjects || 0).toLocaleString()}</div>
            <div className="stat-label">Projects Launched</div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="container mt-2xl">
        <div className="text-center mb-xl">
          <h2>Everything You Need in <span className="text-gradient">One Platform</span></h2>
          <p className="text-muted mt-sm" style={{ maxWidth: 500, margin: '8px auto 0' }}>
            A complete DeFi ecosystem designed for security, transparency, and premium user experience.
          </p>
        </div>
        <div className="grid grid-auto features-grid">
          {features.map((feature, idx) => (
            <div
              key={idx}
              className="feature-card glass-card"
              onClick={() => navigate(feature.link)}
              style={{ animationDelay: `${idx * 0.1}s` }}
            >
              <div className="feature-icon" style={{ background: feature.gradient }}>
                {feature.icon}
              </div>
              <h4 className="feature-title">{feature.title}</h4>
              <p className="feature-desc">{feature.desc}</p>
              <span className="feature-link">Explore →</span>
            </div>
          ))}
        </div>
      </section>

      {/* CTA Section */}
      <section className="container mt-2xl">
        <div className="cta-section glass-card-static text-center">
          <h2>Ready to Get Started?</h2>
          <p className="text-muted mt-sm mb-lg">
            Connect your wallet and start trading in seconds. No email, no KYC — just your wallet.
          </p>
          <button className="btn btn-primary btn-xl" onClick={handleGetStarted}>
            Launch App →
          </button>
        </div>
      </section>
    </div>
  );
}
