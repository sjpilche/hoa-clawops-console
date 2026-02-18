/**
 * @file AgentAssigner.jsx
 * @description Modal for assigning agent templates to campaigns.
 */

import React, { useState, useEffect } from 'react';
import { Plus, X, Search } from 'lucide-react';
import { api } from '../../lib/api';

const CATEGORY_LABELS = {
  'lead-gen': 'Lead Generation',
  'content': 'Content Creation',
  'social': 'Social Media',
  'outreach': 'Outreach',
  'networking': 'Networking',
  'engagement': 'Engagement',
  'trading': 'Trading',
  'general': 'General',
};

export function AgentAssigner({ campaignId, isOpen, onClose, onAssigned }) {
  const [availableTemplates, setAvailableTemplates] = useState([]);
  const [selectedTemplates, setSelectedTemplates] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen && campaignId) {
      fetchAvailableAgents();
    }
  }, [isOpen, campaignId]);

  const fetchAvailableAgents = async () => {
    try {
      setIsLoading(true);
      setError('');
      const data = await api.get(`/campaigns/${campaignId}/available-agents`);
      setAvailableTemplates(data.available || []);
    } catch (err) {
      console.error('Failed to fetch available agents:', err);
      setError(err.message || 'Failed to load available agents');
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleTemplate = (templateId) => {
    setSelectedTemplates(prev =>
      prev.includes(templateId)
        ? prev.filter(id => id !== templateId)
        : [...prev, templateId]
    );
  };

  const handleAssign = async () => {
    if (selectedTemplates.length === 0) return;

    try {
      setIsAssigning(true);
      setError('');

      // Assign each selected template
      for (const templateId of selectedTemplates) {
        const template = availableTemplates.find(t => t.id === templateId);
        if (!template) continue;

        await api.post(`/campaigns/${campaignId}/agents`, {
          agentType: template.id,
          agentName: template.name,
          schedule: template.defaultSchedule || 'manual',
          config: {},
        });
      }

      // Success! Call callback and close
      onAssigned?.();
      handleClose();
    } catch (err) {
      console.error('Failed to assign agents:', err);
      setError(err.message || 'Failed to assign agents');
    } finally {
      setIsAssigning(false);
    }
  };

  const handleClose = () => {
    setSelectedTemplates([]);
    setSearchQuery('');
    setError('');
    onClose();
  };

  if (!isOpen) return null;

  // Filter templates by search query
  const filteredTemplates = availableTemplates.filter(template =>
    template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    template.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
    template.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Group by category
  const templatesByCategory = filteredTemplates.reduce((acc, template) => {
    const category = template.category || 'general';
    if (!acc[category]) acc[category] = [];
    acc[category].push(template);
    return acc;
  }, {});

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-bg-elevated rounded-lg w-full max-w-3xl max-h-[90vh] flex flex-col shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div>
            <h2 className="text-xl font-bold text-text-primary">
              Assign Agents to Campaign
            </h2>
            <p className="text-sm text-text-muted mt-1">
              Select agent templates to add to this campaign
            </p>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-bg-secondary rounded transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-text-muted" />
          </button>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-2 px-3 py-2 bg-bg-secondary rounded">
            <Search className="w-4 h-4 text-text-muted" />
            <input
              type="text"
              placeholder="Search agents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 bg-transparent border-0 outline-none text-sm text-text-primary placeholder-text-muted"
            />
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mx-4 mt-4 p-3 bg-accent-danger/10 border border-accent-danger/20 rounded-lg text-accent-danger text-sm">
            {error}
          </div>
        )}

        {/* Template List */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="text-center py-12">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-accent-primary border-r-transparent mb-4"></div>
              <p className="text-text-muted">Loading agents...</p>
            </div>
          ) : availableTemplates.length === 0 ? (
            <div className="text-center py-12">
              <Plus className="w-12 h-12 text-text-muted mx-auto mb-3 opacity-50" />
              <p className="text-text-muted mb-2">No available agents</p>
              <p className="text-xs text-text-muted">
                All agents have already been assigned to this campaign
              </p>
            </div>
          ) : filteredTemplates.length === 0 ? (
            <div className="text-center py-12">
              <Search className="w-12 h-12 text-text-muted mx-auto mb-3 opacity-50" />
              <p className="text-text-muted">No agents match your search</p>
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(templatesByCategory).map(([category, templates]) => (
                <div key={category}>
                  <h3 className="text-sm font-semibold text-text-secondary mb-3 uppercase tracking-wide">
                    {CATEGORY_LABELS[category] || category}
                  </h3>
                  <div className="space-y-2">
                    {templates.map((template) => (
                      <label
                        key={template.id}
                        className="flex items-start gap-3 p-4 bg-bg-secondary rounded hover:bg-bg-primary cursor-pointer transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={selectedTemplates.includes(template.id)}
                          onChange={() => handleToggleTemplate(template.id)}
                          className="mt-1 rounded"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-text-primary mb-1">
                            {template.name}
                          </div>
                          <div className="text-sm text-text-muted line-clamp-2">
                            {template.description}
                          </div>
                          <div className="flex items-center gap-2 mt-2">
                            <span className="text-xs px-2 py-0.5 bg-bg-elevated rounded text-text-muted">
                              {CATEGORY_LABELS[template.category] || template.category}
                            </span>
                            <span className="text-xs text-text-muted">
                              Default: {template.defaultSchedule}
                            </span>
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border flex items-center justify-between">
          <div className="text-sm text-text-muted">
            {selectedTemplates.length} agent{selectedTemplates.length !== 1 ? 's' : ''} selected
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleClose}
              className="px-4 py-2 bg-bg-secondary hover:bg-bg-primary rounded-lg transition-colors text-sm font-medium"
            >
              Cancel
            </button>
            <button
              onClick={handleAssign}
              disabled={selectedTemplates.length === 0 || isAssigning}
              className="px-4 py-2 bg-accent-primary text-white rounded-lg hover:bg-opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-sm font-medium"
            >
              {isAssigning
                ? 'Assigning...'
                : `Assign ${selectedTemplates.length || ''} Agent${selectedTemplates.length !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
