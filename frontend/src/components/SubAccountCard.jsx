import ProgressBar from './ProgressBar';
import './SubAccountCard.css';

export default function SubAccountCard({ subAccount, onWithdraw }) {
  const {
    principal = 0,
    yieldAccrued = 0,
    createdAt,
    maturityDate,
    status = 'Active',
    dailyApy = 0,
  } = subAccount || {};

  const now = Date.now();
  const created = new Date(createdAt).getTime();
  const maturity = new Date(maturityDate).getTime();
  const totalDuration = maturity - created;
  const elapsed = Math.min(now - created, totalDuration);
  const progress = totalDuration > 0 ? (elapsed / totalDuration) * 100 : 100;

  const isMature = now >= maturity;
  const statusLabel = status || (isMature ? 'Mature' : 'Active');

  const statusClass = {
    Active: 'badge-info',
    Mature: 'badge-success',
    Withdrawn: 'badge-warning',
  }[statusLabel] || 'badge-info';

  return (
    <div className="subaccount-card glass-card">
      <div className="subaccount-header">
        <span className={`badge ${statusClass}`}>{statusLabel}</span>
        <span className="subaccount-apy">
          {dailyApy}% <span className="text-muted">daily APY</span>
        </span>
      </div>

      <div className="subaccount-balances">
        <div className="subaccount-balance">
          <span className="subaccount-balance-label">Principal</span>
          <span className="subaccount-balance-value">
            ${Number(principal).toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </span>
        </div>
        <div className="subaccount-balance">
          <span className="subaccount-balance-label">Yield Accrued</span>
          <span className="subaccount-balance-value subaccount-yield">
            +${Number(yieldAccrued).toLocaleString(undefined, { minimumFractionDigits: 4 })}
          </span>
        </div>
      </div>

      <ProgressBar
        value={progress}
        max={100}
        label="Maturity Progress"
        color={isMature ? 'green' : undefined}
      />

      <div className="subaccount-dates">
        <div className="subaccount-date">
          <span className="text-muted">Created</span>
          <span>{createdAt ? new Date(createdAt).toLocaleDateString() : '—'}</span>
        </div>
        <div className="subaccount-date">
          <span className="text-muted">Matures</span>
          <span>{maturityDate ? new Date(maturityDate).toLocaleDateString() : '—'}</span>
        </div>
      </div>

      {statusLabel !== 'Withdrawn' && (
        <button
          className={`btn w-full ${isMature ? 'btn-success' : 'btn-secondary'}`}
          onClick={() => onWithdraw?.(subAccount)}
        >
          {isMature ? 'Withdraw (No Penalty)' : 'Early Withdraw'}
        </button>
      )}
    </div>
  );
}
