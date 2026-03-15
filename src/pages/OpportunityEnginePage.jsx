/**
 * @file OpportunityEnginePage.jsx
 * @description Opportunity Engine dashboard — signal feed, cluster board,
 * prototype tracker, scanner status.
 *
 * Fetches /api/opportunities/stats, /signals, /clusters, /scanners.
 * Auto-refreshes every 60s via TanStack Query.
 */

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  Radar, Zap, Database, TrendingUp, Eye, Target,
  Activity, CheckCircle2, XCircle, Radio, ToggleLeft, ToggleRight,
  ExternalLink, Hash, Clock, Filter,
} from 'lucide-react';

// ── Fetch helpers ───────────────────────────────────────────────────────────

const fetchStats = () => api.get('/opportunities/stats');
const fetchSignals = (limit, offset, source) => {
  let url = `/opportunities/signals?limit=${limit}&offset=${offset}`;
  if (source) url += `&source=${source}`;
  return api.get(url);
};
const fetchClusters = (limit, minScore) => api.get(`/opportunities/clusters?limit=${limit}&min_score=${minScore}`);
const fetchScanners = () => api.get('/opportunities/scanners');

// ── Stat Card ───────────────────────────────────────────────────────────────

function StatCard({ label, value, icon: Icon, color = 'text-text-primary', sub }) {
  return (
    <div className="bg-bg-secondary border border-border rounded-lg p-4 flex flex-col gap-1">
      <div className="flex items-center gap-2 text-text-muted text-xs font-medium uppercase tracking-wide">
        {Icon && <Icon size={14} />}
        {label}
      </div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      {sub && <div className="text-xs text-text-muted">{sub}</div>}
    </div>
  );
}

// ── Score Badge ─────────────────────────────────────────────────────────────

function ScoreBadge({ score }) {
  if (score == null) return <span className="text-text-muted text-xs">—</span>;
  const color = score >= 75 ? 'text-accent-success bg-accent-success/10'
    : score >= 50 ? 'text-accent-warning bg-accent-warning/10'
    : 'text-text-muted bg-bg-elevated';
  return <span className={`text-xs font-bold px-2 py-0.5 rounded ${color}`}>{score}</span>;
}

