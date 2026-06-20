import { useState } from 'react';
import { useWallet } from '../context/WalletContext';
import { useToast } from '../components/Toast';
import { simulateDpopTest, simulateDigCheck } from '../services/api';
import './SecurityDemoPage.css';

// Simulated device info
const LEGIT_DEVICE = {
  fingerprint: 'a1b2c3d4e5f6789012345678abcdef90',
  name: 'Admin Master Device (iPhone 15 Pro)',
  os: 'iOS 18.2',
  browser: 'SX Secure Wallet v3.1',
};

const ATTACKER_DEVICE = {
  fingerprint: 'ff00dead0000beef1234567890abcdef',
  name: 'Unknown Device (Kali Linux)',
  os: 'Linux 6.1',
  browser: 'curl/8.4.0',
};

const DEMO_WALLET = '0x9998d8694e7636f93a52a8330e300a84d67c99d8';

export default function SecurityDemoPage() {
  const { account } = useWallet();
  const toast = useToast();
  const isDemoMode = new URLSearchParams(window.location.search).get('demo') === 'true';
  const activeWallet = isDemoMode ? DEMO_WALLET : account;

  // DIG state
  const [digCompromised, setDigCompromised] = useState(false);
  const [digLoading, setDigLoading] = useState(false);
  const [digResult, setDigResult] = useState(null);

  // DPoP state
  const [dpopLoading, setDpopLoading] = useState(false);
  const [dpopResult, setDpopResult] = useState(null);
  const [dpopStep, setDpopStep] = useState('idle'); // idle, stolen, rejected

  // ─── DIG Handlers ────────────────────────────────────────────────
  const handleDigScan = async (compromised) => {
    setDigLoading(true);
    setDigResult(null);

    // Simulate scan delay
    await new Promise(r => setTimeout(r, 1500));

    try {
      const result = await simulateDigCheck({
        wallet: activeWallet || DEMO_WALLET,
        deviceFingerprint: LEGIT_DEVICE.fingerprint,
        simulateCompromised: compromised,
      });
      setDigResult({ success: true, ...result });
      if (!compromised) {
        toast.success('Device integrity verified — all checks passed');
      }
    } catch (err) {
      // The API will throw on 403 — that's the "compromised" scenario
      setDigCompromised(true);
      setDigResult({
        success: false,
        error: err.data?.message || err.message || 'Device integrity check failed',
        checks: err.data?.checks || null,
      });
      toast.error('🚫 Device compromised — access denied');
    } finally {
      setDigLoading(false);
    }
  };

  const handleDigReset = () => {
    setDigCompromised(false);
    setDigResult(null);
  };

  // ─── DPoP Handlers ──────────────────────────────────────────────
  const handleDpopLegit = async () => {
    setDpopLoading(true);
    setDpopResult(null);
    setDpopStep('idle');

    await new Promise(r => setTimeout(r, 800));

    try {
      const result = await simulateDpopTest({
        wallet: activeWallet || DEMO_WALLET,
        deviceFingerprint: LEGIT_DEVICE.fingerprint,
        method: 'POST',
        uri: '/api/account/withdraw',
      });
      setDpopResult({ success: true, ...result });
      toast.success('Token binding verified — legitimate device');
    } catch (err) {
      setDpopResult({ success: false, error: err.message });
    } finally {
      setDpopLoading(false);
    }
  };

  const handleDpopStolen = async () => {
    setDpopLoading(true);
    setDpopResult(null);
    setDpopStep('stolen');

    // Animate the "interception" phase
    await new Promise(r => setTimeout(r, 1200));
    setDpopStep('rejected');

    try {
      await simulateDpopTest({
        wallet: activeWallet || DEMO_WALLET,
        deviceFingerprint: ATTACKER_DEVICE.fingerprint,
        method: 'POST',
        uri: '/api/account/withdraw',
      });
      // Shouldn't reach here
      setDpopResult({ success: true });
    } catch (err) {
      // Expected 401 — err.data has the full response body
      const data = err.data || {};
      setDpopResult({
        success: false,
        error: data.message || err.message || 'Unauthorized',
        code: data.code || 'DPOP_DEVICE_BINDING_MISMATCH',
        details: data.details || null,
      });
      toast.error('🔒 Unauthorized — stolen token rejected');
    } finally {
      setDpopLoading(false);
    }
  };

  const handleDpopReset = () => {
    setDpopResult(null);
    setDpopStep('idle');
  };

  return (
    <div className="security-demo-page page-enter container">
      {/* DIG Compromised Overlay */}
      {digCompromised && (
        <div className="dig-overlay">
          <div className="dig-overlay-content">
            <div className="dig-overlay-icon">🚫</div>
            <h1 className="dig-overlay-title">Device Compromised</h1>
            <h2 className="dig-overlay-subtitle">Access Denied</h2>
            <p className="dig-overlay-message">
              Device integrity check failed. This device appears to be
              <strong> jailbroken or rooted</strong>. All operations are suspended
              to protect your account.
            </p>

            <div className="dig-overlay-checks">
              <div className="dig-check-item dig-check-failed">
                <span className="dig-check-icon">✕</span>
                <span>Root Detection</span>
                <span className="dig-check-status">FAILED</span>
              </div>
              <div className="dig-check-item dig-check-failed">
                <span className="dig-check-icon">✕</span>
                <span>Signature Verification</span>
                <span className="dig-check-status">FAILED</span>
              </div>
              <div className="dig-check-item dig-check-alert">
                <span className="dig-check-icon">⚠</span>
                <span>Tamper Detection</span>
                <span className="dig-check-status">ALERT</span>
              </div>
              <div className="dig-check-item dig-check-failed">
                <span className="dig-check-icon">✕</span>
                <span>Debugger Attached</span>
                <span className="dig-check-status">DETECTED</span>
              </div>
            </div>

            <div className="dig-overlay-fingerprint">
              <span className="text-muted">Device Fingerprint:</span>
              <code>{LEGIT_DEVICE.fingerprint}</code>
            </div>

            <p className="dig-overlay-contact text-muted">
              Contact your platform administrator to restore access.
            </p>

            {/* Demo-only reset */}
            <button className="btn btn-ghost dig-reset-btn" onClick={handleDigReset}>
              ↩ Reset Demo
            </button>
          </div>
        </div>
      )}

      <div className="page-header">
        <h1 className="page-title">Security <span className="text-gradient">Demo</span></h1>
        <p className="page-subtitle">Device Integrity Guard (DIG) & DPoP Token Binding</p>
      </div>

      <div className="security-demo-grid">
        {/* ─── Panel 1: DIG Detection ──────────────────────────────── */}
        <div className="security-panel glass-card-static">
          <div className="security-panel-header">
            <div className="security-panel-icon security-panel-icon-dig">🛡</div>
            <div>
              <h3>Device Integrity Guard (DIG)</h3>
              <p className="text-muted">Detects jailbroken, rooted, or tampered devices</p>
            </div>
          </div>

          <div className="security-panel-body">
            <div className="device-info-card">
              <div className="device-info-header">
                <span className="device-info-label">Current Device</span>
                <span className="badge badge-success">Registered</span>
              </div>
              <div className="device-info-row">
                <span className="text-muted">Name</span>
                <span>{LEGIT_DEVICE.name}</span>
              </div>
              <div className="device-info-row">
                <span className="text-muted">OS</span>
                <span>{LEGIT_DEVICE.os}</span>
              </div>
              <div className="device-info-row">
                <span className="text-muted">Client</span>
                <span>{LEGIT_DEVICE.browser}</span>
              </div>
              <div className="device-info-row">
                <span className="text-muted">Fingerprint</span>
                <code className="device-fingerprint">{LEGIT_DEVICE.fingerprint.slice(0, 12)}...{LEGIT_DEVICE.fingerprint.slice(-4)}</code>
              </div>
            </div>

            {/* DIG Result */}
            {digResult && digResult.success && (
              <div className="security-result security-result-success">
                <div className="security-result-icon">✓</div>
                <div>
                  <strong>Device Integrity Verified</strong>
                  <p className="text-muted">All checks passed — device is clean.</p>
                </div>
              </div>
            )}

            <div className="security-actions">
              <button
                className={`btn btn-success ${digLoading ? 'btn-loading' : ''}`}
                onClick={() => handleDigScan(false)}
                disabled={digLoading}
              >
                {!digLoading && '✓ Run Integrity Scan'}
              </button>
              <button
                className={`btn btn-danger ${digLoading ? 'btn-loading' : ''}`}
                onClick={() => handleDigScan(true)}
                disabled={digLoading}
              >
                {!digLoading && '⚠ Simulate Compromised Device'}
              </button>
            </div>

            <p className="security-hint text-muted">
              The "Simulate Compromised" button triggers a full-screen blocking overlay,
              as if a jailbroken or rooted device was detected.
            </p>
          </div>
        </div>

        {/* ─── Panel 2: DPoP Token Binding ─────────────────────────── */}
        <div className="security-panel glass-card-static">
          <div className="security-panel-header">
            <div className="security-panel-icon security-panel-icon-dpop">🔐</div>
            <div>
              <h3>DPoP Token Binding</h3>
              <p className="text-muted">Prevents stolen token replay from unauthorized devices</p>
            </div>
          </div>

          <div className="security-panel-body">
            {/* Token info display */}
            <div className="dpop-token-card">
              <div className="dpop-token-header">
                <span className="dpop-token-label">Active Session Token</span>
                <span className="dpop-token-type">DPoP + JWT</span>
              </div>
              <div className="dpop-token-details">
                <div className="device-info-row">
                  <span className="text-muted">Bound Device</span>
                  <code className="device-fingerprint">{LEGIT_DEVICE.fingerprint.slice(0, 12)}...</code>
                </div>
                <div className="device-info-row">
                  <span className="text-muted">Method</span>
                  <span>POST</span>
                </div>
                <div className="device-info-row">
                  <span className="text-muted">Bound URI</span>
                  <code>/api/account/withdraw</code>
                </div>
                <div className="device-info-row">
                  <span className="text-muted">Token Thumbprint (jkt)</span>
                  <code>sha256:kE9p...x4Qm</code>
                </div>
              </div>
            </div>

            {/* DPoP Attack Scenario Visualization */}
            {dpopStep !== 'idle' && (
              <div className="dpop-scenario">
                <div className={`dpop-scenario-step ${dpopStep === 'stolen' || dpopStep === 'rejected' ? 'dpop-step-active' : ''}`}>
                  <div className="dpop-step-indicator dpop-step-danger">1</div>
                  <div className="dpop-step-content">
                    <strong>Attacker intercepts token</strong>
                    <p className="text-muted">Token stolen via network sniffing</p>
                    <div className="attacker-device-info">
                      <span className="text-muted">Attacker Device:</span>{' '}
                      <code>{ATTACKER_DEVICE.name}</code>
                      <br />
                      <span className="text-muted">Fingerprint:</span>{' '}
                      <code>{ATTACKER_DEVICE.fingerprint.slice(0, 12)}...</code>
                    </div>
                  </div>
                </div>
                <div className={`dpop-scenario-step ${dpopStep === 'rejected' ? 'dpop-step-active' : ''}`}>
                  <div className="dpop-step-indicator dpop-step-danger">2</div>
                  <div className="dpop-step-content">
                    <strong>Replay attempt → Server checks DPoP binding</strong>
                    <p className="text-muted">
                      Server compares device fingerprint in token vs. request origin
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* DPoP Result */}
            {dpopResult && (
              <div className={`security-result ${dpopResult.success ? 'security-result-success' : 'security-result-error'}`}>
                <div className="security-result-icon">
                  {dpopResult.success ? '✓' : '✕'}
                </div>
                <div className="security-result-body">
                  <strong>
                    {dpopResult.success ? 'Token Binding Verified' : '401 Unauthorized'}
                  </strong>
                  <p className="text-muted">
                    {dpopResult.success
                      ? 'Device fingerprint matches — request allowed.'
                      : 'DPoP device binding mismatch — token was issued to a different device.'
                    }
                  </p>
                  {dpopResult.details && (
                    <div className="dpop-error-details">
                      <div className="device-info-row">
                        <span className="text-muted">Expected Device</span>
                        <code>{dpopResult.details.expectedDevice}</code>
                      </div>
                      <div className="device-info-row">
                        <span className="text-muted">Request Device</span>
                        <code className="text-danger">{dpopResult.details.requestDevice}</code>
                      </div>
                      <div className="device-info-row">
                        <span className="text-muted">Rejected At</span>
                        <span>{new Date(dpopResult.details.rejectedAt).toLocaleString()}</span>
                      </div>
                    </div>
                  )}
                  {dpopResult.code && (
                    <code className="dpop-error-code">{dpopResult.code}</code>
                  )}
                </div>
              </div>
            )}

            <div className="security-actions">
              <button
                className={`btn btn-success ${dpopLoading ? 'btn-loading' : ''}`}
                onClick={handleDpopLegit}
                disabled={dpopLoading}
              >
                {!dpopLoading && '✓ Verify Legitimate Token'}
              </button>
              <button
                className={`btn btn-danger ${dpopLoading ? 'btn-loading' : ''}`}
                onClick={handleDpopStolen}
                disabled={dpopLoading}
              >
                {!dpopLoading && '🔓 Simulate Stolen Token Replay'}
              </button>
            </div>

            {dpopResult && (
              <button className="btn btn-ghost btn-sm" onClick={handleDpopReset}>
                ↩ Reset
              </button>
            )}

            <p className="security-hint text-muted">
              The "Stolen Token Replay" button sends a request with a mismatched device
              fingerprint. The server detects the mismatch and returns 401 Unauthorized.
            </p>
          </div>
        </div>
      </div>

      {/* How It Works */}
      <div className="section">
        <h3 className="section-title">📖 How These Work</h3>
        <div className="grid grid-2">
          <div className="glass-card-static">
            <h4 style={{ marginBottom: 'var(--space-md)' }}>🛡 DIG — Device Integrity Guard</h4>
            <ol className="how-it-works-list">
              <li>App runs integrity checks on startup (root/jailbreak, tamper detection, debugger scan)</li>
              <li>If any check fails, the device is flagged as <strong>compromised</strong></li>
              <li>All operations are <strong>blocked</strong> — user sees "Device Compromised" overlay</li>
              <li>Device fingerprint is logged to admin audit trail</li>
              <li>Admin must review and clear the flag to restore access</li>
            </ol>
          </div>
          <div className="glass-card-static">
            <h4 style={{ marginBottom: 'var(--space-md)' }}>🔐 DPoP — Demonstrating Proof-of-Possession</h4>
            <ol className="how-it-works-list">
              <li>On login, client generates a key pair and binds it to the access token</li>
              <li>Every API request includes a DPoP proof JWT signed with the private key</li>
              <li>Server verifies the proof matches the token's <code>jkt</code> thumbprint</li>
              <li>If an attacker steals the token, they can't forge the proof without the private key</li>
              <li>Server rejects with <strong>401 Unauthorized</strong> and logs the attempt</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
