/**
 * @file MissionControlPage.jsx
 * @description System Monitor — live resource, cost, and fleet dashboard.
 * Polls existing APIs every 15s. Zero new backend endpoints.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Activity, Server, Cpu, HardDrive, Database, DollarSign,
  Clock, Bot, Zap, Settings, Save, RefreshCw, Wifi, WifiOff,
  TrendingUp, AlertTriangle, CheckCircle, XCircle, ChevronDown, ChevronUp,
} from 'lucide-react';
import { api } from '@/lib/api';

const POLL_MS = 15000;

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt$(n) { return `$${(n || 0).toFixed(4)}`; }
function fmtPct(n) { return `${Math.round(n || 0)}%`; }
function fmtUptime(seconds) {
  if (!seconds) return '--';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function pillColor(pct, invert = false) {
  const v = invert ? 100 - pct : pct;
  if (v < 60) return 'bg-accent-success/15 text-accent-success border-accent-success/30';
  if (v < 85) return 'bg-accent-warning/15 text-accent-warning border-accent-warning/30';
  return 'bg-accent-danger/15 text-accent-danger border-accent-danger/30';
}

function StatusDot({ ok }) {
  return <span className={`inline-block w-2 h-2 rounded-full ${ok ? 'bg-accent-success' : 'bg-accent-danger'}`} />;
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function MissionControlPage() {
  const [health, setHealth] = useState(null);
  const [live, setLive] = useState(null);
  const [trader, setTrader] = useState(null);
  const [capacity, setCapacity] = useState(null);
  const [costSummary, setCostSummary] = useState(null);
  const [projections, setProjections] = useState(null);
  const [costByAgent, setCostByAgent] = useState([]);
  const [agents, setAgents] = useState([]);
  const [trainingStats, setTrainingStats] = useState(null);
  const [settings, setSettings] = useState({});
  const [editingSettings, setEditingSettings] = useState({});
  const [savingKey, setSavingKey] = useState(null);
  const [lastPoll, setLastPoll] = useState(null);
  const [fleetOpen, setFleetOpen] = useState(false);
  const intervalRef = useRef(null);

  // ── Data fetching ──

  const poll = useCallback(async () => {
    const safe = async (fn) => { try { return await fn(); } catch { return null; } };

    const [h, l, t, cap, cs, proj, cba, ag, ts] = await Promise.all([
      safe(() => api.get('/health')),
      safe(() => api.get('/health/live')),
      safe(() => fetch('/trader-api/health').then(r => r.ok ? r.json() : null)),
      safe(() => api.get('/training/capacity')),
      safe(() => api.get('/costs/summary')),
      safe(() => api.get('/costs/projections')),
      safe(() => api.get('/costs/by-agent')),
      safe(() => api.get('/agents')),
      safe(() => api.get('/training/stats')),
    ]);

    if (h) setHealth(h);
    if (l) setLive(l);
    setTrader(t); // null is valid (trader offline)
    if (cap) setCapacity(cap);
    if (cs) setCostSummary(cs.summary || cs);
    if (proj) setProjections(proj.projections || proj);
    if (cba) setCostByAgent((cba.breakdown || []).sort((a, b) => b.total_cost - a.total_cost));
    if (ag) setAgents(ag.agents || []);
    if (ts) setTrainingStats(ts);
    setLastPoll(new Date());
  }, []);

  const fetchSettings = useCallback(async () => {
    try {
      const data = await api.get('/settings');
      setSettings(data.settings || {});
    } catch {}
  }, []);

  useEffect(() => {
    poll();
    fetchSettings();
    intervalRef.current = setInterval(poll, POLL_MS);
    return () => clearInterval(intervalRef.current);
  }, [poll, fetchSettings]);

  // ── Settings save ──

  const saveSetting = async (key) => {
    setSavingKey(key);
    try {
      await api.put(`/settings/${key}`, { value: editingSettings[key] });
      await fetchSettings();
      setEditingSettings(prev => { const n = { ...prev }; delete n[key]; return n; });
    } catch (e) {
      alert(`Failed to save: ${e.message}`);
    }
    setSavingKey(null);
  };

  // ── Derived data ──

  const cpu = capacity?.cpuPercent || 0;
  const ram = capacity?.ramPercent || 0;
  const diskPct = parseFloat(health?.components?.disk?.used_percent || 0);
  const diskAvail = health?.components?.disk?.available_gb || '--';
  const dbSize = health?.components?.database?.size_mb || '--';
  const serverUp = !!live?.alive;
  const traderUp = !!trader?.status;
  const runningAgents = agents.filter(a => a.status === 'running');
  const gatesAllowed = capacity?.gates?.allowed;
  const gatesReason = capacity?.gates?.reason;

  // Group agents by config.group
  const fleetGroups = {};
  for (const a of agents) {
    let group = 'ungrouped';
    try { group = JSON.parse(a.config || '{}').group || 'ungrouped'; } catch {}
    if (!fleetGroups[group]) fleetGroups[group] = { agents: [], running: 0, totalRuns: 0, totalCost: 0 };
    fleetGroups[group].agents.push(a);
    if (a.status === 'running') fleetGroups[group].running++;
    fleetGroups[group].totalRuns += a.total_runs || 0;
    const agentCost = costByAgent.find(c => c.agent_id === a.id);
    if (agentCost) fleetGroups[group].totalCost += agentCost.total_cost;
  }

  const CONTROL_KEYS = [
    { key: 'max_cost_per_run', label: 'Max cost/run', prefix: '$' },
    { key: 'max_runs_per_hour', label: 'Max runs/hour' },
    { key: 'max_concurrent_agents', label: 'Max concurrent' },
    { key: 'max_duration_per_run', label: 'Max duration (s)' },
    { key: 'ollama_enabled', label: 'Ollama enabled' },
    { key: 'ollama_model', label: 'Ollama model' },
  ];

  // ── Render ──

  return (
    <div className="h-full overflow-y-auto p-6 space-y-4">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Activity className="w-5 h-5 text-accent-primary" />
          <h1 className="text-xl font-semibold">System Monitor</h1>
        </div>
        <div className="flex items-center gap-3 text-xs text-text-muted">
          {lastPoll && <span>Updated {lastPoll.toLocaleTimeString()}</span>}
          <span>auto-refreshes every 15s</span>
          <button onClick={poll} className="p-1.5 rounded hover:bg-bg-elevated transition-colors" title="Refresh now">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* PANEL 1 — System Health Strip                                        */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <div className="bg-bg-secondary border border-border rounded-xl p-4">
        <div className="flex flex-wrap items-center gap-4">
          {/* Services */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm">
              <StatusDot ok={serverUp} />
              <Server className="w-3.5 h-3.5 text-text-muted" />
              <span>Server</span>
              <span className="text-text-muted text-xs">{fmtUptime(live?.uptime_seconds)}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <StatusDot ok={true} />
              <span>Client</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <StatusDot ok={traderUp} />
              <span>Trader</span>
              {trader && <span className="text-xs text-text-muted">{trader.mode} · {trader.killSwitch}</span>}
              {!trader && <span className="text-xs text-text-muted">offline</span>}
            </div>
          </div>

          <div className="h-6 w-px bg-border" />

          {/* Resource pills */}
          <div className="flex items-center gap-2">
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-mono ${pillColor(cpu)}`}>
              <Cpu className="w-3 h-3" /> CPU {fmtPct(cpu)}
            </div>
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-mono ${pillColor(ram)}`}>
              <Zap className="w-3 h-3" /> RAM {fmtPct(ram)}
            </div>
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-mono ${pillColor(diskPct)}`}>
              <HardDrive className="w-3 h-3" /> Disk {diskAvail}GB free
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border text-xs font-mono text-text-secondary">
              <Database className="w-3 h-3" /> DB {dbSize}MB
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* PANEL 2 + 3 — Cost Overview | Active Work (side by side)             */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* ── Panel 2: Cost Overview ── */}
        <div className="bg-bg-secondary border border-border rounded-xl p-4 space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-text-secondary">
            <DollarSign className="w-4 h-4" /> Cost Overview
          </div>

          {/* Spend cards */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Today', value: costSummary?.cost_last_24h },
              { label: '7 days', value: costSummary?.cost_last_7d },
              { label: '30 days', value: costSummary?.cost_last_30d },
            ].map(c => (
              <div key={c.label} className="bg-bg-primary rounded-lg p-3 text-center">
                <div className="text-xs text-text-muted">{c.label}</div>
                <div className="text-lg font-mono font-semibold text-text-primary">{fmt$(c.value)}</div>
              </div>
            ))}
          </div>

          {/* Projection */}
          {projections && (
            <div className="flex items-center gap-2 text-xs text-text-muted">
              <TrendingUp className="w-3.5 h-3.5" />
              <span>Projected: {fmt$(projections.monthly_projected)}/mo · {fmt$(projections.annual_projected)}/yr · {Math.round(projections.runs_per_day || 0)} runs/day avg</span>
            </div>
          )}

          {/* Top 3 costliest agents */}
          <div>
            <div className="text-xs text-text-muted mb-2">Top spenders (all time)</div>
            {costByAgent.slice(0, 5).map(a => (
              <div key={a.agent_id} className="flex items-center justify-between py-1 text-xs">
                <span className="text-text-secondary truncate max-w-[60%]">{a.agent_name}</span>
                <div className="flex items-center gap-3 text-text-muted font-mono">
                  <span>{a.run_count} runs</span>
                  <span className="text-text-primary">{fmt$(a.total_cost)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Panel 3: Active Work ── */}
        <div className="bg-bg-secondary border border-border rounded-xl p-4 space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-text-secondary">
            <Bot className="w-4 h-4" /> Active Work
          </div>

          {/* Agent stats */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-bg-primary rounded-lg p-3">
              <div className="text-xs text-text-muted">Agents</div>
              <div className="text-lg font-mono font-semibold">
                <span className={runningAgents.length > 0 ? 'text-accent-success' : 'text-text-primary'}>{runningAgents.length}</span>
                <span className="text-text-muted text-sm"> / {agents.length}</span>
              </div>
              {runningAgents.length > 0 && (
                <div className="text-xs text-accent-success mt-1">
                  {runningAgents.map(a => a.name).join(', ')}
                </div>
              )}
            </div>
            <div className="bg-bg-primary rounded-lg p-3">
              <div className="text-xs text-text-muted">Training Gates</div>
              <div className="flex items-center gap-1.5 mt-1">
                {gatesAllowed
                  ? <><CheckCircle className="w-4 h-4 text-accent-success" /><span className="text-sm text-accent-success">Open</span></>
                  : <><XCircle className="w-4 h-4 text-accent-danger" /><span className="text-sm text-accent-danger">Blocked</span></>
                }
              </div>
              {!gatesAllowed && gatesReason && (
                <div className="text-xs text-text-muted mt-1">{gatesReason}</div>
              )}
            </div>
          </div>

          {/* Training stats */}
          {trainingStats && (
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: 'Sessions', value: trainingStats.totalSessions },
                { label: 'Skills', value: trainingStats.totalSkills },
                { label: 'QA Pending', value: trainingStats.candidates?.pending },
                { label: 'Queue', value: trainingStats.queueDepth },
              ].map(s => (
                <div key={s.label} className="text-center">
                  <div className="text-lg font-mono font-semibold text-text-primary">{s.value || 0}</div>
                  <div className="text-xs text-text-muted">{s.label}</div>
                </div>
              ))}
            </div>
          )}

          {/* Total runs + cost */}
          {costSummary && (
            <div className="flex items-center gap-4 text-xs text-text-muted pt-2 border-t border-border">
              <span>{costSummary.total_runs} total runs</span>
              <span>{costSummary.total_tokens?.toLocaleString()} tokens</span>
              <span>{fmt$(costSummary.total_cost)} total spend</span>
            </div>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* PANEL 4 — Fleet Summary (collapsible)                                */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <div className="bg-bg-secondary border border-border rounded-xl">
        <button
          onClick={() => setFleetOpen(!fleetOpen)}
          className="w-full flex items-center justify-between p-4 text-left hover:bg-bg-elevated/50 transition-colors rounded-xl"
        >
          <div className="flex items-center gap-2 text-sm font-semibold text-text-secondary">
            <Bot className="w-4 h-4" /> Fleet Summary
            <span className="text-xs text-text-muted font-normal">{Object.keys(fleetGroups).length} groups · {agents.length} agents</span>
          </div>
          {fleetOpen ? <ChevronUp className="w-4 h-4 text-text-muted" /> : <ChevronDown className="w-4 h-4 text-text-muted" />}
        </button>

        {fleetOpen && (
          <div className="px-4 pb-4">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-text-muted border-b border-border">
                  <th className="text-left py-2 font-medium">Group</th>
                  <th className="text-right py-2 font-medium">Agents</th>
                  <th className="text-right py-2 font-medium">Running</th>
                  <th className="text-right py-2 font-medium">Total Runs</th>
                  <th className="text-right py-2 font-medium">Total Cost</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(fleetGroups).sort((a, b) => b[1].totalCost - a[1].totalCost).map(([group, data]) => (
                  <tr key={group} className="border-b border-border/50 hover:bg-bg-elevated/30">
                    <td className="py-2 text-text-secondary">{group}</td>
                    <td className="py-2 text-right font-mono text-text-primary">{data.agents.length}</td>
                    <td className="py-2 text-right font-mono">
                      {data.running > 0
                        ? <span className="text-accent-success">{data.running}</span>
                        : <span className="text-text-muted">0</span>
                      }
                    </td>
                    <td className="py-2 text-right font-mono text-text-primary">{data.totalRuns}</td>
                    <td className="py-2 text-right font-mono text-text-primary">{fmt$(data.totalCost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* PANEL 5 — Quick Controls                                             */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <div className="bg-bg-secondary border border-border rounded-xl p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-text-secondary mb-4">
          <Settings className="w-4 h-4" /> Quick Controls
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {CONTROL_KEYS.map(({ key, label, prefix }) => {
            const current = settings[key]?.value ?? '--';
            const isEditing = key in editingSettings;
            const isSaving = savingKey === key;

            return (
              <div key={key} className="flex items-center gap-2 bg-bg-primary rounded-lg px-3 py-2">
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-text-muted">{label}</div>
                  {isEditing ? (
                    <input
                      type="text"
                      value={editingSettings[key]}
                      onChange={e => setEditingSettings(prev => ({ ...prev, [key]: e.target.value }))}
                      onKeyDown={e => e.key === 'Enter' && saveSetting(key)}
                      className="w-full bg-bg-secondary border border-border-focus rounded px-2 py-0.5 text-sm font-mono text-text-primary outline-none focus:border-accent-primary"
                      autoFocus
                    />
                  ) : (
                    <div
                      className="text-sm font-mono text-text-primary cursor-pointer hover:text-accent-primary transition-colors"
                      onClick={() => setEditingSettings(prev => ({ ...prev, [key]: current }))}
                      title="Click to edit"
                    >
                      {prefix || ''}{current}
                    </div>
                  )}
                </div>
                {isEditing && (
                  <button
                    onClick={() => saveSetting(key)}
                    disabled={isSaving}
                    className="p-1.5 rounded bg-accent-primary/20 text-accent-primary hover:bg-accent-primary/30 transition-colors disabled:opacity-50"
                    title="Save"
                  >
                    <Save className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