// ── Status Badge ────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const colors = {
    raw: 'text-text-muted bg-bg-elevated',
    scored: 'text-accent-info bg-accent-info/10',
    prototyping: 'text-accent-warning bg-accent-warning/10',
    launched: 'text-accent-success bg-accent-success/10',
    monitoring: 'text-accent-info bg-accent-info/10',
    killed: 'text-accent-danger bg-accent-danger/10',
    scaled: 'text-accent-success bg-accent-success/10',
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded capitalize ${colors[status] || colors.raw}`}>
      {status}
    </span>
  );
}

// ── Source icon ──────────────────────────────────────────────────────────────

const SOURCE_LABELS = {
  reddit: 'Reddit', hn: 'HN', ph: 'PH', github: 'GitHub',
  twitter: 'Twitter', forum: 'Forums', trends: 'Trends',
  stackoverflow: 'SO', indeed: 'Indeed', indiehackers: 'IH',
};

function SourceBadge({ source }) {
  return (
    <span className="text-xs px-1.5 py-0.5 rounded bg-bg-elevated text-text-muted font-mono">
      {SOURCE_LABELS[source] || source}
    </span>
  );
}

// ── Main Page ───────────────────────────────────────────────────────────────

export default function OpportunityEnginePage() {
  const queryClient = useQueryClient();
  const [signalSource, setSignalSource] = useState('');
  const [signalPage, setSignalPage] = useState(0);
  const [minScore, setMinScore] = useState(0);

  const { data: stats } = useQuery({ queryKey: ['opp-stats'], queryFn: fetchStats, refetchInterval: 60000 });
  const { data: signalData } = useQuery({
    queryKey: ['opp-signals', signalPage, signalSource],
    queryFn: () => fetchSignals(30, signalPage * 30, signalSource),
    refetchInterval: 60000,
  });
  const { data: clusterData } = useQuery({
    queryKey: ['opp-clusters', minScore],
    queryFn: () => fetchClusters(50, minScore),
    refetchInterval: 60000,
  });
  const { data: scannerData } = useQuery({ queryKey: ['opp-scanners'], queryFn: fetchScanners, refetchInterval: 60000 });

  const toggleScanner = useMutation({
    mutationFn: (name) => api.post(`/opportunities/scanners/${name}/toggle`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['opp-scanners'] }),
  });

  const killCluster = useMutation({
    mutationFn: (id) => api.post(`/opportunities/clusters/${id}/kill`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['opp-clusters'] });
      queryClient.invalidateQueries({ queryKey: ['opp-stats'] });
    },
  });

  const promoteCluster = useMutation({
    mutationFn: (id) => api.post(`/opportunities/clusters/${id}/promote`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['opp-clusters'] });
      queryClient.invalidateQueries({ queryKey: ['opp-stats'] });
    },
  });

  const s = stats || {};
  const signals = signalData?.signals || [];
  const clusters = clusterData?.clusters || [];
  const scanners = scannerData?.scanners || [];

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Radar size={28} className="text-accent-info" />
            Opportunity Engine
          </h1>
          <p className="text-text-muted text-sm mt-1">
            Autonomous signal scanning, pain clustering, and opportunity scoring
          </p>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <StatCard label="Signals" value={s.signals_total || 0} icon={Radio} sub={`${s.signals_today || 0} today`} />
        <StatCard label="Classified" value={s.signals_classified || 0} icon={CheckCircle2} color="text-accent-success" sub={`${s.signals_noise || 0} noise filtered`} />
        <StatCard label="Pending" value={s.signals_pending || 0} icon={Clock} color="text-accent-warning" />
        <StatCard label="Clusters" value={s.clusters_total || 0} icon={Target} sub={`${s.clusters_scored || 0} scored`} />
        <StatCard label="Hot (75+)" value={s.clusters_hot || 0} icon={Zap} color="text-accent-danger" />
        <StatCard label="Prototypes" value={s.prototypes_total || 0} icon={Database} color="text-accent-info" />
      </div>

      {/* Top Cluster Highlight */}
      {s.top_cluster && (
        <div className="bg-accent-warning/10 border border-accent-warning/30 rounded-lg p-4 flex items-center gap-4">
          <Zap size={24} className="text-accent-warning" />
          <div className="flex-1">
            <div className="text-sm font-semibold text-accent-warning">Top Opportunity</div>
            <div className="text-text-primary font-medium">{s.top_cluster.pain_summary}</div>
          </div>
          <ScoreBadge score={s.top_cluster.composite_score} />
          <StatusBadge status={s.top_cluster.status} />
        </div>
      )}

      {/* Two-column: Clusters + Scanners */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Clusters — 2/3 width */}
        <div className="lg:col-span-2 bg-bg-secondary border border-border rounded-lg overflow-hidden">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <h2 className="font-semibold flex items-center gap-2">
              <Target size={16} /> Opportunity Clusters
            </h2>
            <div className="flex items-center gap-2">
              <Filter size={14} className="text-text-muted" />
              <select
                value={minScore}
                onChange={(e) => setMinScore(parseInt(e.target.value))}
                className="bg-bg-primary border border-border rounded px-2 py-1 text-xs"
              >
                <option value="0">All scores</option>
                <option value="50">Score 50+</option>
                <option value="75">Score 75+ (hot)</option>
              </select>
            </div>
          </div>
          <div className="divide-y divide-border max-h-[500px] overflow-y-auto">
            {clusters.length === 0 ? (
              <div className="p-8 text-center text-text-muted">
                No clusters yet. Run the opportunity scanner to start finding signals.
              </div>
            ) : clusters.map((c) => (
              <div key={c.id} className="p-3 flex items-center gap-3 hover:bg-bg-elevated/50">
                <ScoreBadge score={c.composite_score} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{c.pain_summary}</div>
                  <div className="text-xs text-text-muted flex items-center gap-2 mt-0.5">
                    <span>{c.signal_count} signals</span>
                    <span className="text-border">|</span>
                    <span>{c.pain_category || 'other'}</span>
                    {c.velocity > 0 && (
                      <>
                        <span className="text-border">|</span>
                        <TrendingUp size={10} />
                        <span>{c.velocity.toFixed(1)}/wk</span>
                      </>
                    )}
                  </div>
                </div>
                <StatusBadge status={c.status} />
                {c.status === 'scored' && (
                  <div className="flex gap-1">
                    <button
                      onClick={() => promoteCluster.mutate(c.id)}
                      className="text-xs px-2 py-1 rounded bg-accent-success/20 text-accent-success hover:bg-accent-success/30"
                    >
                      Build
                    </button>
                    <button
                      onClick={() => killCluster.mutate(c.id)}
                      className="text-xs px-2 py-1 rounded bg-accent-danger/20 text-accent-danger hover:bg-accent-danger/30"
                    >
                      Kill
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Scanner Status — 1/3 width */}
        <div className="bg-bg-secondary border border-border rounded-lg overflow-hidden">
          <div className="p-4 border-b border-border">
            <h2 className="font-semibold flex items-center gap-2">
              <Activity size={16} /> Scanners
            </h2>
          </div>
          <div className="divide-y divide-border">
            {scanners.map((sc) => (
              <div key={sc.scanner_name} className="p-3 flex items-center gap-3">
                <button
                  onClick={() => toggleScanner.mutate(sc.scanner_name)}
                  className="shrink-0"
                  title={sc.enabled ? 'Disable scanner' : 'Enable scanner'}
                >
                  {sc.enabled ? (
                    <ToggleRight size={20} className="text-accent-success" />
                  ) : (
                    <ToggleLeft size={20} className="text-text-muted" />
                  )}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium capitalize">{SOURCE_LABELS[sc.scanner_name] || sc.scanner_name}</div>
                  <div className="text-xs text-text-muted">
                    {sc.items_found_total} total | {sc.items_found_last_run || 0} last run
                    {sc.errors_last_run > 0 && <span className="text-accent-danger ml-1">({sc.errors_last_run} err)</span>}
                  </div>
                </div>
                {sc.last_run_at && (
                  <div className="text-xs text-text-muted whitespace-nowrap">
                    {new Date(sc.last_run_at + 'Z').toLocaleDateString()}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Signal Feed */}
      <div className="bg-bg-secondary border border-border rounded-lg overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h2 className="font-semibold flex items-center gap-2">
            <Radio size={16} /> Signal Feed
          </h2>
          <div className="flex items-center gap-2">
            <select
              value={signalSource}
              onChange={(e) => { setSignalSource(e.target.value); setSignalPage(0); }}
              className="bg-bg-primary border border-border rounded px-2 py-1 text-xs"
            >
              <option value="">All sources</option>
              {Object.entries(SOURCE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="divide-y divide-border max-h-[400px] overflow-y-auto">
          {signals.length === 0 ? (
            <div className="p-8 text-center text-text-muted">
              No signals yet. The scanner runs daily at 3 AM or can be triggered manually.
            </div>
          ) : signals.map((sig) => (
            <div key={sig.id} className="p-3 flex items-start gap-3 hover:bg-bg-elevated/50">
              <SourceBadge source={sig.source} />
              <div className="flex-1 min-w-0">
                <a
                  href={sig.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-accent-info hover:underline flex items-center gap-1"
                >
                  {sig.title || sig.url}
                  <ExternalLink size={10} />
                </a>
                {sig.body_text && (
                  <div className="text-xs text-text-muted mt-0.5 line-clamp-2">
                    {sig.body_text.slice(0, 200)}
                  </div>
                )}
                <div className="text-xs text-text-muted mt-1 flex items-center gap-2">
                  {sig.classification && (
                    <span className={sig.classification === 'noise' ? 'text-text-muted' : 'text-accent-success'}>
                      {sig.classification}
                    </span>
                  )}
                  {sig.severity && <span>sev:{sig.severity}</span>}
                  {sig.platform_score > 0 && <span>score:{sig.platform_score}</span>}
                  {sig.cluster_score && <span>cluster:{sig.cluster_score}</span>}
                </div>
              </div>
              {sig.posted_at && (
                <div className="text-xs text-text-muted whitespace-nowrap shrink-0">
                  {new Date(sig.posted_at).toLocaleDateString()}
                </div>
              )}
            </div>
          ))}
        </div>
        {/* Pagination */}
        {(signalData?.total || 0) > 30 && (
          <div className="p-3 border-t border-border flex items-center justify-between">
            <button
              disabled={signalPage === 0}
              onClick={() => setSignalPage(p => p - 1)}
              className="text-xs px-3 py-1 rounded bg-bg-elevated disabled:opacity-30"
            >
              Prev
            </button>
            <span className="text-xs text-text-muted">
              Page {signalPage + 1} of {Math.ceil((signalData?.total || 0) / 30)}
            </span>
            <button
              disabled={(signalPage + 1) * 30 >= (signalData?.total || 0)}
              onClick={() => setSignalPage(p => p + 1)}
              className="text-xs px-3 py-1 rounded bg-bg-elevated disabled:opacity-30"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
