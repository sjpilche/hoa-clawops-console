/**
 * @file AgentsPage.jsx
 * @description Agent management page - create, configure, and manage OpenClaw agents.
 */

import React, { useEffect, useState } from 'react';
import { Plus, Bot, Search, Play, X, CheckCircle, AlertCircle, Loader, Clock, DollarSign, Zap, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import { useNavigate } from 'react-router-dom';
import AgentCard from '@/components/agents/AgentCard';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';

export default function AgentsPage() {
  const [agents, setAgents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewAgentForm, setShowNewAgentForm] = useState(false);
  const [runAgent, setRunAgent] = useState(null); // agent to run (opens modal)
  const navigate = useNavigate();

  // Load agents on mount
  useEffect(() => {
    fetchAgents();
  }, []);

  const fetchAgents = async () => {
    setIsLoading(true);
    try {
      const data = await api.get('/agents');
      setAgents(data.agents || []);
    } catch (error) {
      console.error('[AgentsPage] Failed to fetch agents:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRunAgent = (agent) => {
    setRunAgent(agent);
  };

  const handleEditAgent = (agent) => {
    // Navigate to agent detail page
    navigate(`/agents/${agent.id}`);
  };

  const handleNewAgent = () => {
    // Navigate to create new agent page
    navigate('/agents/new');
  };

  const handleDeleteAgent = async (agentId) => {
    try {
      await api.del(`/agents/${agentId}`);
      setAgents(agents.filter(a => a.id !== agentId));
    } catch (error) {
      console.error('[AgentsPage] Failed to delete agent:', error);
      alert('Failed to delete agent: ' + error.message);
    }
  };

  const handleRegisterAgent = async (agent) => {
    try {
      const result = await api.post(`/agents/${agent.id}/register`);
      console.log('[AgentsPage] Agent registered:', result);
      fetchAgents(); // Refresh to show updated status
    } catch (error) {
      console.error('[AgentsPage] Failed to register agent:', error);
      alert('Failed to register agent with OpenClaw: ' + error.message);
    }
  };

  const filteredAgents = agents.filter(agent =>
    agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    agent.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b border-border bg-bg-secondary px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-semibold text-text-primary">Agents</h1>
            <p className="text-sm text-text-secondary mt-1">
              Configure and manage your OpenClaw automation agents
            </p>
          </div>
          <Button
            variant="primary"
            onClick={handleNewAgent}
          >
            <Plus size={16} />
            New Agent
          </Button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <Input
            type="text"
            placeholder="Search agents..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Agent Grid */}
      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-text-muted">Loading agents...</div>
          </div>
        ) : filteredAgents.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center space-y-4 max-w-md">
              <div className="w-16 h-16 mx-auto bg-accent-info/10 rounded-2xl flex items-center justify-center">
                <Bot size={32} className="text-accent-info" />
              </div>
              <h3 className="text-lg font-semibold text-text-primary">
                {searchQuery ? 'No agents found' : 'No agents yet'}
              </h3>
              <p className="text-sm text-text-secondary">
                {searchQuery
                  ? `No agents match "${searchQuery}". Try a different search.`
                  : 'Create your first agent to start automating browser tasks with OpenClaw.'}
              </p>
              {!searchQuery && (
                <Button
                  variant="primary"
                  onClick={handleNewAgent}
                >
                  <Plus size={16} />
                  Create First Agent
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredAgents.map((agent) => (
              <AgentCard
                key={agent.id}
                agent={agent}
                onRun={handleRunAgent}
                onEdit={handleEditAgent}
                onDelete={handleDeleteAgent}
                onRegister={handleRegisterAgent}
              />
            ))}
          </div>
        )}
      </div>

      {/* New Agent Modal */}
      {showNewAgentForm && (
        <NewAgentModal
          onClose={() => setShowNewAgentForm(false)}
          onSuccess={() => {
            setShowNewAgentForm(false);
            fetchAgents();
          }}
        />
      )}

      {/* Run Agent Modal */}
      {runAgent && (
        <RunAgentModal
          agent={runAgent}
          onClose={() => setRunAgent(null)}
          onComplete={() => {
            setRunAgent(null);
            fetchAgents(); // Refresh to show updated status
          }}
        />
      )}
    </div>
  );
}

/** Run Agent modal — triggers agent execution with a message */
function RunAgentModal({ agent, onClose, onComplete }) {
  // Parse agent config for display and pre-fill
  const config = (() => {
    try {
      return typeof agent.config === 'string' ? JSON.parse(agent.config) : agent.config || {};
    } catch { return {}; }
  })();
  const advanced = config.advanced || {};
  const taskMessage = config.task?.message || '';
  const isRegistered = !!config.openclaw_id;

  const [message, setMessage] = useState(taskMessage);
  const [status, setStatus] = useState('idle'); // idle, running, success, error, registering
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const handleRegister = async () => {
    setStatus('registering');
    setError('');
    try {
      await api.post(`/agents/${agent.id}/register`);
      onComplete(); // Close and refresh
    } catch (err) {
      setStatus('error');
      setError('Registration failed: ' + err.message);
    }
  };

  const handleRun = async (e) => {
    e.preventDefault();
    if (!message.trim()) return;

    setStatus('running');
    setError('');
    setResult(null);

    try {
      const data = await api.post(`/agents/${agent.id}/run`, {
        message: message.trim(),
      });
      setStatus('success');
      setResult(data);
    } catch (err) {
      setStatus('error');
      setError(err.message || 'Failed to run agent');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-bg-primary border border-border rounded-xl max-w-xl w-full max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-accent-success/10 flex items-center justify-center">
              <Play size={20} className="text-accent-success" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-text-primary">Run Agent</h2>
              <p className="text-sm text-text-secondary">{agent.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary p-1">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Registration Warning */}
          {!isRegistered && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm text-red-400 font-medium">
                <AlertCircle size={16} />
                Agent Not Registered with OpenClaw
              </div>
              <p className="text-xs text-text-secondary">
                This agent exists locally but is not registered with OpenClaw.
                Register it before running.
              </p>
              <button
                onClick={handleRegister}
                disabled={status === 'registering'}
                className="flex items-center gap-2 px-3 py-1.5 bg-accent-primary text-bg-primary rounded-lg text-sm font-medium hover:bg-accent-primary/80 disabled:opacity-50"
              >
                {status === 'registering' ? (
                  <><Loader size={14} className="animate-spin" /> Registering...</>
                ) : (
                  <><RefreshCw size={14} /> Register with OpenClaw</>
                )}
              </button>
            </div>
          )}

          {/* Agent Info Summary */}
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div className="bg-bg-secondary rounded-lg p-3 text-center">
              <Clock size={14} className="text-accent-info mx-auto mb-1" />
              <div className="text-text-muted">Max Duration</div>
              <div className="text-text-primary font-semibold">
                {advanced.maxDurationSeconds || 300}s
              </div>
            </div>
            <div className="bg-bg-secondary rounded-lg p-3 text-center">
              <DollarSign size={14} className="text-accent-warning mx-auto mb-1" />
              <div className="text-text-muted">Max Cost</div>
              <div className="text-text-primary font-semibold">
                ${advanced.maxCostUSD || 5.00}
              </div>
            </div>
            <div className="bg-bg-secondary rounded-lg p-3 text-center">
              <Zap size={14} className="text-accent-primary mx-auto mb-1" />
              <div className="text-text-muted">Permissions</div>
              <div className="text-text-primary font-semibold">
                {agent.permissions || 'read-only'}
              </div>
            </div>
          </div>

          {/* Message Input */}
          <form onSubmit={handleRun}>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">
              Instructions for this run
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={`Tell ${agent.name} what to do...`}
              rows={4}
              disabled={status === 'running'}
              autoFocus
              className="
                w-full px-3 py-2 bg-bg-elevated border border-border rounded-lg
                text-sm text-text-primary placeholder-text-muted
                focus:outline-none focus:border-accent-primary focus:ring-1 focus:ring-accent-primary
                disabled:opacity-50
              "
            />

            {/* Status Feedback */}
            {status === 'running' && (
              <div className="mt-3 flex items-center gap-2 text-sm text-accent-info bg-accent-info/10 rounded-lg px-3 py-2">
                <Loader size={14} className="animate-spin" />
                Agent is running... This may take a moment.
              </div>
            )}

            {status === 'success' && result && (
              <div className="mt-3 space-y-2">
                <div className="flex items-center gap-2 text-sm text-accent-success bg-accent-success/10 rounded-lg px-3 py-2">
                  <CheckCircle size={14} />
                  {result.message || 'Agent started successfully!'}
                </div>
                {result.run && (
                  <div className="text-xs text-text-muted bg-bg-secondary rounded-lg p-3 space-y-1">
                    <div><span className="text-text-secondary">Run ID:</span> {result.run.id}</div>
                    <div><span className="text-text-secondary">Session:</span> {result.run.sessionId}</div>
                    <div><span className="text-text-secondary">Status:</span> {result.run.status}</div>
                  </div>
                )}
              </div>
            )}

            {status === 'error' && (
              <div className="mt-3 flex items-center gap-2 text-sm text-accent-danger bg-accent-danger/10 rounded-lg px-3 py-2">
                <AlertCircle size={14} />
                {error}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-3 mt-4">
              {status === 'success' ? (
                <Button
                  type="button"
                  variant="primary"
                  onClick={onComplete}
                  className="flex-1"
                >
                  <CheckCircle size={14} />
                  Done
                </Button>
              ) : (
                <Button
                  type="submit"
                  variant="primary"
                  disabled={!message.trim() || status === 'running' || !isRegistered}
                  className="flex-1"
                >
                  {status === 'running' ? (
                    <>
                      <Loader size={14} className="animate-spin" />
                      Running...
                    </>
                  ) : (
                    <>
                      <Play size={14} />
                      Run Agent
                    </>
                  )}
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                onClick={onClose}
                disabled={status === 'running'}
              >
                {status === 'success' ? 'Close' : 'Cancel'}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

/** Quick new agent modal */
function NewAgentModal({ onClose, onSuccess }) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    target_system: '',
    permissions: 'read-only',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      await api.post('/agents', formData);
      onSuccess();
    } catch (error) {
      console.error('[NewAgentModal] Failed to create agent:', error);
      alert('Failed to create agent: ' + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-bg-primary border border-border rounded-xl max-w-lg w-full p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-xl font-semibold text-text-primary mb-4">Create New Agent</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Agent Name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="Invoice Extractor"
            required
          />

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Extracts invoices from Sage 300..."
              rows={3}
              className="
                w-full px-3 py-2 bg-bg-elevated border border-border rounded-lg
                text-sm text-text-primary placeholder-text-muted
                focus:outline-none focus:border-accent-primary focus:ring-1 focus:ring-accent-primary
              "
            />
          </div>

          <Input
            label="Target System"
            value={formData.target_system}
            onChange={(e) => setFormData({ ...formData, target_system: e.target.value })}
            placeholder="Sage 300, QuickBooks, Procore..."
          />

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">
              Permissions
            </label>
            <select
              value={formData.permissions}
              onChange={(e) => setFormData({ ...formData, permissions: e.target.value })}
              className="
                w-full px-3 py-2 bg-bg-elevated border border-border rounded-lg
                text-sm text-text-primary
                focus:outline-none focus:border-accent-primary focus:ring-1 focus:ring-accent-primary
              "
            >
              <option value="read-only">Read-only</option>
              <option value="read-write">Read-write</option>
              <option value="form-submit">Form submit</option>
            </select>
          </div>

          <div className="flex items-center gap-3 pt-4">
            <Button
              type="submit"
              variant="primary"
              disabled={isSubmitting || !formData.name}
              className="flex-1"
            >
              {isSubmitting ? 'Creating...' : 'Create Agent'}
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
