import { useState, useEffect } from 'react';
import './WalletConfirmDialog.css';

export default function WalletConfirmDialog({ isOpen, action = 'Transaction', details = [], onConfirm, onCancel, loading = false }) {
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!isOpen) setConfirming(false);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    setConfirming(true);
    await onConfirm?.();
    setConfirming(false);
  };

  const isLoading = loading || confirming;

  return (
    <div className="modal-overlay wallet-confirm-overlay" onClick={onCancel}>
      <div className="wallet-confirm-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="wallet-confirm-header">
          <div className="wallet-confirm-network">
            <span className="wallet-network-dot" />
            <span>SX Network</span>
          </div>
          <div className="wallet-confirm-icon">🔐</div>
          <h3 className="wallet-confirm-title">{action}</h3>
        </div>

        <div className="wallet-confirm-body">
          <div className="wallet-confirm-details">
            {details.map((d, i) => (
              <div key={i} className="wallet-confirm-row">
                <span className="wallet-confirm-label">{d.label}</span>
                <span className="wallet-confirm-value">{d.value}</span>
              </div>
            ))}
            <div className="wallet-confirm-divider" />
            <div className="wallet-confirm-row wallet-confirm-gas">
              <span className="wallet-confirm-label">Est. Gas Fee</span>
              <span className="wallet-confirm-value">~$0.12</span>
            </div>
          </div>
        </div>

        <div className="wallet-confirm-footer">
          <button className="btn btn-secondary" onClick={onCancel} disabled={isLoading}>
            Reject
          </button>
          <button
            className={`btn btn-primary ${isLoading ? 'btn-loading' : ''}`}
            onClick={handleConfirm}
            disabled={isLoading}
          >
            {!isLoading && 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}
