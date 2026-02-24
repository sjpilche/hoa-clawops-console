/**
 * @file MonitorPage.jsx
 * @description Real-time agent health dashboard — pulls from our own API.
 * Shows: live run status, cost today, queue depth, recent failures.
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  Activity, DollarSign, Zap, AlertTriangle, CheckCircle,
  RefreshCw, Clock, XCircle, TrendingUp,
} from 'lucide-react';
import { api } from '@/lib/api';

function MetricCard({ icon: Icon, label, value, subtitle, color = 'text-accent-primary' }) {
  return (
    <div className="bg-bg-elevated border border-border rounded-xl p-5">
      <div className="flex items-center gap-2 mb-3">
        <Icon size={16} className={color} />
        <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">{label}</span>
      </div>
      <div className={`text-3xl font-bold font-data ${color}`}>{value}</div>
      {subtitle && <div className="text-xs text-text-muted mt-1">{subtitle}</div>}
    </div>
  );
}

const STATUS_ICON = {
  running: <RefreshCw size={14} className="text-accent-warning animate-spin" />,
  completed: <CheckCircle size={14} className="text-accent-success" />,
  failed: <XCircle size={14} className="text-accent-danger" />,
  pending: <Clock size={14} className="text-text-muted" />,
  cancelled: <XCircle size={14} className="text-text-muted" />,
};

export default function MonitorPage() {
  const [runs, setRuns] = useState([]);
  const [costs, setCosts] = useState(null);
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const [runsData, costsData, agentsData] = await Promise.all([
        api.get('/runs?limit=30').catch(() => ({ runs: [] })),
        api.get('/costs/summary').catch(() => null),
        api.get('/agents').catch(() => ({ agents: [] })),
      ]);

      setRuns(runsData.runs || []);
      if (costsData) setCosts(costsData);
      setAgents(agentsData.agents || []);

      setLastUpdated(new Date());
      setLoading(false);
    } catch {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const runningCount = runs.filter(r => r.status === 'running').length;
  const failedToday = runs.filter(r => {
    if (r.status !== 'failed') return false;
    const created = new Date(r.created_at);
    const today = new Date();
    return created.toDateString() === today.toDateString();
  }).length;
  const pendingCount = runs.filter(r => r.status === 'pending').length;
  const costToday = costs?.today_usd ?? null;
  const totalCost = costs?.total_usd ?? null;
  const activeAgents = agents.filter(a => a.status === 'active').length;

  return (
    <div className="h-full flex flex-col bg-bg-primary">
      {/* Header */}
      <div className="border-b border-border bg-bg-elevated px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary flex items-center gap-3">
            <Activity className="text-accent-primary" size={26} />
            Operations Monitor
          </h1>
          <p className="text-sm text-text-muted mt-1">
            Real-time agent health — refreshes every 10s
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="text-xs text-text-muted">
              Updated {lastUpdated.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={fetchData}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-text-secondary border border-border rounded-lg hover:bg-bg-secondary transition-colors"
          >
            <RefreshCw size={14} />
            Refresh
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <RefreshCw size={24} className="animate-spin text-text-muted" />
          </div>
        ) : (
          <>
            {/* Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <MetricCard
                icon={Activity}
                label="Running Now"
                value={runningCount}
                subtitle="active executions"
                color={runningCount > 0 ? 'text-accent-warning' : 'text-text-muted'}
              />
              <MetricCard
                icon={Clock}
                label="Pending"
                value={pendingCount}
                subtitle="awaiting confirmation"
                color="text-accent-info"
              />
              <MetricCard
                icon={AlertTriangle}
                label="Failed Today"
                value={failedToday}
                subtitle="errors in last 24h"
                color={failedToday > 0 ? 'text-accent-danger' : 'text-text-muted'}
              />
              <MetricCard
                icon={Zap}
                label="Active Agents"
                value={activeAgents}
                subtitle={`of ${agents.length} total`}
                color="text-accent-success"
              />
            </div>

            {/* Cost row */}
            {(costToday !== null || totalCost !== null) && (
              <div className="grid grid-cols-2 gap-4">
                <MetricCard
                  icon={DollarSign}
                  label="Cost Today"
                  value={costToday !== null ? `$${costToday.toFixed(3)}` : '—'}
                  subtitle="estimated OpenAI spend"
                  color="text-accent-success"
                />
                <MetricCard
                  icon={TrendingUp}
                  label="Total Spend"
                  value={totalCost !== null ? `$${totalCost.toFixed(3)}` : '—'}
                  subtitle="all-time"
                  color="text-accent-cyan"
                />
              </div>
            )}

            {/* Agent health table */}
            {agents.length > 0 && (
              <div className="bg-bg-elevated border border-border rounded-xl overflow-hidden">
                <div className="px-5 py-3 border-b border-border">
                  <h2 className="text-sm font-semibold text-text-primary">Agent Fleet Health</h2>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-text-muted">Agent</th>
                      <th className="text-left px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-text-muted">Status</th>
                      <th className="text-left px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-text-muted">Total Runs</th>
                      <th className="text-left px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-text-muted">Last Run</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agents.map((agent, i) => (
                      <tr key={agent.id} className={i % 2 === 0 ? 'bg-bg-primary/30' : ''}>
                        <td className="px-5 py-3 font-medium text-text-primary">{agent.name}</td>
                        <td className="px-5 py-3">
                          <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full ${
                            agent.status === 'active'
                              ? 'bg-accent-success/10 text-accent-success'
                              : agent.status === 'running'
                                ? 'bg-accent-warning/10 text-accent-warning'
                                : 'bg-bg-secondary text-text-muted'
                          }`}>
                            {agent.status === 'running' && <RefreshCw size={10} className="animate-spin" />}
                            {agent.status}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-text-secondary font-data">{agent.total_runs || 0}</td>
                        <td className="px-5 py-3 text-text-muted text-xs">
                          {agent.last_run_at
                            ? new Date(agent.last_run_at).toLocaleString()
                            : 'Never'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Recent runs */}
            <div className="bg-bg-elevated border border-border rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-border">
                <h2 className="text-sm font-semibold text-text-primary">Recent Run Activity</h2>
              </div>
              {runs.length === 0 ? (
                <div className="px-5 py-8 text-center text-text-muted text-sm">No runs yet</div>
              ) : (
                <div className="divide-y divide-border">
                  {runs.slice(0, 20).map((r) => (
                    <div key={r.id} className="flex items-center gap-4 px-5 py-3 hover:bg-bg-secondary/30 transition-colors">
                      {STATUS_ICON[r.status] || STATUS_ICON.pending}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-text-primary truncate">
                          {r.agent_name || r.agent_id}
                        </div>
                        <div className="text-xs text-text-muted">
                          {new Date(r.created_at).toLocaleString()}
                        </div>
                      </div>
                      {r.cost_usd > 0 && (
                        <span className="text-xs text-text-secondary font-data">
                          ${r.cost_usd.toFixed(4)}
                        </span>
                      )}
                      {r.duration_ms && (
                        <span className="text-xs text-text-muted">
                          {r.duration_ms >= 60000
                            ? `${(r.duration_ms / 60000).toFixed(1)}m`
                            : `${(r.duration_ms / 1000).toFixed(1)}s`}
                        </span>
                      )}
                      <span className={`text-xs font-medium ${
                        r.status === 'completed' ? 'text-accent-success' :
                        r.status === 'failed' ? 'text-accent-danger' :
                        r.status === 'running' ? 'text-accent-warning' :
                        'text-text-muted'
                      }`}>
                        {r.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* OpenClaw Monitor embedded dashboard */}
            <div className="bg-bg-elevated border border-border rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-border flex items-center justify-between">
                <h2 className="text-sm font-semibold text-text-primary">OpenClaw Gateway Monitor</h2>
                <a
                  href="http://127.0.0.1:18789"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-accent-primary hover:underline"
                >
                  Open full dashboard ↗
                </a>
              </div>
              <iframe
                src="http://127.0.0.1:18789"
                className="w-full border-0"
                style={{ height: '500px' }}
                title="OpenClaw Monitor Dashboard"
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
