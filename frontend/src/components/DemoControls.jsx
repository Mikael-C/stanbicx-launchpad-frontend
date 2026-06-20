import { useState } from 'react';
import './DemoControls.css';

export default function DemoControls({ vestings = [], onSimulateVesting }) {
  const [collapsed, setCollapsed] = useState(false);
  const [simulating, setSimulating] = useState(null);

  // Only show if ?demo=true
  const params = new URLSearchParams(window.location.search);
  if (params.get('demo') !== 'true') return null;

  const activeVestings = vestings.filter(v => v.status === 'active' || (!v.isFullyVested && v.status !== 'early_exit' && v.status !== 'completed'));

  const handleSimulate = async (id) => {
    setSimulating(id);
    try {
      await onSimulateVesting?.(id);
    } catch (err) {
      console.error('Simulation failed:', err);
    } finally {
      setSimulating(null);
    }
  };

  return (
    <div className={`demo-controls ${collapsed ? 'demo-controls-collapsed' : ''}`}>
      <button className="demo-controls-toggle" onClick={() => setCollapsed(!collapsed)}>
        {collapsed ? '🎮' : '✕'}
      </button>

      {!collapsed && (
        <>
          <div className="demo-controls-header">
            <span className="demo-mode-dot" />
            <span className="demo-mode-label">DEMO MODE</span>
          </div>

          <div className="demo-controls-body">
            <div className="demo-controls-title">⚡ Time Controls</div>
            {activeVestings.length > 0 ? (
              <div className="demo-vesting-list">
                {activeVestings.map((v) => (
                  <div key={v.id || v.purchaseId} className="demo-vesting-item">
                    <span className="demo-vesting-name">{v.projectName || v.tokenSymbol || 'Token'}</span>
                    <button
                      className={`btn btn-sm btn-ghost demo-ff-btn ${simulating === (v.id || v.purchaseId) ? 'btn-loading' : ''}`}
                      onClick={() => handleSimulate(v.id || v.purchaseId)}
                      disabled={simulating !== null}
                    >
                      {simulating !== (v.id || v.purchaseId) && '⏩ Fast-Forward'}
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="demo-no-vestings">No active vestings to simulate</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
