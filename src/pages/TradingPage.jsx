/**
 * @file TradingPage.jsx
 * @description OpenClaw Trader module — integrates the trader-service (port 3002)
 * as a first-class module in the console.
 *
 * TABS:
 *  - Dashboard   : Service health, P&L summary, open positions
 *  - Strategies  : List + enable/disable trading strategies
 *  - Risk        : Risk limits and breach history
 *  - Kill Switch : Emergency stop controls + event log
 *
 * REQUIRES: openclaw-trader running on http://localhost:3002
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  TrendingUp,
  Activity,
  AlertTriangle,
  Shield,
  RefreshCw,
  ExternalLink,
  CheckCircle,
  XCircle,
  Power,
  ChevronDown,
  ChevronRight,
  Settings,
  X,
} from 'lucide-react';

const TRADER_BASE = 'http://localhost:3002';

// ---------------------------------------------------------------------------
// API client — direct fetch to trader service (no auth needed in dev mode)
// ---------------------------------------------------------------------------
const api = {
  get: async (path) => {
    const res = await fetch(`${TRADER_BASE}${path}`);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.json();
  },
  post: async (path, body) => {
    const res = await fetch(`${TRADER_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.json();
  },
};

// ---------------------------------------------------------------------------
// Shared UI primitives (consistent with console design system)
// ---------------------------------------------------------------------------
function Card({ children, className = '' }) {
  return (
    <div className={`bg-bg-elevated border border-border rounded-lg p-4 ${className}`}>
      {children}
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <h2 className="text-base font-semibold text-text-primary mb-3">{children}</h2>
  );
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
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center gap-4">
      <XCircle size={40} className="text-accent-danger" />
      <div>
        <p className="text-text-primary font-semibold">Trader Service Offline</p>
        <p className="text-sm text-text-secondary mt-1">{message}</p>
        <p className="text-xs text-text-muted mt-2">
          The trader starts automatically with{' '}
          <code className="px-2 py-0.5 bg-bg-elevated rounded font-mono">
            npm run dev
          </code>{' '}
          — make sure the console is running
        </p>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="flex items-center gap-2 px-4 py-2 text-sm bg-accent-primary/10 text-accent-primary rounded-md hover:bg-accent-primary/20 transition-colors"
        >
          <RefreshCw size={14} />
          Retry
        </button>
      )}
    </div>
  );
}

function Loading() {
  return (
    <div className="flex items-center justify-center py-16 text-text-muted text-sm gap-2">
      <RefreshCw size={16} className="animate-spin" />
      Loading…
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Dashboard
// ---------------------------------------------------------------------------
function DashboardTab() {
  const [health, setHealth] = useState(null);
  const [positions, setPositions] = useState([]);
  const [pnl, setPnl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [h, pos, p] = await Promise.all([
        api.get('/health'),
        api.get('/api/positions'),
        api.get('/api/positions/pnl'),
      ]);
      setHealth(h);
      setPositions(pos.positions ?? []);
      setPnl(p.today ?? p);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 10_000);
    return () => clearInterval(id);
  }, [load]);

  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  const killSwitchTriggered = health?.killSwitch === 'triggered';

  return (
    <div className="space-y-6">
      {/* Health row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <div className="text-xs text-text-muted uppercase tracking-wider mb-1">Status</div>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${health?.status === 'ok' || health?.status === 'healthy' ? 'bg-accent-success' : 'bg-accent-danger'}`} />
            <span className="text-sm font-semibold text-text-primary">
              {health?.status === 'ok' || health?.status === 'healthy' ? 'Healthy' : 'Degraded'}
            </span>
          </div>
        </Card>
        <Card>
          <div className="text-xs text-text-muted uppercase tracking-wider mb-1">Mode</div>
          <Badge variant={health?.mode === 'paper' ? 'info' : 'warning'}>
            {health?.mode ?? '—'}
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
            {health?.uptime != null ? `${Math.floor(health.uptime / 60)}m` : '—'}
          </span>
        </Card>
      </div>

      {/* P&L */}
      {pnl && (
        <Card>
          <SectionTitle>Today's P&amp;L</SectionTitle>
          <div className="grid grid-cols-3 gap-6">
            {[
              { label: 'Net', value: pnl.net },
              { label: 'Realized', value: pnl.realized },
              { label: 'Unrealized', value: pnl.unrealized },
            ].map(({ label, value }) => (
              <div key={label}>
                <div className="text-xs text-text-muted mb-1">{label}</div>
                <div
                  className={`text-xl font-semibold font-data ${
                    (value ?? 0) >= 0 ? 'text-accent-success' : 'text-accent-danger'
                  }`}
                >
                  ${(value ?? 0).toFixed(2)}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Positions */}
      <Card>
        <SectionTitle>Open Positions</SectionTitle>
        {positions.length === 0 ? (
          <p className="text-sm text-text-muted">No open positions</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-text-muted border-b border-border">
                <th className="pb-2 font-medium">Symbol</th>
                <th className="pb-2 font-medium">Qty</th>
                <th className="pb-2 font-medium">Avg Price</th>
                <th className="pb-2 font-medium">Market</th>
                <th className="pb-2 font-medium">P&amp;L</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {positions.map((p) => (
                <tr key={p.symbol} className="text-text-primary">
                  <td className="py-2 font-mono font-semibold">{p.symbol}</td>
                  <td className="py-2">{p.qty}</td>
                  <td className="py-2">${p.avgPrice}</td>
                  <td className="py-2">${p.marketPrice}</td>
                  <td className={`py-2 font-data font-semibold ${p.unrealizedPnl >= 0 ? 'text-accent-success' : 'text-accent-danger'}`}>
                    ${p.unrealizedPnl}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Configure Strategy Modal
// ---------------------------------------------------------------------------
function ConfigureModal({ strategy, onClose, onSaved }) {
  // Build an editable flat copy of strategy params
  const [fields, setFields] = useState(() => {
    const p = strategy.params ?? {};
    return Object.entries(p)
      .filter(([k]) => k !== 'symbols') // symbols handled separately
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
      // PUT /api/strategies/:id/params expects params as the request body directly
      const res = await fetch(`http://localhost:3002/api/strategies/${strategy.id}/params`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || `${res.status} ${res.statusText}`);
      }
      onSaved();
      onClose();
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-bg-elevated border border-border rounded-lg p-6 w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-text-primary">Configure: {strategy.name}</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3">
          {fields.map(({ key, value, type }, idx) => (
            <div key={key}>
              <label className="block text-xs text-text-muted mb-1 capitalize">
                {key.replace(/([A-Z])/g, ' $1').trim()}
                <span className="ml-1 text-text-muted opacity-50">({type})</span>
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
            <input
              type="text"
              value={symbolsText}
              onChange={(e) => setSymbolsText(e.target.value.toUpperCase())}
              placeholder="AAPL, MSFT, SPY"
              className="w-full px-2 py-1.5 text-sm bg-bg-secondary border border-border rounded text-text-primary font-mono focus:outline-none focus:border-accent-primary"
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
            className="flex-1 px-4 py-2 text-sm bg-accent-primary text-white rounded hover:bg-accent-primary/90 transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save Parameters'}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm bg-bg-secondary text-text-secondary rounded hover:bg-bg-elevated transition-colors border border-border"
          >
            Cancel
          </button>
        </div>
        <p className="text-xs text-text-muted mt-2">
          Changes apply immediately (in-memory). Restart the trader to reset to defaults.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Strategy Row (with expandable params)
// ---------------------------------------------------------------------------
function StrategyRow({ strategy, onToggle, toggling, onConfigure }) {
  const [expanded, setExpanded] = useState(false);
  const params = strategy.params ?? {};
  const paramEntries = Object.entries(params).filter(([k]) => k !== 'symbols');

  return (
    <>
      <tr className="text-text-primary">
        <td className="py-2">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1.5 font-medium hover:text-accent-primary transition-colors"
          >
            {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            {strategy.name}
          </button>
        </td>
        <td className="py-2 font-mono text-text-muted text-xs">{strategy.version}</td>
        <td className="py-2 text-text-muted text-xs font-mono">
          {(strategy.symbols ?? []).join(', ') || '—'}
        </td>
        <td className="py-2">
          <Badge variant={strategy.enabled ? 'success' : 'default'}>
            {strategy.enabled ? 'Enabled' : 'Disabled'}
          </Badge>
        </td>
        <td className="py-2 text-right">
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
        <tr className="bg-bg-secondary/50">
          <td colSpan={5} className="px-6 py-3">
            <div className="text-xs text-text-muted space-y-1">
              <div className="font-medium text-text-secondary mb-2">Parameters</div>
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
              <div className="mt-2 pt-2 border-t border-border">
                <span className="text-text-muted">Strategy ID: </span>
                <span className="font-mono text-text-muted opacity-70">{strategy.id}</span>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Tab: Strategies
// ---------------------------------------------------------------------------
function StrategiesTab() {
  const [strategies, setStrategies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toggling, setToggling] = useState(null);
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState(null);
  const [configuringStrategy, setConfiguringStrategy] = useState(null);

  // Manual order form state
  const [orderForm, setOrderForm] = useState({ symbol: 'AAPL', side: 'buy', qty: '1', orderType: 'market', limitPrice: '' });
  const [orderResult, setOrderResult] = useState(null);
  const [submittingOrder, setSubmittingOrder] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await api.get('/api/strategies');
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
      await api.post(`/api/strategies/${id}/${enabled ? 'disable' : 'enable'}`, {});
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
      const result = await api.post('/api/strategies/run', {});
      setRunResult({ success: true, message: result.message || 'Strategies executed — check trader logs for signals' });
      await load();
    } catch (err) {
      setRunResult({ success: false, message: err.message });
    } finally {
      setRunning(false);
      // Auto-clear result after 10s
      setTimeout(() => setRunResult(null), 10_000);
    }
  };

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
        ...(orderForm.orderType === 'limit' && orderForm.limitPrice ? { limitPrice: parseFloat(orderForm.limitPrice) } : {}),
      };
      const result = await api.post('/api/orders/submit', body);
      setOrderResult({ success: true, message: `Order submitted! Broker ID: ${result.brokerOrderId}`, data: result });
    } catch (err) {
      setOrderResult({ success: false, message: err.message });
    } finally {
      setSubmittingOrder(false);
    }
  };

  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="space-y-6">
      {configuringStrategy && (
        <ConfigureModal
          strategy={configuringStrategy}
          onClose={() => setConfiguringStrategy(null)}
          onSaved={load}
        />
      )}

      <Card>
        <div className="flex items-center justify-between mb-3">
          <SectionTitle>Trading Strategies</SectionTitle>
          <button
            onClick={runStrategies}
            disabled={running}
            className="flex items-center gap-2 px-3 py-1.5 text-xs bg-accent-primary/10 text-accent-primary rounded hover:bg-accent-primary/20 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={12} className={running ? 'animate-spin' : ''} />
            {running ? 'Running…' : 'Run Strategies Now'}
          </button>
        </div>
        {runResult && (
          <div className={`mb-3 px-3 py-2 text-xs rounded flex items-start gap-2 ${runResult.success ? 'bg-accent-success/10 text-accent-success' : 'bg-accent-danger/10 text-accent-danger'}`}>
            {runResult.success ? <CheckCircle size={12} className="mt-0.5 shrink-0" /> : <XCircle size={12} className="mt-0.5 shrink-0" />}
            {runResult.message}
          </div>
        )}
        {strategies.length === 0 ? (
          <p className="text-sm text-text-muted">No strategies registered</p>
        ) : (
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
        )}
        <p className="text-xs text-text-muted mt-3">
          Click a strategy name to expand parameters. Use the <Settings size={10} className="inline" /> icon to edit them. Strategies run every 5 minutes automatically when enabled.
        </p>
      </Card>

      {/* Manual Order Submission */}
      <Card>
        <SectionTitle>Manual Order (Paper Trading Test)</SectionTitle>
        <form onSubmit={submitOrder} className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs text-text-muted mb-1">Symbol</label>
              <input
                type="text"
                value={orderForm.symbol}
                onChange={(e) => setOrderForm({ ...orderForm, symbol: e.target.value.toUpperCase() })}
                className="w-full px-2 py-1.5 text-sm bg-bg-secondary border border-border rounded text-text-primary font-mono focus:outline-none focus:border-accent-primary"
                placeholder="AAPL"
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
                <option value="sell">Sell</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">Qty</label>
              <input
                type="number"
                value={orderForm.qty}
                onChange={(e) => setOrderForm({ ...orderForm, qty: e.target.value })}
                className="w-full px-2 py-1.5 text-sm bg-bg-secondary border border-border rounded text-text-primary focus:outline-none focus:border-accent-primary"
                min="1"
                step="1"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">Type</label>
              <select
                value={orderForm.orderType}
                onChange={(e) => setOrderForm({ ...orderForm, orderType: e.target.value })}
                className="w-full px-2 py-1.5 text-sm bg-bg-secondary border border-border rounded text-text-primary focus:outline-none focus:border-accent-primary"
              >
                <option value="market">Market</option>
                <option value="limit">Limit</option>
              </select>
            </div>
          </div>
          {orderForm.orderType === 'limit' && (
            <div className="w-48">
              <label className="block text-xs text-text-muted mb-1">Limit Price ($)</label>
              <input
                type="number"
                value={orderForm.limitPrice}
                onChange={(e) => setOrderForm({ ...orderForm, limitPrice: e.target.value })}
                className="w-full px-2 py-1.5 text-sm bg-bg-secondary border border-border rounded text-text-primary font-mono focus:outline-none focus:border-accent-primary"
                step="0.01"
                min="0.01"
                required
              />
            </div>
          )}
          {orderResult && (
            <div className={`px-3 py-2 text-xs rounded ${orderResult.success ? 'bg-accent-success/10 text-accent-success' : 'bg-accent-danger/10 text-accent-danger'}`}>
              {orderResult.message}
            </div>
          )}
          <button
            type="submit"
            disabled={submittingOrder}
            className="px-4 py-2 text-sm bg-accent-primary text-white rounded hover:bg-accent-primary/90 transition-colors disabled:opacity-50"
          >
            {submittingOrder ? 'Submitting…' : `Submit ${orderForm.side === 'buy' ? 'Buy' : 'Sell'} Order`}
          </button>
          <p className="text-xs text-text-muted">
            Orders route through the risk engine and submit to Alpaca paper trading. Market orders execute immediately.
          </p>
        </form>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Risk
// ---------------------------------------------------------------------------
function RiskTab() {
  const [limits, setLimits] = useState([]);
  const [breaches, setBreaches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [limitsData, breachData] = await Promise.all([
        api.get('/api/risk/limits'),
        api.get('/api/risk/breaches'),
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
    <div className="space-y-6">
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
                  <td className="py-2 font-medium">{l.limitType.replace(/_/g, ' ')}</td>
                  <td className="py-2 font-data font-semibold">{l.value}</td>
                  <td className="py-2 text-text-muted">{l.unit}</td>
                  <td className="py-2 text-text-muted text-xs">
                    {new Date(l.updatedAt).toLocaleString()}
                  </td>
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
            <CheckCircle size={16} />
            No breaches detected
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
                  <td className="py-2 text-xs text-text-muted">
                    {new Date(b.timestamp).toLocaleString()}
                  </td>
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

// ---------------------------------------------------------------------------
// Tab: Kill Switch
// ---------------------------------------------------------------------------
function KillSwitchTab() {
  const [status, setStatus] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reason, setReason] = useState('');
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [s, e] = await Promise.all([
        api.get('/api/kill-switch/status'),
        api.get('/api/kill-switch/events'),
      ]);
      setStatus(s);
      setEvents(e.events ?? []);
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
      await api.post('/api/kill-switch/trigger', { mode, reason });
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
      await api.post('/api/kill-switch/reset', {});
      await load();
    } catch (err) {
      alert(`Failed: ${err.message}`);
    } finally {
      setActing(false);
    }
  };

  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  const isTriggered = status?.status === 'triggered';

  return (
    <div className="space-y-6">
      {/* Status card */}
      <Card className={isTriggered ? 'border-accent-danger' : 'border-accent-success'}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Power size={24} className={isTriggered ? 'text-accent-danger' : 'text-accent-success'} />
            <div>
              <div className="text-xs text-text-muted uppercase tracking-wider">Kill Switch Status</div>
              <div className={`text-lg font-bold ${isTriggered ? 'text-accent-danger' : 'text-accent-success'}`}>
                {isTriggered ? 'TRIGGERED — Trading Halted' : 'Armed / Ready'}
              </div>
              {status?.mode && (
                <div className="text-xs text-text-muted mt-0.5">Mode: {status.mode}</div>
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
              <strong>Soft:</strong> stops new orders &nbsp;|&nbsp; <strong>Hard:</strong> cancels all orders and flattens all positions
            </p>
          </div>
        </Card>
      )}

      {/* Event log */}
      <Card>
        <SectionTitle>Event History</SectionTitle>
        {events.length === 0 ? (
          <p className="text-sm text-text-muted">No kill switch events recorded</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-text-muted border-b border-border">
                <th className="pb-2 font-medium">Timestamp</th>
                <th className="pb-2 font-medium">Trigger</th>
                <th className="pb-2 font-medium">Reason</th>
                <th className="pb-2 font-medium">Actor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {events.map((ev) => (
                <tr key={ev.eventId} className="text-text-primary">
                  <td className="py-2 text-xs text-text-muted">
                    {new Date(ev.timestamp).toLocaleString()}
                  </td>
                  <td className="py-2">
                    <Badge variant={ev.trigger === 'hard' ? 'danger' : 'warning'}>
                      {ev.trigger}
                    </Badge>
                  </td>
                  <td className="py-2">{ev.reason}</td>
                  <td className="py-2 text-text-muted">{ev.actor}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root page
// ---------------------------------------------------------------------------
const TABS = [
  { id: 'dashboard',   label: 'Dashboard',    icon: TrendingUp },
  { id: 'strategies',  label: 'Strategies',   icon: Activity },
  { id: 'risk',        label: 'Risk',         icon: Shield },
  { id: 'kill-switch', label: 'Kill Switch',  icon: AlertTriangle },
];

export default function TradingPage() {
  const [activeTab, setActiveTab] = useState('dashboard');

  return (
    <div className="h-full flex flex-col">
      {/* Page header */}
      <div className="border-b border-border bg-bg-secondary px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">OpenClaw Trader</h1>
          <p className="text-sm text-text-secondary mt-0.5">
            Algorithmic trading engine &mdash; paper mode
          </p>
        </div>
        <a
          href={TRADER_BASE}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-3 py-1.5 text-xs text-accent-primary hover:text-accent-primary/80 transition-colors"
        >
          <ExternalLink size={13} />
          localhost:3002
        </a>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-border bg-bg-secondary px-6 gap-1">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 px-4 py-3 text-sm border-b-2 transition-colors ${
              activeTab === id
                ? 'border-accent-primary text-accent-primary font-medium'
                : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto p-6">
        {activeTab === 'dashboard'   && <DashboardTab />}
        {activeTab === 'strategies'  && <StrategiesTab />}
        {activeTab === 'risk'        && <RiskTab />}
        {activeTab === 'kill-switch' && <KillSwitchTab />}
      </div>
    </div>
  );
}
