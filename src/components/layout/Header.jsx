/**
 * @file Header.jsx
 * @description Top bar with: page title, agent status summary, kill switch, user menu.
 * The kill switch is ALWAYS in the top-right — never hidden, never moved.
 */

import React from 'react';
import { useLocation } from 'react-router-dom';
import { LogOut, User } from 'lucide-react';
import KillSwitch from './KillSwitch';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useAgentStore } from '@/stores/useAgentStore';
import { NAV_ITEMS } from '@/lib/constants';
import { CampaignSwitcher } from '../campaigns/CampaignSwitcher';

export default function Header() {
  const location = useLocation();
  const { user, logout } = useSettingsStore();
  const { activeAgentCount } = useAgentStore();

  // Determine current page title from navigation items
  const currentNav = NAV_ITEMS.find((item) => item.path === location.pathname);
  const pageTitle = currentNav?.label || 'ClawOps Console';

  return (
    <header className="
      h-14 px-6 flex items-center justify-between
      bg-bg-secondary border-b border-border
      shrink-0
    ">
      {/* Left: Campaign switcher + Page title + agent count */}
      <div className="flex items-center gap-4">
        <CampaignSwitcher />
        <div className="h-6 w-px bg-border" />
        <h1 className="text-lg font-semibold text-text-primary">{pageTitle}</h1>
        {activeAgentCount > 0 && (
          <span className="text-xs font-mono text-accent-success bg-accent-success/10 px-2 py-0.5 rounded-full">
            {activeAgentCount} agent{activeAgentCount !== 1 ? 's' : ''} running
          </span>
        )}
      </div>

      {/* Right: Kill switch + user */}
      <div className="flex items-center gap-4">
        <KillSwitch />

        <div className="flex items-center gap-2 pl-4 border-l border-border">
          <User size={16} className="text-text-muted" />
          <span className="text-sm text-text-secondary">{user?.name || 'Admin'}</span>
          <button
            onClick={logout}
            className="p-1.5 rounded-md text-text-muted hover:text-accent-danger hover:bg-bg-elevated transition-colors cursor-pointer"
            title="Log out"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </header>
  );
}
