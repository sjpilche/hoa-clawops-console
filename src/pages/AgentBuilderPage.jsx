/**
 * @file AgentBuilderPage.jsx
 * @description Enhanced agent builder with soul document management.
 *
 * Creates/updates:
 * - Agent database record
 * - SOUL.md (agent personality/behavior)
 * - Configuration files
 */

import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '@/lib/api';
import {
  Save, X, FileText, Code, Settings, Sparkles,
  AlertCircle, Check, ChevronRight, Eye, FileCode,
  CalendarClock, Clock, Globe, Crown, Users, Zap, Cog,
  GitBranch
} from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';

export default function AgentBuilderPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEditing = !!id;

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    target_system: '',
    permissions: 'read-only',
    domains: '',
    instructions: '',
    domain_id: '',
    orchestration_role: 'worker',
    layer: 0,
  });

  // Domain & hierarchy data
  const [availableDomains, setAvailableDomains] = useState([]);
  const [availableAgents, setAvailableAgents] = useState([]);
  const [parentAgentId, setParentAgentId] = useState('');

  // Soul document state
  const [soulDocument, setSoulDocument] = useState('');
  const [soulEvil, setSoulEvil] = useState('');
  const [showSoulEvil, setShowSoulEvil] = useState(false);

  // Task & Schedule state
  const [taskConfig, setTaskConfig] = useState({
    taskMessage: '',          // What the agent does each run
    scheduleEnabled: false,   // Whether to schedule this agent
    scheduleType: 'daily',    // daily, hourly, cron
    scheduleTime: '08:00',    // Time of day (for daily)
    scheduleHours: 6,         // Every N hours (for hourly)
    scheduleCron: '',         // Raw cron expression (for cron)
    scheduleTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York',
  });

  // Advanced configuration state
  const [advancedConfig, setAdvancedConfig] = useState({
    // Custom hooks
    enableSoulEvil: false,
    customHooks: '',

    // Environment variables
    envVars: [],

    // Execution limits (overrides global settings)
    maxDurationSeconds: 300,
    maxCostUSD: 5.0,
    maxTokens: 100000,

    // Monitoring & webhooks
    webhookUrl: '',
    webhookEvents: [],
    notifyOnStart: false,
    notifyOnComplete: false,
    notifyOnError: true,

    // Security
    requireConfirmation: false,
    allowedActions: [],
  });

  // UI state
  const [activeTab, setActiveTab] = useState('basic'); // basic, task, soul, advanced
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState({});
  const [showPreview, setShowPreview] = useState(false);

  // Load domains and agents for dropdowns
  useEffect(() => {
    loadDomainAndAgentData();
  }, []);

  const loadDomainAndAgentData = async () => {
    try {
      const [domainRes, agentRes] = await Promise.all([
        api.get('/domains').catch(() => ({ domains: [] })),
        api.get('/agents').catch(() => ({ agents: [] })),
      ]);
      setAvailableDomains(domainRes.domains || []);
      setAvailableAgents((agentRes.agents || []).filter(a => a.id !== id));
    } catch (err) {
      console.error('[AgentBuilder] Failed to load domain/agent data:', err);
    }
  };

  // Load agent if editing
  useEffect(() => {
    if (isEditing) {
      loadAgent();
    } else {
      // Set default soul template for new agents
      setSoulDocument(getDefaultSoulTemplate());
    }
  }, [id]);

  const loadAgent = async () => {
    try {
      const data = await api.get(`/agents/${id}`);
      setFormData({
        name: data.agent.name || '',
        description: data.agent.description || '',
        target_system: data.agent.target_system || '',
        permissions: data.agent.permissions || 'read-only',
        domains: data.agent.domains || '',
        instructions: data.agent.instructions || '',
        domain_id: data.agent.domain_id || '',
        orchestration_role: data.agent.orchestration_role || 'worker',
        layer: data.agent.layer || 0,
      });

      // Load parent agent from hierarchy
      if (data.agent.parent_id) {
        setParentAgentId(data.agent.parent_id);
      }

      // Load soul documents if they exist
      // TODO: Add API endpoint to fetch soul documents
      // For now, use instructions as soul content
      setSoulDocument(data.agent.instructions || getDefaultSoulTemplate());

      // Load advanced configuration from config JSON
      if (data.agent.config) {
        try {
          const config = typeof data.agent.config === 'string'
            ? JSON.parse(data.agent.config)
            : data.agent.config;

          if (config.advanced) {
            setAdvancedConfig({
              ...advancedConfig,
              ...config.advanced,
            });
          }

          // Load task & schedule config
          if (config.task) {
            setTaskConfig(prev => ({
              ...prev,
              taskMessage: config.task.message || '',
              scheduleEnabled: config.task.schedule?.enabled || false,
              scheduleType: config.task.schedule?.type || 'daily',
              scheduleTime: config.task.schedule?.time || '08:00',
              scheduleCron: config.task.schedule?.cron || '',
              scheduleTimezone: config.task.schedule?.timezone || prev.scheduleTimezone,
            }));
          }
        } catch (parseError) {
          console.error('[AgentBuilder] Failed to parse agent config:', parseError);
        }
      }
    } catch (error) {
      console.error('[AgentBuilder] Failed to load agent:', error);
      alert(`Failed to load agent: ${error.message}`);
      navigate('/agents');
    }
  };

  const getDefaultSoulTemplate = () => {
    return `# Agent Soul Configuration

## Identity
You are an automation agent designed to help with specific tasks.

## Primary Goal
[Define the agent's primary objective]

## Capabilities
- Browse and navigate websites
- Extract data from web pages
- Fill forms with provided information
- Click buttons and interact with UI elements

## Constraints
- Only operate on allowed domains
- Follow safety protocols
- Verify actions before execution
- Report errors clearly

## Behavior Guidelines
- Be precise and methodical
- Confirm ambiguous instructions
- Provide detailed status updates
- Handle errors gracefully

## Response Format
- Clear status messages
- Structured data output
- Error reports with context
`;
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error for this field
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: null }));
    }
  };

  const validateForm = () => {
    const newErrors = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Agent name is required';
    } else if (formData.name.length > 100) {
      newErrors.name = 'Name must be 100 characters or less';
    }

    if (formData.description && formData.description.length > 500) {
      newErrors.description = 'Description must be 500 characters or less';
    }

    if (!soulDocument.trim()) {
      newErrors.soul = 'Soul document is required';
    }

    if (!taskConfig.taskMessage.trim()) {
      newErrors.taskMessage = 'Task message is required — this is what the agent does each run';
    }

    if (taskConfig.scheduleEnabled && taskConfig.scheduleType === 'cron' && !taskConfig.scheduleCron.trim()) {
      newErrors.scheduleCron = 'Cron expression is required when using custom schedule';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      // Prepare payload
      // Convert domains from comma-separated string to array
      const domainsArray = formData.domains
        ? formData.domains.split(',').map(d => d.trim()).filter(Boolean)
        : [];

      // Build cron expression from schedule config
      let cronExpression = null;
      if (taskConfig.scheduleEnabled) {
        if (taskConfig.scheduleType === 'daily') {
          const [hours, minutes] = taskConfig.scheduleTime.split(':');
          cronExpression = `${minutes} ${hours} * * *`;
        } else if (taskConfig.scheduleType === 'hourly') {
          cronExpression = `0 */${taskConfig.scheduleHours} * * *`;
        } else if (taskConfig.scheduleType === 'cron') {
          cronExpression = taskConfig.scheduleCron;
        }
      }

      const payload = {
        ...formData,
        // Convert domains string to array for the API
        domains: domainsArray,
        // Domain and hierarchy fields
        domain_id: formData.domain_id || undefined,
        orchestration_role: formData.orchestration_role,
        layer: formData.layer,
        // Soul document becomes the agent's SOUL.md
        instructions: soulDocument,
        config: {
          soul_enabled: true,
          soul_evil_enabled: showSoulEvil && soulEvil.trim().length > 0,
          // Task configuration
          task: {
            message: taskConfig.taskMessage,
            schedule: taskConfig.scheduleEnabled ? {
              enabled: true,
              type: taskConfig.scheduleType,
              cron: cronExpression,
              timezone: taskConfig.scheduleTimezone,
              time: taskConfig.scheduleTime,
            } : { enabled: false },
          },
          // Include advanced configuration
          advanced: {
            ...advancedConfig,
            // Clean up empty values
            webhookUrl: advancedConfig.webhookUrl.trim() || undefined,
            customHooks: advancedConfig.customHooks.trim() || undefined,
          },
        },
      };

      if (isEditing) {
        await api.put(`/agents/${id}`, payload);
      } else {
        await api.post('/agents', payload);
      }

      // Success!
      navigate('/agents');
    } catch (error) {
      console.error('[AgentBuilder] Failed to save agent:', error);
      alert(`Failed to save agent: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderBasicTab = () => (
    <div className="space-y-6">
      {/* Agent Identity */}
      <section>
        <h3 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
          <Settings size={20} className="text-accent-info" />
          Agent Identity
        </h3>
        <div className="space-y-4">
          <Input
            label="Agent Name"
            value={formData.name}
            onChange={(e) => handleInputChange('name', e.target.value)}
            placeholder="Invoice Extractor"
            required
            error={errors.name}
            maxLength={100}
          />

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => handleInputChange('description', e.target.value)}
              placeholder="Extracts invoices from Sage 300 and exports to Excel..."
              rows={3}
              maxLength={500}
              className={`
                w-full px-3 py-2 bg-bg-elevated border rounded-lg
                text-sm text-text-primary placeholder-text-muted
                focus:outline-none focus:border-accent-primary focus:ring-1 focus:ring-accent-primary
                ${errors.description ? 'border-accent-error' : 'border-border'}
              `}
            />
            {errors.description && (
              <p className="mt-1 text-xs text-accent-error">{errors.description}</p>
            )}
            <p className="mt-1 text-xs text-text-muted">
              {formData.description.length}/500 characters
            </p>
          </div>

          <Input
            label="Target System"
            value={formData.target_system}
            onChange={(e) => handleInputChange('target_system', e.target.value)}
            placeholder="Sage 300, QuickBooks, Procore..."
          />
        </div>
      </section>

      {/* Domain & Hierarchy */}
      <section>
        <h3 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
          <GitBranch size={20} className="text-accent-success" />
          Domain & Hierarchy
        </h3>
        <div className="space-y-4">
          {/* Domain Selector */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">
              Domain
            </label>
            <select
              value={formData.domain_id}
              onChange={(e) => handleInputChange('domain_id', e.target.value)}
              className="
                w-full px-3 py-2 bg-bg-elevated border border-border rounded-lg
                text-sm text-text-primary
                focus:outline-none focus:border-accent-primary focus:ring-1 focus:ring-accent-primary
              "
            >
              <option value="">No domain (global)</option>
              {availableDomains.map(d => (
                <option key={d.id} value={d.id}>{d.display_name}</option>
              ))}
            </select>
            <p className="mt-1.5 text-xs text-text-muted">
              Assign this agent to a business domain for organization and filtering.
            </p>
          </div>

          {/* Orchestration Role */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">
              Orchestration Role
            </label>
            <div className="grid grid-cols-4 gap-2">
              {[
                { id: 'commander', label: 'Commander', icon: Crown, color: 'text-yellow-400', desc: 'Top-level orchestrator' },
                { id: 'coordinator', label: 'Coordinator', icon: Users, color: 'text-blue-400', desc: 'Delegates to specialists' },
                { id: 'specialist', label: 'Specialist', icon: Zap, color: 'text-purple-400', desc: 'Channel/task expert' },
                { id: 'worker', label: 'Worker', icon: Cog, color: 'text-gray-400', desc: 'Executes tasks' },
              ].map((role) => (
                <button
                  key={role.id}
                  type="button"
                  onClick={() => handleInputChange('orchestration_role', role.id)}
                  className={`
                    p-3 rounded-lg border text-center transition-colors
                    ${formData.orchestration_role === role.id
                      ? 'border-accent-primary bg-accent-primary/10'
                      : 'border-border bg-bg-elevated hover:border-text-muted'
                    }
                  `}
                >
                  <role.icon size={20} className={`${role.color} mx-auto mb-1`} />
                  <div className="text-xs font-medium text-text-primary">{role.label}</div>
                  <div className="text-[10px] text-text-muted mt-0.5">{role.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Parent Agent */}
          {formData.domain_id && (
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">
                Parent Agent
              </label>
              <select
                value={parentAgentId}
                onChange={(e) => {
                  setParentAgentId(e.target.value);
                  // Auto-calculate layer based on parent
                  if (e.target.value) {
                    const parent = availableAgents.find(a => a.id === e.target.value);
                    if (parent) {
                      handleInputChange('layer', (parent.layer || 0) + 1);
                    }
                  } else {
                    handleInputChange('layer', 0);
                  }
                }}
                className="
                  w-full px-3 py-2 bg-bg-elevated border border-border rounded-lg
                  text-sm text-text-primary
                  focus:outline-none focus:border-accent-primary focus:ring-1 focus:ring-accent-primary
                "
              >
                <option value="">None (root agent)</option>
                {availableAgents
                  .filter(a => !formData.domain_id || a.domain_id === formData.domain_id)
                  .map(a => (
                    <option key={a.id} value={a.id}>
                      {a.name} {a.orchestration_role ? `(${a.orchestration_role})` : ''}
                    </option>
                  ))}
              </select>
              <p className="mt-1.5 text-xs text-text-muted">
                Select the agent above this one in the hierarchy. Layer is auto-calculated.
              </p>
            </div>
          )}

          {/* Layer display */}
          <div className="flex items-center gap-3 p-3 bg-bg-secondary rounded-lg border border-border">
            <span className="text-sm text-text-secondary">Layer:</span>
            <span className="text-sm font-bold text-text-primary bg-bg-elevated px-2 py-0.5 rounded font-mono">
              L{formData.layer}
            </span>
            <span className="text-xs text-text-muted">
              {formData.layer === 0 ? '(Root level)' : `(${formData.layer} level${formData.layer > 1 ? 's' : ''} deep)`}
            </span>
          </div>
        </div>
      </section>

      {/* Permissions & Safety */}
      <section>
        <h3 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
          <AlertCircle size={20} className="text-accent-warning" />
          Permissions & Safety
        </h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">
              Agent Permissions
            </label>
            <select
              value={formData.permissions}
              onChange={(e) => handleInputChange('permissions', e.target.value)}
              className="
                w-full px-3 py-2 bg-bg-elevated border border-border rounded-lg
                text-sm text-text-primary
                focus:outline-none focus:border-accent-primary focus:ring-1 focus:ring-accent-primary
              "
            >
              <option value="read-only">Read-only (can browse, cannot interact)</option>
              <option value="read-write">Read-write (can fill forms, click buttons)</option>
              <option value="form-submit">Form submit (can submit forms)</option>
            </select>
            <p className="mt-1.5 text-xs text-text-muted">
              {formData.permissions === 'read-only' && '✓ Safest option - agent can only view content'}
              {formData.permissions === 'read-write' && '⚠ Agent can interact with UI elements'}
              {formData.permissions === 'form-submit' && '⚠ Highest risk - agent can submit forms'}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">
              Allowed Domains (optional)
            </label>
            <textarea
              value={formData.domains}
              onChange={(e) => handleInputChange('domains', e.target.value)}
              placeholder="example.com, app.saas.com, *.internal.corp"
              rows={2}
              className="
                w-full px-3 py-2 bg-bg-elevated border border-border rounded-lg
                text-sm text-text-primary placeholder-text-muted
                focus:outline-none focus:border-accent-primary focus:ring-1 focus:ring-accent-primary
              "
            />
            <p className="mt-1.5 text-xs text-text-muted">
              One domain per line. Use * for wildcards. Leave empty to allow all domains.
            </p>
          </div>
        </div>
      </section>

      {/* Files to be created */}
      <section className="bg-bg-secondary border border-border rounded-lg p-4">
        <h4 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
          <FileText size={16} className="text-accent-success" />
          Files to be {isEditing ? 'updated' : 'created'}
        </h4>
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2 text-text-secondary">
            <Check size={14} className="text-accent-success" />
            <code className="text-xs bg-bg-elevated px-2 py-0.5 rounded">agents.db</code>
            <span className="text-xs">Agent database record</span>
          </div>
          <div className="flex items-center gap-2 text-text-secondary">
            <Check size={14} className="text-accent-success" />
            <code className="text-xs bg-bg-elevated px-2 py-0.5 rounded">SOUL.md</code>
            <span className="text-xs">Agent personality & behavior</span>
          </div>
          {showSoulEvil && soulEvil.trim() && (
            <div className="flex items-center gap-2 text-text-secondary">
              <Check size={14} className="text-accent-warning" />
              <code className="text-xs bg-bg-elevated px-2 py-0.5 rounded">SOUL_EVIL.md</code>
              <span className="text-xs">Alternate personality (advanced)</span>
            </div>
          )}
        </div>
      </section>
    </div>
  );

  const renderTaskTab = () => {
    // Generate a human-readable preview of the schedule
    const getSchedulePreview = () => {
      if (!taskConfig.scheduleEnabled) return null;
      if (taskConfig.scheduleType === 'daily') {
        return `Runs daily at ${taskConfig.scheduleTime} (${taskConfig.scheduleTimezone})`;
      }
      if (taskConfig.scheduleType === 'hourly') {
        return `Runs every ${taskConfig.scheduleHours} hour${taskConfig.scheduleHours !== 1 ? 's' : ''} (${taskConfig.scheduleTimezone})`;
      }
      if (taskConfig.scheduleType === 'cron') {
        return taskConfig.scheduleCron
          ? `Cron: ${taskConfig.scheduleCron} (${taskConfig.scheduleTimezone})`
          : 'Enter a cron expression below';
      }
      return null;
    };

    // Build cron expression for display
    const getCronExpression = () => {
      if (taskConfig.scheduleType === 'daily') {
        const [hours, minutes] = taskConfig.scheduleTime.split(':');
        return `${minutes} ${hours} * * *`;
      }
      if (taskConfig.scheduleType === 'hourly') {
        return `0 */${taskConfig.scheduleHours} * * *`;
      }
      return taskConfig.scheduleCron || '...';
    };

    return (
      <div className="space-y-6">
        {/* Task Message */}
        <section>
          <h3 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
            <CalendarClock size={20} className="text-accent-info" />
            Agent Task
          </h3>
          <div className="bg-bg-secondary border border-border rounded-lg p-4 mb-4">
            <p className="text-sm text-text-secondary">
              Define exactly what this agent should do each time it runs.
              This message is sent to the agent as its instructions for every execution.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">
              Task Message <span className="text-accent-error">*</span>
            </label>
            <textarea
              value={taskConfig.taskMessage}
              onChange={(e) => setTaskConfig(prev => ({ ...prev, taskMessage: e.target.value }))}
              placeholder={`Example: "Go to news.ycombinator.com, find the top 10 stories about AI and machine learning, extract the title, URL, and point count for each, and return the results as a JSON array."`}
              rows={6}
              className={`
                w-full px-4 py-3 bg-bg-elevated border rounded-lg
                text-sm text-text-primary placeholder-text-muted
                focus:outline-none focus:border-accent-primary focus:ring-1 focus:ring-accent-primary
                ${errors.taskMessage ? 'border-accent-error' : 'border-border'}
              `}
            />
            {errors.taskMessage && (
              <p className="mt-1 text-xs text-accent-error">{errors.taskMessage}</p>
            )}
            <p className="mt-1.5 text-xs text-text-muted">
              Be specific. Include target URLs, data to extract, output format, and any login steps.
            </p>
          </div>
        </section>

        {/* Schedule */}
        <section>
          <h3 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
            <Clock size={20} className="text-accent-primary" />
            Schedule
          </h3>

          {/* Enable toggle */}
          <div className="flex items-center gap-3 p-3 bg-bg-secondary rounded-lg border border-border mb-4">
            <input
              type="checkbox"
              id="scheduleEnabled"
              checked={taskConfig.scheduleEnabled}
              onChange={(e) => setTaskConfig(prev => ({ ...prev, scheduleEnabled: e.target.checked }))}
              className="w-4 h-4 rounded border-border bg-bg-elevated text-accent-primary focus:ring-2 focus:ring-accent-primary"
            />
            <label htmlFor="scheduleEnabled" className="flex-1 cursor-pointer">
              <div className="text-sm font-medium text-text-primary">Enable automatic scheduling</div>
              <div className="text-xs text-text-muted mt-0.5">
                Run this agent automatically on a recurring schedule via OpenClaw cron
              </div>
            </label>
          </div>

          {taskConfig.scheduleEnabled && (
            <div className="space-y-4 bg-bg-secondary border border-border rounded-lg p-4">
              {/* Schedule Type */}
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5">
                  Schedule Type
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'daily', label: 'Daily', desc: 'Run once per day at a specific time' },
                    { id: 'hourly', label: 'Every N Hours', desc: 'Run at regular intervals' },
                    { id: 'cron', label: 'Custom Cron', desc: 'Full cron expression' },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setTaskConfig(prev => ({ ...prev, scheduleType: opt.id }))}
                      className={`
                        p-3 rounded-lg border text-left transition-colors
                        ${taskConfig.scheduleType === opt.id
                          ? 'border-accent-primary bg-accent-primary/10 text-text-primary'
                          : 'border-border bg-bg-elevated text-text-secondary hover:border-text-muted'
                        }
                      `}
                    >
                      <div className="text-sm font-medium">{opt.label}</div>
                      <div className="text-xs mt-0.5 opacity-70">{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Daily time picker */}
              {taskConfig.scheduleType === 'daily' && (
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1.5">
                    Run At
                  </label>
                  <input
                    type="time"
                    value={taskConfig.scheduleTime}
                    onChange={(e) => setTaskConfig(prev => ({ ...prev, scheduleTime: e.target.value }))}
                    className="
                      px-3 py-2 bg-bg-elevated border border-border rounded-lg
                      text-sm text-text-primary
                      focus:outline-none focus:border-accent-primary focus:ring-1 focus:ring-accent-primary
                    "
                  />
                </div>
              )}

              {/* Hourly interval */}
              {taskConfig.scheduleType === 'hourly' && (
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1.5">
                    Run Every
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={23}
                      value={taskConfig.scheduleHours}
                      onChange={(e) => setTaskConfig(prev => ({
                        ...prev,
                        scheduleHours: Math.max(1, Math.min(23, parseInt(e.target.value) || 1)),
                      }))}
                      className="
                        w-20 px-3 py-2 bg-bg-elevated border border-border rounded-lg
                        text-sm text-text-primary
                        focus:outline-none focus:border-accent-primary focus:ring-1 focus:ring-accent-primary
                      "
                    />
                    <span className="text-sm text-text-secondary">
                      hour{taskConfig.scheduleHours !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
              )}

              {/* Custom cron */}
              {taskConfig.scheduleType === 'cron' && (
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1.5">
                    Cron Expression
                  </label>
                  <input
                    type="text"
                    value={taskConfig.scheduleCron}
                    onChange={(e) => setTaskConfig(prev => ({ ...prev, scheduleCron: e.target.value }))}
                    placeholder="0 8 * * 1-5"
                    className={`
                      w-full px-3 py-2 bg-bg-elevated border rounded-lg font-mono
                      text-sm text-text-primary placeholder-text-muted
                      focus:outline-none focus:border-accent-primary focus:ring-1 focus:ring-accent-primary
                      ${errors.scheduleCron ? 'border-accent-error' : 'border-border'}
                    `}
                  />
                  {errors.scheduleCron && (
                    <p className="mt-1 text-xs text-accent-error">{errors.scheduleCron}</p>
                  )}
                  <p className="mt-1.5 text-xs text-text-muted">
                    Format: minute hour day-of-month month day-of-week (e.g. "0 8 * * 1-5" = weekdays at 8 AM)
                  </p>
                </div>
              )}

              {/* Timezone */}
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5 flex items-center gap-1.5">
                  <Globe size={14} />
                  Timezone
                </label>
                <select
                  value={taskConfig.scheduleTimezone}
                  onChange={(e) => setTaskConfig(prev => ({ ...prev, scheduleTimezone: e.target.value }))}
                  className="
                    w-full px-3 py-2 bg-bg-elevated border border-border rounded-lg
                    text-sm text-text-primary
                    focus:outline-none focus:border-accent-primary focus:ring-1 focus:ring-accent-primary
                  "
                >
                  <option value="America/New_York">Eastern Time (ET)</option>
                  <option value="America/Chicago">Central Time (CT)</option>
                  <option value="America/Denver">Mountain Time (MT)</option>
                  <option value="America/Los_Angeles">Pacific Time (PT)</option>
                  <option value="America/Anchorage">Alaska Time (AKT)</option>
                  <option value="Pacific/Honolulu">Hawaii Time (HT)</option>
                  <option value="UTC">UTC</option>
                  <option value="Europe/London">London (GMT/BST)</option>
                  <option value="Europe/Paris">Central European (CET)</option>
                  <option value="Asia/Tokyo">Japan (JST)</option>
                  <option value="Asia/Shanghai">China (CST)</option>
                  <option value="Australia/Sydney">Sydney (AEST)</option>
                </select>
              </div>

              {/* Schedule Preview */}
              <div className="bg-bg-elevated border border-accent-info/30 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <CalendarClock size={16} className="text-accent-info mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="text-sm font-medium text-text-primary">
                      {getSchedulePreview()}
                    </div>
                    <div className="text-xs text-text-muted mt-1 font-mono">
                      Cron: {getCronExpression()}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Summary */}
        <section className="bg-bg-secondary border border-border rounded-lg p-4">
          <h4 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
            <Check size={16} className="text-accent-success" />
            Task Summary
          </h4>
          <div className="space-y-2 text-sm">
            <div className="flex items-start gap-2 text-text-secondary">
              <span className="font-medium min-w-[80px]">Task:</span>
              <span className={taskConfig.taskMessage ? 'text-text-primary' : 'text-text-muted italic'}>
                {taskConfig.taskMessage
                  ? (taskConfig.taskMessage.length > 120
                    ? taskConfig.taskMessage.substring(0, 120) + '...'
                    : taskConfig.taskMessage)
                  : 'Not defined yet'}
              </span>
            </div>
            <div className="flex items-center gap-2 text-text-secondary">
              <span className="font-medium min-w-[80px]">Schedule:</span>
              <span className={taskConfig.scheduleEnabled ? 'text-text-primary' : 'text-text-muted'}>
                {taskConfig.scheduleEnabled
                  ? getSchedulePreview()
                  : 'Manual only (no automatic runs)'}
              </span>
            </div>
          </div>
        </section>
      </div>
    );
  };

  const renderSoulTab = () => (
    <div className="space-y-6">
      {/* Soul Document Editor */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-text-primary flex items-center gap-2">
            <Sparkles size={20} className="text-accent-primary" />
            Soul Document (SOUL.md)
          </h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowPreview(!showPreview)}
          >
            <Eye size={16} />
            {showPreview ? 'Edit' : 'Preview'}
          </Button>
        </div>

        <div className="bg-bg-secondary border border-border rounded-lg p-4 mb-4">
          <p className="text-sm text-text-secondary">
            The soul document defines your agent's personality, behavior, and decision-making process.
            It's injected into every agent run to guide its actions.
          </p>
        </div>

        {showPreview ? (
          <div className="
            bg-bg-elevated border border-border rounded-lg p-4
            prose prose-sm prose-invert max-w-none
          ">
            <div dangerouslySetInnerHTML={{
              __html: marked(soulDocument)
            }} />
          </div>
        ) : (
          <div>
            <textarea
              value={soulDocument}
              onChange={(e) => setSoulDocument(e.target.value)}
              placeholder="Enter agent soul document..."
              rows={20}
              className={`
                w-full px-4 py-3 bg-bg-elevated border rounded-lg
                text-sm text-text-primary placeholder-text-muted font-mono
                focus:outline-none focus:border-accent-primary focus:ring-1 focus:ring-accent-primary
                ${errors.soul ? 'border-accent-error' : 'border-border'}
              `}
            />
            {errors.soul && (
              <p className="mt-2 text-xs text-accent-error">{errors.soul}</p>
            )}
          </div>
        )}
      </section>

      {/* SOUL Evil (Advanced) */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-semibold text-text-primary">
            Alternate Soul (SOUL_EVIL.md) - Advanced
          </h4>
          <button
            onClick={() => setShowSoulEvil(!showSoulEvil)}
            className="text-xs text-accent-info hover:underline"
          >
            {showSoulEvil ? 'Hide' : 'Show'}
          </button>
        </div>

        {showSoulEvil && (
          <>
            <div className="bg-bg-secondary border border-accent-warning rounded-lg p-4 mb-4">
              <p className="text-sm text-text-secondary">
                <strong>Advanced feature:</strong> Define an alternate personality that can
                be randomly activated or triggered during specific time windows.
              </p>
            </div>
            <textarea
              value={soulEvil}
              onChange={(e) => setSoulEvil(e.target.value)}
              placeholder="Enter alternate soul document (optional)..."
              rows={12}
              className="
                w-full px-4 py-3 bg-bg-elevated border border-border rounded-lg
                text-sm text-text-primary placeholder-text-muted font-mono
                focus:outline-none focus:border-accent-primary focus:ring-1 focus:ring-accent-primary
              "
            />
          </>
        )}
      </section>
    </div>
  );

  const renderAdvancedTab = () => (
    <div className="space-y-6">
      {/* Security Limits */}
      <section>
        <h3 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
          <AlertCircle size={20} className="text-accent-warning" />
          Security & Execution Limits
        </h3>
        <div className="bg-bg-secondary border border-border rounded-lg p-4 space-y-4">
          <p className="text-sm text-text-muted mb-4">
            Override global limits for this agent. Leave default values to use system settings.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Input
              label="Max Duration (seconds)"
              type="number"
              value={advancedConfig.maxDurationSeconds}
              onChange={(e) => setAdvancedConfig({ ...advancedConfig, maxDurationSeconds: parseInt(e.target.value) || 300 })}
              min={10}
              max={3600}
              helpText="Maximum runtime before timeout"
            />

            <Input
              label="Max Cost (USD)"
              type="number"
              step="0.01"
              value={advancedConfig.maxCostUSD}
              onChange={(e) => setAdvancedConfig({ ...advancedConfig, maxCostUSD: parseFloat(e.target.value) || 5.0 })}
              min={0.1}
              max={100}
              helpText="Maximum cost per run"
            />

            <Input
              label="Max Tokens"
              type="number"
              value={advancedConfig.maxTokens}
              onChange={(e) => setAdvancedConfig({ ...advancedConfig, maxTokens: parseInt(e.target.value) || 100000 })}
              min={1000}
              max={1000000}
              helpText="Maximum tokens per run"
            />
          </div>

          <div className="flex items-center gap-3 p-3 bg-bg-elevated rounded-lg border border-border">
            <input
              type="checkbox"
              id="requireConfirmation"
              checked={advancedConfig.requireConfirmation}
              onChange={(e) => setAdvancedConfig({ ...advancedConfig, requireConfirmation: e.target.checked })}
              className="w-4 h-4 rounded border-border bg-bg-elevated text-accent-primary focus:ring-2 focus:ring-accent-primary"
            />
            <label htmlFor="requireConfirmation" className="flex-1 cursor-pointer">
              <div className="text-sm font-medium text-text-primary">Require manual confirmation before execution</div>
              <div className="text-xs text-text-muted mt-0.5">
                Agent will wait for user approval before running any actions
              </div>
            </label>
          </div>
        </div>
      </section>

      {/* Custom Hooks */}
      <section>
        <h3 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
          <Code size={20} className="text-accent-info" />
          Custom Hooks & Behavior
        </h3>
        <div className="bg-bg-secondary border border-border rounded-lg p-4 space-y-4">
          <div className="flex items-center gap-3 p-3 bg-bg-elevated rounded-lg border border-border">
            <input
              type="checkbox"
              id="enableSoulEvil"
              checked={advancedConfig.enableSoulEvil}
              onChange={(e) => setAdvancedConfig({ ...advancedConfig, enableSoulEvil: e.target.checked })}
              className="w-4 h-4 rounded border-border bg-bg-elevated text-accent-primary focus:ring-2 focus:ring-accent-primary"
            />
            <label htmlFor="enableSoulEvil" className="flex-1 cursor-pointer">
              <div className="text-sm font-medium text-text-primary">Enable SOUL_EVIL mode</div>
              <div className="text-xs text-text-muted mt-0.5">
                Use alternate personality document (SOUL_EVIL.md) for this agent
              </div>
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">
              Custom Hooks (JSON)
            </label>
            <textarea
              value={advancedConfig.customHooks}
              onChange={(e) => setAdvancedConfig({ ...advancedConfig, customHooks: e.target.value })}
              placeholder='{"pre_run": "script.sh", "post_run": "cleanup.sh"}'
              rows={3}
              className="
                w-full px-3 py-2 bg-bg-elevated border border-border rounded-lg font-mono text-xs
                text-text-primary placeholder-text-muted
                focus:outline-none focus:border-accent-primary focus:ring-1 focus:ring-accent-primary
              "
            />
            <p className="text-xs text-text-muted mt-1">
              Define custom hooks to run before/after agent execution (advanced users only)
            </p>
          </div>
        </div>
      </section>

      {/* Monitoring & Webhooks */}
      <section>
        <h3 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
          <Eye size={20} className="text-accent-success" />
          Monitoring & Notifications
        </h3>
        <div className="bg-bg-secondary border border-border rounded-lg p-4 space-y-4">
          <Input
            label="Webhook URL"
            type="url"
            value={advancedConfig.webhookUrl}
            onChange={(e) => setAdvancedConfig({ ...advancedConfig, webhookUrl: e.target.value })}
            placeholder="https://your-server.com/webhooks/agent-events"
            helpText="Receive HTTP POST notifications about agent events"
          />

          <div className="space-y-2">
            <label className="block text-sm font-medium text-text-secondary mb-2">
              Notification Events
            </label>

            <div className="flex items-center gap-3 p-2 bg-bg-elevated rounded-lg">
              <input
                type="checkbox"
                id="notifyOnStart"
                checked={advancedConfig.notifyOnStart}
                onChange={(e) => setAdvancedConfig({ ...advancedConfig, notifyOnStart: e.target.checked })}
                className="w-4 h-4 rounded border-border bg-bg-elevated text-accent-primary"
              />
              <label htmlFor="notifyOnStart" className="text-sm text-text-primary cursor-pointer">
                Notify when agent starts
              </label>
            </div>

            <div className="flex items-center gap-3 p-2 bg-bg-elevated rounded-lg">
              <input
                type="checkbox"
                id="notifyOnComplete"
                checked={advancedConfig.notifyOnComplete}
                onChange={(e) => setAdvancedConfig({ ...advancedConfig, notifyOnComplete: e.target.checked })}
                className="w-4 h-4 rounded border-border bg-bg-elevated text-accent-primary"
              />
              <label htmlFor="notifyOnComplete" className="text-sm text-text-primary cursor-pointer">
                Notify when agent completes successfully
              </label>
            </div>

            <div className="flex items-center gap-3 p-2 bg-bg-elevated rounded-lg">
              <input
                type="checkbox"
                id="notifyOnError"
                checked={advancedConfig.notifyOnError}
                onChange={(e) => setAdvancedConfig({ ...advancedConfig, notifyOnError: e.target.checked })}
                className="w-4 h-4 rounded border-border bg-bg-elevated text-accent-primary"
              />
              <label htmlFor="notifyOnError" className="text-sm text-text-primary cursor-pointer">
                Notify on errors or failures
              </label>
            </div>
          </div>

          <div className="bg-accent-info/10 border border-accent-info/20 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <AlertCircle size={16} className="text-accent-info mt-0.5 flex-shrink-0" />
              <div className="text-xs text-text-secondary">
                <strong className="text-text-primary">Webhook Format:</strong> POSTs JSON with{' '}
                <code className="px-1 py-0.5 bg-bg-elevated rounded text-accent-info">
                  {`{event, agent_id, timestamp, data}`}
                </code>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Environment Variables */}
      <section>
        <h3 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
          <FileCode size={20} className="text-accent-warning" />
          Environment Variables
        </h3>
        <div className="bg-bg-secondary border border-border rounded-lg p-4">
          <p className="text-sm text-text-muted mb-3">
            Define environment variables available to this agent during execution.
          </p>

          <div className="space-y-2">
            {advancedConfig.envVars.map((envVar, index) => (
              <div key={index} className="flex items-center gap-2">
                <input
                  type="text"
                  value={envVar.key}
                  onChange={(e) => {
                    const newVars = [...advancedConfig.envVars];
                    newVars[index].key = e.target.value;
                    setAdvancedConfig({ ...advancedConfig, envVars: newVars });
                  }}
                  placeholder="KEY"
                  className="flex-1 px-3 py-2 bg-bg-elevated border border-border rounded-lg text-sm font-mono"
                />
                <span className="text-text-muted">=</span>
                <input
                  type="text"
                  value={envVar.value}
                  onChange={(e) => {
                    const newVars = [...advancedConfig.envVars];
                    newVars[index].value = e.target.value;
                    setAdvancedConfig({ ...advancedConfig, envVars: newVars });
                  }}
                  placeholder="value"
                  className="flex-1 px-3 py-2 bg-bg-elevated border border-border rounded-lg text-sm font-mono"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const newVars = advancedConfig.envVars.filter((_, i) => i !== index);
                    setAdvancedConfig({ ...advancedConfig, envVars: newVars });
                  }}
                >
                  <X size={16} />
                </Button>
              </div>
            ))}

            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setAdvancedConfig({
                  ...advancedConfig,
                  envVars: [...advancedConfig.envVars, { key: '', value: '' }],
                });
              }}
            >
              <Check size={16} />
              Add Variable
            </Button>
          </div>

          <div className="bg-accent-warning/10 border border-accent-warning/20 rounded-lg p-3 mt-4">
            <div className="flex items-start gap-2">
              <AlertCircle size={16} className="text-accent-warning mt-0.5 flex-shrink-0" />
              <div className="text-xs text-text-secondary">
                <strong className="text-text-primary">Security Warning:</strong> Sensitive values (API keys, passwords)
                will be encrypted in the database but visible in agent logs. Consider using the Credentials Vault instead.
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b border-border bg-bg-secondary px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-text-primary">
              {isEditing ? 'Edit Agent' : 'Create New Agent'}
            </h1>
            <p className="text-sm text-text-secondary mt-1">
              Configure roles, responsibilities, and automation instructions
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              onClick={() => navigate('/agents')}
              disabled={isSubmitting}
            >
              <X size={16} />
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleSubmit}
              disabled={isSubmitting || !formData.name.trim()}
            >
              <Save size={16} />
              {isSubmitting ? 'Saving...' : isEditing ? 'Update Agent' : 'Create Agent'}
            </Button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-border bg-bg-primary px-6">
        <div className="flex gap-1">
          {[
            { id: 'basic', label: 'Basic', icon: Settings },
            { id: 'task', label: 'Task & Schedule', icon: CalendarClock },
            { id: 'soul', label: 'Soul Document', icon: Sparkles },
            { id: 'advanced', label: 'Advanced', icon: Code },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                px-4 py-3 text-sm font-medium border-b-2 transition-colors
                flex items-center gap-2
                ${activeTab === tab.id
                  ? 'border-accent-primary text-accent-primary'
                  : 'border-transparent text-text-secondary hover:text-text-primary'
                }
              `}
            >
              <tab.icon size={16} />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto">
          {activeTab === 'basic' && renderBasicTab()}
          {activeTab === 'task' && renderTaskTab()}
          {activeTab === 'soul' && renderSoulTab()}
          {activeTab === 'advanced' && renderAdvancedTab()}
        </div>
      </div>
    </div>
  );
}

// Simple markdown renderer (you might want to use a proper library like marked or react-markdown)
function marked(text) {
  return text
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    .replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>')
    .replace(/\*(.*)\*/gim, '<em>$1</em>')
    .replace(/\n/gim, '<br>');
}
