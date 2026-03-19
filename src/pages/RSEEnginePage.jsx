/**
 * @file RSEEnginePage.jsx
 * @description Revenue Signal Engine dashboard — sources, transcripts, signals,
 * build specs, campaigns, expert library.
 *
 * Fetches /api/rse/stats, /sources, /transcripts, /signals, /build-specs,
 * /campaigns, /expert-library. Auto-refreshes every 60s via TanStack Query.
 */

import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  Radio, BarChart3, Database, BookOpen, Send, Wrench,
  Eye, TrendingUp, CheckCircle2, XCircle, ExternalLink,
  Plus, Search, Star, Shield, Clock, Zap, AlertTriangle,
  ToggleLeft, ToggleRight, Youtube, Users, Target, Filter,
  ChevronDown, ChevronRight, Lightbulb, Code, DollarSign,
  SlidersHorizontal, RefreshCw, Power,
} from 'lucide-react';

// ── Fetch helpers ───────────────────────────────────────────────────────────

const fetchStats = () => api.get('/rse/stats');
const fetchSources = () => api.get('/rse/sources');
const fetchTranscripts = (status, offset = 0) => api.get(`/rse/transcripts${status ? `?status=${status}&` : '?'}limit=1000&offset=${offset}`);
const fetchSignals = (minScore, offset = 0) => api.get(`/rse/signals?min_score=${minScore}&limit=1000&offset=${offset}`);
const fetchSpecs = (status) => api.get(`/rse/build-specs${status ? `?status=${status}` : ''}`);
const fetchCampaigns = () => api.get('/rse/campaigns');
const fetchPrototypes = () => api.get('/rse/prototypes');
const fetchEvaluations = () => api.get('/rse/evaluations');
const triggerEvaluate = (limit = 10) => api.post('/rse/actions/evaluate', { limit });
const updateEvalStatus = (id, status) => api.patch(`/rse/evaluations/${id}`, { status });
const pickIdea = (id) => api.post(`/rse/evaluations/${id}/pick`);
const fetchScorecards = () => api.get('/rse/dream-team/scorecards?days=7');
const fetchDTPatterns = () => api.get('/rse/dream-team/patterns');
const fetchDTReports = () => api.get('/rse/dream-team/reports');
const triggerDTCycle = () => api.post('/rse/dream-team/run-cycle');
const fetchTasks = () => api.get('/rse/tasks');
const updateTaskStatus = (id, status, resultSummary) => api.patch(`/rse/tasks/${id}`, { status, result_summary: resultSummary });
const fetchLibrary = (category, search, offset = 0) => {
  let url = `/rse/expert-library?limit=1000&offset=${offset}`;
  if (category) url += `&category=${category}`;
  if (search) url += `&search=${encodeURIComponent(search)}`;
  return api.get(url);
};

// ── Action Helpers ──────────────────────────────────────────────────────────

const triggerScan = () => api.post('/rse/actions/scan');
const triggerBuildCode = (specId) => specId ? api.post('/rse/actions/build-code', { spec_id: specId }) : api.post('/rse/actions/build-code', { limit: 3 });
const triggerExtract = (limit = 10) => api.post('/rse/actions/extract', { limit });
const triggerScore = (limit = 5) => api.post('/rse/actions/score', { limit });
const triggerGenerateSpecs = (limit = 3) => api.post('/rse/actions/generate-specs', { limit });
const triggerBuildCampaigns = (limit = 3) => api.post('/rse/actions/build-campaigns', { limit });
const triggerExtractPatterns = (limit = 10) => api.post('/rse/actions/extract-patterns', { limit });
const triggerQueueCampaign = (id) => api.post(`/rse/actions/queue-campaign/${id}`);

// ── Shared Components ───────────────────────────────────────────────────────

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

function ScoreBadge({ score, max = 5 }) {
  if (score == null) return <span className="text-text-muted text-xs">—</span>;
  const pct = (score / max) * 100;
  const color = pct >= 80 ? 'text-accent-success bg-accent-success/10'
    : pct >= 60 ? 'text-accent-warning bg-accent-warning/10'
    : 'text-text-muted bg-bg-elevated';
  return <span className={`text-xs font-bold px-2 py-0.5 rounded ${color}`}>{typeof score === 'number' ? score.toFixed(1) : score}</span>;
}

function StatusBadge({ status }) {
  const colors = {
    pending: 'text-accent-warning bg-accent-warning/10',
    transcribed: 'text-accent-info bg-accent-info/10',
    scored: 'text-accent-info bg-accent-info/10',
    accepted: 'text-accent-success bg-accent-success/10',
    rejected: 'text-accent-danger bg-accent-danger/10',
    draft: 'text-text-muted bg-bg-elevated',
    approved: 'text-accent-success bg-accent-success/10',
    building: 'text-accent-warning bg-accent-warning/10',
    shipped: 'text-accent-success bg-accent-success/10',
    killed: 'text-accent-danger bg-accent-danger/10',
    queued: 'text-accent-info bg-accent-info/10',
    executing: 'text-accent-warning bg-accent-warning/10',
    completed: 'text-accent-success bg-accent-success/10',
    spec_generated: 'text-accent-info bg-accent-info/10',
    campaign_generated: 'text-accent-success bg-accent-success/10',
    expired: 'text-text-muted bg-bg-elevated',
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded capitalize whitespace-nowrap ${colors[status] || colors.draft}`}>
      {(status || 'unknown').replace(/_/g, ' ')}
    </span>
  );
}

function TrustBar({ score }) {
  const pct = Math.round((score || 0) * 100);
  const color = pct >= 70 ? 'bg-accent-success' : pct >= 40 ? 'bg-accent-warning' : 'bg-accent-danger';
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-2 bg-bg-elevated rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-text-muted font-mono">{pct}%</span>
    </div>
  );
}

function EmptyState({ icon: Icon, message }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-text-muted">
      {Icon && <Icon size={40} className="mb-3 opacity-30" />}
      <p className="text-sm">{message}</p>
      <p className="text-xs mt-1 opacity-60">Pipeline runs daily at 5 AM — data will appear after first run</p>
    </div>
  );
}

function ActionButton({ onClick, loading, icon: Icon, label, color = 'accent-primary', result }) {
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={onClick}
        disabled={loading}
        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-${color}/10 text-${color} hover:bg-${color}/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors`}
      >
        {loading ? (
          <span className="animate-spin inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full" />
        ) : (
          Icon && <Icon size={14} />
        )}
        {loading ? 'Running...' : label}
      </button>
      {result && <span className="text-xs text-accent-success">{result}</span>}
    </div>
  );
}

function SectionHeader({ title, count, children }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
        {title}
        {count != null && <span className="text-xs text-text-muted font-normal">({count})</span>}
      </h3>
      {children}
    </div>
  );
}

// ── Stats Tab ───────────────────────────────────────────────────────────────

