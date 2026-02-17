/**
 * @file FacebookLeadsPage.jsx
 * @description Facebook Lead Ads monitoring dashboard - real-time lead capture and management.
 *
 * Features:
 * - Real-time lead monitoring from Lead Monitoring Agent
 * - Agent health and statistics
 * - Lead details and management
 * - Integration status
 */

import React, { useEffect, useState } from 'react';
import {
  Facebook,
  Users,
  TrendingUp,
  Mail,
  Phone,
  Building,
  Activity,
  RefreshCw,
  CheckCircle,
  XCircle,
  AlertCircle,
  ExternalLink,
  Database,
  Zap,
  Clock,
} from 'lucide-react';
import { api } from '@/lib/api';
import Button from '@/components/ui/Button';

export default function FacebookLeadsPage() {
  const [leads, setLeads] = useState([]);
  const [stats, setStats] = useState(null);
  const [health, setHealth] = useState(null);
  const [selectedLead, setSelectedLead] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    fetchData();

    // Auto-refresh every 30 seconds if enabled
    const interval = setInterval(() => {
      if (autoRefresh) {
        fetchData(true); // Silent refresh
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [autoRefresh]);

  const fetchData = async (silent = false) => {
    if (!silent) setIsLoading(true);

    try {
      const [leadsData, statsData, healthData] = await Promise.all([
        api.get('/lead-agent/leads/recent?limit=50'),
        api.get('/lead-agent/stats'),
        api.get('/lead-agent/health'),
      ]);

      setLeads(leadsData);
      setStats(statsData);
      setHealth(healthData);
      setLastRefresh(new Date());
    } catch (error) {
      console.error('[FacebookLeadsPage] Failed to fetch data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const getHealthColor = () => {
    if (!health) return 'text-text-muted';
    if (health.status === 'healthy') return 'text-accent-success';
    if (health.status === 'degraded') return 'text-accent-warning';
    return 'text-accent-danger';
  };

  const getHealthIcon = () => {
    if (!health) return AlertCircle;
    if (health.status === 'healthy') return CheckCircle;
    if (health.status === 'degraded') return AlertCircle;
    return XCircle;
  };

  const HealthIcon = getHealthIcon();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <Facebook className="mx-auto mb-3 text-text-muted animate-pulse" size={40} />
          <p className="text-sm text-text-muted">Loading Facebook leads...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-bg-primary">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border bg-bg-secondary">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-text-primary flex items-center gap-2">
              <Facebook size={24} className="text-blue-500" />
              Facebook Lead Ads Monitor
            </h1>
            <p className="text-sm text-text-muted mt-1 flex items-center gap-2">
              <HealthIcon size={14} className={getHealthColor()} />
              {health?.agent?.isRunning ? 'Agent operational' : 'Agent stopped'}
              {stats?.agent?.uptime && ` • Uptime: ${stats.agent.uptime}`}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Auto-refresh toggle */}
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                autoRefresh
                  ? 'bg-accent-success/10 text-accent-success border border-accent-success/20'
                  : 'bg-bg-elevated text-text-muted border border-border'
              }`}
            >
              <div className="flex items-center gap-2">
                <Zap size={14} />
                Auto-refresh {autoRefresh ? 'ON' : 'OFF'}
              </div>
            </button>

            {/* Manual refresh */}
            <Button
              size="sm"
              variant="secondary"
              onClick={() => fetchData()}
              disabled={isLoading}
            >
              <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-4">
          <div className="bg-bg-elevated rounded-lg border border-border p-3">
            <div className="flex items-center gap-2 mb-1">
              <Users size={14} className="text-accent-primary" />
              <span className="text-xs text-text-muted">Total Leads</span>
            </div>
            <div className="text-2xl font-bold text-text-primary">
              {stats?.stats?.total_leads || 0}
            </div>
          </div>

          <div className="bg-bg-elevated rounded-lg border border-border p-3">
            <div className="flex items-center gap-2 mb-1">
              <Zap size={14} className="text-accent-warning" />
              <span className="text-xs text-text-muted">Last 24h</span>
            </div>
            <div className="text-2xl font-bold text-text-primary">
              {stats?.stats?.leads_last_24h || 0}
            </div>
          </div>

          <div className="bg-bg-elevated rounded-lg border border-border p-3">
            <div className="flex items-center gap-2 mb-1">
              <Clock size={14} className="text-accent-info" />
              <span className="text-xs text-text-muted">Last Hour</span>
            </div>
            <div className="text-2xl font-bold text-text-primary">
              {stats?.stats?.leads_last_hour || 0}
            </div>
          </div>

          <div className="bg-bg-elevated rounded-lg border border-border p-3">
            <div className="flex items-center gap-2 mb-1">
              <Activity size={14} className="text-accent-success" />
              <span className="text-xs text-text-muted">Webhook</span>
            </div>
            <div className="text-2xl font-bold text-text-primary">
              {stats?.stats?.webhook_leads || 0}
            </div>
          </div>

          <div className="bg-bg-elevated rounded-lg border border-border p-3">
            <div className="flex items-center gap-2 mb-1">
              <Database size={14} className="text-accent-info" />
              <span className="text-xs text-text-muted">Polling</span>
            </div>
            <div className="text-2xl font-bold text-text-primary">
              {stats?.stats?.polling_leads || 0}
            </div>
          </div>
        </div>

        {/* Last refresh info */}
        <div className="text-xs text-text-muted mt-3 flex items-center gap-2">
          <Clock size={12} />
          Last refreshed: {formatDate(lastRefresh)}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

          {/* Leads List - Left 2/3 */}
          <div className="xl:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-text-primary">Recent Leads</h2>
              <span className="text-sm text-text-muted">{leads.length} total</span>
            </div>

            {leads.length === 0 ? (
              <div className="bg-bg-elevated rounded-lg border border-border p-12 text-center">
                <Users className="mx-auto mb-4 text-text-muted" size={48} />
                <h3 className="text-lg font-semibold text-text-primary mb-2">No leads yet</h3>
                <p className="text-sm text-text-muted mb-4">
                  Leads will appear here as they are submitted via Facebook Lead Ads
                </p>
                <p className="text-xs text-text-muted">
                  The agent is polling Facebook every 5 minutes
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {leads.map((lead) => (
                  <div
                    key={lead.facebook_lead_id}
                    className="bg-bg-elevated rounded-lg border border-border p-4 hover:border-accent-primary/30 transition-colors cursor-pointer"
                    onClick={() => setSelectedLead(lead)}
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <h3 className="font-semibold text-text-primary">
                          {lead.full_name || lead.email || 'Unknown Contact'}
                        </h3>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                            lead.source === 'webhook'
                              ? 'bg-accent-success/10 text-accent-success border border-accent-success/20'
                              : 'bg-accent-info/10 text-accent-info border border-accent-info/20'
                          }`}>
                            {lead.source || 'polling'}
                          </span>
                          <span className="text-xs text-text-muted">
                            {formatDate(lead.received_at || lead.created_at)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Contact Info */}
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      {lead.email && (
                        <div className="flex items-center gap-2 text-text-secondary">
                          <Mail size={14} className="text-text-muted" />
                          <span className="truncate">{lead.email}</span>
                        </div>
                      )}
                      {lead.phone && (
                        <div className="flex items-center gap-2 text-text-secondary">
                          <Phone size={14} className="text-text-muted" />
                          <span>{lead.phone}</span>
                        </div>
                      )}
                      {lead.hoa_name && (
                        <div className="flex items-center gap-2 text-text-secondary col-span-2">
                          <Building size={14} className="text-text-muted" />
                          <span className="truncate">{lead.hoa_name}</span>
                        </div>
                      )}
                    </div>

                    {/* Project Info */}
                    {(lead.project_type || lead.project_description) && (
                      <div className="mt-3 p-3 bg-bg-primary rounded border border-border">
                        {lead.project_type && (
                          <div className="text-xs text-accent-primary font-medium mb-1">
                            {lead.project_type}
                          </div>
                        )}
                        {lead.project_description && (
                          <div className="text-sm text-text-secondary line-clamp-2">
                            {lead.project_description}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right Sidebar - Details & Stats */}
          <div className="space-y-4">

            {/* Selected Lead Detail */}
            {selectedLead && (
              <div className="bg-bg-elevated rounded-lg border border-accent-primary p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-text-primary">Lead Details</h3>
                  <button
                    onClick={() => setSelectedLead(null)}
                    className="text-text-muted hover:text-text-primary"
                  >
                    <XCircle size={16} />
                  </button>
                </div>

                <div className="space-y-3 text-sm">
                  <div>
                    <div className="text-xs text-text-muted mb-1">Name</div>
                    <div className="text-text-primary font-medium">
                      {selectedLead.full_name || 'Not provided'}
                    </div>
                  </div>

                  {selectedLead.email && (
                    <div>
                      <div className="text-xs text-text-muted mb-1">Email</div>
                      <div className="text-text-primary font-mono text-xs">
                        {selectedLead.email}
                      </div>
                    </div>
                  )}

                  {selectedLead.phone && (
                    <div>
                      <div className="text-xs text-text-muted mb-1">Phone</div>
                      <div className="text-text-primary font-mono text-xs">
                        {selectedLead.phone}
                      </div>
                    </div>
                  )}

                  {selectedLead.hoa_name && (
                    <div>
                      <div className="text-xs text-text-muted mb-1">HOA Name</div>
                      <div className="text-text-primary">{selectedLead.hoa_name}</div>
                    </div>
                  )}

                  {selectedLead.project_type && (
                    <div>
                      <div className="text-xs text-text-muted mb-1">Project Type</div>
                      <div className="text-text-primary">{selectedLead.project_type}</div>
                    </div>
                  )}

                  {selectedLead.project_description && (
                    <div>
                      <div className="text-xs text-text-muted mb-1">Description</div>
                      <div className="text-text-secondary">{selectedLead.project_description}</div>
                    </div>
                  )}

                  {selectedLead.estimated_budget && (
                    <div>
                      <div className="text-xs text-text-muted mb-1">Budget</div>
                      <div className="text-text-primary font-semibold">
                        ${parseFloat(selectedLead.estimated_budget).toLocaleString()}
                      </div>
                    </div>
                  )}

                  {selectedLead.timeline && (
                    <div>
                      <div className="text-xs text-text-muted mb-1">Timeline</div>
                      <div className="text-text-primary">{selectedLead.timeline}</div>
                    </div>
                  )}

                  <div className="pt-3 border-t border-border">
                    <div className="text-xs text-text-muted mb-1">Lead ID</div>
                    <div className="text-text-muted font-mono text-xs break-all">
                      {selectedLead.facebook_lead_id}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-text-muted mb-1">Received</div>
                    <div className="text-text-secondary text-xs">
                      {new Date(selectedLead.received_at || selectedLead.created_at).toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Agent Status */}
            <div className="bg-bg-elevated rounded-lg border border-border p-4">
              <h3 className="font-semibold text-text-primary mb-3 flex items-center gap-2">
                <Activity size={16} className={getHealthColor()} />
                Agent Status
              </h3>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-text-muted">Version</span>
                  <span className="text-text-primary font-mono">
                    {stats?.agent?.version || 'Unknown'}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-text-muted">Running</span>
                  <span className={stats?.agent?.isRunning ? 'text-accent-success' : 'text-accent-danger'}>
                    {stats?.agent?.isRunning ? 'Yes' : 'No'}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-text-muted">Uptime</span>
                  <span className="text-text-primary">
                    {stats?.agent?.uptime || 'N/A'}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-text-muted">Queue Size</span>
                  <span className="text-text-primary">
                    {stats?.stats?.queueSize || 0}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-text-muted">Last Lead</span>
                  <span className="text-text-secondary text-xs">
                    {stats?.stats?.last_lead_at ? formatDate(stats.stats.last_lead_at) : 'None yet'}
                  </span>
                </div>
              </div>
            </div>

            {/* Ingestion Stats */}
            <div className="bg-bg-elevated rounded-lg border border-border p-4">
              <h3 className="font-semibold text-text-primary mb-3">Ingestion Stats</h3>

              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-text-muted">Webhook (Real-time)</span>
                    <span className="text-accent-success font-semibold">
                      {stats?.stats?.webhook_leads || 0}
                    </span>
                  </div>
                  <div className="w-full bg-bg-primary rounded-full h-2">
                    <div
                      className="bg-accent-success h-2 rounded-full transition-all"
                      style={{
                        width: `${((stats?.stats?.webhook_leads || 0) / (stats?.stats?.total_leads || 1)) * 100}%`
                      }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-text-muted">Polling (Fallback)</span>
                    <span className="text-accent-info font-semibold">
                      {stats?.stats?.polling_leads || 0}
                    </span>
                  </div>
                  <div className="w-full bg-bg-primary rounded-full h-2">
                    <div
                      className="bg-accent-info h-2 rounded-full transition-all"
                      style={{
                        width: `${((stats?.stats?.polling_leads || 0) / (stats?.stats?.total_leads || 1)) * 100}%`
                      }}
                    />
                  </div>
                </div>

                {stats?.stats?.duplicatesDetected > 0 && (
                  <div className="pt-2 border-t border-border text-xs text-text-muted">
                    {stats.stats.duplicatesDetected} duplicates prevented
                  </div>
                )}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-bg-elevated rounded-lg border border-border p-4">
              <h3 className="font-semibold text-text-primary mb-3">Quick Actions</h3>

              <div className="space-y-2">
                <Button
                  size="sm"
                  variant="secondary"
                  className="w-full justify-start"
                  onClick={() => window.open('/api/lead-agent/stats', '_blank')}
                >
                  <ExternalLink size={14} />
                  View Full Stats (JSON)
                </Button>

                <Button
                  size="sm"
                  variant="secondary"
                  className="w-full justify-start"
                  onClick={async () => {
                    try {
                      await api.post('/lead-agent/reconcile');
                      alert('Reconciliation started - leads will be backfilled');
                      fetchData();
                    } catch (error) {
                      alert('Failed to start reconciliation');
                    }
                  }}
                >
                  <RefreshCw size={14} />
                  Force Reconciliation
                </Button>

                <Button
                  size="sm"
                  variant="secondary"
                  className="w-full justify-start"
                  onClick={() => window.open('https://developers.facebook.com/tools/explorer/', '_blank')}
                >
                  <ExternalLink size={14} />
                  Facebook Graph Explorer
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
