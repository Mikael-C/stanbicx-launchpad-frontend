import { useState, useEffect, useMemo } from 'react';
import './CountdownTimer.css';

export default function CountdownTimer({ targetDate, onComplete, label }) {
  const target = useMemo(() => new Date(targetDate).getTime(), [targetDate]);
  const [timeLeft, setTimeLeft] = useState(calculateTimeLeft());

  function calculateTimeLeft() {
    const diff = target - Date.now();
    if (diff <= 0) return null;

    return {
      days: Math.floor(diff / (1000 * 60 * 60 * 24)),
      hours: Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
      minutes: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
      seconds: Math.floor((diff % (1000 * 60)) / 1000),
      totalMs: diff,
    };
  }

  useEffect(() => {
    const timer = setInterval(() => {
      const tl = calculateTimeLeft();
      setTimeLeft(tl);
      if (!tl) {
        clearInterval(timer);
        onComplete?.();
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [target]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!timeLeft) {
    return (
      <div className="countdown countdown-complete">
        {label && <div className="countdown-label">{label}</div>}
        <div className="countdown-units">
          <div className="countdown-unit countdown-unit-glow">
            <span className="countdown-value">✓</span>
            <span className="countdown-name">Complete</span>
          </div>
        </div>
      </div>
    );
  }

  const isUrgent = timeLeft.totalMs < 24 * 60 * 60 * 1000;

  return (
    <div className={`countdown ${isUrgent ? 'countdown-urgent' : ''}`}>
      {label && <div className="countdown-label">{label}</div>}
      <div className="countdown-units">
        <div className="countdown-unit">
          <span className="countdown-value">{String(timeLeft.days).padStart(2, '0')}</span>
          <span className="countdown-name">Days</span>
        </div>
        <span className="countdown-separator">:</span>
        <div className="countdown-unit">
          <span className="countdown-value">{String(timeLeft.hours).padStart(2, '0')}</span>
          <span className="countdown-name">Hrs</span>
        </div>
        <span className="countdown-separator">:</span>
        <div className="countdown-unit">
          <span className="countdown-value">{String(timeLeft.minutes).padStart(2, '0')}</span>
          <span className="countdown-name">Min</span>
        </div>
        <span className="countdown-separator">:</span>
        <div className="countdown-unit">
          <span className="countdown-value countdown-seconds">{String(timeLeft.seconds).padStart(2, '0')}</span>
          <span className="countdown-name">Sec</span>
        </div>
      </div>
    </div>
  );
}
