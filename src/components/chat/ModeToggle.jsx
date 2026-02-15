/**
 * @file ModeToggle.jsx
 * @description Toggle between Chat Mode (ChatGPT) and Agent Mode (OpenClaw).
 */

import React from 'react';
import { MessageSquare, Bot, Zap, Clock } from 'lucide-react';

export default function ModeToggle({ mode, onModeChange }) {
  return (
    <div className="flex items-center gap-2 p-1 bg-bg-elevated rounded-lg border border-border">
      {/* Chat Mode Button */}
      <button
        onClick={() => onModeChange('chat')}
        className={`
          flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium
          transition-all duration-200
          ${mode === 'chat'
            ? 'bg-accent-primary text-bg-primary shadow-sm'
            : 'text-text-secondary hover:text-text-primary hover:bg-bg-secondary'
          }
        `}
      >
        <MessageSquare size={16} />
        <span>Chat</span>
        {mode === 'chat' && (
          <span className="flex items-center gap-1 text-xs opacity-75">
            <Zap size={12} />
            Fast
          </span>
        )}
      </button>

      {/* Agent Mode Button */}
      <button
        onClick={() => onModeChange('agent')}
        className={`
          flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium
          transition-all duration-200
          ${mode === 'agent'
            ? 'bg-accent-info text-bg-primary shadow-sm'
            : 'text-text-secondary hover:text-text-primary hover:bg-bg-secondary'
          }
        `}
      >
        <Bot size={16} />
        <span>Agent</span>
        {mode === 'agent' && (
          <span className="flex items-center gap-1 text-xs opacity-75">
            <Clock size={12} />
            Automation
          </span>
        )}
      </button>
    </div>
  );
}
