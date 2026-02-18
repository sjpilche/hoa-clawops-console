/**
 * @file TradingPage.jsx
 * @description OpenClaw Trader module — integrates the trader-service (port 3002).
 *
 * TABS:
 *  - Dashboard   : Service health, P&L summary, open positions, portfolio value
 *  - Strategies  : List + enable/disable/configure strategies + manual run
 *  - Orders      : Order history + manual order submission
 *  - Risk        : Risk limits and breach history
 *  - Broker      : Alpaca account info + live quote lookup
 *  - Kill Switch : Emergency stop controls + event log
 *
 * Auth note: The trader bypasses JWT auth in dev mode (no CONSOLE_JWT_PUBLIC_KEY set),
 * so all protected routes work without sending a token.
 *
 * REQUIRES: openclaw-trader running on http://localhost:3002
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  TrendingUp, Activity, AlertTriangle, Shield, RefreshCw,
  ExternalLink, CheckCircle, XCircle, Power, ChevronDown,
  ChevronRight, Settings, X, Server, ShoppingCart, DollarSign,
  Wifi, WifiOff,
} from 'lucide-react';

const TRADER_BASE = 'http://localhost:3002';

// ─── API client ───────────────────────────────────────────────────────────────
// Direct fetch to trader service — no auth header needed in dev mode (trader bypasses JWT)
const traderApi = {
  get: async (path) => {
    const res = await fetch(`${TRADER_BASE}${path}`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.message || body.error || `${res.status} ${res.statusText}`);
    }
    return res.json();
  },
  post: async (path, body) => {
    const res = await fetch(`${TRADER_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.message || errBody.error || `${res.status} ${res.statusText}`);
    }
    return res.json();
  },
  put: async (path, body) => {
    const res = await fetch(`${TRADER_BASE}${path}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.message || errBody.error || `${res.status} ${res.statusText}`);
    }
    return res.json();
  },
  del: async (path) => {
    const res = await fetch(`${TRADER_BASE}${path}`, { method: 'DELETE' });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.message || errBody.error || `${res.status} ${res.statusText}`);
    }
    return res.json();
  },
};

// ─── Shared UI primitives ─────────────────────────────────────────────────────

function Card({ children, className = '' }) {
  return (
    <div className={`bg-bg-elevated border border-border rounded-lg p-4 ${className}`}>
      {children}
    </div>
  );
}

function SectionTitle({ children }) {
  return <h2 className="text-sm font-semibold text-text-primary mb-3">{children}</h2>;
}

function Badge({ children, variant = 'default' }) {
  const styles = {
    default: 'bg-bg-secondary text-text-muted',
    success: 'bg-accent-success/10 text-accent-success',
    danger:  'bg-accent-danger/10 text-accent-danger',
    warning: 'bg-accent-warning/10 text-accent-warning',
    info:    'bg-accent-info/10 text-accent-info',
  };
  return (
    <span className={`px-2 py-0.5 text-xs rounded font-medium ${styles[variant]}`}>
      {children}
    </span>
  );
}

function ErrorState({ message, onRetry }) {
  const isOffline = message?.includes('Failed to fetch') || message?.includes('NetworkError') || message?.includes('ERR_CONNECTION_REFUSED');
  const isDbError = message?.includes('ECONNREFUSED') || message?.toLowerCase().includes('database') || message?.toLowerCase().includes('postgres');
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center gap-4">
      {isOffline ? <WifiOff size={36} className="text-accent-danger" /> : <XCircle size={36} className="text-accent-danger" />}
      <div>
        <p className="text-text-primary font-semibold">
          {isOffline ? 'Trader Service Offline' : isDbError ? 'Database Unavailable' : 'Request Failed'}
        </p>
        <p className="text-sm text-text-secondary mt-1 max-w-sm">
          {isDbError
            ? 'This feature requires PostgreSQL (port 5433). The trader DB is not running on this machine.'
            : message}
        </p>
        {isOffline && (
          <p className="text-xs text-text-muted mt-2">
            Start with{' '}
            <code className="px-1.5 py-0.5 bg-bg-elevated rounded font-mono">npm run dev</code>
            {' '}— trader runs on port 3002
          </p>
        )}
        {isDbError && (
          <p className="text-xs text-text-muted mt-2">
            Kill switch state is tracked in-memory only. Orders history, positions history, and kill switch events require a PostgreSQL connection.
          </p>
        )}
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="flex items-center gap-2 px-4 py-2 text-sm bg-accent-primary/10 text-accent-primary rounded hover:bg-accent-primary/20 transition-colors"
        >
          <RefreshCw size={14} />
          Retry
        </button>
      )}
    </div>
  );
}

function Loading({ label = 'Loading…' }) {
  return (
    <div className="flex items-center justify-center py-16 text-text-muted text-sm gap-2">
      <RefreshCw size={16} className="animate-spin" />
      {label}
    </div>
  );
}

function PnlValue({ value, className = '' }) {
  const v = value ?? 0;
  return (
    <span className={`${v >= 0 ? 'text-accent-success' : 'text-accent-danger'} ${className}`}>
      {v >= 0 ? '+' : ''}${v.toFixed(2)}
    </span>
  );
}

// ─── Tab: Dashboard ──────────────────────────────────────────────────────────

function DashboardTab() {
  const [health, setHealth] = useState(null);
  const [positions, setPositions] = useState([]);
  const [pnl, setPnl] = useState(null);
  const [portfolio, setPortfolio] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [h, pos, p, port] = await Promise.all([
        traderApi.get('/health'),
        traderApi.get('/api/positions'),
        traderApi.get('/api/positions/pnl').catch(() => null),
        traderApi.get('/api/positions/portfolio/value').catch(() => null),
      ]);
      setHealth(h);
      setPositions(pos.positions ?? []);
      setPnl(p);
      setPortfolio(port);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 15_000);
    return () => clearInterval(id);
  }, [load]);

  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  // health.status returns 'healthy' | 'unhealthy'
  const isHealthy = health?.status === 'healthy';
  // kill switch: 'armed' | 'triggered'
  const killSwitchTriggered = health?.killSwitch === 'triggered';

  return (
    <div className="space-y-5">
      {/* Kill switch warning banner */}
      {killSwitchTriggered && (
        <div className="flex items-center gap-3 px-4 py-3 bg-accent-danger/10 border border-accent-danger/30 rounded-lg">
          <AlertTriangle size={18} className="text-accent-danger shrink-0" />
          <p className="text-sm text-accent-danger font-medium">
            KILL SWITCH TRIGGERED — All trading is halted. Go to Kill Switch tab to reset.
          </p>
        </div>
      )}

      {/* Health stat row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <div className="text-xs text-text-muted uppercase tracking-wider mb-1">Status</div>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${isHealthy ? 'bg-accent-success' : 'bg-accent-danger'}`} />
            <span className="text-sm font-semibold text-text-primary">
              {isHealthy ? 'Healthy' : 'Degraded'}
            </span>
          </div>
        </Card>
        <Card>
          <div className="text-xs text-text-muted uppercase tracking-wider mb-1">Mode</div>
          <Badge variant={health?.mode === 'paper' ? 'info' : 'danger'}>
            {health?.mode?.toUpperCase() ?? '—'}
          </Badge>
        </Card>
        <Card>
          <div className="text-xs text-text-muted uppercase tracking-wider mb-1">Kill Switch</div>
          <Badge variant={killSwitchTriggered ? 'danger' : 'success'}>
            {killSwitchTriggered ? 'TRIGGERED' : 'Armed / OK'}
          </Badge>
        </Card>
        <Card>
          <div className="text-xs text-text-muted uppercase tracking-wider mb-1">Uptime</div>
          <span className="text-sm font-mono text-text-primary">
            {health?.uptime != null
              ? health.uptime < 3600
                ? `${Math.floor(health.uptime / 60)}m`
                : `${Math.floor(health.uptime / 3600)}h ${Math.floor((health.uptime % 3600) / 60)}m`
              : '—'}
          </span>
        </Card>
      </div>

      {/* Portfolio + P&L row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {portfolio && (
          <Card>
            <SectionTitle>Portfolio Value</SectionTitle>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <div className="text-xs text-text-muted mb-0.5">Total</div>
                <div className="font-semibold text-text-primary font-mono">
                  ${(portfolio.totalValue ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </div>
              </div>
              <div>
                <div className="text-xs text-text-muted mb-0.5">Long</div>
                <div className="font-mono text-accent-success">
                  ${(portfolio.longValue ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </div>
              </div>
              <div>
                <div className="text-xs text-text-muted mb-0.5">Short</div>
                <div className="font-mono text-accent-danger">
                  ${(portfolio.shortValue ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </div>
              </div>
            </div>
          </Card>
        )}

        {pnl && (
          <Card>
            <SectionTitle>Today's P&amp;L</SectionTitle>
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: 'Net', value: pnl.today?.net ?? pnl.net },
                { label: 'Realized', value: pnl.today?.realized ?? pnl.realized },
                { label: 'Unrealized', value: pnl.today?.unrealized ?? pnl.unrealized },
              ].map(({ label, value }) => (
                <div key={label}>
                  <div className="text-xs text-text-muted mb-0.5">{label}</div>
                  <PnlValue value={value} className="text-base font-semibold font-mono" />
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      {/* Open Positions */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <SectionTitle>Open Positions</SectionTitle>
          <button onClick={load} className="text-xs text-text-muted hover:text-text-primary flex items-center gap-1">
            <RefreshCw size={11} /> Refresh
          </button>
        </div>
        {positions.length === 0 ? (
          <p className="text-sm text-text-muted">No open positions</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-text-muted border-b border-border">
                  <th className="pb-2 font-medium">Symbol</th>
                  <th className="pb-2 font-medium">Side</th>
                  <th className="pb-2 font-medium">Qty</th>
                  <th className="pb-2 font-medium">Avg Price</th>
                  <th className="pb-2 font-medium">Market</th>
                  <th className="pb-2 font-medium">Unrealized P&amp;L</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {positions.map((p) => (
                  <tr key={p.symbol} className="text-text-primary">
                    <td className="py-2 font-mono font-semibold">{p.symbol}</td>
                    <td className="py-2">
                      <Badge variant={p.side === 'long' ? 'success' : 'danger'}>
                        {p.side ?? (p.qty > 0 ? 'long' : 'short')}
                      </Badge>
                    </td>
                    <td className="py-2">{p.qty}</td>
                    <td className="py-2 font-mono">${(p.avgPrice ?? p.avg_entry_price ?? 0).toFixed(2)}</td>
                    <td className="py-2 font-mono">${(p.marketPrice ?? p.current_price ?? 0).toFixed(2)}</td>
                    <td className="py-2">
                      <PnlValue value={p.unrealizedPnl ?? p.unrealized_pl} className="font-mono font-semibold text-sm" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── Configure Strategy Modal ─────────────────────────────────────────────────

function ConfigureModal({ strategy, onClose, onSaved }) {
  const [fields, setFields] = useState(() => {
    const p = strategy.params ?? {};
    return Object.entries(p)
      .filter(([k]) => k !== 'symbols')
      .map(([k, v]) => ({ key: k, value: String(v), type: typeof v }));
  });
  const [symbolsText, setSymbolsText] = useState((strategy.symbols ?? []).join(', '));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const updateField = (idx, val) => {
    setFields((prev) => prev.map((f, i) => i === idx ? { ...f, value: val } : f));
  };

  const save = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const params = {};
      for (const { key, value, type } of fields) {
        if (type === 'number') params[key] = parseFloat(value);
        else if (type === 'boolean') params[key] = value === 'true';
        else params[key] = value;
      }
      const symbols = symbolsText.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
      params.symbols = symbols;
      await traderApi.put(`/api/strategies/${strategy.id}/params`, params);
      onSaved();
      onClose();
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-bg-elevated border border-border rounded-xl p-6 w-full max-w-lg shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-semibold text-text-primary">Configure: {strategy.name}</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
          {fields.map(({ key, value, type }, idx) => (
            <div key={key}>
              <label className="block text-xs text-text-muted mb-1 capitalize">
                {key.replace(/([A-Z])/g, ' $1').trim()}
                <span className="ml-1 opacity-40">({type})</span>
              </label>
              {type === 'boolean' ? (
                <select
                  value={value}
                  onChange={(e) => updateField(idx, e.target.value)}
                  className="w-full px-2 py-1.5 text-sm bg-bg-secondary border border-border rounded text-text-primary focus:outline-none focus:border-accent-primary"
                >
                  <option value="true">true</option>
                  <option value="false">false</option>
                </select>
              ) : (
                <input
                  type={type === 'number' ? 'number' : 'text'}
                  value={value}
                  onChange={(e) => updateField(idx, e.target.value)}
                  step={type === 'number' ? 'any' : undefined}
                  className="w-full px-2 py-1.5 text-sm bg-bg-secondary border border-border rounded text-text-primary font-mono focus:outline-none focus:border-accent-primary"
                />
              )}
            </div>
          ))}
          <div>
            <label className="block text-xs text-text-muted mb-1">Symbols (comma-separated)</label>
            <textarea
              value={symbolsText}
              onChange={(e) => setSymbolsText(e.target.value.toUpperCase())}
              placeholder="AAPL, MSFT, SPY, QQQ"
              rows={3}
              className="w-full px-2 py-1.5 text-sm bg-bg-secondary border border-border rounded text-text-primary font-mono focus:outline-none focus:border-accent-primary resize-none"
            />
          </div>
        </div>

        {saveError && (
          <div className="mt-3 px-3 py-2 text-xs rounded bg-accent-danger/10 text-accent-danger">
            {saveError}
          </div>
        )}

        <div className="flex gap-3 mt-5">
          <button
            onClick={save}
            disabled={saving}
            className="flex-1 px-4 py-2 text-sm bg-accent-primary text-white rounded-lg hover:bg-accent-primary/90 transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save Parameters'}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm bg-bg-secondary text-text-secondary rounded-lg hover:bg-bg-elevated transition-colors border border-border"
          >
            Cancel
          </button>
        </div>
        <p className="text-xs text-text-muted mt-2">Changes apply immediately (in-memory). Restart trader to reset to defaults.</p>
      </div>
    </div>
  );
}

// ─── Strategy Row ─────────────────────────────────────────────────────────────

function StrategyRow({ strategy, onToggle, toggling, onConfigure }) {
  const [expanded, setExpanded] = useState(false);
  const params = strategy.params ?? {};
  const paramEntries = Object.entries(params).filter(([k]) => k !== 'symbols');

  return (
    <>
      <tr className="text-text-primary hover:bg-bg-secondary/40 transition-colors">
        <td className="py-2.5">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1.5 font-medium hover:text-accent-primary transition-colors"
          >
            {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            {strategy.name}
          </button>
        </td>
        <td className="py-2.5 font-mono text-text-muted text-xs">{strategy.version ?? '—'}</td>
        <td className="py-2.5 text-text-muted text-xs font-mono max-w-xs truncate">
          {(strategy.symbols ?? []).slice(0, 6).join(', ') || '—'}
          {(strategy.symbols ?? []).length > 6 && ` +${(strategy.symbols ?? []).length - 6}`}
        </td>
        <td className="py-2.5">
          <Badge variant={strategy.enabled ? 'success' : 'default'}>
            {strategy.enabled ? 'Enabled' : 'Disabled'}
          </Badge>
        </td>
        <td className="py-2.5 text-right">
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => onConfigure(strategy)}
              title="Configure parameters"
              className="p-1 text-text-muted hover:text-accent-primary transition-colors"
            >
              <Settings size={13} />
            </button>
            <button
              onClick={() => onToggle(strategy.id, strategy.enabled)}
              disabled={toggling === strategy.id}
              className={`px-3 py-1 text-xs rounded transition-colors ${
                strategy.enabled
                  ? 'bg-accent-danger/10 text-accent-danger hover:bg-accent-danger/20'
                  : 'bg-accent-success/10 text-accent-success hover:bg-accent-success/20'
              } disabled:opacity-50`}
            >
              {toggling === strategy.id ? '…' : strategy.enabled ? 'Disable' : 'Enable'}
            </button>
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-bg-secondary/30">
          <td colSpan={5} className="px-6 py-3">
            <div className="text-xs text-text-muted space-y-2">
              <div className="font-medium text-text-secondary mb-1">Parameters</div>
              {paramEntries.length === 0 ? (
                <span className="italic">No configurable parameters</span>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-1">
                  {paramEntries.map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-2">
                      <span className="text-text-muted capitalize">{k.replace(/([A-Z])/g, ' $1').trim()}:</span>
                      <span className="font-mono text-text-primary">{String(v)}</span>
                    </div>
                  ))}
                </div>
              )}
              {(strategy.symbols ?? []).length > 0 && (
                <div className="pt-1 border-t border-border/50">
                  <span className="text-text-muted">Symbols ({strategy.symbols.length}): </span>
                  <span className="font-mono text-text-secondary">{strategy.symbols.join(', ')}</span>
                </div>
              )}
              <div className="pt-1 border-t border-border/50 text-text-muted opacity-60">
                ID: <span className="font-mono">{strategy.id}</span>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Tab: Strategies ──────────────────────────────────────────────────────────

function StrategiesTab() {
  const [strategies, setStrategies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toggling, setToggling] = useState(null);
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState(null);
  const [configuringStrategy, setConfiguringStrategy] = useState(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await traderApi.get('/api/strategies');
      setStrategies(data.strategies ?? []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggle = async (id, enabled) => {
    setToggling(id);
    try {
      await traderApi.post(`/api/strategies/${id}/${enabled ? 'disable' : 'enable'}`, {});
      await load();
    } catch (err) {
      console.error('[Trader] Toggle failed:', err);
    } finally {
      setToggling(null);
    }
  };

  const runStrategies = async () => {
    setRunning(true);
    setRunResult(null);
    try {
      const result = await traderApi.post('/api/strategies/run', {});
      setRunResult({ success: true, message: result.message || 'Strategies executed — check trader logs for signals' });
      await load();
    } catch (err) {
      setRunResult({ success: false, message: err.message });
    } finally {
      setRunning(false);
      setTimeout(() => setRunResult(null), 10_000);
    }
  };

  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  const enabledCount = strategies.filter((s) => s.enabled).length;

  return (
    <div className="space-y-5">
      {configuringStrategy && (
        <ConfigureModal
          strategy={configuringStrategy}
          onClose={() => setConfiguringStrategy(null)}
          onSaved={load}
        />
      )}

      <Card>
        <div className="flex items-center justify-between mb-3">
          <div>
            <SectionTitle>Trading Strategies</SectionTitle>
            <p className="text-xs text-text-muted -mt-2">
              {enabledCount}/{strategies.length} enabled — runner fires every 60s automatically
            </p>
          </div>
          <button
            onClick={runStrategies}
            disabled={running}
            className="flex items-center gap-2 px-3 py-1.5 text-xs bg-accent-primary/10 text-accent-primary rounded hover:bg-accent-primary/20 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={12} className={running ? 'animate-spin' : ''} />
            {running ? 'Running…' : 'Run Now'}
          </button>
        </div>

        {runResult && (
          <div className={`mb-3 px-3 py-2 text-xs rounded flex items-start gap-2 ${
            runResult.success ? 'bg-accent-success/10 text-accent-success' : 'bg-accent-danger/10 text-accent-danger'
          }`}>
            {runResult.success ? <CheckCircle size={12} className="mt-0.5 shrink-0" /> : <XCircle size={12} className="mt-0.5 shrink-0" />}
            {runResult.message}
          </div>
        )}

        {strategies.length === 0 ? (
          <p className="text-sm text-text-muted">No strategies registered</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-text-muted border-b border-border">
                  <th className="pb-2 font-medium">Name</th>
                  <th className="pb-2 font-medium">Version</th>
                  <th className="pb-2 font-medium">Symbols</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {strategies.map((s) => (
                  <StrategyRow
                    key={s.id}
                    strategy={s}
                    onToggle={toggle}
                    toggling={toggling}
                    onConfigure={setConfiguringStrategy}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-text-muted mt-3">
          Click a strategy name to expand parameters. Use <Settings size={10} className="inline" /> to edit. Runner is automated at 1-min intervals.
        </p>
      </Card>
    </div>
  );
}

// ─── Tab: Orders ──────────────────────────────────────────────────────────────

function OrdersTab() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [orderResult, setOrderResult] = useState(null);
  const [cancellingId, setCancellingId] = useState(null);
  const [orderForm, setOrderForm] = useState({
    symbol: 'SPY', side: 'buy', qty: '1', orderType: 'market', limitPrice: '', timeInForce: 'day'
  });

  const [dbUnavailable, setDbUnavailable] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await traderApi.get('/api/orders');
      setOrders(data.orders ?? []);
      setDbUnavailable(false);
    } catch (err) {
      // DB connection errors show a graceful notice rather than blocking the whole tab
      const isDbErr = err.message?.includes('500') || err.message?.includes('database') || err.message?.includes('ECONNREFUSED');
      if (isDbErr) {
        setDbUnavailable(true);
        setOrders([]);
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const submitOrder = async (e) => {
    e.preventDefault();
    setSubmittingOrder(true);
    setOrderResult(null);
    try {
      const body = {
        symbol: orderForm.symbol.toUpperCase(),
        side: orderForm.side,
        qty: parseFloat(orderForm.qty),
        orderType: orderForm.orderType,
        timeInForce: orderForm.timeInForce,
        ...(orderForm.orderType === 'limit' && orderForm.limitPrice
          ? { limitPrice: parseFloat(orderForm.limitPrice) }
          : {}),
      };
      const result = await traderApi.post('/api/orders/submit', body);
      if (result.success) {
        setOrderResult({ success: true, message: `Order submitted — Broker ID: ${result.brokerOrderId ?? 'pending'}` });
        await load();
      } else {
        setOrderResult({ success: false, message: result.reason || result.error || 'Order rejected' });
      }
    } catch (err) {
      setOrderResult({ success: false, message: err.message });
    } finally {
      setSubmittingOrder(false);
      setTimeout(() => setOrderResult(null), 8000);
    }
  };

  const cancelOrder = async (brokerOrderId) => {
    if (!window.confirm(`Cancel order ${brokerOrderId}?`)) return;
    setCancellingId(brokerOrderId);
    try {
      await traderApi.del(`/api/orders/${brokerOrderId}`);
      await load();
    } catch (err) {
      alert(`Cancel failed: ${err.message}`);
    } finally {
      setCancellingId(null);
    }
  };

  const statusVariant = (status) => {
    if (!status) return 'default';
    const s = status.toLowerCase();
    if (s === 'filled') return 'success';
    if (s === 'canceled' || s === 'rejected') return 'danger';
    if (s === 'partially_filled') return 'warning';
    return 'info';
  };

  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="space-y-5">
      {/* Manual Order Form */}
      <Card>
        <SectionTitle>Submit Order (Paper Trading)</SectionTitle>
        <form onSubmit={submitOrder} className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-text-muted mb-1">Symbol</label>
              <input
                type="text"
                value={orderForm.symbol}
                onChange={(e) => setOrderForm({ ...orderForm, symbol: e.target.value.toUpperCase() })}
                className="w-full px-2 py-1.5 text-sm bg-bg-secondary border border-border rounded text-text-primary font-mono focus:outline-none focus:border-accent-primary"
                placeholder="SPY"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">Side</label>
              <select
                value={orderForm.side}
                onChange={(e) => setOrderForm({ ...orderForm, side: e.target.value })}
                className="w-full px-2 py-1.5 text-sm bg-bg-secondary border border-border rounded text-text-primary focus:outline-none focus:border-accent-primary"
              >
                <option value="buy">Buy</option>
                <option value="sell">Sell / Short</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">Qty</label>
              <input
                type="number"
                value={orderForm.qty}
                onChange={(e) => setOrderForm({ ...orderForm, qty: e.target.value })}
                className="w-full px-2 py-1.5 text-sm bg-bg-secondary border border-border rounded text-text-primary focus:outline-none focus:border-accent-primary"
                min="1" step="1" required
              />
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">Order Type</label>
              <select
                value={orderForm.orderType}
                onChange={(e) => setOrderForm({ ...orderForm, orderType: e.target.value })}
                className="w-full px-2 py-1.5 text-sm bg-bg-secondary border border-border rounded text-text-primary focus:outline-none focus:border-accent-primary"
              >
                <option value="market">Market</option>
                <option value="limit">Limit</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">Time in Force</label>
              <select
                value={orderForm.timeInForce}
                onChange={(e) => setOrderForm({ ...orderForm, timeInForce: e.target.value })}
                className="w-full px-2 py-1.5 text-sm bg-bg-secondary border border-border rounded text-text-primary focus:outline-none focus:border-accent-primary"
              >
                <option value="day">Day</option>
                <option value="gtc">GTC</option>
                <option value="ioc">IOC</option>
                <option value="fok">FOK</option>
              </select>
            </div>
            {orderForm.orderType === 'limit' && (
              <div>
                <label className="block text-xs text-text-muted mb-1">Limit Price ($)</label>
                <input
                  type="number"
                  value={orderForm.limitPrice}
                  onChange={(e) => setOrderForm({ ...orderForm, limitPrice: e.target.value })}
                  className="w-full px-2 py-1.5 text-sm bg-bg-secondary border border-border rounded text-text-primary font-mono focus:outline-none focus:border-accent-primary"
                  step="0.01" min="0.01" required
                />
              </div>
            )}
          </div>

          {orderResult && (
            <div className={`px-3 py-2 text-xs rounded ${
              orderResult.success ? 'bg-accent-success/10 text-accent-success' : 'bg-accent-danger/10 text-accent-danger'
            }`}>
              {orderResult.message}
            </div>
          )}

          <button
            type="submit"
            disabled={submittingOrder}
            className="px-5 py-2 text-sm bg-accent-primary text-white rounded-lg hover:bg-accent-primary/90 transition-colors disabled:opacity-50 font-medium"
          >
            {submittingOrder ? 'Submitting…' : `Submit ${orderForm.side === 'buy' ? 'Buy' : 'Sell'} Order`}
          </button>
          <p className="text-xs text-text-muted">Routes through risk engine → Alpaca paper trading. Market orders execute immediately during market hours.</p>
        </form>
      </Card>

      {/* Order History */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <SectionTitle>Order History</SectionTitle>
          <button onClick={load} className="text-xs text-text-muted hover:text-text-primary flex items-center gap-1">
            <RefreshCw size={11} /> Refresh
          </button>
        </div>
        {orders.length === 0 ? (
          dbUnavailable
            ? <p className="text-sm text-accent-warning">Order history requires PostgreSQL (port 5433) — not running on this machine.</p>
            : <p className="text-sm text-text-muted">No orders yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-text-muted border-b border-border">
                  <th className="pb-2 font-medium">Symbol</th>
                  <th className="pb-2 font-medium">Side</th>
                  <th className="pb-2 font-medium">Qty</th>
                  <th className="pb-2 font-medium">Type</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 font-medium">Risk</th>
                  <th className="pb-2 font-medium">Submitted</th>
                  <th className="pb-2 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {orders.map((o, i) => (
                  <tr key={o.order_id || o.intent_id || i} className="text-text-primary">
                    <td className="py-2 font-mono font-semibold">{o.symbol}</td>
                    <td className="py-2">
                      <Badge variant={o.side === 'buy' ? 'success' : 'danger'}>{o.side}</Badge>
                    </td>
                    <td className="py-2">{o.qty}</td>
                    <td className="py-2 text-text-muted">{o.order_type}</td>
                    <td className="py-2">
                      <Badge variant={statusVariant(o.status)}>
                        {o.status ?? 'pending'}
                      </Badge>
                    </td>
                    <td className="py-2">
                      {o.risk_passed != null ? (
                        <Badge variant={o.risk_passed ? 'success' : 'danger'}>
                          {o.risk_passed ? 'Passed' : `Failed: ${o.fail_reason || '—'}`}
                        </Badge>
                      ) : '—'}
                    </td>
                    <td className="py-2 text-xs text-text-muted">
                      {o.submitted_at ? new Date(o.submitted_at).toLocaleString() : '—'}
                    </td>
                    <td className="py-2 text-right">
                      {o.broker_order_id && o.status === 'pending' && (
                        <button
                          onClick={() => cancelOrder(o.broker_order_id)}
                          disabled={cancellingId === o.broker_order_id}
                          className="text-xs text-accent-danger hover:underline disabled:opacity-50"
                        >
                          {cancellingId === o.broker_order_id ? '…' : 'Cancel'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── Tab: Risk ────────────────────────────────────────────────────────────────

function RiskTab() {
  const [limits, setLimits] = useState([]);
  const [breaches, setBreaches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [limitsData, breachData] = await Promise.all([
        traderApi.get('/api/risk/limits'),
        traderApi.get('/api/risk/breaches'),
      ]);
      setLimits(limitsData.limits ?? []);
      setBreaches(breachData.breaches ?? []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="space-y-5">
      <Card>
        <SectionTitle>Risk Limits</SectionTitle>
        {limits.length === 0 ? (
          <p className="text-sm text-text-muted">No limits configured</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-text-muted border-b border-border">
                <th className="pb-2 font-medium">Limit</th>
                <th className="pb-2 font-medium">Value</th>
                <th className="pb-2 font-medium">Unit</th>
                <th className="pb-2 font-medium">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {limits.map((l) => (
                <tr key={l.limitType} className="text-text-primary">
                  <td className="py-2 font-medium capitalize">{l.limitType.replace(/_/g, ' ')}</td>
                  <td className="py-2 font-mono font-semibold">
                    {l.unit === 'USD' ? `$${l.value.toLocaleString()}` : l.value}
                  </td>
                  <td className="py-2 text-text-muted">{l.unit}</td>
                  <td className="py-2 text-text-muted text-xs">{new Date(l.updatedAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card>
        <SectionTitle>Breach History</SectionTitle>
        {breaches.length === 0 ? (
          <div className="flex items-center gap-2 text-accent-success text-sm">
            <CheckCircle size={16} /> No breaches detected
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-text-muted border-b border-border">
                <th className="pb-2 font-medium">Timestamp</th>
                <th className="pb-2 font-medium">Limit</th>
                <th className="pb-2 font-medium">Value</th>
                <th className="pb-2 font-medium">Max Allowed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {breaches.map((b, i) => (
                <tr key={i} className="text-text-primary">
                  <td className="py-2 text-xs text-text-muted">{new Date(b.timestamp).toLocaleString()}</td>
                  <td className="py-2">{b.limitType}</td>
                  <td className="py-2 text-accent-danger font-semibold">{b.value}</td>
                  <td className="py-2 text-text-muted">{b.limit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

// ─── Tab: Broker ──────────────────────────────────────────────────────────────

function BrokerTab() {
  const [account, setAccount] = useState(null);
  const [quoteSymbol, setQuoteSymbol] = useState('SPY');
  const [quote, setQuote] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [connRes, accRes] = await Promise.all([
        traderApi.get('/api/broker/test').catch((err) => ({ error: err.message })),
        traderApi.get('/api/broker/account').catch((err) => ({ error: err.message })),
      ]);
      setConnectionStatus(connRes.error ? { connected: false, error: connRes.error } : { connected: true, mode: connRes.mode });
      setAccount(accRes.error ? null : accRes.account);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const fetchQuote = async () => {
    if (!quoteSymbol.trim()) return;
    setQuoteLoading(true);
    setQuote(null);
    try {
      const data = await traderApi.get(`/api/broker/quote/${quoteSymbol.trim().toUpperCase()}`);
      setQuote(data);
    } catch (err) {
      setQuote({ error: err.message });
    } finally {
      setQuoteLoading(false);
    }
  };

  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="space-y-5">
      {/* Connection status */}
      <Card>
        <SectionTitle>Alpaca Connection</SectionTitle>
        <div className="flex items-center gap-3">
          {connectionStatus?.connected
            ? <Wifi size={16} className="text-accent-success" />
            : <WifiOff size={16} className="text-accent-danger" />}
          <div>
            <p className={`text-sm font-medium ${connectionStatus?.connected ? 'text-accent-success' : 'text-accent-danger'}`}>
              {connectionStatus?.connected ? `Connected — ${connectionStatus.mode ?? 'paper'} mode` : 'Not connected'}
            </p>
            {connectionStatus?.error && (
              <p className="text-xs text-text-muted mt-0.5">{connectionStatus.error}</p>
            )}
          </div>
        </div>
      </Card>

      {/* Account info */}
      {account && (
        <Card>
          <SectionTitle>Account Info</SectionTitle>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            {[
              { label: 'Portfolio Value', value: account.portfolio_value ? `$${parseFloat(account.portfolio_value).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '—' },
              { label: 'Cash', value: account.cash ? `$${parseFloat(account.cash).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '—' },
              { label: 'Buying Power', value: account.buying_power ? `$${parseFloat(account.buying_power).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '—' },
              { label: 'Day Trade Count', value: account.daytrade_count ?? '—' },
              { label: 'Status', value: account.status ?? '—' },
              { label: 'Pattern Day Trader', value: account.pattern_day_trader ? 'Yes' : 'No' },
            ].map(({ label, value }) => (
              <div key={label}>
                <div className="text-xs text-text-muted mb-0.5">{label}</div>
                <div className="font-semibold text-text-primary font-mono">{value}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {!account && connectionStatus?.connected && (
        <Card>
          <p className="text-sm text-text-muted">Account data unavailable. Check that broker credentials are configured in .env.trader</p>
        </Card>
      )}

      {/* Live Quote Lookup */}
      <Card>
        <SectionTitle>Live Quote Lookup</SectionTitle>
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            value={quoteSymbol}
            onChange={(e) => setQuoteSymbol(e.target.value.toUpperCase())}
            placeholder="SPY"
            className="w-32 px-2 py-1.5 text-sm bg-bg-secondary border border-border rounded text-text-primary font-mono focus:outline-none focus:border-accent-primary uppercase"
            onKeyDown={(e) => e.key === 'Enter' && fetchQuote()}
          />
          <button
            onClick={fetchQuote}
            disabled={quoteLoading}
            className="px-3 py-1.5 text-sm bg-accent-primary/10 text-accent-primary rounded hover:bg-accent-primary/20 transition-colors disabled:opacity-50"
          >
            {quoteLoading ? 'Loading…' : 'Get Quote'}
          </button>
        </div>

        {quote && !quote.error && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            {[
              { label: 'Symbol', value: quote.symbol ?? quoteSymbol },
              { label: 'Bid', value: quote.quote?.bid ? `$${quote.quote.bid}` : '—' },
              { label: 'Ask', value: quote.quote?.ask ? `$${quote.quote.ask}` : '—' },
              { label: 'Last', value: quote.quote?.last ? `$${quote.quote.last}` : '—' },
            ].map(({ label, value }) => (
              <div key={label}>
                <div className="text-xs text-text-muted mb-0.5">{label}</div>
                <div className="font-semibold text-text-primary font-mono">{value}</div>
              </div>
            ))}
          </div>
        )}
        {quote?.error && (
          <p className="text-xs text-accent-danger">{quote.error}</p>
        )}
      </Card>
    </div>
  );
}

// ─── Tab: Kill Switch ─────────────────────────────────────────────────────────

function KillSwitchTab() {
  const [status, setStatus] = useState(null);
  const [events, setEvents] = useState([]);
  const [dbUnavailable, setDbUnavailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reason, setReason] = useState('');
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      // Try DB-backed endpoints; fall back to health endpoint for status if DB is down
      const [s, e] = await Promise.all([
        traderApi.get('/api/kill-switch/status').catch(() =>
          traderApi.get('/health').then(h => ({ status: h.killSwitch, lastChecked: new Date().toISOString(), _fromHealth: true }))
        ),
        traderApi.get('/api/kill-switch/events').catch(() => ({ events: [], total: 0, _dbUnavailable: true })),
      ]);
      setStatus(s);
      setEvents(e.events ?? []);
      setDbUnavailable(!!e._dbUnavailable);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const trigger = async (mode) => {
    if (!reason.trim()) { alert('Please enter a reason.'); return; }
    const confirmed = window.confirm(
      mode === 'hard'
        ? `HARD STOP: This will CANCEL ALL ORDERS and FLATTEN all positions.\n\nReason: "${reason}"\n\nProceed?`
        : `Soft stop: This will prevent new orders from being submitted.\n\nReason: "${reason}"\n\nProceed?`
    );
    if (!confirmed) return;
    setActing(true);
    try {
      await traderApi.post('/api/kill-switch/trigger', { mode, reason });
      setReason('');
      await load();
    } catch (err) {
      alert(`Failed: ${err.message}`);
    } finally {
      setActing(false);
    }
  };

  const reset = async () => {
    const confirmed = window.confirm('Reset kill switch? This will allow new orders again.');
    if (!confirmed) return;
    setActing(true);
    try {
      await traderApi.post('/api/kill-switch/reset', {});
      await load();
    } catch (err) {
      alert(`Failed: ${err.message}`);
    } finally {
      setActing(false);
    }
  };

  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  // Kill switch status can be a string ('armed'/'triggered') or an object with a 'status' field
  const rawStatus = typeof status?.status === 'object'
    ? status?.status?.status
    : status?.status;
  const isTriggered = rawStatus === 'triggered';

  return (
    <div className="space-y-5">
      {/* Status card */}
      <Card className={isTriggered ? 'border-accent-danger' : ''}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Power size={24} className={isTriggered ? 'text-accent-danger' : 'text-accent-success'} />
            <div>
              <div className="text-xs text-text-muted uppercase tracking-wider">Kill Switch Status</div>
              <div className={`text-lg font-bold ${isTriggered ? 'text-accent-danger' : 'text-accent-success'}`}>
                {isTriggered ? 'TRIGGERED — Trading Halted' : 'Armed / Ready'}
              </div>
              {status?.mode && (
                <div className="text-xs text-text-muted mt-0.5">Mode: {String(status.mode)}</div>
              )}
            </div>
          </div>
          {isTriggered && (
            <button
              onClick={reset}
              disabled={acting}
              className="px-4 py-2 text-sm bg-accent-success/10 text-accent-success rounded hover:bg-accent-success/20 transition-colors disabled:opacity-50"
            >
              {acting ? '…' : 'Reset Kill Switch'}
            </button>
          )}
        </div>
      </Card>

      {/* Manual trigger */}
      {!isTriggered && (
        <Card>
          <SectionTitle>Manual Trigger</SectionTitle>
          <div className="space-y-3">
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason for triggering kill switch…"
              className="w-full px-3 py-2 text-sm bg-bg-secondary border border-border rounded text-text-primary placeholder-text-muted focus:outline-none focus:border-accent-primary"
            />
            <div className="flex gap-3">
              <button
                onClick={() => trigger('soft')}
                disabled={acting || !reason.trim()}
                className="px-4 py-2 text-sm bg-accent-warning/10 text-accent-warning rounded hover:bg-accent-warning/20 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                <AlertTriangle size={14} />
                {acting ? '…' : 'Soft Stop'}
              </button>
              <button
                onClick={() => trigger('hard')}
                disabled={acting || !reason.trim()}
                className="px-4 py-2 text-sm bg-accent-danger/10 text-accent-danger rounded hover:bg-accent-danger/20 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                <XCircle size={14} />
                {acting ? '…' : 'Hard Stop (Cancel + Flatten)'}
              </button>
            </div>
            <p className="text-xs text-text-muted">
              <strong>Soft:</strong> stops new orders &nbsp;|&nbsp; <strong>Hard:</strong> cancels all orders and flattens all positions immediately
            </p>
          </div>
        </Card>
      )}

      {/* Event log */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <SectionTitle>Event History</SectionTitle>
          <button onClick={load} className="text-xs text-text-muted hover:text-text-primary flex items-center gap-1">
            <RefreshCw size={11} /> Refresh
          </button>
        </div>
        {dbUnavailable && (
          <div className="mb-3 px-3 py-2 text-xs rounded bg-accent-warning/10 text-accent-warning">
            PostgreSQL unavailable — event history requires a DB connection. Showing in-memory status only.
          </div>
        )}
        {events.length === 0 ? (
          <p className="text-sm text-text-muted">{dbUnavailable ? 'Event log unavailable (no DB)' : 'No kill switch events recorded'}</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-text-muted border-b border-border">
                <th className="pb-2 font-medium">Timestamp</th>
                <th className="pb-2 font-medium">Mode</th>
                <th className="pb-2 font-medium">Trigger</th>
                <th className="pb-2 font-medium">Reason</th>
                <th className="pb-2 font-medium">Actor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {events.map((ev) => (
                <tr key={ev.eventId} className="text-text-primary">
                  <td className="py-2 text-xs text-text-muted">{new Date(ev.timestamp).toLocaleString()}</td>
                  <td className="py-2">
                    <Badge variant={ev.mode === 'hard' ? 'danger' : 'warning'}>{ev.mode ?? '—'}</Badge>
                  </td>
                  <td className="py-2 text-text-muted text-xs">{ev.trigger}</td>
                  <td className="py-2 text-text-secondary">{ev.reason}</td>
                  <td className="py-2 text-text-muted text-xs">{ev.actor}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'dashboard',   label: 'Dashboard',   icon: TrendingUp },
  { id: 'strategies',  label: 'Strategies',  icon: Activity },
  { id: 'orders',      label: 'Orders',      icon: ShoppingCart },
  { id: 'risk',        label: 'Risk',        icon: Shield },
  { id: 'broker',      label: 'Broker',      icon: Server },
  { id: 'kill-switch', label: 'Kill Switch', icon: AlertTriangle },
];

export default function TradingPage() {
  const [activeTab, setActiveTab] = useState('dashboard');

  return (
    <div className="h-full flex flex-col bg-bg-primary">
      {/* Page header */}
      <div className="border-b border-border bg-bg-secondary px-6 py-4 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">OpenClaw Trader</h1>
          <p className="text-sm text-text-muted mt-0.5">
            Algorithmic trading engine — paper mode
          </p>
        </div>
        <a
          href={TRADER_BASE}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-accent-primary bg-accent-primary/10 rounded hover:bg-accent-primary/20 transition-colors"
        >
          <ExternalLink size={12} />
          localhost:3002
        </a>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-border bg-bg-secondary px-6 gap-0.5 shrink-0 overflow-x-auto">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 px-4 py-3 text-sm border-b-2 transition-colors whitespace-nowrap ${
              activeTab === id
                ? 'border-accent-primary text-accent-primary font-medium'
                : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-5">
        {activeTab === 'dashboard'   && <DashboardTab />}
        {activeTab === 'strategies'  && <StrategiesTab />}
        {activeTab === 'orders'      && <OrdersTab />}
        {activeTab === 'risk'        && <RiskTab />}
        {activeTab === 'broker'      && <BrokerTab />}
        {activeTab === 'kill-switch' && <KillSwitchTab />}
      </div>
    </div>
  );
}
