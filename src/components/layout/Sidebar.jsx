/**
 * @file Sidebar.jsx
 * @description Navigation sidebar with collapsible behavior, grouped sections, and mobile overlay.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  Crosshair,
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
  GitMerge,
  Radar,
  Radio,
  Brain,
  Award,
} from 'lucide-react';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { NAV_SECTIONS } from '@/lib/constants';

/** Map icon names from constants to actual Lucide components */
const iconMap = {
  Crosshair,
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
  GitMerge,
  Radar,
  Radio,
  Brain,
  Award,
};

function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < breakpoint : false
  );

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const handler = (e) => setIsMobile(e.matches);
    mql.addEventListener('change', handler);
    setIsMobile(mql.matches);
    return () => mql.removeEventListener('change', handler);
  }, [breakpoint]);

  return isMobile;
}

export default function Sidebar() {
  const { sidebarCollapsed, toggleSidebar } = useSettingsStore();
  const isMobile = useIsMobile();
  const location = useLocation();

  // Auto-collapse on mobile when navigating
  useEffect(() => {
    if (isMobile && !sidebarCollapsed) {
      toggleSidebar();
    }
  }, [location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  // On mobile: collapsed = hidden, expanded = overlay
  const isHiddenOnMobile = isMobile && sidebarCollapsed;
  const isOverlayOnMobile = isMobile && !sidebarCollapsed;

  return (
    <>
      {/* Mobile backdrop */}
      {isOverlayOnMobile && (
        <div
          className="fixed inset-0 bg-black/50 z-40"
          onClick={toggleSidebar}
          aria-hidden="true"
        />
      )}
      <aside className={`
        ${isMobile ? 'fixed z-50' : ''}
        ${isMobile && sidebarCollapsed ? '-translate-x-full' : 'translate-x-0'}
        ${sidebarCollapsed && !isMobile ? 'w-16' : 'w-56'}
        h-full bg-bg-secondary border-r border-border
        flex flex-col shrink-0
        transition-all duration-200
      `}>
      {/* Logo / App Name */}
      <div className="h-16 px-4 flex items-center gap-3 border-b border-border">
        <div className="w-9 h-9 rounded-xl bg-accent-primary flex items-center justify-center shrink-0 shadow-sm shadow-accent-primary/30">
          <span className="text-bg-primary font-bold text-base">C</span>
        </div>
        {!sidebarCollapsed && (
          <div>
            <div className="text-base font-bold text-text-primary leading-tight tracking-tight">ClawOps</div>
            <div className="text-[10px] text-text-muted font-mono tracking-wider">CONSOLE v2</div>
          </div>
        )}
      </div>

      {/* Navigation Links — Grouped by Section */}
      <nav aria-label="Main navigation" className="flex-1 py-2 px-2 flex flex-col gap-0.5 overflow-y-auto">
        {NAV_SECTIONS.map((section, idx) => (
          <div key={section.label}>
            {/* Section divider (skip for first section) */}
            {idx > 0 && <div className="my-2 mx-2 border-t border-border/50" />}

            {/* Section label */}
            {!sidebarCollapsed && (
              <div className="px-3 pt-1 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted/60">
                {section.label}
              </div>
            )}
            {sidebarCollapsed && idx > 0 && (
              <div className="my-1" />
            )}

            {/* Section items */}
            {section.items.map((item) => {
              const Icon = iconMap[item.icon];
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  title={sidebarCollapsed ? item.label : undefined}
                >
                  {({ isActive }) => (
                    <span className={`
                      relative flex items-center gap-3 px-3 py-1.5 rounded-md
                      text-sm transition-colors duration-150
                      ${isActive
                        ? 'bg-accent-primary/10 text-accent-primary font-medium'
                        : 'text-text-secondary hover:text-text-primary hover:bg-bg-elevated'
                      }
                      ${sidebarCollapsed ? 'justify-center' : ''}
                    `}>
                      {isActive && (
                        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-accent-primary rounded-full" />
                      )}
                      {Icon && <Icon size={16} className="shrink-0" />}
                      {!sidebarCollapsed && <span>{item.label}</span>}
                    </span>
                  )}
                </NavLink>
              );
            })}
          </div>
        ))}
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
    </>
  );
}
