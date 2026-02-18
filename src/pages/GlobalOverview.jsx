/**
 * @file GlobalOverview.jsx
 * @description Master operations dashboard — everything happening in the console at a glance.
 *
 * Sections:
 *   1. KPI bar       — agents, runs today, communities, spend
 *   2. Live activity — last 10 agent runs with status
 *   3. Pipeline      — discovery funnel (HOAs → scrape → contacts)
 *   4. Schedules     — next runs / enabled cron jobs
 *   5. Cost snapshot — 24h / 7d / 30d / all-time
 *   6. Campaigns     — active campaign cards
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Bot, Clock, MapPin, DollarSign, Activity, CheckCircle,
  AlertCircle, Loader, Circle, Plus, RefreshCw, TrendingUp,
  Building2, Send, Zap,
} from 'lucide-react';
import { api } from '../lib/api';
import { useCampaign } from '../context/CampaignContext';
import { CampaignForm } from '../components/campaigns/CampaignForm';

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

function nextRunLabel(cronExpr) {
  if (!cronExpr) return '—';
  const parts = cronExpr.split(' ');
  if (parts.length !== 5) return cronExpr;
  const [min, hour, dom, , dow] = parts;
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const dayLabel = dow === '*' ? 'Daily' : days[parseInt(dow)] || `Day ${dow}`;
  const time = `${hour.padStart(2,'0')}:${min.padStart(2,'0')}`;
  return `${dayLabel} ${time}`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function KpiCard({ icon: Icon, label, value, sub, color = 'text-accent-primary', to }) {
  const inner = (
    <div className="p-5 bg-bg-secondary border border-border rounded-xl hover:border-accent-primary/40 transition-colors group">
      <div className="flex items-start justify-between mb-3">
        <div className={`p-2 rounded-lg bg-bg-elevated ${color.replace('text-', 'text-')}`}>
          <Icon size={18} className={color} />
        </div>
        {to && (
          <span className="text-xs text-text-muted group-hover:text-accent-primary transition-colors">
            View →
          </span>
        )}
      </div>
      <div className="text-2xl font-bold text-text-primary font-mono leading-none mb-1">
        {value ?? '—'}
      </div>
      <div className="text-xs text-text-muted">{label}</div>
      {sub && <div className="text-xs text-text-muted mt-0.5 opacity-70">{sub}</div>}
    </div>
  );
  return to ? <Link to={to}>{inner}</Link> : inner;
}

function RunStatusIcon({ status }) {
  switch (status) {
    case 'success':
    case 'completed':
      return <CheckCircle size={14} className="text-accent-success shrink-0" />;
    case 'failed':
    case 'error':
      return <AlertCircle size={14} className="text-accent-danger shrink-0" />;
    case 'running':
      return <Loader size={14} className="text-accent-info shrink-0 animate-spin" />;
    default:
      return <Circle size={14} className="text-text-muted shrink-0" />;
  }
}

function RunStatusBadge({ status }) {
  const map = {
    success:   'bg-accent-success/10 text-accent-success',
    completed: 'bg-accent-success/10 text-accent-success',
    failed:    'bg-accent-danger/10 text-accent-danger',
    error:     'bg-accent-danger/10 text-accent-danger',
    running:   'bg-accent-info/10 text-accent-info',
    pending:   'bg-accent-warning/10 text-accent-warning',
    cancelled: 'bg-bg-elevated text-text-muted',
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${map[status] || 'bg-bg-elevated text-text-muted'}`}>
      {status}
    </span>
  );
}

function SectionHeader({ title, to, linkLabel = 'View all' }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-text-muted">{title}</h2>
      {to && (
        <Link to={to} className="text-xs text-accent-primary hover:underline">{linkLabel}</Link>
      )}
    </div>
  );
}

function EmptyState({ message }) {
  return (
    <div className="text-center py-8 text-text-muted text-sm">{message}</div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function GlobalOverview() {
  const { campaigns, refreshCampaigns } = useCampaign();
  const [isFormOpen, setIsFormOpen] = useState(false);

  // Data
  const [agents, setAgents] = useState([]);
  const [recentRuns, setRecentRuns] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [costSummary, setCostSummary] = useState(null);
  const [discoveryStats, setDiscoveryStats] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState(null);

  const fetchAll = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const [agentsRes, runsRes, schedulesRes, costsRes, discoveryRes] = await Promise.allSettled([
        api.get('/agents'),
        api.get('/runs?limit=10'),
        api.get('/schedules'),
        fetch('/api/costs/summary').then(r => r.json()),
        fetch('/api/discovery/stats').then(r => r.json()),
      ]);

      if (agentsRes.status === 'fulfilled') setAgents(agentsRes.value.agents || []);
      if (runsRes.status === 'fulfilled') setRecentRuns(runsRes.value.runs || []);
      if (schedulesRes.status === 'fulfilled') setSchedules(schedulesRes.value.schedules || []);
      if (costsRes.status === 'fulfilled' && costsRes.value.success) setCostSummary(costsRes.value.summary);
      if (discoveryRes.status === 'fulfilled' && !discoveryRes.value.error) setDiscoveryStats(discoveryRes.value);

      setLastRefreshed(new Date());
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 30000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  // Derived
  const runningAgents = agents.filter(a => a.status === 'running').length;
  const enabledSchedules = schedules.filter(s => s.enabled);
  const activeCampaigns = campaigns.filter(c => c.status === 'active');
  const todayRuns = recentRuns.filter(r => {
    const d = new Date(r.started_at || r.created_at);
    return d.toDateString() === new Date().toDateString();
  }).length;

  const pipelineFunnel = discoveryStats ? [
    { label: 'Discovered', value: discoveryStats.totalCommunities, color: 'bg-orange-500' },
    { label: 'Website Scraped', value: discoveryStats.totalCommunities - discoveryStats.awaitingScrape, color: 'bg-blue-500' },
    { label: 'Reviews Scanned', value: discoveryStats.totalCommunities - discoveryStats.awaitingReviewScan, color: 'bg-purple-500' },
    { label: 'Contacts Enriched', value: discoveryStats.totalCommunities - discoveryStats.awaitingContactEnrichment, color: 'bg-emerald-500' },
  ] : [];

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 max-w-7xl mx-auto space-y-8">

        {/* ── Page header ─────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Operations Dashboard</h1>
            <p className="text-sm text-text-muted mt-0.5">
              {lastRefreshed
                ? `Last updated ${relativeTime(lastRefreshed.toISOString())} · auto-refreshes every 30s`
                : 'Loading…'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={fetchAll}
              disabled={isRefreshing}
              className="flex items-center gap-2 px-3 py-2 text-sm bg-bg-secondary border border-border rounded-lg hover:bg-bg-elevated transition-colors text-text-secondary disabled:opacity-50"
            >
              <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
              Refresh
            </button>
            <button
              onClick={() => setIsFormOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-accent-primary text-white rounded-lg hover:bg-opacity-90 transition-all font-medium text-sm"
            >
              <Plus size={14} />
              New Campaign
            </button>
          </div>
        </div>

        {/* ── KPI bar ─────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          <KpiCard
            icon={Bot}
            label="Agents"
            value={agents.length}
            sub={runningAgents > 0 ? `${runningAgents} running` : 'none running'}
            color="text-accent-primary"
            to="/agents"
          />
          <KpiCard
            icon={Activity}
            label="Runs Today"
            value={todayRuns}
            sub={`${recentRuns.length} recent`}
            color="text-accent-info"
            to="/results"
          />
          <KpiCard
            icon={MapPin}
            label="HOAs Found"
            value={discoveryStats?.totalCommunities?.toLocaleString() ?? '—'}
            sub="Google Maps pipeline"
            color="text-orange-400"
            to="/discovery"
          />
          <KpiCard
            icon={Building2}
            label="Needs Contacts"
            value={discoveryStats?.awaitingContactEnrichment?.toLocaleString() ?? '—'}
            sub="contact enrichment"
            color="text-emerald-400"
            to="/discovery"
          />
          <KpiCard
            icon={Clock}
            label="Schedules"
            value={enabledSchedules.length}
            sub={`of ${schedules.length} enabled`}
            color="text-accent-primary"
            to="/schedule"
          />
          <KpiCard
            icon={DollarSign}
            label="Spend Today"
            value={costSummary ? `$${costSummary.cost_last_24h.toFixed(3)}` : '—'}
            sub={costSummary ? `$${costSummary.cost_last_7d.toFixed(2)} this week` : ''}
            color="text-accent-warning"
            to="/costs"
          />
        </div>

        {/* ── Two-column main area ─────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* ── Left column (2/3) ─────────────────────────────────────────── */}
          <div className="lg:col-span-2 space-y-6">

            {/* Live activity feed */}
            <section>
              <SectionHeader title="Live Activity" to="/results" />
              <div className="bg-bg-secondary border border-border rounded-xl overflow-hidden">
                {recentRuns.length === 0 ? (
                  <EmptyState message="No agent runs yet. Run an agent from the Scheduler or Agents tab." />
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-xs text-text-muted uppercase tracking-wider">
                        <th className="text-left px-4 py-2.5 font-medium">Agent</th>
                        <th className="text-left px-4 py-2.5 font-medium hidden sm:table-cell">Status</th>
                        <th className="text-right px-4 py-2.5 font-medium hidden md:table-cell">Cost</th>
                        <th className="text-right px-4 py-2.5 font-medium">When</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {recentRuns.map(run => (
                        <tr key={run.id} className="hover:bg-bg-elevated transition-colors">
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2">
                              <RunStatusIcon status={run.status} />
                              <span className="text-text-primary font-medium truncate max-w-[180px]">
                                {run.agent_name || 'Unknown Agent'}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-2.5 hidden sm:table-cell">
                            <RunStatusBadge status={run.status} />
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-xs text-text-muted hidden md:table-cell">
                            {run.cost_usd ? `$${Number(run.cost_usd).toFixed(4)}` : '—'}
                          </td>
                          <td className="px-4 py-2.5 text-right text-xs text-text-muted">
                            {relativeTime(run.started_at || run.created_at)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </section>

            {/* Discovery pipeline funnel */}
            {discoveryStats && discoveryStats.totalCommunities > 0 && (
              <section>
                <SectionHeader title="HOA Discovery Pipeline" to="/discovery" />
                <div className="bg-bg-secondary border border-border rounded-xl p-5 space-y-3">
                  {pipelineFunnel.map(stage => {
                    const pct = discoveryStats.totalCommunities > 0
                      ? Math.round((stage.value / discoveryStats.totalCommunities) * 100)
                      : 0;
                    return (
                      <div key={stage.label}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-text-secondary">{stage.label}</span>
                          <span className="text-text-primary font-mono font-semibold">
                            {stage.value.toLocaleString()} <span className="text-text-muted font-normal">({pct}%)</span>
                          </span>
                        </div>
                        <div className="h-1.5 bg-bg-elevated rounded-full overflow-hidden">
                          <div
                            className={`h-full ${stage.color} rounded-full transition-all duration-700`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Active campaigns */}
            {activeCampaigns.length > 0 && (
              <section>
                <SectionHeader title="Active Campaigns" to="/" linkLabel={`${activeCampaigns.length} total`} />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {activeCampaigns.slice(0, 4).map(c => (
                    <Link
                      key={c.id}
                      to={`/c/${c.slug}`}
                      className="flex items-center gap-3 p-4 bg-bg-secondary border border-border rounded-xl hover:border-accent-primary/40 transition-colors group"
                    >
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center text-lg shrink-0"
                        style={{ background: `${c.color || '#3b82f6'}20` }}
                      >
                        {c.icon || '🎯'}
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium text-text-primary truncate text-sm">{c.name}</div>
                        <div className="text-xs text-text-muted">{c.company || c.type}</div>
                      </div>
                      <span className="ml-auto text-xs text-text-muted group-hover:text-accent-primary transition-colors shrink-0">→</span>
                    </Link>
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* ── Right column (1/3) ──────────────────────────────────────────── */}
          <div className="space-y-6">

            {/* Cost snapshot */}
            <section>
              <SectionHeader title="Spend" to="/costs" />
              <div className="bg-bg-secondary border border-border rounded-xl p-4 space-y-3">
                {costSummary ? (
                  <>
                    {[
                      { label: 'Last 24 hours', value: costSummary.cost_last_24h },
                      { label: 'Last 7 days', value: costSummary.cost_last_7d },
                      { label: 'Last 30 days', value: costSummary.cost_last_30d },
                      { label: 'All time', value: costSummary.total_cost },
                    ].map(row => (
                      <div key={row.label} className="flex justify-between items-center">
                        <span className="text-xs text-text-muted">{row.label}</span>
                        <span className="text-sm font-mono font-semibold text-text-primary">
                          ${row.value.toFixed(row.value < 0.01 ? 4 : 2)}
                        </span>
                      </div>
                    ))}
                    <div className="pt-2 border-t border-border flex justify-between items-center">
                      <span className="text-xs text-text-muted">Avg/run</span>
                      <span className="text-sm font-mono text-text-secondary">
                        ${costSummary.avg_cost_per_run.toFixed(4)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-text-muted">Total runs</span>
                      <span className="text-sm font-mono text-text-secondary">{costSummary.total_runs}</span>
                    </div>
                  </>
                ) : (
                  <EmptyState message="No cost data yet." />
                )}
              </div>
            </section>

            {/* Enabled schedules */}
            <section>
              <SectionHeader title="Schedules" to="/schedule" />
              <div className="bg-bg-secondary border border-border rounded-xl overflow-hidden">
                {enabledSchedules.length === 0 ? (
                  <EmptyState message="No enabled schedules." />
                ) : (
                  <div className="divide-y divide-border">
                    {enabledSchedules.slice(0, 6).map(s => (
                      <div key={s.id} className="px-4 py-3 flex items-start gap-3">
                        <div className="w-2 h-2 rounded-full bg-accent-success mt-1.5 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm text-text-primary font-medium truncate">{s.name}</div>
                          <div className="text-xs text-text-muted truncate">{s.agentName}</div>
                        </div>
                        <div className="text-xs text-text-muted shrink-0 text-right">
                          {nextRunLabel(s.cronExpression)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            {/* Quick links */}
            <section>
              <SectionHeader title="Quick Actions" />
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: 'Run Agent', to: '/agents', icon: Bot, color: 'text-accent-primary' },
                  { label: 'Discovery', to: '/discovery', icon: MapPin, color: 'text-orange-400' },
                  { label: 'Content Queue', to: '/content-queue', icon: Send, color: 'text-accent-info' },
                  { label: 'Mgmt Research', to: '/mgmt-research', icon: Building2, color: 'text-accent-warning' },
                ].map(link => (
                  <Link
                    key={link.to}
                    to={link.to}
                    className="flex items-center gap-2 p-3 bg-bg-secondary border border-border rounded-lg hover:bg-bg-elevated hover:border-accent-primary/30 transition-colors text-sm font-medium text-text-secondary"
                  >
                    <link.icon size={14} className={link.color} />
                    {link.label}
                  </Link>
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>

      {/* Campaign creation modal */}
      <CampaignForm
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        onCreated={() => { refreshCampaigns?.(); setIsFormOpen(false); }}
      />
    </div>
  );
}
