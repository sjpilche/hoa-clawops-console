/**
 * @file ThreadList.jsx
 * @description Sidebar showing all chat threads with switching capability.
 *
 * FEATURES:
 * - List of all threads
 * - Active thread highlighting
 * - Last message preview
 * - New thread button
 * - Delete thread option
 */

import React from 'react';
import { MessageSquare, Plus, Trash2, MoreVertical } from 'lucide-react';
import Button from '@/components/ui/Button';

export default function ThreadList({
  threads = [],
  activeThreadId,
  onSelectThread,
  onNewThread,
  onDeleteThread,
}) {
  const formatLastMessage = (content, maxLength = 40) => {
    if (!content) return 'No messages yet';
    return content.length > maxLength
      ? content.substring(0, maxLength) + '...'
      : content;
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'now';
    if (diffMins < 60) return `${diffMins}m`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d`;
  };

  return (
    <div className="w-64 bg-bg-secondary border-r border-border flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-border flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
          <MessageSquare size={16} />
          Threads
        </h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.preventDefault();
            onNewThread();
          }}
          title="New thread"
        >
          <Plus size={16} />
        </Button>
      </div>

      {/* Thread list */}
      <div className="flex-1 overflow-y-auto">
        {threads.length === 0 ? (
          <div className="p-4 text-center text-sm text-text-muted">
            No threads yet.
            <br />
            Start a conversation!
          </div>
        ) : (
          <div className="py-2">
            {threads.map((thread) => (
              <ThreadItem
                key={thread.id}
                thread={thread}
                isActive={thread.id === activeThreadId}
                onClick={() => onSelectThread(thread.id)}
                onDelete={() => onDeleteThread(thread.id)}
                formatLastMessage={formatLastMessage}
                formatTime={formatTime}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer with tips */}
      <div className="p-3 border-t border-border text-xs text-text-muted space-y-1">
        <div className="flex items-center gap-2">
          <code className="px-1.5 py-0.5 bg-bg-elevated rounded text-accent-primary">/run</code>
          <span>Execute agent</span>
        </div>
        <div className="flex items-center gap-2">
          <code className="px-1.5 py-0.5 bg-bg-elevated rounded text-accent-primary">/help</code>
          <span>Show commands</span>
        </div>
      </div>
    </div>
  );
}

/** Individual thread item */
function ThreadItem({
  thread,
  isActive,
  onClick,
  onDelete,
  formatLastMessage,
  formatTime,
}) {
  const [showMenu, setShowMenu] = React.useState(false);

  return (
    <div
      className={`
        relative px-3 py-3 mx-2 mb-1 rounded-lg cursor-pointer
        transition-colors group
        ${isActive
          ? 'bg-bg-elevated border border-accent-primary/30'
          : 'hover:bg-bg-elevated'
        }
      `}
      onClick={onClick}
    >
      {/* Thread title */}
      <div className="flex items-start justify-between gap-2 mb-1">
        <h3 className="text-sm font-medium text-text-primary truncate flex-1">
          {thread.title}
        </h3>
        <span className="text-xs text-text-disabled shrink-0">
          {formatTime(thread.updated_at)}
        </span>
      </div>

      {/* Last message preview */}
      {thread.lastMessage && (
        <p className="text-xs text-text-muted truncate">
          {formatLastMessage(thread.lastMessage)}
        </p>
      )}

      {/* Delete button (shown on hover) */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (confirm('Delete this thread? This cannot be undone.')) {
            onDelete();
          }
        }}
        className="
          absolute top-2 right-2
          w-6 h-6 rounded
          flex items-center justify-center
          opacity-0 group-hover:opacity-100
          hover:bg-accent-danger/20 hover:text-accent-danger
          transition-all
        "
        title="Delete thread"
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
}
