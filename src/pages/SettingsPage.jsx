/**
 * @file SettingsPage.jsx
 * @description Enterprise system configuration — loads from and saves to SQLite via /api/settings.
 *
 * Sections:
 *  1. Safety & Rate Limits   — concurrency, cost caps, timeouts
 *  2. AI / OpenClaw Config   — execution mode, model, API URL
 *  3. Cost Management        — warning thresholds, budget alerts
 *  4. Logging & Audit        — log level, audit trail toggle
 *  5. Data Retention         — auto-purge window
 *  6. Integrations           — notification email, Slack webhook
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Shield, Zap, DollarSign, FileText, Database,
  Bell, Save, RefreshCw, CheckCircle, AlertCircle,
  ChevronRight, Info, Cpu, Clock, Activity
} from 'lucide-react';
import { api } from '../lib/api';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseValue(raw) {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  const n = Number(raw);
  if (!isNaN(n) && raw !== '') return n;
  return raw;
}

function toApiValue(val) {
  if (typeof val === 'boolean') return String(val);
  return String(val);
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function Section({ icon: Icon, title, description, color = 'accent-primary', children, badge }) {
  return (
    <div className="bg-bg-secondary border border-border rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg bg-${color}/10 flex items-center justify-center`}>
            <Icon size={16} className={`text-${color}`} />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
            {description && <p className="text-xs text-text-muted mt-0.5">{description}</p>}
          </div>
        </div>
        {badge && (
          <span className="px-2 py-0.5 text-xs rounded-full bg-accent-success/10 text-accent-success font-medium">
            {badge}
          </span>
        )}
      </div>
      <div className="p-6 space-y-5">{children}</div>
    </div>
  );
}

function SettingRow({ label, hint, children }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[1fr_240px] gap-3 items-start">
      <div>
        <div className="text-sm font-medium text-text-primary">{label}</div>
        {hint && <div className="text-xs text-text-muted mt-0.5">{hint}</div>}
      </div>
      <div>{children}</div>
    </div>
  );
}

function NumberInput({ value, onChange, min, max, step = 1, prefix, suffix }) {
  return (
    <div className="flex items-center gap-1">
      {prefix && <span className="text-sm text-text-muted">{prefix}</span>}
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(step < 1 ? parseFloat(e.target.value) : parseInt(e.target.value))}
        min={min}
        max={max}
        step={step}
        className="w-full px-3 py-2 bg-bg-elevated border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:border-accent-primary transition-colors"
      />
      {suffix && <span className="text-sm text-text-muted whitespace-nowrap">{suffix}</span>}
    </div>
  );
}

function TextInput({ value, onChange, placeholder, type = 'text' }) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-3 py-2 bg-bg-elevated border border-border rounded-lg text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent-primary transition-colors"
    />
  );
}

function SelectInput({ value, onChange, options }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2 bg-bg-elevated border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:border-accent-primary transition-colors"
    >
      {options.map(({ value: v, label }) => (
        <option key={v} value={v}>{label}</option>
      ))}
    </select>
  );
}

function Toggle({ value, onChange, label }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
        value ? 'bg-accent-success' : 'bg-bg-elevated border border-border'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          value ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

function StatusBadge({ status, label }) {
  const colors = {
    success: 'bg-accent-success/10 text-accent-success',
    warning: 'bg-accent-warning/10 text-accent-warning',
    error: 'bg-accent-danger/10 text-accent-danger',
    info: 'bg-accent-info/10 text-accent-info',
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${colors[status]}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [settings, setSettings] = useState({
    // Safety
    max_concurrent_agents: 3,
    max_cost_per_run: 5.0,
    max_duration_per_run: 300,
    max_tokens_per_run: 100000,
    max_runs_per_hour: 20,
    // AI / OpenClaw
    openclaw_mode: 'openai',
    openclaw_api_url: 'http://localhost:8000',
    default_model: 'gpt-4o',
    // Cost
    enable_cost_warnings: true,
    cost_warning_threshold: 2.0,
    // Logging
    log_level: 'info',
    enable_audit_logging: true,
    // Data
    data_retention_days: 90,
    // Integrations
    notification_email: '',
    slack_webhook_url: '',
  });

  const [original, setOriginal] = useState(null); // Last saved snapshot for dirty tracking
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState(null); // null | 'success' | 'error'
  const [saveMessage, setSaveMessage] = useState('');

  // Load settings from API on mount
  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const res = await api.get('/settings');
      const map = res.settings || {};
      const parsed = {};
      for (const [key, meta] of Object.entries(map)) {
        parsed[key] = parseValue(meta.value);
      }
      setSettings(prev => ({ ...prev, ...parsed }));
      setOriginal({ ...settings, ...parsed });
    } catch (err) {
      console.error('[Settings] Load failed:', err);
    } finally {
      setLoading(false);
    }
  };

  const set = useCallback((key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  }, []);

  // Compute which settings have changed
  const isDirty = original && Object.entries(settings).some(
    ([k, v]) => String(v) !== String(original[k] ?? v)
  );

  const handleSave = async () => {
    setSaving(true);
    setSaveResult(null);
    try {
      const payload = {};
      for (const [k, v] of Object.entries(settings)) {
        payload[k] = toApiValue(v);
      }
      const res = await api.put('/settings', payload);
      if (res.errors && res.errors.length > 0) {
        setSaveResult('warning');
        setSaveMessage(`Saved ${res.saved?.length ?? 0} settings. Errors: ${res.errors.join(', ')}`);
      } else {
        setSaveResult('success');
        setSaveMessage(`${res.saved?.length ?? Object.keys(payload).length} settings saved`);
        setOriginal({ ...settings });
      }
    } catch (err) {
      setSaveResult('error');
      setSaveMessage(err.message || 'Failed to save settings');
    } finally {
      setSaving(false);
      setTimeout(() => setSaveResult(null), 4000);
    }
  };

  const handleReset = () => {
    if (original) {
      setSettings({ ...original });
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-bg-primary">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-accent-primary mb-3" />
          <p className="text-sm text-text-muted">Loading settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-bg-primary">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border bg-bg-secondary flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Settings</h1>
          <p className="mt-0.5 text-sm text-text-muted">System configuration and operational limits</p>
        </div>
        <div className="flex items-center gap-3">
          {isDirty && (
            <span className="text-xs text-accent-warning font-medium px-2 py-1 rounded-full bg-accent-warning/10">
              Unsaved changes
            </span>
          )}
          {saveResult && (
            <div className={`flex items-center gap-2 text-sm ${
              saveResult === 'success' ? 'text-accent-success' :
              saveResult === 'warning' ? 'text-accent-warning' : 'text-accent-danger'
            }`}>
              {saveResult === 'success'
                ? <CheckCircle size={15} />
                : <AlertCircle size={15} />}
              {saveMessage}
            </div>
          )}
          <button
            onClick={handleReset}
            disabled={!isDirty || saving}
            className="px-3 py-1.5 text-sm border border-border rounded-lg text-text-secondary hover:bg-bg-elevated disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
          >
            <RefreshCw size={13} />
            Reset
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-1.5 text-sm bg-accent-primary text-white rounded-lg hover:bg-opacity-90 disabled:opacity-60 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5 font-medium"
          >
            <Save size={13} />
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto space-y-6">

          {/* ── 1. Safety & Rate Limits ── */}
          <Section
            icon={Shield}
            color="accent-danger"
            title="Safety & Rate Limits"
            description="Hard stops that prevent runaway automation and unexpected costs"
          >
            <SettingRow
              label="Max Concurrent Agents"
              hint="How many agents can run in parallel at any moment"
            >
              <NumberInput
                value={settings.max_concurrent_agents}
                onChange={(v) => set('max_concurrent_agents', v)}
                min={1} max={20}
                suffix="agents"
              />
            </SettingRow>

            <div className="border-t border-border" />

            <SettingRow
              label="Max Cost Per Run"
              hint="Agent run is killed if it exceeds this spend in a single execution"
            >
              <NumberInput
                value={settings.max_cost_per_run}
                onChange={(v) => set('max_cost_per_run', v)}
                min={0.01} max={100} step={0.01}
                prefix="$"
                suffix="USD"
              />
            </SettingRow>

            <div className="border-t border-border" />

            <SettingRow
              label="Max Duration Per Run"
              hint="Execution timeout — agent is force-stopped after this"
            >
              <NumberInput
                value={settings.max_duration_per_run}
                onChange={(v) => set('max_duration_per_run', v)}
                min={30} max={3600}
                suffix="seconds"
              />
            </SettingRow>

            <div className="border-t border-border" />

            <SettingRow
              label="Max Tokens Per Run"
              hint="Token budget per agent execution (input + output combined)"
            >
              <NumberInput
                value={settings.max_tokens_per_run}
                onChange={(v) => set('max_tokens_per_run', v)}
                min={1000} max={1000000}
                suffix="tokens"
              />
            </SettingRow>

            <div className="border-t border-border" />

            <SettingRow
              label="Max Runs Per Hour"
              hint="Rate limit — prevents scheduler runaway or manual trigger spam"
            >
              <NumberInput
                value={settings.max_runs_per_hour}
                onChange={(v) => set('max_runs_per_hour', v)}
                min={1} max={1000}
                suffix="runs / hr"
              />
            </SettingRow>
          </Section>

          {/* ── 2. AI / OpenClaw Configuration ── */}
          <Section
            icon={Zap}
            color="accent-primary"
            title="AI Engine"
            description="How ClawOps connects to the LLM and executes agents"
            badge={settings.openclaw_mode === 'openai' ? 'OpenAI Mode' : 'Shell Mode'}
          >
            <SettingRow
              label="Execution Mode"
              hint={
                settings.openclaw_mode === 'openai'
                  ? 'Calls OpenAI GPT API directly with SOUL.md as system prompt — proven working'
                  : 'Runs openclaw CLI in shell — requires WSL2 on Windows'
              }
            >
              <SelectInput
                value={settings.openclaw_mode}
                onChange={(v) => set('openclaw_mode', v)}
                options={[
                  { value: 'openai', label: 'OpenAI Direct (recommended)' },
                  { value: 'shell', label: 'Shell / CLI (WSL2 required)' },
                  { value: 'gateway', label: 'Gateway WebSocket (experimental)' },
                ]}
              />
            </SettingRow>

            <div className="border-t border-border" />

            <SettingRow
              label="Default Model"
              hint="LLM model used when agents don't specify their own"
            >
              <SelectInput
                value={settings.default_model}
                onChange={(v) => set('default_model', v)}
                options={[
                  { value: 'gpt-4o', label: 'GPT-4o (~$0.025/run)' },
                  { value: 'gpt-4o-mini', label: 'GPT-4o Mini (~$0.003/run)' },
                  { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
                  { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo (cheapest)' },
                ]}
              />
            </SettingRow>

            <div className="border-t border-border" />

            <SettingRow
              label="OpenClaw API URL"
              hint="Only used in gateway/shell mode — ignored in openai mode"
            >
              <TextInput
                value={settings.openclaw_api_url}
                onChange={(v) => set('openclaw_api_url', v)}
                placeholder="http://localhost:8000"
              />
            </SettingRow>

            {/* Status info box */}
            <div className="rounded-lg border border-border bg-bg-elevated px-4 py-3 text-xs space-y-2 mt-1">
              <div className="flex items-center justify-between">
                <span className="text-text-muted">Active Mode</span>
                <StatusBadge status="success" label={settings.openclaw_mode === 'openai' ? 'OpenAI Direct' : settings.openclaw_mode} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-text-muted">Active Model</span>
                <span className="text-text-primary font-mono">{settings.default_model}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-text-muted">SOUL.md Path</span>
                <span className="text-text-secondary font-mono">openclaw-skills/{'{'}agent-id{'}'}/SOUL.md</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-text-muted">Avg Cost / Run</span>
                <span className="text-accent-success font-medium">~$0.025</span>
              </div>
            </div>
          </Section>

          {/* ── 3. Cost Management ── */}
          <Section
            icon={DollarSign}
            color="accent-warning"
            title="Cost Management"
            description="Budget tracking, warnings, and spend alerts"
          >
            <SettingRow label="Cost Warnings" hint="Flash an alert in the Console when a run approaches the limit">
              <div className="flex items-center gap-3">
                <Toggle
                  value={settings.enable_cost_warnings}
                  onChange={(v) => set('enable_cost_warnings', v)}
                />
                <span className="text-sm text-text-secondary">
                  {settings.enable_cost_warnings ? 'Enabled' : 'Disabled'}
                </span>
              </div>
            </SettingRow>

            <div className="border-t border-border" />

            <SettingRow
              label="Warning Threshold"
              hint="Show a warning when a single run exceeds this cost"
            >
              <NumberInput
                value={settings.cost_warning_threshold}
                onChange={(v) => set('cost_warning_threshold', v)}
                min={0.01} max={100} step={0.01}
                prefix="$"
                suffix="USD"
              />
            </SettingRow>
          </Section>

          {/* ── 4. Logging & Audit ── */}
          <Section
            icon={Activity}
            color="accent-info"
            title="Logging & Audit Trail"
            description="Control what gets logged and retained in the audit log"
          >
            <SettingRow
              label="Audit Logging"
              hint="Record every agent action, approval, and system event to the audit trail"
            >
              <div className="flex items-center gap-3">
                <Toggle
                  value={settings.enable_audit_logging}
                  onChange={(v) => set('enable_audit_logging', v)}
                />
                <span className="text-sm text-text-secondary">
                  {settings.enable_audit_logging ? 'Enabled' : 'Disabled'}
                </span>
              </div>
            </SettingRow>

            <div className="border-t border-border" />

            <SettingRow
              label="Log Level"
              hint="Verbosity of server-side logging — debug is noisy, error is quiet"
            >
              <SelectInput
                value={settings.log_level}
                onChange={(v) => set('log_level', v)}
                options={[
                  { value: 'error', label: 'Error — Failures only' },
                  { value: 'warn', label: 'Warn — Failures + warnings' },
                  { value: 'info', label: 'Info — Standard (recommended)' },
                  { value: 'debug', label: 'Debug — Verbose (noisy)' },
                ]}
              />
            </SettingRow>
          </Section>

          {/* ── 5. Data Retention ── */}
          <Section
            icon={Database}
            color="accent-primary"
            title="Data Retention"
            description="Auto-purge old records to keep the database lean"
          >
            <SettingRow
              label="Retention Window"
              hint="Agent run records, results, and costs older than this will be automatically purged"
            >
              <NumberInput
                value={settings.data_retention_days}
                onChange={(v) => set('data_retention_days', v)}
                min={7} max={730}
                suffix="days"
              />
            </SettingRow>

            <div className="rounded-lg bg-accent-info/5 border border-accent-info/20 px-4 py-3 flex gap-2 mt-1">
              <Info size={14} className="text-accent-info mt-0.5 shrink-0" />
              <p className="text-xs text-text-secondary">
                HOA lead data, communities, and contact records are <strong>never auto-purged</strong>.
                Only run logs, cost records, and temporary results are affected.
              </p>
            </div>
          </Section>

          {/* ── 6. Integrations & Notifications ── */}
          <Section
            icon={Bell}
            color="accent-success"
            title="Notifications & Integrations"
            description="Alert channels for system events, errors, and cost overruns"
          >
            <SettingRow
              label="Notification Email"
              hint="Receive alerts when agent runs fail or cost limits are hit (leave blank to disable)"
            >
              <TextInput
                type="email"
                value={settings.notification_email}
                onChange={(v) => set('notification_email', v)}
                placeholder="alerts@yourcompany.com"
              />
            </SettingRow>

            <div className="border-t border-border" />

            <SettingRow
              label="Slack Webhook URL"
              hint="Post agent completion summaries to a Slack channel (leave blank to disable)"
            >
              <TextInput
                value={settings.slack_webhook_url}
                onChange={(v) => set('slack_webhook_url', v)}
                placeholder="https://hooks.slack.com/services/..."
              />
            </SettingRow>
          </Section>

          {/* ── Footer ── */}
          <div className="text-xs text-text-muted space-y-1 pb-4">
            <p>Settings persist in SQLite — no restart required for most changes.</p>
            <p>
              Environment variables in <code className="px-1 py-0.5 bg-bg-elevated rounded font-mono">.env.local</code> override DB settings for API keys and secrets.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
