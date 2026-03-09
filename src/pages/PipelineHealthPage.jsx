/**
 * @file PipelineHealthPage.jsx
 * @description Live Pipeline Health dashboard — stage distribution, high-urgency
 * leads, cadence activity, and one-click Blitz Mode.
 *
 * Fetches /api/pipeline/health every 60s via TanStack Query.
 * Subscribes to socket.io 'pipeline-update' for real-time refreshes.
 * Recharts PieChart for stage distribution.
 */

import React, { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { api } from '@/lib/api';
import { getSocket } from '@/hooks/useSocket';
import {
  Zap, AlertTriangle, Clock, CheckCircle2, Activity,
  RefreshCw, Users, BarChart2, TrendingUp, Send,
} from 'lucide-react';

// ── Stage colour palette (consistent across Jake + HOA) ──────────────────────
const STAGE_COLORS = {
  New:        '#6366f1',   // indigo
  Enriched:   '#06b6d4',   // cyan
  Dossiered:  '#8b5cf6',   // violet
  Outreached: '#f59e0b',   // amber
  Replied:    '#10b981',   // emerald
  CallBooked: '#3b82f6',   // blue
  Diagnostic: '#ec4899',   // pink
  Committed:  '#22c55e',   // green
  Closed:     '#94a3b8',   // slate
  Dead:       '#ef4444',   // red
  Stalled:    '#f97316',   // orange
  default:    '#64748b',   // gray
};
function stageColor(stage) { return STAGE_COLORS[stage] || STAGE_COLORS.default; }

// ── Fetch pipeline health ─────────────────────────────────────────────────────
async function fetchPipelineHealth() {
  return api.get('/pipeline/health');
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, icon: Icon, color = 'text-text-primary', sub }) {
  return (
    <div className="bg-bg-secondary border border-border rounded-lg p-4 flex flex-col gap-1">
      <div className="flex items-center gap-2 text-text-muted text-xs font-medium uppercase tracking-wide">
        {Icon && <Icon size={14} />}
        {label}
      </div>
      <div className={`text-2xl font-bold ${color}`}>{value ?? '—'}</div>
      {sub && <div className="text-xs text-text-muted">{sub}</div>}
    </div>
  );
}

