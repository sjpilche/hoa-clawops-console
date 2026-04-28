/**
 * @file Tooltip.jsx
 * @description Lightweight tooltip using CSS-only positioning. No external deps.
 */
import { useState, useRef } from 'react';

export default function Tooltip({ children, content, position = 'top', className = '' }) {
  const [visible, setVisible] = useState(false);
  const timeoutRef = useRef(null);

  const show = () => {
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setVisible(true), 200);
  };

  const hide = () => {
    clearTimeout(timeoutRef.current);
    setVisible(false);
  };

  const positions = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  };

  if (!content) return children;

  return (
    <div
      className={`relative inline-flex ${className}`}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {visible && (
        <div
          className={`
            absolute z-50 px-2.5 py-1.5 text-xs text-text-primary
            bg-bg-elevated border border-border rounded-lg shadow-md shadow-black/30
            whitespace-nowrap pointer-events-none
            animate-fade-in
            ${positions[position] || positions.top}
          `}
          role="tooltip"
        >
          {content}
        </div>
      )}
    </div>
  );
}
