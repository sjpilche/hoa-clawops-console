/**
 * @file AgentsPage.jsx
 * @description Agent management page - create, configure, and manage OpenClaw agents.
 */

import React, { useEffect, useState, useMemo } from 'react';
import { Plus, Bot, Search, Play, X, CheckCircle, AlertCircle, Loader, Clock, DollarSign, Zap, RefreshCw, ChevronDown, ChevronRight, Building2, Briefcase, Building, Globe, Cpu } from 'lucide-react';
import { api } from '@/lib/api';
import { useNavigate } from 'react-router-dom';
import AgentCard from '@/components/agents/AgentCard';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import ConfirmationDialog from '@/components/safety/ConfirmationDialog';

/** Domain group definitions — agents are grouped by name prefix */
const DOMAIN_GROUPS = [
  { key: 'hoa-marketing', label: 'HOA Marketing', prefix: 'hoa-', icon: Building2, color: 'text-emerald-400', bg: 'bg-emerald-400/10',
    filter: (name) => ['hoa-content-writer','hoa-cms-publisher','hoa-social-media','hoa-social-engagement','hoa-networker','hoa-email-campaigns','hoa-website-publisher','hoa-facebook-poster'].includes(name) },
  { key: 'hoa-pipeline', label: 'HOA Pipeline', prefix: 'hoa-', icon: Globe, color: 'text-blue-400', bg: 'bg-blue-400/10',
    filter: (name) => ['hoa-discovery','hoa-contact-finder','hoa-contact-enricher','hoa-outreach-drafter'].includes(name) },
  { key: 'hoa-intel', label: 'HOA Intel', prefix: '', icon: Search, color: 'text-cyan-400', bg: 'bg-cyan-400/10',
    filter: (name) => ['hoa-minutes-monitor','google-reviews-monitor'].includes(name) },
  { key: 'mgmt-research', label: 'Mgmt Research', prefix: 'mgmt-', icon: Building, color: 'text-purple-400', bg: 'bg-purple-400/10',
    filter: (name) => name.startsWith('mgmt-') },
  { key: 'cfo-marketing', label: 'CFO Marketing', prefix: 'cfo-', icon: Briefcase, color: 'text-amber-400', bg: 'bg-amber-400/10',
    filter: (name) => name.startsWith('cfo-') },
  { key: 'jake-marketing', label: 'Jake Marketing', prefix: 'jake-', icon: Zap, color: 'text-rose-400', bg: 'bg-rose-400/10',
    filter: (name) => name.startsWith('jake-') },
  { key: 'core', label: 'Core', prefix: '', icon: Cpu, color: 'text-slate-400', bg: 'bg-slate-400/10',
    filter: () => true }, // catch-all for unmatched agents
];

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

  // Group agents by domain
  const groupedAgents = useMemo(() => {
    const assigned = new Set();
    const groups = [];

    for (const group of DOMAIN_GROUPS) {
      const matching = filteredAgents.filter(agent => {
        if (assigned.has(agent.id)) return false;
        return group.filter(agent.name);
      });
      matching.forEach(a => assigned.add(a.id));
      if (matching.length > 0) {
        groups.push({ ...group, agents: matching });
      }
    }
    return groups;
  }, [filteredAgents]);

  // Collapsible group state — all expanded by default
  const [collapsedGroups, setCollapsedGroups] = useState({});
  const toggleGroup = (key) => setCollapsedGroups(prev => ({ ...prev, [key]: !prev[key] }));

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b border-border bg-bg-secondary px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-semibold text-text-primary">Agents</h1>
            <p className="text-sm text-text-secondary mt-1">
              {agents.length} agents across {groupedAgents.length} domains
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

      {/* Agent List — grouped by domain */}
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
          <div className="flex flex-col gap-4">
            {groupedAgents.map((group) => {
              const GroupIcon = group.icon;
              const isCollapsed = collapsedGroups[group.key];
              const runningCount = group.agents.filter(a => a.status === 'running').length;
              const totalRuns = group.agents.reduce((sum, a) => sum + (a.total_runs || 0), 0);

              return (
                <div key={group.key} className="rounded-xl border border-border overflow-hidden">
                  {/* Group header — clickable to collapse */}
                  <button
                    onClick={() => toggleGroup(group.key)}
                    className="w-full flex items-center gap-3 px-4 py-3 bg-bg-secondary hover:bg-bg-elevated transition-colors"
                  >
                    {isCollapsed ? <ChevronRight size={16} className="text-text-muted" /> : <ChevronDown size={16} className="text-text-muted" />}
                    <div className={`w-8 h-8 rounded-lg ${group.bg} flex items-center justify-center shrink-0`}>
                      <GroupIcon size={16} className={group.color} />
                    </div>
                    <div className="flex-1 text-left">
                      <span className="font-semibold text-sm text-text-primary">{group.label}</span>
                      <span className="text-xs text-text-muted ml-2">
                        {group.agents.length} agent{group.agents.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-text-muted">
                      {runningCount > 0 && (
                        <span className="flex items-center gap-1 text-blue-400">
                          <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                          {runningCount} running
                        </span>
                      )}
                      <span>{totalRuns} runs</span>
                    </div>
                  </button>

                  {/* Group body — collapsible agent list */}
                  {!isCollapsed && (
                    <div className="flex flex-col gap-1 p-2">
                      {group.agents.map((agent) => (
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
              );
            })}
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
  const [status, setStatus] = useState('idle'); // idle, pending, awaiting_confirmation, running, success, error, registering
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [pendingRun, setPendingRun] = useState(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

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

    setStatus('pending');
    setError('');
    setResult(null);

    try {
      // Phase 2.1: Create pending run (requires confirmation)
      const data = await api.post(`/agents/${agent.id}/run`, {
        message: message.trim(),
      });

      if (data.confirmation_required) {
        // Store the pending run and show confirmation dialog
        setPendingRun(data.run);
        setShowConfirmDialog(true);
        setStatus('awaiting_confirmation');
      } else {
        // Fallback: if confirmation not required (shouldn't happen)
        setStatus('success');
        setResult(data);
      }
    } catch (err) {
      setStatus('error');
      setError(err.message || 'Failed to create run');
    }
  };

  const handleConfirm = async () => {
    if (!pendingRun) return;

    setShowConfirmDialog(false);
    setStatus('running');

    try {
      // Phase 2.1: Confirm and execute
      const data = await api.post(`/runs/${pendingRun.id}/confirm`);
      setStatus('success');
      setResult(data);
      setPendingRun(null);
    } catch (err) {
      setStatus('error');
      setError(err.message || 'Failed to execute agent');
      setPendingRun(null);
    }
  };

  const handleCancelRun = async () => {
    if (!pendingRun) return;

    try {
      // Optional: Cancel the pending run on the backend
      await api.post(`/runs/${pendingRun.id}/cancel`);
    } catch (err) {
      console.error('Failed to cancel run:', err);
    }

    setShowConfirmDialog(false);
    setStatus('idle');
    setPendingRun(null);
    setError('');
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
            {status === 'awaiting_confirmation' && (
              <div className="mt-3 flex items-center gap-2 text-sm text-accent-warning bg-accent-warning/10 rounded-lg px-3 py-2">
                <AlertCircle size={14} />
                Awaiting confirmation... Review the details and confirm to execute.
              </div>
            )}

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
                  disabled={!message.trim() || status === 'running' || status === 'awaiting_confirmation' || !isRegistered}
                  className="flex-1"
                >
                  {status === 'running' ? (
                    <>
                      <Loader size={14} className="animate-spin" />
                      Running...
                    </>
                  ) : status === 'awaiting_confirmation' ? (
                    <>
                      <Clock size={14} />
                      Awaiting Confirmation
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

        {/* Phase 2.1: Confirmation Dialog */}
        {showConfirmDialog && pendingRun && (
          <ConfirmationDialog
            isOpen={showConfirmDialog}
            title="Confirm Agent Execution"
            message={
              <>
                <p className="mb-3">You are about to run <strong>{agent.name}</strong></p>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-text-muted">Permissions:</span>
                    <span className={`font-medium ${
                      agent.permissions === 'read-only' ? 'text-green-400' :
                      agent.permissions === 'read-write' ? 'text-yellow-400' :
                      'text-orange-400'
                    }`}>
                      {agent.permissions || 'read-only'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-muted">Estimated cost:</span>
                    <span className="text-text-primary font-medium">~$0.05</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-muted">Max duration:</span>
                    <span className="text-text-primary font-medium">{advanced.maxDurationSeconds || 300}s</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-muted">Run ID:</span>
                    <span className="text-text-primary font-mono text-xs">{pendingRun.id.substring(0, 8)}...</span>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-border">
                  <p className="text-xs text-yellow-400">
                    This agent will have <strong>{agent.permissions || 'read-only'}</strong> access.
                    Confirm to proceed with execution.
                  </p>
                </div>
              </>
            }
            confirmText="Execute Agent"
            cancelText="Cancel"
            onConfirm={handleConfirm}
            onCancel={handleCancelRun}
            variant="warning"
          />
        )}
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
