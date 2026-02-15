/**
 * @file socketServer.js
 * @description Socket.io server setup for real-time communication.
 *
 * WHY WEBSOCKETS?
 * When an agent is running, you need live updates: status changes, log lines,
 * screenshots, completion notifications. Polling the API every second is wasteful.
 * WebSockets keep a persistent connection so the server can push updates instantly.
 *
 * EVENTS EMITTED (server → client):
 *   'agent:status'    — Agent status changed (idle → running → success)
 *   'agent:log'       — New log line from a running agent
 *   'agent:screenshot' — New screenshot captured
 *   'run:update'      — Run progress update (tokens used, cost, etc.)
 *   'system:alert'    — System-wide alert (error, rate limit hit, etc.)
 *
 * EVENTS RECEIVED (client → server):
 *   'agent:subscribe'   — Subscribe to updates for a specific agent
 *   'agent:unsubscribe' — Stop receiving updates for an agent
 */

const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../middleware/auth'); // Import validated secret

let io = null;

/**
 * Initialize the Socket.io server.
 * Called once during server startup (in index.js).
 *
 * @param {http.Server} httpServer - The HTTP server to attach Socket.io to
 * @returns {Server} - The Socket.io server instance
 */
function initSocketServer(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: ['http://localhost:5173'], // Vite dev server
      methods: ['GET', 'POST'],
    },
    // Fallback to HTTP long-polling if WebSocket connection fails
    // (this helps with some WSL2 networking quirks)
    transports: ['websocket', 'polling'],
  });

  // Authenticate WebSocket connections using JWT
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error('Authentication required for WebSocket connection'));
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET); // Use validated secret from auth module
      socket.userId = decoded.id;
      next();
    } catch (err) {
      next(new Error('Invalid authentication token'));
    }
  });

  // Handle new connections
  io.on('connection', (socket) => {
    console.log(`[WebSocket] Client connected: ${socket.id} (user: ${socket.userId})`);

    // Client can subscribe to specific agent updates
    socket.on('agent:subscribe', (agentId) => {
      socket.join(`agent:${agentId}`);
      console.log(`[WebSocket] ${socket.id} subscribed to agent:${agentId}`);
    });

    socket.on('agent:unsubscribe', (agentId) => {
      socket.leave(`agent:${agentId}`);
    });

    socket.on('disconnect', () => {
      console.log(`[WebSocket] Client disconnected: ${socket.id}`);
    });
  });

  console.log('[WebSocket] Server initialized');
  return io;
}

/**
 * Get the Socket.io server instance.
 * Use this from other services to emit events.
 *
 * @example
 *   const { getIO } = require('./websocket/socketServer');
 *   getIO().to(`agent:${agentId}`).emit('agent:status', { status: 'running' });
 */
function getIO() {
  if (!io) {
    console.warn('[WebSocket] Server not initialized yet — events will be lost');
  }
  return io;
}

module.exports = { initSocketServer, getIO };
