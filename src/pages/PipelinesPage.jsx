/**
 * @file PipelinesPage.jsx
 * @description Agent Pipeline Orchestration — view, run, and monitor multi-step agent pipelines.
 *
 * Shows all defined pipelines grouped by domain. Each pipeline has:
 * - Step list with agent names and delay offsets
 * - One-click Run button
 * - Live step-by-step progress while running (polling /api/pipelines/runs/:runId)
 * - Run history at the bottom
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  GitMerge,
  Play,
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  ChevronDown,
  ChevronRight,
  ArrowRight,
  Loader,
  Circle,
} from 'lucide-react';
import { api } from '@/lib/api';

// ── Status styling ────────────────────────────────────────────────────────────

const STATUS_COLORS = {
  pending:   'text-text-muted',
  waiting:   'text-accent-warning',
  running:   'text-accent-warning',
  completed: 'text-accent-success',
  failed:    'text-accent-danger',
  paused:    'text-accent-info',
};

const STATUS_ICONS = {
  pending:   <Circle size={14} className="text-text-muted" />,
  waiting:   <Clock size={14} className="text-accent-warning" />,
  running:   <Loader size={14} className="text-accent-warning animate-spin" />,
  completed: <CheckCircle size={14} className="text-accent-success" />,
  failed:    <XCircle size={14} className="text-accent-danger" />,
  paused:    <Clock size={14} className="text-accent-info" />,
};

const DOMAIN_COLORS = {
  hoa:  'bg-emerald-500',
  jake: 'bg-rose-500',
  cfo:  'bg-amber-500',
  mgmt: 'bg-purple-500',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function domainBadge(domain) {
  if (!domain || domain === 'all') return null;
  const cls = DOMAIN_COLORS[domain] || 'bg-accent-primary';
  return (
    <span className={`${cls} text-white text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full`}>
      {domain}
    </span>
  );
}

function fmt(ms) {
  if (!ms) return null;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

// ── PipelineCard — shows a single pipeline definition ─────────────────────────

function PipelineCard({ pipeline, onRun, running }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-bg-elevated border border-border rounded-xl overflow-hidden">
      {/* Header row */}
      <div className="flex items-center gap-3 px-5 py-4">
        <button
          onClick={() => setExpanded(e => !e)}
          className="flex items-center gap-2 text-text-muted hover:text-text-primary transition-colors"
        >
          {expanded
            ? <ChevronDown size={16} />
            : <ChevronRight size={16} />
          }
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-text-primary text-sm">{pipeline.name}</span>
            {domainBadge(pipeline.domain)}
            <span className="text-xs text-text-muted">
              {pipeline.steps.length} step{pipeline.steps.length !== 1 ? 's' : ''}
            </span>
          </div>
          {pipeline.description && (
            <p className="text-xs text-text-muted mt-0.5 truncate">{pipeline.description}</p>
          )}
        </div>

        <div className="flex items-center gap-3 text-xs text-text-muted shrink-0">
          {pipeline.total_runs > 0 && (
            <span>{pipeline.successful_runs}/{pipeline.total_runs} runs</span>
          )}
          {pipeline.last_run_at && (
            <span className="hidden sm:block">
              Last: {new Date(pipeline.last_run_at).toLocaleDateString()}
            </span>
          )}
        </div>

        <button
          onClick={() => onRun(pipeline.id, pipeline.name)}
          disabled={running}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent-primary text-white font-semibold text-xs hover:bg-accent-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
        >
          {running
            ? <><RefreshCw size={12} className="animate-spin" /> Running</>
            : <><Play size={12} /> Run</>
          }
        </button>
      </div>

      {/* Expanded step list */}
      {expanded && (
        <div className="border-t border-border px-5 py-3 bg-bg-primary">
          <div className="flex items-center gap-2 flex-wrap">
            {pipeline.steps.map((step, i) => (
              <React.Fragment key={i}>
                <div className="flex flex-col items-center text-center">
                  <div className="px-3 py-1.5 rounded-lg bg-bg-secondary border border-border text-xs text-text-primary font-mono">
                    {step.agent_name}
                  </div>
                  {step.delay_minutes > 0 && (
                    <span className="text-[10px] text-text-muted mt-0.5">
                      +{step.delay_minutes}m delay
                    </span>
                  )}
                </div>
                {i < pipeline.steps.length - 1 && (
                  <ArrowRight size={14} className="text-text-muted shrink-0" />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── ActiveRunPanel — live progress for an in-flight pipeline run ───────────────

function ActiveRunPanel({ pipelineRunId, pipelineName, onDone }) {
  const [runData, setRunData] = useState(null);
  const [steps, setSteps] = useState([]);
  const pollRef = useRef(null);

  useEffect(() => {
    const poll = async () => {
      try {
        const data = await api.get(`/pipelines/runs/${pipelineRunId}`);
        if (data.success) {
          setRunData(data.run);
          setSteps(data.steps || []);
          if (data.run.status === 'completed' || data.run.status === 'failed') {
            clearInterval(pollRef.current);
            setTimeout(onDone, 3000); // linger 3s then dismiss
          }
        }
      } catch { /* silent */ }
    };

    poll();
    pollRef.current = setInterval(poll, 2000);
    return () => clearInterval(pollRef.current);
  }, [pipelineRunId]);

  if (!runData) {
    return (
      <div className="bg-bg-elevated border border-border rounded-xl p-6 flex items-center gap-3">
        <Loader size={18} className="text-accent-primary animate-spin" />
        <span className="text-text-muted text-sm">Starting pipeline…</span>
      </div>
    );
  }

  const progress = runData.total_steps > 0
    ? Math.round((runData.current_step / runData.total_steps) * 100)
    : 0;

  const pipelineSteps = runData.pipeline_steps || [];

  return (
    <div className="bg-bg-elevated border border-accent-primary/30 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          {runData.status === 'running'
            ? <Loader size={18} className="text-accent-warning animate-spin" />
            : runData.status === 'completed'
              ? <CheckCircle size={18} className="text-accent-success" />
              : <XCircle size={18} className="text-accent-danger" />
          }
          <div>
            <div className="font-semibold text-text-primary text-sm">{pipelineName}</div>
            <div className="text-xs text-text-muted">
              Step {Math.min(runData.current_step + 1, runData.total_steps)} of {runData.total_steps}
              {' · '}
              <span className={STATUS_COLORS[runData.status] || 'text-text-muted'}>
                {runData.status}
              </span>
            </div>
          </div>
        </div>
        <span className="text-xs text-text-muted">
          Run #{pipelineRunId}
        </span>
      </div>

      {/* Progress bar */}
      <div className="px-5 pt-3 pb-2">
        <div className="w-full bg-bg-secondary rounded-full h-1.5">
          <div
            className="bg-accent-primary h-1.5 rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Step rows */}
      <div className="px-5 py-3 space-y-2">
        {pipelineSteps.map((def, i) => {
          const stepRow = steps.find(s => s.step_index === i);
          const status = stepRow?.status || (i < runData.current_step ? 'completed' : 'pending');
          return (
            <div key={i} className="flex items-center gap-3 py-2 border-b border-border/50 last:border-0">
              <div className="w-5 flex justify-center shrink-0">
                {STATUS_ICONS[status] || STATUS_ICONS.pending}
              </div>
              <span className="text-xs font-mono text-text-primary flex-1">{def.agent_name}</span>
              {def.delay_minutes > 0 && (
                <span className="text-[10px] text-text-muted">+{def.delay_minutes}m</span>
              )}
              {stepRow?.output_summary && (
                <span className="text-[10px] text-text-muted max-w-xs truncate hidden md:block">
                  {stepRow.output_summary}
                </span>
              )}
              {stepRow?.started_at && stepRow?.completed_at && (
                <span className="text-[10px] text-text-muted shrink-0">
                  {fmt(new Date(stepRow.completed_at) - new Date(stepRow.started_at))}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── HistoryRow ─────────────────────────────────────────────────────────────────

function HistoryRow({ run }) {
  return (
    <div className="flex items-center gap-4 p-4 bg-bg-elevated border border-border rounded-lg text-sm">
      {STATUS_ICONS[run.status] || STATUS_ICONS.pending}
      <span className="text-text-muted text-xs">#{run.id}</span>
      <span className="flex-1 text-text-primary text-xs font-medium truncate">
        {run.pipeline_name}
      </span>
      {domainBadge(run.domain)}
      <span className={`text-xs font-medium ${STATUS_COLORS[run.status] || 'text-text-muted'}`}>
        {run.status}
      </span>
      <span className="text-text-muted text-xs">
        {run.current_step}/{run.total_steps} steps
      </span>
      <span className="text-text-muted text-xs hidden sm:block">
        {run.started_at ? new Date(run.started_at).toLocaleString() : '—'}
      </span>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function PipelinesPage() {
  const [pipelines, setPipelines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeRuns, setActiveRuns] = useState([]); // [{pipelineRunId, pipelineName}]
  const [runningPipelineIds, setRunningPipelineIds] = useState(new Set());
  const [history, setHistory] = useState([]);

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const [pipelinesData, historyData] = await Promise.all([
        api.get('/pipelines'),
        api.get('/pipelines/runs'),
      ]);
      setPipelines(pipelinesData.pipelines || []);
      setHistory((historyData.runs || []).slice(0, 20));
    } catch (err) {
      setError(err.message || 'Failed to load pipelines');
    } finally {
      setLoading(false);
    }
  };

  const runPipeline = async (pipelineId, pipelineName) => {
    setError(null);
    setRunningPipelineIds(prev => new Set(prev).add(pipelineId));

    try {
      const data = await api.post(`/pipelines/${pipelineId}/run`, {});
      if (!data.success) throw new Error(data.error || 'Failed to start pipeline');

      setActiveRuns(prev => [
        ...prev,
        { pipelineRunId: data.pipelineRunId, pipelineName },
      ]);
    } catch (err) {
      setError(`Failed to start "${pipelineName}": ${err.message}`);
      setRunningPipelineIds(prev => {
        const next = new Set(prev);
        next.delete(pipelineId);
        return next;
      });
    }
  };

  const dismissRun = (pipelineRunId) => {
    setActiveRuns(prev => prev.filter(r => r.pipelineRunId !== pipelineRunId));
    // Reload history + pipelines to pick up updated run counts
    loadAll();
  };

  // Group pipelines by domain
  const grouped = pipelines.reduce((acc, p) => {
    const key = p.domain || 'all';
    (acc[key] = acc[key] || []).push(p);
    return acc;
  }, {});

  const domainOrder = ['hoa', 'jake', 'cfo', 'mgmt', 'all'];
  const sortedDomains = [
    ...domainOrder.filter(d => grouped[d]),
    ...Object.keys(grouped).filter(d => !domainOrder.includes(d)),
  ];

  return (
    <div className="h-full flex flex-col bg-bg-primary">
      {/* Header */}
      <div className="border-b border-border bg-bg-elevated px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary flex items-center gap-3">
            <GitMerge className="text-accent-primary" size={28} />
            Pipelines
          </h1>
          <p className="text-sm text-text-muted mt-1">
            Multi-step agent chains — each step triggers the next automatically
          </p>
        </div>
        <button
          onClick={loadAll}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-text-muted hover:text-text-primary hover:border-text-muted text-sm transition-colors"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Error */}
        {error && (
          <div className="p-4 rounded-lg bg-accent-danger/10 border border-accent-danger/30 text-accent-danger text-sm">
            {error}
          </div>
        )}

        {/* Active run panels */}
        {activeRuns.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-text-muted">
              Active Runs
            </h2>
            {activeRuns.map(({ pipelineRunId, pipelineName }) => (
              <ActiveRunPanel
                key={pipelineRunId}
                pipelineRunId={pipelineRunId}
                pipelineName={pipelineName}
                onDone={() => dismissRun(pipelineRunId)}
              />
            ))}
          </div>
        )}

        {/* Loading skeleton */}
        {loading && pipelines.length === 0 && (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-16 rounded-xl bg-bg-elevated border border-border animate-pulse" />
            ))}
          </div>
        )}

        {/* Pipelines grouped by domain */}
        {!loading && sortedDomains.map(domain => (
          <div key={domain}>
            <div className="flex items-center gap-3 mb-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-text-muted">
                {domain === 'all' ? 'Cross-Domain' : domain.toUpperCase()}
              </h2>
              {domainBadge(domain !== 'all' ? domain : null)}
              <div className="flex-1 h-px bg-border" />
            </div>
            <div className="space-y-3">
              {grouped[domain].map(pipeline => (
                <PipelineCard
                  key={pipeline.id}
                  pipeline={pipeline}
                  onRun={runPipeline}
                  running={runningPipelineIds.has(pipeline.id)}
                />
              ))}
            </div>
          </div>
        ))}

        {/* Empty state */}
        {!loading && pipelines.length === 0 && !error && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-20 h-20 rounded-2xl bg-accent-primary/10 flex items-center justify-center mb-6">
              <GitMerge size={40} className="text-accent-primary" />
            </div>
            <h2 className="text-xl font-bold text-text-primary mb-2">No Pipelines</h2>
            <p className="text-text-muted max-w-md text-sm">
              Run <code className="text-accent-primary font-mono">node scripts/seed-pipelines.js</code> to seed the predefined pipelines.
            </p>
          </div>
        )}

        {/* Run history */}
        {history.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-text-muted mb-3">
              Run History
            </h2>
            <div className="space-y-2">
              {history.map(run => (
                <HistoryRow key={run.id} run={run} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
