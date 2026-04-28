/**
 * Reusable card component — standardizes bg, border, radius, and padding.
 *
 * Usage:
 *   <Card>Content</Card>
 *   <Card variant="elevated" padding="lg">Bigger padding</Card>
 *   <Card interactive to="/agents">Clickable card</Card>
 */
import { Link } from 'react-router-dom';

const variants = {
  default:  'bg-bg-secondary border border-border',
  elevated: 'bg-bg-elevated border border-border',
  ghost:    'bg-transparent border border-transparent',
  accent:   'bg-bg-secondary border border-accent-primary/30',
};

const paddings = {
  none: '',
  sm:   'p-3',
  md:   'p-4',
  lg:   'p-5',
  xl:   'p-6',
};

export default function Card({
  children,
  variant = 'default',
  padding = 'md',
  interactive = false,
  to,
  className = '',
  ...props
}) {
  const classes = `
    ${variants[variant] || variants.default}
    ${paddings[padding] || paddings.md}
    rounded-xl
    ${interactive ? 'hover:border-accent-primary/40 transition-colors cursor-pointer' : ''}
    ${className}
  `.trim();

  if (to) {
    return (
      <Link to={to} className={classes} {...props}>
        {children}
      </Link>
    );
  }

  return (
    <div className={classes} {...props}>
      {children}
    </div>
  );
}
