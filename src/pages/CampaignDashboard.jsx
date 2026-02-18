/**
 * @file CampaignDashboard.jsx
 * @description Campaign-specific dashboard showing KPIs, agent status, and activity.
 */

import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Users, Mail, TrendingUp, MessageCircle, Activity, AlertCircle, CheckCircle, XCircle, Clock, Plus } from 'lucide-react';
import { useCampaign } from '../context/CampaignContext';
import { api } from '../lib/api';
import { AgentAssigner } from '../components/agents/AgentAssigner';

export default function CampaignDashboard() {
  const { campaignSlug } = useParams();
  const { activeCampaign, activeCampaignId } = useCampaign();
  const [agents, setAgents] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [activity, setActivity] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAssignerOpen, setIsAssignerOpen] = useState(false);

  useEffect(() => {
    if (!activeCampaignId) return;

    const fetchData = async () => {
      try {
        setIsLoading(true);

        // Fetch campaign agents
        const agentsData = await api.get(`/campaigns/${activeCampaignId}/agents`);
        setAgents(agentsData);

        // Fetch metrics (last 7 days)
        const metricsData = await api.get(`/campaigns/${activeCampaignId}/metrics?days=7`);
        setMetrics(metricsData);

        // Fetch recent activity
        const activityData = await api.get(`/campaigns/${activeCampaignId}/activity?limit=10`);
        setActivity(activityData);
      } catch (error) {
        console.error('Failed to fetch campaign data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [activeCampaignId]);

  const handleAgentsAssigned = () => {
    // Refresh agents list
    if (!activeCampaignId) return;
    api.get(`/campaigns/${activeCampaignId}/agents`)
      .then(setAgents)
      .catch(err => console.error('Failed to refresh agents:', err));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full p-12">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-accent-primary border-r-transparent mb-4"></div>
          <p className="text-text-muted">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (!activeCampaign) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <AlertCircle className="w-12 h-12 text-accent-danger mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-text-primary mb-2">Campaign Not Found</h3>
          <p className="text-text-muted mb-4">The campaign you're looking for doesn't exist.</p>
          <Link to="/" className="text-accent-primary hover:underline">
            Return to overview
          </Link>
        </div>
      </div>
    );
  }

  // Calculate totals from metrics
  const totalLeads = metrics?.reduce((sum, m) => sum + (m.leads_generated || 0), 0) || 0;
  const totalEmails = metrics?.reduce((sum, m) => sum + (m.emails_sent || 0), 0) || 0;
  const totalReplies = metrics?.reduce((sum, m) => sum + (m.replies_received || 0), 0) || 0;
  const totalAgentRuns = metrics?.reduce((sum, m) => sum + (m.agent_runs || 0), 0) || 0;

  // Agent status counts
  const runningAgents = agents.filter((a) => a.status === 'running').length;
  const errorAgents = agents.filter((a) => a.status === 'error').length;
  const idleAgents = agents.filter((a) => a.status === 'idle').length;

  // Get status icon
  const getStatusIcon = (status) => {
    switch (status) {
      case 'running':
        return <Activity className="w-4 h-4 text-accent-success animate-pulse" />;
      case 'error':
        return <XCircle className="w-4 h-4 text-accent-danger" />;
      case 'disabled':
        return <XCircle className="w-4 h-4 text-text-muted" />;
      default:
        return <Clock className="w-4 h-4 text-text-muted" />;
    }
  };

  // Get severity icon
  const getSeverityIcon = (severity) => {
    switch (severity) {
      case 'success':
        return <CheckCircle className="w-4 h-4 text-accent-success" />;
      case 'error':
        return <XCircle className="w-4 h-4 text-accent-danger" />;
      case 'warning':
        return <AlertCircle className="w-4 h-4 text-accent-warning" />;
      default:
        return <Activity className="w-4 h-4 text-accent-info" />;
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Campaign Header */}
      <div className="flex items-center gap-4 mb-8">
        <span className="text-4xl" role="img" aria-label={activeCampaign.name}>
          {activeCampaign.icon}
        </span>
        <div className="flex-1">
          <h1 className="text-3xl font-bold text-text-primary mb-1">
            {activeCampaign.name}
          </h1>
          <p className="text-text-muted">{activeCampaign.company}</p>
        </div>
        <Link
          to={`/c/${campaignSlug}/settings`}
          className="px-4 py-2 bg-bg-secondary hover:bg-bg-elevated rounded-lg transition-colors text-sm font-medium"
        >
          Settings
        </Link>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="p-6 bg-bg-secondary rounded-lg border-l-4 hover:bg-bg-elevated transition-colors"
          style={{ borderColor: activeCampaign.color }}>
          <div className="flex items-center gap-3 mb-2">
            <TrendingUp className="w-5 h-5 text-text-muted" />
            <span className="text-sm font-medium text-text-muted">Leads Generated</span>
          </div>
          <div className="text-3xl font-bold text-text-primary">{totalLeads}</div>
          <div className="text-xs text-text-muted mt-1">Last 7 days</div>
        </div>

        <div className="p-6 bg-bg-secondary rounded-lg border-l-4 border-accent-info hover:bg-bg-elevated transition-colors">
          <div className="flex items-center gap-3 mb-2">
            <Mail className="w-5 h-5 text-text-muted" />
            <span className="text-sm font-medium text-text-muted">Emails Sent</span>
          </div>
          <div className="text-3xl font-bold text-text-primary">{totalEmails}</div>
          <div className="text-xs text-text-muted mt-1">Last 7 days</div>
        </div>

        <div className="p-6 bg-bg-secondary rounded-lg border-l-4 border-accent-success hover:bg-bg-elevated transition-colors">
          <div className="flex items-center gap-3 mb-2">
            <Users className="w-5 h-5 text-text-muted" />
            <span className="text-sm font-medium text-text-muted">Active Agents</span>
          </div>
          <div className="text-3xl font-bold text-text-primary">{agents.length}</div>
          <div className="text-xs text-text-muted mt-1">
            {runningAgents} running{errorAgents > 0 && `, ${errorAgents} errors`}
          </div>
        </div>

        <div className="p-6 bg-bg-secondary rounded-lg border-l-4 border-accent-warning hover:bg-bg-elevated transition-colors">
          <div className="flex items-center gap-3 mb-2">
            <MessageCircle className="w-5 h-5 text-text-muted" />
            <span className="text-sm font-medium text-text-muted">Replies</span>
          </div>
          <div className="text-3xl font-bold text-text-primary">{totalReplies}</div>
          <div className="text-xs text-text-muted mt-1">Last 7 days</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Agent Status */}
        <div className="bg-bg-secondary rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-text-primary">Agent Status</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsAssignerOpen(true)}
                className="flex items-center gap-1 px-3 py-1.5 bg-accent-primary text-white rounded text-xs font-medium hover:bg-opacity-90 transition-all"
              >
                <Plus className="w-3 h-3" />
                Assign Agents
              </button>
              <Link
                to="/agents"
                className="text-sm text-accent-primary hover:underline"
              >
                View all
              </Link>
            </div>
          </div>

          {agents.length === 0 ? (
            <div className="text-center py-8">
              <Users className="w-12 h-12 text-text-muted mx-auto mb-3 opacity-50" />
              <p className="text-text-muted mb-4">No agents assigned to this campaign</p>
              <button
                onClick={() => setIsAssignerOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-accent-primary text-white rounded-lg hover:bg-opacity-90 transition-all text-sm font-medium"
              >
                <Plus className="w-4 h-4" />
                Assign First Agent
              </button>
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {agents.map((agent) => (
                <div
                  key={agent.id}
                  className="flex items-center justify-between p-3 bg-bg-primary rounded hover:bg-bg-elevated transition-colors"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {getStatusIcon(agent.status)}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{agent.agent_name}</div>
                      <div className="text-xs text-text-muted">
                        {agent.run_count || 0} runs
                        {agent.error_count > 0 && ` · ${agent.error_count} errors`}
                      </div>
                    </div>
                  </div>
                  <div className="text-xs text-text-muted whitespace-nowrap ml-2">
                    {agent.last_run_at
                      ? new Date(agent.last_run_at).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : 'Never'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Activity */}
        <div className="bg-bg-secondary rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-text-primary">Recent Activity</h2>
            <Link
              to={`/c/${campaignSlug}/activity`}
              className="text-sm text-accent-primary hover:underline"
            >
              View all
            </Link>
          </div>

          {activity.length === 0 ? (
            <div className="text-center py-8">
              <Activity className="w-12 h-12 text-text-muted mx-auto mb-3 opacity-50" />
              <p className="text-text-muted">No activity yet</p>
              <p className="text-xs text-text-muted mt-1">
                Activity will appear here when agents start running
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {activity.map((event) => (
                <div
                  key={event.id}
                  className="flex items-start gap-3 p-3 bg-bg-primary rounded"
                >
                  {getSeverityIcon(event.severity)}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{event.title}</div>
                    {event.detail && (
                      <div className="text-xs text-text-muted mt-1">{event.detail}</div>
                    )}
                    <div className="text-xs text-text-muted mt-1">
                      {new Date(event.created_at).toLocaleString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Agent Assigner Modal */}
      <AgentAssigner
        campaignId={activeCampaignId}
        isOpen={isAssignerOpen}
        onClose={() => setIsAssignerOpen(false)}
        onAssigned={handleAgentsAssigned}
      />
    </div>
  );
}
