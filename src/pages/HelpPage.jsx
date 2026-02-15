/**
 * @file HelpPage.jsx
 * @description Help and features documentation page
 */

import { HelpCircle, Slash, Mail, Zap, Shield, Code } from 'lucide-react';

export default function HelpPage() {
  const slashCommands = [
    {
      command: '/run <agent-name> <message>',
      description: 'Execute an OpenClaw agent with a specific task',
      example: '/run invoice-extractor Get latest invoices from Sage 300',
    },
    {
      command: '/list',
      description: 'Show all configured agents with their status',
      example: '/list',
    },
    {
      command: '/stop <session-id>',
      description: 'Stop a currently running agent session',
      example: '/stop session-123456',
    },
    {
      command: '/help',
      description: 'Display all available commands',
      example: '/help',
    },
  ];

  const features = [
    {
      icon: <Slash className="w-6 h-6 text-blue-600" />,
      title: 'Chat Slash Commands',
      description: 'Execute agents directly from chat using slash commands. Type / in any chat to get started.',
      status: 'Active',
    },
    {
      icon: <Mail className="w-6 h-6 text-green-600" />,
      title: 'Automatic Digest Emails',
      description: 'System automatically monitors agent workspaces for digest files and emails them to configured recipients every 30 seconds.',
      status: 'Running',
    },
    {
      icon: <Zap className="w-6 h-6 text-yellow-600" />,
      title: 'WebSocket Real-Time Updates',
      description: 'Real-time agent status, logs, and results via WebSocket connections. Enables live monitoring of agent execution.',
      status: 'Active',
    },
    {
      icon: <Shield className="w-6 h-6 text-purple-600" />,
      title: 'Command Audit Logging',
      description: 'Every slash command and agent execution is automatically logged to the audit trail for security and compliance.',
      status: 'Enabled',
    },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <HelpCircle className="w-8 h-8 text-blue-600" />
          <h1 className="text-3xl font-bold">Help & Features</h1>
        </div>
        <p className="text-gray-600">
          Discover powerful features and commands available in ClawOps Console
        </p>
      </div>

      {/* Slash Commands Section */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <Slash className="w-6 h-6 text-blue-600" />
          <h2 className="text-2xl font-bold">Chat Slash Commands</h2>
        </div>
        <p className="text-gray-600 mb-4">
          Control agents directly from the chat interface using these commands:
        </p>

        <div className="space-y-4">
          {slashCommands.map((cmd, index) => (
            <div key={index} className="bg-white p-5 rounded-lg border border-gray-200">
              <div className="flex items-start justify-between mb-2">
                <code className="text-sm font-mono bg-blue-50 text-blue-700 px-3 py-1 rounded-md font-semibold">
                  {cmd.command}
                </code>
              </div>
              <p className="text-gray-700 mb-3">{cmd.description}</p>
              <div className="bg-gray-50 p-3 rounded border border-gray-200">
                <div className="text-xs text-gray-500 mb-1">Example:</div>
                <code className="text-sm font-mono text-gray-800">{cmd.example}</code>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
          <div className="flex items-start gap-2">
            <Code className="w-5 h-5 text-blue-600 mt-0.5" />
            <div>
              <div className="font-semibold text-blue-900 mb-1">Pro Tip</div>
              <div className="text-sm text-blue-800">
                Agent names support partial matching and are case-insensitive. For example, both
                "invoice-extractor" and "Invoice" will match "AP Invoice Extractor".
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* System Features */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold mb-4">Active System Features</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {features.map((feature, index) => (
            <div key={index} className="bg-white p-5 rounded-lg border border-gray-200">
              <div className="flex items-start gap-3 mb-3">
                <div className="p-2 bg-gray-50 rounded-lg">{feature.icon}</div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="font-semibold text-lg">{feature.title}</h3>
                    <span className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded-full font-medium">
                      {feature.status}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600">{feature.description}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Keyboard Shortcuts */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold mb-4">Keyboard Shortcuts</h2>
        <div className="bg-white p-5 rounded-lg border border-gray-200">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center justify-between">
              <span className="text-gray-700">Send message in chat</span>
              <kbd className="px-3 py-1 bg-gray-100 border border-gray-300 rounded text-sm font-mono">
                Enter
              </kbd>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-700">New line in chat</span>
              <kbd className="px-3 py-1 bg-gray-100 border border-gray-300 rounded text-sm font-mono">
                Shift + Enter
              </kbd>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-700">Start slash command</span>
              <kbd className="px-3 py-1 bg-gray-100 border border-gray-300 rounded text-sm font-mono">
                /
              </kbd>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-700">Toggle sidebar</span>
              <kbd className="px-3 py-1 bg-gray-100 border border-gray-300 rounded text-sm font-mono">
                Collapse button
              </kbd>
            </div>
          </div>
        </div>
      </div>

      {/* Security & Audit */}
      <div className="bg-gradient-to-r from-purple-50 to-blue-50 p-6 rounded-lg border border-purple-200">
        <div className="flex items-center gap-2 mb-3">
          <Shield className="w-6 h-6 text-purple-600" />
          <h3 className="text-xl font-bold">Security & Compliance</h3>
        </div>
        <div className="space-y-2 text-sm text-gray-700">
          <p>
            ✅ <strong>All agent executions</strong> are logged to the audit trail before execution
          </p>
          <p>
            ✅ <strong>Slash commands</strong> create run records with session tracking and timing data
          </p>
          <p>
            ✅ <strong>Real-time monitoring</strong> via WebSocket ensures visibility into all operations
          </p>
          <p>
            ✅ <strong>Digest emails</strong> are tracked and prevent duplicate sends
          </p>
        </div>
        <div className="mt-4">
          <a
            href="/audit"
            className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors"
          >
            <Shield className="w-4 h-4" />
            View Audit Log
          </a>
        </div>
      </div>

      {/* Additional Resources */}
      <div className="mt-8">
        <h2 className="text-2xl font-bold mb-4">Additional Resources</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <a
            href="/agents"
            className="p-4 bg-white rounded-lg border border-gray-200 hover:border-blue-300 hover:shadow-md transition-all"
          >
            <h3 className="font-semibold mb-1">Agent Management</h3>
            <p className="text-sm text-gray-600">Create and configure OpenClaw agents</p>
          </a>
          <a
            href="/schedule"
            className="p-4 bg-white rounded-lg border border-gray-200 hover:border-blue-300 hover:shadow-md transition-all"
          >
            <h3 className="font-semibold mb-1">Scheduler</h3>
            <p className="text-sm text-gray-600">Set up automated agent runs with cron</p>
          </a>
          <a
            href="/monitor"
            className="p-4 bg-white rounded-lg border border-gray-200 hover:border-blue-300 hover:shadow-md transition-all"
          >
            <h3 className="font-semibold mb-1">Monitor</h3>
            <p className="text-sm text-gray-600">Track agent execution and status</p>
          </a>
        </div>
      </div>
    </div>
  );
}
