import { NavLink, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import WalletConnector from './WalletConnector';
import { useWallet } from '../context/WalletContext';
import './Navbar.css';

const navLinks = [
  { to: '/dashboard', label: 'Dashboard', icon: '◫' },
  { to: '/buy-stables', label: 'Buy Stables', icon: '◈' },
  { to: '/launchpad', label: 'Launchpad', icon: '▲' },
  { to: '/marketplace', label: 'Marketplace', icon: '⬡' },
  { to: '/referrals', label: 'Referrals', icon: '⟐' },
  { to: '/leaderboard', label: 'Leaderboard', icon: '★' },
  { to: '/events', label: 'Events', icon: '⧉' },
];

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();
  const { isConnected } = useWallet();

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [location]);

  const envLabel = import.meta.env.VITE_ENV_LABEL;

  return (
    <nav className={`navbar ${scrolled ? 'navbar-scrolled' : ''}`}>
      <div className="navbar-inner">
        <NavLink to="/" className="navbar-logo">
          <span className="logo-icon">◆</span>
          <span className="logo-text">
            <span className="text-gradient">SX</span> Launchpad
          </span>
          {envLabel && (
            <span className="staging-badge">{envLabel}</span>
          )}
        </NavLink>

        <div className={`navbar-links ${mobileOpen ? 'navbar-links-open' : ''}`}>
          {navLinks.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            >
              <span className="nav-link-icon">{link.icon}</span>
              {link.label}
            </NavLink>
          ))}
          {isConnected && (
            <>
              <NavLink
                to="/admin"
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
              >
                <span className="nav-link-icon">⚙</span>
                Admin
              </NavLink>
              <NavLink
                to="/ai-chat"
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
              >
                <span className="nav-link-icon">◉</span>
                AI Chat
              </NavLink>
            </>
          )}
        </div>

        <div className="navbar-actions">
          <WalletConnector />
          <button
            className={`hamburger ${mobileOpen ? 'hamburger-open' : ''}`}
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle menu"
          >
            <span />
            <span />
            <span />
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="mobile-backdrop" onClick={() => setMobileOpen(false)} />
      )}
    </nav>
  );
}
