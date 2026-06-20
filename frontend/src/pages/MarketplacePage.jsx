import { useState, useEffect, useCallback } from 'react';
import { useWallet } from '../context/WalletContext';
import { useToast } from '../components/Toast';
import { getListings, listTokens, buyListing, cancelListing, getVesting, getTokenBalance } from '../services/api';
import OrderBook from '../components/OrderBook';
import ConfirmationDialog from '../components/ConfirmationDialog';
import WalletConfirmDialog from '../components/WalletConfirmDialog';
import './MarketplacePage.css';

export default function MarketplacePage() {
  const { account, isConnected } = useWallet();
  const toast = useToast();

  const [listings, setListings] = useState([]);
  const [myTokens, setMyTokens] = useState([]);
  const [tokenBalance, setTokenBalance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [listModal, setListModal] = useState(null);
  const [listForm, setListForm] = useState({ amount: '', pricePerToken: '' });
  const [submitting, setSubmitting] = useState(false);
  const [confirmBuy, setConfirmBuy] = useState(null);
  const [walletConfirm, setWalletConfirm] = useState(null);
  const [activeTab, setActiveTab] = useState('orderbook');
  const [lastTradeResult, setLastTradeResult] = useState(null);

  const fetchListings = useCallback(async () => {
    try {
      const data = await getListings();
      setListings(data.listings || data || []);
    } catch {
      setListings([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchMyTokens = useCallback(async () => {
    if (!account) return;
    try {
      const [vestingData, balanceData] = await Promise.all([
        getVesting(account).catch(() => ({ vestings: [] })),
        getTokenBalance(account).catch(() => ({ sxpBalance: 0, holdings: [] })),
      ]);

      // Combine vested positions and claimed token balance
      const vestings = vestingData.vestings || [];
      setMyTokens(vestings);
      setTokenBalance(balanceData);
    } catch {
      setMyTokens([]);
      setTokenBalance(null);
    }
  }, [account]);

  useEffect(() => {
    fetchListings();
    if (account) fetchMyTokens();
  }, [account, fetchListings, fetchMyTokens]);

  // Polling for real-time updates
  useEffect(() => {
    const interval = setInterval(() => {
      fetchListings();
      if (account) fetchMyTokens();
    }, 15000);
    return () => clearInterval(interval);
  }, [fetchListings, fetchMyTokens, account]);

  const handleList = async () => {
    if (!listForm.amount || !listForm.pricePerToken) {
      toast.error('Fill in all fields');
      return;
    }

    const amount = Number(listForm.amount);
    const price = Number(listForm.pricePerToken);

    // Show wallet confirmation
    setWalletConfirm({
      action: 'List Tokens for Sale',
      details: [
        { label: 'Token Amount', value: `${amount.toLocaleString()} SXP` },
        { label: 'Price per Token', value: `$${price.toFixed(2)}` },
        { label: 'Total Listing Value', value: `$${(amount * price).toLocaleString(undefined, { minimumFractionDigits: 2 })}` },
      ],
      onConfirm: async () => {
        setWalletConfirm(null);
        setSubmitting(true);
        try {
          await listTokens({
            wallet: account,
            tokenId: listModal?.id,
            amount,
            pricePerToken: price,
          });
          toast.success(`Listed ${amount.toLocaleString()} tokens at $${price.toFixed(2)} each`);
          setListModal(null);
          setListForm({ amount: '', pricePerToken: '' });
          setActiveTab('orderbook');
          fetchListings();
          fetchMyTokens();
        } catch (err) {
          toast.error(err.message);
        } finally {
          setSubmitting(false);
        }
      },
    });
  };

  const handleBuy = (listing) => {
    const total = Number(listing.amount) * Number(listing.pricePerToken);

    // Show wallet confirmation instead of plain dialog
    setWalletConfirm({
      action: 'Buy Tokens',
      details: [
        { label: 'Seller', value: listing.seller ? `${listing.seller.slice(0, 6)}...${listing.seller.slice(-4)}` : '—' },
        { label: 'Token Amount', value: `${Number(listing.amount).toLocaleString()} SXP` },
        { label: 'Price per Token', value: `$${Number(listing.pricePerToken).toFixed(2)}` },
        { label: 'Total Cost', value: `$${total.toLocaleString(undefined, { minimumFractionDigits: 2 })}` },
      ],
      onConfirm: async () => {
        setWalletConfirm(null);
        setSubmitting(true);
        try {
          const result = await buyListing({
            wallet: account,
            listingId: listing.id,
          });
          toast.success(`Purchased ${Number(listing.amount).toLocaleString()} tokens for $${total.toLocaleString(undefined, { minimumFractionDigits: 2 })}!`);
          setLastTradeResult({
            type: 'buy',
            amount: listing.amount,
            price: total,
            balance: result.buyerBalance,
          });
          fetchListings();
          fetchMyTokens();
        } catch (err) {
          toast.error(err.message);
        } finally {
          setSubmitting(false);
        }
      },
    });
  };

  const handleCancel = async (listing) => {
    try {
      await cancelListing({ wallet: account, listingId: listing.id });
      toast.success('Listing cancelled — tokens returned to your balance');
      fetchListings();
      fetchMyTokens();
    } catch (err) {
      toast.error(err.message);
    }
  };

  // Determine claimable SXP balance for listing
  const sxpBalance = tokenBalance?.sxpBalance || 0;

  return (
    <div className="marketplace-page page-enter container">
      <div className="page-header">
        <h1 className="page-title">Token <span className="text-gradient">Marketplace</span></h1>
        <p className="page-subtitle">Buy and sell tokens on the secondary market</p>
      </div>

      <div className="tabs mb-xl">
        <button className={`tab ${activeTab === 'orderbook' ? 'active' : ''}`} onClick={() => setActiveTab('orderbook')}>
          Order Book {listings.length > 0 && <span className="tab-badge">{listings.length}</span>}
        </button>
        {isConnected && (
          <button className={`tab ${activeTab === 'mytokens' ? 'active' : ''}`} onClick={() => setActiveTab('mytokens')}>
            My Tokens
          </button>
        )}
      </div>

      {/* Trade Result Banner */}
      {lastTradeResult && (
        <div className="trade-result-banner glass-card mb-lg">
          <div className="trade-result-icon">✅</div>
          <div className="trade-result-info">
            <div className="trade-result-title">Trade Successful</div>
            <div className="trade-result-detail">
              {lastTradeResult.type === 'buy'
                ? `Bought ${Number(lastTradeResult.amount).toLocaleString()} SXP`
                : `Sold tokens`}
              {lastTradeResult.balance && (
                <span className="trade-result-balance">
                  &nbsp;• New SXP Balance: <strong>{Number(lastTradeResult.balance.sxpBalance).toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong>
                </span>
              )}
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => setLastTradeResult(null)}>✕</button>
        </div>
      )}

      {activeTab === 'orderbook' && (
        <OrderBook
          listings={listings}
          onBuy={handleBuy}
          onCancel={handleCancel}
          currentWallet={account}
          loading={loading}
        />
      )}

      {activeTab === 'mytokens' && (
        <div className="section">
          <div className="marketplace-warning glass-card mb-lg">
            <span>⚠</span>
            <span>Buyers inherit the remaining vesting schedule on purchased tokens.</span>
          </div>

          {/* SXP Balance Card */}
          {sxpBalance > 0 && (
            <div className="sxp-balance-card glass-card mb-lg">
              <div className="sxp-balance-header">
                <div>
                  <div className="sxp-balance-label text-muted">Available SXP Balance</div>
                  <div className="sxp-balance-value">{Number(sxpBalance).toLocaleString(undefined, { maximumFractionDigits: 2 })} <span className="text-muted">SXP</span></div>
                </div>
                <button
                  className="btn btn-primary"
                  onClick={() => setListModal({ id: 'sxp-balance', projectName: 'SXP Token Balance', amount: sxpBalance, tokenSymbol: 'SXP' })}
                >
                  List for Sale
                </button>
              </div>
            </div>
          )}

          {/* Vested Token Positions */}
          {myTokens.length > 0 ? (
            <>
              <h3 className="section-title mb-md">Vested Positions</h3>
              <div className="grid grid-auto">
                {myTokens.map((token, idx) => (
                  <div key={token.id || idx} className="glass-card">
                    <div className="flex justify-between items-center mb-md">
                      <h4>{token.projectName || token.tokenSymbol || 'Token'}</h4>
                      <span className="badge badge-info">{Number(token.amount).toLocaleString()} tokens</span>
                    </div>
                    {token.status === 'active' && (
                      <div className="text-muted" style={{ fontSize: 'var(--font-xs)', marginBottom: 'var(--space-sm)' }}>
                        Vesting in progress — claim from Launchpad first to list
                      </div>
                    )}
                    <button
                      className="btn btn-secondary w-full"
                      onClick={() => setListModal(token)}
                      disabled={token.status === 'active'}
                    >
                      {token.status === 'active' ? 'Still Vesting' : 'List for Sale'}
                    </button>
                  </div>
                ))}
              </div>
            </>
          ) : sxpBalance <= 0 ? (
            <div className="glass-card-static empty-state">
              <div className="empty-state-icon">⬡</div>
              <div className="empty-state-title">No Tokens to Sell</div>
              <div className="empty-state-message">Purchase and claim tokens from the Launchpad to list them here.</div>
            </div>
          ) : null}
        </div>
      )}

      {/* List Modal */}
      {listModal && (
        <div className="modal-overlay" onClick={() => setListModal(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">List Tokens for Sale</h3>
              <button className="modal-close" onClick={() => setListModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group mb-md">
                <label className="form-label">Token Amount</label>
                <input
                  className="form-input"
                  type="number"
                  placeholder="e.g. 500"
                  value={listForm.amount}
                  onChange={(e) => setListForm({ ...listForm, amount: e.target.value })}
                  min="0"
                  max={listModal.amount}
                />
                <span className="form-hint">Available: {Number(listModal.amount).toLocaleString()} {listModal.tokenSymbol || 'SXP'}</span>
              </div>
              <div className="form-group mb-md">
                <label className="form-label">Price per Token (USD)</label>
                <input
                  className="form-input"
                  type="number"
                  step="0.01"
                  placeholder="e.g. 1.50"
                  value={listForm.pricePerToken}
                  onChange={(e) => setListForm({ ...listForm, pricePerToken: e.target.value })}
                />
              </div>
              {listForm.amount && listForm.pricePerToken && (
                <div className="list-summary glass-card" style={{ padding: 'var(--space-md)' }}>
                  <div className="flex justify-between mb-sm">
                    <span className="text-muted">Tokens to List</span>
                    <span style={{ fontWeight: 'var(--weight-semibold)' }}>
                      {Number(listForm.amount).toLocaleString()} {listModal.tokenSymbol || 'SXP'}
                    </span>
                  </div>
                  <div className="flex justify-between mb-sm">
                    <span className="text-muted">Price per Token</span>
                    <span>${Number(listForm.pricePerToken).toFixed(2)}</span>
                  </div>
                  <div className="purchase-divider" />
                  <div className="flex justify-between">
                    <span className="text-muted">Total Listing Value</span>
                    <span style={{ fontWeight: 'var(--weight-extrabold)', color: 'var(--color-success)' }}>
                      ${(Number(listForm.amount) * Number(listForm.pricePerToken)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setListModal(null)}>Cancel</button>
              <button
                className={`btn btn-primary ${submitting ? 'btn-loading' : ''}`}
                onClick={handleList}
                disabled={submitting || !listForm.amount || !listForm.pricePerToken}
              >
                {!submitting && 'List for Sale'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Wallet Confirmation Dialog */}
      {walletConfirm && (
        <WalletConfirmDialog
          isOpen={true}
          action={walletConfirm.action}
          details={walletConfirm.details}
          onConfirm={walletConfirm.onConfirm}
          onCancel={() => setWalletConfirm(null)}
        />
      )}
    </div>
  );
}