// ── Stage distribution pie ────────────────────────────────────────────────────
function StagePie({ byStage, title }) {
  const data = Object.entries(byStage || {})
    .filter(([, v]) => v > 0)
    .map(([stage, value]) => ({ name: stage, value }));

  if (data.length === 0) {
    return (
      <div className="bg-bg-secondary border border-border rounded-lg p-4">
        <div className="text-sm font-semibold text-text-primary mb-2">{title} — Stage Distribution</div>
        <div className="text-text-muted text-sm">No data</div>
      </div>
    );
  }

  return (
    <div className="bg-bg-secondary border border-border rounded-lg p-4">
      <div className="text-sm font-semibold text-text-primary mb-3">{title} — Stage Distribution</div>
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={80}
            paddingAngle={2}
            dataKey="value"
          >
            {data.map((entry) => (
              <Cell key={entry.name} fill={stageColor(entry.name)} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 6 }}
            labelStyle={{ color: '#e2e8f0' }}
            itemStyle={{ color: '#94a3b8' }}
          />
          <Legend
            formatter={(value) => <span style={{ color: '#94a3b8', fontSize: 12 }}>{value}</span>}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Top leads table ───────────────────────────────────────────────────────────
function TopLeadsTable({ leads }) {
  if (!leads || leads.length === 0) {
    return (
      <div className="bg-bg-secondary border border-border rounded-lg p-4">
        <div className="text-sm font-semibold text-text-primary mb-2">Top High-Urgency Leads</div>
        <div className="text-text-muted text-sm">No high-urgency leads (score ≥ 75)</div>
      </div>
    );
  }

  return (
    <div className="bg-bg-secondary border border-border rounded-lg p-4">
      <div className="text-sm font-semibold text-text-primary mb-3">Top High-Urgency Leads</div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-text-muted text-xs uppercase border-b border-border">
              <th className="text-left pb-2 pr-3">#</th>
              <th className="text-left pb-2 pr-3">Company</th>
              <th className="text-left pb-2 pr-3">Score</th>
              <th className="text-left pb-2 pr-3">Stage</th>
              <th className="text-left pb-2 pr-3">Next Due</th>
              <th className="text-left pb-2">Product</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((lead, i) => {
              const due = lead.next_action_due
                ? new Date(lead.next_action_due).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                : '—';
              const overdue = lead.next_action_due && new Date(lead.next_action_due) < new Date();
              return (
                <tr key={lead.id} className="border-b border-border/40 last:border-0 hover:bg-bg-elevated/50">
                  <td className="py-2 pr-3 text-text-muted">{i + 1}</td>
                  <td className="py-2 pr-3 text-text-primary font-medium max-w-[200px] truncate">
                    {lead.company_name}
                  </td>
                  <td className="py-2 pr-3">
                    <span
                      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold"
                      style={{ background: `${stageColor('Enriched')}20`, color: stageColor('Enriched') }}
                    >
                      {lead.urgency_score}
                    </span>
                  </td>
                  <td className="py-2 pr-3">
                    <span
                      className="inline-flex items-center px-2 py-0.5 rounded text-xs"
                      style={{ background: `${stageColor(lead.pipeline_stage)}22`, color: stageColor(lead.pipeline_stage) }}
                    >
                      {lead.pipeline_stage || 'New'}
                    </span>
                  </td>
                  <td className={`py-2 pr-3 text-xs ${overdue ? 'text-accent-danger font-medium' : 'text-text-muted'}`}>
                    {overdue ? '⚠ ' : ''}{due}
                  </td>
                  <td className="py-2">
                    <span className={`text-xs px-2 py-0.5 rounded ${lead.product === 'hoa' ? 'bg-violet-500/15 text-violet-400' : 'bg-cyan-500/15 text-cyan-400'}`}>
                      {lead.product}
                    </span>
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

// ── Main page ─────────────────────────────────────────────────────────────────
export default function PipelineHealthPage() {
  const queryClient = useQueryClient();
  const [blitzConfirm, setBlitzConfirm] = useState(false);
  const [toast, setToast]               = useState(null);

  // TanStack Query — refetch every 60s
  const { data, isLoading, error, dataUpdatedAt, refetch } = useQuery({
    queryKey: ['pipeline-health'],
    queryFn:  fetchPipelineHealth,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  // Socket.io — refresh on pipeline-update event
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const handler = () => queryClient.invalidateQueries(['pipeline-health']);
    socket.on('pipeline-update', handler);
    return () => socket.off('pipeline-update', handler);
  }, [queryClient]);

  // Blitz Mode mutation
  const blitzMutation = useMutation({
    mutationFn: () => api.post('/pipeline/blitz', { product: 'both', urgency_min: 75 }),
    onSuccess: (result) => {
      setToast({ type: 'success', msg: `Blitz complete — ${result.queued} touches queued, ${result.autoSent || 0} auto-sent` });
      queryClient.invalidateQueries(['pipeline-health']);
      setTimeout(() => setToast(null), 6000);
    },
    onError: (err) => {
      setToast({ type: 'error', msg: `Blitz failed: ${err.message}` });
      setTimeout(() => setToast(null), 6000);
    },
  });

  function handleBlitzClick() {
    if (!blitzConfirm) { setBlitzConfirm(true); return; }
    setBlitzConfirm(false);
    blitzMutation.mutate();
  }

  const jake = data?.products?.jake || {};
  const hoa  = data?.products?.hoa  || {};
  const act  = data?.recentActivity  || {};
  const topLeads = data?.topHighUrgencyLeads || [];

  const lastUpdated = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : null;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-primary flex items-center gap-2">
            <Activity size={20} className="text-accent-primary" />
            Live Pipeline Health
          </h1>
          <p className="text-sm text-text-muted mt-0.5">
            Real-time stage distribution · cadence activity · blitz controls
            {lastUpdated && <span className="ml-2 opacity-60">Updated {lastUpdated}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-text-secondary border border-border rounded-lg hover:bg-bg-elevated disabled:opacity-50"
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
            Refresh
          </button>

          {/* Blitz Mode button */}
          {blitzConfirm ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-accent-warning">Run director + cadence for urgency ≥75?</span>
              <button
                onClick={() => setBlitzConfirm(false)}
                className="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-bg-elevated"
              >Cancel</button>
              <button
                onClick={handleBlitzClick}
                disabled={blitzMutation.isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-orange-600 hover:bg-orange-500 text-white rounded-lg font-semibold disabled:opacity-50"
              >
                <Zap size={14} />
                {blitzMutation.isPending ? 'Running…' : 'Confirm Blitz'}
              </button>
            </div>
          ) : (
            <button
              onClick={handleBlitzClick}
              disabled={blitzMutation.isPending}
              className="flex items-center gap-1.5 px-4 py-2 text-sm bg-orange-600 hover:bg-orange-500 text-white rounded-lg font-semibold shadow disabled:opacity-50"
            >
              <Zap size={15} />
              Blitz Mode
            </button>
          )}
        </div>
      </div>

      {/* ── Toast ──────────────────────────────────────────────────────────── */}
      {toast && (
        <div className={`rounded-lg px-4 py-3 text-sm font-medium ${
          toast.type === 'success' ? 'bg-accent-success/15 text-accent-success border border-accent-success/30' : 'bg-accent-danger/15 text-accent-danger border border-accent-danger/30'
        }`}>
          {toast.msg}
        </div>
      )}

      {/* ── Error ──────────────────────────────────────────────────────────── */}
      {error && (
        <div className="bg-accent-danger/10 border border-accent-danger/30 rounded-lg px-4 py-3 text-sm text-accent-danger">
          Failed to load pipeline health: {error.message}
        </div>
      )}

      {/* ── Top stat cards ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard
          label="Total Leads"
          value={(jake.totalLeads || 0) + (hoa.totalLeads || 0)}
          icon={Users}
          sub={`Jake: ${jake.totalLeads || 0} · HOA: ${hoa.totalLeads || 0}`}
        />
        <StatCard
          label="High Urgency (≥75)"
          value={(jake.highUrgency || 0) + (hoa.highUrgency || 0)}
          icon={TrendingUp}
          color="text-accent-warning"
          sub={`Jake: ${jake.highUrgency || 0} · HOA: ${hoa.highUrgency || 0}`}
        />
        <StatCard
          label="Stalled"
          value={(jake.stalled || 0) + (hoa.stalled || 0)}
          icon={AlertTriangle}
          color={(jake.stalled || 0) + (hoa.stalled || 0) > 0 ? 'text-accent-danger' : 'text-text-primary'}
          sub={`Jake: ${jake.stalled || 0} · HOA: ${hoa.stalled || 0}`}
        />
        <StatCard
          label="Auto-Sents Today"
          value={act.autoSentsToday || 0}
          icon={Send}
          color="text-accent-success"
          sub={`${act.touchesQueuedToday || 0} touches queued`}
        />
        <StatCard
          label="Replies Today"
          value={act.repliesToday || 0}
          icon={CheckCircle2}
          color="text-accent-success"
          sub={`${act.manualApprovalsPending || 0} pending approval`}
        />
      </div>

      {/* ── Activity bar ────────────────────────────────────────────────────── */}
      <div className="bg-bg-secondary border border-border rounded-lg px-4 py-3 flex flex-wrap items-center gap-4 text-sm">
        <span className="text-text-muted font-medium flex items-center gap-1.5">
          <Clock size={13} />
          Last cycle:
        </span>
        <span className="text-text-primary">
          {act.lastCycle
            ? new Date(act.lastCycle).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
            : 'Never'}
        </span>
        <span className="text-border">|</span>
        <span className="text-text-muted">Active cadences:</span>
        <span className="text-accent-primary font-semibold">{(jake.activeCadence || 0) + (hoa.activeCadence || 0)}</span>
        <span className="text-border">|</span>
        <span className="text-text-muted">Pending approval:</span>
        <span className={`font-semibold ${act.manualApprovalsPending > 0 ? 'text-accent-warning' : 'text-text-primary'}`}>
          {act.manualApprovalsPending || 0}
        </span>
      </div>

      {/* ── Jake + HOA side-by-side ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Jake */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-cyan-400 inline-block" />
            <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wide">Jake / CFO Pipeline</h2>
            <span className="text-xs text-text-muted">{jake.totalLeads || 0} leads</span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <StatCard label="High Urgency" value={jake.highUrgency || 0} color="text-accent-warning" />
            <StatCard label="Active Cadence" value={jake.activeCadence || 0} color="text-accent-primary" />
            <StatCard label="Stalled" value={jake.stalled || 0} color={jake.stalled > 0 ? 'text-accent-danger' : 'text-text-primary'} />
          </div>
          <StagePie byStage={jake.byStage} title="Jake" />
        </div>

        {/* HOA */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-violet-400 inline-block" />
            <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wide">HOA Pipeline</h2>
            <span className="text-xs text-text-muted">{hoa.totalLeads || 0} engagements</span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <StatCard label="High Relevance" value={hoa.highUrgency || 0} color="text-accent-warning" />
            <StatCard label="Active Cadence" value={hoa.activeCadence || 0} color="text-accent-primary" />
            <StatCard label="Stalled" value={hoa.stalled || 0} color={hoa.stalled > 0 ? 'text-accent-danger' : 'text-text-primary'} />
          </div>
          <StagePie byStage={hoa.byStage} title="HOA" />
        </div>
      </div>

      {/* ── Top high-urgency leads table ────────────────────────────────────── */}
      <TopLeadsTable leads={topLeads} />

      {/* ── Empty / loading state ───────────────────────────────────────────── */}
      {isLoading && !data && (
        <div className="flex items-center justify-center py-16 text-text-muted">
          <RefreshCw size={18} className="animate-spin mr-2" />
          Loading pipeline health…
        </div>
      )}
    </div>
  );
}
