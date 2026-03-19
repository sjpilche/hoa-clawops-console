/**
 * @file TradingPage.jsx
 * @description OpenClaw Trader module — integrates the trader-service (port 3002).
 *
 * TABS:
 *  - Dashboard       : Service health, P&L, positions, brain learning, cost tracking
 *  - AI Panel        : 4 analysts, consensus picks, manual trigger, run history
 *  - Brain           : 4-layer brain stats, episodes, knowledge base, distillation
 *  - Performance     : Per-analyst win rate, P&L attribution, symbol breakdown
 *  - Strategies      : List + enable/disable/configure strategies + manual run
 *  - Orders          : Order history + manual order submission
 *  - Risk            : Risk limits and breach history
 *  - Broker          : Alpaca account info + live quote lookup
 *  - Kill Switch     : Emergency stop controls + event log
 *
 * Auth note: The trader bypasses JWT auth in dev mode (no CONSOLE_JWT_PUBLIC_KEY set),
 * so all protected routes work without sending a token.
 *
 * REQUIRES: openclaw-trader running on http://localhost:3002
 */

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  TrendingUp, Activity, AlertTriangle, Shield, RefreshCw,
  ExternalLink, CheckCircle, XCircle, Power, ChevronDown,
  ChevronRight, Settings, X, Server, ShoppingCart, DollarSign,
  Wifi, WifiOff, Brain, Zap, Target, BarChart3, Users,
  Clock, Play, Eye, Award, Skull, BookOpen,
} from 'lucide-react';

const TRADER_BASE = import.meta.env.VITE_TRADER_URL || 'http://localhost:3002';

// ─── API client ───────────────────────────────────────────────────────────────
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

function SectionTitle({ children, action }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-sm font-semibold text-text-primary">{children}</h2>
      {action}
    </div>
  );
}

function Badge({ children, variant = 'default' }) {
  const styles = {
    default: 'bg-bg-secondary text-text-muted',
    success: 'bg-accent-success/10 text-accent-success',
    danger:  'bg-accent-danger/10 text-accent-danger',
    warning: 'bg-accent-warning/10 text-accent-warning',
    info:    'bg-accent-info/10 text-accent-info',
    purple:  'bg-purple-500/10 text-purple-400',
  };
  return (
    <span className={`px-2 py-0.5 text-xs rounded font-medium ${styles[variant] || styles.default}`}>
      {children}
    </span>
  );
}

function StatCard({ label, value, sub, variant, icon: Icon }) {
  const colors = {
    success: 'text-accent-success',
    danger: 'text-accent-danger',
    warning: 'text-accent-warning',
    info: 'text-accent-info',
    purple: 'text-purple-400',
  };
  return (
    <Card>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs text-text-muted uppercase tracking-wider mb-1">{label}</div>
          <div className={`text-lg font-bold font-mono ${colors[variant] || 'text-text-primary'}`}>{value}</div>
          {sub && <div className="text-xs text-text-muted mt-0.5">{sub}</div>}
        </div>
        {Icon && <Icon size={16} className={`${colors[variant] || 'text-text-muted'} mt-1 opacity-50`} />}
      </div>
    </Card>
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
          {isDbError ? 'This feature requires PostgreSQL (port 5433).' : message}
        </p>
        {isOffline && (
          <p className="text-xs text-text-muted mt-2">
            Start with <code className="px-1.5 py-0.5 bg-bg-elevated rounded font-mono">pm2 start ecosystem.config.cjs</code>
          </p>
        )}
      </div>
      {onRetry && (
        <button onClick={onRetry} className="flex items-center gap-2 px-4 py-2 text-sm bg-accent-primary/10 text-accent-primary rounded hover:bg-accent-primary/20 transition-colors">
          <RefreshCw size={14} /> Retry
        </button>
      )}
    </div>
  );
}

