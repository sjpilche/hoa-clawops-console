/**
 * @file ChatPage.jsx
 * @description Chat interface with real-time WebSocket responses.
 *
 * Flow: POST message → 201 instant → agent reply arrives via WebSocket.
 * This makes the UI feel instant — no waiting for the full agent round-trip.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MessageCircle, Zap } from 'lucide-react';
import { api } from '@/lib/api';
import { io } from 'socket.io-client';
import ThreadList from '@/components/chat/ThreadList';
import MessageList from '@/components/chat/MessageList';
import MessageInput from '@/components/chat/MessageInput';

export default function ChatPage() {
  const [threads, setThreads] = useState([]);
  const [activeThreadId, setActiveThreadId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const socketRef = useRef(null);
  const activeThreadRef = useRef(null);
  const initialLoadDone = useRef(false);
  const sendingTimeoutRef = useRef(null);

  // Keep ref in sync for socket callback
  activeThreadRef.current = activeThreadId;

  // Connect WebSocket once
  useEffect(() => {
    const token = localStorage.getItem('clawops_token');
    if (!token) return;

    const sock = io('http://localhost:3001', {
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    sock.on('connect', () => {
      console.log('[Chat] WebSocket connected');
      if (activeThreadRef.current) {
        sock.emit('thread:subscribe', activeThreadRef.current);
      }
    });

    // Agent response arrives here — add to messages instantly
    sock.on('message:new', (msg) => {
      if (msg.thread_id !== activeThreadRef.current) return;
      setMessages(prev => {
        if (prev.some(m => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
      if (msg.sender_type === 'agent' || msg.msg_type === 'error') {
        setIsSending(false);
        if (sendingTimeoutRef.current) {
          clearTimeout(sendingTimeoutRef.current);
          sendingTimeoutRef.current = null;
        }
      }
    });

    sock.on('agent:status', (data) => {
      if (data.status === 'idle') setIsSending(false);
    });

    socketRef.current = sock;
    return () => { sock.disconnect(); socketRef.current = null; };
  }, []);

  // Subscribe to thread room when active thread changes
  useEffect(() => {
    if (socketRef.current?.connected && activeThreadId) {
      socketRef.current.emit('thread:subscribe', activeThreadId);
    }
  }, [activeThreadId]);

  // Load threads on mount
  useEffect(() => {
    if (!initialLoadDone.current) {
      initialLoadDone.current = true;
      loadThreads();
    }
  }, []);

  // Load messages when active thread changes
  useEffect(() => {
    if (activeThreadId) {
      loadMessages(activeThreadId);
    } else {
      setMessages([]);
    }
  }, [activeThreadId]);

  const loadThreads = async () => {
    try {
      const data = await api.get('/chat/threads');
      setThreads(data.threads || []);
      if (!activeThreadId && data.threads?.length > 0) {
        setActiveThreadId(data.threads[0].id);
      }
    } catch (err) {
      console.error('[Chat] Failed to load threads:', err.message);
    }
  };

  const loadMessages = async (threadId) => {
    setIsLoading(true);
    try {
      const data = await api.get(`/chat/threads/${threadId}`);
      setMessages(data.messages || []);
    } catch (err) {
      console.error('[Chat] Failed to load messages:', err.message);
      setMessages([]);
    } finally {
      setIsLoading(false);
    }
  };

  const createThread = async () => {
    try {
      const data = await api.post('/chat/threads', { title: 'New Conversation' });
      if (data.thread) {
        setThreads(prev => [data.thread, ...prev]);
        setActiveThreadId(data.thread.id);
        setMessages([]);
      }
    } catch (err) {
      console.error('[Chat] Failed to create thread:', err.message);
    }
  };

  const deleteThread = async (threadId) => {
    setThreads(prev => prev.filter(t => t.id !== threadId));
    if (activeThreadId === threadId) {
      setActiveThreadId(null);
      setMessages([]);
    }
  };

  const sendMessage = useCallback(async (content) => {
    if (!content.trim() || isSending) return;

    let threadId = activeThreadId;
    if (!threadId) {
      try {
        const data = await api.post('/chat/threads', { title: content.substring(0, 50) });
        if (data.thread) {
          threadId = data.thread.id;
          setThreads(prev => [data.thread, ...prev]);
          setActiveThreadId(threadId);
          // Subscribe socket immediately for the new thread
          if (socketRef.current?.connected) {
            socketRef.current.emit('thread:subscribe', threadId);
          }
        }
      } catch (err) {
        console.error('[Chat] Failed to auto-create thread:', err.message);
        return;
      }
    }

    // Add user message to UI immediately
    const tempUserMsg = {
      id: `temp-${Date.now()}`,
      thread_id: threadId,
      sender_type: 'user',
      content,
      msg_type: 'text',
      metadata: '{}',
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, tempUserMsg]);
    setIsSending(true);

    // Safety timeout — if no response in 2 minutes, unblock UI
    sendingTimeoutRef.current = setTimeout(() => {
      setIsSending(false);
    }, 120000);

    try {
      const data = await api.post(`/chat/threads/${threadId}/messages`, {
        content,
        sender_type: 'user',
        msg_type: 'text',
      });

      // Replace temp with real user message
      if (data.message) {
        setMessages(prev =>
          prev.map(m => m.id === tempUserMsg.id ? data.message : m)
        );
      }

      // If responses came back synchronously (smart router / slash commands), add them
      if (data.responses?.length > 0) {
        setMessages(prev => [...prev, ...data.responses]);
        setIsSending(false);
        if (sendingTimeoutRef.current) {
          clearTimeout(sendingTimeoutRef.current);
          sendingTimeoutRef.current = null;
        }
      }
      // Otherwise, agent response will arrive via WebSocket — isSending stays true

      loadThreads();
    } catch (err) {
      console.error('[Chat] Send failed:', err.message);
      setMessages(prev => [...prev, {
        id: `err-${Date.now()}`,
        sender_type: 'system',
        content: `Failed to send: ${err.message}`,
        msg_type: 'error',
        metadata: '{}',
        created_at: new Date().toISOString(),
      }]);
      setIsSending(false);
      if (sendingTimeoutRef.current) {
        clearTimeout(sendingTimeoutRef.current);
        sendingTimeoutRef.current = null;
      }
    }
  }, [activeThreadId, isSending]);

  return (
    <div className="h-full flex bg-bg-primary">
      <ThreadList
        threads={threads}
        activeThreadId={activeThreadId}
        onSelectThread={setActiveThreadId}
        onNewThread={createThread}
        onDeleteThread={deleteThread}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <div className="border-b border-border bg-bg-elevated px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Zap size={20} className="text-accent-primary" />
            <div>
              <h1 className="text-base font-semibold text-text-primary">
                Chief of Staff
              </h1>
              <p className="text-xs text-text-muted">
                Your wartime executive assistant
              </p>
            </div>
          </div>
          {isSending && (
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-warning opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-accent-warning" />
              </span>
              <span className="text-xs text-accent-warning font-medium">
                Working on it...
              </span>
            </div>
          )}
        </div>

        {activeThreadId ? (
          <>
            <MessageList messages={messages} isLoading={isLoading} />
            <MessageInput
              onSend={sendMessage}
              isDisabled={isSending}
              placeholder="Tell me what to do..."
            />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-4 max-w-md">
              <div className="w-16 h-16 rounded-2xl bg-accent-primary/10 flex items-center justify-center mx-auto">
                <Zap size={32} className="text-accent-primary" />
              </div>
              <h2 className="text-xl font-bold text-text-primary">
                Your Chief of Staff
              </h2>
              <p className="text-sm text-text-muted">
                Talk in plain English. "Find me contractors in Lee County."
                "How many leads do we have?" "Send an email to John."
                I'll handle it.
              </p>
              <button
                onClick={createThread}
                className="px-5 py-2.5 rounded-lg bg-accent-primary text-white font-semibold text-sm hover:bg-accent-primary/90 transition-colors"
              >
                Start Conversation
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
