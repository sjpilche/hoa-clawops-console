/**
 * @file App.jsx
 * @description Root application component.
 *
 * RESPONSIBILITIES:
 * 1. Check authentication on app load
 * 2. Define all routes
 * 3. Protect routes that require login
 * 4. Show loading state while checking auth
 *
 * ROUTE STRUCTURE:
 *   /login      → LoginPage (public)
 *   /           → DashboardPage (protected)
 *   /domains    → DomainsPage (protected)
 *   /agents     → AgentsPage (protected)
 *   /hierarchy  → HierarchyPage (protected)
 *   /extensions → ExtensionsPage (protected)
 *   /tools      → ToolsPage (protected)
 *   /monitor    → MonitorPage (protected)
 *   /results    → ResultsPage (protected)
 *   /settings   → SettingsPage (protected)
 */

import React, { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useSettingsStore } from '@/stores/useSettingsStore';

// Layout
import AppShell from '@/components/layout/AppShell';

// Pages
import LoginPage from '@/pages/LoginPage';
import DashboardPage from '@/pages/DashboardPage';
import AgentsPage from '@/pages/AgentsPage';
import AgentDetailPage from '@/pages/AgentDetailPage';
import AgentBuilderPage from '@/pages/AgentBuilderPage';
import SchedulePage from '@/pages/SchedulePage';
import MonitorPage from '@/pages/MonitorPage';
import ResultsPage from '@/pages/ResultsPage';
import SettingsPage from '@/pages/SettingsPage';
import DomainsPage from '@/pages/DomainsPage';
import ExtensionsPage from '@/pages/ExtensionsPage';
import ToolsPage from '@/pages/ToolsPage';
import HierarchyPage from '@/pages/HierarchyPage';
import AuditLogPage from '@/pages/AuditLogPage';
import CostDashboardPage from '@/pages/CostDashboardPage';
import HelpPage from '@/pages/HelpPage';
import LeadGenPage from '@/pages/LeadGenPage';
import FacebookLeadsPage from '@/pages/FacebookLeadsPage';
import BlitzPage from '@/pages/BlitzPage';
import EngagementQueue from '@/pages/EngagementQueue';
import TradingPage from '@/pages/TradingPage';
import ContentQueuePage from '@/pages/ContentQueuePage';
import HOALeadsPage from '@/pages/HOALeadsPage';

/**
 * Protected Route wrapper.
 * AUTHENTICATION DISABLED FOR DEVELOPMENT - Just render children
 */
function ProtectedRoute({ children }) {
  // Skip all auth checks - just render the app
  return children;
}

export default function App() {
  // Authentication disabled for development - no checks needed

  return (
    <Routes>
      {/* Public route — login page */}
      <Route path="/login" element={<LoginPage />} />

      {/* Protected routes — all wrapped in AppShell layout */}
      <Route
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<DashboardPage />} />
        <Route path="/domains" element={<DomainsPage />} />
        <Route path="/agents" element={<AgentsPage />} />
        <Route path="/agents/new" element={<AgentBuilderPage />} />
        <Route path="/agents/:id" element={<AgentDetailPage />} />
        <Route path="/agents/:id/edit" element={<AgentBuilderPage />} />
        <Route path="/hierarchy" element={<HierarchyPage />} />
        <Route path="/extensions" element={<ExtensionsPage />} />
        <Route path="/tools" element={<ToolsPage />} />
        <Route path="/schedule" element={<SchedulePage />} />
        <Route path="/monitor" element={<MonitorPage />} />
        <Route path="/results" element={<ResultsPage />} />
        <Route path="/lead-gen" element={<LeadGenPage />} />
        <Route path="/facebook-leads" element={<FacebookLeadsPage />} />
        <Route path="/engagement-queue" element={<EngagementQueue />} />
        <Route path="/blitz" element={<BlitzPage />} />
        <Route path="/trading" element={<TradingPage />} />
        <Route path="/content-queue" element={<ContentQueuePage />} />
        <Route path="/hoa-leads" element={<HOALeadsPage />} />
        <Route path="/audit" element={<AuditLogPage />} />
        <Route path="/costs" element={<CostDashboardPage />} />
        <Route path="/help" element={<HelpPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>

      {/* Catch-all — redirect unknown routes to dashboard */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