function StatsTab({ stats }) {
  if (!stats) return <div className="text-text-muted text-sm">Loading...</div>;

  return (
    <div className="space-y-6">
      {/* Top-line metrics */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="Sources" value={stats.sources?.enabled || 0} icon={Youtube} color="text-accent-primary" sub={`${stats.sources?.total || 0} total`} />
        <StatCard label="Transcripts" value={stats.transcripts?.total || 0} icon={Database} color="text-accent-info" sub={`${stats.transcripts?.pending || 0} pending`} />
        <StatCard label="Signals" value={stats.signals?.accepted || 0} icon={Radio} color="text-accent-success" sub={`avg ${stats.signals?.avg_score || 0}/5`} />
        <StatCard label="Build Specs" value={stats.build_specs?.total || 0} icon={Wrench} color="text-accent-warning" sub={`${stats.build_specs?.draft || 0} draft`} />
        <StatCard label="Campaigns" value={stats.campaigns?.total || 0} icon={Send} color="text-accent-primary" />
        <StatCard label="Expert Library" value={stats.expert_library?.total || 0} icon={BookOpen} color="text-accent-success" sub={`${stats.expert_library?.verified || 0} verified`} />
      </div>

      {/* Top source */}
      {stats.top_source && (
        <div className="bg-bg-secondary border border-border rounded-lg p-4">
          <div className="text-xs text-text-muted uppercase tracking-wide mb-2">Top Source</div>
          <div className="flex items-center gap-3">
            <Youtube size={20} className="text-accent-danger" />
            <div>
              <div className="font-medium text-text-primary">{stats.top_source.name}</div>
              <div className="text-xs text-text-muted">
                Trust: {Math.round(stats.top_source.trust_score * 100)}% · {stats.top_source.total_signals_accepted} signals accepted
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Recent signals */}
      <div>
        <SectionHeader title="Recent Signals" count={stats.recent_signals?.length} />
        {(!stats.recent_signals || stats.recent_signals.length === 0) ? (
          <EmptyState icon={Radio} message="No signals scored yet" />
        ) : (
          <div className="space-y-2">
            {stats.recent_signals.map((sig, i) => (
              <div key={i} className="bg-bg-secondary border border-border rounded-lg p-3 flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-text-primary truncate">{sig.title}</div>
                  <div className="text-xs text-text-muted mt-0.5">{sig.source_name} · {sig.signal_type}</div>
                </div>
                <ScoreBadge score={sig.composite_score} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Ranked Ideas Tab ────────────────────────────────────────────────────────

// ── Dream Team Tab ──────────────────────────────────────────────────────────

function DreamTeamTab() {
  const queryClient = useQueryClient();
  const [cycleResult, setCycleResult] = useState(null);

  const { data: scorecards } = useQuery({ queryKey: ['dt-scorecards'], queryFn: fetchScorecards, refetchInterval: 60000 });
  const { data: patterns } = useQuery({ queryKey: ['dt-patterns'], queryFn: fetchDTPatterns, refetchInterval: 60000 });
  const { data: reports } = useQuery({ queryKey: ['dt-reports'], queryFn: fetchDTReports, refetchInterval: 60000 });

  const runCycle = useMutation({
    mutationFn: triggerDTCycle,
    onSuccess: (data) => {
      setCycleResult(`${data.scorecards} scored, ${data.approved} patterns approved, ${data.actions} actions`);
      queryClient.invalidateQueries({ queryKey: ['dt-scorecards'] });
      queryClient.invalidateQueries({ queryKey: ['dt-patterns'] });
      queryClient.invalidateQueries({ queryKey: ['dt-reports'] });
    },
  });

  // Group scorecards by date, show latest
  const latestDate = scorecards?.[0]?.score_date;
  const todayCards = scorecards?.filter(c => c.score_date === latestDate) || [];

  const gradeColors = { A: 'text-accent-success', B: 'text-accent-info', C: 'text-accent-warning', D: 'text-accent-danger', F: 'text-accent-danger' };
  const trendIcons = { up: '📈', down: '📉', stable: '➡️' };

  return (
    <div className="space-y-6">
      <SectionHeader title="Dream Team" count={todayCards.length ? `${latestDate}` : null}>
        <ActionButton onClick={() => runCycle.mutate()} loading={runCycle.isPending} icon={Star} label="Run Nightly Cycle Now" color="accent-warning" result={cycleResult} />
      </SectionHeader>

      {todayCards.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-text-muted">
          <Shield size={40} className="mb-3 opacity-30" />
          <p className="text-sm">No scorecards yet</p>
          <p className="text-xs mt-1 opacity-60">Click "Run Nightly Cycle Now" or wait for the 11 PM auto-run</p>
        </div>
      ) : (
        <>
          {/* Scorecard Grid */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            {todayCards.map(card => (
              <div key={card.id} className="bg-bg-secondary border border-border rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {(() => { const info = AGENT_ICONS[card.agent_name]; return info ? <info.icon size={16} className={info.color} /> : null; })()}
                    <span className="text-sm font-bold text-text-primary capitalize">{card.agent_name}</span>
                  </div>
                  <span className={`text-2xl font-black ${gradeColors[card.grade] || 'text-text-muted'}`}>{card.grade}</span>
                </div>
                <div className="text-xs text-text-muted mb-2">{card.composite_score}/100 {trendIcons[card.trend] || ''}</div>
                <div className="space-y-1">
                  <ScoreBar100 label={card.dim1_name} value={card.dim1_score} />
                  <ScoreBar100 label={card.dim2_name} value={card.dim2_score} />
                  <ScoreBar100 label={card.dim3_name} value={card.dim3_score} />
                  <ScoreBar100 label={card.dim4_name} value={card.dim4_score} />
                </div>
                {/* Score history — last 3 grades as colored dots */}
                {(() => {
                  const history = (scorecards || [])
                    .filter(c => c.agent_name === card.agent_name)
                    .sort((a, b) => b.score_date.localeCompare(a.score_date))
                    .slice(0, 3);
                  if (history.length <= 1) return null;
                  return (
                    <div className="flex items-center gap-1.5 mt-2">
                      <span className="text-xs text-text-muted mr-1">Recent:</span>
                      {history.map((h, i) => (
                        <span
                          key={h.id}
                          title={`${h.score_date}: ${h.grade} (${h.composite_score}/100)`}
                          className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold text-white ${
                            h.grade === 'A' ? 'bg-accent-success' :
                            h.grade === 'B' ? 'bg-accent-info' :
                            h.grade === 'C' ? 'bg-accent-warning' :
                            'bg-accent-danger'
                          }`}
                        >
                          {h.grade}
                        </span>
                      ))}
                    </div>
                  );
                })()}
                {card.assessment && <p className="text-xs text-text-muted mt-2 italic">{card.assessment}</p>}
              </div>
            ))}
          </div>

          {/* Active Patterns */}
          {patterns && patterns.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-text-primary mb-2">Learned Patterns ({patterns.filter(p => p.status === 'active').length} active)</h3>
              <div className="space-y-1">
                {patterns.slice(0, 15).map(p => (
                  <div key={p.id} className="bg-bg-secondary border border-border rounded-lg p-2 flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className={`text-xs px-1.5 py-0.5 rounded capitalize ${
                        p.status === 'active' ? 'bg-accent-success/10 text-accent-success' :
                        p.status === 'proposed' ? 'bg-accent-warning/10 text-accent-warning' :
                        p.status === 'suspended' ? 'bg-accent-danger/10 text-accent-danger' :
                        'bg-bg-elevated text-text-muted'
                      }`}>{p.status}</span>
                      <span className="text-xs font-medium text-accent-info capitalize">{p.agent_name}</span>
                      <span className="text-xs text-text-primary truncate">{p.pattern_text}</span>
                    </div>
                    <span className="text-xs text-text-muted font-mono flex-shrink-0 ml-2">{(p.confidence || 0).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Latest Report */}
          {reports && reports.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-text-primary mb-2">Latest Report ({reports[0].report_date})</h3>
              <pre className="bg-bg-secondary border border-border rounded-lg p-4 text-xs text-text-secondary font-mono whitespace-pre-wrap overflow-x-auto">
                {reports[0].report_text}
              </pre>
            </div>
          )}
        </>
      )}

      {/* Auto-Disabled Agents */}
      <DisabledAgentsSection scorecards={scorecards} />
    </div>
  );
}

function DisabledAgentsSection({ scorecards }) {
  const queryClient = useQueryClient();

  const { data: agents } = useQuery({
    queryKey: ['agents-disabled'],
    queryFn: () => api.get('/agents?status=disabled'),
    refetchInterval: 60000,
  });

  const reEnable = useMutation({
    mutationFn: (id) => api.put(`/agents/${id}`, { status: 'idle' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents-disabled'] });
      queryClient.invalidateQueries({ queryKey: ['dt-scorecards'] });
    },
  });

  const disabledAgents = agents || [];

  return (
    <div>
      <h3 className="text-sm font-semibold text-text-primary mb-2 flex items-center gap-2">
        <Power size={14} />
        Auto-Disabled Agents
      </h3>
      {disabledAgents.length === 0 ? (
        <div className="bg-bg-secondary border border-accent-success/30 rounded-lg p-4 flex items-center gap-2">
          <CheckCircle2 size={16} className="text-accent-success" />
          <span className="text-sm text-accent-success font-medium">All agents healthy</span>
        </div>
      ) : (
        <div className="space-y-2">
          {disabledAgents.map(agent => {
            const lastCard = (scorecards || [])
              .filter(c => c.agent_name === agent.name?.toLowerCase())
              .sort((a, b) => b.score_date.localeCompare(a.score_date))[0];
            return (
              <div key={agent.id} className="bg-bg-secondary border border-accent-danger/30 rounded-lg p-3 flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-text-primary">{agent.name}</span>
                    {lastCard && (
                      <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                        lastCard.grade === 'A' ? 'bg-accent-success/10 text-accent-success' :
                        lastCard.grade === 'B' ? 'bg-accent-info/10 text-accent-info' :
                        lastCard.grade === 'C' ? 'bg-accent-warning/10 text-accent-warning' :
                        'bg-accent-danger/10 text-accent-danger'
                      }`}>Last: {lastCard.grade}</span>
                    )}
                  </div>
                  {(agent.description || agent.notes) && (
                    <p className="text-xs text-text-muted mt-0.5 truncate">{agent.description || agent.notes}</p>
                  )}
                </div>
                <button
                  onClick={() => reEnable.mutate(agent.id)}
                  disabled={reEnable.isPending}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md bg-accent-success/10 text-accent-success hover:bg-accent-success/20 transition-colors disabled:opacity-50"
                >
                  <RefreshCw size={12} className={reEnable.isPending ? 'animate-spin' : ''} />
                  Re-enable
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ScoreBar100({ label, value }) {
  const pct = value || 0;
  const color = pct >= 90 ? 'bg-accent-success' : pct >= 75 ? 'bg-accent-info' : pct >= 60 ? 'bg-accent-warning' : 'bg-accent-danger';
  return (
    <div className="flex items-center gap-1">
      <div className="flex-1 h-1.5 bg-bg-elevated rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-text-muted font-mono w-5 text-right">{pct}</span>
    </div>
  );
}

function ScoreBar({ label, value, max = 10 }) {
  const pct = Math.round((value / max) * 100);
  const color = pct >= 70 ? 'bg-accent-success' : pct >= 40 ? 'bg-accent-warning' : 'bg-accent-danger';
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-text-muted w-20 text-right">{label}</span>
      <div className="flex-1 h-2 bg-bg-elevated rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono text-text-primary w-6 text-right">{value}</span>
    </div>
  );
}

function RankedIdeasTab() {
  const queryClient = useQueryClient();
  const [evalResult, setEvalResult] = useState(null);
  const [expanded, setExpanded] = useState(null);

  const { data: ideas } = useQuery({
    queryKey: ['rse-evaluations'],
    queryFn: fetchEvaluations,
    refetchInterval: 60000,
  });

  const evaluateNow = useMutation({
    mutationFn: () => triggerEvaluate(10),
    onSuccess: (data) => {
      setEvalResult(`${data.evaluated} ideas evaluated`);
      queryClient.invalidateQueries({ queryKey: ['rse-evaluations'] });
      queryClient.invalidateQueries({ queryKey: ['rse-stats'] });
    },
  });

  const setStatus = useMutation({
    mutationFn: ({ id, status }) => updateEvalStatus(id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['rse-evaluations'] }),
  });

  const pickAndBreakdown = useMutation({
    mutationFn: (id) => pickIdea(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rse-evaluations'] });
      queryClient.invalidateQueries({ queryKey: ['rse-tasks'] });
    },
  });

  return (
    <div className="space-y-4">
      <SectionHeader title="Ranked Ideas" count={ideas?.length}>
        <ActionButton onClick={() => evaluateNow.mutate()} loading={evaluateNow.isPending} icon={Star} label="Evaluate Now" color="accent-warning" result={evalResult} />
      </SectionHeader>

      {(!ideas || ideas.length === 0) ? (
        <div className="flex flex-col items-center justify-center py-16 text-text-muted">
          <Star size={40} className="mb-3 opacity-30" />
          <p className="text-sm">No ideas evaluated yet</p>
          <p className="text-xs mt-1 opacity-60">Click "Evaluate Now" to score accepted signals as business opportunities</p>
        </div>
      ) : (
        <div className="space-y-3">
          {ideas.map((idea, index) => {
            const isExpanded = expanded === idea.id;
            const rankColor = idea.rank === 1 ? 'text-accent-warning' : idea.rank <= 3 ? 'text-accent-success' : 'text-text-muted';
            const statusColors = {
              evaluated: 'bg-bg-elevated text-text-muted',
              shortlisted: 'bg-accent-warning/10 text-accent-warning',
              picked: 'bg-accent-success/10 text-accent-success',
              building: 'bg-accent-info/10 text-accent-info',
              shipped: 'bg-accent-success/10 text-accent-success font-bold',
              passed: 'bg-bg-elevated text-text-muted line-through',
            };

            return (
              <div key={idea.id} className={`bg-bg-secondary border rounded-lg overflow-hidden ${idea.status === 'shortlisted' ? 'border-accent-warning/50' : idea.status === 'picked' ? 'border-accent-success/50' : 'border-border'}`}>
                <div
                  className="p-4 cursor-pointer hover:bg-bg-elevated/50 transition-colors"
                  onClick={() => setExpanded(isExpanded ? null : idea.id)}
                >
                  <div className="flex items-center gap-3">
                    {/* Rank badge */}
                    <div className={`text-2xl font-black w-8 text-center ${rankColor}`}>
                      {idea.rank || index + 1}
                    </div>

                    {/* Main content */}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-text-primary">{idea.one_liner}</div>
                      <div className="text-xs text-text-muted mt-0.5 flex items-center gap-2 flex-wrap">
                        <span>{idea.source_name}</span>
                        <span>·</span>
                        <span className="capitalize">{idea.signal_type}</span>
                        {idea.estimated_hours && <><span>·</span><span>~{idea.estimated_hours}h</span></>}
                        {idea.comparable && idea.comparable !== 'none' && <><span>·</span><span>vs {idea.comparable}</span></>}
                      </div>
                    </div>

                    {/* Score + status */}
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <div className="text-right">
                        <div className="text-lg font-black text-text-primary">{idea.composite_score?.toFixed(1)}</div>
                        <div className="text-xs text-text-muted">/10</div>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded capitalize whitespace-nowrap ${statusColors[idea.status] || statusColors.evaluated}`}>
                        {idea.status}
                      </span>
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-border p-4 bg-bg-primary/50 space-y-4">
                    {/* Score breakdown */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <div className="text-xs text-text-muted uppercase tracking-wide mb-1">Score Breakdown</div>
                        <ScoreBar label="Revenue" value={idea.revenue_potential} />
                        <ScoreBar label="Ease" value={idea.build_effort} />
                        <ScoreBar label="Stack Fit" value={idea.stack_fit} />
                        <ScoreBar label="Timing" value={idea.market_timing} />
                        <ScoreBar label="Unique" value={idea.differentiation} />
                      </div>
                      <div className="space-y-3">
                        {idea.revenue_path && (
                          <div>
                            <div className="text-xs text-text-muted uppercase tracking-wide mb-0.5 flex items-center gap-1"><DollarSign size={10} /> Revenue Path</div>
                            <div className="text-sm text-accent-success">{idea.revenue_path}</div>
                          </div>
                        )}
                        {idea.first_step && (
                          <div>
                            <div className="text-xs text-text-muted uppercase tracking-wide mb-0.5 flex items-center gap-1"><Zap size={10} /> First Step</div>
                            <div className="text-sm text-text-primary">{idea.first_step}</div>
                          </div>
                        )}
                        {idea.risk && (
                          <div>
                            <div className="text-xs text-text-muted uppercase tracking-wide mb-0.5 flex items-center gap-1"><AlertTriangle size={10} /> Risk</div>
                            <div className="text-sm text-accent-danger">{idea.risk}</div>
                          </div>
                        )}
                      </div>
                    </div>

                    {idea.why_now && (
                      <div className="text-xs text-text-secondary italic bg-bg-secondary rounded p-2">
                        <Clock size={10} className="inline mr-1 text-text-muted" /> {idea.why_now}
                      </div>
                    )}

                    {/* Source video link */}
                    {idea.video_url && (
                      <a href={idea.video_url} target="_blank" rel="noopener noreferrer"
                        className="text-xs text-accent-primary hover:underline flex items-center gap-1">
                        <ExternalLink size={10} /> {idea.video_title || 'Watch source video'}
                      </a>
                    )}

                    {/* Action buttons */}
                    <div className="flex gap-2 pt-2 border-t border-border">
                      {idea.status === 'evaluated' && (
                        <>
                          <button onClick={() => setStatus.mutate({ id: idea.id, status: 'shortlisted' })}
                            className="px-3 py-1.5 text-xs font-medium rounded-md bg-accent-warning/10 text-accent-warning hover:bg-accent-warning/20 transition-colors">
                            <Star size={12} className="inline mr-1" /> Shortlist
                          </button>
                          <button onClick={() => setStatus.mutate({ id: idea.id, status: 'passed' })}
                            className="px-3 py-1.5 text-xs font-medium rounded-md bg-bg-elevated text-text-muted hover:bg-accent-danger/10 hover:text-accent-danger transition-colors">
                            <XCircle size={12} className="inline mr-1" /> Pass
                          </button>
                        </>
                      )}
                      {idea.status === 'shortlisted' && (
                        <>
                          <button
                            onClick={() => pickAndBreakdown.mutate(idea.id)}
                            disabled={pickAndBreakdown.isPending}
                            className="px-3 py-1.5 text-xs font-medium rounded-md bg-accent-success/10 text-accent-success hover:bg-accent-success/20 disabled:opacity-50 transition-colors">
                            <CheckCircle2 size={12} className="inline mr-1" /> {pickAndBreakdown.isPending ? 'Todd is assigning tasks...' : 'Pick — Todd Assigns Tasks'}
                          </button>
                          <button onClick={() => setStatus.mutate({ id: idea.id, status: 'passed' })}
                            className="px-3 py-1.5 text-xs font-medium rounded-md bg-bg-elevated text-text-muted hover:bg-accent-danger/10 hover:text-accent-danger transition-colors">
                            <XCircle size={12} className="inline mr-1" /> Pass
                          </button>
                        </>
                      )}
                      {(idea.status === 'picked' || idea.status === 'building') && (
                        <div className="text-xs text-accent-success flex items-center gap-1">
                          <CheckCircle2 size={14} /> Tasks assigned — check Task Board tab
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Task Board Tab ──────────────────────────────────────────────────────────

const AGENT_ICONS = {
  scout: { icon: Search, color: 'text-accent-info', label: 'Scout' },
  charlie: { icon: Code, color: 'text-accent-warning', label: 'Charlie' },
  ralph: { icon: Shield, color: 'text-accent-danger', label: 'Ralph' },
  quill: { icon: Send, color: 'text-accent-primary', label: 'Quill' },
  todd: { icon: Star, color: 'text-accent-success', label: 'Todd' },
};

const TASK_STATUS_COLORS = {
  pending: 'bg-accent-warning/10 text-accent-warning border-accent-warning/30',
  blocked: 'bg-bg-elevated text-text-muted border-border',
  in_progress: 'bg-accent-info/10 text-accent-info border-accent-info/30',
  completed: 'bg-accent-success/10 text-accent-success border-accent-success/30',
  failed: 'bg-accent-danger/10 text-accent-danger border-accent-danger/30',
  skipped: 'bg-bg-elevated text-text-muted border-border line-through',
};

function TaskBoardTab() {
  const queryClient = useQueryClient();
  const { data: board } = useQuery({ queryKey: ['rse-tasks'], queryFn: fetchTasks, refetchInterval: 30000 });

  const updateTask = useMutation({
    mutationFn: ({ id, status, resultSummary }) => updateTaskStatus(id, status, resultSummary),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rse-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['rse-evaluations'] });
    },
  });

  return (
    <div className="space-y-6">
      <SectionHeader title="Task Board" count={board?.reduce((sum, g) => sum + g.tasks.length, 0)}>
        <div className="flex items-center gap-3 text-xs text-text-muted">
          {Object.entries(AGENT_ICONS).map(([key, { icon: Icon, color, label }]) => (
            <span key={key} className={`flex items-center gap-1 ${color}`}><Icon size={12} /> {label}</span>
          ))}
        </div>
      </SectionHeader>

      {(!board || board.length === 0) ? (
        <div className="flex flex-col items-center justify-center py-16 text-text-muted">
          <Target size={40} className="mb-3 opacity-30" />
          <p className="text-sm">No tasks assigned yet</p>
          <p className="text-xs mt-1 opacity-60">Go to Ranked Ideas → Shortlist an idea → Pick it → Todd assigns tasks</p>
        </div>
      ) : (
        board.map(group => {
          const completedCount = group.tasks.filter(t => t.status === 'completed').length;
          const totalCount = group.tasks.length;
          const pct = Math.round((completedCount / totalCount) * 100);

          return (
            <div key={group.evaluation_id} className="bg-bg-secondary border border-border rounded-lg overflow-hidden">
              {/* Idea header */}
              <div className="p-4 border-b border-border">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-bold text-text-primary">{group.idea_title}</div>
                    <div className="text-xs text-text-muted mt-0.5">Score: {group.composite_score?.toFixed(1)}/10 · {completedCount}/{totalCount} tasks done</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-2 bg-bg-elevated rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-accent-success" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs font-mono text-text-muted">{pct}%</span>
                  </div>
                </div>
              </div>

              {/* Task list */}
              <div className="divide-y divide-border">
                {group.tasks.map(task => {
                  const agentInfo = AGENT_ICONS[task.assigned_to] || AGENT_ICONS.todd;
                  const AgentIcon = agentInfo.icon;
                  const statusStyle = TASK_STATUS_COLORS[task.status] || TASK_STATUS_COLORS.pending;

                  return (
                    <div key={task.id} className={`p-3 flex items-center gap-3 ${task.status === 'blocked' ? 'opacity-40' : ''}`}>
                      {/* Order number */}
                      <div className="w-6 h-6 rounded-full bg-bg-elevated flex items-center justify-center text-xs font-bold text-text-muted flex-shrink-0">
                        {task.order_index}
                      </div>

                      {/* Agent badge */}
                      <div className={`flex items-center gap-1.5 w-20 flex-shrink-0 ${agentInfo.color}`}>
                        <AgentIcon size={14} />
                        <span className="text-xs font-medium">{agentInfo.label}</span>
                      </div>

                      {/* Task content */}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-text-primary">{task.title}</div>
                        {task.description && <div className="text-xs text-text-muted mt-0.5 truncate">{task.description}</div>}
                        {task.result_summary && <div className="text-xs text-accent-success mt-0.5 italic">{task.result_summary}</div>}
                      </div>

                      {/* Status + actions */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`text-xs px-2 py-0.5 rounded border capitalize ${statusStyle}`}>
                          {task.status.replace('_', ' ')}
                        </span>

                        {task.status === 'pending' && (
                          <button
                            onClick={() => updateTask.mutate({ id: task.id, status: 'in_progress' })}
                            className="px-2 py-1 text-xs rounded bg-accent-info/10 text-accent-info hover:bg-accent-info/20 transition-colors"
                          >
                            Start
                          </button>
                        )}
                        {task.status === 'in_progress' && (
                          <button
                            onClick={() => {
                              const summary = prompt('Result summary (optional):');
                              updateTask.mutate({ id: task.id, status: 'completed', resultSummary: summary || 'Done' });
                            }}
                            className="px-2 py-1 text-xs rounded bg-accent-success/10 text-accent-success hover:bg-accent-success/20 transition-colors"
                          >
                            Complete
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

// ── Sources Tab ─────────────────────────────────────────────────────────────

function SourcesTab() {
  const queryClient = useQueryClient();
  const { data: sources } = useQuery({ queryKey: ['rse-sources'], queryFn: fetchSources, refetchInterval: 60000 });
  const [showAdd, setShowAdd] = useState(false);
  const [newSource, setNewSource] = useState({ name: '', channel_url: '', notes: '' });
  const [scanResult, setScanResult] = useState(null);

  const scanNow = useMutation({
    mutationFn: triggerScan,
    onSuccess: (data) => {
      setScanResult(`Found ${data.totalNew} new videos from ${data.sourcesChecked} sources`);
      queryClient.invalidateQueries({ queryKey: ['rse-sources'] });
      queryClient.invalidateQueries({ queryKey: ['rse-transcripts'] });
      queryClient.invalidateQueries({ queryKey: ['rse-stats'] });
    },
  });

  const toggleSource = useMutation({
    mutationFn: ({ id, enabled }) => api.patch(`/rse/sources/${id}`, { enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['rse-sources'] }),
  });

  const addSource = useMutation({
    mutationFn: (data) => api.post('/rse/sources', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rse-sources'] });
      setShowAdd(false);
      setNewSource({ name: '', channel_url: '', notes: '' });
    },
  });

  return (
    <div className="space-y-4">
      <SectionHeader title="Curated Sources" count={sources?.length}>
        <div className="flex items-center gap-2">
          <ActionButton onClick={() => scanNow.mutate()} loading={scanNow.isPending} icon={Radio} label="Scan Now" result={scanResult} />
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md bg-accent-primary/10 text-accent-primary hover:bg-accent-primary/20 transition-colors"
          >
            <Plus size={14} /> Add Source
          </button>
        </div>
      </SectionHeader>

      {showAdd && (
        <div className="bg-bg-secondary border border-accent-primary/30 rounded-lg p-4 space-y-3">
          <input
            type="text" placeholder="Creator name (e.g. Cole Medin)"
            value={newSource.name} onChange={e => setNewSource(s => ({ ...s, name: e.target.value }))}
            className="w-full px-3 py-2 text-sm rounded-md bg-bg-primary border border-border text-text-primary placeholder-text-muted"
          />
          <input
            type="text" placeholder="YouTube URL (e.g. https://youtube.com/@ColeMedin)"
            value={newSource.channel_url} onChange={e => setNewSource(s => ({ ...s, channel_url: e.target.value }))}
            className="w-full px-3 py-2 text-sm rounded-md bg-bg-primary border border-border text-text-primary placeholder-text-muted"
          />
          <input
            type="text" placeholder="Notes — why follow this source?"
            value={newSource.notes} onChange={e => setNewSource(s => ({ ...s, notes: e.target.value }))}
            className="w-full px-3 py-2 text-sm rounded-md bg-bg-primary border border-border text-text-primary placeholder-text-muted"
          />
          <div className="flex gap-2">
            <button
              onClick={() => addSource.mutate(newSource)}
              disabled={!newSource.name || !newSource.channel_url}
              className="px-4 py-2 text-xs font-medium rounded-md bg-accent-primary text-white hover:bg-accent-primary/80 disabled:opacity-40 transition-colors"
            >
              Add
            </button>
            <button onClick={() => setShowAdd(false)} className="px-4 py-2 text-xs text-text-muted hover:text-text-primary transition-colors">Cancel</button>
          </div>
        </div>
      )}

      {(!sources || sources.length === 0) ? (
        <EmptyState icon={Youtube} message="No sources configured" />
      ) : (
        <div className="space-y-2">
          {sources.map(src => (
            <div key={src.id} className={`bg-bg-secondary border border-border rounded-lg p-4 ${!src.enabled ? 'opacity-50' : ''}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <Youtube size={20} className="text-accent-danger flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="font-medium text-text-primary">{src.name}</div>
                    <div className="text-xs text-text-muted truncate">
                      {src.channel_url}
                      {src.channel_id && <span className="ml-2 font-mono opacity-50">{src.channel_id}</span>}
                    </div>
                    {src.notes && <div className="text-xs text-text-muted mt-1 italic">{src.notes}</div>}
                  </div>
                </div>
                <div className="flex items-center gap-4 flex-shrink-0 ml-4">
                  <div className="text-right">
                    <TrustBar score={src.trust_score} />
                    <div className="text-xs text-text-muted mt-1">
                      {src.total_videos_scanned || 0} scanned · {src.total_signals_accepted || 0} accepted
                    </div>
                  </div>
                  <button
                    onClick={() => toggleSource.mutate({ id: src.id, enabled: !src.enabled })}
                    className="p-1 hover:bg-bg-elevated rounded transition-colors"
                    title={src.enabled ? 'Disable' : 'Enable'}
                  >
                    {src.enabled ? <ToggleRight size={24} className="text-accent-success" /> : <ToggleLeft size={24} className="text-text-muted" />}
                  </button>
                </div>
              </div>
              {src.focus_areas && (
                <div className="flex gap-1 mt-2 flex-wrap">
                  {(() => { try { return JSON.parse(src.focus_areas); } catch { return []; } })().map((tag, i) => (
                    <span key={i} className="text-xs px-1.5 py-0.5 rounded bg-bg-elevated text-text-muted">{tag}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Transcripts Tab ─────────────────────────────────────────────────────────

function TranscriptsTab() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');
  const [extractResult, setExtractResult] = useState(null);
  const { data: transcripts } = useQuery({
    queryKey: ['rse-transcripts', statusFilter],
    queryFn: () => fetchTranscripts(statusFilter),
    refetchInterval: 60000,
  });

  const extractNow = useMutation({
    mutationFn: () => triggerExtract(10),
    onSuccess: (data) => {
      setExtractResult(`${data.extracted} extracted, ${data.failed} failed, ${data.skipped} short`);
      queryClient.invalidateQueries({ queryKey: ['rse-transcripts'] });
      queryClient.invalidateQueries({ queryKey: ['rse-stats'] });
    },
  });

  const statuses = ['', 'pending', 'transcribed', 'scored', 'accepted', 'rejected'];

  return (
    <div className="space-y-4">
      <SectionHeader title="Transcripts" count={transcripts?.length}>
        <div className="flex items-center gap-3">
          <ActionButton onClick={() => extractNow.mutate()} loading={extractNow.isPending} icon={Database} label="Extract Now (10)" color="accent-info" result={extractResult} />
          <div className="flex gap-1">
            {statuses.map(s => (
              <button
                key={s || 'all'}
                onClick={() => setStatusFilter(s)}
                className={`px-2 py-1 text-xs rounded-md transition-colors ${statusFilter === s ? 'bg-accent-primary/20 text-accent-primary' : 'text-text-muted hover:text-text-primary hover:bg-bg-elevated'}`}
              >
                {s || 'All'}
              </button>
            ))}
          </div>
        </div>
      </SectionHeader>

      {(!transcripts || transcripts.length === 0) ? (
        <EmptyState icon={Database} message={`No ${statusFilter || ''} transcripts yet`} />
      ) : (
        <div className="space-y-2">
          {transcripts.map(t => (
            <div key={t.id} className="bg-bg-secondary border border-border rounded-lg p-3">
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <a
                      href={t.video_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium text-text-primary hover:text-accent-primary truncate flex items-center gap-1"
                    >
                      {t.title}
                      <ExternalLink size={12} className="flex-shrink-0 opacity-40" />
                    </a>
                  </div>
                  <div className="text-xs text-text-muted mt-0.5 flex items-center gap-2">
                    <span>{t.source_name}</span>
                    {t.word_count > 0 && <span>· {t.word_count.toLocaleString()} words</span>}
                    {t.duration_secs > 0 && <span>· {Math.round(t.duration_secs / 60)}m</span>}
                    {t.published_at && <span>· {new Date(t.published_at).toLocaleDateString()}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                  <StatusBadge status={t.status} />
                  {t.transcript_source && <span className="text-xs text-text-muted font-mono">{t.transcript_source}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Signals Tab ─────────────────────────────────────────────────────────────

function SignalsTab() {
  const queryClient = useQueryClient();
  const [minScore, setMinScore] = useState(0);
  const [expanded, setExpanded] = useState(null);
  const [scoreResult, setScoreResult] = useState(null);
  const { data: signals } = useQuery({
    queryKey: ['rse-signals', minScore],
    queryFn: () => fetchSignals(minScore),
    refetchInterval: 60000,
  });

  const scoreNow = useMutation({
    mutationFn: () => triggerScore(5),
    onSuccess: (data) => {
      setScoreResult(`${data.accepted} accepted, ${data.rejected} rejected from ${data.scored} transcripts`);
      queryClient.invalidateQueries({ queryKey: ['rse-signals'] });
      queryClient.invalidateQueries({ queryKey: ['rse-transcripts'] });
      queryClient.invalidateQueries({ queryKey: ['rse-stats'] });
    },
  });

  const [threshold, setThreshold] = useState(2.5);
  const aboveCount = useMemo(() => (signals || []).filter(s => s.composite_score >= threshold).length, [signals, threshold]);
  const belowCount = useMemo(() => (signals || []).filter(s => s.composite_score < threshold).length, [signals, threshold]);

  return (
    <div className="space-y-4">
      {/* Threshold Tuning */}
      <div className="bg-bg-secondary border border-border rounded-lg p-4">
        <div className="flex items-center gap-2 mb-3">
          <SlidersHorizontal size={14} className="text-text-muted" />
          <span className="text-xs font-medium uppercase tracking-wide text-text-muted">Threshold Tuning</span>
        </div>
        <div className="flex items-center gap-4">
          <input
            type="range"
            min={1}
            max={5}
            step={0.1}
            value={threshold}
            onChange={(e) => setThreshold(parseFloat(e.target.value))}
            className="flex-1 h-2 accent-accent-primary cursor-pointer"
          />
          <span className="text-lg font-bold text-text-primary font-mono w-10 text-right">{threshold.toFixed(1)}</span>
        </div>
        <div className="flex items-center gap-6 mt-2">
          <span className="text-xs font-medium text-accent-success">{aboveCount} signals ABOVE threshold</span>
          <span className="text-xs font-medium text-accent-danger">{belowCount} signals BELOW threshold</span>
        </div>
      </div>

      <SectionHeader title="Scored Signals" count={signals?.length}>
        <div className="flex items-center gap-3">
          <ActionButton onClick={() => scoreNow.mutate()} loading={scoreNow.isPending} icon={Target} label="Score Now (5)" color="accent-success" result={scoreResult} />
          <span className="text-xs text-text-muted">Min score:</span>
          {[0, 3, 3.5, 4, 4.5].map(s => (
            <button
              key={s}
              onClick={() => setMinScore(s)}
              className={`px-2 py-1 text-xs rounded-md transition-colors ${minScore === s ? 'bg-accent-primary/20 text-accent-primary' : 'text-text-muted hover:text-text-primary hover:bg-bg-elevated'}`}
            >
              {s === 0 ? 'All' : `${s}+`}
            </button>
          ))}
        </div>
      </SectionHeader>

      {(!signals || signals.length === 0) ? (
        <EmptyState icon={Radio} message="No signals scored yet" />
      ) : (
        <div className="space-y-2">
          {signals.map(sig => (
            <div key={sig.id} className="bg-bg-secondary border border-border rounded-lg overflow-hidden">
              <div
                className="p-3 flex items-center justify-between cursor-pointer hover:bg-bg-elevated/50 transition-colors"
                onClick={() => setExpanded(expanded === sig.id ? null : sig.id)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {expanded === sig.id ? <ChevronDown size={14} className="text-text-muted flex-shrink-0" /> : <ChevronRight size={14} className="text-text-muted flex-shrink-0" />}
                    <span className="text-sm font-medium text-text-primary truncate">{sig.title}</span>
                  </div>
                  <div className="text-xs text-text-muted mt-0.5 ml-5 flex items-center gap-2">
                    <span>{sig.source_name}</span>
                    <span>·</span>
                    <span className="capitalize">{sig.signal_type}</span>
                    {sig.video_title && (
                      <>
                        <span>·</span>
                        <a href={sig.video_url} target="_blank" rel="noopener noreferrer" className="hover:text-accent-primary flex items-center gap-0.5">
                          {sig.video_title?.slice(0, 40)}{sig.video_title?.length > 40 ? '...' : ''}
                          <ExternalLink size={10} />
                        </a>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0 ml-3">
                  <StatusBadge status={sig.status} />
                  <div className="flex items-center gap-1.5">
                    <div className="text-xs text-text-muted" title="Truth Density">T:{sig.truth_density}</div>
                    <div className="text-xs text-text-muted" title="Implementation Depth">I:{sig.implementation_depth}</div>
                    <div className="text-xs text-text-muted" title="Monetization Relevance">M:{sig.monetization_relevance}</div>
                  </div>
                  <ScoreBadge score={sig.composite_score} />
                </div>
              </div>

              {expanded === sig.id && (
                <div className="border-t border-border p-4 bg-bg-primary/50 space-y-3">
                  <p className="text-sm text-text-secondary">{sig.description}</p>
                  {sig.key_insights && (
                    <div>
                      <div className="text-xs text-text-muted uppercase tracking-wide mb-1">Key Insights</div>
                      <ul className="space-y-1">
                        {(() => { try { return JSON.parse(sig.key_insights); } catch { return []; } })().map((insight, i) => (
                          <li key={i} className="text-xs text-text-secondary flex items-start gap-1.5">
                            <Lightbulb size={12} className="text-accent-warning flex-shrink-0 mt-0.5" />
                            {insight}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {sig.score_reasoning && (
                    <div className="text-xs text-text-muted italic">Reasoning: {sig.score_reasoning}</div>
                  )}
                  <div className="flex gap-1 flex-wrap">
                    {sig.difficulty && <span className="text-xs px-1.5 py-0.5 rounded bg-bg-elevated text-text-muted">{sig.difficulty}</span>}
                    {sig.time_to_build && <span className="text-xs px-1.5 py-0.5 rounded bg-bg-elevated text-text-muted">{sig.time_to_build}</span>}
                    {(() => { try { return JSON.parse(sig.tags || '[]'); } catch { return []; } })().map((tag, i) => (
                      <span key={i} className="text-xs px-1.5 py-0.5 rounded bg-accent-primary/10 text-accent-primary">{tag}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Build Specs Tab ─────────────────────────────────────────────────────────

function BuildSpecsTab() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [genResult, setGenResult] = useState(null);

  const [buildResult, setBuildResult] = useState(null);

  const generateNow = useMutation({
    mutationFn: () => triggerGenerateSpecs(3),
    onSuccess: (data) => {
      setGenResult(`${data.generated} specs generated from ${data.total} signals`);
      queryClient.invalidateQueries({ queryKey: ['rse-specs'] });
      queryClient.invalidateQueries({ queryKey: ['rse-stats'] });
    },
  });

  const buildCodeBatch = useMutation({
    mutationFn: () => triggerBuildCode(null),
    onSuccess: (data) => {
      setBuildResult(`${data.built} prototypes built`);
      queryClient.invalidateQueries({ queryKey: ['rse-specs'] });
      queryClient.invalidateQueries({ queryKey: ['rse-stats'] });
    },
  });

  const buildCodeSingle = useMutation({
    mutationFn: (specId) => triggerBuildCode(specId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rse-specs'] });
      queryClient.invalidateQueries({ queryKey: ['rse-stats'] });
    },
  });

  const { data: specs } = useQuery({
    queryKey: ['rse-specs', statusFilter],
    queryFn: () => fetchSpecs(statusFilter),
    refetchInterval: 60000,
  });

  const updateSpec = useMutation({
    mutationFn: ({ id, status }) => api.patch(`/rse/build-specs/${id}`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['rse-specs'] }),
  });

  const statuses = ['', 'draft', 'approved', 'building', 'shipped', 'killed'];

  return (
    <div className="space-y-4">
      <SectionHeader title="Build Specs" count={specs?.length}>
        <div className="flex items-center gap-3">
          <ActionButton onClick={() => generateNow.mutate()} loading={generateNow.isPending} icon={Wrench} label="Generate Specs (3)" color="accent-warning" result={genResult} />
          <ActionButton onClick={() => buildCodeBatch.mutate()} loading={buildCodeBatch.isPending} icon={Code} label="Build Code (3)" color="accent-success" result={buildResult} />
          <div className="flex gap-1">
            {statuses.map(s => (
              <button
                key={s || 'all'}
                onClick={() => setStatusFilter(s)}
                className={`px-2 py-1 text-xs rounded-md transition-colors ${statusFilter === s ? 'bg-accent-primary/20 text-accent-primary' : 'text-text-muted hover:text-text-primary hover:bg-bg-elevated'}`}
              >
                {s || 'All'}
              </button>
            ))}
          </div>
        </div>
      </SectionHeader>

      {(!specs || specs.length === 0) ? (
        <EmptyState icon={Wrench} message="No build specs yet — signals need to be scored first" />
      ) : (
        <div className="space-y-2">
          {specs.map(spec => (
            <div key={spec.id} className="bg-bg-secondary border border-border rounded-lg overflow-hidden">
              <div
                className="p-3 flex items-center justify-between cursor-pointer hover:bg-bg-elevated/50 transition-colors"
                onClick={() => setExpanded(expanded === spec.id ? null : spec.id)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {expanded === spec.id ? <ChevronDown size={14} className="text-text-muted" /> : <ChevronRight size={14} className="text-text-muted" />}
                    <Wrench size={14} className="text-accent-warning flex-shrink-0" />
                    <span className="text-sm font-medium text-text-primary truncate">{spec.spec_title}</span>
                  </div>
                  <div className="text-xs text-text-muted mt-0.5 ml-8">
                    {spec.source_name} · {spec.spec_type}
                    {spec.estimated_hours && <span> · ~{spec.estimated_hours}h</span>}
                    {spec.estimated_cost_usd != null && <span> · ${spec.estimated_cost_usd}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                  <ScoreBadge score={spec.composite_score} />
                  <StatusBadge status={spec.status} />
                </div>
              </div>

              {expanded === spec.id && (
                <div className="border-t border-border p-4 bg-bg-primary/50 space-y-3">
                  {spec.problem_statement && (
                    <div>
                      <div className="text-xs text-text-muted uppercase tracking-wide mb-1">Problem</div>
                      <p className="text-sm text-text-secondary">{spec.problem_statement}</p>
                    </div>
                  )}
                  {spec.proposed_solution && (
                    <div>
                      <div className="text-xs text-text-muted uppercase tracking-wide mb-1">Solution</div>
                      <p className="text-sm text-text-secondary">{spec.proposed_solution}</p>
                    </div>
                  )}
                  {spec.implementation_steps && (
                    <div>
                      <div className="text-xs text-text-muted uppercase tracking-wide mb-1">Steps</div>
                      <ol className="list-decimal list-inside space-y-1">
                        {(() => { try { return JSON.parse(spec.implementation_steps); } catch { return []; } })().map((step, i) => (
                          <li key={i} className="text-xs text-text-secondary">{step}</li>
                        ))}
                      </ol>
                    </div>
                  )}
                  {spec.revenue_model && (
                    <div>
                      <div className="text-xs text-text-muted uppercase tracking-wide mb-1 flex items-center gap-1"><DollarSign size={12} /> Revenue Model</div>
                      <p className="text-sm text-accent-success">{spec.revenue_model}</p>
                    </div>
                  )}
                  {spec.tech_stack && (
                    <div className="flex gap-1 flex-wrap">
                      {(() => { try { return JSON.parse(spec.tech_stack); } catch { return []; } })().map((t, i) => (
                        <span key={i} className="text-xs px-1.5 py-0.5 rounded bg-accent-info/10 text-accent-info font-mono">{t}</span>
                      ))}
                    </div>
                  )}
                  {/* Action buttons */}
                  <div className="flex gap-2 pt-2 border-t border-border">
                    {spec.status === 'draft' && (
                      <>
                        <button onClick={() => updateSpec.mutate({ id: spec.id, status: 'approved' })} className="px-3 py-1.5 text-xs font-medium rounded-md bg-accent-success/10 text-accent-success hover:bg-accent-success/20 transition-colors">
                          <CheckCircle2 size={12} className="inline mr-1" /> Approve
                        </button>
                        <button onClick={() => updateSpec.mutate({ id: spec.id, status: 'killed' })} className="px-3 py-1.5 text-xs font-medium rounded-md bg-accent-danger/10 text-accent-danger hover:bg-accent-danger/20 transition-colors">
                          <XCircle size={12} className="inline mr-1" /> Kill
                        </button>
                      </>
                    )}
                    {spec.status === 'approved' && (
                      <button
                        onClick={() => buildCodeSingle.mutate(spec.id)}
                        disabled={buildCodeSingle.isPending}
                        className="px-3 py-1.5 text-xs font-medium rounded-md bg-accent-success/10 text-accent-success hover:bg-accent-success/20 disabled:opacity-50 transition-colors"
                      >
                        <Code size={12} className="inline mr-1" /> {buildCodeSingle.isPending ? 'Building...' : 'Build with Charlie'}
                      </button>
                    )}
                    {spec.status === 'building' && (
                      <button onClick={() => updateSpec.mutate({ id: spec.id, status: 'shipped' })} className="px-3 py-1.5 text-xs font-medium rounded-md bg-accent-success/10 text-accent-success hover:bg-accent-success/20 transition-colors">
                        <CheckCircle2 size={12} className="inline mr-1" /> Mark Shipped
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Prototypes Tab ──────────────────────────────────────────────────────────

function PrototypesTab() {
  const { data: prototypes } = useQuery({ queryKey: ['rse-prototypes'], queryFn: fetchPrototypes, refetchInterval: 60000 });
  const [expanded, setExpanded] = useState(null);

  const basePath = 'c:\\Users\\SPilcher\\OpenClaw2.0 for linux - Copy\\data\\prototypes';

  return (
    <div className="space-y-4">
      <SectionHeader title="Built Prototypes" count={prototypes?.length}>
        <div className="text-xs text-text-muted font-mono">{basePath}</div>
      </SectionHeader>

      {(!prototypes || prototypes.length === 0) ? (
        <EmptyState icon={Code} message="No prototypes built yet — approve a spec and click Build with Charlie" />
      ) : (
        <div className="space-y-3">
          {prototypes.map(p => (
            <div key={p.id} className="bg-bg-secondary border border-border rounded-lg overflow-hidden">
              <div
                className="p-4 cursor-pointer hover:bg-bg-elevated/50 transition-colors"
                onClick={() => setExpanded(expanded === p.id ? null : p.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {expanded === p.id ? <ChevronDown size={14} className="text-text-muted" /> : <ChevronRight size={14} className="text-text-muted" />}
                    <Code size={18} className="text-accent-success" />
                    <div>
                      <div className="text-sm font-bold text-text-primary">{p.name}</div>
                      <div className="text-xs text-text-muted mt-0.5">
                        {p.template_type} · {p.scaffold_agent} · ${(p.total_cost_usd || 0).toFixed(2)}
                        {p.scaffolded_at && <span> · {new Date(p.scaffolded_at).toLocaleDateString()}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {p.qa_passed === true && <span className="text-xs px-2 py-0.5 rounded bg-accent-success/10 text-accent-success">QA Passed</span>}
                    {p.qa_passed === false && <span className="text-xs px-2 py-0.5 rounded bg-accent-warning/10 text-accent-warning">{p.qa_issues?.length || 0} QA Issues</span>}
                    {p.has_files ? (
                      <span className="text-xs px-2 py-0.5 rounded bg-accent-success/10 text-accent-success">{p.files_on_disk?.length || 0} files</span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded bg-accent-danger/10 text-accent-danger">Missing</span>
                    )}
                  </div>
                </div>
              </div>

              {expanded === p.id && (
                <div className="border-t border-border p-4 bg-bg-primary/50 space-y-4">
                  {/* Spec info */}
                  {p.spec_title && (
                    <div>
                      <div className="text-xs text-text-muted uppercase tracking-wide mb-1">From Spec</div>
                      <div className="text-sm text-text-primary font-medium">{p.spec_title}</div>
                      {p.problem_statement && <p className="text-xs text-text-secondary mt-1">{p.problem_statement}</p>}
                      {p.revenue_model && (
                        <div className="text-xs text-accent-success mt-1 flex items-center gap-1">
                          <DollarSign size={12} /> {p.revenue_model}
                        </div>
                      )}
                    </div>
                  )}

                  {/* File listing */}
                  <div>
                    <div className="text-xs text-text-muted uppercase tracking-wide mb-2">Files on Disk</div>
                    <div className="bg-bg-secondary rounded-md p-3 font-mono text-xs space-y-1">
                      <div className="text-text-muted mb-2">{p.disk_path}</div>
                      {(p.files_on_disk || []).map((f, i) => (
                        <div key={i} className="flex items-center gap-2 text-text-primary">
                          <Code size={12} className="text-accent-info" />
                          {f}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Open in VS Code hint */}
                  <div className="bg-bg-secondary rounded-md p-3 border border-border">
                    <div className="text-xs text-text-muted mb-1">Open in VS Code:</div>
                    <code className="text-xs text-accent-primary font-mono select-all">
                      code "{p.disk_path}"
                    </code>
                  </div>

                  {/* QA issues */}
                  {p.qa_issues && p.qa_issues.length > 0 && (
                    <div>
                      <div className="text-xs text-text-muted uppercase tracking-wide mb-1">QA Issues</div>
                      {p.qa_issues.map((issue, i) => (
                        <div key={i} className="text-xs text-accent-warning flex items-center gap-1">
                          <AlertTriangle size={12} /> {issue}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Campaigns Tab ───────────────────────────────────────────────────────────

function CampaignsTab() {
  const queryClient = useQueryClient();
  const [buildResult, setBuildResult] = useState(null);
  const { data: campaigns } = useQuery({ queryKey: ['rse-campaigns'], queryFn: fetchCampaigns, refetchInterval: 60000 });

  const buildNow = useMutation({
    mutationFn: () => triggerBuildCampaigns(3),
    onSuccess: (data) => {
      setBuildResult(`${data.built} campaigns built from ${data.total} signals`);
      queryClient.invalidateQueries({ queryKey: ['rse-campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['rse-stats'] });
    },
  });

  const queueCampaign = useMutation({
    mutationFn: (id) => triggerQueueCampaign(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rse-campaigns'] });
    },
  });

  return (
    <div className="space-y-4">
      <SectionHeader title="Campaigns" count={campaigns?.length}>
        <ActionButton onClick={() => buildNow.mutate()} loading={buildNow.isPending} icon={Send} label="Build Campaigns (3)" color="accent-primary" result={buildResult} />
      </SectionHeader>

      {(!campaigns || campaigns.length === 0) ? (
        <EmptyState icon={Send} message="No campaigns generated yet" />
      ) : (
        <div className="space-y-2">
          {campaigns.map(c => (
            <div key={c.id} className="bg-bg-secondary border border-border rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Send size={14} className="text-accent-primary" />
                  <span className="text-sm font-medium text-text-primary">{c.title}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs px-1.5 py-0.5 rounded bg-bg-elevated text-text-muted capitalize">{c.campaign_type}</span>
                  <StatusBadge status={c.status} />
                </div>
              </div>
              {c.description && <p className="text-xs text-text-secondary mb-2">{c.description}</p>}
              <div className="flex items-center gap-4 text-xs text-text-muted">
                {c.target_audience && <span><Users size={12} className="inline mr-1" />{c.target_audience}</span>}
                {c.assigned_agent && <span className="font-mono">{c.assigned_agent}</span>}
                {c.source_name && <span>via {c.source_name}</span>}
              </div>
              {c.messaging_angle && (
                <div className="mt-2 p-2 bg-bg-primary rounded text-xs text-accent-primary italic">
                  "{c.messaging_angle}"
                </div>
              )}
              {(c.leads_generated > 0 || c.revenue_attributed_cents > 0) && (
                <div className="mt-2 flex gap-3">
                  {c.leads_generated > 0 && <span className="text-xs text-accent-success font-medium">{c.leads_generated} leads</span>}
                  {c.revenue_attributed_cents > 0 && <span className="text-xs text-accent-success font-medium">${(c.revenue_attributed_cents / 100).toFixed(2)} revenue</span>}
                </div>
              )}
              {c.status === 'draft' && (
                <div className="mt-3 pt-2 border-t border-border">
                  <button
                    onClick={() => queueCampaign.mutate(c.id)}
                    disabled={queueCampaign.isPending}
                    className="px-3 py-1.5 text-xs font-medium rounded-md bg-accent-success/10 text-accent-success hover:bg-accent-success/20 transition-colors"
                  >
                    <Zap size={12} className="inline mr-1" /> Queue to Jake/CFO Pipeline
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Expert Library Tab ──────────────────────────────────────────────────────

function ExpertLibraryTab() {
  const queryClient = useQueryClient();
  const [category, setCategory] = useState('');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [extractResult, setExtractResult] = useState(null);

  const extractPatterns = useMutation({
    mutationFn: () => triggerExtractPatterns(10),
    onSuccess: (data) => {
      setExtractResult(`${data.extracted} patterns from ${data.processed} signals`);
      queryClient.invalidateQueries({ queryKey: ['rse-library'] });
      queryClient.invalidateQueries({ queryKey: ['rse-stats'] });
    },
  });

  const { data: libraryData } = useQuery({
    queryKey: ['rse-library', category, search],
    queryFn: () => fetchLibrary(category, search),
    refetchInterval: 60000,
  });

  const verifyPattern = useMutation({
    mutationFn: (id) => api.post(`/rse/expert-library/${id}/verify`, { notes: 'Verified via dashboard' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['rse-library'] }),
  });

  const patterns = libraryData?.patterns || [];
  const categories = libraryData?.categories || [];

  return (
    <div className="space-y-4">
      <SectionHeader title="Expert Library" count={patterns.length}>
        <div className="flex items-center gap-3">
          <ActionButton onClick={() => extractPatterns.mutate()} loading={extractPatterns.isPending} icon={BookOpen} label="Extract Patterns" color="accent-success" result={extractResult} />
          <div className="relative">
            <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="text" placeholder="Search patterns..."
              value={search} onChange={e => setSearch(e.target.value)}
              className="pl-7 pr-3 py-1 text-xs rounded-md bg-bg-primary border border-border text-text-primary placeholder-text-muted w-48"
            />
          </div>
        </div>
      </SectionHeader>

      {/* Category filters */}
      {categories.length > 0 && (
        <div className="flex gap-1 flex-wrap">
          <button
            onClick={() => setCategory('')}
            className={`px-2 py-1 text-xs rounded-md transition-colors ${!category ? 'bg-accent-primary/20 text-accent-primary' : 'text-text-muted hover:text-text-primary hover:bg-bg-elevated'}`}
          >
            All ({patterns.length})
          </button>
          {categories.map(c => (
            <button
              key={c.category}
              onClick={() => setCategory(category === c.category ? '' : c.category)}
              className={`px-2 py-1 text-xs rounded-md transition-colors ${category === c.category ? 'bg-accent-primary/20 text-accent-primary' : 'text-text-muted hover:text-text-primary hover:bg-bg-elevated'}`}
            >
              {c.category} ({c.count})
            </button>
          ))}
        </div>
      )}

      {patterns.length === 0 ? (
        <EmptyState icon={BookOpen} message="Expert library is empty — patterns are extracted from high-scoring signals" />
      ) : (
        <div className="space-y-2">
          {patterns.map(p => (
            <div key={p.id} className="bg-bg-secondary border border-border rounded-lg overflow-hidden">
              <div
                className="p-3 flex items-center justify-between cursor-pointer hover:bg-bg-elevated/50 transition-colors"
                onClick={() => setExpanded(expanded === p.id ? null : p.id)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {expanded === p.id ? <ChevronDown size={14} className="text-text-muted" /> : <ChevronRight size={14} className="text-text-muted" />}
                    <BookOpen size={14} className="text-accent-success flex-shrink-0" />
                    <span className="text-sm font-medium text-text-primary truncate">{p.pattern_name}</span>
                    {p.verified ? <Shield size={12} className="text-accent-success flex-shrink-0" title="Verified" /> : null}
                  </div>
                  <div className="text-xs text-text-muted mt-0.5 ml-8">
                    {p.source_name} · {p.category}
                    <span className="ml-2">Referenced {p.times_referenced}x</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                  {p.success_rate != null && <ScoreBadge score={p.success_rate} max={1} />}
                  {p.verified ? (
                    <span className="text-xs px-2 py-0.5 rounded bg-accent-success/10 text-accent-success">Verified</span>
                  ) : (
                    <span className="text-xs px-2 py-0.5 rounded bg-bg-elevated text-text-muted">Unverified</span>
                  )}
                </div>
              </div>

              {expanded === p.id && (
                <div className="border-t border-border p-4 bg-bg-primary/50 space-y-3">
                  <p className="text-sm text-text-secondary">{p.description}</p>
                  {p.example_code && (
                    <div>
                      <div className="text-xs text-text-muted uppercase tracking-wide mb-1 flex items-center gap-1"><Code size={12} /> Example Code</div>
                      <pre className="text-xs bg-bg-secondary p-3 rounded-md overflow-x-auto text-text-secondary font-mono whitespace-pre-wrap">{p.example_code}</pre>
                    </div>
                  )}
                  {p.prerequisites && (
                    <div>
                      <div className="text-xs text-text-muted uppercase tracking-wide mb-1">Prerequisites</div>
                      <div className="flex gap-1 flex-wrap">
                        {(() => { try { return JSON.parse(p.prerequisites); } catch { return []; } })().map((pr, i) => (
                          <span key={i} className="text-xs px-1.5 py-0.5 rounded bg-bg-elevated text-text-muted">{pr}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {p.verification_notes && <div className="text-xs text-text-muted italic">Notes: {p.verification_notes}</div>}
                  {p.tags && (
                    <div className="flex gap-1 flex-wrap">
                      {(() => { try { return JSON.parse(p.tags); } catch { return []; } })().map((tag, i) => (
                        <span key={i} className="text-xs px-1.5 py-0.5 rounded bg-accent-primary/10 text-accent-primary">{tag}</span>
                      ))}
                    </div>
                  )}
                  {!p.verified && (
                    <button
                      onClick={(e) => { e.stopPropagation(); verifyPattern.mutate(p.id); }}
                      className="px-3 py-1.5 text-xs font-medium rounded-md bg-accent-success/10 text-accent-success hover:bg-accent-success/20 transition-colors"
                    >
                      <Shield size={12} className="inline mr-1" /> Mark as Verified
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────────────────

const TABS = [
  { key: 'stats', label: 'Overview', icon: BarChart3 },
  { key: 'dreamteam', label: 'Dream Team', icon: Shield },
  { key: 'ranked', label: 'Ranked Ideas', icon: Star },
  { key: 'tasks', label: 'Task Board', icon: Target },
  { key: 'sources', label: 'Sources', icon: Youtube },
  { key: 'transcripts', label: 'Transcripts', icon: Database },
  { key: 'signals', label: 'Signals', icon: Radio },
  { key: 'specs', label: 'Build Specs', icon: Wrench },
  { key: 'prototypes', label: 'Prototypes', icon: Code },
  { key: 'campaigns', label: 'Campaigns', icon: Send },
  { key: 'library', label: 'Expert Library', icon: BookOpen },
];

export default function RSEEnginePage() {
  const [activeTab, setActiveTab] = useState('stats');
  const { data: stats } = useQuery({ queryKey: ['rse-stats'], queryFn: fetchStats, refetchInterval: 60000 });

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-text-primary flex items-center gap-2">
          <Radio size={22} className="text-accent-primary" />
          Revenue Signal Engine
        </h1>
        <p className="text-sm text-text-muted mt-1">
          Monitor YouTube creators, extract signals, build specs, generate campaigns — all autonomous.
          {stats?.signals?.accepted > 0 && (
            <span className="ml-2 text-accent-success">
              {stats.signals.accepted} signals accepted (avg {stats.signals.avg_score}/5)
            </span>
          )}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {TABS.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.key
                  ? 'text-accent-primary border-accent-primary'
                  : 'text-text-secondary border-transparent hover:text-text-primary hover:border-border'
              }`}
            >
              <Icon size={14} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      {activeTab === 'stats' && <StatsTab stats={stats} />}
      {activeTab === 'dreamteam' && <DreamTeamTab />}
      {activeTab === 'ranked' && <RankedIdeasTab />}
      {activeTab === 'tasks' && <TaskBoardTab />}
      {activeTab === 'sources' && <SourcesTab />}
      {activeTab === 'transcripts' && <TranscriptsTab />}
      {activeTab === 'signals' && <SignalsTab />}
      {activeTab === 'specs' && <BuildSpecsTab />}
      {activeTab === 'prototypes' && <PrototypesTab />}
      {activeTab === 'campaigns' && <CampaignsTab />}
      {activeTab === 'library' && <ExpertLibraryTab />}
    </div>
  );
}
