/**
 * @file PendingRunsPage.jsx
 * @description Pending runs queue - review and bulk-approve pending agent runs.
 *
 * Shows all runs with status='pending' in a table with bulk approve,
 * individual confirm/cancel, and a progress bar during bulk operations.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { Clock, CheckCircle, XCircle, PlayCircle, Loader, AlertCircle } from 'lucide-react';
import { api } from '@/lib/api';
import Button from '@/components/ui/Button';

export default function PendingRunsPage() {
  const [runs, setRuns] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [bulkInProgress, setBulkInProgress] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0 });
  const [bulkResult, setBulkResult] = useState(null); // { success, failed }
  const [actionInProgress, setActionInProgress] = useState({}); // { [runId]: 'confirm' | 'cancel' }

  const fetchRuns = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await api.get('/runs?status=pending&limit=100');
      setRuns(data.runs || []);
    } catch (error) {
      console.error('[PendingRunsPage] Failed to fetch runs:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRuns();
  }, [fetchRuns]);

  /** Confirm a single run */
  const handleConfirm = async (runId) => {
    setActionInProgress((prev) => ({ ...prev, [runId]: 'confirm' }));
    try {
      await api.post(`/runs/${runId}/confirm`);
      setRuns((prev) => prev.filter((r) => r.id !== runId));
    } catch (error) {
      console.error(`[PendingRunsPage] Failed to confirm run ${runId}:`, error);
      alert(`Failed to confirm run: ${error.message}`);
    } finally {
      setActionInProgress((prev) => {
        const next = { ...prev };
        delete next[runId];
        return next;
      });
    }
  };

  /** Cancel a single run */
  const handleCancel = async (runId) => {
    setActionInProgress((prev) => ({ ...prev, [runId]: 'cancel' }));
    try {
      await api.post(`/runs/${runId}/cancel`);
      setRuns((prev) => prev.filter((r) => r.id !== runId));
    } catch (error) {
      console.error(`[PendingRunsPage] Failed to cancel run ${runId}:`, error);
      alert(`Failed to cancel run: ${error.message}`);
    } finally {
      setActionInProgress((prev) => {
        const next = { ...prev };
        delete next[runId];
        return next;
      });
    }
  };

  /** Approve all pending runs sequentially */
  const handleApproveAll = async () => {
    if (runs.length === 0) return;
    if (!window.confirm(`Approve all ${runs.length} pending runs?`)) return;

    setBulkInProgress(true);
    setBulkResult(null);
    setBulkProgress({ current: 0, total: runs.length });

    let success = 0;
    let failed = 0;

    for (let i = 0; i < runs.length; i++) {
      const run = runs[i];
      setBulkProgress({ current: i + 1, total: runs.length });
      try {
        await api.post(`/runs/${run.id}/confirm`);
        success++;
      } catch (error) {
        console.error(`[PendingRunsPage] Failed to confirm run ${run.id}:`, error);
        failed++;
      }
    }

    setBulkInProgress(false);
    setBulkResult({ success, failed });

    // Refresh the list
    await fetchRuns();
  };

  /** Truncate message text for display */
  const truncate = (text, maxLen = 80) => {
    if (!text) return '—';
    return text.length > maxLen ? text.slice(0, maxLen) + '...' : text;
  };

  /** Format a timestamp for display */
  const formatDate = (ts) => {
    if (!ts) return '—';
    try {
      return new Date(ts).toLocaleString();
    } catch {
      return ts;
    }
  };

  const progressPct = bulkProgress.total > 0
    ? Math.round((bulkProgress.current / bulkProgress.total) * 100)
    : 0;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Clock size={24} className="text-accent-warning" />
          <div>
            <h1 className="text-xl font-semibold text-text-primary">Pending Runs</h1>
            <p className="text-sm text-text-muted">
              {runs.length} run{runs.length !== 1 ? 's' : ''} awaiting approval
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={fetchRuns}
            disabled={isLoading || bulkInProgress}
            variant="secondary"
            size="sm"
          >
            Refresh
          </Button>
          <Button
            onClick={handleApproveAll}
            disabled={runs.length === 0 || bulkInProgress}
            variant="primary"
            size="sm"
          >
            <CheckCircle size={16} className="mr-1" />
            Approve All ({runs.length})
          </Button>
        </div>
      </div>

      {/* Bulk progress bar */}
      {bulkInProgress && (
        <div className="bg-bg-secondary border border-border rounded-lg p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm text-text-secondary">
            <Loader size={16} className="animate-spin text-accent-primary" />
            <span>
              Approving runs... {bulkProgress.current} / {bulkProgress.total}
            </span>
          </div>
          <div className="w-full bg-bg-elevated rounded-full h-2 overflow-hidden">
            <div
              className="h-full bg-accent-primary rounded-full transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      )}

      {/* Bulk result summary */}
      {bulkResult && (
        <div className={`
          border rounded-lg p-4 flex items-center gap-3 text-sm
          ${bulkResult.failed > 0
            ? 'bg-accent-danger/10 border-accent-danger/30 text-accent-danger'
            : 'bg-accent-success/10 border-accent-success/30 text-accent-success'
          }
        `}>
          {bulkResult.failed > 0
            ? <AlertCircle size={18} />
            : <CheckCircle size={18} />
          }
          <span>
            Bulk approval complete: {bulkResult.success} confirmed, {bulkResult.failed} failed.
          </span>
          <button
            onClick={() => setBulkResult(null)}
            className="ml-auto text-text-muted hover:text-text-primary"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-text-muted">
          <Loader size={24} className="animate-spin mr-2" />
          Loading pending runs...
        </div>
      ) : runs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-text-muted">
          <CheckCircle size={40} className="mb-3 text-accent-success" />
          <p className="text-lg font-medium text-text-secondary">No pending runs</p>
          <p className="text-sm">All runs have been reviewed.</p>
        </div>
      ) : (
        <div className="bg-bg-secondary border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-text-muted text-left">
                <th className="px-4 py-3 font-medium">Agent Name</th>
                <th className="px-4 py-3 font-medium">Message</th>
                <th className="px-4 py-3 font-medium">Created At</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr
                  key={run.id}
                  className="border-b border-border last:border-0 hover:bg-bg-elevated transition-colors"
                >
                  <td className="px-4 py-3 text-text-primary font-medium whitespace-nowrap">
                    {run.agent_name || run.agent_id || '—'}
                  </td>
                  <td className="px-4 py-3 text-text-secondary max-w-md">
                    <span title={run.message || run.input || ''}>
                      {truncate(run.message || run.input)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-text-muted whitespace-nowrap">
                    {formatDate(run.created_at)}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleConfirm(run.id)}
                        disabled={!!actionInProgress[run.id] || bulkInProgress}
                        className="
                          inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium
                          bg-accent-success/10 text-accent-success
                          hover:bg-accent-success/20 transition-colors
                          disabled:opacity-50 disabled:cursor-not-allowed
                        "
                        title="Confirm this run"
                      >
                        {actionInProgress[run.id] === 'confirm' ? (
                          <Loader size={14} className="animate-spin" />
                        ) : (
                          <PlayCircle size={14} />
                        )}
                        Confirm
                      </button>
                      <button
                        onClick={() => handleCancel(run.id)}
                        disabled={!!actionInProgress[run.id] || bulkInProgress}
                        className="
                          inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium
                          bg-accent-danger/10 text-accent-danger
                          hover:bg-accent-danger/20 transition-colors
                          disabled:opacity-50 disabled:cursor-not-allowed
                        "
                        title="Cancel this run"
                      >
                        {actionInProgress[run.id] === 'cancel' ? (
                          <Loader size={14} className="animate-spin" />
                        ) : (
                          <XCircle size={14} />
                        )}
                        Cancel
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
