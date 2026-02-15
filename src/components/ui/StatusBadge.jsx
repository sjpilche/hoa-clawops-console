/**
 * @file StatusBadge.jsx
 * @description Colored badge showing agent or run status.
 * Each status has exactly ONE color — no ambiguity.
 */

import React from 'react';
import { AGENT_STATUS } from '@/lib/constants';

export default function StatusBadge({ status }) {
  const config = AGENT_STATUS[status] || AGENT_STATUS.idle;

  return (
    <span className={`
      inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium
      ${config.bg} ${config.color}
    `}>
      <span className={`
        w-1.5 h-1.5 rounded-full ${config.dot}
        ${status === 'running' ? 'status-running' : ''}
      `} />
      {config.label}
    </span>
  );
}
