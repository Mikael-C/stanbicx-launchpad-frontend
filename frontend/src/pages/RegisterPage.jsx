import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useWallet } from '../context/WalletContext';
import { useToast } from '../components/Toast';
import { registerUser } from '../services/api';
import './RegisterPage.css';

const steps = [
  { title: 'Connect Wallet', icon: '◆', desc: 'Connect your MetaMask wallet to get started' },
  { title: 'Device Attestation', icon: '🔒', desc: 'Verify your device for enhanced security' },
  { title: 'Security Setup', icon: '🛡', desc: 'Set up passcode & biometric authentication' },
  { title: 'Referral (Optional)', icon: '⟐', desc: 'Enter a referral code if you have one' },
];

export default function RegisterPage() {
  const [currentStep, setCurrentStep] = useState(0);
  const [referralCode, setReferralCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [complete, setComplete] = useState(false);
  const [searchParams] = useSearchParams();
  const { isConnected, account, connectWallet } = useWallet();
  const navigate = useNavigate();
  const toast = useToast();

  useEffect(() => {
    const ref = searchParams.get('ref');
    if (ref) setReferralCode(ref);
  }, [searchParams]);

  useEffect(() => {
    if (isConnected && currentStep === 0) {
      setCurrentStep(1);
    }
  }, [isConnected, currentStep]);

  const handleConnect = async () => {
    try {
      await connectWallet();
      setCurrentStep(1);
    } catch (err) {
      toast.error(err.message || 'Failed to connect wallet');
    }
  };

  const handleDeviceAttestation = () => {
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setCurrentStep(2);
      toast.success('Device verified successfully');
    }, 2000);
  };

  const handleSecuritySetup = () => {
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setCurrentStep(3);
      toast.success('Security configured');
    }, 1500);
  };

  const handleComplete = async () => {
    setLoading(true);
    try {
      await registerUser({
        wallet: account,
        referralCode: referralCode || undefined,
      });
      setComplete(true);
      toast.success('Registration complete! Welcome to SX Launchpad.');
      setTimeout(() => navigate('/dashboard'), 2000);
    } catch (err) {
      toast.error(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  if (complete) {
    return (
      <div className="register-page page-enter container-sm">
        <div className="register-complete glass-card text-center">
          <div className="register-complete-icon">✓</div>
          <h2>Welcome to SX Launchpad!</h2>
          <p className="text-muted mt-sm">Your account has been created successfully. Redirecting...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="register-page page-enter container-sm">
      <div className="page-header text-center">
        <h1 className="page-title">Join <span className="text-gradient">SX Launchpad</span></h1>
        <p className="page-subtitle" style={{ margin: '0 auto' }}>Complete registration in a few simple steps</p>
      </div>

      {/* Progress Steps */}
      <div className="register-steps">
        {steps.map((step, idx) => (
          <div
            key={idx}
            className={`register-step ${idx === currentStep ? 'register-step-active' : ''} ${idx < currentStep ? 'register-step-done' : ''}`}
          >
            <div className="register-step-number">
              {idx < currentStep ? '✓' : idx + 1}
            </div>
            <div className="register-step-info">
              <span className="register-step-title">{step.title}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Step Content */}
      <div className="register-content glass-card-static">
        <div className="register-step-header">
          <span className="register-step-icon">{steps[currentStep].icon}</span>
          <div>
            <h3>{steps[currentStep].title}</h3>
            <p className="text-muted">{steps[currentStep].desc}</p>
          </div>
        </div>

        {currentStep === 0 && (
          <div className="register-step-body">
            <p className="mb-lg">Connect your MetaMask wallet to create your SXSE identity.</p>
            <button className="btn btn-primary btn-lg w-full" onClick={handleConnect}>
              ◆ Connect MetaMask
            </button>
          </div>
        )}

        {currentStep === 1 && (
          <div className="register-step-body">
            <p className="mb-lg">We'll verify your device to ensure secure access. This process generates a unique device fingerprint.</p>
            <div className="register-device-info glass-card">
              <div className="flex items-center gap-md">
                <span className="status-dot status-dot-active" />
                <span>Device detected: {navigator.userAgent.split('(')[1]?.split(')')[0] || 'Desktop Browser'}</span>
              </div>
            </div>
            <button
              className={`btn btn-primary btn-lg w-full mt-lg ${loading ? 'btn-loading' : ''}`}
              onClick={handleDeviceAttestation}
              disabled={loading}
            >
              {!loading && '🔒 Verify Device'}
            </button>
          </div>
        )}

        {currentStep === 2 && (
          <div className="register-step-body">
            <p className="mb-lg">Configure your security preferences for transaction signing.</p>
            <div className="register-security-options">
              <label className="register-security-option glass-card">
                <input type="radio" name="security" defaultChecked />
                <div>
                  <strong>Wallet Signature</strong>
                  <span className="text-muted"> — Sign transactions with MetaMask</span>
                </div>
              </label>
              <label className="register-security-option glass-card">
                <input type="radio" name="security" />
                <div>
                  <strong>Hardware Key</strong>
                  <span className="text-muted"> — Use a hardware security key</span>
                </div>
              </label>
            </div>
            <button
              className={`btn btn-primary btn-lg w-full mt-lg ${loading ? 'btn-loading' : ''}`}
              onClick={handleSecuritySetup}
              disabled={loading}
            >
              {!loading && '🛡 Configure Security'}
            </button>
          </div>
        )}

        {currentStep === 3 && (
          <div className="register-step-body">
            <p className="mb-lg">Have a referral code? Enter it below to earn bonus rewards.</p>
            <div className="form-group mb-lg">
              <label className="form-label">Referral Code (Optional)</label>
              <input
                className="form-input"
                type="text"
                value={referralCode}
                onChange={(e) => setReferralCode(e.target.value)}
                placeholder="Enter referral code..."
              />
            </div>
            <button
              className={`btn btn-primary btn-lg w-full ${loading ? 'btn-loading' : ''}`}
              onClick={handleComplete}
              disabled={loading}
            >
              {!loading && '✓ Complete Registration'}
            </button>
            <button
              className="btn btn-ghost w-full mt-sm"
              onClick={handleComplete}
              disabled={loading}
            >
              Skip & Complete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
