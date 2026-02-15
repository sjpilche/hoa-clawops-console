/**
 * @file CostWarning.jsx
 * @description Warning banner when approaching budget limits.
 */

import React from 'react';
import { DollarSign, AlertTriangle } from 'lucide-react';

export default function CostWarning({ currentCost, budgetLimit, onDismiss }) {
  const percentage = (currentCost / budgetLimit) * 100;
  const isNearLimit = percentage >= 80;
  const isOverLimit = percentage >= 100;

  if (percentage < 80) return null;

  return (
    <div
      className={`
        mx-4 mt-4 p-4 rounded-lg flex items-start gap-3 border
        ${isOverLimit
          ? 'bg-accent-danger/10 border-accent-danger/30'
          : 'bg-accent-warning/10 border-accent-warning/30'
        }
      `}
    >
      <div
        className={`
          w-10 h-10 rounded-full flex items-center justify-center shrink-0
          ${isOverLimit ? 'bg-accent-danger/20' : 'bg-accent-warning/20'}
        `}
      >
        {isOverLimit ? (
          <AlertTriangle size={20} className="text-accent-danger" />
        ) : (
          <DollarSign size={20} className="text-accent-warning" />
        )}
      </div>

      <div className="flex-1">
        <h4 className="font-semibold text-text-primary mb-1">
          {isOverLimit ? '❌ Budget Exceeded' : '⚠️ Approaching Budget Limit'}
        </h4>
        <p className="text-sm text-text-secondary mb-2">
          {isOverLimit
            ? `You've exceeded your budget limit of $${budgetLimit.toFixed(2)}.`
            : `You're at ${percentage.toFixed(0)}% of your $${budgetLimit.toFixed(2)} budget limit.`}
        </p>
        <div className="flex items-center gap-3 text-xs">
          <div>
            <span className="text-text-muted">Current: </span>
            <span className="font-semibold text-text-primary">${currentCost.toFixed(2)}</span>
          </div>
          <div>
            <span className="text-text-muted">Limit: </span>
            <span className="font-semibold text-text-primary">${budgetLimit.toFixed(2)}</span>
          </div>
          <div>
            <span className="text-text-muted">Remaining: </span>
            <span className={`font-semibold ${isOverLimit ? 'text-accent-danger' : 'text-accent-warning'}`}>
              ${Math.max(0, budgetLimit - currentCost).toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      {onDismiss && (
        <button
          onClick={onDismiss}
          className="p-1 text-text-muted hover:text-text-primary transition-colors"
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}
