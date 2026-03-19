/**
 * @file useSocket.js
 * @description React hook for Socket.io real-time communication.
 */

import { useEffect } from 'react';
import { io } from 'socket.io-client';
import { useChatStore } from '@/stores/useChatStore';

const DEBUG = import.meta.env.DEV;
let socket = null;

export function useSocket() {
  const { setConnected, addMessage, activeThreadId } = useChatStore();

  useEffect(() => {
    const token = localStorage.getItem('clawops_token');

    if (!token) {
      if (DEBUG) console.warn('[Socket.io] No auth token, skipping connection');
      return;
    }

    const wsUrl = import.meta.env.VITE_WS_URL || window.location.origin.replace(':5174', ':3001') || 'http://localhost:3001';
    socket = io(wsUrl, {
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    socket.on('connect', () => {
      setConnected(true);
      if (activeThreadId) {
        socket.emit('thread:subscribe', activeThreadId);
      }
    });

    socket.on('disconnect', () => {
      setConnected(false);
    });

    socket.on('connect_error', (error) => {
      if (DEBUG) console.error('[Socket.io] Connection error:', error.message);
      setConnected(false);
    });

    socket.on('message:new', (message) => {
      addMessage(message);
    });

    socket.on('agent:status', (data) => {
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
      addMessage({
        id: `log-${Date.now()}`,
        thread_id: activeThreadId,
        sender_type: 'agent',
        content: data.log,
        msg_type: 'code',
        created_at: new Date().toISOString(),
      });
    });

    socket.on('agent:result', () => {});

    return () => {
      if (socket) {
        socket.disconnect();
        socket = null;
      }
    };
  }, [setConnected, addMessage]);

  useEffect(() => {
    if (socket && socket.connected && activeThreadId) {
      socket.emit('thread:subscribe', activeThreadId);
    }
  }, [activeThreadId]);

  return socket;
}

export function getSocket() {
  return socket;
}
