/**
 * @file useSocket.js
 * @description React hook for Socket.io real-time communication.
 *
 * This hook manages the WebSocket connection to the Express server
 * and provides real-time updates for chat messages, agent status, and more.
 */

import { useEffect } from 'react';
import { io } from 'socket.io-client';
import { useChatStore } from '@/stores/useChatStore';

let socket = null;

export function useSocket() {
  const { setConnected, addMessage, activeThreadId } = useChatStore();

  useEffect(() => {
    // Get auth token from localStorage
    const token = localStorage.getItem('clawops_token');

    if (!token) {
      console.warn('[Socket.io] No auth token, skipping connection');
      return;
    }

    // Initialize Socket.io connection
    console.log('[Socket.io] Connecting to server...');
    socket = io('http://localhost:3001', {
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    // Connection events
    socket.on('connect', () => {
      console.log('[Socket.io] ✅ Connected');
      setConnected(true);

      // Subscribe to active thread
      if (activeThreadId) {
        socket.emit('thread:subscribe', activeThreadId);
      }
    });

    socket.on('disconnect', () => {
      console.log('[Socket.io] Disconnected');
      setConnected(false);
    });

    socket.on('connect_error', (error) => {
      console.error('[Socket.io] Connection error:', error.message);
      setConnected(false);
    });

    // Message events
    socket.on('message:new', (message) => {
      console.log('[Socket.io] New message received:', message);
      addMessage(message);
    });

    // Agent events
    socket.on('agent:status', (data) => {
      console.log('[Socket.io] Agent status:', data);
      // Add status message to chat
      addMessage({
        id: `status-${Date.now()}`,
        thread_id: activeThreadId,
        sender_type: 'system',
        content: `Agent status: ${data.status}`,
        msg_type: 'status',
        metadata: JSON.stringify(data),
        created_at: new Date().toISOString(),
      });
    });

    socket.on('agent:log', (data) => {
      console.log('[Socket.io] Agent log:', data.log);
      // Add log message to chat
      addMessage({
        id: `log-${Date.now()}`,
        thread_id: activeThreadId,
        sender_type: 'agent',
        content: data.log,
        msg_type: 'code',
        created_at: new Date().toISOString(),
      });
    });

    socket.on('agent:result', (data) => {
      console.log('[Socket.io] Agent result:', data);
    });

    // Cleanup on unmount
    return () => {
      if (socket) {
        console.log('[Socket.io] Disconnecting...');
        socket.disconnect();
        socket = null;
      }
    };
  }, [setConnected, addMessage]);

  // Subscribe to thread when active thread changes
  useEffect(() => {
    if (socket && socket.connected && activeThreadId) {
      console.log(`[Socket.io] Subscribing to thread: ${activeThreadId}`);
      socket.emit('thread:subscribe', activeThreadId);
    }
  }, [activeThreadId]);

  return socket;
}

export function getSocket() {
  return socket;
}
