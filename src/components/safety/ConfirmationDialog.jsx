/**
 * @file ConfirmationDialog.jsx
 * @description Confirmation modal for destructive or expensive actions.
 */

import React from 'react';
import { AlertTriangle, X } from 'lucide-react';
import Button from '@/components/ui/Button';

export default function ConfirmationDialog({
  isOpen,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
  variant = 'danger',
}) {
  if (!isOpen) return null;

  const variantStyles = {
    danger: {
      icon: AlertTriangle,
      iconColor: 'text-accent-danger',
      confirmVariant: 'danger',
    },
    warning: {
      icon: AlertTriangle,
      iconColor: 'text-accent-warning',
      confirmVariant: 'primary',
    },
  };

  const style = variantStyles[variant] || variantStyles.danger;
  const IconComponent = style.icon;

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 animate-fadeIn"
      onClick={onCancel}
    >
      <div
        className="bg-bg-primary border border-border rounded-xl max-w-md w-full p-6 animate-scaleIn"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Icon */}
        <div className={`w-12 h-12 rounded-full bg-${variant === 'danger' ? 'accent-danger' : 'accent-warning'}/10 flex items-center justify-center mb-4`}>
          <IconComponent size={24} className={style.iconColor} />
        </div>

        {/* Title */}
        <h3 className="text-lg font-semibold text-text-primary mb-2">{title}</h3>

        {/* Message */}
        <p className="text-sm text-text-secondary leading-relaxed mb-6">{message}</p>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <Button
            variant={style.confirmVariant}
            onClick={onConfirm}
            className="flex-1"
          >
            {confirmText}
          </Button>
          <Button variant="ghost" onClick={onCancel}>
            {cancelText}
          </Button>
        </div>
      </div>
    </div>
  );
}
