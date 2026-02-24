/**
 * @file BlitzPage.jsx
 * @description Blitz Mode — run all active agents sequentially in one click.
 */

import React, { useState, useEffect, useRef } from 'react';
import { Zap, Play, RefreshCw, CheckCircle, XCircle, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import { api } from '@/lib/api';

const STATUS_COLORS = {
  pending: 'text-text-muted',
  running: 'text-accent-warning',
  completed: 'text-accent-success',
  failed: 'text-accent-danger',
};

const STATUS_ICONS = {
  pending: <Clock size={16} className="text-text-muted" />,
  running: <RefreshCw size={16} className="text-accent-warning animate-spin" />,
  completed: <CheckCircle size={16} className="text-accent-success" />,
  failed: <XCircle size={16} className="text-accent-danger" />,
};

export default function BlitzPage() {
  const [isRunning, setIsRunning] = useState(false);
  const [currentRun, setCurrentRun] = useState(null);
  const [results, setResults] = useState([]);
  const [history, setHistory] = useState([]);
  const [expanded, setExpanded] = useState({});
  const [error, setError] = useState(null);
  const pollRef = useRef(null);

  useEffect(() => {
    fetchHistory();
    return () => clearInterval(pollRef.current);
  }, []);

  const fetchHistory = async () => {
    try {
      const data = await api.get('/blitz/history');
      setHistory(data.runs || []);
    } catch { /* silent */ }
  };

  const pollStatus = async (runId) => {
    try {
      const data = await api.get(`/blitz/results/${runId}`);
      setCurrentRun(data.run);
      setResults(data.results || []);

      if (data.run?.status === 'completed' || data.run?.status === 'failed') {
        clearInterval(pollRef.current);
        setIsRunning(false);
        fetchHistory();
      }
    } catch { /* silent */ }
  };

  const startBlitz = async () => {
    setError(null);
    setIsRunning(true);
    setCurrentRun(null);
    setResults([]);
    setExpanded({});

    try {
      const data = await api.post('/blitz/run');

      if (!data.success) {
        throw new Error(data.error || 'Failed to start blitz');
      }

      const runId = data.runId;
      // Start polling every 3s
      pollRef.current = setInterval(() => pollStatus(runId), 3000);
      // Poll immediately
      pollStatus(runId);
    } catch (err) {
      setError(err.message);
      setIsRunning(false);
    }
  };

  const toggleExpand = (id) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

  const progress = currentRun
    ? Math.round(((currentRun.completed_agents || 0) / (currentRun.total_agents || 1)) * 100)
    : 0;

  return (
    <div className="h-full flex flex-col bg-bg-primary">
      {/* Header */}
      <div className="border-b border-border bg-bg-elevated px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary flex items-center gap-3">
            <Zap className="text-accent-primary" size={28} />
            Blitz Mode
          </h1>
          <p className="text-sm text-text-muted mt-1">
            One-click media blitz — runs all active agents in sequence
          </p>
        </div>
        <button
          onClick={startBlitz}
          disabled={isRunning}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-accent-primary text-white font-semibold text-sm hover:bg-accent-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isRunning
            ? <><RefreshCw size={16} className="animate-spin" /> Running...</>
            : <><Play size={16} /> Launch Blitz</>
          }
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {error && (
          <div className="p-4 rounded-lg bg-accent-danger/10 border border-accent-danger/30 text-accent-danger text-sm">
            {error}
          </div>
        )}

        {/* Active run */}
        {currentRun && (
          <div className="bg-bg-elevated border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="font-semibold text-text-primary">
                Active Run #{currentRun.id}
              </div>
              <span className={`text-sm font-medium ${STATUS_COLORS[currentRun.status] || 'text-text-muted'}`}>
                {currentRun.status}
              </span>
            </div>

            {/* Progress bar */}
            <div className="w-full bg-bg-secondary rounded-full h-2 mb-3">
              <div
                className="bg-accent-primary h-2 rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="text-xs text-text-muted mb-4">
              {currentRun.completed_agents || 0} / {currentRun.total_agents || 0} agents complete
              {currentRun.failed_agents > 0 && (
                <span className="text-accent-danger ml-2">({currentRun.failed_agents} failed)</span>
              )}
            </div>

            {/* Agent results */}
            <div className="space-y-2">
              {results.map((r) => (
                <div key={r.id} className="border border-border rounded-lg overflow-hidden">
                  <button
                    onClick={() => r.output && toggleExpand(r.id)}
                    className="w-full flex items-center gap-3 px-4 py-3 bg-bg-secondary hover:bg-bg-primary transition-colors text-left"
                  >
                    {STATUS_ICONS[r.status] || STATUS_ICONS.pending}
                    <span className="flex-1 text-sm font-medium text-text-primary">{r.agent_name}</span>
                    {r.duration_ms && (
                      <span className="text-xs text-text-muted mr-2">
                        {(r.duration_ms / 1000).toFixed(1)}s
                      </span>
                    )}
                    {r.output && (
                      expanded[r.id] ? <ChevronUp size={14} className="text-text-muted" /> : <ChevronDown size={14} className="text-text-muted" />
                    )}
                  </button>
                  {expanded[r.id] && r.output && (
                    <div className="px-4 py-3 bg-bg-primary border-t border-border">
                      <pre className="text-xs text-text-secondary whitespace-pre-wrap font-mono leading-relaxed">
                        {r.output}
                      </pre>
                    </div>
                  )}
                  {r.error && (
                    <div className="px-4 py-2 bg-accent-danger/5 border-t border-accent-danger/20 text-xs text-accent-danger">
                      {r.error}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* History */}
        {history.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-text-muted mb-3">
              Previous Runs
            </h2>
            <div className="space-y-2">
              {history.map((h) => (
                <div
                  key={h.id}
                  className="flex items-center gap-4 p-4 bg-bg-elevated border border-border rounded-lg text-sm"
                >
                  {STATUS_ICONS[h.status] || STATUS_ICONS.pending}
                  <span className="text-text-muted text-xs">#{h.id}</span>
                  <span className={`font-medium ${STATUS_COLORS[h.status] || 'text-text-muted'}`}>
                    {h.status}
                  </span>
                  <span className="text-text-muted flex-1 text-xs">
                    {h.completed_agents}/{h.total_agents} agents
                    {h.failed_agents > 0 && <span className="text-accent-danger ml-1">({h.failed_agents} failed)</span>}
                  </span>
                  {h.total_duration_ms && (
                    <span className="text-text-muted text-xs">
                      {(h.total_duration_ms / 1000 / 60).toFixed(1)}m
                    </span>
                  )}
                  <span className="text-text-muted text-xs">
                    {h.completed_at ? new Date(h.completed_at).toLocaleString() : 'In progress'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {!currentRun && history.length === 0 && !error && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-20 h-20 rounded-2xl bg-accent-primary/10 flex items-center justify-center mb-6">
              <Zap size={40} className="text-accent-primary" />
            </div>
            <h2 className="text-xl font-bold text-text-primary mb-2">Ready to Blitz</h2>
            <p className="text-text-muted max-w-md">
              Click <strong className="text-text-primary">Launch Blitz</strong> to run all active agents
              sequentially. Results appear in real-time as each agent completes.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
