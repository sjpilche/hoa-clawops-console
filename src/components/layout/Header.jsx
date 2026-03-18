/**
 * @file Header.jsx
 * @description Top bar with: page title, agent status summary, kill switch, user menu.
 * The kill switch is ALWAYS in the top-right — never hidden, never moved.
 */

import React from 'react';
import { useLocation } from 'react-router-dom';
import { LogOut, User, ChevronDown } from 'lucide-react';
import KillSwitch from './KillSwitch';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useAgentStore } from '@/stores/useAgentStore';
import { useWorkspace } from '@/context/WorkspaceContext';
import { NAV_ITEMS } from '@/lib/constants';

export default function Header() {
  const location = useLocation();
  const { user, logout } = useSettingsStore();
  const { activeAgentCount } = useAgentStore();
  const { activeWorkspaceSlug, workspaces, switchWorkspace } = useWorkspace();

  const currentNav = NAV_ITEMS.find((item) => item.path === location.pathname);
  const pageTitle = currentNav?.label || 'ClawOps Console';

  return (
    <header className="h-16 px-8 flex items-center justify-between bg-bg-secondary border-b border-border shrink-0">
      {/* Left: Page title + workspace switcher + agent count */}
      <div className="flex items-center gap-5">
        <h1 className="text-lg font-semibold text-text-primary tracking-tight">{pageTitle}</h1>

        {/* Workspace Switcher */}
        <div className="relative border-l border-border/50 pl-5">
          <select
            value={activeWorkspaceSlug || ''}
            onChange={(e) => switchWorkspace(e.target.value || null)}
            className="appearance-none bg-bg-elevated border border-border rounded-lg px-3 py-1.5 pr-8 text-sm text-text-primary cursor-pointer hover:border-accent-primary/40 focus:outline-none focus:border-accent-primary focus:ring-1 focus:ring-accent-primary/20 transition-all"
          >
            <option value="">All Workspaces</option>
            {workspaces.map(ws => (
              <option key={ws.slug} value={ws.slug}>
                {ws.name}{ws.status === 'frozen' ? ' (frozen)' : ''}
              </option>
            ))}
          </select>
          <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
        </div>

        {activeAgentCount > 0 && (
          <span className="text-xs font-mono text-accent-success bg-accent-success/10 px-2.5 py-1 rounded-full border border-accent-success/20">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent-success mr-1.5 animate-pulse" />
            {activeAgentCount} agent{activeAgentCount !== 1 ? 's' : ''} running
          </span>
        )}
      </div>

      {/* Right: Kill switch + user */}
      <div className="flex items-center gap-5">
        <KillSwitch />

        <div className="flex items-center gap-3 pl-5 border-l border-border/50">
          <div className="w-7 h-7 rounded-full bg-accent-primary/10 flex items-center justify-center">
            <User size={14} className="text-accent-primary" />
          </div>
          <span className="text-sm text-text-secondary font-medium">{user?.name || 'Admin'}</span>
          <button
            onClick={logout}
            className="p-1.5 rounded-lg text-text-muted hover:text-accent-danger hover:bg-accent-danger/10 transition-all cursor-pointer"
            title="Log out"
          >
            <LogOut size={14} />
          </button>
        </div>
      </div>
    </header>
  );
}
