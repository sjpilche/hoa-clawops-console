/**
 * @file constants.js
 * @description App-wide constants. Single source of truth for magic values.
 */

/** Navigation items for the sidebar — organized for money-making focus */
export const NAV_SECTIONS = [
  {
    label: 'Command',
    items: [
      { path: '/', label: 'War Room', icon: 'LayoutDashboard' },
      { path: '/pipeline-health', label: 'Pipeline', icon: 'Activity' },
      { path: '/revenue', label: 'Revenue', icon: 'DollarSign' },
    ],
  },
  {
    label: 'Outreach',
    items: [
      { path: '/jake-marketing', label: 'Jake CFO', icon: 'Zap' },
      { path: '/data-rehab', label: 'Data Rehab', icon: 'Database' },
      { path: '/hoa-leads', label: 'HOA', icon: 'Building2' },
      { path: '/content-queue', label: 'Content', icon: 'Send' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { path: '/agents', label: 'Agents', icon: 'Bot' },
      { path: '/schedule', label: 'Schedules', icon: 'Clock' },
      { path: '/monitor', label: 'Monitor', icon: 'Activity' },
      { path: '/results', label: 'Results', icon: 'Database' },
      { path: '/chat', label: 'Chat', icon: 'MessageSquare' },
    ],
  },
  {
    label: 'Intel',
    items: [
      { path: '/discovery', label: 'Discovery', icon: 'MapPin' },
      { path: '/brain', label: 'Brain', icon: 'Brain' },
      { path: '/dream-team', label: 'Dream Team', icon: 'Award' },
    ],
  },
  {
    label: 'System',
    items: [
      { path: '/costs', label: 'Costs', icon: 'DollarSign' },
      { path: '/settings', label: 'Settings', icon: 'Settings' },
      { path: '/command-center', label: 'Legacy Dashboard', icon: 'LayoutDashboard' },
    ],
  },
];

/** Flat list for backward compatibility */
export const NAV_ITEMS = NAV_SECTIONS.flatMap(s => s.items);

/** Agent status values and their display properties */
export const AGENT_STATUS = {
  idle: { label: 'Idle', color: 'text-text-muted', bg: 'bg-bg-elevated', dot: 'bg-text-muted' },
  running: { label: 'Running', color: 'text-accent-success', bg: 'bg-accent-success/10', dot: 'bg-accent-success' },
  success: { label: 'Success', color: 'text-accent-success', bg: 'bg-accent-success/10', dot: 'bg-accent-success' },
  failed: { label: 'Failed', color: 'text-accent-danger', bg: 'bg-accent-danger/10', dot: 'bg-accent-danger' },
  disabled: { label: 'Disabled', color: 'text-text-muted', bg: 'bg-bg-elevated', dot: 'bg-text-muted' },
  completed: { label: 'Completed', color: 'text-accent-info', bg: 'bg-accent-info/10', dot: 'bg-accent-info' },
  error: { label: 'Error', color: 'text-accent-danger', bg: 'bg-accent-danger/10', dot: 'bg-accent-danger' },
};

/** Run status values */
export const RUN_STATUS = {
  pending: { label: 'Pending', color: 'text-accent-warning' },
  running: { label: 'Running', color: 'text-accent-success' },
  success: { label: 'Success', color: 'text-accent-success' },
  failed: { label: 'Failed', color: 'text-accent-danger' },
  completed: { label: 'Completed', color: 'text-accent-info' },
  cancelled: { label: 'Cancelled', color: 'text-text-muted' },
  timeout: { label: 'Timeout', color: 'text-accent-warning' },
};

/** Message sender types */
export const SENDER_TYPES = {
  user: 'user',
  agent: 'agent',
  system: 'system',
};
