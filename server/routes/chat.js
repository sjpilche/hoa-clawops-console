/**
 * @file chat.js (routes)
 * @description Chat message and thread endpoints.
 *
 * ENDPOINTS:
 *   GET    /api/chat/threads          — List all chat threads
 *   POST   /api/chat/threads          — Create a new thread
 *   GET    /api/chat/threads/:id      — Get messages for a thread
 *   POST   /api/chat/threads/:id/messages — Add a message to a thread
 */

const { Router } = require('express');
const { v4: uuidv4 } = require('uuid');
const { all, get, run } = require('../db/connection');
const { authenticate } = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');
const { isCommand, parseCommand, executeCommand } = require('../services/commandHandler');
const { getIO } = require('../websocket/socketServer');
const smartRouter = require('../services/smartRouter');
const { validateBody, validateParams, validateMultiple } = require('../middleware/validator');
const { createThreadSchema, threadIdParamSchema, createMessageSchema } = require('../schemas');

const router = Router();
router.use(authenticate);

/**
 * GET /api/chat/threads
 * List all chat threads for the current user, most recent first.
 */
router.get('/threads', (req, res, next) => {
  try {
    const threads = all(
      'SELECT * FROM chat_threads WHERE user_id = ? ORDER BY updated_at DESC',
      [req.user.id]
    );
    res.json({ threads });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/chat/threads
 * Create a new chat thread.
 */
router.post('/threads', validateBody(createThreadSchema), (req, res, next) => {
  try {
    const { title } = req.validated.body;
    const threadId = uuidv4();

    run('INSERT INTO chat_threads (id, title, user_id) VALUES (?, ?, ?)', [
      threadId,
      title || 'New Conversation',
      req.user.id,
    ]);

    const thread = get('SELECT * FROM chat_threads WHERE id = ?', [threadId]);
    res.status(201).json({ thread });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/chat/threads/:id
 * Get all messages in a thread, oldest first.
 */
router.get('/threads/:id', validateParams(threadIdParamSchema), (req, res, next) => {
  try {
    const threadId = req.validated.params.id;
    const thread = get('SELECT * FROM chat_threads WHERE id = ?', [threadId]);
    if (!thread) {
      throw new AppError('Thread not found.', 'THREAD_NOT_FOUND', 404);
    }

    const messages = all(
      'SELECT * FROM chat_messages WHERE thread_id = ? ORDER BY created_at ASC',
      [threadId]
    );

    res.json({ thread, messages });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/chat/threads/:id/messages
 * Add a message to a thread.
 *
 * Request body: { content, sender_type, msg_type, metadata }
 *
 * If the message is a slash command, it will be executed and
 * agent/system responses will be added automatically.
 */
router.post(
  '/threads/:id/messages',
  validateMultiple({
    params: threadIdParamSchema,
    body: createMessageSchema,
  }),
  async (req, res, next) => {
    try {
      const threadId = req.validated.params.id;
      const thread = get('SELECT * FROM chat_threads WHERE id = ?', [threadId]);
      if (!thread) {
        throw new AppError('Thread not found.', 'THREAD_NOT_FOUND', 404);
      }

      const { content, sender_type, msg_type, metadata } = req.validated.body;

      // Save user's message
      const messageId = uuidv4();
      run(
        `INSERT INTO chat_messages (id, thread_id, sender_type, sender_id, content, msg_type, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          messageId,
          threadId,
          sender_type || 'user',
          req.user.id,
          content,
          msg_type || 'text',
          JSON.stringify(metadata || {}),
        ]
      );

      const userMessage = get('SELECT * FROM chat_messages WHERE id = ?', [messageId]);

      // Check if this is a slash command
      if (isCommand(content)) {
        const cmd = parseCommand(content);
        const responseMessages = await executeCommand(cmd, threadId, req.user.id);

        // Save all response messages to database
        for (const msg of responseMessages) {
          run(
            `INSERT INTO chat_messages (id, thread_id, sender_type, sender_id, content, msg_type, metadata, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              msg.id,
              msg.thread_id,
              msg.sender_type,
              msg.sender_id || null,
              msg.content,
              msg.msg_type,
              JSON.stringify(msg.metadata || {}),
              msg.created_at,
            ]
          );

          // Emit to WebSocket clients in real-time
          const io = getIO();
          if (io) {
            io.to(`thread:${threadId}`).emit('message:new', msg);
          }
        }

        // Return user message + all responses
        return res.status(201).json({
          message: userMessage,
          responses: responseMessages,
        });
      }

      // ── SMART ROUTER: instant $0 responses for common requests ────
      const smartResponse = await smartRouter.route(content);
      if (smartResponse) {
        const smartMsgId = uuidv4();
        run(
          `INSERT INTO chat_messages (id, thread_id, sender_type, content, msg_type, metadata)
           VALUES (?, ?, 'agent', ?, 'text', ?)`,
          [smartMsgId, threadId, smartResponse, JSON.stringify({ source: 'smart-router', costUsd: 0 })]
        );
        const smartMsg = get('SELECT * FROM chat_messages WHERE id = ?', [smartMsgId]);
        run('UPDATE chat_threads SET updated_at = datetime(\'now\') WHERE id = ?', [threadId]);

        return res.status(201).json({
          message: userMessage,
          responses: [smartMsg],
        });
      }

      // ── NATURAL LANGUAGE → OpenClaw agent ──────────────────────────
      // Complex/creative requests go to OpenClaw "main" agent.
      // Response is ASYNC — we return 201 immediately and push the
      // agent reply via WebSocket when it's ready.
      const openclawBridge = require('../services/openclawBridge');
      const agentId = thread.agent_id || 'main';

      const io = getIO();

      // Return immediately — agent response comes via WebSocket
      res.status(201).json({ message: userMessage, responses: [] });

      // Fire agent call in background
      ;(async () => {
        try {
          if (io) {
            io.to(`thread:${threadId}`).emit('agent:status', {
              status: 'thinking', agentId, timestamp: new Date().toISOString(),
            });
          }

          const result = await openclawBridge.runAgent(agentId, {
            openclawId: agentId,
            message: content,
            sessionId: threadId,
          });

          const parsed = openclawBridge.constructor.parseOutput(result.output);
          const responseText = parsed.text || result.output || 'No response';

          const responseMsgId = uuidv4();
          run(
            `INSERT INTO chat_messages (id, thread_id, sender_type, content, msg_type, metadata)
             VALUES (?, ?, 'agent', ?, 'text', ?)`,
            [responseMsgId, threadId, responseText, JSON.stringify({
              sessionId: parsed.sessionId || threadId,
              model: parsed.model,
              tokensUsed: parsed.tokensUsed,
              costUsd: parsed.costUsd,
              durationMs: parsed.durationMs,
            })]
          );

          const agentMessage = get('SELECT * FROM chat_messages WHERE id = ?', [responseMsgId]);

          if (io) {
            io.to(`thread:${threadId}`).emit('message:new', agentMessage);
            io.to(`thread:${threadId}`).emit('agent:status', { status: 'idle', agentId });
          }

          run('UPDATE chat_threads SET updated_at = datetime(\'now\') WHERE id = ?', [threadId]);
        } catch (agentError) {
          console.error('[Chat] Agent error:', agentError.message);

          const errMsgId = uuidv4();
          run(
            `INSERT INTO chat_messages (id, thread_id, sender_type, content, msg_type)
             VALUES (?, ?, 'system', ?, 'error')`,
            [errMsgId, threadId, `Agent error: ${agentError.message}`]
          );
          const errMsg = get('SELECT * FROM chat_messages WHERE id = ?', [errMsgId]);

          if (io) {
            io.to(`thread:${threadId}`).emit('message:new', errMsg);
            io.to(`thread:${threadId}`).emit('agent:status', { status: 'idle', agentId });
          }

          run('UPDATE chat_threads SET updated_at = datetime(\'now\') WHERE id = ?', [threadId]);
        }
      })();
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
