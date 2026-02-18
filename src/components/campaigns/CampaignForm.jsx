/**
 * @file CampaignForm.jsx
 * @description Modal form for creating new campaigns.
 * Includes fields for name, company, type, color, icon, and description.
 */

import React, { useState } from 'react';
import { X } from 'lucide-react';
import { api } from '../../lib/api';

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
  '#3B82F6', // Blue
  '#10B981', // Green
  '#F59E0B', // Yellow
  '#EF4444', // Red
  '#8B5CF6', // Purple
  '#EC4899', // Pink
  '#06B6D4', // Cyan
  '#F97316', // Orange
];

const DEFAULT_ICONS = ['🎯', '🏠', '📊', '🚀', '💼', '📧', '📱', '🌐', '✨', '🔥'];

export function CampaignForm({ isOpen, onClose, onCreated }) {
  const [formData, setFormData] = useState({
    name: '',
    company: '',
    type: 'lead-gen',
    color: DEFAULT_COLORS[0],
    icon: DEFAULT_ICONS[0],
    description: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      const campaign = await api.post('/campaigns', formData);
      onCreated?.(campaign);
      onClose();
      // Reset form
      setFormData({
        name: '',
        company: '',
        type: 'lead-gen',
        color: DEFAULT_COLORS[0],
        icon: DEFAULT_ICONS[0],
        description: '',
      });
    } catch (err) {
      setError(err.message || 'Failed to create campaign');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-bg-elevated rounded-lg p-6 w-[600px] max-h-[90vh] overflow-y-auto shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-text-primary">
            Create New Campaign
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-bg-secondary rounded transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-text-muted" />
          </button>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-4 p-3 bg-accent-danger/10 border border-accent-danger/20 rounded-lg text-accent-danger text-sm">
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Campaign Name */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
              Campaign Name <span className="text-accent-danger">*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => handleChange('name', e.target.value)}
              className="w-full px-3 py-2 bg-bg-secondary rounded border border-border focus:border-accent-primary focus:outline-none text-text-primary"
              placeholder="HOA FL Lead Gen"
              required
            />
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
              className="w-full px-3 py-2 bg-bg-secondary rounded border border-border focus:border-accent-primary focus:outline-none text-text-primary"
              placeholder="HOA Project Funding"
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
              className="w-full px-3 py-2 bg-bg-secondary rounded border border-border focus:border-accent-primary focus:outline-none text-text-primary"
            >
              {CAMPAIGN_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          {/* Color + Icon */}
          <div className="grid grid-cols-2 gap-4">
            {/* Color Picker */}
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">
                Theme Color
              </label>
              <div className="space-y-2">
                <input
                  type="color"
                  value={formData.color}
                  onChange={(e) => handleChange('color', e.target.value)}
                  className="w-full h-10 rounded cursor-pointer"
                />
                <div className="grid grid-cols-4 gap-2">
                  {DEFAULT_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => handleChange('color', color)}
                      className="w-full h-8 rounded border-2 hover:scale-110 transition-transform"
                      style={{
                        backgroundColor: color,
                        borderColor:
                          formData.color === color ? '#fff' : 'transparent',
                      }}
                      aria-label={`Select color ${color}`}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Icon Picker */}
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">
                Campaign Icon
              </label>
              <div className="space-y-2">
                <input
                  type="text"
                  value={formData.icon}
                  onChange={(e) => handleChange('icon', e.target.value)}
                  className="w-full px-3 py-2 bg-bg-secondary rounded border border-border focus:border-accent-primary focus:outline-none text-text-primary text-center text-2xl"
                  maxLength={2}
                  placeholder="🎯"
                />
                <div className="grid grid-cols-5 gap-2">
                  {DEFAULT_ICONS.map((icon) => (
                    <button
                      key={icon}
                      type="button"
                      onClick={() => handleChange('icon', icon)}
                      className={`w-full h-8 rounded text-xl hover:bg-bg-secondary transition-colors ${
                        formData.icon === icon ? 'bg-bg-secondary' : ''
                      }`}
                      aria-label={`Select icon ${icon}`}
                    >
                      {icon}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
              Description (Optional)
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => handleChange('description', e.target.value)}
              className="w-full px-3 py-2 bg-bg-secondary rounded border border-border focus:border-accent-primary focus:outline-none text-text-primary resize-none"
              rows={3}
              placeholder="Optional description of this campaign..."
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t border-border">
            <button
              type="submit"
              disabled={isSubmitting || !formData.name || !formData.company}
              className="flex-1 px-4 py-2 bg-accent-primary text-white rounded-lg hover:bg-opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium"
            >
              {isSubmitting ? 'Creating...' : 'Create Campaign'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-bg-secondary text-text-secondary rounded-lg hover:bg-bg-primary transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
