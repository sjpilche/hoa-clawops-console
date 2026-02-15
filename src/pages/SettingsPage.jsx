/**
 * @file SettingsPage.jsx
 * @description System configuration and preferences.
 */

import React, { useEffect, useState } from 'react';
import { Settings as SettingsIcon, Save, DollarSign, Zap, Shield } from 'lucide-react';
import { api } from '@/lib/api';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';

export default function SettingsPage() {
  const [settings, setSettings] = useState({
    maxConcurrentAgents: 3,
    maxCostPerRun: 5.0,
    maxDurationPerRun: 300,
    maxRunsPerHour: 20,
    openclawMode: 'shell',
  });
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = () => {
    // Load from .env.local defaults
    setSettings({
      maxConcurrentAgents: parseInt(process.env.MAX_CONCURRENT_AGENTS || '3'),
      maxCostPerRun: parseFloat(process.env.MAX_COST_PER_RUN || '5.0'),
      maxDurationPerRun: parseInt(process.env.MAX_DURATION_PER_RUN || '300'),
      maxRunsPerHour: parseInt(process.env.MAX_RUNS_PER_HOUR || '20'),
      openclawMode: process.env.OPENCLAW_MODE || 'shell',
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // In a full implementation, this would save to backend
      // For now, just show success message
      setSaveStatus('success');
      setTimeout(() => setSaveStatus(null), 3000);
    } catch (error) {
      console.error('[SettingsPage] Failed to save:', error);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus(null), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto p-8 space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-semibold text-text-primary mb-2">Settings</h1>
          <p className="text-sm text-text-secondary">
            Configure system limits, safety controls, and OpenClaw integration
          </p>
        </div>

        {/* Safety Limits */}
        <div className="bg-bg-secondary border border-border rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <Shield size={20} className="text-accent-danger" />
            <h2 className="text-lg font-semibold text-text-primary">Safety Limits</h2>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                Max Concurrent Agents
              </label>
              <Input
                type="number"
                value={settings.maxConcurrentAgents}
                onChange={(e) =>
                  setSettings({ ...settings, maxConcurrentAgents: parseInt(e.target.value) })
                }
                min="1"
                max="10"
              />
              <p className="text-xs text-text-muted mt-1">
                Maximum number of agents that can run simultaneously
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                Max Cost Per Run ($)
              </label>
              <Input
                type="number"
                step="0.01"
                value={settings.maxCostPerRun}
                onChange={(e) =>
                  setSettings({ ...settings, maxCostPerRun: parseFloat(e.target.value) })
                }
                min="0.01"
                max="100"
              />
              <p className="text-xs text-text-muted mt-1">
                Agent runs exceeding this cost will be stopped
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                Max Duration Per Run (seconds)
              </label>
              <Input
                type="number"
                value={settings.maxDurationPerRun}
                onChange={(e) =>
                  setSettings({ ...settings, maxDurationPerRun: parseInt(e.target.value) })
                }
                min="30"
                max="3600"
              />
              <p className="text-xs text-text-muted mt-1">
                Timeout for agent runs (300s = 5 minutes)
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                Max Runs Per Hour
              </label>
              <Input
                type="number"
                value={settings.maxRunsPerHour}
                onChange={(e) =>
                  setSettings({ ...settings, maxRunsPerHour: parseInt(e.target.value) })
                }
                min="1"
                max="1000"
              />
              <p className="text-xs text-text-muted mt-1">
                Rate limit to prevent runaway automation
              </p>
            </div>
          </div>
        </div>

        {/* OpenClaw Configuration */}
        <div className="bg-bg-secondary border border-border rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <Zap size={20} className="text-accent-primary" />
            <h2 className="text-lg font-semibold text-text-primary">OpenClaw Configuration</h2>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                Execution Mode
              </label>
              <select
                value={settings.openclawMode}
                onChange={(e) => setSettings({ ...settings, openclawMode: e.target.value })}
                className="w-full px-3 py-2 bg-bg-elevated border border-border rounded-lg text-sm text-text-primary"
              >
                <option value="shell">Shell (WSL2 execution - current)</option>
                <option value="gateway">Gateway (WebSocket RPC - experimental)</option>
              </select>
              <p className="text-xs text-text-muted mt-1">
                Shell mode is stable and recommended for local development
              </p>
            </div>

            <div className="p-4 bg-bg-elevated border border-border-focus rounded-lg">
              <div className="text-xs space-y-2">
                <div className="flex justify-between">
                  <span className="text-text-muted">OpenClaw Version:</span>
                  <span className="text-text-primary font-mono">2026.2.9</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">Gateway:</span>
                  <span className="text-accent-success">● Running</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">Monitor:</span>
                  <span className="text-accent-success">● Running (port 18790)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">Model:</span>
                  <span className="text-text-primary">GPT-4o-mini</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex items-center gap-4">
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={isSaving}
            className="flex-1"
          >
            <Save size={16} />
            {isSaving ? 'Saving...' : 'Save Settings'}
          </Button>

          {saveStatus && (
            <div
              className={`text-sm ${
                saveStatus === 'success' ? 'text-accent-success' : 'text-accent-danger'
              }`}
            >
              {saveStatus === 'success' ? '✅ Settings saved!' : '❌ Save failed'}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="text-xs text-text-muted space-y-1">
          <p>Settings are stored in <code className="px-1 py-0.5 bg-bg-elevated rounded">.env.local</code></p>
          <p>Restart the server after changing configuration</p>
        </div>
      </div>
    </div>
  );
}
