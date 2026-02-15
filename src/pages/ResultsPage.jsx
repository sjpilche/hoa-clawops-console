/**
 * @file ResultsPage.jsx
 * @description Data explorer - browse, filter, and export agent run results.
 */

import React, { useEffect, useState } from 'react';
import { Database, Download, Search, Filter, FileJson, FileSpreadsheet, ChevronDown, ChevronRight, X } from 'lucide-react';
import { api } from '@/lib/api';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import StatusBadge from '@/components/ui/StatusBadge';

export default function ResultsPage() {
  const [runs, setRuns] = useState([]);
  const [filteredRuns, setFilteredRuns] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [expandedRun, setExpandedRun] = useState(null);

  useEffect(() => {
    fetchRuns();
  }, []);

  useEffect(() => {
    filterRuns();
  }, [runs, searchQuery, statusFilter]);

  const fetchRuns = async () => {
    setIsLoading(true);
    try {
      const data = await api.get('/runs?limit=100');
      setRuns(data.runs || []);
    } catch (error) {
      console.error('[ResultsPage] Failed to fetch runs:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const filterRuns = () => {
    let filtered = [...runs];

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(run => run.status === statusFilter);
    }

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(run =>
        run.agent_name?.toLowerCase().includes(query) ||
        run.agent_id?.toLowerCase().includes(query) ||
        run.status?.toLowerCase().includes(query) ||
        run.trigger?.toLowerCase().includes(query)
      );
    }

    setFilteredRuns(filtered);
  };

  const exportToCSV = () => {
    const headers = ['Date', 'Agent', 'Status', 'Trigger', 'Duration (s)', 'Tokens', 'Cost ($)'];
    const rows = filteredRuns.map(run => [
      new Date(run.created_at).toLocaleString(),
      run.agent_name || run.agent_id,
      run.status,
      run.trigger,
      run.duration_ms ? (run.duration_ms / 1000).toFixed(1) : 'N/A',
      run.tokens_used || 0,
      run.cost_usd?.toFixed(4) || '0.0000',
    ]);

    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    downloadFile(csv, 'openclaw-results.csv', 'text/csv');
  };

  const exportToJSON = () => {
    const json = JSON.stringify(filteredRuns, null, 2);
    downloadFile(json, 'openclaw-results.json', 'application/json');
  };

  const downloadFile = (content, filename, mimeType) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const totalCost = filteredRuns.reduce((sum, run) => sum + (run.cost_usd || 0), 0);
  const totalTokens = filteredRuns.reduce((sum, run) => sum + (run.tokens_used || 0), 0);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b border-border bg-bg-secondary px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-semibold text-text-primary">Results</h1>
            <p className="text-sm text-text-secondary mt-1">
              Browse and export agent run results
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={exportToCSV}>
              <FileSpreadsheet size={16} />
              Export CSV
            </Button>
            <Button variant="outline" size="sm" onClick={exportToJSON}>
              <FileJson size={16} />
              Export JSON
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-4">
          {/* Search */}
          <div className="flex-1 relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <Input
              type="text"
              placeholder="Search by agent name or status..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 bg-bg-elevated border border-border rounded-lg text-sm text-text-primary"
          >
            <option value="all">All Status</option>
            <option value="completed">Completed</option>
            <option value="success">Success</option>
            <option value="running">Running</option>
            <option value="failed">Failed</option>
            <option value="cancelled">Cancelled</option>
          </select>

          <button
            onClick={fetchRuns}
            className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            Refresh
          </button>
        </div>

        {/* Summary Stats */}
        <div className="flex items-center gap-6 mt-4 text-xs text-text-muted">
          <div>
            <span className="font-medium text-text-primary">{filteredRuns.length}</span> results
          </div>
          <div>
            Total cost: <span className="font-medium text-text-primary">${totalCost.toFixed(4)}</span>
          </div>
          <div>
            Total tokens: <span className="font-medium text-text-primary">{totalTokens.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* Results Table */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-text-muted">Loading results...</div>
          </div>
        ) : filteredRuns.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center space-y-3">
              <Database size={48} className="mx-auto text-text-muted" />
              <h3 className="text-lg font-semibold text-text-primary">
                {searchQuery || statusFilter !== 'all' ? 'No results found' : 'No runs yet'}
              </h3>
              <p className="text-sm text-text-secondary max-w-md">
                {searchQuery || statusFilter !== 'all'
                  ? 'Try adjusting your filters or search query.'
                  : 'Run some agents to see results here.'}
              </p>
            </div>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-bg-secondary sticky top-0 z-10">
              <tr className="text-left text-xs text-text-muted uppercase tracking-wider">
                <th className="px-6 py-3 font-medium w-8"></th>
                <th className="px-6 py-3 font-medium">Date</th>
                <th className="px-6 py-3 font-medium">Agent</th>
                <th className="px-6 py-3 font-medium">Trigger</th>
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 font-medium">Duration</th>
                <th className="px-6 py-3 font-medium">Tokens</th>
                <th className="px-6 py-3 font-medium">Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredRuns.map((run) => (
                <ResultRow
                  key={run.id}
                  run={run}
                  isExpanded={expandedRun === run.id}
                  onToggle={() => setExpandedRun(expandedRun === run.id ? null : run.id)}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function ResultRow({ run, isExpanded, onToggle }) {
  const formatDate = (timestamp) => {
    return new Date(timestamp).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDuration = (ms) => {
    if (!ms) return 'N/A';
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  // Parse result_data for expandable output
  const resultData = (() => {
    try {
      return typeof run.result_data === 'string' ? JSON.parse(run.result_data) : run.result_data || {};
    } catch { return {}; }
  })();

  return (
    <>
      <tr
        className="hover:bg-bg-elevated transition-colors cursor-pointer"
        onClick={onToggle}
      >
        <td className="pl-6 py-4 text-text-muted">
          {isExpanded
            ? <ChevronDown size={14} />
            : <ChevronRight size={14} />
          }
        </td>
        <td className="px-6 py-4 text-sm text-text-secondary">
          {formatDate(run.created_at)}
        </td>
        <td className="px-6 py-4 text-sm text-text-primary font-medium">
          {run.agent_name || run.agent_id?.substring(0, 8) || 'Unknown'}
        </td>
        <td className="px-6 py-4 text-xs text-text-muted capitalize">
          {run.trigger || 'manual'}
        </td>
        <td className="px-6 py-4">
          <StatusBadge status={run.status} />
        </td>
        <td className="px-6 py-4 text-sm text-text-secondary">
          {formatDuration(run.duration_ms)}
        </td>
        <td className="px-6 py-4 text-sm text-text-secondary font-data">
          {(run.tokens_used || 0).toLocaleString()}
        </td>
        <td className="px-6 py-4 text-sm text-accent-success font-data">
          ${(run.cost_usd || 0).toFixed(4)}
        </td>
      </tr>

      {/* Expanded row — shows agent output */}
      {isExpanded && (
        <tr>
          <td colSpan={8} className="px-6 py-4 bg-bg-elevated border-b border-border">
            <div className="space-y-3">
              {/* Message sent */}
              {resultData.message && (
                <div>
                  <div className="text-xs font-medium text-text-muted uppercase mb-1">Task Message</div>
                  <div className="text-sm text-text-secondary bg-bg-secondary rounded-lg px-3 py-2">
                    {resultData.message}
                  </div>
                </div>
              )}

              {/* Agent output */}
              {resultData.outputText && (
                <div>
                  <div className="text-xs font-medium text-text-muted uppercase mb-1">Agent Output</div>
                  <div className="text-sm text-text-primary bg-bg-secondary rounded-lg px-3 py-2 whitespace-pre-wrap">
                    {resultData.outputText}
                  </div>
                </div>
              )}

              {/* Run metadata */}
              <div className="flex items-center gap-4 text-xs text-text-muted">
                <span>Run ID: {run.id}</span>
                {resultData.sessionId && <span>Session: {resultData.sessionId.substring(0, 24)}...</span>}
                {run.started_at && <span>Started: {formatDate(run.started_at)}</span>}
                {run.completed_at && <span>Completed: {formatDate(run.completed_at)}</span>}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
