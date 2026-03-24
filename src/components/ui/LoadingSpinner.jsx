import { RefreshCw } from 'lucide-react';

/**
 * Consistent loading spinner used across all pages.
 * Drop-in replacement for "Loading..." plain text.
 */
export default function LoadingSpinner({ label = 'Loading...', className = '' }) {
  return (
    <div
      className={`flex items-center justify-center py-16 text-text-muted text-sm gap-2 ${className}`}
      role="status"
      aria-live="polite"
    >
      <RefreshCw size={16} className="animate-spin" aria-hidden="true" />
      {label}
    </div>
  );
}
