/**
 * @file SectionHeader.jsx
 * @description Section heading with optional "View all" link and right-side content slot.
 */
import { Link } from 'react-router-dom';

export default function SectionHeader({
  title,
  to,
  linkLabel = 'View all',
  count,
  children,
}) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-text-muted">
          {title}
        </h2>
        {count != null && (
          <span className="text-xs bg-bg-elevated text-text-muted px-1.5 py-0.5 rounded-full font-mono">
            {count}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        {children}
        {to && (
          <Link to={to} className="text-xs text-accent-primary hover:underline">
            {linkLabel}
          </Link>
        )}
      </div>
    </div>
  );
}
