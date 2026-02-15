/**
 * @file commandHandler.js
 * @description Slash command parser and executor for chat messages.
 *
 * This service intercepts chat messages, detects slash commands,
 * and triggers the appropriate actions (run agents, stop runs, etc.).
 *
 * SAFETY: All agent executions are logged to audit_log before execution.
 */

const { v4: uuidv4 } = require('uuid');
const { all, get, run } = require('../db/connection');
const openclawBridge = require('./openclawBridge');
const { getIO } = require('../websocket/socketServer');

/**
 * Check if a message is a slash command.
 * @param {string} content - Message content
 * @returns {boolean}
 */
function isCommand(content) {
  return content.trim().startsWith('/');
}

/**
 * Parse a slash command into structured data.
 * @param {string} content - Command string
 * @returns {Object} - { type, args, raw }
 */
function parseCommand(content) {
  const trimmed = content.trim();
  const parts = trimmed.split(/\s+/);
  const command = parts[0].toLowerCase();
  const args = parts.slice(1);

  switch (command) {
    case '/run':
      return {
        type: 'run',
        agentName: args[0],
        message: args.slice(1).join(' '),
        raw: trimmed,
      };
    case '/stop':
      return {
        type: 'stop',
        sessionId: args[0] || null,
        raw: trimmed,
      };
    case '/list':
      return { type: 'list', raw: trimmed };
    case '/help':
      return { type: 'help', raw: trimmed };
    default:
      return {
        type: 'unknown',
        command: command,
        raw: trimmed,
      };
  }
}

/**
 * Execute a slash command and return agent/system responses.
 * @param {Object} cmd - Parsed command object
 * @param {string} threadId - Thread ID for context
 * @param {string} userId - User ID for audit logging
 * @returns {Array<Object>} - Array of messages to add to chat
 */
