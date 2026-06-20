import './ProgressBar.css';

export default function ProgressBar({ value = 0, max = 100, label, showPercent = true, size = 'default', color }) {
  const percent = Math.min(100, Math.max(0, (value / max) * 100));

  return (
    <div className="progress-container">
      {(label || showPercent) && (
        <div className="progress-label">
          <span>{label || ''}</span>
          {showPercent && <span className="progress-percent">{percent.toFixed(1)}%</span>}
        </div>
      )}
      <div className={`progress-bar ${size === 'large' ? 'progress-bar-lg' : ''}`}>
        <div
          className={`progress-fill ${color ? `progress-fill-${color}` : ''}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
