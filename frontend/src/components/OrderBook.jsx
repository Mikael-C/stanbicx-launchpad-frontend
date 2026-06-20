import './OrderBook.css';

export default function OrderBook({ listings = [], onBuy, onCancel, currentWallet, loading }) {
  if (loading) {
    return (
      <div className="orderbook glass-card-static">
        <div className="orderbook-header">
          <h4>Order Book</h4>
          <span className="orderbook-live">
            <span className="status-dot status-dot-active" /> Live
          </span>
        </div>
        <div className="orderbook-loading">
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton" style={{ height: 48, marginBottom: 8 }} />
          ))}
        </div>
      </div>
    );
  }

  if (!listings || listings.length === 0) {
    return (
      <div className="orderbook glass-card-static">
        <div className="orderbook-header">
          <h4>Order Book</h4>
          <span className="orderbook-live">
            <span className="status-dot status-dot-active" /> Live
          </span>
        </div>
        <div className="empty-state">
          <div className="empty-state-icon">📋</div>
          <div className="empty-state-title">No Active Listings</div>
          <div className="empty-state-message">
            Be the first to list tokens for sale on the marketplace.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="orderbook glass-card-static">
      <div className="orderbook-header">
        <h4>Order Book</h4>
        <div className="orderbook-meta">
          <span className="orderbook-count">{listings.length} listing{listings.length !== 1 ? 's' : ''}</span>
          <span className="orderbook-live">
            <span className="status-dot status-dot-active" /> Live
          </span>
        </div>
      </div>
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Seller</th>
              <th>Amount (SXP)</th>
              <th>Price/Token</th>
              <th>Total</th>
              <th>Listed</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {listings.map((listing, idx) => {
              const isSelf = currentWallet &&
                listing.seller?.toLowerCase() === currentWallet.toLowerCase();
              const total = Number(listing.amount) * Number(listing.pricePerToken);
              const listedAgo = listing.listedAt ? getTimeAgo(listing.listedAt) : '—';
              return (
                <tr key={listing.id || idx} className={isSelf ? 'orderbook-own-row' : ''}>
                  <td className="orderbook-seller">
                    {listing.seller
                      ? `${listing.seller.slice(0, 6)}...${listing.seller.slice(-4)}`
                      : '—'}
                    {isSelf && <span className="badge badge-info" style={{ marginLeft: 6, fontSize: '10px' }}>You</span>}
                  </td>
                  <td className="orderbook-amount">{Number(listing.amount).toLocaleString()}</td>
                  <td>${Number(listing.pricePerToken).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td className="orderbook-total">
                    ${total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                  <td className="orderbook-time text-muted">{listedAgo}</td>
                  <td>
                    {isSelf ? (
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => onCancel?.(listing)}
                      >
                        Cancel
                      </button>
                    ) : (
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => onBuy?.(listing)}
                        disabled={!currentWallet}
                      >
                        Buy
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function getTimeAgo(dateStr) {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
