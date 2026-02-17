/**
 * @file SchedulePage.jsx
 * @description Comprehensive scheduler portal - create and manage automated agent runs.
 */

import React, { useEffect, useState } from 'react';
import { Plus, Clock, Calendar, Search } from 'lucide-react';
import { api } from '@/lib/api';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import ScheduleCard from '@/components/scheduler/ScheduleCard';
import CronBuilder from '@/components/scheduler/CronBuilder';
import ConfirmationDialog from '@/components/safety/ConfirmationDialog';

export default function SchedulePage() {
  const [schedules, setSchedules] = useState([]);
  const [agents, setAgents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewScheduleForm, setShowNewScheduleForm] = useState(false);

  // Run Now state
  const [pendingRun, setPendingRun] = useState(null);
  const [runningSchedule, setRunningSchedule] = useState(null);
  const [runResult, setRunResult] = useState(null);
  const [runError, setRunError] = useState('');

  useEffect(() => {
    fetchSchedules();
    fetchAgents();
  }, []);

  const fetchSchedules = async () => {
    setIsLoading(true);
    try {
      // TODO: Replace with real cron API when implemented
      const data = await api.get('/schedules');
      setSchedules(data.schedules || []);
    } catch (error) {
      console.error('[SchedulePage] Failed to fetch schedules:', error);
      setSchedules([]); // Empty for now
    } finally {
      setIsLoading(false);
    }
  };

  const fetchAgents = async () => {
    try {
      const data = await api.get('/agents');
      setAgents(data.agents || []);
    } catch (error) {
      console.error('[SchedulePage] Failed to fetch agents:', error);
    }
  };

  const handleToggleSchedule = async (schedule) => {
    try {
      await api.put(`/schedules/${schedule.id}`, {
        enabled: !schedule.enabled,
      });
      fetchSchedules();
    } catch (error) {
      console.error('[SchedulePage] Failed to toggle schedule:', error);
    }
  };

  const handleDeleteSchedule = async (scheduleId) => {
    try {
      await api.del(`/schedules/${scheduleId}`);
      setSchedules(schedules.filter(s => s.id !== scheduleId));
    } catch (error) {
      console.error('[SchedulePage] Failed to delete schedule:', error);
    }
  };

  const handleRunNow = async (schedule) => {
    setRunError('');
    setRunResult(null);
    setRunningSchedule(schedule);
    try {
      const data = await api.post(`/schedules/${schedule.id}/run`);
      if (data.confirmation_required) {
        setPendingRun(data.run);
      }
    } catch (err) {
      setRunError(err.message || 'Failed to start run');
      setRunningSchedule(null);
    }
  };

  const handleConfirmRun = async () => {
    if (!pendingRun) return;
    const runId = pendingRun.id;
    setPendingRun(null);
    try {
      const data = await api.post(`/runs/${runId}/confirm`);
      setRunResult({ schedule: runningSchedule, data });
    } catch (err) {
      setRunError(err.message || 'Agent run failed');
    } finally {
      setRunningSchedule(null);
    }
  };

  const handleCancelRun = async () => {
    if (pendingRun) {
      try { await api.post(`/runs/${pendingRun.id}/cancel`); } catch (_) {}
    }
    setPendingRun(null);
    setRunningSchedule(null);
    setRunError('');
  };

  const filteredSchedules = schedules.filter(schedule =>
    schedule.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    schedule.agentName?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b border-border bg-bg-secondary px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-semibold text-text-primary">Scheduler</h1>
            <p className="text-sm text-text-secondary mt-1">
              Automate agent runs with cron schedules
            </p>
          </div>
          <Button
            variant="primary"
            onClick={() => setShowNewScheduleForm(true)}
          >
            <Plus size={16} />
            New Schedule
          </Button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <Input
            type="text"
            placeholder="Search schedules..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Schedule Grid */}
      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-text-muted">Loading schedules...</div>
          </div>
        ) : filteredSchedules.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center space-y-4 max-w-md">
              <div className="w-16 h-16 mx-auto bg-accent-primary/10 rounded-2xl flex items-center justify-center">
                <Clock size={32} className="text-accent-primary" />
              </div>
              <h3 className="text-lg font-semibold text-text-primary">
                {searchQuery ? 'No schedules found' : 'No schedules yet'}
              </h3>
              <p className="text-sm text-text-secondary">
                {searchQuery
                  ? 'No schedules match your search.'
                  : 'Create your first schedule to automate agent runs.'}
              </p>
              {!searchQuery && (
                <Button
                  variant="primary"
                  onClick={() => setShowNewScheduleForm(true)}
                >
                  <Plus size={16} />
                  Create First Schedule
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {/* Column headers */}
            <div className="flex items-center gap-4 px-4 py-1.5 text-xs text-text-muted uppercase tracking-wider">
              <div className="w-2.5 shrink-0" />
              <div className="w-8 shrink-0" />
              <div className="flex-1">Schedule / Agent</div>
              <div className="hidden md:block w-20 text-right">Last Run</div>
              <div className="w-28 shrink-0" />
            </div>
            {filteredSchedules.map((schedule) => (
              <ScheduleCard
                key={schedule.id}
                schedule={schedule}
                onToggle={handleToggleSchedule}
                onDelete={handleDeleteSchedule}
                onEdit={() => console.log('Edit schedule:', schedule)}
                onRunNow={handleRunNow}
              />
            ))}
          </div>
        )}
      </div>

      {/* Run Now: error banner */}
      {runError && (
        <div className="fixed bottom-4 right-4 bg-accent-danger/10 border border-accent-danger text-accent-danger px-4 py-3 rounded-lg text-sm max-w-md z-40">
          <strong>Run failed:</strong> {runError}
          <button onClick={() => setRunError('')} className="ml-3 underline">Dismiss</button>
        </div>
      )}

      {/* Run Now: success banner */}
      {runResult && (
        <div className="fixed bottom-4 right-4 bg-accent-success/10 border border-accent-success text-accent-success px-4 py-3 rounded-lg text-sm max-w-md z-40">
          <strong>{runResult.schedule?.name}</strong> started successfully.
          <button onClick={() => setRunResult(null)} className="ml-3 underline">Dismiss</button>
        </div>
      )}

      {/* Run Now: Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={!!pendingRun}
        title="Confirm Agent Run"
        message={
          runningSchedule ? (
            <>
              <p className="mb-3">Run <strong>{runningSchedule.agentName}</strong> now using the schedule message for:</p>
              <p className="font-semibold text-text-primary mb-3">"{runningSchedule.name}"</p>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-text-muted">Estimated cost:</span>
                  <span className="text-text-primary font-medium">~$0.022</span>
                </div>
                {pendingRun && (
                  <div className="flex justify-between">
                    <span className="text-text-muted">Run ID:</span>
                    <span className="text-text-primary font-mono text-xs">{pendingRun.id.substring(0, 8)}...</span>
                  </div>
                )}
              </div>
            </>
          ) : 'Confirm agent run'
        }
        confirmText="Run Agent"
        cancelText="Cancel"
        onConfirm={handleConfirmRun}
        onCancel={handleCancelRun}
        variant="warning"
      />

      {/* New Schedule Modal */}
      {showNewScheduleForm && (
        <NewScheduleModal
          agents={agents}
          onClose={() => setShowNewScheduleForm(false)}
          onSuccess={() => {
            setShowNewScheduleForm(false);
            fetchSchedules();
          }}
        />
      )}
    </div>
  );
}

