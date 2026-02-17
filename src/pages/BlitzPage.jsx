/**
 * @file BlitzPage.jsx
 * @description Blitz Mode - Run all agents and view results
 */

import React, { useState, useEffect } from 'react';
import { Play, Zap, CheckCircle, XCircle, Clock, ChevronDown, ChevronUp, History } from 'lucide-react';
import { api } from '@/lib/api';

export default function BlitzPage() {
  const [isRunning, setIsRunning] = useState(false);
  const [currentRunId, setCurrentRunId] = useState(null);
  const [runStatus, setRunStatus] = useState(null);
  const [results, setResults] = useState([]);
  const [history, setHistory] = useState([]);
  const [expandedResults, setExpandedResults] = useState(new Set());
  const [showHistory, setShowHistory] = useState(false);

  // Fetch history on mount
  useEffect(() => {
    fetchHistory();
  }, []);

  // Poll for status updates when running
  useEffect(() => {
    if (!currentRunId || !isRunning) return;

    const interval = setInterval(async () => {
      try {
        const data = await api.get(`/blitz/status/${currentRunId}`);
        setRunStatus(data);
        setResults(data.results || []);

        // Stop polling if completed
        if (data.run?.status === 'completed' || data.run?.status === 'failed') {
          setIsRunning(false);
          fetchHistory(); // Refresh history
        }
      } catch (error) {
        console.error('Error polling status:', error);
        setIsRunning(false);
      }
    }, 2000); // Poll every 2 seconds

    return () => clearInterval(interval);
  }, [currentRunId, isRunning]);

  const fetchHistory = async () => {
    try {
      const data = await api.get('/blitz/history');
      setHistory(data.runs || []);
    } catch (error) {
      console.error('Error fetching history:', error);
    }
  };

  const startBlitzRun = async () => {
    try {
      setIsRunning(true);
      setRunStatus(null);
      setResults([]);
      setExpandedResults(new Set());

      const data = await api.post('/blitz/run');
      setCurrentRunId(data.runId);
    } catch (error) {
      console.error('Error starting blitz run:', error);
      setIsRunning(false);
      alert(`Failed to start blitz run: ${error.message}`);
    }
  };

  const loadRun = async (runId) => {
    try {
      const data = await api.get(`/blitz/results/${runId}`);
      setCurrentRunId(runId);
      setRunStatus({
        run: data.run,
        results: data.results,
        progress: {
          total: data.run.total_agents,
          completed: data.run.completed_agents,
          failed: data.run.failed_agents,
          percentage: Math.round((data.run.completed_agents / data.run.total_agents) * 100)
        }
      });
      setResults(data.results || []);
      setIsRunning(false);
      setShowHistory(false);
    } catch (error) {
      console.error('Error loading run:', error);
    }
  };

  const toggleExpand = (resultId) => {
    const newExpanded = new Set(expandedResults);
    if (newExpanded.has(resultId)) {
      newExpanded.delete(resultId);
    } else {
      newExpanded.add(resultId);
    }
    setExpandedResults(newExpanded);
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="text-green-500" size={20} />;
      case 'failed':
        return <XCircle className="text-red-500" size={20} />;
      case 'running':
        return <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />;
      default:
        return <Clock className="text-text-muted" size={20} />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed':
        return 'bg-green-500/10 border-green-500/20 text-green-400';
      case 'failed':
        return 'bg-red-500/10 border-red-500/20 text-red-400';
      case 'running':
        return 'bg-blue-500/10 border-blue-500/20 text-blue-400';
      default:
        return 'bg-bg-secondary border-border text-text-muted';
    }
  };

  const formatDuration = (ms) => {
    if (!ms) return '--';
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '--';
    return new Date(dateStr).toLocaleString();
  };

  return (
    <div className="h-full flex flex-col bg-bg-primary">
      {/* Header */}
      <div className="border-b border-border bg-bg-elevated px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-text-primary flex items-center gap-3">
              <Zap className="text-accent-primary" size={28} />
              Blitz Mode
            </h1>
            <p className="text-sm text-text-muted mt-1">
              Run all 6 agents sequentially and evaluate their outputs
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="px-4 py-2 rounded-lg border border-border bg-bg-secondary text-text-primary hover:bg-bg-tertiary transition-colors flex items-center gap-2"
            >
              <History size={16} />
              {showHistory ? 'Hide' : 'View'} History
            </button>
            <button
              onClick={startBlitzRun}
              disabled={isRunning}
              className={`px-6 py-2 rounded-lg font-medium flex items-center gap-2 transition-all ${
                isRunning
                  ? 'bg-bg-secondary text-text-muted cursor-not-allowed'
                  : 'bg-accent-primary text-white hover:bg-accent-primary-hover'
              }`}
            >
              <Play size={16} />
              {isRunning ? 'Running...' : 'Start Blitz Run'}
            </button>
          </div>
        </div>
      </div>

      {/* History Sidebar */}
      {showHistory && (
        <div className="border-b border-border bg-bg-elevated px-6 py-4">
          <h3 className="font-semibold text-text-primary mb-3">Previous Runs</h3>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {history.length === 0 ? (
              <p className="text-sm text-text-muted">No previous runs</p>
            ) : (
              history.map((run) => (
                <button
                  key={run.id}
                  onClick={() => loadRun(run.id)}
                  className="w-full text-left p-3 rounded-lg border border-border bg-bg-secondary hover:bg-bg-tertiary transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-sm text-text-primary">
                        Run #{run.id}
                      </div>
                      <div className="text-xs text-text-muted">
                        {formatDate(run.started_at)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-xs px-2 py-1 rounded ${
                        run.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                        run.status === 'failed' ? 'bg-red-500/20 text-red-400' :
                        'bg-blue-500/20 text-blue-400'
                      }`}>
                        {run.status}
                      </div>
                      <div className="text-xs text-text-muted mt-1">
                        {run.completed_agents}/{run.total_agents} agents
                      </div>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 overflow-auto p-6">
        {/* Progress Bar */}
        {runStatus && (
          <div className="mb-6 p-4 rounded-lg border border-border bg-bg-elevated">
            <div className="flex items-center justify-between mb-2">
              <div className="font-semibold text-text-primary">
                Progress: {runStatus.progress?.completed || 0}/{runStatus.progress?.total || 6} agents
              </div>
              <div className="text-sm text-text-muted">
                {runStatus.progress?.percentage || 0}% complete
              </div>
            </div>
            <div className="w-full h-2 bg-bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full bg-accent-primary transition-all duration-500"
                style={{ width: `${runStatus.progress?.percentage || 0}%` }}
              />
            </div>
            {runStatus.run?.total_duration_ms && (
              <div className="text-xs text-text-muted mt-2">
                Total time: {formatDuration(runStatus.run.total_duration_ms)}
              </div>
            )}
          </div>
        )}

        {/* No Run Active */}
        {!runStatus && !isRunning && (
          <div className="text-center py-20">
            <Zap className="mx-auto text-text-muted mb-4" size={64} />
            <h2 className="text-xl font-semibold text-text-primary mb-2">
              Ready to Blitz!
            </h2>
            <p className="text-text-muted mb-6">
              Click "Start Blitz Run" to execute all 6 agents with test prompts
            </p>
          </div>
        )}

        {/* Agent Results */}
        {results.length > 0 && (
          <div className="space-y-4">
            {results.map((result) => (
              <div
                key={result.id}
                className={`rounded-lg border p-4 ${getStatusColor(result.status)}`}
              >
                {/* Result Header */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    {getStatusIcon(result.status)}
                    <div>
                      <div className="font-semibold text-text-primary">
                        {result.agent_name}
                      </div>
                      {result.duration_ms && (
                        <div className="text-xs text-text-muted">
                          Completed in {formatDuration(result.duration_ms)}
                        </div>
                      )}
                    </div>
                  </div>
                  {result.output && (
                    <button
                      onClick={() => toggleExpand(result.id)}
                      className="text-text-muted hover:text-text-primary transition-colors"
                    >
                      {expandedResults.has(result.id) ? (
                        <ChevronUp size={20} />
                      ) : (
                        <ChevronDown size={20} />
                      )}
                    </button>
                  )}
                </div>

                {/* Prompt */}
                <div className="mb-3">
                  <div className="text-xs font-medium text-text-muted mb-1">Prompt:</div>
                  <div className="text-sm text-text-secondary line-clamp-2">
                    {result.prompt}
                  </div>
                </div>

                {/* Output */}
                {result.output && (
                  <div>
                    <div className="text-xs font-medium text-text-muted mb-1">Output:</div>
                    <div className={`text-sm text-text-primary bg-bg-primary rounded p-3 ${
                      expandedResults.has(result.id) ? '' : 'line-clamp-4'
                    }`}>
                      <pre className="whitespace-pre-wrap font-sans">
                        {result.output}
                      </pre>
                    </div>
                    {!expandedResults.has(result.id) && result.output.length > 200 && (
                      <button
                        onClick={() => toggleExpand(result.id)}
                        className="text-xs text-accent-primary hover:underline mt-2"
                      >
                        View Full Output ({result.output.length} chars)
                      </button>
                    )}
                  </div>
                )}

                {/* Error */}
                {result.error && (
                  <div className="mt-3">
                    <div className="text-xs font-medium text-red-400 mb-1">Error:</div>
                    <div className="text-sm text-red-300 bg-red-500/10 rounded p-3">
                      {result.error}
                    </div>
                  </div>
                )}

                {/* Running Status */}
                {result.status === 'running' && (
                  <div className="text-sm text-text-muted italic">
                    Agent is currently running...
                  </div>
                )}

                {/* Pending Status */}
                {result.status === 'pending' && (
                  <div className="text-sm text-text-muted italic">
                    Waiting to run...
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
