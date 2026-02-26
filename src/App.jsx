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

import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { getToken } from '@/lib/api';

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
import PipelinesPage from '@/pages/PipelinesPage';
import EngagementQueue from '@/pages/EngagementQueue';
import TradingPage from '@/pages/TradingPage';
import ContentQueuePage from '@/pages/ContentQueuePage';
import HOALeadsPage from '@/pages/HOALeadsPage';
import DiscoveryDashboard from '@/pages/DiscoveryDashboard';
import MgmtResearchPage from '@/pages/MgmtResearchPage';
import CfoMarketingPage from '@/pages/CfoMarketingPage';
import ChatPage from '@/pages/ChatPage';
import GlobalOverview from '@/pages/GlobalOverview';
import CampaignDashboard from '@/pages/CampaignDashboard';
import CampaignSettings from '@/pages/CampaignSettings';
import { CampaignLayout } from '@/layouts/CampaignLayout';

/**
 * Protected Route wrapper.
 * Redirects to /login if no token is present in localStorage.
 */
function ProtectedRoute({ children }) {
  const location = useLocation();
  if (!getToken()) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return children;
}

export default function App() {
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
        <Route path="/" element={<GlobalOverview />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/domains" element={<DomainsPage />} />
        <Route path="/chat" element={<ChatPage />} />
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
        <Route path="/pipelines" element={<PipelinesPage />} />
        <Route path="/trading" element={<TradingPage />} />
        <Route path="/content-queue" element={<ContentQueuePage />} />
        <Route path="/hoa-leads" element={<HOALeadsPage />} />
        <Route path="/discovery" element={<DiscoveryDashboard />} />
        <Route path="/mgmt-research" element={<MgmtResearchPage />} />
        <Route path="/jake-marketing" element={<CfoMarketingPage />} />
        <Route path="/cfo-marketing" element={<CfoMarketingPage />} />
        <Route path="/audit" element={<AuditLogPage />} />
        <Route path="/costs" element={<CostDashboardPage />} />
        <Route path="/help" element={<HelpPage />} />
        <Route path="/settings" element={<SettingsPage />} />

        {/* Campaign-specific routes */}
        <Route path="/c/:campaignSlug" element={<CampaignLayout />}>
          <Route index element={<CampaignDashboard />} />
          <Route path="settings" element={<CampaignSettings />} />
        </Route>
      </Route>

      {/* Catch-all — redirect unknown routes to dashboard */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
