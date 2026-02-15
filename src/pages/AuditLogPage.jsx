/**
 * @file AuditLogPage.jsx
 * @description View and filter audit logs for security monitoring
 */

import { useState, useEffect } from 'react';
import { Shield, AlertCircle, CheckCircle, Filter, Download } from 'lucide-react';

export default function AuditLogPage() {
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({
    outcome: 'all',
    action: '',
    limit: 100,
  });

  // Fetch audit logs
  useEffect(() => {
    fetchLogs();
    fetchStats();
  }, [filter]);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();

      if (filter.outcome !== 'all') {
        params.append('outcome', filter.outcome);
      }
      if (filter.action) {
        params.append('action', filter.action);
      }
      params.append('limit', filter.limit);

      const response = await fetch(`/api/audit?${params}`);
      const data = await response.json();

      if (data.success) {
        setLogs(data.logs);
      }
    } catch (error) {
      console.error('Failed to fetch audit logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await fetch('/api/audit/stats');
      const data = await response.json();

      if (data.success) {
        setStats(data.stats);
      }
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  };

  const exportLogs = () => {
    const csv = logsToCSV(logs);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-logs-${new Date().toISOString()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const logsToCSV = (logs) => {
    const headers = ['Timestamp', 'Action', 'Outcome', 'IP Address', 'Status Code', 'Duration'];
    const rows = logs.map(log => [
      log.timestamp,
      log.action,
      log.outcome,
      log.ip_address,
      log.details?.statusCode || '',
      log.details?.durationMs || '',
    ]);

    return [headers, ...rows].map(row => row.join(',')).join('\n');
  };

  const formatDate = (isoString) => {
    return new Date(isoString).toLocaleString();
  };

  const getOutcomeColor = (outcome) => {
    return outcome === 'success'
      ? 'text-green-600 bg-green-50'
      : 'text-red-600 bg-red-50';
  };

  const getOutcomeIcon = (outcome) => {
    return outcome === 'success'
      ? <CheckCircle className="w-4 h-4" />
      : <AlertCircle className="w-4 h-4" />;
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <Shield className="w-8 h-8 text-blue-600" />
          <h1 className="text-3xl font-bold">Audit Log Viewer</h1>
        </div>
        <p className="text-gray-600">
          Security monitoring and activity tracking for all API operations
        </p>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white p-4 rounded-lg border border-gray-200">
            <div className="text-sm text-gray-600 mb-1">Total Logs</div>
            <div className="text-2xl font-bold">{stats.total_logs.toLocaleString()}</div>
          </div>
          <div className="bg-white p-4 rounded-lg border border-gray-200">
            <div className="text-sm text-gray-600 mb-1">Success Rate</div>
            <div className="text-2xl font-bold text-green-600">
              {stats.total_logs > 0
                ? ((stats.success_count / stats.total_logs) * 100).toFixed(1)
                : 0}%
            </div>
          </div>
          <div className="bg-white p-4 rounded-lg border border-gray-200">
            <div className="text-sm text-gray-600 mb-1">Last 24h</div>
            <div className="text-2xl font-bold">{stats.logs_last_24h.toLocaleString()}</div>
          </div>
          <div className="bg-white p-4 rounded-lg border border-gray-200">
            <div className="text-sm text-gray-600 mb-1">Failures</div>
            <div className="text-2xl font-bold text-red-600">{stats.failure_count.toLocaleString()}</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg border border-gray-200 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-5 h-5 text-gray-600" />
          <h2 className="font-semibold">Filters</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Outcome
            </label>
            <select
              value={filter.outcome}
              onChange={(e) => setFilter({ ...filter, outcome: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="all">All</option>
              <option value="success">Success</option>
              <option value="failure">Failure</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Action (contains)
            </label>
            <input
              type="text"
              value={filter.action}
              onChange={(e) => setFilter({ ...filter, action: e.target.value })}
              placeholder="e.g., POST, agent, chat"
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Limit
            </label>
            <select
              value={filter.limit}
              onChange={(e) => setFilter({ ...filter, limit: parseInt(e.target.value) })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="50">50</option>
              <option value="100">100</option>
              <option value="250">250</option>
              <option value="500">500</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={exportLogs}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
          </div>
        </div>
      </div>

      {/* Logs Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Timestamp
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Action
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Outcome
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  IP Address
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Duration
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan="6" className="px-4 py-8 text-center text-gray-500">
                    Loading audit logs...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-4 py-8 text-center text-gray-500">
                    No audit logs found
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {formatDate(log.timestamp)}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <code className="text-xs bg-gray-100 px-2 py-1 rounded">
                        {log.action}
                      </code>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${getOutcomeColor(log.outcome)}`}>
                        {getOutcomeIcon(log.outcome)}
                        {log.outcome}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {log.details?.statusCode || '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {log.ip_address}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {log.details?.durationMs ? `${log.details.durationMs}ms` : '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Top Actions */}
      {stats && stats.top_actions.length > 0 && (
        <div className="mt-6 bg-white p-6 rounded-lg border border-gray-200">
          <h2 className="font-semibold mb-4">Top API Actions</h2>
          <div className="space-y-2">
            {stats.top_actions.map((action, index) => (
              <div key={index} className="flex items-center justify-between">
                <code className="text-sm bg-gray-100 px-2 py-1 rounded">
                  {action.action}
                </code>
                <span className="text-sm text-gray-600">
                  {action.count.toLocaleString()} calls
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
