import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import './QRCodeGenerator.css';

export default function QRCodeGenerator({ value, size = 200 }) {
  const canvasRef = useRef(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (canvasRef.current && value) {
      QRCode.toCanvas(canvasRef.current, value, {
        width: size,
        margin: 2,
        color: {
          dark: '#e8e8ff',
          light: '#0a0e27',
        },
      });
    }
  }, [value, size]);

  const copyLink = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="qrcode-wrapper">
      <div className="qrcode-container">
        <canvas ref={canvasRef} />
      </div>
      <div className="qrcode-link">
        <input
          className="form-input qrcode-input"
          value={value || ''}
          readOnly
        />
        <button className="btn btn-secondary btn-sm" onClick={copyLink}>
          {copied ? '✓ Copied' : '📋 Copy'}
        </button>
      </div>
    </div>
  );
}