/** New schedule creation modal */
function NewScheduleModal({ agents, onClose, onSuccess }) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    agentId: '',
    message: '',
    cronExpression: '0 9 * * *',
    enabled: true,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      await api.post('/schedules', formData);
      onSuccess();
    } catch (error) {
      console.error('[NewScheduleModal] Failed to create schedule:', error);
      alert('Failed to create schedule: ' + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-bg-primary border border-border rounded-xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-xl font-semibold text-text-primary mb-6">Create New Schedule</h2>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Info */}
          <div className="space-y-4">
            <Input
              label="Schedule Name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Daily Invoice Check"
              required
            />

            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="What does this schedule do?"
                rows={2}
                className="w-full px-3 py-2 bg-bg-elevated border border-border rounded-lg text-sm text-text-primary"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                Agent
              </label>
              <select
                value={formData.agentId}
                onChange={(e) => setFormData({ ...formData, agentId: e.target.value })}
                className="w-full px-3 py-2 bg-bg-elevated border border-border rounded-lg text-sm text-text-primary"
                required
              >
                <option value="">Select an agent...</option>
                {agents.map(agent => (
                  <option key={agent.id} value={agent.id}>{agent.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                Task Message
              </label>
              <textarea
                value={formData.message}
                onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                placeholder="What should the agent do when this schedule runs?"
                rows={3}
                className="w-full px-3 py-2 bg-bg-elevated border border-border rounded-lg text-sm text-text-primary"
                required
              />
            </div>
          </div>

          {/* Cron Builder */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-3">
              Schedule
            </label>
            <CronBuilder
              value={formData.cronExpression}
              onChange={(expr) => setFormData({ ...formData, cronExpression: expr })}
            />
          </div>

          {/* Enabled Toggle */}
          <div className="flex items-center gap-3 p-4 bg-bg-elevated rounded-lg">
            <input
              type="checkbox"
              checked={formData.enabled}
              onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
              className="w-4 h-4"
            />
            <div className="flex-1">
              <div className="text-sm font-medium text-text-primary">Start Immediately</div>
              <div className="text-xs text-text-muted">
                Schedule will begin running as soon as it's created
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-4 border-t border-border">
            <Button
              type="submit"
              variant="primary"
              disabled={isSubmitting || !formData.name || !formData.agentId || !formData.message}
              className="flex-1"
            >
              {isSubmitting ? 'Creating...' : 'Create Schedule'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
