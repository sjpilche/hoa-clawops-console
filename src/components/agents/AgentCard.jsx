/**
 * @file AgentCard.jsx
 * @description Card displaying agent information with actions.
 */

import React from 'react';
import { Bot, Play, Trash2, Edit, CalendarClock, AlertCircle, CheckCircle, RefreshCw } from 'lucide-react';
import StatusBadge from '@/components/ui/StatusBadge';
import Button from '@/components/ui/Button';

export default function AgentCard({ agent, onRun, onEdit, onDelete, onRegister }) {
  // Parse config to check for schedule and registration
  const config = (() => {
    try {
      return typeof agent.config === 'string' ? JSON.parse(agent.config) : agent.config || {};
    } catch { return {}; }
  })();
  const schedule = config.task?.schedule;
  const isScheduled = schedule?.enabled && schedule?.cron;
  const isRegistered = !!config.openclaw_id;

  return (
    <div className="bg-bg-secondary border border-border rounded-xl p-5 hover:border-accent-primary/30 transition-colors group">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-start gap-3 flex-1">
          <div className="w-10 h-10 rounded-lg bg-accent-info/10 flex items-center justify-center shrink-0">
            <Bot size={20} className="text-accent-info" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-text-primary mb-1">{agent.name}</h3>
            <p className="text-sm text-text-secondary line-clamp-2">
              {agent.description || 'No description'}
            </p>
          </div>
        </div>
        <StatusBadge status={agent.status || 'idle'} />
      </div>

      {/* Metadata */}
      <div className="grid grid-cols-2 gap-3 mb-4 text-xs">
        <div>
          <span className="text-text-muted">Target:</span>
          <div className="text-text-primary font-medium mt-0.5">
            {agent.target_system || 'Not set'}
          </div>
        </div>
        <div>
          <span className="text-text-muted">Permissions:</span>
          <div className="text-text-primary font-medium mt-0.5">
            {agent.permissions || 'read-only'}
          </div>
        </div>
        <div>
          <span className="text-text-muted">Success Rate:</span>
          <div className="text-text-primary font-medium mt-0.5">
            {agent.success_rate ? `${(agent.success_rate * 100).toFixed(0)}%` : 'N/A'}
          </div>
        </div>
        <div>
          <span className="text-text-muted">Total Runs:</span>
          <div className="text-text-primary font-medium mt-0.5">
            {agent.total_runs || 0}
          </div>
        </div>
      </div>

      {/* Registration status */}
      {!isRegistered && (
        <div className="flex items-center gap-1.5 mb-3 px-2 py-1.5 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-400">
          <AlertCircle size={12} />
          <span className="font-medium">Not Registered</span>
          <span className="text-text-muted ml-1">— cannot run</span>
        </div>
      )}

      {/* Schedule indicator */}
      {isScheduled && (
        <div className="flex items-center gap-1.5 mb-3 px-2 py-1.5 bg-accent-primary/10 border border-accent-primary/20 rounded-lg text-xs text-accent-primary">
          <CalendarClock size={12} />
          <span className="font-medium">Scheduled</span>
          <span className="text-text-muted ml-1">{schedule.cron}</span>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-3 border-t border-border">
        {isRegistered ? (
          <Button
            variant="primary"
            size="sm"
            onClick={() => onRun(agent)}
            className="flex-1"
          >
            <Play size={14} />
            Run Agent
          </Button>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onRegister && onRegister(agent)}
            className="flex-1"
          >
            <RefreshCw size={14} />
            Register
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onEdit(agent)}
        >
          <Edit size={14} />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            if (confirm(`Delete "${agent.name}"? This cannot be undone.`)) {
              onDelete(agent.id);
            }
          }}
          className="hover:text-accent-danger"
        >
          <Trash2 size={14} />
        </Button>
      </div>
    </div>
  );
}
