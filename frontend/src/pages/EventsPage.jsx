import { useState, useEffect, useCallback } from 'react';
import { getEvents, getStats, getTableCounts } from '../services/api';
import './EventsPage.css';

/* ─── Helpers ────────────────────────────────────────────────── */

function truncateAddress(addr) {
  if (!addr) return '—';
  if (addr.length <= 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function formatRelativeTime(timestamp) {
  if (!timestamp) return '—';
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diff = Math.max(0, Math.floor((now - then) / 1000));

  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function getEventColor(eventName) {
  if (!eventName) return 'event-badge--blue';
  const n = eventName.toLowerCase();
  if (n.includes('deposited') || n.includes('subaccountcreated')) return 'event-badge--green';
  if (n.includes('tokenspurchased') || n.includes('stablespurchased')) return 'event-badge--blue';
  if (n.includes('withdrawn') || n.includes('forfeitureexecuted')) return 'event-badge--orange';
  if (n.includes('killswitchactivated')) return 'event-badge--red';
  if (n.includes('proposalcreated') || n.includes('proposalapproved')) return 'event-badge--purple';
  if (n.includes('referralregistered')) return 'event-badge--cyan';
  return 'event-badge--blue';
}

function getChainName(chainId) {
  const id = String(chainId);
  if (id === '17000') return 'Hoodi';
  if (id === '84532') return 'Base Sepolia';
  return `Chain ${id}`;
}

function getChainClass(chainId) {
  const id = String(chainId);
  if (id === '17000') return 'hoodi';
  if (id === '84532') return 'base';
  return 'hoodi';
}

/* ─── Component ──────────────────────────────────────────────── */

export default function EventsPage() {
  const [events, setEvents] = useState([]);
  const [total, setTotal] = useState(0);
  const [tables, setTables] = useState([]);
  const [syncStatus, setSyncStatus] = useState([]);
  const [loading, setLoading] = useState(true);
  const [chainFilter, setChainFilter] = useState('all');
  const [eventFilter, setEventFilter] = useState('');
  const [error, setError] = useState(null);

  /* ── Fetch data ──────────────────────────────────── */
  const fetchData = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    setError(null);

    try {
      const params = { limit: 50 };
      if (chainFilter !== 'all') params.chainId = chainFilter;
      if (eventFilter) params.eventName = eventFilter;

      const [eventsRes, statsRes, tablesRes] = await Promise.allSettled([
        getEvents(params),
        getStats(),
        getTableCounts(),
      ]);

      if (eventsRes.status === 'fulfilled') {
        const data = eventsRes.value;
        setEvents(data.events || data || []);
        setTotal(data.total ?? (data.events || data || []).length);
      }

      if (statsRes.status === 'fulfilled') {
        // stats may include sync info
      }

      if (tablesRes.status === 'fulfilled') {
        const data = tablesRes.value;
        setTables(data.tables || []);
        setSyncStatus(data.syncStatus || data.sync || []);
      }
    } catch (err) {
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [chainFilter, eventFilter]);

  /* ── Mount + auto-refresh ────────────────────────── */
  useEffect(() => {
    fetchData(true);
    const interval = setInterval(() => fetchData(false), 15000);
    return () => clearInterval(interval);
  }, [fetchData]);

  /* ── Unique event names for filter dropdown ──────── */
  const uniqueEventNames = [...new Set(events.map((e) => e.eventName || e.event_name).filter(Boolean))];

  /* ── Render ──────────────────────────────────────── */
  return (
    <div className="events-page">
      {/* Header */}
      <div className="events-header">
        <h1>Event Indexing &amp; Database</h1>
        <p className="events-subtitle">
          Real-time blockchain event capture with full database persistence
        </p>
      </div>

      {/* Sync Status Panel */}
      <section className="sync-panel">
        <h2 className="section-title">⟐ Chain Sync Status</h2>
        <div className="sync-cards">
          {loading ? (
            <>
              <div className="sync-card">
                <div className="loading-skeleton loading-skeleton--text" />
                <div className="loading-skeleton loading-skeleton--block" />
                <div className="loading-skeleton loading-skeleton--text" style={{ width: '50%' }} />
              </div>
              <div className="sync-card">
                <div className="loading-skeleton loading-skeleton--text" />
                <div className="loading-skeleton loading-skeleton--block" />
                <div className="loading-skeleton loading-skeleton--text" style={{ width: '50%' }} />
              </div>
            </>
          ) : syncStatus.length > 0 ? (
            syncStatus.map((chain, i) => {
              const chainId = chain.chainId || chain.chain_id;
              const cls = getChainClass(chainId);
              return (
                <div key={chainId || i} className={`sync-card sync-card--${cls}`}>
                  <div className="sync-card__header">
                    <span className="sync-card__chain-name">{getChainName(chainId)}</span>
                    <span className="sync-card__status sync-card__status--synced">
                      <span className="status-indicator" />
                      Synced
                    </span>
                  </div>
                  <div>
                    <span className="sync-card__block-label">Last Indexed Block</span>
                    <div className="sync-card__block">
                      {(chain.lastBlock || chain.last_block || 0).toLocaleString()}
                    </div>
                  </div>
                  <div className="sync-card__time">
                    <span>Last sync: </span>
                    {formatRelativeTime(chain.lastSyncTime || chain.last_sync_time || chain.updatedAt)}
                  </div>
                </div>
              );
            })
          ) : (
            /* Fallback: show static placeholder cards */
            <>
              <div className="sync-card sync-card--hoodi">
                <div className="sync-card__header">
                  <span className="sync-card__chain-name">Hoodi</span>
                  <span className="sync-card__status sync-card__status--synced">
                    <span className="status-indicator" />
                    Synced
                  </span>
                </div>
                <div>
                  <span className="sync-card__block-label">Last Indexed Block</span>
                  <div className="sync-card__block">—</div>
                </div>
                <div className="sync-card__time"><span>Awaiting data…</span></div>
              </div>
              <div className="sync-card sync-card--base">
                <div className="sync-card__header">
                  <span className="sync-card__chain-name">Base Sepolia</span>
                  <span className="sync-card__status sync-card__status--synced">
                    <span className="status-indicator" />
                    Synced
                  </span>
                </div>
                <div>
                  <span className="sync-card__block-label">Last Indexed Block</span>
                  <div className="sync-card__block">—</div>
                </div>
                <div className="sync-card__time"><span>Awaiting data…</span></div>
              </div>
            </>
          )}
        </div>
      </section>

      {/* Database Tables Grid */}
      <section className="db-tables-section">
        <h2 className="section-title">
          ◫ Database Tables
          {tables.length > 0 && <span className="total-badge">{tables.length} tables</span>}
        </h2>
        <div className="db-tables-grid">
          {loading ? (
            Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="table-card">
                <div className="loading-skeleton loading-skeleton--text" />
                <div className="loading-skeleton loading-skeleton--block" style={{ width: '60px', height: '28px' }} />
                <div className="loading-skeleton loading-skeleton--text" style={{ width: '50%', height: '12px' }} />
              </div>
            ))
          ) : tables.length > 0 ? (
            tables.map((t) => {
              const name = t.table || t.name || t.tableName;
              const count = t.count ?? t.rows ?? 0;
              const category = t.category || 'general';
              return (
                <div key={name} className="table-card">
                  <span className="table-card__name">{name}</span>
                  <span className="table-card__count">{Number(count).toLocaleString()}</span>
                  <span className={`table-card__category table-card__category--${category}`}>
                    {category}
                  </span>
                </div>
              );
            })
          ) : (
            <div className="events-empty" style={{ gridColumn: '1 / -1' }}>
              <div className="events-empty__icon">◫</div>
              <p className="events-empty__text">No table data available</p>
            </div>
          )}
        </div>
      </section>

      {/* Events Feed */}
      <section className="events-feed">
        <h2 className="section-title">
          ▲ Indexed Events
          {total > 0 && <span className="total-badge">{total.toLocaleString()} events</span>}
        </h2>

        <div className="events-filters">
          <select
            className="form-select"
            value={chainFilter}
            onChange={(e) => setChainFilter(e.target.value)}
          >
            <option value="all">All Chains</option>
            <option value="17000">Hoodi (17000)</option>
            <option value="84532">Base Sepolia (84532)</option>
          </select>

          <select
            className="form-select"
            value={eventFilter}
            onChange={(e) => setEventFilter(e.target.value)}
          >
            <option value="">All Events</option>
            {uniqueEventNames.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>

          <button className="btn btn-secondary btn-sm" onClick={() => fetchData(true)}>
            ↻ Refresh
          </button>

          <span className="refresh-indicator">
            <span className="dot" />
            Auto-refresh 15s
          </span>
        </div>

        {error && <div className="events-error">⚠ {error}</div>}

        <div className="events-table-wrapper">
          <table className="events-table">
            <thead>
              <tr>
                <th>Chain</th>
                <th>Event</th>
                <th>Block</th>
                <th>Contract</th>
                <th>Tx Hash</th>
                <th>Data</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 7 }).map((__, j) => (
                      <td key={j}>
                        <div className="loading-skeleton loading-skeleton--text" style={{ width: `${60 + j * 10}%` }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : events.length > 0 ? (
                events.map((evt, idx) => {
                  const chainId = evt.chainId || evt.chain_id;
                  const eventName = evt.eventName || evt.event_name || '';
                  const block = evt.blockNumber || evt.block_number || '';
                  const contract = evt.contractAddress || evt.contract_address || evt.address || '';
                  const txHash = evt.transactionHash || evt.tx_hash || '';
                  const data = evt.data || evt.args || evt.returnValues || {};
                  const timestamp = evt.timestamp || evt.createdAt || evt.created_at;

                  return (
                    <tr key={evt.id || idx}>
                      <td>
                        <span className={`chain-badge chain-badge--${getChainClass(chainId)}`}>
                          <span className="chain-badge__dot" />
                          {getChainName(chainId)}
                        </span>
                      </td>
                      <td>
                        <span className={`event-badge ${getEventColor(eventName)}`}>
                          {eventName}
                        </span>
                      </td>
                      <td className="mono">{block ? Number(block).toLocaleString() : '—'}</td>
                      <td className="mono" title={contract}>{truncateAddress(contract)}</td>
                      <td className="mono" title={txHash}>{truncateAddress(txHash)}</td>
                      <td>
                        <span className="data-preview" title={JSON.stringify(data)}>
                          {typeof data === 'string' ? data : JSON.stringify(data)}
                        </span>
                      </td>
                      <td className="time-cell">{formatRelativeTime(timestamp)}</td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7}>
                    <div className="events-empty">
                      <div className="events-empty__icon">▲</div>
                      <p className="events-empty__text">No events found</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
