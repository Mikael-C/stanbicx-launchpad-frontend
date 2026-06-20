import { useState } from 'react';
import './ConfirmationDialog.css';

export default function ConfirmationDialog({
  isOpen,
  title = 'Confirm Action',
  message,
  warning,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
  loading = false,
  danger = false,
  requireCheck = false,
  checkMessage = 'I understand and accept the risks',
}) {
  const [checked, setChecked] = useState(false);

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (requireCheck && !checked) return;
    onConfirm?.();
  };

  const handleClose = () => {
    setChecked(false);
    onCancel?.();
  };

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content confirmation-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">
            {danger && <span className="confirmation-danger-icon">⚠</span>}
            {title}
          </h3>
          <button className="modal-close" onClick={handleClose}>✕</button>
        </div>

        <div className="modal-body">
          <p className="confirmation-message">{message}</p>
          {warning && (
            <div className="confirmation-warning">
              <span className="confirmation-warning-icon">⚠</span>
              <span>{warning}</span>
            </div>
          )}

          {requireCheck && (
            <label className="checkbox-wrapper confirmation-check">
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => setChecked(e.target.checked)}
              />
              <span className="checkbox-label">{checkMessage}</span>
            </label>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={handleClose} disabled={loading}>
            {cancelText}
          </button>
          <button
            className={`btn ${danger ? 'btn-danger' : 'btn-primary'} ${loading ? 'btn-loading' : ''}`}
            onClick={handleConfirm}
            disabled={loading || (requireCheck && !checked)}
          >
            {!loading && confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
