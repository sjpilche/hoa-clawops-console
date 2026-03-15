/**
 * @file constants.js
 * @description App-wide constants. Single source of truth for magic values.
 */

/** Navigation items for the sidebar */
export const NAV_ITEMS = [
  { path: '/', label: 'Dashboard', icon: 'LayoutDashboard' },
  { path: '/mission-control', label: 'System Monitor', icon: 'Crosshair' },
  { path: '/chat', label: 'Agent Chat', icon: 'MessageSquare' },
  { path: '/domains', label: 'Domains', icon: 'Globe' },
  { path: '/agents', label: 'Agents', icon: 'Bot' },
  { path: '/hierarchy', label: 'Hierarchy', icon: 'GitBranch' },
  { path: '/directory', label: 'Directory', icon: 'Users' },
  { path: '/extensions', label: 'Extensions', icon: 'Puzzle' },
  { path: '/tools', label: 'Tools', icon: 'Wrench' },
  { path: '/schedule', label: 'Scheduler', icon: 'Clock' },
  { path: '/monitor', label: 'Monitor', icon: 'Activity' },
  { path: '/results', label: 'Results', icon: 'Database' },
  { path: '/lead-gen', label: 'Lead Gen', icon: 'Users' },
  { path: '/discovery', label: 'Discovery', icon: 'MapPin' },
  { path: '/mgmt-research', label: 'Mgmt Research', icon: 'Building' },
  { path: '/jake-marketing', label: 'Jake Marketing', icon: 'Zap' },
  { path: '/owen-marketing', label: 'Owen CFO', icon: 'Zap' },
  { path: '/data-rehab', label: 'Data Rehab', icon: 'Database' },
  { path: '/pipeline-health', label: 'Pipeline Health', icon: 'Activity' },
  { path: '/hoa-leads', label: 'HOA Contacts', icon: 'Building2' },
  { path: '/livempaint', label: 'Livempaint', icon: 'Users' },
  { path: '/engagement-queue', label: 'Engagement Queue', icon: 'MessageSquare' },
  { path: '/facebook-leads', label: 'FB Leads', icon: 'Facebook' },
  { path: '/content-queue', label: 'Content Queue', icon: 'Send' },
  { path: '/blitz', label: 'Blitz Mode', icon: 'Zap' },
  { path: '/pipelines', label: 'Pipelines', icon: 'GitMerge' },
  { path: '/trading', label: 'Trader', icon: 'TrendingUp' },
  { path: '/opportunities', label: 'Opportunities', icon: 'Radar' },
  { path: '/rse', label: 'Signal Engine', icon: 'Radio' },
  { path: '/audit', label: 'Audit Log', icon: 'Shield' },
  { path: '/costs', label: 'Costs', icon: 'DollarSign' },
  { path: '/help', label: 'Help', icon: 'HelpCircle' },
  { path: '/settings', label: 'Settings', icon: 'Settings' },
];

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
