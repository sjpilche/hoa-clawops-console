/**
 * @file Badge.jsx
 * @description Status badge with color variants. Replaces inline RunStatusBadge / StatusBadge patterns.
 */

const variantStyles = {
  success: 'bg-accent-success/10 text-accent-success',
  danger:  'bg-accent-danger/10 text-accent-danger',
  warning: 'bg-accent-warning/10 text-accent-warning',
  info:    'bg-accent-info/10 text-accent-info',
  neutral: 'bg-bg-elevated text-text-muted',
  primary: 'bg-accent-primary/10 text-accent-primary',
};

const dotColors = {
  success: 'bg-accent-success',
  danger:  'bg-accent-danger',
  warning: 'bg-accent-warning',
  info:    'bg-accent-info',
  neutral: 'bg-text-muted',
  primary: 'bg-accent-primary',
};

const sizes = {
  sm: 'text-[10px] px-1.5 py-0.5',
  md: 'text-xs px-2 py-0.5',
};

export default function Badge({
  variant = 'neutral',
  size = 'md',
  dot = false,
  pulse = false,
  children,
  className = '',
}) {
  return (
    <span className={`
      inline-flex items-center gap-1.5 rounded-full font-medium
      ${variantStyles[variant] || variantStyles.neutral}
      ${sizes[size] || sizes.md}
      ${className}
    `}>
      {dot && (
        <span className={`
          w-1.5 h-1.5 rounded-full shrink-0
          ${dotColors[variant] || dotColors.neutral}
          ${pulse ? 'animate-pulse' : ''}
        `} />
      )}
      {children}
    </span>
  );
}

/** Helper: map common status strings to badge variants */
Badge.variantFromStatus = function(status) {
  const map = {
    success: 'success', completed: 'success', active: 'success', enabled: 'success',
    failed: 'danger', error: 'danger', disabled: 'danger',
    running: 'info', pending: 'warning', queued: 'warning',
    cancelled: 'neutral', idle: 'neutral', draft: 'neutral',
  };
  return map[status] || 'neutral';
};
