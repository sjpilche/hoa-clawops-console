/**
 * @file Message.jsx
 * @description Individual message bubble in the chat interface.
 *
 * SENDER TYPES:
 * - user: Messages from the human user (right-aligned, cyan accent)
 * - agent: Responses from OpenClaw agents (left-aligned, gray)
 * - system: System notifications (centered, muted)
 *
 * MESSAGE TYPES:
 * - text: Regular text message
 * - code: Code block
 * - status: Agent status update (running, success, failed)
 * - error: Error message
 */

import React from 'react';
import ReactMarkdown from 'react-markdown';
import { Bot, User, AlertCircle, CheckCircle, XCircle, Clock } from 'lucide-react';

const senderStyles = {
  user: {
    container: 'flex justify-end',
    bubble: 'bg-accent-primary text-bg-primary',
    icon: User,
    iconBg: 'bg-accent-primary/20',
  },
  agent: {
    container: 'flex justify-start',
    bubble: 'bg-bg-elevated text-text-primary',
    icon: Bot,
    iconBg: 'bg-accent-info/20',
  },
  system: {
    container: 'flex justify-center',
    bubble: 'bg-bg-secondary text-text-muted border border-border',
    icon: AlertCircle,
    iconBg: 'bg-bg-elevated',
  },
};

const statusIcons = {
  running: Clock,
  success: CheckCircle,
  failed: XCircle,
  error: XCircle,
};

export default function Message({
  sender_type = 'user',
  content,
  msg_type = 'text',
  metadata = {},
  created_at
}) {
  const styles = senderStyles[sender_type] || senderStyles.user;
  const IconComponent = styles.icon;
  const StatusIcon = statusIcons[msg_type] || null;

  // Format timestamp to relative time (e.g., "2m ago")
  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  // Special rendering for system/status messages
  if (sender_type === 'system' || msg_type === 'status') {
    return (
      <div className={styles.container}>
        <div className="flex items-center gap-2 text-xs text-text-muted italic py-2">
          {StatusIcon && <StatusIcon size={12} className="shrink-0" />}
          <span>{content}</span>
          {created_at && (
            <span className="text-text-disabled">{formatTime(created_at)}</span>
          )}
        </div>
      </div>
    );
  }

  // Regular message bubble
  return (
    <div className={styles.container}>
      <div className="flex gap-3 max-w-[80%] group">
        {/* Avatar */}
        {sender_type !== 'user' && (
          <div className={`w-8 h-8 rounded-full ${styles.iconBg} flex items-center justify-center shrink-0`}>
            <IconComponent size={16} className="text-text-secondary" />
          </div>
        )}

        {/* Message Content */}
        <div className="flex flex-col gap-1">
          <div className={`
            ${styles.bubble}
            px-4 py-2.5 rounded-2xl
            ${sender_type === 'user' ? 'rounded-tr-sm' : 'rounded-tl-sm'}
            break-words
          `}>
            {msg_type === 'code' ? (
              <pre className="text-xs font-mono whitespace-pre-wrap overflow-x-auto">
                <code>{content}</code>
              </pre>
            ) : msg_type === 'error' ? (
              <div className="flex items-start gap-2">
                <XCircle size={16} className="shrink-0 mt-0.5 text-accent-danger" />
                <span className="text-sm">{content}</span>
              </div>
            ) : sender_type === 'agent' ? (
              <div className="text-sm prose prose-invert prose-sm max-w-none [&>p]:my-1 [&>ul]:my-1 [&>ol]:my-1">
                <ReactMarkdown>{content}</ReactMarkdown>
              </div>
            ) : (
              <p className="text-sm whitespace-pre-wrap">{content}</p>
            )}

            {/* Metadata display (e.g., cost, duration) */}
            {metadata && Object.keys(metadata).length > 0 && (
              <div className="mt-2 pt-2 border-t border-current/10 flex flex-wrap gap-3 text-xs opacity-70">
                {metadata.cost && <span>💰 ${metadata.cost}</span>}
                {metadata.duration && <span>⏱️ {metadata.duration}s</span>}
                {metadata.tokens && <span>🔢 {metadata.tokens} tokens</span>}
              </div>
            )}
          </div>

          {/* Timestamp */}
          {created_at && (
            <span className={`
              text-xs text-text-disabled
              ${sender_type === 'user' ? 'text-right' : 'text-left'}
              opacity-0 group-hover:opacity-100 transition-opacity
            `}>
              {formatTime(created_at)}
            </span>
          )}
        </div>

        {/* User avatar (right side) */}
        {sender_type === 'user' && (
          <div className={`w-8 h-8 rounded-full ${styles.iconBg} flex items-center justify-center shrink-0`}>
            <IconComponent size={16} className="text-accent-primary" />
          </div>
        )}
      </div>
    </div>
  );
}
