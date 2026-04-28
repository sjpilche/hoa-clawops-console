/**
 * @file chartTheme.js
 * @description Shared Recharts theme — consistent colors, tooltip, grid, and axis styling.
 */

export const CHART_COLORS = [
  '#06B6D4', // accent-primary (cyan)
  '#8B5CF6', // accent-info (purple)
  '#10B981', // accent-success (green)
  '#F59E0B', // accent-warning (amber)
  '#EF4444', // accent-danger (red)
  '#3B82F6', // blue
  '#EC4899', // pink
  '#F97316', // orange
];

export const CHART_TOOLTIP = {
  contentStyle: {
    backgroundColor: '#1E293B',
    border: '1px solid #334155',
    borderRadius: '8px',
    color: '#F1F5F9',
    fontSize: '12px',
    fontFamily: "'IBM Plex Sans', sans-serif",
  },
  itemStyle: { color: '#94A3B8' },
  cursor: { fill: 'rgba(6, 182, 212, 0.05)' },
};

export const CHART_GRID = {
  strokeDasharray: '3 3',
  stroke: '#1E293B',
};

export const CHART_AXIS = {
  stroke: '#475569',
  fontSize: 11,
  fontFamily: "'IBM Plex Mono', monospace",
  tick: { fill: '#94A3B8' },
};