function Loading({ label = 'Loading...' }) {
  return (
    <div className="flex items-center justify-center py-16 text-text-muted text-sm gap-2">
      <RefreshCw size={16} className="animate-spin" /> {label}
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

function RefreshBtn({ onClick, size = 11 }) {
  return (
    <button onClick={onClick} className="text-xs text-text-muted hover:text-text-primary flex items-center gap-1">
      <RefreshCw size={size} /> Refresh
    </button>
  );
}

function MiniBar({ value, max, color = 'bg-accent-primary' }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="w-full h-1.5 bg-bg-secondary rounded-full overflow-hidden">
      <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function WinRateRing({ wins, total }) {
  const pct = total > 0 ? Math.round((wins / total) * 100) : 0;
  const circumference = 2 * Math.PI * 18;
  const offset = circumference - (pct / 100) * circumference;
  const color = pct >= 60 ? '#22c55e' : pct >= 40 ? '#eab308' : '#ef4444';
  return (
    <div className="relative w-12 h-12">
      <svg className="w-12 h-12 -rotate-90" viewBox="0 0 40 40">
        <circle cx="20" cy="20" r="18" fill="none" stroke="currentColor" strokeWidth="3" className="text-bg-secondary" />
        <circle cx="20" cy="20" r="18" fill="none" stroke={color} strokeWidth="3"
          strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-xs font-bold text-text-primary">{pct}%</div>
    </div>
  );
}

// ─── Tab: Dashboard (UPGRADED) ───────────────────────────────────────────────

function DashboardTab() {
  const [health, setHealth] = useState(null);
  const [positions, setPositions] = useState([]);
  const [pnl, setPnl] = useState(null);
  const [account, setAccount] = useState(null);
  const [brainStats, setBrainStats] = useState(null);
  const [schedulerStatus, setSchedulerStatus] = useState(null);
  const [costSummary, setCostSummary] = useState(null);
  const [panelStatus, setPanelStatus] = useState(null);
  const [growth, setGrowth] = useState(null);
  const [decisions, setDecisions] = useState([]);
  const [perfSummary, setPerfSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [seeding, setSeeding] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [h, pos, p, acc, bs, ss, cs, ps, gr, dec, perf] = await Promise.all([
        traderApi.get('/health'),
        traderApi.get('/api/positions'),
        traderApi.get('/api/positions/pnl').catch(() => null),
        traderApi.get('/api/broker/account').catch(() => null),
        traderApi.get('/api/brain/stats').catch(() => null),
        traderApi.get('/api/brain/scheduler').catch(() => null),
        traderApi.get('/api/brain/cost-summary').catch(() => null),
        traderApi.get('/api/ai-panel/status').catch(() => null),
        traderApi.get('/api/brain/growth').catch(() => null),
        traderApi.get('/api/brain/decisions?limit=10').catch(() => ({ decisions: [] })),
        traderApi.get('/api/performance/summary').catch(() => null),
      ]);
      setHealth(h);
      setPositions(pos.positions ?? []);
      setPnl(p);
      setAccount(acc?.account ?? null);
      setBrainStats(bs);
      setSchedulerStatus(ss);
      setCostSummary(cs);
      setPanelStatus(ps);
      setGrowth(gr);
      setDecisions(dec?.decisions || []);
      setPerfSummary(perf);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const seedStartingBalance = async () => {
    setSeeding(true);
    try {
      await traderApi.post('/api/brain/seed-snapshot', {});
      await load();
    } catch (err) {
      console.error('Seed failed:', err);
    } finally {
      setSeeding(false);
    }
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 15_000);
    return () => clearInterval(id);
  }, [load]);

  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  const isHealthy = health?.status === 'healthy';
  const killSwitchTriggered = health?.killSwitch === 'triggered';
  const activeAnalysts = panelStatus?.analysts?.filter(a => a.status === 'active')?.length || 0;
  const totalAnalysts = panelStatus?.analysts?.length || 4;

  return (
    <div className="space-y-5">
      {killSwitchTriggered && (
        <div className="flex items-center gap-3 px-4 py-3 bg-accent-danger/10 border border-accent-danger/30 rounded-lg">
          <AlertTriangle size={18} className="text-accent-danger shrink-0" />
          <p className="text-sm text-accent-danger font-medium">
            KILL SWITCH TRIGGERED — All trading is halted. Go to Kill Switch tab to reset.
          </p>
        </div>
      )}

      {/* ═══ STRATEGY HEALTH BANNER ═══ */}
      {perfSummary && (
        <div className={`rounded-lg border ${
          perfSummary.verdict === 'green' ? 'bg-accent-success/5 border-accent-success/30' :
          perfSummary.verdict === 'red' ? 'bg-accent-danger/5 border-accent-danger/30' :
          'bg-bg-secondary border-border'
        }`}>
          {/* Header row */}
          <div className={`px-4 py-2.5 border-b flex items-center justify-between ${
            perfSummary.verdict === 'green' ? 'border-accent-success/20' :
            perfSummary.verdict === 'red' ? 'border-accent-danger/20' :
            'border-border'
          }`}>
            <div className="flex items-center gap-2">
              <Activity size={13} className="text-text-muted" />
              <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">Strategy Health</span>
            </div>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
              perfSummary.verdict === 'green' ? 'bg-accent-success/15 text-accent-success' :
              perfSummary.verdict === 'red' ? 'bg-accent-danger/15 text-accent-danger' :
              'bg-bg-elevated text-text-muted'
            }`}>
              {perfSummary.verdict === 'green' ? 'Profitable' : perfSummary.verdict === 'red' ? 'Underperforming' : 'Warming Up'}
            </span>
          </div>

          {/* Stats row */}
          <div className="px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div>
                <div className="text-[10px] text-text-muted uppercase tracking-wider mb-0.5">Total P&amp;L</div>
                <div className={`text-xl font-bold tabular-nums ${
                  perfSummary.totalPnl >= 0 ? 'text-accent-success' : 'text-accent-danger'
                }`}>
                  {perfSummary.totalPnl >= 0 ? '+' : ''}${perfSummary.totalPnl?.toFixed(2)}
                  <span className="text-sm font-normal ml-1 opacity-70">({perfSummary.totalPnlPercent?.toFixed(2)}%)</span>
                </div>
              </div>
              <div className="w-px h-8 bg-border/60" />
              <div className="text-xs text-text-muted leading-relaxed">
                {perfSummary.verdictText}
              </div>
            </div>
            <div className="flex items-center gap-5 text-xs text-text-muted">
              <div className="text-center">
                <div className="text-sm font-bold text-text-primary tabular-nums">{perfSummary.totalTrades}</div>
                <div>Trades</div>
              </div>
              <div className="text-center">
                <div className="text-sm font-bold text-text-primary tabular-nums">{(perfSummary.winRate * 100).toFixed(0)}%</div>
                <div>Win Rate</div>
              </div>
              <div className="text-center">
                <div className="text-sm font-bold text-text-primary tabular-nums">{perfSummary.sharpeRatio?.toFixed(2)}</div>
                <div>Sharpe</div>
              </div>
              <div className="text-center">
                <div className="text-sm font-bold text-text-primary tabular-nums">{perfSummary.maxDrawdownPercent?.toFixed(1)}%</div>
                <div>Max DD</div>
              </div>
              <div className="text-center">
                <div className="text-sm font-bold text-text-primary tabular-nums">{perfSummary.profitFactor?.toFixed(2)}</div>
                <div>Profit Factor</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Account Overview */}
      {account && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <StatCard label="Portfolio Value"
            value={`$${parseFloat(account.portfolioValue || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
            variant="info" icon={DollarSign} />
          <StatCard label="Cash"
            value={`$${parseFloat(account.cash || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
            variant="success" icon={DollarSign} />
          <StatCard label="Buying Power"
            value={`$${parseFloat(account.buyingPower || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
            sub={`Equity: $${parseFloat(account.equity || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
            variant="info" icon={TrendingUp} />
          <StatCard label="Today's P&L"
            value={pnl ? `${(pnl.today?.net ?? pnl.net ?? 0) >= 0 ? '+' : ''}$${(pnl.today?.net ?? pnl.net ?? 0).toFixed(2)}` : '--'}
            variant={(pnl?.today?.net ?? pnl?.net ?? 0) >= 0 ? 'success' : 'danger'} icon={TrendingUp} />
          <StatCard label="Brain Episodes"
            value={brainStats?.available ? brainStats.episodes : '--'}
            sub={brainStats?.available ? `${brainStats.knowledge} KB patterns` : 'Not connected'}
            variant="purple" icon={Brain} />
          <StatCard label="Panel Runs"
            value={schedulerStatus?.available ? schedulerStatus.totalRuns : '--'}
            sub={schedulerStatus?.available ? `${schedulerStatus.totalErrors} errors` : 'Not available'}
            variant="info" icon={Zap} />
        </div>
      )}

      {/* Fallback if no account */}
      {!account && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Status" value={isHealthy ? 'Healthy' : 'Degraded'}
            variant={isHealthy ? 'success' : 'danger'} icon={Activity} />
          <StatCard label="Today's P&L"
            value={pnl ? `${(pnl.today?.net ?? pnl.net ?? 0) >= 0 ? '+' : ''}$${(pnl.today?.net ?? pnl.net ?? 0).toFixed(2)}` : '--'}
            variant={(pnl?.today?.net ?? pnl?.net ?? 0) >= 0 ? 'success' : 'danger'} icon={TrendingUp} />
          <StatCard label="Brain Episodes"
            value={brainStats?.available ? brainStats.episodes : '--'}
            sub={brainStats?.available ? `${brainStats.knowledge} KB patterns` : 'Not connected'}
            variant="purple" icon={Brain} />
          <StatCard label="Panel Runs"
            value={schedulerStatus?.available ? schedulerStatus.totalRuns : '--'}
            sub={schedulerStatus?.available ? `${schedulerStatus.totalErrors} errors` : 'Not available'}
            variant="info" icon={Zap} />
        </div>
      )}

      {/* Status bar */}
      <Card>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${isHealthy ? 'bg-accent-success animate-pulse' : 'bg-accent-danger'}`} />
              <span className="text-text-primary font-medium">{isHealthy ? 'Healthy' : 'Degraded'}</span>
            </div>
            <Badge variant={health?.mode === 'paper' ? 'info' : 'danger'}>{(health?.mode || 'paper').toUpperCase()}</Badge>
            <Badge variant={killSwitchTriggered ? 'danger' : 'success'}>{killSwitchTriggered ? 'KILL SWITCH' : 'Armed'}</Badge>
            {account && <Badge variant={account.status === 'ACTIVE' ? 'success' : 'warning'}>{account.status}</Badge>}
            {account?.patternDayTrader && <Badge variant="warning">PDT</Badge>}
          </div>
          <div className="flex items-center gap-4 text-xs text-text-muted">
            {account && <span>Acct: {account.accountNumber}</span>}
            <span>Uptime: {health?.uptime != null ? (health.uptime < 3600 ? `${Math.floor(health.uptime / 60)}m` : `${Math.floor(health.uptime / 3600)}h ${Math.floor((health.uptime % 3600) / 60)}m`) : '-'}</span>
            {account && <span>Day Trades: {account.daytradeCount}</span>}
          </div>
        </div>
      </Card>

      {/* Investment Growth Tracker */}
      {growth?.available ? (
        <Card>
          <SectionTitle action={<RefreshBtn onClick={load} />}>Investment Growth</SectionTitle>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
            <div>
              <div className="text-xs text-text-muted">Starting Balance</div>
              <div className="text-lg font-bold font-mono text-text-primary">
                ${parseFloat(growth.startingBalance).toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
              <div className="text-xs text-text-muted">{growth.startDate ? new Date(growth.startDate).toLocaleDateString() : ''}</div>
            </div>
            <div>
              <div className="text-xs text-text-muted">Current Balance</div>
              <div className="text-lg font-bold font-mono text-text-primary">
                ${parseFloat(growth.currentBalance).toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
              <div className="text-xs text-text-muted">{growth.latestDate ? new Date(growth.latestDate).toLocaleDateString() : 'now'}</div>
            </div>
            <div>
              <div className="text-xs text-text-muted">Absolute Growth</div>
              <div className={`text-lg font-bold font-mono ${growth.absoluteGrowth >= 0 ? 'text-accent-success' : 'text-accent-danger'}`}>
                {growth.absoluteGrowth >= 0 ? '+' : ''}${growth.absoluteGrowth.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
            </div>
            <div>
              <div className="text-xs text-text-muted">Percent Growth</div>
              <div className={`text-lg font-bold font-mono ${growth.percentGrowth >= 0 ? 'text-accent-success' : 'text-accent-danger'}`}>
                {growth.percentGrowth >= 0 ? '+' : ''}{growth.percentGrowth.toFixed(2)}%
              </div>
            </div>
            <div>
              <div className="text-xs text-text-muted">Snapshots</div>
              <div className="text-lg font-bold font-mono text-text-primary">{growth.snapshotCount}</div>
              <div className="text-xs text-text-muted">data points</div>
            </div>
          </div>

          {/* Equity curve chart */}
          {growth.dailyHistory?.length > 1 && (() => {
            const data = growth.dailyHistory;
            const values = data.map(d => d.close_value);
            const min = Math.min(...values);
            const max = Math.max(...values);
            const range = max - min || 1;
            const chartH = 80;

            return (
              <div className="border-t border-border pt-3">
                <div className="text-xs text-text-muted mb-2">Equity Curve (daily close)</div>
                <div className="relative" style={{ height: chartH }}>
                  <svg width="100%" height={chartH} preserveAspectRatio="none" viewBox={`0 0 ${data.length - 1} ${chartH}`}>
                    {/* Area fill */}
                    <path
                      d={data.map((d, i) => {
                        const x = i;
                        const y = chartH - ((d.close_value - min) / range) * (chartH - 8) - 4;
                        return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
                      }).join(' ') + ` L ${data.length - 1} ${chartH} L 0 ${chartH} Z`}
                      fill={growth.percentGrowth >= 0 ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)'}
                    />
                    {/* Line */}
                    <path
                      d={data.map((d, i) => {
                        const x = i;
                        const y = chartH - ((d.close_value - min) / range) * (chartH - 8) - 4;
                        return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
                      }).join(' ')}
                      fill="none"
                      stroke={growth.percentGrowth >= 0 ? '#22c55e' : '#ef4444'}
                      strokeWidth="0.15"
                      vectorEffect="non-scaling-stroke"
                    />
                  </svg>
                  {/* Y-axis labels */}
                  <div className="absolute top-0 right-0 text-xs font-mono text-text-muted">${max.toLocaleString('en-US', { maximumFractionDigits: 0 })}</div>
                  <div className="absolute bottom-0 right-0 text-xs font-mono text-text-muted">${min.toLocaleString('en-US', { maximumFractionDigits: 0 })}</div>
                </div>
                <div className="flex justify-between text-xs text-text-muted mt-1">
                  <span>{data[0]?.day}</span>
                  <span>{data[data.length - 1]?.day}</span>
                </div>
              </div>
            );
          })()}
        </Card>
      ) : (
        <Card>
          <SectionTitle>Investment Growth</SectionTitle>
          <div className="flex items-center justify-between">
            <p className="text-sm text-text-muted">
              No balance history yet. Seed the starting balance to begin tracking growth.
            </p>
            <button onClick={seedStartingBalance} disabled={seeding}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-accent-primary/10 text-accent-primary rounded-lg hover:bg-accent-primary/20 transition-colors disabled:opacity-50">
              <TrendingUp size={14} /> {seeding ? 'Seeding...' : 'Set Starting Balance'}
            </button>
          </div>
        </Card>
      )}

      {/* AI Panel Status + Cost Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Analyst Fleet */}
        <Card>
          <SectionTitle>AI Analyst Fleet</SectionTitle>
          <div className="space-y-2">
            {(panelStatus?.analysts || []).map(a => (
              <div key={a.name} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${a.status === 'active' ? 'bg-accent-success' : 'bg-accent-danger'}`} />
                  <span className="text-text-primary">{a.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={a.tier === 0 ? 'success' : a.tier === 1 ? 'info' : 'purple'}>
                    T{a.tier} {a.provider}
                  </Badge>
                </div>
              </div>
            ))}
            {!panelStatus?.analysts?.length && (
              <p className="text-xs text-text-muted">Panel not initialized</p>
            )}
            <div className="text-xs text-text-muted pt-2 border-t border-border">
              {activeAnalysts}/{totalAnalysts} active | {panelStatus?.dryRun ? 'DRY RUN' : 'LIVE'} | {panelStatus?.schedule || '3min interval'}
            </div>
          </div>
        </Card>

        {/* Brain Learning */}
        <Card>
          <SectionTitle>Brain Learning</SectionTitle>
          {brainStats?.available ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Observations', val: brainStats.observations, icon: Eye },
                  { label: 'Feedback', val: brainStats.feedback, icon: Target },
                  { label: 'Episodes', val: brainStats.episodes, icon: BookOpen },
                  { label: 'Knowledge', val: brainStats.knowledge, icon: Award },
                ].map(({ label, val, icon: Ic }) => (
                  <div key={label} className="flex items-center gap-2 text-sm">
                    <Ic size={12} className="text-purple-400 shrink-0" />
                    <span className="text-text-muted">{label}:</span>
                    <span className="font-mono font-semibold text-text-primary">{val}</span>
                  </div>
                ))}
              </div>
              <div className="text-xs text-text-muted pt-2 border-t border-border">
                Distillation: daily 4:15 PM ET | Promotes winning patterns to KB
              </div>
            </div>
          ) : (
            <p className="text-sm text-text-muted">Brain not connected — running without learning</p>
          )}
        </Card>

        {/* Cost Tracker */}
        <Card>
          <SectionTitle>Cost Tracker (30d)</SectionTitle>
          {costSummary?.available ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-text-muted">Total Runs</div>
                  <div className="text-lg font-bold font-mono text-text-primary">{costSummary.totalRuns}</div>
                </div>
                <div>
                  <div className="text-xs text-text-muted">Est. Cost</div>
                  <div className="text-lg font-bold font-mono text-accent-success">${costSummary.estimatedTotalCost}</div>
                </div>
              </div>
              <div className="text-xs text-text-muted">
                ~${costSummary.costPerRun}/run | 2 Ollama ($0) + 1 GPT-4o-mini + 1 Grok
              </div>
              {costSummary.dailyBreakdown?.length > 0 && (
                <div className="flex gap-0.5 items-end h-8 pt-1 border-t border-border">
                  {costSummary.dailyBreakdown.slice(0, 14).reverse().map((d, i) => {
                    const max = Math.max(...costSummary.dailyBreakdown.slice(0, 14).map(x => x.runs));
                    const h = max > 0 ? Math.max((d.runs / max) * 100, 4) : 4;
                    return <div key={i} className="flex-1 bg-accent-primary/40 rounded-t" style={{ height: `${h}%` }}
                      title={`${d.day}: ${d.runs} runs`} />;
                  })}
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-text-muted">No cost data yet</p>
          )}
        </Card>
      </div>

      {/* Scheduler Status Bar */}
      {schedulerStatus?.available && (
        <Card className={schedulerStatus.locked ? 'border-accent-warning' : ''}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${schedulerStatus.running ? 'bg-accent-success animate-pulse' : 'bg-accent-danger'}`} />
              <div>
                <span className="text-sm font-medium text-text-primary">
                  Scheduler: {schedulerStatus.running ? 'Running' : 'Stopped'}
                </span>
                {schedulerStatus.locked && <span className="ml-2 text-xs text-accent-warning">(Panel executing...)</span>}
              </div>
            </div>
            <div className="flex items-center gap-4 text-xs text-text-muted">
              <span>Interval: {(schedulerStatus.intervalMs / 1000)}s</span>
              <span>Market: {schedulerStatus.marketHours ? <span className="text-accent-success">Open</span> : <span className="text-accent-warning">Closed</span>}</span>
              <span>Mode: {schedulerStatus.dryRun ? <span className="text-accent-warning">Dry Run</span> : <span className="text-accent-success">Live</span>}</span>
            </div>
          </div>
        </Card>
      )}

      {/* Recent Trade Decisions — WHY the AI traded */}
      {decisions.length > 0 && (
        <Card>
          <SectionTitle action={<RefreshBtn onClick={load} />}>Recent AI Decisions</SectionTitle>
          <div className="space-y-4">
            {decisions.map((d, di) => (
              <div key={di} className="border border-border rounded-lg overflow-hidden">
                {/* Decision header */}
                <div className="flex items-center justify-between bg-bg-secondary px-4 py-2">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <Zap size={14} className="text-purple-400" />
                      <span className="text-sm font-semibold text-text-primary">{d.analyst}</span>
                    </div>
                    <Badge variant="info">{d.provider}</Badge>
                    <span className="text-xs text-text-muted">{d.picks?.length || 0} pick{d.picks?.length !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-text-muted">
                    {d.latencyMs && <span>{d.latencyMs}ms</span>}
                    {d.costUsd != null && <span className="font-mono">${d.costUsd.toFixed(4)}</span>}
                    <span>{d.timestamp ? new Date(d.timestamp).toLocaleString() : ''}</span>
                  </div>
                </div>

                {/* Market commentary */}
                {d.commentary && (
                  <div className="px-4 py-2 border-b border-border bg-bg-secondary/30">
                    <p className="text-xs text-text-secondary italic">"{d.commentary}"</p>
                  </div>
                )}

                {/* Individual picks with full reasoning */}
                {(d.picks || []).map((pick, pi) => (
                  <div key={pi} className={`px-4 py-3 ${pi > 0 ? 'border-t border-border' : ''}`}>
                    <div className="flex items-start gap-3">
                      {/* Side indicator */}
                      <div className={`w-1 self-stretch rounded-full shrink-0 ${pick.side === 'buy' ? 'bg-accent-success' : 'bg-accent-danger'}`} />

                      <div className="flex-1 min-w-0">
                        {/* Symbol + meta row */}
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-mono font-bold text-text-primary">{pick.symbol}</span>
                          <Badge variant={pick.side === 'buy' ? 'success' : 'danger'}>{pick.side.toUpperCase()}</Badge>
                          <Badge variant="purple">{pick.opportunityType?.replace(/_/g, ' ')}</Badge>
                          <div className="flex items-center gap-0.5">
                            {[1,2,3,4,5].map(n => (
                              <div key={n} className={`w-1.5 h-3 rounded-sm ${n <= (pick.conviction || 0) ? 'bg-accent-primary' : 'bg-bg-secondary'}`} />
                            ))}
                            <span className="text-xs text-text-muted ml-1">{pick.conviction}/5</span>
                          </div>
                          {pick.horizon && <span className="text-xs text-text-muted">{pick.horizon?.replace(/_/g, ' ')}</span>}
                        </div>

                        {/* Thesis — the WHY */}
                        {pick.thesis && (
                          <p className="text-sm text-text-primary mb-1.5">{pick.thesis}</p>
                        )}

                        {/* Risks + Catalysts */}
                        <div className="flex gap-4 flex-wrap text-xs">
                          {pick.risks && (
                            <div className="flex items-start gap-1">
                              <AlertTriangle size={11} className="text-accent-warning mt-0.5 shrink-0" />
                              <span className="text-text-muted"><span className="text-accent-warning font-medium">Risk:</span> {pick.risks}</span>
                            </div>
                          )}
                          {pick.catalysts?.length > 0 && (
                            <div className="flex items-start gap-1">
                              <Zap size={11} className="text-accent-success mt-0.5 shrink-0" />
                              <span className="text-text-muted"><span className="text-accent-success font-medium">Catalysts:</span> {pick.catalysts.join(', ')}</span>
                            </div>
                          )}
                        </div>

                        {/* Price targets */}
                        {(pick.targetPrice || pick.stopLoss) && (
                          <div className="flex gap-3 mt-1.5 text-xs">
                            {pick.targetPrice && (
                              <span className="text-text-muted">Target: <span className="font-mono text-accent-success">${pick.targetPrice}</span></span>
                            )}
                            {pick.stopLoss && (
                              <span className="text-text-muted">Stop: <span className="font-mono text-accent-danger">${pick.stopLoss}</span></span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}

                {/* No picks message */}
                {(!d.picks || d.picks.length === 0) && (
                  <div className="px-4 py-3 text-xs text-text-muted">No actionable picks this run</div>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Open Positions */}
      <Card>
        <SectionTitle action={<RefreshBtn onClick={load} />}>Open Positions</SectionTitle>
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
                  <th className="pb-2 font-medium">Unrealized P&L</th>
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

// ─── Tab: AI Panel ───────────────────────────────────────────────────────────

function AIPanelTab() {
  const [panelStatus, setPanelStatus] = useState(null);
  const [schedulerStatus, setSchedulerStatus] = useState(null);
  const [recentRuns, setRecentRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [running, setRunning] = useState(false);
  const [lastResult, setLastResult] = useState(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [ps, ss, runs] = await Promise.all([
        traderApi.get('/api/ai-panel/status'),
        traderApi.get('/api/brain/scheduler').catch(() => null),
        traderApi.get('/api/brain/panel-runs?limit=10').catch(() => ({ runs: [] })),
      ]);
      setPanelStatus(ps);
      setSchedulerStatus(ss);
      setRecentRuns(runs.runs || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); const id = setInterval(load, 10_000); return () => clearInterval(id); }, [load]);

  const triggerRun = async (dryRun = false) => {
    setRunning(true);
    setLastResult(null);
    try {
      const result = await traderApi.post('/api/brain/trigger-run', {
        reason: `Console UI — ${dryRun ? 'dry run' : 'live'}`,
        dryRun,
      });
      if (result.triggered === false) {
        setLastResult({ error: result.message || 'Panel is currently executing — try again in a moment' });
      } else {
        setLastResult(result);
      }
      await load();
    } catch (err) {
      setLastResult({ error: err.message });
    } finally {
      setRunning(false);
    }
  };

  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  const tierColors = { 0: 'success', 1: 'info', 2: 'purple' };
  const tierLabels = { 0: 'Ollama ($0)', 1: 'GPT-4o-mini', 2: 'Grok' };

  return (
    <div className="space-y-5">
      {/* Analyst Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {(panelStatus?.analysts || []).map(a => (
          <Card key={a.name} className={a.status !== 'active' ? 'opacity-60' : ''}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-text-primary">{a.name}</span>
              <span className={`w-2 h-2 rounded-full ${a.status === 'active' ? 'bg-accent-success' : 'bg-accent-danger'}`} />
            </div>
            <Badge variant={tierColors[a.tier]}>{tierLabels[a.tier]}</Badge>
            <div className="text-xs text-text-muted mt-2">
              Tier {a.tier} | {a.provider} | {a.status === 'active' ? 'Ready' : 'No API Key'}
            </div>
          </Card>
        ))}
      </div>

      {/* Run Controls */}
      <Card>
        <SectionTitle>Panel Controls</SectionTitle>
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={() => triggerRun(false)} disabled={running}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-accent-success/10 text-accent-success rounded-lg hover:bg-accent-success/20 transition-colors disabled:opacity-50">
            <Play size={14} /> {running ? 'Running...' : 'Run Panel (Live)'}
          </button>
          <button onClick={() => triggerRun(true)} disabled={running}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-accent-warning/10 text-accent-warning rounded-lg hover:bg-accent-warning/20 transition-colors disabled:opacity-50">
            <Eye size={14} /> {running ? 'Running...' : 'Dry Run'}
          </button>
          <div className="flex-1" />
          {schedulerStatus?.available && (
            <div className="flex items-center gap-2 text-xs text-text-muted">
              <Clock size={12} />
              Next run: ~{Math.round(schedulerStatus.intervalMs / 1000)}s interval |
              Runs: {schedulerStatus.totalRuns} |
              Errors: {schedulerStatus.totalErrors}
            </div>
          )}
        </div>
      </Card>

      {/* Last Run Result */}
      {lastResult && (
        <Card className={lastResult.error ? 'border-accent-danger' : 'border-accent-success'}>
          <SectionTitle>{lastResult.error ? 'Run Failed' : 'Run Result'}</SectionTitle>
          {lastResult.error ? (
            <p className="text-sm text-accent-danger">{lastResult.error}</p>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
                <div><span className="text-text-muted">Analysts:</span> <span className="font-mono">{lastResult.analystCount}</span></div>
                <div><span className="text-text-muted">Picks:</span> <span className="font-mono">{lastResult.picksCount}</span></div>
                <div><span className="text-text-muted">Trades:</span> <span className="font-mono">{lastResult.tradesCount}</span></div>
                <div><span className="text-text-muted">Executed:</span> <Badge variant={lastResult.executed ? 'success' : 'warning'}>{lastResult.executed ? 'Yes' : 'No'}</Badge></div>
                <div><span className="text-text-muted">LLM Cost:</span> <span className="font-mono text-accent-success">${(lastResult.totalLLMCost || 0).toFixed(4)}</span></div>
              </div>

              {/* Per-analyst breakdown */}
              {lastResult.reports?.length > 0 && (
                <div className="border-t border-border pt-3">
                  <div className="text-xs text-text-muted mb-2">Analyst Breakdown:</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {lastResult.reports.map((r, i) => (
                      <div key={i} className="flex items-center justify-between text-sm bg-bg-secondary rounded px-3 py-2">
                        <span className="font-medium text-text-primary">{r.analyst}</span>
                        <div className="flex items-center gap-3 text-xs text-text-muted">
                          <span>{r.picks} picks</span>
                          <span>{r.latencyMs}ms</span>
                          <span className="font-mono">${(r.cost || 0).toFixed(4)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Aggregated Picks */}
              {lastResult.aggregatedPicks?.length > 0 && (
                <div className="border-t border-border pt-3">
                  <div className="text-xs text-text-muted mb-2">Consensus Picks:</div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-text-muted border-b border-border">
                          <th className="pb-2">Symbol</th><th className="pb-2">Side</th><th className="pb-2">Score</th>
                          <th className="pb-2">Analysts</th><th className="pb-2">Type</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {lastResult.aggregatedPicks.map((pick, i) => (
                          <tr key={i} className="text-text-primary">
                            <td className="py-1.5 font-mono font-semibold">{pick.symbol}</td>
                            <td className="py-1.5"><Badge variant={pick.side === 'buy' ? 'success' : 'danger'}>{pick.side}</Badge></td>
                            <td className="py-1.5 font-mono">{pick.compositeScore}</td>
                            <td className="py-1.5 text-xs text-text-muted">{pick.analystCount}</td>
                            <td className="py-1.5 text-xs">{pick.opportunityType || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Trades */}
              {lastResult.trades?.length > 0 && (
                <div className="border-t border-border pt-3">
                  <div className="text-xs text-text-muted mb-2">Trades Generated:</div>
                  {lastResult.trades.map((t, i) => (
                    <div key={i} className="flex items-center gap-3 text-sm bg-bg-secondary rounded px-3 py-2">
                      <Badge variant={t.side === 'buy' ? 'success' : 'danger'}>{t.side}</Badge>
                      <span className="font-mono font-semibold">{t.symbol}</span>
                      <span className="text-text-muted">qty: {t.qty}</span>
                      {t.reason && <span className="text-xs text-text-muted">({t.reason})</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      {/* Recent Run History */}
      <Card>
        <SectionTitle action={<RefreshBtn onClick={load} />}>Recent Panel Runs</SectionTitle>
        {recentRuns.length === 0 ? (
          <p className="text-sm text-text-muted">No runs recorded yet — brain records observations on each panel run</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-text-muted border-b border-border">
                  <th className="pb-2">Run ID</th><th className="pb-2">Time</th><th className="pb-2">Observations</th><th className="pb-2">Analysts</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {recentRuns.map((r, i) => (
                  <tr key={i} className="text-text-primary">
                    <td className="py-2 font-mono text-xs">{r.run_id?.substring(0, 12)}...</td>
                    <td className="py-2 text-xs text-text-muted">{new Date(r.started_at).toLocaleString()}</td>
                    <td className="py-2 font-mono">{r.observation_count}</td>
                    <td className="py-2 text-xs text-text-muted">{r.analysts}</td>
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

// ─── Tab: Brain ──────────────────────────────────────────────────────────────

function BrainTab() {
  const [stats, setStats] = useState(null);
  const [episodes, setEpisodes] = useState([]);
  const [knowledge, setKnowledge] = useState([]);
  const [feedback, setFeedback] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [subTab, setSubTab] = useState('episodes');

  const load = useCallback(async () => {
    try {
      setError(null);
      const [s, ep, kb, fb] = await Promise.all([
        traderApi.get('/api/brain/stats'),
        traderApi.get('/api/brain/episodes?limit=50'),
        traderApi.get('/api/brain/knowledge?limit=50'),
        traderApi.get('/api/brain/feedback?limit=50'),
      ]);
      setStats(s);
      setEpisodes(ep.episodes || []);
      setKnowledge(kb.entries || []);
      setFeedback(fb.feedback || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!stats?.available) return (
    <Card><p className="text-sm text-text-muted">Brain not initialized — trader is running without recursive learning.</p></Card>
  );

  const subTabs = [
    { id: 'episodes', label: 'Episodes', count: stats.episodes },
    { id: 'knowledge', label: 'Knowledge Base', count: stats.knowledge },
    { id: 'feedback', label: 'Feedback', count: stats.feedback },
  ];

  return (
    <div className="space-y-5">
      {/* Brain Layer Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="L1: Observations" value={stats.observations} variant="info" icon={Eye}
          sub="Per-run context snapshots" />
        <StatCard label="L2: Feedback" value={stats.feedback} variant="warning" icon={Target}
          sub="Analyst accuracy signals" />
        <StatCard label="L3: Episodes" value={stats.episodes} variant="purple" icon={BookOpen}
          sub="Trade outcome memory" />
        <StatCard label="L4: Knowledge" value={stats.knowledge} variant="success" icon={Award}
          sub="Distilled patterns" />
      </div>

      {/* Sub-tab selector */}
      <div className="flex gap-1 bg-bg-secondary rounded-lg p-1">
        {subTabs.map(t => (
          <button key={t.id} onClick={() => setSubTab(t.id)}
            className={`flex-1 px-3 py-1.5 text-sm rounded transition-colors ${
              subTab === t.id ? 'bg-bg-elevated text-text-primary font-medium shadow-sm' : 'text-text-muted hover:text-text-primary'
            }`}>
            {t.label} <span className="ml-1 text-xs opacity-60">({t.count})</span>
          </button>
        ))}
      </div>

      {/* Episodes Table */}
      {subTab === 'episodes' && (
        <Card>
          <SectionTitle action={<RefreshBtn onClick={load} />}>Trade Episodes (Layer 3)</SectionTitle>
          {episodes.length === 0 ? (
            <p className="text-sm text-text-muted">No episodes yet — episodes are recorded when trades close</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-text-muted border-b border-border">
                    <th className="pb-2">Symbol</th><th className="pb-2">Side</th><th className="pb-2">Analyst</th>
                    <th className="pb-2">Outcome</th><th className="pb-2">Score</th><th className="pb-2">P&L %</th>
                    <th className="pb-2">Hold</th><th className="pb-2">Thesis</th><th className="pb-2">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {episodes.map((ep, i) => (
                    <tr key={ep.id || i} className="text-text-primary">
                      <td className="py-2 font-mono font-semibold">{ep.symbol}</td>
                      <td className="py-2"><Badge variant={ep.side === 'buy' ? 'success' : 'danger'}>{ep.side}</Badge></td>
                      <td className="py-2 text-xs text-text-muted">{ep.analyst_id}</td>
                      <td className="py-2">
                        <Badge variant={ep.outcome_score > 0 ? 'success' : ep.outcome_score < 0 ? 'danger' : 'default'}>
                          {ep.outcome_type}
                        </Badge>
                      </td>
                      <td className="py-2 font-mono">
                        <span className={ep.outcome_score > 0 ? 'text-accent-success' : ep.outcome_score < 0 ? 'text-accent-danger' : ''}>
                          {ep.outcome_score?.toFixed(2)}
                        </span>
                      </td>
                      <td className="py-2 font-mono">
                        {ep.pnl_percent != null ? (
                          <span className={ep.pnl_percent >= 0 ? 'text-accent-success' : 'text-accent-danger'}>
                            {ep.pnl_percent >= 0 ? '+' : ''}{ep.pnl_percent.toFixed(1)}%
                          </span>
                        ) : '-'}
                      </td>
                      <td className="py-2 text-text-muted">{ep.hold_days != null ? `${ep.hold_days}d` : '-'}</td>
                      <td className="py-2 text-xs text-text-muted max-w-xs truncate">{ep.thesis || '-'}</td>
                      <td className="py-2 text-xs text-text-muted">{ep.created_at ? new Date(ep.created_at).toLocaleDateString() : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* Knowledge Base */}
      {subTab === 'knowledge' && (
        <Card>
          <SectionTitle action={<RefreshBtn onClick={load} />}>Knowledge Base (Layer 4)</SectionTitle>
          {knowledge.length === 0 ? (
            <p className="text-sm text-text-muted">No KB entries yet — distillation promotes winning patterns after market close</p>
          ) : (
            <div className="space-y-3">
              {knowledge.map((kb, i) => (
                <div key={kb.id || i} className="bg-bg-secondary rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <Badge variant={kb.content_type === 'winning_pattern' ? 'success' : kb.content_type === 'losing_pattern' ? 'danger' : 'info'}>
                        {kb.content_type?.replace(/_/g, ' ')}
                      </Badge>
                      {kb.symbol && <span className="font-mono text-xs text-text-muted">{kb.symbol}</span>}
                      {kb.source_analyst && <span className="text-xs text-text-muted">by {kb.source_analyst}</span>}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-text-muted">
                      <span>Score: <span className="font-mono">{kb.quality_score?.toFixed(2)}</span></span>
                      <span>Used: {kb.use_count}x</span>
                    </div>
                  </div>
                  {kb.title && <div className="text-sm font-medium text-text-primary mb-1">{kb.title}</div>}
                  <p className="text-sm text-text-secondary">{kb.content}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Feedback */}
      {subTab === 'feedback' && (
        <Card>
          <SectionTitle action={<RefreshBtn onClick={load} />}>Analyst Feedback (Layer 2)</SectionTitle>
          {feedback.length === 0 ? (
            <p className="text-sm text-text-muted">No feedback yet — recorded on trade fills and position closes</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-text-muted border-b border-border">
                    <th className="pb-2">Analyst</th><th className="pb-2">Signal</th><th className="pb-2">Symbol</th>
                    <th className="pb-2">Notes</th><th className="pb-2">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {feedback.map((fb, i) => {
                    const signalVariant = { profitable: 'success', loss: 'danger', stopped_out: 'danger', missed: 'warning', correct_sell: 'success', flat: 'default' };
                    return (
                      <tr key={fb.id || i} className="text-text-primary">
                        <td className="py-2 text-xs">{fb.analyst_id}</td>
                        <td className="py-2"><Badge variant={signalVariant[fb.signal] || 'default'}>{fb.signal}</Badge></td>
                        <td className="py-2 font-mono">{fb.symbol || '-'}</td>
                        <td className="py-2 text-xs text-text-muted max-w-xs truncate">{fb.notes || '-'}</td>
                        <td className="py-2 text-xs text-text-muted">{fb.created_at ? new Date(fb.created_at).toLocaleString() : '-'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

// ─── Tab: Performance ────────────────────────────────────────────────────────

function PerformanceTab() {
  const [data, setData] = useState(null);
  const [trades, setTrades] = useState([]);
  const [perfSummary, setPerfSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [d, t, p] = await Promise.all([
        traderApi.get('/api/brain/analyst-performance').catch(() => ({ analysts: [], bySymbol: [], feedbackBreakdown: [] })),
        traderApi.get('/api/performance/trades').catch(() => ({ trades: [] })),
        traderApi.get('/api/performance/summary').catch(() => null),
      ]);
      setData(d);
      setTrades(t.trades || []);
      setPerfSummary(p);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  // Group symbol data by analyst
  const symbolsByAnalyst = {};
  (data.bySymbol || []).forEach(row => {
    if (!symbolsByAnalyst[row.analyst_id]) symbolsByAnalyst[row.analyst_id] = [];
    symbolsByAnalyst[row.analyst_id].push(row);
  });

  // Group feedback by analyst
  const feedbackByAnalyst = {};
  (data.feedbackBreakdown || []).forEach(row => {
    if (!feedbackByAnalyst[row.analyst_id]) feedbackByAnalyst[row.analyst_id] = {};
    feedbackByAnalyst[row.analyst_id][row.signal] = row.count;
  });

  return (
    <div className="space-y-5">
      {/* Analyst Scorecards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {data.analysts.map(a => {
          const winRate = a.total_trades > 0 ? ((a.wins / a.total_trades) * 100).toFixed(0) : 0;
          const symbols = symbolsByAnalyst[a.analyst_id] || [];
          const fb = feedbackByAnalyst[a.analyst_id] || {};

          return (
            <Card key={a.analyst_id}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-sm font-semibold text-text-primary">{a.analyst_id}</h3>
                  <p className="text-xs text-text-muted">{a.total_trades} trades | {a.first_trade?.split('T')[0]} - {a.last_trade?.split('T')[0]}</p>
                </div>
                <WinRateRing wins={a.wins} total={a.total_trades} />
              </div>

              <div className="grid grid-cols-4 gap-3 mb-3">
                <div>
                  <div className="text-xs text-text-muted">Total P&L</div>
                  <div className={`font-mono font-semibold ${(a.total_pnl || 0) >= 0 ? 'text-accent-success' : 'text-accent-danger'}`}>
                    ${a.total_pnl || 0}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-text-muted">Avg P&L %</div>
                  <div className={`font-mono font-semibold ${(a.avg_pnl_percent || 0) >= 0 ? 'text-accent-success' : 'text-accent-danger'}`}>
                    {(a.avg_pnl_percent || 0) >= 0 ? '+' : ''}{a.avg_pnl_percent || 0}%
                  </div>
                </div>
                <div>
                  <div className="text-xs text-text-muted">Avg Score</div>
                  <div className="font-mono font-semibold text-text-primary">{a.avg_score || 0}</div>
                </div>
                <div>
                  <div className="text-xs text-text-muted">Avg Hold</div>
                  <div className="font-mono font-semibold text-text-primary">{a.avg_hold_days || 0}d</div>
                </div>
              </div>

              {/* Win/Loss bar */}
              <div className="flex gap-0.5 h-2 rounded-full overflow-hidden mb-3">
                {a.wins > 0 && <div className="bg-accent-success" style={{ flex: a.wins }} />}
                {a.losses > 0 && <div className="bg-accent-danger" style={{ flex: a.losses }} />}
              </div>
              <div className="flex justify-between text-xs text-text-muted mb-3">
                <span className="text-accent-success">{a.wins}W</span>
                <span className="text-accent-danger">{a.losses}L</span>
              </div>

              {/* Feedback signals */}
              {Object.keys(fb).length > 0 && (
                <div className="flex gap-1 flex-wrap mb-3">
                  {Object.entries(fb).map(([signal, count]) => {
                    const v = { profitable: 'success', loss: 'danger', stopped_out: 'danger', missed: 'warning' };
                    return <Badge key={signal} variant={v[signal] || 'default'}>{signal}: {count}</Badge>;
                  })}
                </div>
              )}

              {/* Per-symbol breakdown */}
              {symbols.length > 0 && (
                <div className="border-t border-border pt-2">
                  <div className="text-xs text-text-muted mb-1">By Symbol:</div>
                  <div className="grid grid-cols-2 gap-1">
                    {symbols.slice(0, 8).map((s, i) => (
                      <div key={i} className="flex items-center justify-between text-xs bg-bg-secondary rounded px-2 py-1">
                        <span className="font-mono">{s.symbol}</span>
                        <span className={`font-mono ${(s.pnl || 0) >= 0 ? 'text-accent-success' : 'text-accent-danger'}`}>
                          ${s.pnl || 0}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* ═══ Trade History ═══ */}
      <Card>
        <SectionTitle>Trade History ({trades.length} trades)</SectionTitle>
        {trades.length === 0 ? (
          <p className="text-sm text-text-muted">No completed trades yet — trades will appear here after positions close.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-text-muted">
                  <th className="text-left py-2 px-2">Date</th>
                  <th className="text-left py-2 px-2">Symbol</th>
                  <th className="text-left py-2 px-2">Side</th>
                  <th className="text-right py-2 px-2">Entry</th>
                  <th className="text-right py-2 px-2">Exit</th>
                  <th className="text-right py-2 px-2">P&L $</th>
                  <th className="text-right py-2 px-2">P&L %</th>
                  <th className="text-right py-2 px-2">Days</th>
                  <th className="text-left py-2 px-2">Analyst</th>
                  <th className="text-left py-2 px-2">Outcome</th>
                </tr>
              </thead>
              <tbody>
                {trades.map((t, i) => (
                  <tr key={i} className={`border-b border-border/50 ${(t.pnlDollars || 0) >= 0 ? 'bg-accent-success/5' : 'bg-accent-danger/5'}`}>
                    <td className="py-1.5 px-2 text-text-muted">{t.date?.split('T')[0]}</td>
                    <td className="py-1.5 px-2 font-mono font-medium text-text-primary">{t.symbol}</td>
                    <td className="py-1.5 px-2">
                      <span className={`px-1.5 py-0.5 rounded text-xs ${t.side === 'buy' ? 'bg-accent-success/10 text-accent-success' : 'bg-accent-danger/10 text-accent-danger'}`}>
                        {t.side?.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-1.5 px-2 text-right font-mono">${t.entryPrice?.toFixed(2) || '-'}</td>
                    <td className="py-1.5 px-2 text-right font-mono">${t.exitPrice?.toFixed(2) || '-'}</td>
                    <td className={`py-1.5 px-2 text-right font-mono font-medium ${(t.pnlDollars || 0) >= 0 ? 'text-accent-success' : 'text-accent-danger'}`}>
                      {(t.pnlDollars || 0) >= 0 ? '+' : ''}${(t.pnlDollars || 0).toFixed(2)}
                    </td>
                    <td className={`py-1.5 px-2 text-right font-mono ${(t.pnlPercent || 0) >= 0 ? 'text-accent-success' : 'text-accent-danger'}`}>
                      {(t.pnlPercent || 0) >= 0 ? '+' : ''}{(t.pnlPercent || 0).toFixed(1)}%
                    </td>
                    <td className="py-1.5 px-2 text-right">{t.holdDays || '-'}</td>
                    <td className="py-1.5 px-2 text-text-muted">{t.analyst}</td>
                    <td className="py-1.5 px-2">
                      <span className={`px-1.5 py-0.5 rounded text-xs ${
                        t.outcomeType === 'profit' ? 'bg-accent-success/10 text-accent-success' :
                        t.outcomeType === 'target_hit' ? 'bg-accent-success/10 text-accent-success' :
                        t.outcomeType === 'stop_hit' ? 'bg-accent-danger/10 text-accent-danger' :
                        t.outcomeType === 'loss' ? 'bg-accent-danger/10 text-accent-danger' :
                        'bg-bg-elevated text-text-muted'
                      }`}>
                        {t.outcomeType || '-'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ═══ Performance Summary ═══ */}
      {perfSummary && (
        <Card>
          <SectionTitle>Performance Metrics</SectionTitle>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            <div><div className="text-xs text-text-muted">Sharpe Ratio</div><div className="font-mono font-bold text-text-primary">{perfSummary.sharpeRatio?.toFixed(2)}</div></div>
            <div><div className="text-xs text-text-muted">Sortino Ratio</div><div className="font-mono font-bold text-text-primary">{perfSummary.sortinoRatio?.toFixed(2)}</div></div>
            <div><div className="text-xs text-text-muted">Max Drawdown</div><div className="font-mono font-bold text-accent-danger">{perfSummary.maxDrawdownPercent?.toFixed(1)}%</div></div>
            <div><div className="text-xs text-text-muted">Profit Factor</div><div className="font-mono font-bold text-text-primary">{perfSummary.profitFactor?.toFixed(2)}</div></div>
            <div><div className="text-xs text-text-muted">Avg Win</div><div className="font-mono font-bold text-accent-success">${perfSummary.avgWin?.toFixed(2)}</div></div>
            <div><div className="text-xs text-text-muted">Avg Loss</div><div className="font-mono font-bold text-accent-danger">${perfSummary.avgLoss?.toFixed(2)}</div></div>
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── Tab: Strategies ─────────────────────────────────────────────────────────

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
          <button onClick={onClose} className="text-text-muted hover:text-text-primary"><X size={16} /></button>
        </div>
        <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
          {fields.map(({ key, value, type }, idx) => (
            <div key={key}>
              <label className="block text-xs text-text-muted mb-1 capitalize">
                {key.replace(/([A-Z])/g, ' $1').trim()} <span className="ml-1 opacity-40">({type})</span>
              </label>
              {type === 'boolean' ? (
                <select value={value} onChange={(e) => updateField(idx, e.target.value)}
                  className="w-full px-2 py-1.5 text-sm bg-bg-secondary border border-border rounded text-text-primary focus:outline-none focus:border-accent-primary">
                  <option value="true">true</option>
                  <option value="false">false</option>
                </select>
              ) : (
                <input type={type === 'number' ? 'number' : 'text'} value={value}
                  onChange={(e) => updateField(idx, e.target.value)} step={type === 'number' ? 'any' : undefined}
                  className="w-full px-2 py-1.5 text-sm bg-bg-secondary border border-border rounded text-text-primary font-mono focus:outline-none focus:border-accent-primary" />
              )}
            </div>
          ))}
          <div>
            <label className="block text-xs text-text-muted mb-1">Symbols (comma-separated)</label>
            <textarea value={symbolsText} onChange={(e) => setSymbolsText(e.target.value.toUpperCase())}
              placeholder="AAPL, MSFT, SPY, QQQ" rows={3}
              className="w-full px-2 py-1.5 text-sm bg-bg-secondary border border-border rounded text-text-primary font-mono focus:outline-none focus:border-accent-primary resize-none" />
          </div>
        </div>
        {saveError && <div className="mt-3 px-3 py-2 text-xs rounded bg-accent-danger/10 text-accent-danger">{saveError}</div>}
        <div className="flex gap-3 mt-5">
          <button onClick={save} disabled={saving}
            className="flex-1 px-4 py-2 text-sm bg-accent-primary text-white rounded-lg hover:bg-accent-primary/90 transition-colors disabled:opacity-50">
            {saving ? 'Saving...' : 'Save Parameters'}
          </button>
          <button onClick={onClose}
            className="px-4 py-2 text-sm bg-bg-secondary text-text-secondary rounded-lg hover:bg-bg-elevated transition-colors border border-border">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function StrategyRow({ strategy, onToggle, toggling, onConfigure }) {
  const [expanded, setExpanded] = useState(false);
  const params = strategy.params ?? {};
  const paramEntries = Object.entries(params).filter(([k]) => k !== 'symbols');

  return (
    <>
      <tr className="text-text-primary hover:bg-bg-secondary/40 transition-colors">
        <td className="py-2.5">
          <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-1.5 font-medium hover:text-accent-primary transition-colors">
            {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            {strategy.name}
          </button>
        </td>
        <td className="py-2.5 font-mono text-text-muted text-xs">{strategy.version ?? '-'}</td>
        <td className="py-2.5 text-text-muted text-xs font-mono max-w-xs truncate">
          {(strategy.symbols ?? []).slice(0, 6).join(', ') || '-'}
          {(strategy.symbols ?? []).length > 6 && ` +${(strategy.symbols ?? []).length - 6}`}
        </td>
        <td className="py-2.5"><Badge variant={strategy.enabled ? 'success' : 'default'}>{strategy.enabled ? 'Enabled' : 'Disabled'}</Badge></td>
        <td className="py-2.5 text-right">
          <div className="flex items-center justify-end gap-2">
            <button onClick={() => onConfigure(strategy)} title="Configure" className="p-1 text-text-muted hover:text-accent-primary transition-colors"><Settings size={13} /></button>
            <button onClick={() => onToggle(strategy.id, strategy.enabled)} disabled={toggling === strategy.id}
              className={`px-3 py-1 text-xs rounded transition-colors ${
                strategy.enabled ? 'bg-accent-danger/10 text-accent-danger hover:bg-accent-danger/20' : 'bg-accent-success/10 text-accent-success hover:bg-accent-success/20'
              } disabled:opacity-50`}>
              {toggling === strategy.id ? '...' : strategy.enabled ? 'Disable' : 'Enable'}
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
              <div className="pt-1 border-t border-border/50 text-text-muted opacity-60">ID: <span className="font-mono">{strategy.id}</span></div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Polymarket Tab ───────────────────────────────────────────────────────────

function PolymarketTab() {
  const [topMarkets, setTopMarkets]     = useState([]);
  const [categories, setCategories]     = useState([]);
  const [walletStatus, setWalletStatus] = useState(null);
  const [searchQuery, setSearchQuery]   = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching]       = useState(false);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState(null);
  const [selectedCat, setSelectedCat]   = useState('');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [top, cats, wallet] = await Promise.all([
        traderApi.get('/api/polymarket/top-markets'),
        traderApi.get('/api/polymarket/categories'),
        traderApi.get('/api/polymarket/wallet-status'),
      ]);
      setTopMarkets(top.markets || []);
      setCategories(cats.categories?.slice(0, 15) || []);
      setWalletStatus(wallet);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const search = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const q = encodeURIComponent(searchQuery);
      const cat = selectedCat ? `&category=${encodeURIComponent(selectedCat)}` : '';
      const data = await traderApi.get(`/api/polymarket/markets?q=${q}${cat}&limit=20`);
      setSearchResults(data.markets || []);
    } catch (err) {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  if (loading) return <Loading />;
  if (error)   return <ErrorState message={error} onRetry={load} />;

  const markets = searchResults.length > 0 ? searchResults : topMarkets;

  return (
    <div className="space-y-5">
      {/* Wallet Status */}
      <Card className={walletStatus?.configured ? 'border-accent-success/40' : 'border-accent-warning/40'}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-2.5 h-2.5 rounded-full ${walletStatus?.configured ? 'bg-accent-success' : 'bg-accent-warning'}`} />
            <div>
              <div className="text-sm font-semibold text-text-primary">
                {walletStatus?.configured ? 'Wallet Connected — Live Trading Ready' : 'Read-Only Mode'}
              </div>
              <div className="text-xs text-text-muted mt-0.5">{walletStatus?.message}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={walletStatus?.configured ? 'success' : 'warning'}>
              {walletStatus?.configured ? 'LIVE' : 'READ-ONLY'}
            </Badge>
            <Badge variant="purple">Polymarket</Badge>
          </div>
        </div>
        {!walletStatus?.configured && (
          <div className="mt-3 pt-3 border-t border-border text-xs text-text-muted font-mono bg-bg-secondary rounded p-2">
            Add to .env.trader: POLYMARKET_PRIVATE_KEY=0x... · POLYMARKET_API_KEY=... · POLYMARKET_API_SECRET=...
          </div>
        )}
      </Card>

      {/* Search + Filter */}
      <Card>
        <SectionTitle>Market Browser</SectionTitle>
        <div className="flex gap-2 flex-wrap">
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && search()}
            placeholder="Search markets... (e.g. Fed, NVDA earnings, recession)"
            className="flex-1 min-w-48 px-3 py-1.5 text-sm bg-bg-secondary border border-border rounded text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-primary"
          />
          <select
            value={selectedCat}
            onChange={e => setSelectedCat(e.target.value)}
            className="px-3 py-1.5 text-sm bg-bg-secondary border border-border rounded text-text-primary focus:outline-none"
          >
            <option value="">All Categories</option>
            {categories.map(c => (
              <option key={c.name} value={c.name}>{c.name} ({c.count})</option>
            ))}
          </select>
          <button
            onClick={search}
            disabled={searching}
            className="px-4 py-1.5 text-sm bg-accent-primary/10 text-accent-primary rounded hover:bg-accent-primary/20 transition-colors disabled:opacity-50"
          >
            {searching ? 'Searching...' : 'Search'}
          </button>
          {searchResults.length > 0 && (
            <button
              onClick={() => { setSearchResults([]); setSearchQuery(''); }}
              className="px-3 py-1.5 text-sm text-text-muted hover:text-text-primary transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      </Card>

      {/* Top Markets / Search Results */}
      <Card>
        <SectionTitle>
          {searchResults.length > 0 ? `Search Results (${searchResults.length})` : 'Top Macro Markets by Volume'}
        </SectionTitle>
        {markets.length === 0 ? (
          <p className="text-sm text-text-muted text-center py-6">No markets found</p>
        ) : (
          <div className="space-y-2">
            {markets.map((m, i) => {
              const yesP = m.yesPrice ?? Math.round(parseFloat(m.outcomePrices?.[0] || '0.5') * 100);
              const noP  = m.noPrice  ?? (100 - yesP);
              const vol  = m.volume ? (m.volume >= 1_000_000 ? `$${(m.volume/1_000_000).toFixed(1)}M` : `$${(m.volume/1000).toFixed(0)}K`) : '-';
              const yesBg = yesP >= 65 ? 'bg-accent-success' : yesP >= 35 ? 'bg-accent-warning' : 'bg-accent-danger';

              return (
                <div key={m.conditionId || i} className="rounded-lg border border-border bg-bg-secondary p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <a
                        href={m.url} target="_blank" rel="noopener noreferrer"
                        className="text-sm font-medium text-text-primary hover:text-accent-primary transition-colors line-clamp-2"
                      >
                        {m.question}
                      </a>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <Badge variant="default">{m.category}</Badge>
                        <span className="text-xs text-text-muted">Vol: {vol}</span>
                        {m.endDate && (
                          <span className="text-xs text-text-muted">
                            Closes: {new Date(m.endDate).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <div className="flex items-center gap-1 text-xs font-mono">
                        <span className="text-accent-success font-bold">{yesP}%</span>
                        <span className="text-text-muted">YES</span>
                      </div>
                      <div className="flex items-center gap-1 text-xs font-mono">
                        <span className="text-accent-danger font-bold">{noP}%</span>
                        <span className="text-text-muted">NO</span>
                      </div>
                    </div>
                  </div>
                  {/* Probability bar */}
                  <div className="mt-2 h-1.5 rounded-full bg-bg-primary overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${yesBg}`} style={{ width: `${yesP}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Category Breakdown */}
      {categories.length > 0 && (
        <Card>
          <SectionTitle>Market Categories</SectionTitle>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
            {categories.map(c => (
              <button
                key={c.name}
                onClick={() => { setSelectedCat(c.name); setSearchQuery(''); search(); }}
                className="text-left p-2 rounded border border-border hover:border-accent-primary/40 hover:bg-accent-primary/5 transition-colors"
              >
                <div className="text-xs font-medium text-text-primary truncate">{c.name}</div>
                <div className="text-xs text-text-muted mt-0.5">{c.count} markets</div>
                <div className="text-xs font-mono text-accent-success">
                  ${(c.volume / 1_000_000).toFixed(1)}M vol
                </div>
              </button>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── Copy-Trade Tab ───────────────────────────────────────────────────────────

function CopyTradeTab() {
  const [status, setStatus]         = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [actions, setActions]       = useState([]);
  const [preview, setPreview]       = useState(null);
  const [previewAddr, setPreviewAddr] = useState('');
  const [loadingLB, setLoadingLB]   = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);

  // Add target form
  const [addAddr, setAddAddr]     = useState('');
  const [addLabel, setAddLabel]   = useState('');
  const [addScale, setAddScale]   = useState('10');
  const [addMax, setAddMax]       = useState('50');
  const [adding, setAdding]       = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [s, a] = await Promise.all([
        traderApi.get('/api/copy-trade/status'),
        traderApi.get('/api/copy-trade/actions?limit=30'),
      ]);
      setStatus(s);
      setActions(a.actions || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); const id = setInterval(load, 15_000); return () => clearInterval(id); }, [load]);

  const fetchLeaderboard = async () => {
    setLoadingLB(true);
    try {
      const data = await traderApi.get('/api/copy-trade/leaderboard');
      setLeaderboard(data.profiles || []);
    } catch { setLeaderboard([]); }
    finally { setLoadingLB(false); }
  };

  const fetchPreview = async (addr) => {
    if (!addr) return;
    setLoadingPreview(true);
    setPreview(null);
    try {
      const data = await traderApi.get(`/api/copy-trade/preview/${addr}`);
      setPreview(data);
    } catch { setPreview({ error: 'Could not fetch activity' }); }
    finally { setLoadingPreview(false); }
  };

  const addTarget = async () => {
    if (!addAddr.startsWith('0x')) return;
    setAdding(true);
    try {
      await traderApi.post('/api/copy-trade/targets', {
        address: addAddr, label: addLabel, scalePct: addScale, maxUsdPerTrade: addMax,
      });
      setAddAddr(''); setAddLabel(''); setAddScale('10'); setAddMax('50');
      await load();
    } catch (err) { alert(err.message); }
    finally { setAdding(false); }
  };

  const removeTarget = async (address) => {
    await traderApi.del(`/api/copy-trade/targets/${address}`);
    await load();
  };

  const toggleTarget = async (target) => {
    await traderApi.put(`/api/copy-trade/targets/${target.address}`, { active: !target.active });
    await load();
  };

  const startEngine = async () => { await traderApi.post('/api/copy-trade/start', {}); await load(); };
  const stopEngine  = async () => { await traderApi.post('/api/copy-trade/stop',  {}); await load(); };

  if (loading) return <Loading />;
  if (error)   return <ErrorState message={error} onRetry={load} />;

  const statusColors = { executed: 'success', skipped: 'warning', failed: 'danger', pending: 'info' };

  return (
    <div className="space-y-5">
      {/* Engine Status */}
      <Card className={status?.running ? 'border-accent-success/40' : 'border-border'}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-2.5 h-2.5 rounded-full ${status?.running ? 'bg-accent-success animate-pulse' : 'bg-text-muted'}`} />
            <div>
              <div className="text-sm font-semibold text-text-primary">
                Copy-Trade Engine {status?.running ? 'Running' : 'Idle'}
              </div>
              <div className="text-xs text-text-muted">
                {status?.targets?.length || 0} targets · {status?.totalExecuted || 0} executed today · {status?.totalSkipped || 0} skipped
                {status?.dryRun && <span className="ml-2 text-accent-warning">[DRY RUN]</span>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {status?.running ? (
              <button onClick={stopEngine} className="px-3 py-1.5 text-sm bg-accent-danger/10 text-accent-danger rounded hover:bg-accent-danger/20 transition-colors">
                Stop
              </button>
            ) : (
              <button onClick={startEngine} disabled={!status?.targets?.length} className="px-3 py-1.5 text-sm bg-accent-success/10 text-accent-success rounded hover:bg-accent-success/20 transition-colors disabled:opacity-40">
                Start Watching
              </button>
            )}
          </div>
        </div>
      </Card>

      {/* Add Target */}
      <Card>
        <SectionTitle>Add Wallet to Copy</SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          <input value={addAddr} onChange={e => setAddAddr(e.target.value)}
            placeholder="Wallet address (0x...)"
            className="px-3 py-1.5 text-sm bg-bg-secondary border border-border rounded text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-primary font-mono" />
          <input value={addLabel} onChange={e => setAddLabel(e.target.value)}
            placeholder="Label (e.g. whale_001)"
            className="px-3 py-1.5 text-sm bg-bg-secondary border border-border rounded text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-primary" />
          <div className="flex items-center gap-2">
            <label className="text-xs text-text-muted whitespace-nowrap">Scale %</label>
            <input type="number" value={addScale} onChange={e => setAddScale(e.target.value)}
              min="1" max="100"
              className="flex-1 px-3 py-1.5 text-sm bg-bg-secondary border border-border rounded text-text-primary focus:outline-none focus:border-accent-primary" />
            <span className="text-xs text-text-muted">of their size</span>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-text-muted whitespace-nowrap">Max $</label>
            <input type="number" value={addMax} onChange={e => setAddMax(e.target.value)}
              min="5" max="500"
              className="flex-1 px-3 py-1.5 text-sm bg-bg-secondary border border-border rounded text-text-primary focus:outline-none focus:border-accent-primary" />
            <span className="text-xs text-text-muted">per trade</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={addTarget} disabled={adding || !addAddr.startsWith('0x')}
            className="px-4 py-1.5 text-sm bg-accent-primary/10 text-accent-primary rounded hover:bg-accent-primary/20 transition-colors disabled:opacity-40">
            {adding ? 'Adding...' : 'Add Target'}
          </button>
          <button onClick={() => { setPreviewAddr(addAddr); fetchPreview(addAddr); }}
            disabled={!addAddr.startsWith('0x')}
            className="px-4 py-1.5 text-sm bg-bg-secondary border border-border rounded text-text-secondary hover:text-text-primary transition-colors disabled:opacity-40">
            Preview Trades
          </button>
        </div>

        {/* Preview */}
        {loadingPreview && <div className="mt-3 text-sm text-text-muted">Fetching activity...</div>}
        {preview && !preview.error && (
          <div className="mt-3 border-t border-border pt-3">
            <div className="text-xs text-text-muted mb-2">Recent activity ({preview.total} trades)</div>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {(preview.activity || []).slice(0, 10).map((t, i) => (
                <div key={i} className="flex items-center justify-between text-xs bg-bg-secondary rounded px-2 py-1">
                  <span className={`font-medium ${t.type === 'BUY' || t.side === 'BUY' ? 'text-accent-success' : 'text-accent-danger'}`}>
                    {t.type || t.side}
                  </span>
                  <span className="text-text-primary truncate mx-2 flex-1">{t.title || t.question || 'Unknown market'}</span>
                  <span className="text-text-muted">${parseFloat(t.usdcValue || t.amount || '0').toFixed(0)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* Active Targets */}
      {(status?.targets?.length > 0) && (
        <Card>
          <SectionTitle>Active Targets</SectionTitle>
          <div className="space-y-2">
            {status.targets.map(t => (
              <div key={t.address} className={`flex items-center justify-between rounded border p-3 ${t.active ? 'border-accent-success/30 bg-accent-success/5' : 'border-border bg-bg-secondary'}`}>
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${t.active ? 'bg-accent-success' : 'bg-text-muted'}`} />
                  <div>
                    <div className="text-sm font-medium text-text-primary">{t.label}</div>
                    <div className="text-xs font-mono text-text-muted">{t.address.slice(0, 10)}...{t.address.slice(-6)}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs text-text-muted">
                  <span>Scale: {t.scalePct}%</span>
                  <span>Max: ${t.maxUsdPerTrade}</span>
                  <button onClick={() => toggleTarget(t)}
                    className={`px-2 py-0.5 rounded ${t.active ? 'bg-accent-warning/10 text-accent-warning' : 'bg-accent-success/10 text-accent-success'}`}>
                    {t.active ? 'Pause' : 'Resume'}
                  </button>
                  <button onClick={() => removeTarget(t.address)} className="text-accent-danger hover:opacity-80">Remove</button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Leaderboard */}
      <Card>
        <SectionTitle>
          Leaderboard — Find Wallets to Copy
          <button onClick={fetchLeaderboard} disabled={loadingLB}
            className="text-xs px-3 py-1 bg-bg-secondary border border-border rounded text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50">
            {loadingLB ? 'Loading...' : 'Fetch Leaderboard'}
          </button>
        </SectionTitle>
        {leaderboard.length === 0 ? (
          <p className="text-sm text-text-muted text-center py-4">Click "Fetch Leaderboard" to find top Polymarket traders</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-text-muted border-b border-border">
                  <th className="pb-2">Trader</th>
                  <th className="pb-2">Profit</th>
                  <th className="pb-2">Volume</th>
                  <th className="pb-2">Trades</th>
                  <th className="pb-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {leaderboard.map((p, i) => (
                  <tr key={p.address || i}>
                    <td className="py-2">
                      <div className="font-medium text-text-primary">{p.username || 'Anonymous'}</div>
                      <div className="text-xs font-mono text-text-muted">{p.address?.slice(0, 10)}...</div>
                    </td>
                    <td className="py-2 font-mono text-accent-success">${(p.profit || 0).toLocaleString()}</td>
                    <td className="py-2 font-mono text-text-muted">${((p.volume || 0)/1000).toFixed(0)}K</td>
                    <td className="py-2 text-text-muted">{p.tradesCount || 0}</td>
                    <td className="py-2">
                      <button onClick={() => {
                        setAddAddr(p.address || '');
                        setAddLabel(p.username || `whale_${(p.address || '').slice(2, 8)}`);
                        setPreviewAddr(p.address || '');
                        fetchPreview(p.address || '');
                      }}
                        className="text-xs px-2 py-0.5 bg-accent-primary/10 text-accent-primary rounded hover:bg-accent-primary/20 transition-colors">
                        Copy
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Recent Actions */}
      {actions.length > 0 && (
        <Card>
          <SectionTitle>Recent Copy Actions</SectionTitle>
          <div className="space-y-1.5">
            {actions.map((a, i) => (
              <div key={a.id || i} className="flex items-start justify-between text-sm bg-bg-secondary rounded px-3 py-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge variant={statusColors[a.status] || 'default'}>{a.status}</Badge>
                    <span className="text-xs text-text-muted">{a.targetLabel}</span>
                  </div>
                  <div className="text-xs text-text-primary mt-0.5 truncate">
                    {a.sourceTrade?.side} {a.sourceTrade?.outcome} — {a.sourceTrade?.question?.slice(0, 55)}
                  </div>
                  {a.skipReason && <div className="text-xs text-text-muted mt-0.5">{a.skipReason}</div>}
                </div>
                <div className="text-xs font-mono text-text-muted ml-3 shrink-0">
                  ${(a.copyUsd || 0).toFixed(2)}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

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
    } catch (err) { console.error('[Trader] Toggle failed:', err); }
    finally { setToggling(null); }
  };

  const runStrategies = async () => {
    setRunning(true); setRunResult(null);
    try {
      const result = await traderApi.post('/api/strategies/run', {});
      setRunResult({ success: true, message: result.message || 'Strategies executed' });
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
      {configuringStrategy && <ConfigureModal strategy={configuringStrategy} onClose={() => setConfiguringStrategy(null)} onSaved={load} />}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <div>
            <SectionTitle>Trading Strategies</SectionTitle>
            <p className="text-xs text-text-muted -mt-2">{enabledCount}/{strategies.length} enabled — safety checks for AI Panel</p>
          </div>
          <button onClick={runStrategies} disabled={running}
            className="flex items-center gap-2 px-3 py-1.5 text-xs bg-accent-primary/10 text-accent-primary rounded hover:bg-accent-primary/20 transition-colors disabled:opacity-50">
            <RefreshCw size={12} className={running ? 'animate-spin' : ''} /> {running ? 'Running...' : 'Run Now'}
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
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-text-muted border-b border-border">
                  <th className="pb-2 font-medium">Name</th><th className="pb-2 font-medium">Version</th>
                  <th className="pb-2 font-medium">Symbols</th><th className="pb-2 font-medium">Status</th><th className="pb-2 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">{strategies.map((s) => (
                <StrategyRow key={s.id} strategy={s} onToggle={toggle} toggling={toggling} onConfigure={setConfiguringStrategy} />
              ))}</tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── Tab: Orders ─────────────────────────────────────────────────────────────

function OrdersTab() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [orderResult, setOrderResult] = useState(null);
  const [cancellingId, setCancellingId] = useState(null);
  const [orderForm, setOrderForm] = useState({ symbol: 'SPY', side: 'buy', qty: '1', orderType: 'market', limitPrice: '', timeInForce: 'day' });
  const [dbUnavailable, setDbUnavailable] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await traderApi.get('/api/orders');
      setOrders(data.orders ?? []);
      setDbUnavailable(false);
    } catch (err) {
      const isDbErr = err.message?.includes('500') || err.message?.includes('database') || err.message?.includes('ECONNREFUSED');
      if (isDbErr) { setDbUnavailable(true); setOrders([]); }
      else setError(err.message);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const submitOrder = async (e) => {
    e.preventDefault();
    setSubmittingOrder(true); setOrderResult(null);
    try {
      const body = {
        symbol: orderForm.symbol.toUpperCase(), side: orderForm.side, qty: parseFloat(orderForm.qty),
        orderType: orderForm.orderType, timeInForce: orderForm.timeInForce,
        ...(orderForm.orderType === 'limit' && orderForm.limitPrice ? { limitPrice: parseFloat(orderForm.limitPrice) } : {}),
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
    try { await traderApi.del(`/api/orders/${brokerOrderId}`); await load(); }
    catch (err) { alert(`Cancel failed: ${err.message}`); }
    finally { setCancellingId(null); }
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
      <Card>
        <SectionTitle>Submit Order (Paper Trading)</SectionTitle>
        <form onSubmit={submitOrder} className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-text-muted mb-1">Symbol</label>
              <input type="text" value={orderForm.symbol} onChange={(e) => setOrderForm({ ...orderForm, symbol: e.target.value.toUpperCase() })}
                className="w-full px-2 py-1.5 text-sm bg-bg-secondary border border-border rounded text-text-primary font-mono focus:outline-none focus:border-accent-primary" placeholder="SPY" required />
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">Side</label>
              <select value={orderForm.side} onChange={(e) => setOrderForm({ ...orderForm, side: e.target.value })}
                className="w-full px-2 py-1.5 text-sm bg-bg-secondary border border-border rounded text-text-primary focus:outline-none focus:border-accent-primary">
                <option value="buy">Buy</option><option value="sell">Sell / Short</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">Qty</label>
              <input type="number" value={orderForm.qty} onChange={(e) => setOrderForm({ ...orderForm, qty: e.target.value })}
                className="w-full px-2 py-1.5 text-sm bg-bg-secondary border border-border rounded text-text-primary focus:outline-none focus:border-accent-primary" min="1" step="1" required />
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">Order Type</label>
              <select value={orderForm.orderType} onChange={(e) => setOrderForm({ ...orderForm, orderType: e.target.value })}
                className="w-full px-2 py-1.5 text-sm bg-bg-secondary border border-border rounded text-text-primary focus:outline-none focus:border-accent-primary">
                <option value="market">Market</option><option value="limit">Limit</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">Time in Force</label>
              <select value={orderForm.timeInForce} onChange={(e) => setOrderForm({ ...orderForm, timeInForce: e.target.value })}
                className="w-full px-2 py-1.5 text-sm bg-bg-secondary border border-border rounded text-text-primary focus:outline-none focus:border-accent-primary">
                <option value="day">Day</option><option value="gtc">GTC</option><option value="ioc">IOC</option><option value="fok">FOK</option>
              </select>
            </div>
            {orderForm.orderType === 'limit' && (
              <div>
                <label className="block text-xs text-text-muted mb-1">Limit Price ($)</label>
                <input type="number" value={orderForm.limitPrice} onChange={(e) => setOrderForm({ ...orderForm, limitPrice: e.target.value })}
                  className="w-full px-2 py-1.5 text-sm bg-bg-secondary border border-border rounded text-text-primary font-mono focus:outline-none focus:border-accent-primary" step="0.01" min="0.01" required />
              </div>
            )}
          </div>
          {orderResult && (
            <div className={`px-3 py-2 text-xs rounded ${orderResult.success ? 'bg-accent-success/10 text-accent-success' : 'bg-accent-danger/10 text-accent-danger'}`}>{orderResult.message}</div>
          )}
          <button type="submit" disabled={submittingOrder}
            className="px-5 py-2 text-sm bg-accent-primary text-white rounded-lg hover:bg-accent-primary/90 transition-colors disabled:opacity-50 font-medium">
            {submittingOrder ? 'Submitting...' : `Submit ${orderForm.side === 'buy' ? 'Buy' : 'Sell'} Order`}
          </button>
          <p className="text-xs text-text-muted">Routes through risk engine then Alpaca paper trading.</p>
        </form>
      </Card>

      <Card>
        <SectionTitle action={<RefreshBtn onClick={load} />}>Order History</SectionTitle>
        {orders.length === 0 ? (
          dbUnavailable
            ? <p className="text-sm text-accent-warning">Order history requires PostgreSQL (port 5433).</p>
            : <p className="text-sm text-text-muted">No orders yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-text-muted border-b border-border">
                  <th className="pb-2">Symbol</th><th className="pb-2">Side</th><th className="pb-2">Qty</th>
                  <th className="pb-2">Type</th><th className="pb-2">Status</th><th className="pb-2">Risk</th>
                  <th className="pb-2">Submitted</th><th className="pb-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {orders.map((o, i) => (
                  <tr key={o.order_id || o.intent_id || i} className="text-text-primary">
                    <td className="py-2 font-mono font-semibold">{o.symbol}</td>
                    <td className="py-2"><Badge variant={o.side === 'buy' ? 'success' : 'danger'}>{o.side}</Badge></td>
                    <td className="py-2">{o.qty}</td>
                    <td className="py-2 text-text-muted">{o.order_type}</td>
                    <td className="py-2"><Badge variant={statusVariant(o.status)}>{o.status ?? 'pending'}</Badge></td>
                    <td className="py-2">{o.risk_passed != null ? <Badge variant={o.risk_passed ? 'success' : 'danger'}>{o.risk_passed ? 'Passed' : `Failed: ${o.fail_reason || '-'}`}</Badge> : '-'}</td>
                    <td className="py-2 text-xs text-text-muted">{o.submitted_at ? new Date(o.submitted_at).toLocaleString() : '-'}</td>
                    <td className="py-2 text-right">
                      {o.broker_order_id && o.status === 'pending' && (
                        <button onClick={() => cancelOrder(o.broker_order_id)} disabled={cancellingId === o.broker_order_id}
                          className="text-xs text-accent-danger hover:underline disabled:opacity-50">
                          {cancellingId === o.broker_order_id ? '...' : 'Cancel'}
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

// ─── Tab: Risk ───────────────────────────────────────────────────────────────

function RiskTab() {
  const [limits, setLimits] = useState([]);
  const [breaches, setBreaches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [limitsData, breachData] = await Promise.all([
        traderApi.get('/api/risk/limits'), traderApi.get('/api/risk/breaches'),
      ]);
      setLimits(limitsData.limits ?? []); setBreaches(breachData.breaches ?? []);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="space-y-5">
      <Card>
        <SectionTitle>Risk Limits</SectionTitle>
        {limits.length === 0 ? <p className="text-sm text-text-muted">No limits configured</p> : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-text-muted border-b border-border">
                <th className="pb-2">Limit</th><th className="pb-2">Value</th><th className="pb-2">Unit</th><th className="pb-2">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {limits.map((l) => (
                <tr key={l.limitType} className="text-text-primary">
                  <td className="py-2 font-medium capitalize">{l.limitType.replace(/_/g, ' ')}</td>
                  <td className="py-2 font-mono font-semibold">{l.unit === 'USD' ? `$${l.value.toLocaleString()}` : l.value}</td>
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
          <div className="flex items-center gap-2 text-accent-success text-sm"><CheckCircle size={16} /> No breaches detected</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-text-muted border-b border-border">
                <th className="pb-2">Timestamp</th><th className="pb-2">Limit</th><th className="pb-2">Value</th><th className="pb-2">Max Allowed</th>
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

// ─── Tab: Broker ─────────────────────────────────────────────────────────────

function BrokerTab() {
  const [account, setAccount] = useState(null);
  const [quoteSymbol, setQuoteSymbol] = useState('SPY');
  const [quote, setQuote] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [connRes, accRes] = await Promise.all([
        traderApi.get('/api/broker/test').catch((err) => ({ error: err.message })),
        traderApi.get('/api/broker/account').catch((err) => ({ error: err.message })),
      ]);
      setConnectionStatus(connRes.error ? { connected: false, error: connRes.error } : { connected: true, mode: connRes.mode });
      setAccount(accRes.error ? null : accRes.account);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const fetchQuote = async () => {
    if (!quoteSymbol.trim()) return;
    setQuoteLoading(true); setQuote(null);
    try { const data = await traderApi.get(`/api/broker/quote/${quoteSymbol.trim().toUpperCase()}`); setQuote(data); }
    catch (err) { setQuote({ error: err.message }); }
    finally { setQuoteLoading(false); }
  };

  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="space-y-5">
      <Card>
        <SectionTitle>Alpaca Connection</SectionTitle>
        <div className="flex items-center gap-3">
          {connectionStatus?.connected ? <Wifi size={16} className="text-accent-success" /> : <WifiOff size={16} className="text-accent-danger" />}
          <div>
            <p className={`text-sm font-medium ${connectionStatus?.connected ? 'text-accent-success' : 'text-accent-danger'}`}>
              {connectionStatus?.connected ? `Connected — ${connectionStatus.mode ?? 'paper'} mode` : 'Not connected'}
            </p>
            {connectionStatus?.error && <p className="text-xs text-text-muted mt-0.5">{connectionStatus.error}</p>}
          </div>
        </div>
      </Card>

      {account && (
        <Card>
          <SectionTitle>Account Info</SectionTitle>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            {[
              { label: 'Portfolio Value', value: account.portfolio_value ? `$${parseFloat(account.portfolio_value).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '-' },
              { label: 'Cash', value: account.cash ? `$${parseFloat(account.cash).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '-' },
              { label: 'Buying Power', value: account.buying_power ? `$${parseFloat(account.buying_power).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '-' },
              { label: 'Day Trade Count', value: account.daytrade_count ?? '-' },
              { label: 'Status', value: account.status ?? '-' },
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

      <Card>
        <SectionTitle>Live Quote Lookup</SectionTitle>
        <div className="flex gap-2 mb-3">
          <input type="text" value={quoteSymbol} onChange={(e) => setQuoteSymbol(e.target.value.toUpperCase())} placeholder="SPY"
            className="w-32 px-2 py-1.5 text-sm bg-bg-secondary border border-border rounded text-text-primary font-mono focus:outline-none focus:border-accent-primary uppercase"
            onKeyDown={(e) => e.key === 'Enter' && fetchQuote()} />
          <button onClick={fetchQuote} disabled={quoteLoading}
            className="px-3 py-1.5 text-sm bg-accent-primary/10 text-accent-primary rounded hover:bg-accent-primary/20 transition-colors disabled:opacity-50">
            {quoteLoading ? 'Loading...' : 'Get Quote'}
          </button>
        </div>
        {quote && !quote.error && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            {[
              { label: 'Symbol', value: quote.symbol ?? quoteSymbol },
              { label: 'Bid', value: quote.quote?.bid ? `$${quote.quote.bid}` : '-' },
              { label: 'Ask', value: quote.quote?.ask ? `$${quote.quote.ask}` : '-' },
              { label: 'Last', value: quote.quote?.last ? `$${quote.quote.last}` : '-' },
            ].map(({ label, value }) => (
              <div key={label}><div className="text-xs text-text-muted mb-0.5">{label}</div><div className="font-semibold text-text-primary font-mono">{value}</div></div>
            ))}
          </div>
        )}
        {quote?.error && <p className="text-xs text-accent-danger">{quote.error}</p>}
      </Card>
    </div>
  );
}

// ─── Tab: Kill Switch ────────────────────────────────────────────────────────

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
      const [s, e] = await Promise.all([
        traderApi.get('/api/kill-switch/status').catch(() =>
          traderApi.get('/health').then(h => ({ status: h.killSwitch, lastChecked: new Date().toISOString(), _fromHealth: true }))
        ),
        traderApi.get('/api/kill-switch/events').catch(() => ({ events: [], total: 0, _dbUnavailable: true })),
      ]);
      setStatus(s); setEvents(e.events ?? []); setDbUnavailable(!!e._dbUnavailable);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const trigger = async (mode) => {
    if (!reason.trim()) { alert('Please enter a reason.'); return; }
    const confirmed = window.confirm(
      mode === 'hard'
        ? `HARD STOP: Cancel ALL ORDERS and FLATTEN all positions.\n\nReason: "${reason}"\n\nProceed?`
        : `Soft stop: Prevent new orders.\n\nReason: "${reason}"\n\nProceed?`
    );
    if (!confirmed) return;
    setActing(true);
    try { await traderApi.post('/api/kill-switch/trigger', { mode, reason }); setReason(''); await load(); }
    catch (err) { alert(`Failed: ${err.message}`); }
    finally { setActing(false); }
  };

  const reset = async () => {
    if (!window.confirm('Reset kill switch? This will allow new orders again.')) return;
    setActing(true);
    try { await traderApi.post('/api/kill-switch/reset', {}); await load(); }
    catch (err) { alert(`Failed: ${err.message}`); }
    finally { setActing(false); }
  };

  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  const rawStatus = typeof status?.status === 'object' ? status?.status?.status : status?.status;
  const isTriggered = rawStatus === 'triggered';

  return (
    <div className="space-y-5">
      <Card className={isTriggered ? 'border-accent-danger' : ''}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Power size={24} className={isTriggered ? 'text-accent-danger' : 'text-accent-success'} />
            <div>
              <div className="text-xs text-text-muted uppercase tracking-wider">Kill Switch Status</div>
              <div className={`text-lg font-bold ${isTriggered ? 'text-accent-danger' : 'text-accent-success'}`}>
                {isTriggered ? 'TRIGGERED — Trading Halted' : 'Armed / Ready'}
              </div>
              {status?.mode && <div className="text-xs text-text-muted mt-0.5">Mode: {String(status.mode)}</div>}
            </div>
          </div>
          {isTriggered && (
            <button onClick={reset} disabled={acting}
              className="px-4 py-2 text-sm bg-accent-success/10 text-accent-success rounded hover:bg-accent-success/20 transition-colors disabled:opacity-50">
              {acting ? '...' : 'Reset Kill Switch'}
            </button>
          )}
        </div>
      </Card>

      {!isTriggered && (
        <Card>
          <SectionTitle>Manual Trigger</SectionTitle>
          <div className="space-y-3">
            <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for triggering kill switch..."
              className="w-full px-3 py-2 text-sm bg-bg-secondary border border-border rounded text-text-primary placeholder-text-muted focus:outline-none focus:border-accent-primary" />
            <div className="flex gap-3">
              <button onClick={() => trigger('soft')} disabled={acting || !reason.trim()}
                className="px-4 py-2 text-sm bg-accent-warning/10 text-accent-warning rounded hover:bg-accent-warning/20 transition-colors disabled:opacity-50 flex items-center gap-2">
                <AlertTriangle size={14} /> {acting ? '...' : 'Soft Stop'}
              </button>
              <button onClick={() => trigger('hard')} disabled={acting || !reason.trim()}
                className="px-4 py-2 text-sm bg-accent-danger/10 text-accent-danger rounded hover:bg-accent-danger/20 transition-colors disabled:opacity-50 flex items-center gap-2">
                <XCircle size={14} /> {acting ? '...' : 'Hard Stop (Cancel + Flatten)'}
              </button>
            </div>
            <p className="text-xs text-text-muted"><strong>Soft:</strong> stops new orders | <strong>Hard:</strong> cancels all orders and flattens immediately</p>
          </div>
        </Card>
      )}

      <Card>
        <SectionTitle action={<RefreshBtn onClick={load} />}>Event History</SectionTitle>
        {dbUnavailable && (
          <div className="mb-3 px-3 py-2 text-xs rounded bg-accent-warning/10 text-accent-warning">
            PostgreSQL unavailable — showing in-memory status only.
          </div>
        )}
        {events.length === 0 ? (
          <p className="text-sm text-text-muted">{dbUnavailable ? 'Event log unavailable (no DB)' : 'No kill switch events'}</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-text-muted border-b border-border">
                <th className="pb-2">Timestamp</th><th className="pb-2">Mode</th><th className="pb-2">Trigger</th><th className="pb-2">Reason</th><th className="pb-2">Actor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {events.map((ev) => (
                <tr key={ev.eventId} className="text-text-primary">
                  <td className="py-2 text-xs text-text-muted">{new Date(ev.timestamp).toLocaleString()}</td>
                  <td className="py-2"><Badge variant={ev.mode === 'hard' ? 'danger' : 'warning'}>{ev.mode ?? '-'}</Badge></td>
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

// ─── Kalshi Auto-Trader Tab ──────────────────────────────────────────────────

function KalshiAutoTab() {
  const [status, setStatus] = useState(null);
  const [positions, setPositions] = useState([]);
  const [signals, setSignals] = useState([]);
  const [markets, setMarkets] = useState([]);
  const [performance, setPerformance] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const [s, p, sig, m, perf, h] = await Promise.all([
        traderApi.get('/api/kalshi/status'),
        traderApi.get('/api/kalshi/positions'),
        traderApi.get('/api/kalshi/signals'),
        traderApi.get('/api/kalshi/markets'),
        traderApi.get('/api/kalshi/performance'),
        traderApi.get('/api/kalshi/history'),
      ]);
      setStatus(s);
      setPositions(p.positions || []);
      setSignals(sig.signals || []);
      setMarkets(m.markets || []);
      setPerformance(perf);
      setHistory(h.trades || []);
    } catch (err) {
      console.error('Kalshi fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); const id = setInterval(refresh, 15000); return () => clearInterval(id); }, [refresh]);

  const toggleBot = async () => {
    try {
      if (status?.running) {
        await traderApi.post('/api/kalshi/stop');
      } else {
        await traderApi.post('/api/kalshi/start');
      }
      setTimeout(refresh, 1000);
    } catch (err) {
      console.error('Toggle error:', err);
    }
  };

  if (loading) return <div className="text-text-muted p-8 text-center">Loading Kalshi Bot...</div>;
  if (!status?.configured) return <div className="text-text-muted p-8 text-center">Kalshi not configured. Set KALSHI_API_KEY and KALSHI_PRIVATE_KEY in .env.trader</div>;

  return (
    <div className="space-y-5">
      {/* Status Banner */}
      <div className={`rounded-lg border p-4 ${status.running ? 'border-green-500/30 bg-green-500/5' : 'border-yellow-500/30 bg-yellow-500/5'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${status.running ? 'bg-green-500 animate-pulse' : 'bg-yellow-500'}`} />
            <div>
              <h3 className="font-semibold text-text-primary">
                Kalshi Auto-Trader {status.running ? '— LIVE' : '— STOPPED'}
              </h3>
              <p className="text-sm text-text-muted">
                Scan #{status.scanCount} | {status.signalsLastScan} signals last scan
                {status.lastScan && ` | Last: ${new Date(status.lastScan).toLocaleTimeString()}`}
                {status.nextScan && ` | Next: ${new Date(status.nextScan).toLocaleTimeString()}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-xl font-bold text-text-primary">${status.balanceDollars}</div>
              <div className="text-xs text-text-muted">Balance</div>
            </div>
            <div className="text-right">
              <div className={`text-xl font-bold ${parseFloat(status.totalPnlDollars) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {parseFloat(status.totalPnlDollars) >= 0 ? '+' : ''}${status.totalPnlDollars}
              </div>
              <div className="text-xs text-text-muted">Total P&L</div>
            </div>
            <button onClick={toggleBot}
              className={`px-4 py-2 rounded-lg text-sm font-medium ${
                status.running
                  ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                  : 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
              }`}>
              <Power size={14} className="inline mr-1" />
              {status.running ? 'Stop' : 'Start'}
            </button>
            <button onClick={refresh} className="p-2 text-text-muted hover:text-text-primary">
              <RefreshCw size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Stats Row */}
      {performance && (
        <div className="grid grid-cols-6 gap-3">
          {[
            { label: 'Win Rate', value: performance.winRateStr || '—', color: parseFloat(performance.winRate) >= 50 ? 'text-green-400' : 'text-text-primary' },
            { label: 'Trades', value: performance.tradesCompleted, color: 'text-text-primary' },
            { label: 'Open Positions', value: performance.openPositions, color: 'text-text-primary' },
            { label: 'Realized P&L', value: `$${performance.realizedPnlDollars}`, color: parseFloat(performance.realizedPnlDollars) >= 0 ? 'text-green-400' : 'text-red-400' },
            { label: 'Unrealized P&L', value: `$${performance.unrealizedPnlDollars}`, color: parseFloat(performance.unrealizedPnlDollars) >= 0 ? 'text-green-400' : 'text-red-400' },
            { label: 'Daily P&L', value: `$${status.dailyPnlDollars}`, color: parseFloat(status.dailyPnlDollars) >= 0 ? 'text-green-400' : 'text-red-400' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-bg-secondary rounded-lg border border-border p-3 text-center">
              <div className={`text-lg font-bold ${color}`}>{value}</div>
              <div className="text-xs text-text-muted">{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Open Positions */}
      <div className="bg-bg-secondary rounded-lg border border-border">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          <Target size={14} className="text-accent-primary" />
          <h4 className="font-medium text-text-primary">Open Positions ({positions.length})</h4>
        </div>
        {positions.length === 0 ? (
          <div className="p-6 text-center text-text-muted text-sm">No open positions — bot is scanning for opportunities</div>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="text-text-muted text-xs border-b border-border">
              <th className="px-4 py-2 text-left">Market</th>
              <th className="px-3 py-2 text-center">Side</th>
              <th className="px-3 py-2 text-right">Contracts</th>
              <th className="px-3 py-2 text-right">Entry</th>
              <th className="px-3 py-2 text-right">Current</th>
              <th className="px-3 py-2 text-right">P&L</th>
              <th className="px-3 py-2 text-right">Signal</th>
            </tr></thead>
            <tbody>
              {positions.map((p) => (
                <tr key={p.id} className="border-b border-border/50 hover:bg-bg-primary/30">
                  <td className="px-4 py-2 text-text-primary max-w-xs truncate">{p.title || p.ticker}</td>
                  <td className="px-3 py-2 text-center">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${p.side === 'yes' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                      {p.side.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right text-text-primary">{p.contracts}</td>
                  <td className="px-3 py-2 text-right text-text-muted">{p.entryPriceDollars}</td>
                  <td className="px-3 py-2 text-right text-text-primary">{p.currentPriceDollars}</td>
                  <td className={`px-3 py-2 text-right font-medium ${parseFloat(p.unrealizedPnlDollars) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {parseFloat(p.unrealizedPnlDollars) >= 0 ? '+' : ''}{p.unrealizedPnlDollars} ({p.unrealizedPnlPctStr})
                  </td>
                  <td className="px-3 py-2 text-right text-text-muted text-xs">{p.signalType}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Active Signals */}
      <div className="bg-bg-secondary rounded-lg border border-border">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          <Zap size={14} className="text-yellow-400" />
          <h4 className="font-medium text-text-primary">Live Signals ({signals.length})</h4>
        </div>
        {signals.length === 0 ? (
          <div className="p-4 text-center text-text-muted text-sm">No signals — building price history</div>
        ) : (
          <div className="divide-y divide-border/50">
            {signals.map((s) => (
              <div key={s.signalId} className="px-4 py-3 flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      s.action === 'buy' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                    }`}>{s.action.toUpperCase()}</span>
                    <span className="text-text-primary text-sm font-medium">{s.ticker}</span>
                    <span className="text-text-muted text-xs">@ {s.priceDollars}</span>
                  </div>
                  <div className="text-xs text-text-muted mt-1">{s.reason}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-medium text-text-primary">{(s.strength * 100).toFixed(0)}%</div>
                  <div className="text-xs text-text-muted">{s.type.replace(/_/g, ' ')}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-5">
        {/* Tracked Markets */}
        <div className="bg-bg-secondary rounded-lg border border-border">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2">
            <Eye size={14} className="text-blue-400" />
            <h4 className="font-medium text-text-primary">Tracked Markets ({markets.length})</h4>
          </div>
          <div className="max-h-64 overflow-y-auto divide-y divide-border/50">
            {markets.map((m) => (
              <div key={m.ticker} className="px-4 py-2 text-xs">
                <div className="text-text-primary truncate">{m.title || m.ticker}</div>
                <div className="text-text-muted mt-0.5">
                  Bid: {m.yesBidCents}¢ | Ask: {m.yesAskCents}¢ | Spread: {m.spreadCents}¢ | Vol: {m.volume24h}
                </div>
              </div>
            ))}
            {markets.length === 0 && <div className="p-4 text-center text-text-muted text-xs">Discovering markets...</div>}
          </div>
        </div>

        {/* Trade History */}
        <div className="bg-bg-secondary rounded-lg border border-border">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2">
            <BookOpen size={14} className="text-purple-400" />
            <h4 className="font-medium text-text-primary">Trade History ({history.length})</h4>
          </div>
          <div className="max-h-64 overflow-y-auto divide-y divide-border/50">
            {history.map((t, i) => (
              <div key={i} className="px-4 py-2 flex items-center justify-between text-xs">
                <div>
                  <div className="text-text-primary">{t.ticker}</div>
                  <div className="text-text-muted">{t.exitReason} | {new Date(t.exitTime).toLocaleString()}</div>
                </div>
                <div className={`font-medium ${parseFloat(t.pnlDollars) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {parseFloat(t.pnlDollars) >= 0 ? '+' : ''}${t.pnlDollars} ({t.returnPctStr})
                </div>
              </div>
            ))}
            {history.length === 0 && <div className="p-4 text-center text-text-muted text-xs">No trades yet</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Options Lab Tab ──────────────────────────────────────────────────────────

function OptionsLabTab() {
  const [status, setStatus] = useState(null);
  const [positions, setPositions] = useState([]);
  const [history, setHistory] = useState([]);

  const fetchAll = async () => {
    try {
      const [s, p, h] = await Promise.all([
        traderApi.get('/options-lab/status'),
        traderApi.get('/options-lab/positions'),
        traderApi.get('/options-lab/history'),
      ]);
      setStatus(s);
      setPositions(p.positions || []);
      setHistory(h.trades || []);
    } catch {}
  };

  useEffect(() => { fetchAll(); const t = setInterval(fetchAll, 15000); return () => clearInterval(t); }, []);

  return (
    <div className="space-y-5">

      {/* Header Banner */}
      <div className="bg-bg-secondary border border-border rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-accent-primary/10 flex items-center justify-center">
              <TrendingUp size={16} className="text-accent-primary" />
            </div>
            <div>
              <div className="font-semibold text-text-primary">Options Lab — Paper Trading</div>
              <div className="text-xs text-text-muted mt-0.5">Kalshi prediction market signals → SPY/QQQ calls. Real Alpaca paper account. Proving the edge before going live.</div>
            </div>
          </div>
          <div className="text-xs px-3 py-1.5 rounded-full bg-accent-primary/10 text-accent-primary font-medium border border-accent-primary/20">
            PAPER MODE
          </div>
        </div>
      </div>

      {/* Stats Row */}
      {status && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatCard label="Total P&L" value={`${(status.totalPnlDollars || 0) >= 0 ? '+' : ''}$${(status.totalPnlDollars || 0).toFixed(2)}`} variant={(status.totalPnlDollars || 0) >= 0 ? 'success' : 'danger'} icon={DollarSign} />
          <StatCard label="Trades" value={status.totalTrades || 0} variant="info" icon={Activity} />
          <StatCard label="Win Rate" value={`${((status.winRate || 0) * 100).toFixed(0)}%`} variant={(status.winRate || 0) >= 0.5 ? 'success' : 'warning'} icon={TrendingUp} />
          <StatCard label="Best Trade" value={`+${((status.bestTrade || 0) * 100).toFixed(0)}%`} variant="success" icon={TrendingUp} />
          <StatCard label="Worst Trade" value={`${((status.worstTrade || 0) * 100).toFixed(0)}%`} variant="danger" icon={Activity} />
        </div>
      )}

      {/* How It Works */}
      <div className="bg-bg-secondary border border-border rounded-lg p-4">
        <div className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">How It Works</div>
        <div className="grid grid-cols-3 gap-4 text-xs">
          <div className="flex gap-2">
            <div className="w-5 h-5 rounded-full bg-accent-primary/10 text-accent-primary flex items-center justify-center shrink-0 font-bold text-[10px]">1</div>
            <div><div className="text-text-primary font-medium">Kalshi Signal</div><div className="text-text-muted mt-0.5">Bot detects KXINXPOS momentum oversold — S&P EOY market dips on retail panic</div></div>
          </div>
          <div className="flex gap-2">
            <div className="w-5 h-5 rounded-full bg-accent-primary/10 text-accent-primary flex items-center justify-center shrink-0 font-bold text-[10px]">2</div>
            <div><div className="text-text-primary font-medium">Options Bridge</div><div className="text-text-muted mt-0.5">Same signal buys ATM SPY CALL on Alpaca paper — 14 DTE, max $300 premium</div></div>
          </div>
          <div className="flex gap-2">
            <div className="w-5 h-5 rounded-full bg-accent-primary/10 text-accent-primary flex items-center justify-center shrink-0 font-bold text-[10px]">3</div>
            <div><div className="text-text-primary font-medium">Leveraged Return</div><div className="text-text-muted mt-0.5">1% S&P recovery = ~5-10x on the option. Target +50% per trade, stop at -40%</div></div>
          </div>
        </div>
      </div>

      {/* Open Positions */}
      <div className="bg-bg-secondary rounded-lg border border-border">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          <Activity size={14} className="text-accent-primary" />
          <h4 className="font-medium text-text-primary">Open Paper Positions ({positions.length})</h4>
        </div>
        {positions.length === 0 ? (
          <div className="p-6 text-center text-text-muted text-sm">
            No open positions — waiting for next Kalshi oversold signal
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {positions.map((p, i) => (
              <div key={i} className="px-4 py-3 flex items-center justify-between text-xs">
                <div>
                  <div className="font-medium text-text-primary font-mono">{p.contractSymbol}</div>
                  <div className="text-text-muted mt-0.5">{p.underlyingSymbol} CALL · {p.daysToExpiry}DTE · Entry: {p.entryPriceDollars}</div>
                  <div className="text-text-muted">Signal: {p.kalshiSignalTicker?.slice(0, 30)}</div>
                </div>
                <div className="text-right">
                  <div className="text-text-muted">Premium paid</div>
                  <div className="font-medium text-text-primary">{p.premiumPaid}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Trade History */}
      <div className="bg-bg-secondary rounded-lg border border-border">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          <BookOpen size={14} className="text-purple-400" />
          <h4 className="font-medium text-text-primary">Paper Trade History ({history.length})</h4>
        </div>
        {history.length === 0 ? (
          <div className="p-6 text-center text-text-muted text-sm">No closed trades yet — history builds as positions open and close</div>
        ) : (
          <div className="max-h-64 overflow-y-auto divide-y divide-border/50">
            {history.map((t, i) => (
              <div key={i} className="px-4 py-2 flex items-center justify-between text-xs">
                <div>
                  <div className="font-mono text-text-primary">{t.contractSymbol}</div>
                  <div className="text-text-muted">{t.exitReason} · {t.exitDate ? new Date(t.exitDate).toLocaleString() : '--'}</div>
                </div>
                <div className={`font-medium ${(t.pnlDollars || 0) >= 0 ? 'text-accent-success' : 'text-accent-danger'}`}>
                  {t.pnlFormatted} ({t.returnFormatted})
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Go Live CTA */}
      <div className="bg-accent-primary/5 border border-accent-primary/20 rounded-lg p-4 text-center">
        <div className="text-sm font-medium text-text-primary mb-1">Path to Real Money</div>
        <div className="text-xs text-text-muted">Paper trade for 30 days · Achieve 40%+ win rate + positive Sharpe · Then fund a real options account and run live</div>
      </div>
    </div>
  );
}

// ─── KeepAliveTab — mount once, show/hide via CSS (no refetch on tab switch) ─

function KeepAliveTab({ id, active, children }) {
  const [hasBeenActive, setHasBeenActive] = React.useState(false);
  const isActive = active === id;

  React.useEffect(() => {
    if (isActive && !hasBeenActive) setHasBeenActive(true);
  }, [isActive, hasBeenActive]);

  if (!hasBeenActive) return null; // never mounted yet

  return (
    <div style={{ display: isActive ? 'block' : 'none' }}>
      {children}
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'dashboard',   label: 'Dashboard',    icon: TrendingUp },
  { id: 'ai-panel',    label: 'AI Panel',     icon: Zap },
  { id: 'brain',       label: 'Brain',        icon: Brain },
  { id: 'performance', label: 'Performance',  icon: BarChart3 },
  { id: 'kalshi',      label: 'Kalshi Bot',   icon: DollarSign },
  { id: 'options-lab', label: 'Options Lab',  icon: TrendingUp },
  { id: 'polymarket',  label: 'Polymarket',   icon: Target },
  { id: 'copy-trade',  label: 'Copy Trade',   icon: Users },
  { id: 'strategies',  label: 'Strategies',   icon: Activity },
  { id: 'orders',      label: 'Orders',       icon: ShoppingCart },
  { id: 'risk',        label: 'Risk',         icon: Shield },
  { id: 'broker',      label: 'Broker',       icon: Server },
  { id: 'kill-switch', label: 'Kill Switch',  icon: AlertTriangle },
];

export default function TradingPage() {
  const [activeTab, setActiveTab] = useState('dashboard');

  return (
    <div className="h-full flex flex-col bg-bg-primary">
      {/* Page header */}
      <div className="border-b border-border bg-bg-secondary px-6 py-4 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-xl font-semibold text-text-primary flex items-center gap-2">
            OpenClaw Trader
            <Badge variant="purple">v0.2.0 — Recursive Brain</Badge>
          </h1>
          <p className="text-sm text-text-muted mt-0.5">
            4 AI analysts | 4-layer learning brain | $2.34/day
          </p>
        </div>
        <a href={TRADER_BASE} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-accent-primary bg-accent-primary/10 rounded hover:bg-accent-primary/20 transition-colors">
          <ExternalLink size={12} /> localhost:3002
        </a>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-border bg-bg-secondary px-6 gap-0.5 shrink-0 overflow-x-auto">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 px-4 py-3 text-sm border-b-2 transition-colors whitespace-nowrap ${
              activeTab === id ? 'border-accent-primary text-accent-primary font-medium' : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}>
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>

      {/* Tab content — tabs stay mounted once visited (no refetch on switch) */}
      <div className="flex-1 overflow-y-auto p-5">
        <KeepAliveTab id="dashboard"   active={activeTab}><DashboardTab /></KeepAliveTab>
        <KeepAliveTab id="ai-panel"    active={activeTab}><AIPanelTab /></KeepAliveTab>
        <KeepAliveTab id="brain"       active={activeTab}><BrainTab /></KeepAliveTab>
        <KeepAliveTab id="performance" active={activeTab}><PerformanceTab /></KeepAliveTab>
        <KeepAliveTab id="kalshi"      active={activeTab}><KalshiAutoTab /></KeepAliveTab>
        <KeepAliveTab id="options-lab" active={activeTab}><OptionsLabTab /></KeepAliveTab>
        <KeepAliveTab id="polymarket"  active={activeTab}><PolymarketTab /></KeepAliveTab>
        <KeepAliveTab id="copy-trade"  active={activeTab}><CopyTradeTab /></KeepAliveTab>
        <KeepAliveTab id="strategies"  active={activeTab}><StrategiesTab /></KeepAliveTab>
        <KeepAliveTab id="orders"      active={activeTab}><OrdersTab /></KeepAliveTab>
        <KeepAliveTab id="risk"        active={activeTab}><RiskTab /></KeepAliveTab>
        <KeepAliveTab id="broker"      active={activeTab}><BrokerTab /></KeepAliveTab>
        <KeepAliveTab id="kill-switch" active={activeTab}><KillSwitchTab /></KeepAliveTab>
      </div>
    </div>
  );
}
