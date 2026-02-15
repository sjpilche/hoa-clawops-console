/**
 * @file useChatStore.js
 * @description Enhanced chat store with real-time updates and slash command support.
 */
import { create } from 'zustand';
import { api } from '@/lib/api';

const useChatStore = create((set, get) => ({
  // State
  threads: [],
  activeThreadId: null,
  messages: [],
  isLoading: false,
  isConnected: false,
  isSending: false,
  chatMode: 'chat', // 'chat' or 'agent'
  showModeRecommendation: false,
  recommendedMode: null,

  // Fetch all threads for the current user
  fetchThreads: async () => {
    set({ isLoading: true });
    try {
      const data = await api.get('/chat/threads');
      set({ threads: data.threads, isLoading: false });

      // Auto-select first thread if none selected
      if (!get().activeThreadId && data.threads.length > 0) {
        get().setActiveThread(data.threads[0].id);
      }
    } catch (error) {
      console.error('[ChatStore] Failed to fetch threads:', error);
      set({ isLoading: false });
    }
  },

  // Create a new thread
  createThread: async (title = 'New Conversation') => {
    try {
      const data = await api.post('/chat/threads', { title });
      set(state => ({
        threads: [data.thread, ...state.threads],
        activeThreadId: data.thread.id,
        messages: [],
      }));
      return data.thread;
    } catch (error) {
      console.error('[ChatStore] Failed to create thread:', error);
    }
  },

  // Set active thread and fetch its messages
  setActiveThread: async (threadId) => {
    if (threadId === get().activeThreadId) return;

    set({ activeThreadId: threadId, isLoading: true });
    try {
      const data = await api.get(`/chat/threads/${threadId}`);
      set({ messages: data.messages || [], isLoading: false });
    } catch (error) {
      console.error('[ChatStore] Failed to fetch messages:', error);
      set({ isLoading: false });
    }
  },

  // Send a message to the active thread
  sendMessage: async (content, metadata = {}) => {
    const { activeThreadId } = get();

    // Auto-create thread if none exists
    if (!activeThreadId) {
      const thread = await get().createThread();
      if (!thread) return;
    }

    set({ isSending: true });
    try {
      const data = await api.post(`/chat/threads/${get().activeThreadId}/messages`, {
        content,
        sender_type: 'user',
        msg_type: 'text',
        metadata,
      });

      // Add message to local state
      get().addMessage(data.message);

      // Check if this is a slash command OR regular message
      if (content.startsWith('/')) {
        await get().executeCommand(content);
      } else {
        // Regular message - send to default agent for conversational response
        await get().executeNaturalChat(content);
      }

      set({ isSending: false });
    } catch (error) {
      console.error('[ChatStore] Failed to send message:', error);
      set({ isSending: false });
    }
  },

  // Execute natural conversation (no slash command)
  executeNaturalChat: async (message) => {
    const { activeThreadId } = get();

    try {
      // Show "Agent is thinking..." message
      get().addMessage({
        id: `thinking-${Date.now()}`,
        thread_id: activeThreadId,
        sender_type: 'system',
        content: '💭 Agent is thinking...',
        msg_type: 'status',
        created_at: new Date().toISOString(),
      });

      // Call OpenClaw with just the message (fast mode)
      const result = await api.post('/test/run-agent', {
        message: message,
      });

      // Add agent response
      get().addMessage({
        id: `response-${Date.now()}`,
        thread_id: activeThreadId,
        sender_type: 'agent',
        content: result.output || result.message,
        msg_type: 'text',
        metadata: JSON.stringify({
          sessionId: result.session?.id,
          duration: result.session?.duration,
        }),
        created_at: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[ChatStore] Natural chat failed:', error);
      get().addMessage({
        id: `error-${Date.now()}`,
        thread_id: activeThreadId,
        sender_type: 'system',
        content: `❌ Error: ${error.message}`,
        msg_type: 'error',
        created_at: new Date().toISOString(),
      });
    }
  },

  // Add a message to the current thread (called by Socket.io or after send)
  addMessage: (message) => {
    set(state => ({
      messages: [...state.messages, message],
    }));

    // Update thread's last message preview
    const { threads, activeThreadId } = get();
    const threadIndex = threads.findIndex(t => t.id === activeThreadId);
    if (threadIndex >= 0) {
      const updatedThreads = [...threads];
      updatedThreads[threadIndex] = {
        ...updatedThreads[threadIndex],
        lastMessage: message.content,
        updated_at: message.created_at,
      };
      set({ threads: updatedThreads });
    }
  },

  // Delete a thread
  deleteThread: async (threadId) => {
    try {
      await api.del(`/chat/threads/${threadId}`);
      set(state => ({
        threads: state.threads.filter(t => t.id !== threadId),
        activeThreadId: state.activeThreadId === threadId ? null : state.activeThreadId,
        messages: state.activeThreadId === threadId ? [] : state.messages,
      }));
    } catch (error) {
      console.error('[ChatStore] Failed to delete thread:', error);
    }
  },

  // Parse slash commands
  parseCommand: (input) => {
    const parts = input.trim().split(' ');
    const command = parts[0].toLowerCase();
    const args = parts.slice(1);

    switch (command) {
      case '/run':
        return {
          type: 'run',
          agentName: args[0],
          message: args.slice(1).join(' '),
        };
      case '/stop':
        return {
          type: 'stop',
          sessionId: args[0],
        };
      case '/list':
        return { type: 'list' };
      case '/help':
        return { type: 'help' };
      default:
        return { type: 'unknown', command };
    }
  },

  // Execute slash commands
  executeCommand: async (input) => {
    const cmd = get().parseCommand(input);
    const { activeThreadId } = get();

    try {
      switch (cmd.type) {
        case 'run':
          // Show "Agent starting..." message
          get().addMessage({
            id: `temp-${Date.now()}`,
            thread_id: activeThreadId,
            sender_type: 'system',
            content: `🚀 Starting agent: ${cmd.agentName}...`,
            msg_type: 'status',
            created_at: new Date().toISOString(),
          });

          // Call the test endpoint to run agent
          const result = await api.post('/test/run-agent', {
            message: cmd.message || 'Execute task',
          });

          // Add agent response
          get().addMessage({
            id: `result-${Date.now()}`,
            thread_id: activeThreadId,
            sender_type: 'agent',
            content: result.output || result.message,
            msg_type: 'text',
            metadata: JSON.stringify({
              sessionId: result.session?.id,
              status: result.session?.status,
            }),
            created_at: new Date().toISOString(),
          });
          break;

        case 'list':
          // Fetch and display agents
          const agents = await api.get('/agents');
          const agentList = agents.agents.length > 0
            ? agents.agents.map(a => `• ${a.name} - ${a.description}`).join('\n')
            : 'No agents configured yet.';

          get().addMessage({
            id: `list-${Date.now()}`,
            thread_id: activeThreadId,
            sender_type: 'system',
            content: `📋 Available agents:\n\n${agentList}`,
            msg_type: 'text',
            created_at: new Date().toISOString(),
          });
          break;

        case 'help':
          // Show help message
          const helpText = `
**Available Commands:**

\`/run <agent-name> <message>\`
Execute an OpenClaw agent with a task

\`/list\`
Show all configured agents

\`/stop <session-id>\`
Stop a running agent

\`/help\`
Show this help message

**Example:**
\`/run invoice-extractor Get latest invoices from Sage 300\`
          `.trim();

          get().addMessage({
            id: `help-${Date.now()}`,
            thread_id: activeThreadId,
            sender_type: 'system',
            content: helpText,
            msg_type: 'text',
            created_at: new Date().toISOString(),
          });
          break;

        case 'unknown':
          get().addMessage({
            id: `error-${Date.now()}`,
            thread_id: activeThreadId,
            sender_type: 'system',
            content: `❌ Unknown command: ${cmd.command}. Type /help for available commands.`,
            msg_type: 'error',
            created_at: new Date().toISOString(),
          });
          break;
      }
    } catch (error) {
      console.error('[ChatStore] Command execution failed:', error);
      get().addMessage({
        id: `error-${Date.now()}`,
        thread_id: activeThreadId,
        sender_type: 'system',
        content: `❌ Error: ${error.message}`,
        msg_type: 'error',
        created_at: new Date().toISOString(),
      });
    }
  },

  // Socket.io connection status
  setConnected: (isConnected) => set({ isConnected }),

  // Update agent status (called from Socket.io)
  updateAgentStatus: (data) => {
    const { activeThreadId } = get();
    get().addMessage({
      id: `status-${Date.now()}`,
      thread_id: activeThreadId,
      sender_type: 'system',
      content: `Agent status: ${data.status}`,
      msg_type: 'status',
      metadata: JSON.stringify(data),
      created_at: new Date().toISOString(),
    });
  },

  // Mode switching
  setChatMode: (mode) => {
    console.log(`[ChatStore] Switching to ${mode} mode`);
    set({ chatMode: mode, showModeRecommendation: false });
  },

  // Show mode recommendation
  showRecommendation: (recommendedMode, reason) => {
    set({
      showModeRecommendation: true,
      recommendedMode,
      recommendationReason: reason,
    });
  },

  // Hide recommendation
  hideRecommendation: () => {
    set({ showModeRecommendation: false, recommendedMode: null });
  },

  // Accept recommendation and switch modes
  acceptRecommendation: () => {
    const { recommendedMode } = get();
    if (recommendedMode) {
      get().setChatMode(recommendedMode);
    }
  },
}));

export { useChatStore };
