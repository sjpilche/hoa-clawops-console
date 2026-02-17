/**
 * @file ScheduleCard.jsx
 * @description Compact list-row schedule display with inline actions.
 */

import React from 'react';
import { Clock, Play, Pause, Trash2, Zap, Calendar } from 'lucide-react';

const CRON_LABELS = {
  '0 * * * *':     'Every hour',
  '0 8 * * 1':     'Mon 8:00 AM',
  '30 8 * * 1':    'Mon 8:30 AM',
  '45 9 * * *':    'Daily 9:45 AM',
  '0 10 * * *':    'Daily 10:00 AM',
  '0 9 * * *':     'Daily 9:00 AM',
  '0 9 * * 1-5':   'Weekdays 9:00 AM',
  '0 8 * * *':     'Daily 8:00 AM',
};

function friendlyCron(expr) {
  if (!expr) return 'Not configured';
  return CRON_LABELS[expr] || expr;
}

function friendlyLastRun(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now - d;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 2)   return 'Just now';
  if (diffMins < 60)  return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7)   return `${diffDays}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function ScheduleCard({ schedule, onToggle, onDelete, onEdit, onRunNow }) {
  const lastRunText = friendlyLastRun(schedule.lastRunAt);

  return (
    <div className={`flex items-center gap-4 px-4 py-3 border rounded-lg transition-all group ${
      schedule.enabled
        ? 'bg-bg-secondary border-border hover:border-accent-primary/40 hover:bg-bg-elevated'
        : 'bg-bg-elevated/50 border-border/50 opacity-60 hover:opacity-80'
    }`}>

      {/* Enabled indicator */}
      <div className="shrink-0">
        <div className={`w-2.5 h-2.5 rounded-full ${schedule.enabled ? 'bg-emerald-400' : 'bg-slate-500'}`} />
      </div>

      {/* Clock icon */}
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
        schedule.enabled ? 'bg-accent-success/10' : 'bg-bg-elevated'
      }`}>
        <Clock size={15} className={schedule.enabled ? 'text-accent-success' : 'text-text-muted'} />
      </div>

      {/* Name + agent */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-text-primary text-sm truncate">{schedule.name}</span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-text-muted truncate">{schedule.agentName || 'No agent'}</span>
          <span className="text-text-muted/40">·</span>
          <span className="text-xs text-accent-primary font-medium shrink-0">
            {friendlyCron(schedule.cronExpression)}
          </span>
        </div>
      </div>

      {/* Last run */}
      <div className="hidden md:block text-right shrink-0 min-w-[80px]">
        {lastRunText ? (
          <>
            <div className="text-xs text-text-primary font-medium">{lastRunText}</div>
            <div className="text-xs text-text-muted">last run</div>
          </>
        ) : (
          <div className="text-xs text-text-muted">Never run</div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0 opacity-60 group-hover:opacity-100 transition-opacity">
        {onRunNow && (
          <button
            onClick={() => onRunNow(schedule)}
            title="Run now"
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md bg-accent-primary/10 text-accent-primary hover:bg-accent-primary/20 transition-colors"
          >
            <Zap size={12} />
            Run
          </button>
        )}
        <button
          onClick={() => onToggle(schedule)}
          title={schedule.enabled ? 'Pause' : 'Resume'}
          className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-colors"
        >
          {schedule.enabled ? <Pause size={13} /> : <Play size={13} />}
        </button>
        <button
          onClick={() => onEdit(schedule)}
          title="Edit"
          className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-colors text-xs font-medium px-2"
        >
          Edit
        </button>
        <button
          onClick={() => { if (confirm(`Delete "${schedule.name}"?`)) onDelete(schedule.id); }}
          title="Delete"
          className="p-1.5 rounded-md text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}
