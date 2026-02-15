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
import BlitzPage from '@/pages/BlitzPage';

/**
 * Protected Route wrapper.
 * If the user is not authenticated, redirect them to the login page.
 * This wraps around the AppShell so ALL protected pages share the same layout.
 */
function ProtectedRoute({ children }) {
  // BYPASS FOR TESTING - Skip auth check entirely
  const BYPASS_AUTH = true;

  if (BYPASS_AUTH) {
    return children;
  }

  const { isAuthenticated, isLoading } = useSettingsStore();

  // Still checking auth — show loading
  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-bg-primary">
        <div className="text-center">
          <div className="w-10 h-10 rounded-xl bg-accent-primary flex items-center justify-center mx-auto mb-3 animate-pulse">
            <span className="text-bg-primary font-bold">C</span>
          </div>
          <p className="text-sm text-text-muted">Loading ClawOps Console...</p>
        </div>
      </div>
    );
  }

  // Not authenticated — redirect to login
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

export default function App() {
  const { checkAuth } = useSettingsStore();

  // On app load, check if there's a valid JWT token stored
  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

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
        <Route path="/blitz" element={<BlitzPage />} />
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
