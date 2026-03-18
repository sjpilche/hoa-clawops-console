/**
 * @file Button.jsx
 * @description Reusable button component with variants.
 */

import React from 'react';

const variants = {
  primary: 'bg-accent-primary text-bg-primary hover:bg-accent-primary/85 active:bg-accent-primary/70 font-semibold shadow-sm shadow-accent-primary/20',
  danger: 'bg-accent-danger text-white hover:bg-accent-danger/85 active:bg-accent-danger/70 font-semibold shadow-sm shadow-accent-danger/20',
  success: 'bg-accent-success text-bg-primary hover:bg-accent-success/85 active:bg-accent-success/70 font-semibold shadow-sm shadow-accent-success/20',
  ghost: 'bg-transparent text-text-secondary hover:bg-bg-elevated hover:text-text-primary active:bg-bg-elevated/80',
  outline: 'border border-border text-text-secondary hover:border-text-muted hover:text-text-primary hover:bg-bg-elevated/50 active:bg-bg-elevated bg-transparent',
};

const sizes = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-2.5 text-base',
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
        rounded-lg transition-all duration-150 cursor-pointer
        focus:outline-none focus:ring-2 focus:ring-accent-primary/30 focus:ring-offset-1 focus:ring-offset-bg-primary
        disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none
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
