/**
 * @file DreamTeamPage.jsx
 * @description Dream Team Command Center — the organizational nerve center.
 *
 * Shows: morning brief, agent scorecards (5 agents, A-F grades),
 * active learned patterns, overnight actions, performance trends.
 * Allows manual pattern creation (teach the system directly).
 */

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Award, Star, TrendingUp, TrendingDown, Minus,
  Brain, Shield, Pen, Search, Code, RefreshCw,
  Plus, Pause, Archive, CheckCircle2, AlertTriangle,
  Clock, Zap, ChevronDown, ChevronRight, Power,
  Play,
} from 'lucide-react';
import { api } from '@/lib/api';
import Button from '@/components/ui/Button';
import OfficeScene from '@/components/dreamteam/OfficeScene';

const AGENT_META = {
  todd:    { icon: Star,   color: 'text-amber-400',   role: 'Chief of Staff' },
  scout:   { icon: Search, color: 'text-blue-400',    role: 'Research & Discovery' },
  revops:  { icon: TrendingUp, color: 'text-emerald-400', role: 'Economics & Capital' },
  ralph:   { icon: Shield, color: 'text-red-400',     role: 'QA Gate' },
  quill:   { icon: Pen,    color: 'text-purple-400',  role: 'Content & Outreach' },
};

const GRADE_COLORS = {
  A: 'bg-accent-success text-white',
  B: 'bg-accent-info text-white',
  C: 'bg-accent-warning text-white',
  D: 'bg-accent-danger text-white',
  F: 'bg-red-600 text-white',
};

const CATEGORY_COLORS = {
  timing: 'bg-blue-500/10 text-blue-400',
  quality: 'bg-emerald-500/10 text-emerald-400',
  workflow: 'bg-amber-500/10 text-amber-400',
  outreach: 'bg-purple-500/10 text-purple-400',
  enrichment: 'bg-cyan-500/10 text-cyan-400',
  building: 'bg-orange-500/10 text-orange-400',
  scoring: 'bg-pink-500/10 text-pink-400',
};

