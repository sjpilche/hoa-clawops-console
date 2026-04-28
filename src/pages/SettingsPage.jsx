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
  ChevronRight, Info, Cpu, Clock, Activity,
  Archive, Search, HardDrive, AlertTriangle
} from 'lucide-react';
import { api } from '../lib/api';
import Badge from '@/components/ui/Badge';

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
    // Ollama
    ollama_enabled: false,
    ollama_model: 'llama3.2:3b',
    ollama_host: 'http://localhost:11434',
  });

  const [original, setOriginal] = useState(null); // Last saved snapshot for dirty tracking
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState(null); // null | 'success' | 'error'
  const [saveMessage, setSaveMessage] = useState('');

  // ── System panel state ────────────────────────────────────────────────────
  const [backupStatus, setBackupStatus] = useState(null);  // { status, latest_backup, days_since_backup, backup_count }
  const [backupRunning, setBackupRunning] = useState(false);
  const [backupMsg, setBackupMsg] = useState(null);        // { type: 'success'|'error', text }
  const [approvalCount, setApprovalCount] = useState(null); // number | null
  const [memQuery, setMemQuery] = useState('');
  const [memResults, setMemResults] = useState(null);      // null | { results, total, query }
  const [memSearching, setMemSearching] = useState(false);

  // Load settings + system status on mount
  useEffect(() => {
    loadSettings();
    loadBackupStatus();
    loadApprovals();
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

  // ── Ollama state ──────────────────────────────────────────────────────────
  const [ollamaStatus, setOllamaStatus] = useState(null); // { available, models }

  useEffect(() => {
    loadOllamaStatus();
  }, []);

  const loadOllamaStatus = async () => {
    try {
      const res = await api.get('/openclaw/ollama/status');
      setOllamaStatus(res);
    } catch { setOllamaStatus({ available: false, models: [] }); }
  };

  // ── System helpers ────────────────────────────────────────────────────────

  const loadBackupStatus = async () => {
    try {
      const res = await api.get('/openclaw/backup/status');
      setBackupStatus(res);
    } catch { /* non-fatal */ }
  };

  const loadApprovals = async () => {
    try {
      const res = await api.get('/openclaw/approvals');
      setApprovalCount(res.pending_count ?? 0);
    } catch { /* non-fatal */ }
  };

  const handleBackupNow = async () => {
    setBackupRunning(true);
    setBackupMsg(null);
    try {
      const res = await api.post('/openclaw/backup', { label: `console-${new Date().toISOString().slice(0,10)}` });
      if (res.success) {
        setBackupMsg({ type: 'success', text: `Backup created${res.latest_backup ? ` — ${res.latest_backup.name}` : ''}` });
        await loadBackupStatus();
      } else {
        setBackupMsg({ type: 'error', text: res.output || 'Backup failed' });
      }
    } catch (err) {
      setBackupMsg({ type: 'error', text: err.message || 'Backup failed' });
    } finally {
      setBackupRunning(false);
      setTimeout(() => setBackupMsg(null), 6000);
    }
  };

  const handleMemSearch = async (e) => {
    e.preventDefault();
    if (!memQuery.trim()) return;
    setMemSearching(true);
    setMemResults(null);
    try {
      const res = await api.get(`/openclaw/memory/search?q=${encodeURIComponent(memQuery)}&limit=20`);
      setMemResults(res);
    } catch (err) {
      setMemResults({ error: err.message, results: [], total: 0, query: memQuery });
    } finally {
      setMemSearching(false);
    }
  };

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

          {/* ── 2b. Local Ollama (free inference) ── */}
          <Section
            icon={Cpu}
            color="accent-success"
            title="Local Ollama"
            description="Route eligible agents through local llama3.2:3b — zero API cost"
            badge={
              ollamaStatus === null ? null :
              ollamaStatus.available ? 'Connected' : 'Offline'
            }
          >
            <SettingRow
              label="Enable Ollama"
              hint="Agents tagged use_ollama:true in their config will use local inference instead of OpenAI"
            >
              <div className="flex items-center gap-3">
                <Toggle
                  value={settings.ollama_enabled}
                  onChange={(v) => set('ollama_enabled', v)}
                />
                <span className="text-sm text-text-secondary">
                  {settings.ollama_enabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>
            </SettingRow>

            <div className="border-t border-border" />

            <SettingRow
              label="Default Model"
              hint="Model to use when agents don't specify one — must be pulled in Ollama"
            >
              <SelectInput
                value={settings.ollama_model}
                onChange={(v) => set('ollama_model', v)}
                options={[
                  ...(ollamaStatus?.models || []).map(m => ({ value: m, label: m })),
                  ...(ollamaStatus?.models?.length === 0 ? [{ value: 'llama3.2:3b', label: 'llama3.2:3b (default)' }] : []),
                ]}
              />
            </SettingRow>

            <div className="border-t border-border" />

            <SettingRow label="Ollama Host" hint="Only change if Ollama is on a different machine or port">
              <TextInput
                value={settings.ollama_host}
                onChange={(v) => set('ollama_host', v)}
                placeholder="http://localhost:11434"
              />
            </SettingRow>

            {/* Status box */}
            <div className="rounded-lg border border-border bg-bg-elevated px-4 py-3 text-xs space-y-2 mt-1">
              <div className="flex items-center justify-between">
                <span className="text-text-muted">Status</span>
                {ollamaStatus === null
                  ? <span className="text-text-muted">Checking…</span>
                  : ollamaStatus.available
                  ? <StatusBadge status="success" label="Ollama reachable" />
                  : <StatusBadge status="error" label="Ollama offline" />
                }
              </div>
              <div className="flex items-center justify-between">
                <span className="text-text-muted">Loaded models</span>
                <span className="text-text-primary font-mono">
                  {ollamaStatus?.models?.join(', ') || '—'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-text-muted">Cost per run</span>
                <span className="text-accent-success font-medium">$0.00</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-text-muted">Best for</span>
                <span className="text-text-secondary">debrief · digest · follow-up drafts</span>
              </div>
              <button
                onClick={loadOllamaStatus}
                className="text-xs text-text-muted hover:text-text-primary flex items-center gap-1 transition-colors pt-1"
              >
                <RefreshCw size={10} />
                Refresh status
              </button>
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

          {/* ── 7. System — Backup, Approvals, Memory Search ── */}
          <Section
            icon={HardDrive}
            color="accent-warning"
            title="System"
            description="OpenClaw backup, pending approvals, and memory inspector"
            badge={approvalCount > 0 ? `${approvalCount} pending` : null}
          >
            {/* Backup widget */}
            <SettingRow
              label="OpenClaw Backup"
              hint={
                backupStatus
                  ? backupStatus.status === 'never'
                    ? 'No backups found — create one now'
                    : backupStatus.status === 'recent'
                    ? `Last backup: ${backupStatus.days_since_backup === 0 ? 'today' : `${backupStatus.days_since_backup}d ago`} (${backupStatus.backup_count} total)`
                    : backupStatus.status === 'stale'
                    ? `⚠ Last backup ${backupStatus.days_since_backup}d ago — consider backing up`
                    : `Last backup ${backupStatus.days_since_backup ?? '?'}d ago`
                  : 'Click to check backup status'
              }
            >
              <div className="flex items-center gap-2">
                {backupMsg && (
                  <span className={`text-xs ${backupMsg.type === 'success' ? 'text-accent-success' : 'text-accent-danger'}`}>
                    {backupMsg.text}
                  </span>
                )}
                <button
                  onClick={handleBackupNow}
                  disabled={backupRunning}
                  className="px-3 py-1.5 text-sm bg-accent-warning/10 border border-accent-warning/30 text-accent-warning rounded-lg hover:bg-accent-warning/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5 font-medium whitespace-nowrap"
                >
                  <Archive size={13} />
                  {backupRunning ? 'Backing up…' : 'Backup Now'}
                </button>
              </div>
            </SettingRow>

            <div className="border-t border-border" />

            {/* Approvals */}
            <SettingRow
              label="Pending Approvals"
              hint="Exec-level actions queued in OpenClaw that require confirmation before running"
            >
              <div className="flex items-center gap-3">
                {approvalCount === null ? (
                  <span className="text-xs text-text-muted">Checking…</span>
                ) : approvalCount === 0 ? (
                  <StatusBadge status="success" label="None pending" />
                ) : (
                  <StatusBadge status="warning" label={`${approvalCount} pending`} />
                )}
                <button
                  onClick={loadApprovals}
                  className="text-xs text-text-muted hover:text-text-primary flex items-center gap-1 transition-colors"
                >
                  <RefreshCw size={11} />
                  Refresh
                </button>
              </div>
            </SettingRow>

            <div className="border-t border-border" />

            {/* Memory search */}
            <div>
              <div className="text-sm font-medium text-text-primary mb-1">Brain Memory Search</div>
              <div className="text-xs text-text-muted mb-3">
                Query what your agents know — searches the OpenClaw memory index (Layer 4 KB)
              </div>
              <form onSubmit={handleMemSearch} className="flex gap-2">
                <input
                  type="text"
                  value={memQuery}
                  onChange={(e) => setMemQuery(e.target.value)}
                  placeholder="e.g. Tampa Bay construction outreach…"
                  className="flex-1 px-3 py-2 bg-bg-elevated border border-border rounded-lg text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent-primary transition-colors"
                />
                <button
                  type="submit"
                  disabled={memSearching || !memQuery.trim()}
                  className="px-3 py-2 text-sm bg-accent-primary text-white rounded-lg hover:bg-opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
                >
                  <Search size={13} />
                  {memSearching ? 'Searching…' : 'Search'}
                </button>
              </form>

              {memResults && (
                <div className="mt-3 space-y-1.5">
                  <div className="text-xs text-text-muted">
                    {memResults.error
                      ? <span className="text-accent-danger">{memResults.error}</span>
                      : `${memResults.total} results for "${memResults.query}"`
                    }
                  </div>
                  {(memResults.results || []).slice(0, 10).map((r, i) => (
                    <div key={i} className="px-3 py-2 rounded-lg bg-bg-elevated border border-border text-xs text-text-secondary">
                      {r.content || r.text || r.value || JSON.stringify(r)}
                      {r.score != null && (
                        <span className="ml-2 text-text-muted">score: {typeof r.score === 'number' ? r.score.toFixed(3) : r.score}</span>
                      )}
                    </div>
                  ))}
                  {memResults.results?.length === 0 && !memResults.error && (
                    <div className="text-xs text-text-muted italic">No results found.</div>
                  )}
                </div>
              )}
            </div>
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
