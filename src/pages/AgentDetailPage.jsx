/**
 * @file AgentDetailPage.jsx
 * @description Full agent configuration - roles, responsibilities, instructions, domains.
 */

import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Bot, Save, Trash2, Play, ArrowLeft } from 'lucide-react';
import { api } from '@/lib/api';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';

export default function AgentDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [agent, setAgent] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    target_system: '',
    permissions: 'read-only',
    role: '',
    responsibilities: '',
    instructions: '',
    domains: [],
    config: {},
  });

  useEffect(() => {
    if (id !== 'new') {
      fetchAgent();
    } else {
      setIsLoading(false);
    }
  }, [id]);

  const fetchAgent = async () => {
    try {
      const data = await api.get(`/agents/${id}`);
      setAgent(data.agent);
      setFormData({
        name: data.agent.name || '',
        description: data.agent.description || '',
        target_system: data.agent.target_system || '',
        permissions: data.agent.permissions || 'read-only',
        role: data.agent.config?.role || '',
        responsibilities: data.agent.config?.responsibilities || '',
        instructions: data.agent.config?.instructions || '',
        domains: data.agent.domains ? JSON.parse(data.agent.domains) : [],
        config: data.agent.config ? JSON.parse(data.agent.config) : {},
      });
    } catch (error) {
      console.error('[AgentDetail] Failed to fetch agent:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const payload = {
        name: formData.name,
        description: formData.description,
        target_system: formData.target_system,
        permissions: formData.permissions,
        domains: formData.domains,
        config: {
          ...formData.config,
          role: formData.role,
          responsibilities: formData.responsibilities,
          instructions: formData.instructions,
        },
      };

      if (id === 'new') {
        await api.post('/agents', payload);
      } else {
        await api.put(`/agents/${id}`, payload);
      }

      navigate('/agents');
    } catch (error) {
      console.error('[AgentDetail] Failed to save:', error);
      alert('Failed to save agent: ' + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete "${formData.name}"? This cannot be undone.`)) return;

    try {
      await api.del(`/agents/${id}`);
      navigate('/agents');
    } catch (error) {
      console.error('[AgentDetail] Failed to delete:', error);
      alert('Failed to delete agent: ' + error.message);
    }
  };

  const addDomain = () => {
    const domain = prompt('Enter domain (e.g., sage300.example.com):');
    if (domain && !formData.domains.includes(domain)) {
      setFormData({
        ...formData,
        domains: [...formData.domains, domain],
      });
    }
  };

  const removeDomain = (domain) => {
    setFormData({
      ...formData,
      domains: formData.domains.filter((d) => d !== domain),
    });
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-text-muted">Loading agent...</div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto p-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/agents')}
              className="p-2 text-text-secondary hover:text-text-primary transition-colors"
            >
              <ArrowLeft size={20} />
            </button>
            <div>
              <h1 className="text-2xl font-semibold text-text-primary">
                {id === 'new' ? 'Create New Agent' : 'Edit Agent'}
              </h1>
              <p className="text-sm text-text-secondary mt-1">
                Configure roles, responsibilities, and automation instructions
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {id !== 'new' && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate('/', { state: { command: `/run ${formData.name} ` } })}
                >
                  <Play size={16} />
                  Test Run
                </Button>
                <Button variant="danger" size="sm" onClick={handleDelete}>
                  <Trash2 size={16} />
                  Delete
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Basic Info */}
        <div className="bg-bg-secondary border border-border rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-text-primary mb-4">Basic Information</h2>

          <Input
            label="Agent Name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="Invoice Extractor"
            required
          />

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Brief description of what this agent does..."
              rows={2}
              className="w-full px-3 py-2 bg-bg-elevated border border-border rounded-lg text-sm text-text-primary"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Target System"
              value={formData.target_system}
              onChange={(e) => setFormData({ ...formData, target_system: e.target.value })}
              placeholder="Sage 300, QuickBooks, etc."
            />

            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                Permissions
              </label>
              <select
                value={formData.permissions}
                onChange={(e) => setFormData({ ...formData, permissions: e.target.value })}
                className="w-full px-3 py-2 bg-bg-elevated border border-border rounded-lg text-sm text-text-primary"
              >
                <option value="read-only">Read-only</option>
                <option value="read-write">Read-write</option>
                <option value="form-submit">Form submit</option>
              </select>
            </div>
          </div>
        </div>

        {/* Role & Responsibilities */}
        <div className="bg-bg-secondary border border-border rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-text-primary mb-4">
            Role & Responsibilities
          </h2>

          <Input
            label="Role"
            value={formData.role}
            onChange={(e) => setFormData({ ...formData, role: e.target.value })}
            placeholder="e.g., AP Invoice Processor, Data Extraction Specialist"
          />

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              Responsibilities
            </label>
            <textarea
              value={formData.responsibilities}
              onChange={(e) => setFormData({ ...formData, responsibilities: e.target.value })}
              placeholder="What is this agent responsible for? (one per line)"
              rows={4}
              className="w-full px-3 py-2 bg-bg-elevated border border-border rounded-lg text-sm text-text-primary font-mono"
            />
            <p className="text-xs text-text-muted mt-1">
              Example: Extract invoices, Validate data format, Upload to accounting system
            </p>
          </div>
        </div>

        {/* Instructions */}
        <div className="bg-bg-secondary border border-border rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-text-primary mb-4">
            Agent Instructions
          </h2>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              System Instructions
            </label>
            <textarea
              value={formData.instructions}
              onChange={(e) => setFormData({ ...formData, instructions: e.target.value })}
              placeholder="Detailed instructions for how this agent should behave..."
              rows={8}
              className="w-full px-3 py-2 bg-bg-elevated border border-border rounded-lg text-sm text-text-primary font-mono"
            />
            <p className="text-xs text-text-muted mt-1">
              These instructions guide the AI agent's behavior during automation tasks
            </p>
          </div>
        </div>

        {/* Domain Allowlist */}
        <div className="bg-bg-secondary border border-border rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-text-primary">Allowed Domains</h2>
            <Button variant="outline" size="sm" onClick={addDomain}>
              + Add Domain
            </Button>
          </div>

          {formData.domains.length === 0 ? (
            <p className="text-sm text-text-muted">
              No domains configured. Agent can access any website.
            </p>
          ) : (
            <div className="space-y-2">
              {formData.domains.map((domain) => (
                <div
                  key={domain}
                  className="flex items-center justify-between px-4 py-3 bg-bg-elevated border border-border rounded-lg"
                >
                  <span className="text-sm text-text-primary font-mono">{domain}</span>
                  <button
                    onClick={() => removeDomain(domain)}
                    className="text-xs text-accent-danger hover:underline"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-text-muted">
            Restrict this agent to only these domains for security
          </p>
        </div>

        {/* Save/Cancel Actions */}
        <div className="flex items-center gap-4 sticky bottom-0 bg-bg-primary py-4">
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={isSaving || !formData.name}
            className="flex-1"
          >
            <Save size={16} />
            {isSaving ? 'Saving...' : id === 'new' ? 'Create Agent' : 'Save Changes'}
          </Button>
          <Button variant="ghost" onClick={() => navigate('/agents')}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
