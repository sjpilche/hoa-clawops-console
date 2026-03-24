/**
 * @file Tabs.jsx
 * @description Tab switcher component. Replaces manual activeTab + button patterns across pages.
 */

import { useRef } from 'react';

export default function Tabs({
  tabs = [],
  activeTab,
  onChange,
  className = '',
}) {
  const tabListRef = useRef(null);

  const handleKeyDown = (e) => {
    const currentIndex = tabs.findIndex(t => t.key === activeTab);
    let nextIndex;

    if (e.key === 'ArrowRight') {
      nextIndex = (currentIndex + 1) % tabs.length;
    } else if (e.key === 'ArrowLeft') {
      nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    } else if (e.key === 'Home') {
      nextIndex = 0;
    } else if (e.key === 'End') {
      nextIndex = tabs.length - 1;
    } else {
      return;
    }

    e.preventDefault();
    onChange(tabs[nextIndex].key);
    tabListRef.current?.querySelectorAll('[role="tab"]')[nextIndex]?.focus();
  };

  return (
    <div
      ref={tabListRef}
      role="tablist"
      className={`flex gap-1 bg-bg-secondary border border-border rounded-lg p-1 ${className}`}
      onKeyDown={handleKeyDown}
    >
      {tabs.map(tab => {
        const isActive = tab.key === activeTab;
        const Icon = tab.icon;
        return (
          <button
            key={tab.key}
            role="tab"
            id={`tab-${tab.key}`}
            aria-selected={isActive}
            aria-controls={`tabpanel-${tab.key}`}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(tab.key)}
            className={`
              flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium
              transition-colors cursor-pointer
              ${isActive
                ? 'bg-bg-elevated text-text-primary shadow-sm'
                : 'text-text-muted hover:text-text-secondary'
              }
            `}
          >
            {Icon && <Icon size={14} aria-hidden="true" />}
            {tab.label}
            {tab.count != null && (
              <span className={`text-xs ml-0.5 ${isActive ? 'text-accent-primary' : 'text-text-muted'}`}>
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
