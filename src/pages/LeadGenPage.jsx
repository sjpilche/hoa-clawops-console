/**
 * @file LeadGenPage.jsx
 * @description Lead Generation Networker dashboard - review and manage community engagement opportunities.
 *
 * Features:
 * - Engagement Queue - Pending opportunities for review/approval
 * - Community Performance - Track which communities are performing best
 * - Stats Overview - Metrics and analytics
 */

import React, { useEffect, useState } from 'react';
import {
  Users,
  MessageCircle,
  MousePointerClick,
  TrendingUp,
  CheckCircle,
  XCircle,
  Edit,
  Send,
  ExternalLink,
  AlertCircle,
} from 'lucide-react';
import { api } from '@/lib/api';
import Button from '@/components/ui/Button';

export default function LeadGenPage() {
  const [queue, setQueue] = useState([]);
  const [stats, setStats] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('pending_review');
  const [selectedOpportunity, setSelectedOpportunity] = useState(null);
  const [editedResponse, setEditedResponse] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    fetchData();
  }, [statusFilter]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [queueData, statsData] = await Promise.all([
        api.get(`/lead-gen/queue?status=${statusFilter}&limit=50`),
        api.get('/lead-gen/queue/stats'),
      ]);

      setQueue(queueData.data || []);
      setStats(statsData.data || {});
    } catch (error) {
      console.error('[LeadGenPage] Failed to fetch data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAction = async (opportunityId, action, customResponse = null, customNotes = null) => {
    try {
      if (action === 'approve') {
        await api.post(`/lead-gen/queue/${opportunityId}/approve`);
      } else if (action === 'reject') {
        await api.post(`/lead-gen/queue/${opportunityId}/reject`);
      } else if (action === 'edit' && customResponse) {
        await api.put(`/lead-gen/queue/${opportunityId}`, { draft_response: customResponse });
      }

      await fetchData();
      setSelectedOpportunity(null);
      setEditedResponse('');
      setNotes('');
    } catch (error) {
      console.error(`[LeadGenPage] Failed to ${action} opportunity:`, error);
    }
  };

  const handlePost = async (opportunityId) => {
    try {
      await api.post(`/lead-gen/queue/${opportunityId}/post`);
      await fetchData();
    } catch (error) {
      console.error('[LeadGenPage] Failed to post response:', error);
    }
  };

  const selectOpportunity = (opp) => {
    setSelectedOpportunity(opp);
    setEditedResponse(opp.draft_response);
    setNotes(opp.notes || '');
  };

  // Platform badge colors
  const platformColors = {
    reddit: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
    facebook: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
    linkedin: 'bg-blue-700/10 text-blue-700 border-blue-700/20',
    biggerpockets: 'bg-green-500/10 text-green-500 border-green-500/20',
    quora: 'bg-red-500/10 text-red-500 border-red-500/20',
    nextdoor: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  };

  const getPlatformColor = (platform) => {
    return platformColors[platform?.toLowerCase()] || 'bg-bg-elevated text-text-muted border-border';
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <Users className="mx-auto mb-3 text-text-muted animate-pulse" size={40} />
          <p className="text-sm text-text-muted">Loading engagement opportunities...</p>
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
              <Users size={24} className="text-accent-primary" />
              Lead Generation Networker
            </h1>
            <p className="text-sm text-text-muted mt-1">
              Community engagement opportunities • Be helpful, not salesy
            </p>
          </div>

          {/* Quick Stats */}
          <div className="flex gap-4">
            <div className="text-center px-4 py-2 bg-bg-elevated rounded-lg border border-border">
              <div className="text-2xl font-bold text-accent-warning">{stats?.pending_review || 0}</div>
              <div className="text-xs text-text-muted">Pending Review</div>
            </div>
            <div className="text-center px-4 py-2 bg-bg-elevated rounded-lg border border-border">
              <div className="text-2xl font-bold text-accent-success">{stats?.posted_today || 0}</div>
              <div className="text-xs text-text-muted">Posted Today</div>
            </div>
            <div className="text-center px-4 py-2 bg-bg-elevated rounded-lg border border-border">
              <div className="text-2xl font-bold text-accent-info">{stats?.total_clicks || 0}</div>
              <div className="text-xs text-text-muted">Total Clicks</div>
            </div>
          </div>
        </div>

        {/* Status Filter Tabs */}
        <div className="flex gap-2 mt-4">
          {['pending_review', 'approved', 'posted', 'rejected'].map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                statusFilter === status
                  ? 'bg-accent-primary text-bg-primary'
                  : 'bg-bg-elevated text-text-secondary hover:text-text-primary hover:bg-bg-elevated/80'
              }`}
            >
              {status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Engagement Queue - Left 2/3 */}
          <div className="lg:col-span-2 space-y-4">
            <h2 className="text-lg font-semibold text-text-primary mb-3">Engagement Queue</h2>

            {queue.length === 0 ? (
              <div className="bg-bg-elevated rounded-lg border border-border p-8 text-center">
                <AlertCircle className="mx-auto mb-3 text-text-muted" size={32} />
                <p className="text-text-muted">No {statusFilter.replace('_', ' ')} opportunities</p>
              </div>
            ) : (
              queue.map((opp) => (
                <div
                  key={opp.id}
                  className="bg-bg-elevated rounded-lg border border-border p-4 hover:border-accent-primary/30 transition-colors cursor-pointer"
                  onClick={() => selectOpportunity(opp)}
                >
                  {/* Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium border ${getPlatformColor(opp.platform)}`}>
                          {opp.platform}
                        </span>
                        {opp.community && (
                          <span className="text-xs text-text-muted">in {opp.community}</span>
                        )}
                        {opp.relevance_score && (
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                            opp.relevance_score >= 80 ? 'bg-accent-success/10 text-accent-success' :
                            opp.relevance_score >= 60 ? 'bg-accent-warning/10 text-accent-warning' :
                            'bg-text-muted/10 text-text-muted'
                          }`}>
                            {opp.relevance_score}% match
                          </span>
                        )}
                      </div>
                      <h3 className="font-medium text-text-primary">{opp.post_title || 'Untitled Post'}</h3>
                      {opp.post_summary && (
                        <p className="text-sm text-text-muted mt-1 line-clamp-2">{opp.post_summary}</p>
                      )}
                    </div>
                    <a
                      href={opp.post_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent-primary hover:text-accent-primary/80"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ExternalLink size={16} />
                    </a>
                  </div>

                  {/* Draft Response Preview */}
                  <div className="bg-bg-primary rounded p-3 text-sm text-text-secondary border border-border">
                    <div className="line-clamp-3">{opp.draft_response}</div>
                  </div>

                  {/* Metadata */}
                  <div className="flex items-center justify-between mt-3 text-xs text-text-muted">
                    <div className="flex items-center gap-3">
                      {opp.post_author && <span>by {opp.post_author}</span>}
                      {opp.post_age_hours && <span>{opp.post_age_hours}h ago</span>}
                      {opp.recommended_template && <span>Template: {opp.recommended_template}</span>}
                    </div>
                    {opp.includes_link && (
                      <span className="text-accent-info">Includes link</span>
                    )}
                  </div>

                  {/* Quick Actions */}
                  {statusFilter === 'pending_review' && (
                    <div className="flex gap-2 mt-3">
                      <Button
                        size="sm"
                        variant="success"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAction(opp.id, 'approve');
                        }}
                      >
                        <CheckCircle size={14} />
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={(e) => {
                          e.stopPropagation();
                          selectOpportunity(opp);
                        }}
                      >
                        <Edit size={14} />
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAction(opp.id, 'reject');
                        }}
                      >
                        <XCircle size={14} />
                        Reject
                      </Button>
                    </div>
                  )}

                  {statusFilter === 'approved' && (
                    <div className="mt-3">
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePost(opp.id);
                        }}
                      >
                        <Send size={14} />
                        Post Now
                      </Button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Right Sidebar - Communities & Detail */}
          <div className="space-y-6">

            {/* Tracked Communities List */}
            <div className="bg-bg-elevated rounded-lg border border-border p-4">
              <h3 className="font-semibold text-text-primary mb-3 flex items-center gap-2">
                <Users size={16} className="text-accent-primary" />
                Tracked Communities
              </h3>

              <div className="space-y-2 max-h-64 overflow-y-auto">
                {communities.length === 0 ? (
                  <p className="text-sm text-text-muted text-center py-4">No communities tracked yet</p>
                ) : (
                  communities.slice(0, 10).map((comm) => (
                    <div key={comm.id} className="flex items-start justify-between py-2 border-b border-border last:border-0">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-text-primary truncate">{comm.community_name}</div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`px-1.5 py-0.5 rounded text-xs ${getPlatformColor(comm.platform)}`}>
                            {comm.platform}
                          </span>
                          <span className={`px-1.5 py-0.5 rounded text-xs ${
                            comm.our_status === 'established' ? 'bg-accent-success/10 text-accent-success' :
                            comm.our_status === 'active' ? 'bg-accent-info/10 text-accent-info' :
                            comm.our_status === 'lurking' ? 'bg-accent-warning/10 text-accent-warning' :
                            'bg-text-muted/10 text-text-muted'
                          }`}>
                            {comm.our_status}
                          </span>
                        </div>
                      </div>
                      <div className="text-right ml-2">
                        <div className="text-xs font-semibold text-accent-primary">{comm.posts_made || 0}</div>
                        <div className="text-xs text-text-muted">posts</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Selected Opportunity Detail */}
            {selectedOpportunity && (
              <div className="bg-bg-elevated rounded-lg border border-border p-4">
                <h3 className="font-semibold text-text-primary mb-3">Edit Response</h3>

                <textarea
                  value={editedResponse}
                  onChange={(e) => setEditedResponse(e.target.value)}
                  className="w-full h-48 px-3 py-2 bg-bg-primary border border-border rounded-md text-sm text-text-primary font-mono resize-none focus:outline-none focus:border-accent-primary"
                  placeholder="Your response..."
                />

                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full mt-3 px-3 py-2 bg-bg-primary border border-border rounded-md text-sm text-text-primary focus:outline-none focus:border-accent-primary"
                  placeholder="Notes (optional)"
                />

                <div className="flex gap-2 mt-3">
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => handleAction(selectedOpportunity.id, 'edit', editedResponse, notes)}
                  >
                    Save Changes
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setSelectedOpportunity(null)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {/* Top Communities */}
            <div className="bg-bg-elevated rounded-lg border border-border p-4">
              <h3 className="font-semibold text-text-primary mb-3 flex items-center gap-2">
                <TrendingUp size={16} className="text-accent-success" />
                Top Communities
              </h3>

              <div className="space-y-3">
                {(stats?.top_communities || []).slice(0, 5).map((comm, idx) => (
                  <div key={idx} className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="text-sm font-medium text-text-primary">{comm.community}</div>
                      <div className="text-xs text-text-muted">{comm.platform}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold text-accent-primary">{comm.clicks || 0}</div>
                      <div className="text-xs text-text-muted">clicks</div>
                    </div>
                  </div>
                ))}

                {(!stats?.top_communities || stats.top_communities.length === 0) && (
                  <p className="text-sm text-text-muted text-center py-4">No data yet</p>
                )}
              </div>
            </div>

            {/* Platform Stats */}
            <div className="bg-bg-elevated rounded-lg border border-border p-4">
              <h3 className="font-semibold text-text-primary mb-3">Platform Performance</h3>

              <div className="space-y-2">
                {(stats?.platform_stats || []).map((platform, idx) => (
                  <div key={idx} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                    <div className={`px-2 py-1 rounded text-xs font-medium border ${getPlatformColor(platform.platform)}`}>
                      {platform.platform}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-text-muted">
                      <span className="flex items-center gap-1">
                        <MessageCircle size={12} />
                        {platform.posts || 0}
                      </span>
                      <span className="flex items-center gap-1">
                        <MousePointerClick size={12} />
                        {platform.total_clicks || 0}
                      </span>
                    </div>
                  </div>
                ))}

                {(!stats?.platform_stats || stats.platform_stats.length === 0) && (
                  <p className="text-sm text-text-muted text-center py-4">No data yet</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
