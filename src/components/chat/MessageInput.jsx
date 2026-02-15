/**
 * @file MessageInput.jsx
 * @description Message input with send button and slash command support.
 *
 * FEATURES:
 * - Enter to send, Shift+Enter for newline
 * - Slash command autocomplete
 * - Disabled when agent is processing
 * - Command suggestions dropdown
 */

import React, { useState, useRef, useEffect } from 'react';
import { Send, Loader } from 'lucide-react';
import Button from '@/components/ui/Button';

const SLASH_COMMANDS = [
  { command: '/run', description: 'Execute an agent', example: '/run agent-name task' },
  { command: '/stop', description: 'Stop a running agent', example: '/stop session-id' },
  { command: '/list', description: 'List all agents', example: '/list' },
  { command: '/help', description: 'Show available commands', example: '/help' },
];

export default function MessageInput({
  onSend,
  isDisabled = false,
  placeholder = 'Type a message or /command...'
}) {
  const [message, setMessage] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const textareaRef = useRef(null);

  // Handle input change and command suggestions
  const handleChange = (e) => {
    const value = e.target.value;
    setMessage(value);

    // Show command suggestions if user types "/"
    if (value.startsWith('/')) {
      const input = value.toLowerCase();
      const filtered = SLASH_COMMANDS.filter(
        cmd => cmd.command.startsWith(input.split(' ')[0])
      );
      setSuggestions(filtered);
      setShowSuggestions(filtered.length > 0);
      setSelectedIndex(0);
    } else {
      setShowSuggestions(false);
    }
  };

  // Handle keyboard shortcuts
  const handleKeyDown = (e) => {
    // Suggestions navigation
    if (showSuggestions) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, suggestions.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
      } else if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        e.preventDefault();
        if (suggestions[selectedIndex]) {
          setMessage(suggestions[selectedIndex].command + ' ');
          setShowSuggestions(false);
          textareaRef.current?.focus();
        }
      } else if (e.key === 'Escape') {
        setShowSuggestions(false);
      }
      return;
    }

    // Send message on Enter (without Shift)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Handle send button click
  const handleSend = () => {
    const trimmed = message.trim();
    if (!trimmed || isDisabled) return;

    onSend(trimmed);
    setMessage('');
    setShowSuggestions(false);

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [message]);

  return (
    <div className="relative">
      {/* Command suggestions dropdown */}
      {showSuggestions && (
        <div className="absolute bottom-full left-0 right-0 mb-2 bg-bg-elevated border border-border rounded-lg shadow-xl overflow-hidden">
          {suggestions.map((cmd, index) => (
            <button
              key={cmd.command}
              onClick={() => {
                setMessage(cmd.command + ' ');
                setShowSuggestions(false);
                textareaRef.current?.focus();
              }}
              className={`
                w-full px-4 py-3 text-left transition-colors
                ${index === selectedIndex ? 'bg-bg-secondary' : 'hover:bg-bg-secondary'}
              `}
            >
              <div className="flex items-center gap-3">
                <code className="text-accent-primary font-semibold">{cmd.command}</code>
                <span className="text-sm text-text-muted flex-1">{cmd.description}</span>
              </div>
              <div className="text-xs text-text-disabled mt-1 font-mono">{cmd.example}</div>
            </button>
          ))}
        </div>
      )}

      {/* Input container */}
      <div className="flex items-end gap-2 p-4 bg-bg-secondary border-t border-border">
        {/* Textarea */}
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={message}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={isDisabled}
            rows={1}
            className="
              w-full px-4 py-3 pr-12
              bg-bg-elevated border border-border rounded-lg
              text-sm text-text-primary placeholder-text-muted
              resize-none overflow-hidden
              focus:outline-none focus:border-accent-primary focus:ring-1 focus:ring-accent-primary
              disabled:opacity-50 disabled:cursor-not-allowed
              max-h-32
            "
            style={{ minHeight: '44px' }}
          />

          {/* Send button inside textarea */}
          <button
            onClick={handleSend}
            disabled={isDisabled || !message.trim()}
            className={`
              absolute right-2 bottom-2
              w-8 h-8 rounded-md
              flex items-center justify-center
              transition-colors
              ${message.trim() && !isDisabled
                ? 'bg-accent-primary text-bg-primary hover:bg-accent-primary/80'
                : 'bg-bg-secondary text-text-disabled cursor-not-allowed'
              }
            `}
          >
            {isDisabled ? (
              <Loader size={16} className="animate-spin" />
            ) : (
              <Send size={16} />
            )}
          </button>
        </div>

        {/* External send button (optional, for mobile) */}
        <Button
          variant="primary"
          onClick={handleSend}
          disabled={isDisabled || !message.trim()}
          className="shrink-0 md:hidden"
        >
          <Send size={16} />
        </Button>
      </div>

      {/* Helper text */}
      <div className="px-4 pb-2 text-xs text-text-muted">
        <span className="opacity-0 group-hover:opacity-100 transition-opacity">
          Press Enter to send, Shift+Enter for newline, / for commands
        </span>
      </div>
    </div>
  );
}