export default function DreamTeamPage() {
  const queryClient = useQueryClient();
  const [cycleResult, setCycleResult] = useState(null);
  const [expandedAgent, setExpandedAgent] = useState(null);
  const [showPatternForm, setShowPatternForm] = useState(false);

  const { data: scorecards } = useQuery({
    queryKey: ['dt-scorecards'],
    queryFn: () => api.get('/rse/dream-team/scorecards?days=7'),
    refetchInterval: 60000,
  });

  const { data: patterns } = useQuery({
    queryKey: ['dt-patterns'],
    queryFn: () => api.get('/rse/dream-team/patterns'),
    refetchInterval: 60000,
  });

  const { data: reports } = useQuery({
    queryKey: ['dt-reports'],
    queryFn: () => api.get('/rse/dream-team/reports'),
    refetchInterval: 60000,
  });

  const { data: actions } = useQuery({
    queryKey: ['dt-actions'],
    queryFn: () => api.get('/rse/dream-team/actions'),
    refetchInterval: 60000,
  });

  const runCycle = useMutation({
    mutationFn: () => api.post('/rse/dream-team/run-cycle'),
    onSuccess: (data) => {
      setCycleResult(`${data.scorecards || 0} scored, ${data.approved || 0} patterns approved, ${data.actions || 0} actions`);
      queryClient.invalidateQueries({ queryKey: ['dt-scorecards'] });
      queryClient.invalidateQueries({ queryKey: ['dt-patterns'] });
      queryClient.invalidateQueries({ queryKey: ['dt-reports'] });
      queryClient.invalidateQueries({ queryKey: ['dt-actions'] });
    },
  });

  const latestDate = (Array.isArray(scorecards) ? scorecards : [])?.[0]?.score_date;
  const todayCards = (Array.isArray(scorecards) ? scorecards : []).filter(c => c.score_date === latestDate);
  const activePatterns = (Array.isArray(patterns) ? patterns : []).filter(p => p.status === 'active');
  const allPatterns = Array.isArray(patterns) ? patterns : [];
  const latestReport = (Array.isArray(reports) ? reports : [])[0];
  const recentActions = Array.isArray(actions) ? actions.slice(0, 20) : [];

  // 5 Core KPIs
  const { data: kpis } = useQuery({
    queryKey: ['dt-kpis'],
    queryFn: () => api.get('/dream-team/kpis'),
    refetchInterval: 30000,
  });

  return (
    <div className="space-y-6">
      {/* 5 Core KPIs — THE ONLY NUMBERS THAT MATTER */}
      {kpis && (
        <div className="grid grid-cols-5 gap-3">
          <KpiCard label="Activation (24h)" value={`${kpis.activationRate}%`} target=">80%" hit={kpis.activationRate >= 80} />
          <KpiCard label="Reply Rate (7d)" value={`${kpis.replyRate}%`} target=">2%" hit={kpis.replyRate >= 2} />
          <KpiCard label="Meetings (14d)" value={kpis.meetingsBooked} target="3+" hit={kpis.meetingsBooked >= 3} />
          <KpiCard label="Cost / Meeting" value={kpis.costPerMeeting} target="track" hit={null} />
          <KpiCard label="Stalled >48h" value={kpis.stalledLeads} target="<10" hit={kpis.stalledLeads < 10} />
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary flex items-center gap-2">
            <Award size={24} className="text-amber-400" />
            Dream Team
          </h1>
          <p className="text-sm text-text-muted mt-1">
            5 AI agents — revenue-aligned, self-governing
          </p>
        </div>
        <div className="flex items-center gap-2">
          {cycleResult && <span className="text-xs text-accent-success">{cycleResult}</span>}
          <Button
            variant="primary"
            size="sm"
            onClick={() => runCycle.mutate()}
            disabled={runCycle.isPending}
          >
            {runCycle.isPending ? <RefreshCw size={14} className="animate-spin" /> : <Zap size={14} />}
            {runCycle.isPending ? 'Running...' : 'Run Nightly Cycle Now'}
          </Button>
        </div>
      </div>

      {/* The Office — animated 2D HQ */}
      <OfficeScene scorecards={Array.isArray(scorecards) ? scorecards : []} />

      {/* Morning Brief */}
      {latestReport && (
        <div className="bg-bg-secondary border border-border rounded-lg p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
              <Clock size={16} className="text-accent-primary" />
              Morning Brief
            </h2>
            <span className="text-xs text-text-muted">{latestReport.report_date}</span>
          </div>
          <pre className="text-xs text-text-secondary font-mono whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto">
            {latestReport.report_text}
          </pre>
        </div>
      )}

      {/* Agent Scorecards */}
      {todayCards.length > 0 ? (
        <div>
          <h2 className="text-sm font-medium text-text-muted uppercase tracking-wider mb-3">
            Agent Scorecards — {latestDate}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            {todayCards.map(card => {
              const meta = AGENT_META[card.agent_name] || {};
              const Icon = meta.icon || Star;
              const isExpanded = expandedAgent === card.agent_name;
              const history = (Array.isArray(scorecards) ? scorecards : [])
                .filter(c => c.agent_name === card.agent_name)
                .sort((a, b) => b.score_date.localeCompare(a.score_date))
                .slice(0, 7);

              return (
                <div
                  key={card.id}
                  className="bg-bg-secondary border border-border rounded-lg p-4 cursor-pointer hover:border-accent-primary/40 transition-colors"
                  onClick={() => setExpandedAgent(isExpanded ? null : card.agent_name)}
                >
                  {/* Header */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Icon size={16} className={meta.color || 'text-text-muted'} />
                      <span className="text-sm font-bold text-text-primary capitalize">{card.agent_name}</span>
                    </div>
                    <span className={`text-xl font-black w-8 h-8 rounded-lg flex items-center justify-center ${GRADE_COLORS[card.grade] || 'bg-bg-elevated text-text-muted'}`}>
                      {card.grade}
                    </span>
                  </div>

                  <div className="text-xs text-text-muted mb-1">{meta.role}</div>

                  {/* Score + trend */}
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-lg font-bold text-text-primary font-data">{card.composite_score}</span>
                    <span className="text-xs text-text-muted">/100</span>
                    {card.trend === 'up' && <TrendingUp size={14} className="text-accent-success" />}
                    {card.trend === 'down' && <TrendingDown size={14} className="text-accent-danger" />}
                    {card.trend === 'stable' && <Minus size={14} className="text-text-muted" />}
                  </div>

                  {/* Dimension bars */}
                  <div className="space-y-1.5">
                    <ScoreBar label={card.dim1_name} value={card.dim1_score} />
                    <ScoreBar label={card.dim2_name} value={card.dim2_score} />
                    <ScoreBar label={card.dim3_name} value={card.dim3_score} />
                    <ScoreBar label={card.dim4_name} value={card.dim4_score} />
                  </div>

                  {/* Grade history */}
                  {history.length > 1 && (
                    <div className="flex items-center gap-1 mt-3">
                      <span className="text-[10px] text-text-muted mr-1">7d:</span>
                      {history.map((h) => (
                        <span
                          key={h.id}
                          title={`${h.score_date}: ${h.grade} (${h.composite_score})`}
                          className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold ${GRADE_COLORS[h.grade] || 'bg-bg-elevated text-text-muted'}`}
                        >
                          {h.grade}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Expanded details */}
                  {isExpanded && card.assessment && (
                    <div className="mt-3 pt-3 border-t border-border">
                      <p className="text-xs text-text-secondary italic">{card.assessment}</p>
                      {card.recommendations && (
                        <p className="text-xs text-accent-primary mt-2">{card.recommendations}</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="bg-bg-secondary border border-border rounded-lg p-8 text-center">
          <Award size={40} className="mx-auto text-text-muted mb-3 opacity-30" />
          <p className="text-sm text-text-muted">No scorecards yet</p>
          <p className="text-xs text-text-muted mt-1">Click "Run Nightly Cycle Now" or wait for the 11 PM auto-run</p>
        </div>
      )}

      {/* Active Learned Patterns */}
      <div className="bg-bg-secondary border border-border rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
            <Brain size={16} className="text-accent-primary" />
            Learned Patterns
            <span className="text-xs text-text-muted font-normal">({activePatterns.length} active / {allPatterns.length} total)</span>
          </h2>
          <Button variant="outline" size="sm" onClick={() => setShowPatternForm(!showPatternForm)}>
            <Plus size={14} /> Teach Pattern
          </Button>
        </div>

        {/* Manual pattern form */}
        {showPatternForm && (
          <PatternForm
            onClose={() => setShowPatternForm(false)}
            onSuccess={() => {
              setShowPatternForm(false);
              queryClient.invalidateQueries({ queryKey: ['dt-patterns'] });
            }}
          />
        )}

        {allPatterns.length === 0 ? (
          <p className="text-xs text-text-muted py-4 text-center">No patterns yet — the Dream Team proposes patterns nightly, or you can teach one manually.</p>
        ) : (
          <div className="space-y-1.5">
            {allPatterns.slice(0, 20).map(p => (
              <div key={p.id} className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-bg-elevated transition-colors">
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium uppercase ${
                  p.status === 'active' ? 'bg-accent-success/10 text-accent-success' :
                  p.status === 'proposed' ? 'bg-accent-warning/10 text-accent-warning' :
                  p.status === 'suspended' ? 'bg-accent-danger/10 text-accent-danger' :
                  'bg-bg-elevated text-text-muted'
                }`}>{p.status}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${CATEGORY_COLORS[p.category] || 'bg-bg-elevated text-text-muted'}`}>
                  {p.category}
                </span>
                <span className="text-xs font-medium text-accent-info capitalize w-14 shrink-0">{p.agent_name}</span>
                <span className="text-xs text-text-primary flex-1 truncate">{p.pattern_text}</span>
                <span className="text-xs text-text-muted font-data shrink-0">{(p.confidence || 0).toFixed(2)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Overnight Actions */}
      {recentActions.length > 0 && (
        <div className="bg-bg-secondary border border-border rounded-lg p-4">
          <h2 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
            <Zap size={16} className="text-accent-warning" />
            Overnight Actions
          </h2>
          <div className="space-y-1.5">
            {recentActions.map((a, i) => (
              <div key={a.id || i} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-bg-elevated">
                <span className={`w-2 h-2 rounded-full shrink-0 ${
                  a.action_type?.includes('activate') ? 'bg-accent-success' :
                  a.action_type?.includes('suspend') || a.action_type?.includes('disable') ? 'bg-accent-danger' :
                  a.action_type?.includes('flag') ? 'bg-accent-warning' :
                  'bg-text-muted'
                }`} />
                <span className="text-xs font-medium text-accent-info capitalize w-14 shrink-0">{a.agent_name}</span>
                <span className="text-xs text-text-primary flex-1">{a.description || a.action_type}</span>
                <span className="text-xs text-text-muted shrink-0">
                  {a.created_at ? new Date(a.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Disabled Agents */}
      <DisabledAgentsSection />
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function ScoreBar({ label, value }) {
  const pct = value || 0;
  const color = pct >= 90 ? 'bg-accent-success' : pct >= 75 ? 'bg-accent-info' : pct >= 60 ? 'bg-accent-warning' : 'bg-accent-danger';
  return (
    <div>
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-[10px] text-text-muted truncate">{label}</span>
        <span className="text-[10px] text-text-muted font-data">{pct}</span>
      </div>
      <div className="h-1.5 bg-bg-elevated rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function PatternForm({ onClose, onSuccess }) {
  const [form, setForm] = useState({ agent_name: 'quill', pattern_text: '', category: 'outreach', confidence: 0.8 });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.pattern_text.trim()) return;
    setSubmitting(true);
    try {
      await api.post('/dream-team/patterns', form);
      onSuccess();
    } catch (err) {
      alert('Failed: ' + (err.message || 'Unknown error'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-bg-elevated border border-border rounded-lg p-4 mb-3 space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="text-xs text-text-muted mb-1 block">Agent</label>
          <select value={form.agent_name} onChange={e => setForm({ ...form, agent_name: e.target.value })}
            className="w-full px-2 py-1.5 bg-bg-secondary border border-border rounded text-sm text-text-primary">
            <option value="todd">Todd</option>
            <option value="scout">Scout</option>
            <option value="charlie">Charlie</option>
            <option value="ralph">Ralph</option>
            <option value="quill">Quill</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-text-muted mb-1 block">Category</label>
          <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}
            className="w-full px-2 py-1.5 bg-bg-secondary border border-border rounded text-sm text-text-primary">
            <option value="outreach">Outreach</option>
            <option value="enrichment">Enrichment</option>
            <option value="quality">Quality</option>
            <option value="timing">Timing</option>
            <option value="workflow">Workflow</option>
            <option value="building">Building</option>
            <option value="scoring">Scoring</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-text-muted mb-1 block">Confidence</label>
          <input type="number" min="0" max="1" step="0.1" value={form.confidence}
            onChange={e => setForm({ ...form, confidence: parseFloat(e.target.value) })}
            className="w-full px-2 py-1.5 bg-bg-secondary border border-border rounded text-sm text-text-primary" />
        </div>
      </div>
      <div>
        <label className="text-xs text-text-muted mb-1 block">Pattern (specific, behavioral, measurable)</label>
        <textarea value={form.pattern_text} onChange={e => setForm({ ...form, pattern_text: e.target.value })}
          placeholder="e.g., For all Jake outreach, lead with the $490 Spend Leak Finder offer in the first paragraph"
          rows={2}
          className="w-full px-2 py-1.5 bg-bg-secondary border border-border rounded text-sm text-text-primary" />
      </div>
      <div className="flex items-center gap-2">
        <Button type="submit" variant="primary" size="sm" disabled={submitting || !form.pattern_text.trim()}>
          {submitting ? 'Saving...' : 'Activate Pattern'}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
      </div>
    </form>
  );
}

function KpiCard({ label, value, target, hit }) {
  return (
    <div className={`border-2 rounded-lg p-3 text-center transition-all ${
      hit === true ? 'border-accent-success/40 bg-accent-success/5' :
      hit === false ? 'border-accent-danger/40 bg-accent-danger/5' :
      'border-border bg-bg-secondary'
    }`}>
      <div className={`text-2xl font-black font-data ${
        hit === true ? 'text-accent-success' :
        hit === false ? 'text-accent-danger' :
        'text-text-primary'
      }`}>{value}</div>
      <div className="text-xs text-text-muted mt-1">{label}</div>
      <div className="text-[10px] text-text-muted/60">target: {target}</div>
    </div>
  );
}

function DisabledAgentsSection() {
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
    },
  });

  const disabledList = Array.isArray(agents) ? agents : agents?.agents || [];

  if (disabledList.length === 0) return null;

  return (
    <div className="bg-accent-danger/5 border border-accent-danger/30 rounded-lg p-4">
      <h3 className="text-sm font-semibold text-accent-danger flex items-center gap-2 mb-3">
        <Power size={16} />
        Auto-Disabled Agents ({disabledList.length})
      </h3>
      <div className="space-y-2">
        {disabledList.map(agent => (
          <div key={agent.id} className="flex items-center justify-between px-3 py-2 bg-bg-secondary rounded-lg">
            <span className="text-sm text-text-primary">{agent.name}</span>
            <button
              onClick={() => reEnable.mutate(agent.id)}
              className="text-xs text-accent-success hover:underline"
            >
              Re-enable
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
