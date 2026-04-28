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

/**
 * Error Boundary — catches any React render crash and shows a fallback
 * instead of killing the entire UI.
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary] Uncaught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '2rem', fontFamily: 'monospace', maxWidth: '600px', margin: '4rem auto' }}>
          <h1 style={{ color: '#ef4444', fontSize: '1.5rem' }}>Something went wrong</h1>
          <pre style={{ background: '#1e1e1e', color: '#f5f5f5', padding: '1rem', borderRadius: '8px', overflow: 'auto', marginTop: '1rem', fontSize: '0.85rem' }}>
            {this.state.error?.message || 'Unknown error'}
          </pre>
          <button
            onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload(); }}
            style={{ marginTop: '1rem', padding: '0.5rem 1rem', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
          >
            Reload Page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

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
import CommandCenterPage from '@/pages/CommandCenterPage';
import WarRoomPage from '@/pages/WarRoomPage';
import CampaignDashboard from '@/pages/CampaignDashboard';
import CampaignSettings from '@/pages/CampaignSettings';
import { CampaignLayout } from '@/layouts/CampaignLayout';
import PipelineHealthPage from '@/pages/PipelineHealthPage';
import LivempaintPage from '@/pages/LivempaintPage';
import MissionControlPage from '@/pages/MissionControlPage';
import OpportunityEnginePage from '@/pages/OpportunityEnginePage';
import RSEEnginePage from '@/pages/RSEEnginePage';
import AgentDirectoryPage from '@/pages/AgentDirectoryPage';
import RevenueDashboard from '@/pages/RevenueDashboard';
import BrainPage from '@/pages/BrainPage';
import DreamTeamPage from '@/pages/DreamTeamPage';

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
    <ErrorBoundary>
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
        <Route path="/" element={<WarRoomPage />} />
        <Route path="/command-center" element={<CommandCenterPage />} />
        <Route path="/legacy-dashboard" element={<GlobalOverview />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/domains" element={<DomainsPage />} />
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/agents" element={<AgentsPage />} />
        <Route path="/agents/new" element={<AgentBuilderPage />} />
        <Route path="/agents/:id" element={<AgentDetailPage />} />
        <Route path="/agents/:id/edit" element={<AgentBuilderPage />} />
        <Route path="/hierarchy" element={<HierarchyPage />} />
        <Route path="/directory" element={<AgentDirectoryPage />} />
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
        <Route path="/owen-marketing" element={<CfoMarketingPage defaultSource="owen" />} />
        <Route path="/data-rehab" element={<CfoMarketingPage defaultSource="data-rehab" />} />
        <Route path="/pipeline-health" element={<PipelineHealthPage />} />
        <Route path="/livempaint" element={<LivempaintPage />} />
        <Route path="/mission-control" element={<MissionControlPage />} />
        <Route path="/opportunities" element={<OpportunityEnginePage />} />
        <Route path="/rse" element={<RSEEnginePage />} />
        <Route path="/revenue" element={<RevenueDashboard />} />
        <Route path="/brain" element={<BrainPage />} />
        <Route path="/dream-team" element={<DreamTeamPage />} />
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
    </ErrorBoundary>
  );
}
