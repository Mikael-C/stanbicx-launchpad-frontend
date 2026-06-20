import { useState, useRef, useEffect } from 'react';
import { useWallet } from '../context/WalletContext';
import './WalletConnector.css';

export default function WalletConnector() {
  const { account, balance, isConnected, isConnecting, connectWallet, disconnectWallet } = useWallet();
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef(null);

  const truncateAddress = (addr) => {
    if (!addr) return '';
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  const formatBalance = (bal) => {
    const num = parseFloat(bal);
    if (num === 0) return '0.00';
    if (num < 0.001) return '<0.001';
    return num.toFixed(4);
  };

  const copyAddress = () => {
    if (account) {
      navigator.clipboard.writeText(account);
      setShowDropdown(false);
    }
  };

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!isConnected) {
    return (
      <button
        className={`wallet-connect-btn btn-primary ${isConnecting ? 'btn-loading' : ''}`}
        onClick={connectWallet}
        disabled={isConnecting}
      >
        {!isConnecting && (
          <>
            <span className="wallet-icon">◆</span>
            Connect Wallet
          </>
        )}
      </button>
    );
  }

  return (
    <div className="wallet-connected" ref={dropdownRef}>
      <button
        className="wallet-info-btn"
        onClick={() => setShowDropdown(!showDropdown)}
      >
        <div className="wallet-balance">
          <span className="balance-amount">{formatBalance(balance)}</span>
          <span className="balance-symbol">ETH</span>
        </div>
        <div className="wallet-divider" />
        <div className="wallet-address">
          <span className="status-dot status-dot-active" />
          {truncateAddress(account)}
        </div>
      </button>

      {showDropdown && (
        <div className="wallet-dropdown">
          <div className="wallet-dropdown-header">
            <span className="text-muted">Connected</span>
            <span className="wallet-full-addr">{truncateAddress(account)}</span>
          </div>
          <button className="wallet-dropdown-item" onClick={copyAddress}>
            📋 Copy Address
          </button>
          <hr className="divider" />
          <button className="wallet-dropdown-item wallet-disconnect" onClick={() => { disconnectWallet(); setShowDropdown(false); }}>
            ⏻ Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