async function executeCommand(cmd, threadId, userId) {
  const messages = [];
  const io = getIO();

  try {
    switch (cmd.type) {
      case 'run': {
        if (!cmd.agentName || !cmd.message) {
          messages.push({
            id: uuidv4(),
            thread_id: threadId,
            sender_type: 'system',
            content: '❌ Usage: /run <agent-name> <message>\nExample: /run invoice-extractor Get latest invoices',
            msg_type: 'error',
            created_at: new Date().toISOString(),
          });
          break;
        }

        // Find agent by name
        const agent = get('SELECT * FROM agents WHERE name LIKE ?', [`%${cmd.agentName}%`]);

        if (!agent) {
          messages.push({
            id: uuidv4(),
            thread_id: threadId,
            sender_type: 'system',
            content: `❌ Agent "${cmd.agentName}" not found. Type /list to see available agents.`,
            msg_type: 'error',
            created_at: new Date().toISOString(),
          });
          break;
        }

        // SAFETY: Log to audit before execution
        run(
          `INSERT INTO audit_log (id, user_id, action, resource, details, outcome)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            uuidv4(),
            userId,
            'agent.run',
            `agent:${agent.id}`,
            JSON.stringify({ message: cmd.message, command: cmd.raw }),
            'pending',
          ]
        );

        // Add "starting" message
        const startMsgId = uuidv4();
        messages.push({
          id: startMsgId,
          thread_id: threadId,
          sender_type: 'system',
          content: `🚀 Starting "${agent.name}"...`,
          msg_type: 'status',
          created_at: new Date().toISOString(),
        });

        // Emit real-time status
        if (io) {
          io.to(threadId).emit('agent:status', {
            status: 'running',
            agentName: agent.name,
            timestamp: new Date().toISOString(),
          });
        }

        // Execute agent via OpenClaw Bridge
        const sessionId = `session-${Date.now()}-${agent.id}`;
        const result = await openclawBridge.runAgent(agent.id, {
          message: cmd.message,
          sessionId,
          json: false,
        });

        // Create run record
        const runId = uuidv4();
        run(
          `INSERT INTO runs (id, agent_id, user_id, session_id, status, started_at, completed_at, duration_ms, trigger)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            runId,
            agent.id,
            userId,
            sessionId,
            result.status || 'completed',
            result.startedAt,
            result.completedAt,
            result.completedAt && result.startedAt
              ? new Date(result.completedAt) - new Date(result.startedAt)
              : null,
            'chat-command',
          ]
        );

        // Add agent response message
        messages.push({
          id: uuidv4(),
          thread_id: threadId,
          sender_type: 'agent',
          content: result.output || 'Task completed',
          msg_type: 'text',
          metadata: JSON.stringify({
            sessionId: result.sessionId,
            runId,
            status: result.status,
          }),
          created_at: new Date().toISOString(),
        });

        // Update audit log with success
        run(
          `UPDATE audit_log SET outcome = ? WHERE resource = ? AND action = ? ORDER BY timestamp DESC LIMIT 1`,
          ['success', `agent:${agent.id}`, 'agent.run']
        );

        break;
      }

      case 'list': {
        const agents = all('SELECT id, name, description, status FROM agents ORDER BY name ASC');

        const agentList = agents.length > 0
          ? agents.map(a => `• **${a.name}** - ${a.description || 'No description'} [${a.status}]`).join('\n')
          : 'No agents configured yet. Go to the Agents page to create one.';

        messages.push({
          id: uuidv4(),
          thread_id: threadId,
          sender_type: 'system',
          content: `📋 **Available Agents:**\n\n${agentList}\n\nUse: \`/run <agent-name> <message>\``,
          msg_type: 'text',
          created_at: new Date().toISOString(),
        });
        break;
      }

      case 'help': {
        const helpText = `**Available Commands:**

\`/run <agent-name> <message>\`
Execute an OpenClaw agent with a task

\`/list\`
Show all configured agents

\`/stop <session-id>\`
Stop a running agent

\`/help\`
Show this help message

**Examples:**
\`/run invoice-extractor Get latest invoices from Sage 300\`
\`/run job-reporter Pull job costs for project 12345\`

**Tips:**
- Agent names are case-insensitive and support partial matching
- All executions are logged for audit (see AGENT-SAFETY.md)
- Press Enter to send, Shift+Enter for new line`.trim();

        messages.push({
          id: uuidv4(),
          thread_id: threadId,
          sender_type: 'system',
          content: helpText,
          msg_type: 'text',
          created_at: new Date().toISOString(),
        });
        break;
      }

      case 'stop': {
        if (!cmd.sessionId) {
          messages.push({
            id: uuidv4(),
            thread_id: threadId,
            sender_type: 'system',
            content: '❌ Usage: /stop <session-id>',
            msg_type: 'error',
            created_at: new Date().toISOString(),
          });
          break;
        }

        await openclawBridge.stopAgent(cmd.sessionId);

        messages.push({
          id: uuidv4(),
          thread_id: threadId,
          sender_type: 'system',
          content: `🛑 Stopped agent session: ${cmd.sessionId}`,
          msg_type: 'status',
          created_at: new Date().toISOString(),
        });
        break;
      }

      case 'unknown': {
        messages.push({
          id: uuidv4(),
          thread_id: threadId,
          sender_type: 'system',
          content: `❌ Unknown command: ${cmd.command}\n\nType /help to see available commands.`,
          msg_type: 'error',
          created_at: new Date().toISOString(),
        });
        break;
      }
    }
  } catch (error) {
    console.error('[CommandHandler] Execution error:', error);

    messages.push({
      id: uuidv4(),
      thread_id: threadId,
      sender_type: 'system',
      content: `❌ Error: ${error.message}`,
      msg_type: 'error',
      created_at: new Date().toISOString(),
    });

    // Log error to audit
    run(
      `INSERT INTO audit_log (id, user_id, action, details, outcome)
       VALUES (?, ?, ?, ?, ?)`,
      [
        uuidv4(),
        userId,
        'command.error',
        JSON.stringify({ command: cmd.raw, error: error.message }),
        'failure',
      ]
    );
  }

  return messages;
}

module.exports = {
  isCommand,
  parseCommand,
  executeCommand,
};
