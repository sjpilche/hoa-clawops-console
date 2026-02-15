/**
 * @file AppShell.jsx
 * @description Main application layout shell.
 *
 * LAYOUT:
 * ┌──────────────────────────────────────┐
 * │ Sidebar │        Header              │
 * │         │────────────────────────────│
 * │  Nav    │                            │
 * │  items  │       Main Content         │
 * │         │       (Outlet)             │
 * │         │                            │
 * └──────────────────────────────────────┘
 *
 * The Outlet renders the current page based on React Router.
 */

import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';

export default function AppShell() {
  return (
    <div className="h-screen flex overflow-hidden bg-bg-primary">
      {/* Sidebar — fixed left, full height */}
      <Sidebar />

      {/* Main area — header + content */}
      <div className="flex-1 flex flex-col min-w-0">
        <Header />

        {/* Content area — scrollable, receives the routed page */}
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
