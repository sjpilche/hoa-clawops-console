/**
 * @file Button.jsx
 * @description Reusable button component with variants.
 *
 * VARIANTS:
 * - primary: Cyan accent — for main actions
 * - danger: Red — for destructive actions (delete, stop)
 * - ghost: Transparent — for subtle actions
 * - outline: Bordered — for secondary actions
 *
 * SIZES: sm, md, lg
 *
 * @example
 *   <Button variant="primary" onClick={handleSave}>Save</Button>
 *   <Button variant="danger" size="sm" onClick={handleDelete}>Delete</Button>
 */

import React from 'react';

const variants = {
  primary: 'bg-accent-primary text-bg-primary hover:bg-accent-primary/80 font-semibold',
  danger: 'bg-accent-danger text-white hover:bg-accent-danger/80 font-semibold',
  success: 'bg-accent-success text-bg-primary hover:bg-accent-success/80 font-semibold',
  ghost: 'bg-transparent text-text-secondary hover:bg-bg-elevated hover:text-text-primary',
  outline: 'border border-border text-text-secondary hover:border-border-focus hover:text-text-primary bg-transparent',
};

const sizes = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-3 text-base',
};

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  className = '',
  disabled = false,
  ...props
}) {
  return (
    <button
      className={`
        inline-flex items-center justify-center gap-2
        rounded-md transition-colors duration-150 cursor-pointer
        disabled:opacity-50 disabled:cursor-not-allowed
        ${variants[variant] || variants.primary}
        ${sizes[size] || sizes.md}
        ${className}
      `}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
