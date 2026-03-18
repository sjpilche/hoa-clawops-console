/**
 * @file HelpPage.jsx
 * @description Help and features documentation page — dark theme
 */

import { HelpCircle, Slash, Mail, Zap, Shield, Code } from 'lucide-react';

export default function HelpPage() {
  const slashCommands = [
    { command: '/run <agent-name> <message>', description: 'Execute an OpenClaw agent with a specific task', example: '/run invoice-extractor Get latest invoices from Sage 300' },
    { command: '/list', description: 'Show all configured agents with their status', example: '/list' },
    { command: '/stop <session-id>', description: 'Stop a currently running agent session', example: '/stop session-123456' },
    { command: '/help', description: 'Display all available commands', example: '/help' },
  ];

  const features = [
    { icon: <Slash size={20} className="text-accent-primary" />, title: 'Chat Slash Commands', description: 'Execute agents directly from chat using slash commands.', status: 'Active' },
    { icon: <Mail size={20} className="text-accent-success" />, title: 'Automatic Digest Emails', description: 'System monitors agent workspaces for digest files and emails them to configured recipients.', status: 'Running' },
    { icon: <Zap size={20} className="text-accent-warning" />, title: 'WebSocket Real-Time Updates', description: 'Real-time agent status, logs, and results via WebSocket connections.', status: 'Active' },
    { icon: <Shield size={20} className="text-accent-info" />, title: 'Command Audit Logging', description: 'Every slash command and agent execution is logged to the audit trail.', status: 'Enabled' },
  ];

  const shortcuts = [
    { label: 'Send message in chat', key: 'Enter' },
    { label: 'New line in chat', key: 'Shift + Enter' },
    { label: 'Start slash command', key: '/' },
    { label: 'Toggle sidebar', key: 'Collapse button' },
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <HelpCircle size={28} className="text-accent-primary" />
          <h1 className="text-2xl font-bold text-text-primary">Help & Features</h1>
        </div>
        <p className="text-text-muted">Discover powerful features and commands available in ClawOps Console</p>
      </div>

      {/* Slash Commands */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Slash size={18} className="text-accent-primary" />
          <h2 className="text-lg font-semibold text-text-primary">Chat Slash Commands</h2>
        </div>
        <p className="text-sm text-text-muted mb-4">Control agents directly from the chat interface:</p>

        <div className="space-y-3">
          {slashCommands.map((cmd, i) => (
            <div key={i} className="bg-bg-secondary p-4 rounded-lg border border-border">
              <code className="text-sm font-mono bg-accent-primary/10 text-accent-primary px-3 py-1 rounded-md font-semibold">
                {cmd.command}
              </code>
              <p className="text-sm text-text-secondary mt-2">{cmd.description}</p>
              <div className="bg-bg-primary p-3 rounded border border-border/50 mt-3">
                <div className="text-xs text-text-muted mb-1">Example:</div>
                <code className="text-sm font-mono text-text-primary">{cmd.example}</code>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 p-4 bg-accent-primary/5 rounded-lg border border-accent-primary/20">
          <div className="flex items-start gap-2">
            <Code size={16} className="text-accent-primary mt-0.5" />
            <div>
              <div className="font-semibold text-accent-primary text-sm mb-1">Pro Tip</div>
              <div className="text-sm text-text-secondary">
                Agent names support partial matching and are case-insensitive. Both "invoice-extractor" and "Invoice" will match "AP Invoice Extractor".
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* System Features */}
      <div>
        <h2 className="text-lg font-semibold text-text-primary mb-4">Active System Features</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {features.map((f, i) => (
            <div key={i} className="bg-bg-secondary p-4 rounded-lg border border-border">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-bg-elevated rounded-lg">{f.icon}</div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="font-semibold text-sm text-text-primary">{f.title}</h3>
                    <span className="text-xs px-2 py-0.5 bg-accent-success/10 text-accent-success rounded-full font-medium">{f.status}</span>
                  </div>
                  <p className="text-xs text-text-muted">{f.description}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Keyboard Shortcuts */}
      <div>
        <h2 className="text-lg font-semibold text-text-primary mb-4">Keyboard Shortcuts</h2>
        <div className="bg-bg-secondary p-4 rounded-lg border border-border">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {shortcuts.map((s, i) => (
              <div key={i} className="flex items-center justify-between">
                <span className="text-sm text-text-secondary">{s.label}</span>
                <kbd className="px-3 py-1 bg-bg-elevated border border-border rounded text-xs font-mono text-text-primary">{s.key}</kbd>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Security */}
      <div className="bg-accent-info/5 p-5 rounded-lg border border-accent-info/20">
        <div className="flex items-center gap-2 mb-3">
          <Shield size={18} className="text-accent-info" />
          <h3 className="text-base font-semibold text-text-primary">Security & Compliance</h3>
        </div>
        <div className="space-y-1.5 text-sm text-text-secondary">
          <p>All agent executions are logged to the audit trail before execution</p>
          <p>Slash commands create run records with session tracking and timing data</p>
          <p>Real-time monitoring via WebSocket ensures visibility into all operations</p>
          <p>Digest emails are tracked and prevent duplicate sends</p>
        </div>
        <div className="mt-4">
          <a href="/audit" className="inline-flex items-center gap-2 px-4 py-2 bg-accent-info/10 text-accent-info rounded-md hover:bg-accent-info/20 transition-colors text-sm font-medium">
            <Shield size={14} /> View Audit Log
          </a>
        </div>
      </div>

      {/* Resources */}
      <div>
        <h2 className="text-lg font-semibold text-text-primary mb-4">Quick Links</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            { href: '/agents', title: 'Agent Management', desc: 'Create and configure OpenClaw agents' },
            { href: '/schedule', title: 'Scheduler', desc: 'Set up automated agent runs with cron' },
            { href: '/monitor', title: 'Monitor', desc: 'Track agent execution and status' },
          ].map((link) => (
            <a key={link.href} href={link.href} className="p-4 bg-bg-secondary rounded-lg border border-border hover:border-accent-primary/30 hover:bg-bg-elevated transition-all">
              <h3 className="font-semibold text-sm text-text-primary mb-1">{link.title}</h3>
              <p className="text-xs text-text-muted">{link.desc}</p>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
