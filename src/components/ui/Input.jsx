/**
 * @file Input.jsx
 * @description Styled text input matching our dark theme.
 */

import React from 'react';

export default function Input({ label, error, helpText, className = '', ...props }) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label className="text-sm text-text-secondary font-medium">
          {label}
        </label>
      )}
      <input
        className={`
          w-full px-3 py-2 rounded-md
          bg-bg-primary border border-border
          text-text-primary text-sm font-sans
          placeholder:text-text-muted
          focus:outline-none focus:border-accent-primary focus:ring-1 focus:ring-accent-primary/30
          transition-colors duration-150
          ${error ? 'border-accent-danger' : ''}
          ${className}
        `}
        {...props}
      />
      {error && (
        <p className="text-xs text-accent-danger">{error}</p>
      )}
      {!error && helpText && (
        <p className="text-xs text-text-muted">{helpText}</p>
      )}
    </div>
  );
}
