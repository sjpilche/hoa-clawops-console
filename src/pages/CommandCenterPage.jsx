/**
 * @file CommandCenterPage.jsx
 * @description Unified operations dashboard — everything happening in OpenClaw at a glance.
 *
 * Replaces GlobalOverview as the / landing page. Composes data from:
 *   /api/command-center, /api/dashboard/warroom, /api/health,
 *   /api/health/agents/summary, /api/costs/timeline, /api/dream-team/scorecards/latest
 *
 * Secondary tabs lazy-load: /api/schedules, /api/pipeline/health, /api/brain/intelligence
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  Bot, Activity, DollarSign, AlertTriangle, XCircle, CheckCircle,
  AlertCircle, Loader, Circle, RefreshCw, TrendingUp, TrendingDown,
  Zap, BarChart3, Brain, Calendar, Users, Shield, Crosshair,
  ChevronRight,
} from 'lucide-react';
import {
  AreaChart, Area, ResponsiveContainer, Tooltip,
} from 'recharts';
import { api } from '@/lib/api';
import { CHART_COLORS, CHART_TOOLTIP } from '@/lib/chartTheme';
import StatCard from '@/components/ui/StatCard';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import DataTable from '@/components/ui/DataTable';
import Tabs from '@/components/ui/Tabs';
import ProgressBar from '@/components/ui/ProgressBar';
import SectionHeader from '@/components/ui/SectionHeader';
import { SkeletonKpiBar, SkeletonTable, SkeletonCard } from '@/components/ui/Skeleton';

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(dateStr) {
  if (!dateStr) return '—';
  const diff = Date.now() - new Date(dateStr).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function fmt$(n, precision) {
  if (n == null) return '—';
  const p = precision ?? (n < 1 ? 4 : 2);
  return `$${Number(n).toFixed(p)}`;
}

function fmtDuration(ms) {
  if (!ms) return '—';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function nextRunLabel(cronExpr) {
  if (!cronExpr) return '—';
  const parts = cronExpr.split(' ');
  if (parts.length !== 5) return cronExpr;
  const [min, hour, , , dow] = parts;
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const dayLabel = dow === '*' ? 'Daily' : days[parseInt(dow)] || dow;
  return `${dayLabel} ${hour.padStart(2,'0')}:${min.padStart(2,'0')}`;
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function safe(obj, ...path) {
  let v = obj;
  for (const k of path) { v = v?.[k]; }
  return v;
}

// ── Inline Sub-Components ─────────────────────────────────────────────────────

function RunStatusIcon({ status }) {
  switch (status) {
    case 'success':
    case 'completed':
      return <CheckCircle size={14} className="text-accent-success shrink-0" />;
    case 'failed':
    case 'error':
      return <XCircle size={14} className="text-accent-danger shrink-0" />;
    case 'running':
      return <Loader size={14} className="text-accent-info shrink-0 animate-spin" />;
    case 'pending':
      return <Circle size={14} className="text-accent-warning shrink-0" />;
    default:
      return <Circle size={14} className="text-text-muted shrink-0" />;
  }
}

function StatusDot({ status, label }) {
  const colors = {
    healthy: 'bg-accent-success',
    active: 'bg-accent-success',
    armed: 'bg-accent-success',
    ok: 'bg-accent-success',
    paper: 'bg-accent-warning',
    degraded: 'bg-accent-warning',
    warning: 'bg-accent-warning',
    pipeline: 'bg-accent-info',
    inactive: 'bg-text-muted',
    unhealthy: 'bg-accent-danger',
    error: 'bg-accent-danger',
    triggered: 'bg-accent-danger',
  };
  const c = colors[status] || 'bg-text-muted';
  return (
    <div className="flex items-center gap-1.5">
      <span className={`w-2 h-2 rounded-full ${c} ${status === 'running' ? 'animate-pulse' : ''}`} />
      <span className="text-xs text-text-muted">{label}</span>
    </div>
  );
}

function RevenueLaneCard({ title, icon: Icon, status, metrics, to, color }) {
  return (
    <Link to={to} className="block">
      <div className={`p-3 bg-bg-secondary border border-border rounded-lg hover:border-accent-primary/40 transition-colors group`}>
        <div className="flex items-center gap-2 mb-2">
          <Icon size={14} className={color} />
          <span className="text-xs font-semibold text-text-primary">{title}</span>
          <Badge variant={Badge.variantFromStatus(status === 'paper' ? 'pending' : status === 'active' ? 'success' : status === 'pipeline' ? 'info' : 'neutral')} size="sm">
            {status || 'off'}
          </Badge>
          <ChevronRight size={12} className="ml-auto text-text-muted group-hover:text-accent-primary transition-colors" />
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
          {metrics.map(m => (
            <div key={m.label} className="flex justify-between">
              <span className="text-xs text-text-muted">{m.label}</span>
              <span className="text-xs font-mono text-text-primary">{m.value}</span>
            </div>
          ))}
        </div>
      </div>
    </Link>
  );
}

function AlertItem({ level, category, message, to }) {
  const Icon = level === 'error' ? XCircle : AlertTriangle;
  const iconColor = level === 'error' ? 'text-accent-danger' : 'text-accent-warning';
  const inner = (
    <div className="flex items-start gap-2 py-2 px-3 rounded-lg hover:bg-bg-elevated transition-colors cursor-pointer">
      <Icon size={14} className={`${iconColor} shrink-0 mt-0.5`} />
      <div className="min-w-0 flex-1">
        <span className="text-xs text-text-primary">{message}</span>
      </div>
      <Badge variant={level === 'error' ? 'danger' : 'warning'} size="sm">{category}</Badge>
    </div>
  );
  return to ? <Link to={to}>{inner}</Link> : inner;
}

function MiniSparkline({ data, dataKey = 'cost', height = 52 }) {
  if (!data || data.length === 0) return null;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CHART_COLORS[0]} stopOpacity={0.3} />
            <stop offset="100%" stopColor={CHART_COLORS[0]} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Tooltip {...CHART_TOOLTIP} formatter={(v) => [`$${Number(v).toFixed(2)}`, 'Cost']} labelFormatter={(l) => l} />
        <Area type="monotone" dataKey={dataKey} stroke={CHART_COLORS[0]} fill="url(#sparkGrad)" strokeWidth={1.5} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function CommandCenterPage() {
  // Tier 1 state
  const [cc, setCc] = useState(null);           // /command-center
  const [warroom, setWarroom] = useState(null);  // /dashboard/warroom
  const [health, setHealth] = useState(null);    // /health

  // Tier 2 state
  const [agentSummary, setAgentSummary] = useState(null);
  const [costTimeline, setCostTimeline] = useState([]);
  const [scorecards, setScorecards] = useState([]);

  // Tier 3 state (lazy)
  const [tabData, setTabData] = useState({});
  const [activeTab, setActiveTab] = useState('schedules');

  // UI state
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState(null);
  const [liveActivity, setLiveActivity] = useState([]);
  const tier2Ref = useRef(null);

  // ── Tier 1 fetch (10s) ──
  const fetchTier1 = useCallback(async () => {
    const [ccRes, wrRes, hRes] = await Promise.allSettled([
      api.get('/command-center'),
      api.get('/dashboard/warroom?days=7'),
      fetch('/api/health').then(r => r.json()),
    ]);
    if (ccRes.status === 'fulfilled') setCc(ccRes.value);
    if (wrRes.status === 'fulfilled') setWarroom(wrRes.value);
    if (hRes.status === 'fulfilled') setHealth(hRes.value);
    setLastRefreshed(new Date());

    // Seed live activity from command-center response
    if (ccRes.status === 'fulfilled' && ccRes.value?.recentActivity) {
      setLiveActivity(ccRes.value.recentActivity);
    }
  }, []);

  // ── Tier 2 fetch (30s) ──
  const fetchTier2 = useCallback(async () => {
    const [asRes, ctRes, scRes] = await Promise.allSettled([
      api.get('/health/agents/summary'),
      fetch('/api/costs/timeline?period=day&days=7').then(r => r.json()),
      api.get('/dream-team/scorecards/latest'),
    ]);
    if (asRes.status === 'fulfilled') setAgentSummary(asRes.value);
    if (ctRes.status === 'fulfilled' && ctRes.value?.timeline) setCostTimeline(ctRes.value.timeline);
    if (scRes.status === 'fulfilled') setScorecards(scRes.value?.scorecards || []);
  }, []);

  // ── Tier 3 fetch (on tab switch) ──
  const fetchTab = useCallback(async (key) => {
    if (tabData[key]) return; // already loaded
    let data;
    try {
      switch (key) {
        case 'schedules': data = await api.get('/schedules'); break;
        case 'pipeline': data = await api.get('/pipeline/health'); break;
        case 'brain': data = await api.get('/brain/intelligence'); break;
        case 'dreamteam': data = scorecards; break;
        default: return;
      }
    } catch { data = null; }
    setTabData(prev => ({ ...prev, [key]: data }));
  }, [tabData, scorecards]);

  // ── Refresh all ──
  const refreshAll = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([fetchTier1(), fetchTier2()]);
    } finally {
      setIsRefreshing(false);
    }
  }, [fetchTier1, fetchTier2]);

  // ── Lifecycle ──
  useEffect(() => {
    refreshAll();
    const t1 = setInterval(fetchTier1, 10000);
    const t2 = setInterval(fetchTier2, 30000);
    return () => { clearInterval(t1); clearInterval(t2); };
  }, [refreshAll, fetchTier1, fetchTier2]);

  // ── Socket.io for live run updates ──
  useEffect(() => {
    let socket;
    try {
      const { io } = require('socket.io-client');
      const token = localStorage.getItem('clawops_token');
      if (!token) return;
      const wsUrl = import.meta.env.VITE_WS_URL || window.location.origin.replace(':5174', ':3001');
      socket = io(wsUrl, { auth: { token }, transports: ['websocket', 'polling'] });

      socket.on('run:completed', (data) => {
        setLiveActivity(prev => {
          const updated = prev.filter(r => r.id !== data.runId);
          return [{ id: data.runId, agent_id: data.agentId, status: 'completed', cost_usd: data.cost, duration_ms: data.duration, created_at: new Date().toISOString() }, ...updated].slice(0, 15);
        });
      });

      socket.on('run:failed', (data) => {
        setLiveActivity(prev => {
          const updated = prev.filter(r => r.id !== data.runId);
          return [{ id: data.runId, agent_id: data.agentId, status: 'failed', error_msg: data.error, created_at: new Date().toISOString() }, ...updated].slice(0, 15);
        });
      });
    } catch { /* socket.io not available */ }
    return () => { if (socket) socket.disconnect(); };
  }, []);

  // Tab change handler
  const handleTabChange = useCallback((key) => {
    setActiveTab(key);
    fetchTab(key);
  }, [fetchTab]);

  // ── Derived data ──
  const alerts = [];
  // Command-center alerts
  if (cc?.alerts) alerts.push(...cc.alerts);
  // Worst agents
  if (agentSummary?.worstAgents) {
    agentSummary.worstAgents.filter(a => a.success_rate < 0.7).forEach(a =>
      alerts.push({ level: 'warning', category: 'agents', message: `${a.name} — ${Math.round(a.success_rate * 100)}% success rate`, to: '/directory' })
    );
  }
  // Stale agents
  if (agentSummary?.staleAgents) {
    agentSummary.staleAgents.slice(0, 3).forEach(a =>
      alerts.push({ level: 'warning', category: 'stale', message: `${a.name} hasn't run since ${relativeTime(a.last_run_at)}`, to: '/directory' })
    );
  }
  // Pending approvals
  const readyToSend = safe(warroom, 'outreach', 'ready_to_send') || 0;
  if (readyToSend > 0) {
    alerts.push({ level: 'warning', category: 'outreach', message: `${readyToSend} approved emails ready to send`, to: '/jake-marketing' });
  }

  const runs = safe(warroom, 'runs') || {};
  const costs = safe(warroom, 'costs') || {};
  const pipeline = safe(warroom, 'pipeline') || {};
  const outreach = safe(warroom, 'outreach') || {};

  // System status for lane bar
  const systemStatus = health?.status || 'unknown';
  const tradingStatus = safe(cc, 'lanes', 'trading', 'status') || 'inactive';
  const servicesStatus = safe(cc, 'lanes', 'services', 'status') || 'inactive';
  const saasStatus = safe(cc, 'lanes', 'saas', 'status') || 'inactive';
  const brainStatus = safe(warroom, 'brain', 'status') || 'unknown';

  // Activity columns
  const activityColumns = [
    {
      key: 'agent_name',
      label: 'Agent',
      render: (val, row) => (
        <div className="flex items-center gap-2">
          <RunStatusIcon status={row.status} />
          <span className="text-text-primary font-medium truncate max-w-[200px]">{val || row.agent_id?.slice(0, 8) || 'Unknown'}</span>
        </div>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      hideBelow: 'sm',
      render: (val) => <Badge variant={Badge.variantFromStatus(val)} size="sm">{val}</Badge>,
    },
    {
      key: 'cost_usd',
      label: 'Cost',
      align: 'right',
      hideBelow: 'md',
      render: (val) => <span className="font-mono text-xs text-text-muted">{val ? fmt$(val) : '—'}</span>,
    },
    {
      key: 'duration_ms',
      label: 'Duration',
      align: 'right',
      hideBelow: 'lg',
      render: (val) => <span className="text-xs text-text-muted">{fmtDuration(val)}</span>,
    },
    {
      key: 'created_at',
      label: 'When',
      align: 'right',
      render: (val) => <span className="text-xs text-text-muted">{relativeTime(val)}</span>,
    },
  ];

  // Secondary tab definitions
  const tabDefs = [
    { key: 'schedules', label: 'Schedules', icon: Calendar },
    { key: 'pipeline', label: 'Pipeline', icon: BarChart3 },
    { key: 'dreamteam', label: 'Dream Team', icon: Users },
    { key: 'brain', label: 'Brain Health', icon: Brain },
  ];

  // ── Render ──
  const isLoading = !cc && !warroom;

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 xl:p-6 max-w-[1600px] mx-auto space-y-4">

        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-text-primary">{getGreeting()}, Steve</h1>
            <p className="text-xs text-text-muted mt-0.5">
              {lastRefreshed ? `Updated ${relativeTime(lastRefreshed.toISOString())}` : 'Loading…'}
              {' · '}auto-refreshes 10s
            </p>
          </div>
          <div className="flex items-center gap-3">
            {health && (
              <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
                systemStatus === 'healthy' ? 'bg-accent-success/10 text-accent-success border-accent-success/30' :
                systemStatus === 'degraded' ? 'bg-accent-warning/10 text-accent-warning border-accent-warning/30' :
                'bg-accent-danger/10 text-accent-danger border-accent-danger/30'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${
                  systemStatus === 'healthy' ? 'bg-accent-success' : systemStatus === 'degraded' ? 'bg-accent-warning' : 'bg-accent-danger'
                }`} />
                {systemStatus}
              </div>
            )}
            <button
              onClick={refreshAll}
              disabled={isRefreshing}
              className="p-2 rounded-lg border border-border hover:border-accent-primary/40 text-text-muted hover:text-accent-primary transition-colors"
            >
              <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* ── Lane Status Bar ────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-4 px-3 py-2 bg-bg-secondary border border-border rounded-lg">
          <StatusDot status={systemStatus} label="System" />
          <StatusDot status={tradingStatus} label="Trading" />
          <StatusDot status={servicesStatus} label="Services" />
          <StatusDot status={saasStatus} label="SaaS" />
          <StatusDot status={brainStatus} label="Brain" />
          <StatusDot status={safe(warroom, 'schedules', 'enabled') > 0 ? 'healthy' : 'inactive'} label={`${safe(warroom, 'schedules', 'enabled') || 0} Schedules`} />
        </div>

        {/* ── KPI Row ────────────────────────────────────────────────────────── */}
        {isLoading ? <SkeletonKpiBar /> : (
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
            <StatCard
              icon={Bot}
              label="Active Agents"
              value={safe(cc, 'agents', 'activeToday') ?? safe(agentSummary, 'fleet', 'activeAgents') ?? '—'}
              sub={`${safe(cc, 'agents', 'total') || safe(agentSummary, 'fleet', 'totalAgents') || '?'} total`}
              color="text-accent-primary"
              glow={safe(agentSummary, 'fleet', 'runningNow') > 0}
              to="/directory"
            />
            <StatCard
              icon={Activity}
              label="Runs Today"
              value={safe(runs, 'today', 'total') ?? '—'}
              sub={`${safe(runs, 'today', 'completed') || 0} completed`}
              color="text-accent-info"
              to="/results"
            />
            <StatCard
              icon={Shield}
              label="Fail Rate 7d"
              value={safe(agentSummary, 'week', 'failRate') != null ? `${Number(safe(agentSummary, 'week', 'failRate')).toFixed(1)}%` : safe(runs, 'this_week', 'success_rate') != null ? `${(100 - Number(safe(runs, 'this_week', 'success_rate'))).toFixed(1)}%` : '—'}
              sub={`${safe(runs, 'today', 'failed') || 0} failed today`}
              color={Number(safe(agentSummary, 'week', 'failRate') || 0) > 5 ? 'text-accent-danger' : 'text-accent-success'}
              glow={Number(safe(agentSummary, 'week', 'failRate') || 0) > 5}
              to="/results"
            />
            <StatCard
              icon={DollarSign}
              label="Spend 24h"
              value={fmt$(costs.today, 2)}
              sub={`${fmt$(costs.this_week, 2)} this week`}
              color="text-accent-warning"
              glow={(costs.today || 0) > 50}
              to="/costs"
            />
            <StatCard
              icon={TrendingUp}
              label="Pipeline"
              value={pipeline.total || '—'}
              sub={`${outreach.replied_this_week || 0} replies this week`}
              color="text-accent-success"
              to="/pipeline-health"
            />
            <StatCard
              icon={AlertTriangle}
              label="Alerts"
              value={alerts.length}
              sub={alerts.length > 0 ? 'need attention' : 'all clear'}
              color={alerts.length > 0 ? 'text-accent-warning' : 'text-accent-success'}
              glow={alerts.length > 0}
            />
          </div>
        )}

        {/* ── Main Grid ──────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* ── Left Column (2/3) ──────────────────────────────────────────── */}
          <div className="lg:col-span-2 space-y-4">

            {/* Revenue Lanes */}
            <section>
              <SectionHeader title="Revenue Lanes" />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <RevenueLaneCard
                  title="Trading"
                  icon={Zap}
                  color="text-accent-warning"
                  status={tradingStatus}
                  to="/trading"
                  metrics={[
                    { label: 'Daily P&L', value: fmt$(safe(cc, 'lanes', 'trading', 'dailyPnl'), 2) },
                    { label: 'Total P&L', value: fmt$(safe(cc, 'lanes', 'trading', 'totalPnl'), 2) },
                  ]}
                />
                <RevenueLaneCard
                  title="Services"
                  icon={Users}
                  color="text-accent-primary"
                  status={servicesStatus}
                  to="/pipeline-health"
                  metrics={[
                    { label: 'Leads', value: String(pipeline.total || 0) },
                    { label: 'Reply Rate', value: `${outreach.reply_rate || 0}%` },
                  ]}
                />
                <RevenueLaneCard
                  title="SaaS / RSE"
                  icon={BarChart3}
                  color="text-accent-info"
                  status={saasStatus}
                  to="/rse"
                  metrics={[
                    { label: 'Signals', value: String(safe(cc, 'lanes', 'saas', 'signals') || 0) },
                    { label: 'Clusters', value: String(safe(cc, 'lanes', 'saas', 'clusters') || 0) },
                  ]}
                />
              </div>
            </section>

            {/* Live Activity */}
            <section>
              <SectionHeader title="Live Activity" to="/results" count={liveActivity.length || safe(runs, 'today', 'total')} />
              {isLoading ? <SkeletonTable rows={5} /> : (
                <DataTable
                  columns={activityColumns}
                  data={liveActivity.slice(0, 15)}
                  emptyMessage="No recent runs."
                />
              )}
            </section>
          </div>

          {/* ── Right Column (1/3) ─────────────────────────────────────────── */}
          <div className="space-y-4">

            {/* Alerts & Actions */}
            <section>
              <SectionHeader title="Alerts" count={alerts.length} />
              <div className="bg-bg-secondary border border-border rounded-xl overflow-hidden">
                {alerts.length === 0 ? (
                  <div className="flex items-center justify-center gap-2 py-6 text-sm text-text-muted">
                    <CheckCircle size={16} className="text-accent-success" />
                    All systems nominal
                  </div>
                ) : (
                  <div className="divide-y divide-border max-h-[280px] overflow-y-auto">
                    {alerts.slice(0, 10).map((a, i) => (
                      <AlertItem key={i} {...a} />
                    ))}
                  </div>
                )}
              </div>
            </section>

            {/* Cost Sparkline */}
            <section>
              <SectionHeader title="Spend" to="/costs" />
              <Link to="/costs">
                <div className="bg-bg-secondary border border-border rounded-xl p-4 hover:border-accent-primary/40 transition-colors">
                  <MiniSparkline data={costTimeline} />
                  <div className="space-y-2 mt-3">
                    {[
                      { label: 'Last 24h', value: costs.today },
                      { label: 'Last 7d', value: costs.this_week },
                      { label: 'Last 30d', value: safe(warroom, 'costs', 'all_time') },
                    ].map(r => (
                      <div key={r.label} className="flex justify-between">
                        <span className="text-xs text-text-muted">{r.label}</span>
                        <span className="text-xs font-mono font-semibold text-text-primary">{fmt$(r.value, 2)}</span>
                      </div>
                    ))}
                    {costs.avg_per_run != null && (
                      <div className="pt-2 border-t border-border flex justify-between">
                        <span className="text-xs text-text-muted">Avg/run</span>
                        <span className="text-xs font-mono text-text-secondary">{fmt$(costs.avg_per_run)}</span>
                      </div>
                    )}
                  </div>
                </div>
              </Link>
            </section>

            {/* Outreach Snapshot */}
            {outreach.total_sent > 0 && (
              <section>
                <SectionHeader title="Outreach" to="/jake-marketing" />
                <div className="bg-bg-secondary border border-border rounded-xl p-4 space-y-2">
                  {[
                    { label: 'Sent', value: outreach.total_sent },
                    { label: 'Replied', value: outreach.total_replied },
                    { label: 'Reply Rate', value: `${outreach.reply_rate || 0}%` },
                    { label: 'Sent This Week', value: outreach.sent_this_week },
                    { label: 'Ready to Send', value: outreach.ready_to_send },
                  ].map(r => (
                    <div key={r.label} className="flex justify-between">
                      <span className="text-xs text-text-muted">{r.label}</span>
                      <span className="text-xs font-mono text-text-primary">{r.value ?? '—'}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>

        {/* ── Secondary Tabs ─────────────────────────────────────────────────── */}
        <section className="pt-2">
          <Tabs tabs={tabDefs} activeTab={activeTab} onChange={handleTabChange} />

          <div className="mt-3" role="tabpanel" id={`tabpanel-${activeTab}`} aria-labelledby={`tab-${activeTab}`}>

            {/* Schedules Tab */}
            {activeTab === 'schedules' && (
              tabData.schedules ? (
                <div className="bg-bg-secondary border border-border rounded-xl overflow-hidden">
                  <div className="divide-y divide-border max-h-[400px] overflow-y-auto">
                    {(tabData.schedules.schedules || []).filter(s => s.enabled).sort((a, b) => (a.cronExpression || '').localeCompare(b.cronExpression || '')).map(s => (
                      <div key={s.id} className="px-4 py-2.5 flex items-center gap-3">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${
                          s.performanceHealth === 'red' ? 'bg-accent-danger' : s.performanceHealth === 'yellow' ? 'bg-accent-warning' : 'bg-accent-success'
                        }`} />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm text-text-primary font-medium truncate">{s.name}</div>
                          <div className="text-xs text-text-muted truncate">{s.agentName}</div>
                        </div>
                        <div className="text-xs text-text-muted text-right shrink-0 space-y-0.5">
                          <div>{nextRunLabel(s.cronExpression)}</div>
                          <div className="opacity-60">Last: {relativeTime(s.lastRunAt)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : <SkeletonTable rows={4} />
            )}

            {/* Pipeline Tab */}
            {activeTab === 'pipeline' && (
              tabData.pipeline ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {['jake', 'hoa'].map(product => {
                    const p = safe(tabData.pipeline, 'products', product);
                    if (!p) return null;
                    const stages = [
                      { label: 'New', value: safe(p, 'byStage', 'new') || 0, color: 'bg-blue-500' },
                      { label: 'Contacted', value: safe(p, 'byStage', 'contacted') || 0, color: 'bg-cyan-500' },
                      { label: 'Replied', value: safe(p, 'byStage', 'replied') || 0, color: 'bg-violet-500' },
                      { label: 'Meeting', value: safe(p, 'byStage', 'meeting') || safe(p, 'byStage', 'meeting_booked') || 0, color: 'bg-amber-500' },
                      { label: 'Pilot', value: safe(p, 'byStage', 'pilot') || 0, color: 'bg-emerald-500' },
                    ];
                    const total = p.totalLeads || stages.reduce((s, st) => s + st.value, 0) || 1;
                    return (
                      <div key={product} className="bg-bg-secondary border border-border rounded-xl p-4">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="text-sm font-semibold text-text-primary capitalize">{product === 'jake' ? 'Jake CFO' : 'HOA'}</h4>
                          <span className="text-xs text-text-muted">{p.totalLeads || 0} leads</span>
                        </div>
                        <div className="space-y-2">
                          {stages.map(st => (
                            <div key={st.label}>
                              <div className="flex justify-between text-xs mb-0.5">
                                <span className="text-text-secondary">{st.label}</span>
                                <span className="font-mono text-text-primary">{st.value}</span>
                              </div>
                              <ProgressBar value={Math.round((st.value / total) * 100)} color={st.color} size="sm" />
                            </div>
                          ))}
                        </div>
                        <div className="mt-3 pt-2 border-t border-border grid grid-cols-2 gap-2 text-xs">
                          <div><span className="text-text-muted">High Urgency: </span><span className="text-text-primary font-mono">{p.highUrgency || 0}</span></div>
                          <div><span className="text-text-muted">Stalled: </span><span className="text-text-primary font-mono">{p.stalled || 0}</span></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : <SkeletonCard />
            )}

            {/* Dream Team Tab */}
            {activeTab === 'dreamteam' && (
              scorecards.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                  {scorecards.map(sc => (
                    <div key={sc.agent_name} className="bg-bg-secondary border border-border rounded-xl p-4">
                      <div className="text-sm font-semibold text-text-primary capitalize mb-2">{sc.agent_name}</div>
                      <div className="text-3xl font-bold font-mono text-accent-primary mb-2">{Number(sc.overall_score || 0).toFixed(1)}</div>
                      <div className="space-y-1 text-xs">
                        {['leadership', 'decision_quality', 'execution_speed', 'cost_efficiency', 'learning_velocity'].map(dim => (
                          <div key={dim} className="flex justify-between">
                            <span className="text-text-muted capitalize">{dim.replace(/_/g, ' ')}</span>
                            <span className="font-mono text-text-primary">{Number(sc[dim] || 0).toFixed(1)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-text-muted text-sm">No scorecard data yet. Dream Team runs nightly at 11 PM.</div>
              )
            )}

            {/* Brain Tab */}
            {activeTab === 'brain' && (
              tabData.brain ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-bg-secondary border border-border rounded-xl p-4">
                    <h4 className="text-sm font-semibold text-text-primary mb-3">Learning Velocity</h4>
                    <div className="space-y-2 text-xs">
                      {Object.entries(safe(tabData.brain, 'velocity') || {}).map(([k, v]) => (
                        <div key={k} className="flex justify-between">
                          <span className="text-text-muted capitalize">{k}/day</span>
                          <span className="font-mono text-text-primary">{v}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="bg-bg-secondary border border-border rounded-xl p-4">
                    <h4 className="text-sm font-semibold text-text-primary mb-3">Feedback Health</h4>
                    <div className="space-y-2 text-xs">
                      {['total', 'approved', 'rejected', 'approvalRate'].map(k => (
                        <div key={k} className="flex justify-between">
                          <span className="text-text-muted capitalize">{k === 'approvalRate' ? 'Approval Rate' : k}</span>
                          <span className="font-mono text-text-primary">{k === 'approvalRate' ? `${safe(tabData.brain, 'feedbackHealth', k) || 0}%` : safe(tabData.brain, 'feedbackHealth', k) || 0}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="bg-bg-secondary border border-border rounded-xl p-4">
                    <h4 className="text-sm font-semibold text-text-primary mb-3">Top Agents</h4>
                    <div className="space-y-2 text-xs">
                      {(safe(tabData.brain, 'agentRankings') || []).slice(0, 5).map(a => (
                        <div key={a.agent} className="flex justify-between">
                          <span className="text-text-muted truncate max-w-[140px]">{a.agent}</span>
                          <span className="font-mono text-text-primary">{a.winRate || 0}% win</span>
                        </div>
                      ))}
                    </div>
                    {(safe(tabData.brain, 'gaps') || []).length > 0 && (
                      <div className="mt-3 pt-2 border-t border-border">
                        <div className="text-xs text-accent-warning">{safe(tabData.brain, 'gaps', 0)}</div>
                      </div>
                    )}
                  </div>
                </div>
              ) : <SkeletonCard />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
