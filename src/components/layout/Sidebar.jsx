/**
 * @file Sidebar.jsx
 * @description Navigation sidebar with collapsible behavior.
 *
 * DESIGN:
 * - Dark background, 1px right border
 * - Icons + labels when expanded, icons only when collapsed
 * - Active page highlighted with accent color
 * - ClawOps logo/title at the top
 */

import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Bot,
  Clock,
  Activity,
  Database,
  Settings,
  PanelLeftClose,
  PanelLeft,
  Globe,
  GitBranch,
  Puzzle,
  Wrench,
  Shield,
  DollarSign,
  HelpCircle,
  Users,
  Zap,
  Facebook,
  MessageSquare,
  TrendingUp,
  Send,
  Building2,
  MapPin,
} from 'lucide-react';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { NAV_ITEMS } from '@/lib/constants';

/** Map icon names from constants to actual Lucide components */
const iconMap = {
  LayoutDashboard,
  Bot,
  Clock,
  Activity,
  Database,
  Settings,
  Globe,
  GitBranch,
  Puzzle,
  Wrench,
  Shield,
  DollarSign,
  HelpCircle,
  Users,
  Zap,
  Facebook,
  MessageSquare,
  TrendingUp,
  Send,
  Building2,
  MapPin,
};

export default function Sidebar() {
  const { sidebarCollapsed, toggleSidebar } = useSettingsStore();

  return (
    <aside className={`
      ${sidebarCollapsed ? 'w-16' : 'w-56'}
      h-full bg-bg-secondary border-r border-border
      flex flex-col shrink-0
      transition-all duration-200
    `}>
      {/* Logo / App Name */}
      <div className="h-14 px-4 flex items-center gap-3 border-b border-border">
        {/* Cyan accent square — our "logo" */}
        <div className="w-8 h-8 rounded-lg bg-accent-primary flex items-center justify-center shrink-0">
          <span className="text-bg-primary font-bold text-sm">C</span>
        </div>
        {!sidebarCollapsed && (
          <div>
            <div className="text-sm font-semibold text-text-primary leading-tight">ClawOps</div>
            <div className="text-[10px] text-text-muted font-mono">CONSOLE v2</div>
          </div>
        )}
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 py-3 px-2 flex flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          const Icon = iconMap[item.icon];
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => `
                flex items-center gap-3 px-3 py-2 rounded-md
                text-sm transition-colors duration-150
                ${isActive
                  ? 'bg-accent-primary/10 text-accent-primary font-medium'
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-elevated'
                }
                ${sidebarCollapsed ? 'justify-center' : ''}
              `}
              title={sidebarCollapsed ? item.label : undefined}
            >
              {Icon && <Icon size={18} className="shrink-0" />}
              {!sidebarCollapsed && <span>{item.label}</span>}
            </NavLink>
          );
        })}
      </nav>

      {/* Collapse Toggle */}
      <div className="p-2 border-t border-border">
        <button
          onClick={toggleSidebar}
          className="
            w-full flex items-center justify-center gap-2 px-3 py-2
            rounded-md text-text-muted hover:text-text-secondary hover:bg-bg-elevated
            transition-colors text-sm cursor-pointer
          "
          title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {sidebarCollapsed ? <PanelLeft size={18} /> : <PanelLeftClose size={18} />}
          {!sidebarCollapsed && <span>Collapse</span>}
        </button>
      </div>
    </aside>
  );
}
