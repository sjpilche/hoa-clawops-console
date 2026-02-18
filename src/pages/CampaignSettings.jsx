/**
 * @file CampaignSettings.jsx
 * @description Campaign settings and configuration page.
 */

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Save, Archive, Copy, Trash2 } from 'lucide-react';
import { useCampaign } from '../context/CampaignContext';
import { api } from '../lib/api';

const CAMPAIGN_TYPES = [
  { value: 'lead-gen', label: 'Lead Generation' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'trading', label: 'Trading' },
  { value: 'outreach', label: 'Outreach' },
  { value: 'content', label: 'Content Creation' },
  { value: 'social', label: 'Social Media' },
  { value: 'other', label: 'Other' },
];

const DEFAULT_COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444',
  '#8B5CF6', '#EC4899', '#06B6D4', '#F97316',
];

const DEFAULT_ICONS = ['🎯', '🏠', '📊', '🚀', '💼', '📧', '📱', '🌐', '✨', '🔥'];

export default function CampaignSettings() {
  const { campaignSlug } = useParams();
  const navigate = useNavigate();
  const { activeCampaign, activeCampaignId, refreshCampaigns } = useCampaign();

  const [formData, setFormData] = useState({
    name: '',
    company: '',
    type: 'lead-gen',
    color: DEFAULT_COLORS[0],
    icon: DEFAULT_ICONS[0],
    description: '',
    status: 'active',
  });

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    if (activeCampaign) {
      setFormData({
        name: activeCampaign.name || '',
        company: activeCampaign.company || '',
        type: activeCampaign.type || 'lead-gen',
        color: activeCampaign.color || DEFAULT_COLORS[0],
        icon: activeCampaign.icon || DEFAULT_ICONS[0],
        description: activeCampaign.description || '',
        status: activeCampaign.status || 'active',
      });
    }
  }, [activeCampaign]);

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');
    setIsSaving(true);

    try {
      await api.put(`/campaigns/${activeCampaignId}`, formData);
      setSuccessMessage('Campaign updated successfully!');
      await refreshCampaigns();

      // Clear success message after 3 seconds
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      setError(err.message || 'Failed to update campaign');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDuplicate = async () => {
    if (!confirm('Duplicate this campaign? This will copy the configuration and agent assignments, but not the data.')) {
      return;
    }

    try {
      const newName = prompt('Enter name for the duplicate campaign:', `${activeCampaign.name} (Copy)`);
      if (!newName) return;

      const newCompany = prompt('Enter company name:', activeCampaign.company);
      if (!newCompany) return;

      const duplicated = await api.post(`/campaigns/${activeCampaignId}/duplicate`, {
        newName,
        newCompany,
      });

      alert('Campaign duplicated successfully!');
      navigate(`/c/${duplicated.slug}`);
    } catch (err) {
      alert(`Failed to duplicate campaign: ${err.message}`);
    }
  };

  const handleArchive = async () => {
    if (!confirm('Archive this campaign? You can reactivate it later from the overview page.')) {
      return;
    }

    try {
      await api.delete(`/campaigns/${activeCampaignId}`);
      alert('Campaign archived successfully!');
      navigate('/');
    } catch (err) {
      alert(`Failed to archive campaign: ${err.message}`);
    }
  };

  if (!activeCampaign) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <p className="text-text-muted">Campaign not found</p>
          <Link to="/" className="text-accent-primary hover:underline mt-4 inline-block">
            Return to overview
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <Link
          to={`/c/${campaignSlug}`}
          className="p-2 hover:bg-bg-secondary rounded transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-text-muted" />
        </Link>
        <div className="flex-1">
          <h1 className="text-3xl font-bold text-text-primary">Campaign Settings</h1>
          <p className="text-text-muted mt-1">Configure your campaign details and preferences</p>
        </div>
      </div>

      {/* Success Message */}
      {successMessage && (
        <div className="mb-6 p-4 bg-accent-success/10 border border-accent-success/20 rounded-lg text-accent-success">
          {successMessage}
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="mb-6 p-4 bg-accent-danger/10 border border-accent-danger/20 rounded-lg text-accent-danger">
          {error}
        </div>
      )}

      {/* Settings Form */}
      <form onSubmit={handleSave} className="space-y-6">
        {/* Basic Information */}
        <div className="bg-bg-secondary rounded-lg p-6">
          <h2 className="text-lg font-semibold text-text-primary mb-4">Basic Information</h2>

          <div className="space-y-4">
            {/* Campaign Name */}
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">
                Campaign Name <span className="text-accent-danger">*</span>
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => handleChange('name', e.target.value)}
                className="w-full px-3 py-2 bg-bg-primary rounded border border-border focus:border-accent-primary focus:outline-none text-text-primary"
                required
              />
              <p className="text-xs text-text-muted mt-1">Note: Changing the name will not update the URL slug</p>
            </div>

            {/* Company */}
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">
                Company <span className="text-accent-danger">*</span>
              </label>
              <input
                type="text"
                value={formData.company}
                onChange={(e) => handleChange('company', e.target.value)}
                className="w-full px-3 py-2 bg-bg-primary rounded border border-border focus:border-accent-primary focus:outline-none text-text-primary"
                required
              />
            </div>

            {/* Campaign Type */}
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">
                Campaign Type
              </label>
              <select
                value={formData.type}
                onChange={(e) => handleChange('type', e.target.value)}
                className="w-full px-3 py-2 bg-bg-primary rounded border border-border focus:border-accent-primary focus:outline-none text-text-primary"
              >
                {CAMPAIGN_TYPES.map(type => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </select>
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => handleChange('description', e.target.value)}
                className="w-full px-3 py-2 bg-bg-primary rounded border border-border focus:border-accent-primary focus:outline-none text-text-primary resize-none"
                rows={3}
                placeholder="Optional description of this campaign..."
              />
            </div>
          </div>
        </div>

        {/* Appearance */}
        <div className="bg-bg-secondary rounded-lg p-6">
          <h2 className="text-lg font-semibold text-text-primary mb-4">Appearance</h2>

          <div className="grid grid-cols-2 gap-6">
            {/* Color */}
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                Theme Color
              </label>
              <div className="space-y-3">
                <input
                  type="color"
                  value={formData.color}
                  onChange={(e) => handleChange('color', e.target.value)}
                  className="w-full h-12 rounded cursor-pointer"
                />
                <div className="grid grid-cols-4 gap-2">
                  {DEFAULT_COLORS.map(color => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => handleChange('color', color)}
                      className="h-10 rounded border-2 hover:scale-110 transition-transform"
                      style={{
                        backgroundColor: color,
                        borderColor: formData.color === color ? '#fff' : 'transparent',
                      }}
                      aria-label={`Select color ${color}`}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Icon */}
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                Campaign Icon
              </label>
              <div className="space-y-3">
                <input
                  type="text"
                  value={formData.icon}
                  onChange={(e) => handleChange('icon', e.target.value)}
                  className="w-full px-3 py-2 bg-bg-primary rounded border border-border focus:border-accent-primary focus:outline-none text-text-primary text-center text-3xl"
                  maxLength={2}
                />
                <div className="grid grid-cols-5 gap-2">
                  {DEFAULT_ICONS.map(icon => (
                    <button
                      key={icon}
                      type="button"
                      onClick={() => handleChange('icon', icon)}
                      className={`h-10 rounded text-xl hover:bg-bg-primary transition-colors ${
                        formData.icon === icon ? 'bg-bg-primary' : ''
                      }`}
                    >
                      {icon}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Status */}
        <div className="bg-bg-secondary rounded-lg p-6">
          <h2 className="text-lg font-semibold text-text-primary mb-4">Status</h2>

          <div className="space-y-2">
            <label className="flex items-center gap-3 p-3 bg-bg-primary rounded cursor-pointer hover:bg-bg-elevated transition-colors">
              <input
                type="radio"
                name="status"
                value="active"
                checked={formData.status === 'active'}
                onChange={(e) => handleChange('status', e.target.value)}
                className="w-4 h-4"
              />
              <div>
                <div className="font-medium text-text-primary">Active</div>
                <div className="text-sm text-text-muted">Campaign is running normally</div>
              </div>
            </label>

            <label className="flex items-center gap-3 p-3 bg-bg-primary rounded cursor-pointer hover:bg-bg-elevated transition-colors">
              <input
                type="radio"
                name="status"
                value="paused"
                checked={formData.status === 'paused'}
                onChange={(e) => handleChange('status', e.target.value)}
                className="w-4 h-4"
              />
              <div>
                <div className="font-medium text-text-primary">Paused</div>
                <div className="text-sm text-text-muted">Campaign is temporarily stopped</div>
              </div>
            </label>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-6 border-t border-border">
          <button
            type="submit"
            disabled={isSaving}
            className="flex items-center gap-2 px-6 py-2 bg-accent-primary text-white rounded-lg hover:bg-opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium"
          >
            <Save className="w-4 h-4" />
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleDuplicate}
              className="flex items-center gap-2 px-4 py-2 bg-bg-secondary hover:bg-bg-primary rounded-lg transition-colors text-sm font-medium"
            >
              <Copy className="w-4 h-4" />
              Duplicate
            </button>

            <button
              type="button"
              onClick={handleArchive}
              className="flex items-center gap-2 px-4 py-2 bg-bg-secondary hover:bg-accent-danger hover:text-white rounded-lg transition-colors text-sm font-medium"
            >
              <Archive className="w-4 h-4" />
              Archive
            </button>
          </div>
        </div>
      </form>

      {/* Campaign Info */}
      <div className="mt-8 p-4 bg-bg-secondary rounded-lg text-sm">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="text-text-muted">Campaign ID:</span>
            <span className="ml-2 font-mono text-text-primary">{activeCampaign.id}</span>
          </div>
          <div>
            <span className="text-text-muted">URL Slug:</span>
            <span className="ml-2 font-mono text-text-primary">{activeCampaign.slug}</span>
          </div>
          <div>
            <span className="text-text-muted">Created:</span>
            <span className="ml-2 text-text-primary">
              {new Date(activeCampaign.created_at).toLocaleDateString()}
            </span>
          </div>
          <div>
            <span className="text-text-muted">Last Updated:</span>
            <span className="ml-2 text-text-primary">
              {new Date(activeCampaign.updated_at || activeCampaign.created_at).toLocaleDateString()}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
