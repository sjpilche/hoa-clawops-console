/**
 * @file constants.js
 * @description App-wide constants. Single source of truth for magic values.
 */

/** Navigation items for the sidebar — grouped by section */
export const NAV_SECTIONS = [
  {
    label: 'Command',
    items: [
      { path: '/', label: 'Dashboard', icon: 'LayoutDashboard' },
      { path: '/mission-control', label: 'System Monitor', icon: 'Crosshair' },
      { path: '/chat', label: 'Agent Chat', icon: 'MessageSquare' },
    ],
  },
  {
    label: 'Agents',
    items: [
      { path: '/agents', label: 'Agents', icon: 'Bot' },
      { path: '/directory', label: 'Directory', icon: 'Users' },
      { path: '/hierarchy', label: 'Hierarchy', icon: 'GitBranch' },
      { path: '/schedule', label: 'Scheduler', icon: 'Clock' },
      { path: '/monitor', label: 'Monitor', icon: 'Activity' },
      { path: '/results', label: 'Results', icon: 'Database' },
      { path: '/brain', label: 'Brain', icon: 'Brain' },
    ],
  },
  {
    label: 'Revenue',
    items: [
      { path: '/revenue', label: 'Revenue', icon: 'DollarSign' },
      { path: '/rse', label: 'Signal Engine', icon: 'Radio' },
      { path: '/opportunities', label: 'Opportunities', icon: 'Radar' },
      { path: '/trading', label: 'Trader', icon: 'TrendingUp' },
    ],
  },
  {
    label: 'Outreach',
    items: [
      { path: '/jake-marketing', label: 'Jake Outreach', icon: 'Zap' },
      { path: '/data-rehab', label: 'Data Rehab', icon: 'Database' },
      { path: '/hoa-leads', label: 'HOA Contacts', icon: 'Building2' },
      { path: '/lead-gen', label: 'Lead Gen', icon: 'Users' },
      { path: '/engagement-queue', label: 'Engagement', icon: 'MessageSquare' },
      { path: '/content-queue', label: 'Content Queue', icon: 'Send' },
      { path: '/blitz', label: 'Blitz Mode', icon: 'Zap' },
    ],
  },
  {
    label: 'Research',
    items: [
      { path: '/discovery', label: 'Discovery', icon: 'MapPin' },
      { path: '/mgmt-research', label: 'Mgmt Research', icon: 'Building2' },
      { path: '/pipeline-health', label: 'Pipeline Health', icon: 'Activity' },
      { path: '/pipelines', label: 'Pipelines', icon: 'GitMerge' },
      { path: '/facebook-leads', label: 'FB Leads', icon: 'Facebook' },
    ],
  },
  {
    label: 'System',
    items: [
      { path: '/domains', label: 'Domains', icon: 'Globe' },
      { path: '/extensions', label: 'Extensions', icon: 'Puzzle' },
      { path: '/tools', label: 'Tools', icon: 'Wrench' },
      { path: '/livempaint', label: 'Livempaint', icon: 'Users' },
      { path: '/audit', label: 'Audit Log', icon: 'Shield' },
      { path: '/costs', label: 'Costs', icon: 'DollarSign' },
      { path: '/settings', label: 'Settings', icon: 'Settings' },
      { path: '/help', label: 'Help', icon: 'HelpCircle' },
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
