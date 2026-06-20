import './KillSwitchBanner.css';

export default function KillSwitchBanner({ isPaused }) {
  if (!isPaused) return null;

  return (
    <div className="killswitch-banner">
      <div className="killswitch-inner">
        <span className="killswitch-icon">⚠</span>
        <span className="killswitch-text">
          Platform Paused — All operations are temporarily suspended by admin
        </span>
        <span className="killswitch-icon">⚠</span>
      </div>
    </div>
  );
}
