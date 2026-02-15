/**
 * @file ScheduleCard.jsx
 * @description Display card for a scheduled job with next run preview.
 */

import React from 'react';
import { Clock, Play, Pause, Trash2, Calendar, Repeat } from 'lucide-react';
import Button from '@/components/ui/Button';
import StatusBadge from '@/components/ui/StatusBadge';

export default function ScheduleCard({ schedule, onToggle, onDelete, onEdit }) {
  const formatNextRun = (cronExpr) => {
    // Simplified - in production use a proper cron parser
    return 'Next run: In 2 hours (9:00 AM)';
  };

  const getFrequencyText = (cronExpr) => {
    if (!cronExpr) return 'Not configured';
    if (cronExpr === '0 * * * *') return 'Every hour';
    if (cronExpr === '0 9 * * *') return 'Daily at 9:00 AM';
    if (cronExpr === '0 9 * * 1-5') return 'Weekdays at 9:00 AM';
    return cronExpr;
  };

  return (
    <div className="bg-bg-secondary border border-border rounded-xl p-5 hover:border-accent-primary/30 transition-colors">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-start gap-3 flex-1">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
            schedule.enabled ? 'bg-accent-success/10' : 'bg-bg-elevated'
          }`}>
            <Clock size={20} className={schedule.enabled ? 'text-accent-success' : 'text-text-muted'} />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-text-primary mb-1">{schedule.name}</h3>
            <p className="text-sm text-text-secondary line-clamp-2">
              {schedule.description || 'No description'}
            </p>
          </div>
        </div>
        <StatusBadge status={schedule.enabled ? 'running' : 'idle'} />
      </div>

      {/* Schedule Info */}
      <div className="grid grid-cols-2 gap-3 mb-4 text-xs">
        <div>
          <span className="text-text-muted">Agent:</span>
          <div className="text-text-primary font-medium mt-0.5">
            {schedule.agentName || 'Not set'}
          </div>
        </div>
        <div>
          <span className="text-text-muted">Frequency:</span>
          <div className="text-text-primary font-medium mt-0.5">
            {getFrequencyText(schedule.cronExpression)}
          </div>
        </div>
        <div className="col-span-2">
          <span className="text-text-muted">Next Run:</span>
          <div className="text-accent-primary font-medium mt-0.5">
            {schedule.enabled ? formatNextRun(schedule.cronExpression) : 'Paused'}
          </div>
        </div>
      </div>

      {/* Message Preview */}
      {schedule.message && (
        <div className="p-3 bg-bg-elevated rounded-lg mb-4">
          <div className="text-xs text-text-muted mb-1">Task Message:</div>
          <div className="text-sm text-text-primary font-mono line-clamp-2">
            "{schedule.message}"
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-3 border-t border-border">
        <Button
          variant={schedule.enabled ? 'ghost' : 'primary'}
          size="sm"
          onClick={() => onToggle(schedule)}
        >
          {schedule.enabled ? <Pause size={14} /> : <Play size={14} />}
          {schedule.enabled ? 'Pause' : 'Resume'}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => onEdit(schedule)}>
          Edit
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            if (confirm(`Delete schedule "${schedule.name}"?`)) {
              onDelete(schedule.id);
            }
          }}
          className="ml-auto hover:text-accent-danger"
        >
          <Trash2 size={14} />
        </Button>
      </div>
    </div>
  );
}
