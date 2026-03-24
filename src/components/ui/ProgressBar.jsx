/**
 * @file ProgressBar.jsx
 * @description Horizontal progress bar with optional label and value display.
 */

export default function ProgressBar({
  value = 0,
  color = 'bg-accent-primary',
  label,
  showValue = false,
  size = 'md',
  className = '',
}) {
  const clamped = Math.max(0, Math.min(100, value));
  const heights = { sm: 'h-1', md: 'h-1.5', lg: 'h-2.5' };

  return (
    <div className={className}>
      {(label || showValue) && (
        <div className="flex justify-between text-xs mb-1">
          {label && <span className="text-text-secondary">{label}</span>}
          {showValue && (
            <span className="text-text-primary font-mono font-semibold">
              {Math.round(clamped)}%
            </span>
          )}
        </div>
      )}
      <div
        className={`${heights[size] || heights.md} bg-bg-elevated rounded-full overflow-hidden`}
        role="progressbar"
        aria-valuenow={Math.round(clamped)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label || 'Progress'}
      >
        <div
          className={`h-full ${color} rounded-full transition-all duration-700`}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}
