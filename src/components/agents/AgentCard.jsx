/**
 * @file AgentCard.jsx
 * @description Compact list-row agent display with inline actions.
 */

import React from 'react';
import { Bot, Play, Trash2, Edit, RefreshCw, CheckCircle, XCircle, Clock, Zap } from 'lucide-react';
import Button from '@/components/ui/Button';

const STATUS_CONFIG = {
  active:  { dot: 'bg-emerald-400', label: 'Active',  text: 'text-emerald-400' },
  idle:    { dot: 'bg-slate-400',   label: 'Idle',    text: 'text-slate-400'   },
  running: { dot: 'bg-blue-400 animate-pulse', label: 'Running', text: 'text-blue-400' },
  error:   { dot: 'bg-red-400',     label: 'Error',   text: 'text-red-400'     },
  paused:  { dot: 'bg-amber-400',   label: 'Paused',  text: 'text-amber-400'   },
};

export default function AgentCard({ agent, onRun, onEdit, onDelete, onRegister }) {
  const config = (() => {
    try { return typeof agent.config === 'string' ? JSON.parse(agent.config) : agent.config || {}; }
    catch { return {}; }
  })();

  const isRegistered = !!(config.openclaw_id || config.special_handler);
  const statusCfg = STATUS_CONFIG[agent.status] || STATUS_CONFIG.idle;
  const lastRun = agent.last_run_at
    ? new Date(agent.last_run_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : 'Never';

  return (
    <div className="flex items-center gap-4 px-4 py-3 bg-bg-secondary border border-border rounded-lg hover:border-accent-primary/40 hover:bg-bg-elevated transition-all group">

      {/* Status dot */}
      <div className="shrink-0 flex flex-col items-center gap-1">
        <div className={`w-2.5 h-2.5 rounded-full ${statusCfg.dot}`} title={statusCfg.label} />
      </div>

      {/* Agent icon */}
      <div className="w-8 h-8 rounded-lg bg-accent-info/10 flex items-center justify-center shrink-0">
        <Bot size={16} className="text-accent-info" />
      </div>

      {/* Name + description */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-text-primary text-sm truncate">{agent.name}</span>
          {!isRegistered && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20 shrink-0">
              Not registered
            </span>
          )}
        </div>
        <p className="text-xs text-text-muted truncate mt-0.5">
          {agent.description || 'No description'}
        </p>
      </div>

      {/* Stats */}
      <div className="hidden md:flex items-center gap-5 text-xs text-text-muted shrink-0">
        <div className="text-center">
          <div className="text-text-primary font-medium">{agent.total_runs || 0}</div>
          <div>runs</div>
        </div>
        <div className="text-center">
          <div className="text-text-primary font-medium">
            {agent.success_rate ? `${(agent.success_rate * 100).toFixed(0)}%` : '—'}
          </div>
          <div>success</div>
        </div>
        <div className="text-right">
          <div className="text-text-primary font-medium">{lastRun}</div>
          <div>last run</div>
        </div>
      </div>

      {/* Actions — visible on hover */}
      <div className="flex items-center gap-1 shrink-0 opacity-60 group-hover:opacity-100 transition-opacity">
        {isRegistered ? (
          <button
            onClick={() => onRun(agent)}
            title="Run agent"
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md bg-accent-primary/10 text-accent-primary hover:bg-accent-primary/20 transition-colors"
          >
            <Zap size={12} />
            Run
          </button>
        ) : (
          <button
            onClick={() => onRegister && onRegister(agent)}
            title="Register agent"
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md bg-bg-elevated text-text-secondary hover:text-text-primary transition-colors"
          >
            <RefreshCw size={12} />
            Register
          </button>
        )}
        <button
          onClick={() => onEdit(agent)}
          title="Edit"
          className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-colors"
        >
          <Edit size={13} />
        </button>
        <button
          onClick={() => { if (confirm(`Delete "${agent.name}"?`)) onDelete(agent.id); }}
          title="Delete"
          className="p-1.5 rounded-md text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}
