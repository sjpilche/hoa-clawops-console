/**
 * @file StatCard.jsx
 * @description KPI / metric card for dashboards. Replaces inline KpiCard, StatCard, MetricCard variants.
 */
import { Link } from 'react-router-dom';
import { TrendingUp, TrendingDown } from 'lucide-react';

export default function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color = 'text-accent-primary',
  to,
  trend,
  glow = false,
  className = '',
}) {
  const glowMap = {
    'text-accent-primary': 'shadow-[var(--shadow-glow-primary)]',
    'text-accent-success': 'shadow-[var(--shadow-glow-success)]',
    'text-accent-danger':  'shadow-[var(--shadow-glow-danger)]',
    'text-accent-warning': 'shadow-[var(--shadow-glow-warning)]',
    'text-accent-info':    'shadow-[var(--shadow-glow-info)]',
  };

  const inner = (
    <div className={`
      p-5 bg-bg-secondary border border-border rounded-xl
      hover:border-accent-primary/40 transition-colors group
      ${glow ? glowMap[color] || '' : ''}
      ${className}
    `}>
      <div className="flex items-start justify-between mb-3">
        {Icon && (
          <div className={`p-2 rounded-lg bg-bg-elevated ${color}`}>
            <Icon size={18} />
          </div>
        )}
        <div className="flex items-center gap-2">
          {trend && (
            <span className={`flex items-center gap-0.5 text-xs font-medium ${
              trend.direction === 'up' ? 'text-accent-success' : 'text-accent-danger'
            }`}>
              {trend.direction === 'up' ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
              {trend.value}
            </span>
          )}
          {to && (
            <span className="text-xs text-text-muted group-hover:text-accent-primary transition-colors">
              View &rarr;
            </span>
          )}
        </div>
      </div>
      <div className="text-2xl font-bold text-text-primary font-mono leading-none mb-1">
        {value ?? '\u2014'}
      </div>
      <div className="text-xs text-text-muted">{label}</div>
      {sub && <div className="text-xs text-text-muted mt-0.5 opacity-70">{sub}</div>}
    </div>
  );

  return to ? <Link to={to}>{inner}</Link> : inner;
}
