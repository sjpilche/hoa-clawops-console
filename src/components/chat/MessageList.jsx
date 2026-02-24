/**
 * @file MessageList.jsx
 * @description Scrollable container for chat messages with auto-scroll.
 *
 * FEATURES:
 * - Auto-scrolls to bottom when new messages arrive
 * - Scroll to bottom button when user scrolls up
 * - Loading states
 * - Empty state
 */

import React, { useEffect, useRef, useState } from 'react';
import { ArrowDown, Loader } from 'lucide-react';
import Message from './Message';
import Button from '@/components/ui/Button';

export default function MessageList({ messages = [], isLoading = false }) {
  const messagesEndRef = useRef(null);
  const containerRef = useRef(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [isNearBottom, setIsNearBottom] = useState(true);

  // Auto-scroll to bottom when new messages arrive (if user is near bottom)
  useEffect(() => {
    if (isNearBottom && messages.length > 0) {
      scrollToBottom('smooth');
    }
  }, [messages, isNearBottom]);

  // Check if user is near bottom of scroll
  const handleScroll = () => {
    if (!containerRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    const nearBottom = distanceFromBottom < 100;

    setIsNearBottom(nearBottom);
    setShowScrollButton(!nearBottom && messages.length > 0);
  };

  const scrollToBottom = (behavior = 'auto') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  // Empty state
  if (!isLoading && messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center space-y-3 max-w-md">
          <div className="text-4xl">💬</div>
          <h3 className="text-lg font-semibold text-text-primary">
            No messages yet
          </h3>
          <p className="text-sm text-text-secondary">
            Start a conversation by typing a message below.
            Try <code className="px-2 py-0.5 bg-bg-elevated rounded text-accent-primary">/help</code> to see available commands.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 relative">
      {/* Messages container */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="absolute inset-0 overflow-y-auto px-4 py-6 space-y-4 scroll-smooth"
      >
        {/* Loading indicator */}
        {isLoading && messages.length === 0 && (
          <div className="flex items-center justify-center py-8">
            <Loader size={24} className="animate-spin text-text-muted" />
          </div>
        )}

        {/* Messages */}
        {messages.map((message) => {
          let meta = {};
          try {
            meta = typeof message.metadata === 'string'
              ? JSON.parse(message.metadata)
              : (message.metadata || {});
          } catch {}
          return (
            <Message
              key={message.id}
              sender_type={message.sender_type}
              content={message.content}
              msg_type={message.msg_type}
              metadata={meta}
              created_at={message.created_at}
            />
          );
        })}

        {/* Scroll anchor */}
        <div ref={messagesEndRef} />
      </div>

      {/* Scroll to bottom button */}
      {showScrollButton && (
        <div className="absolute bottom-4 right-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => scrollToBottom('smooth')}
            className="shadow-lg"
          >
            <ArrowDown size={16} />
            New messages
          </Button>
        </div>
      )}
    </div>
  );
}
