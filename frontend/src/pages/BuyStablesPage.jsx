import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWallet } from '../context/WalletContext';
import { useToast } from '../components/Toast';
import { getQuote, buyStables, checkRegistration } from '../services/api';
import ConfirmationDialog from '../components/ConfirmationDialog';
import './BuyStablesPage.css';

const cryptoOptions = [
  { symbol: 'ETH', name: 'Ethereum', icon: '⟠', color: '#627eea' },
  { symbol: 'BTC', name: 'Bitcoin', icon: '₿', color: '#f7931a' },
  { symbol: 'SOL', name: 'Solana', icon: '◎', color: '#9945ff' },
];

export default function BuyStablesPage() {
  const { account, isConnected, connectWallet } = useWallet();
  const navigate = useNavigate();
  const toast = useToast();

  const [source, setSource] = useState('ETH');
  const [amount, setAmount] = useState('');
  const [quote, setQuote] = useState(null);
  const [loading, setLoading] = useState(false);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [txResult, setTxResult] = useState(null);
  const [registered, setRegistered] = useState(null);

  useEffect(() => {
    if (account) {
      checkRegistration(account)
        .then((res) => setRegistered(res?.registered !== false))
        .catch(() => setRegistered(true));
    }
  }, [account]);

  useEffect(() => {
    if (!amount || Number(amount) <= 0) {
      setQuote(null);
      return;
    }

    const timer = setTimeout(async () => {
      setQuoteLoading(true);
      try {
        const q = await getQuote({ source, amount: Number(amount) });
        // Map backend field to what the UI expects
        setQuote({ ...q, receiveAmount: q.netAmount || q.receiveAmount || 0 });
      } catch (err) {
        setQuote({ receiveAmount: Number(amount) * 0.8276, stablecoin: 'USDC' });
      } finally {
        setQuoteLoading(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [amount, source]);

  const handleBuy = async () => {
    setLoading(true);
    try {
      const result = await buyStables({
        wallet: account,
        source,
        amount: Number(amount),
      });
      // Map backend field to what the UI expects
      setTxResult({ ...result, receiveAmount: result.finalAmount || result.netAmount || result.receiveAmount || 0 });
      setShowConfirm(false);
      toast.success(`Successfully purchased ${quote?.receiveAmount?.toLocaleString() || ''} USDC`);
      setAmount('');
      setQuote(null);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isConnected) {
    return (
      <div className="container page-enter">
        <div className="empty-state">
          <div className="empty-state-icon">◈</div>
          <div className="empty-state-title">Connect Your Wallet</div>
          <div className="empty-state-message">Connect your wallet to buy stablecoins.</div>
          <button className="btn btn-primary btn-lg mt-lg" onClick={connectWallet}>
            ◆ Connect Wallet
          </button>
        </div>
      </div>
    );
  }

  if (registered === false) {
    return (
      <div className="container page-enter">
        <div className="empty-state">
          <div className="empty-state-icon">🔒</div>
          <div className="empty-state-title">Registration Required</div>
          <div className="empty-state-message">You need to register with SXSE before buying stablecoins.</div>
          <button className="btn btn-primary btn-lg mt-lg" onClick={() => navigate('/register')}>
            Register Now →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="buy-stables-page page-enter container-sm">
      <div className="page-header text-center">
        <h1 className="page-title">Buy <span className="text-gradient">Stablecoins</span></h1>
        <p className="page-subtitle" style={{ margin: '0 auto' }}>Convert cryptocurrency to USDC with the best rates</p>
      </div>

      {txResult ? (
        <div className="buy-success glass-card text-center">
          <div className="buy-success-icon">✓</div>
          <h3>Purchase Successful!</h3>
          <p className="text-muted mt-sm">Your USDC has been credited to your account.</p>
          <div className="buy-success-details glass-card mt-lg">
            <div className="flex justify-between">
              <span className="text-muted">Amount Received</span>
              <span className="buy-success-amount">${Number(txResult.receiveAmount || quote?.receiveAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })} USDC</span>
            </div>
            {txResult.txHash && (
              <div className="flex justify-between mt-sm">
                <span className="text-muted">Transaction</span>
                <span className="buy-success-hash">{txResult.txHash.slice(0, 10)}...{txResult.txHash.slice(-8)}</span>
              </div>
            )}
          </div>
          <div className="flex gap-md mt-lg" style={{ justifyContent: 'center' }}>
            <button className="btn btn-primary" onClick={() => setTxResult(null)}>Buy More</button>
            <button className="btn btn-secondary" onClick={() => navigate('/dashboard')}>Go to Dashboard</button>
          </div>
        </div>
      ) : (
        <div className="buy-form glass-card-static">
          {/* Source Selector */}
          <div className="form-group mb-lg">
            <label className="form-label">Pay With</label>
            <div className="crypto-selector">
              {cryptoOptions.map((crypto) => (
                <button
                  key={crypto.symbol}
                  className={`crypto-option ${source === crypto.symbol ? 'crypto-option-active' : ''}`}
                  onClick={() => setSource(crypto.symbol)}
                >
                  <span className="crypto-icon" style={{ color: crypto.color }}>{crypto.icon}</span>
                  <span className="crypto-name">{crypto.name}</span>
                  <span className="crypto-symbol">{crypto.symbol}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Amount Input */}
          <div className="form-group mb-lg">
            <label className="form-label">Amount (USD)</label>
            <div className="amount-input-wrapper">
              <span className="amount-prefix">$</span>
              <input
                className="form-input amount-input"
                type="number"
                placeholder="1,000.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                min="0"
                step="any"
              />
            </div>
          </div>

          {/* Quote Display */}
          {amount && Number(amount) > 0 && (
            <div className="quote-display glass-card mb-lg">
              <div className="quote-label">You will receive</div>
              {quoteLoading ? (
                <div className="skeleton" style={{ height: 36, width: 200, margin: '0 auto' }} />
              ) : (
                <div className="quote-amount">
                  ${Number(quote?.receiveAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  <span className="quote-currency">USDC</span>
                </div>
              )}
            </div>
          )}

          <button
            className={`btn btn-primary btn-lg w-full ${loading ? 'btn-loading' : ''}`}
            onClick={() => setShowConfirm(true)}
            disabled={!amount || Number(amount) <= 0 || quoteLoading || loading}
          >
            {!loading && '◈ Buy Stablecoins'}
          </button>
        </div>
      )}

      <ConfirmationDialog
        isOpen={showConfirm}
        title="Confirm Purchase"
        message={`You will receive ${Number(quote?.receiveAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })} USDC. Confirm?`}
        confirmText="Confirm Purchase"
        onConfirm={handleBuy}
        onCancel={() => setShowConfirm(false)}
        loading={loading}
      />
    </div>
  );
}
