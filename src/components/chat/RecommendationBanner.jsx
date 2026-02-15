/**
 * @file RecommendationBanner.jsx
 * @description Smart banner that suggests mode switches based on message content.
 */

import React from 'react';
import { Lightbulb, X, ArrowRight } from 'lucide-react';
import Button from '@/components/ui/Button';

export default function RecommendationBanner({
  recommendedMode,
  reason,
  onAccept,
  onDismiss,
}) {
  if (!recommendedMode) return null;

  const modeLabels = {
    chat: '💬 Chat Mode',
    agent: '🤖 Agent Mode',
  };

  return (
    <div className="mx-4 mt-4 mb-2 p-4 bg-accent-warning/10 border border-accent-warning/30 rounded-lg flex items-start gap-3 animate-slideDown">
      {/* Icon */}
      <Lightbulb size={20} className="text-accent-warning shrink-0 mt-0.5" />

      {/* Content */}
      <div className="flex-1">
        <div className="font-medium text-text-primary mb-1">
          {reason}
        </div>
        <div className="text-sm text-text-secondary">
          Switch to <strong>{modeLabels[recommendedMode]}</strong> for better results?
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 shrink-0">
        <Button
          variant="primary"
          size="sm"
          onClick={onAccept}
        >
          <ArrowRight size={14} />
          Switch
        </Button>
        <button
          onClick={onDismiss}
          className="p-1 text-text-muted hover:text-text-primary transition-colors"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
