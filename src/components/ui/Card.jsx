/**
 * Reusable card component — standardizes bg, border, radius, and padding.
 *
 * Usage:
 *   <Card>Content</Card>
 *   <Card className="p-6">Bigger padding</Card>
 */
export default function Card({ children, className = '' }) {
  return (
    <div className={`bg-bg-elevated border border-border rounded-lg p-4 ${className}`}>
      {children}
    </div>
  );
}
