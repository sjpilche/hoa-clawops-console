/**
 * Engagement Queue Page
 *
 * Review and approve drafted responses to community posts
 * before they get posted to Facebook, Reddit, LinkedIn, etc.
 */

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

export default function EngagementQueue() {
  const [filters, setFilters] = useState({
    status: 'pending_review',
    platform: 'all',
    min_score: 70
  });

  const queryClient = useQueryClient();

  // Fetch queue items
  const { data: queueData, isLoading } = useQuery({
    queryKey: ['engagement-queue', filters],
    queryFn: async () => {
      const params = new URLSearchParams(filters);
      return api.get(`/lead-gen/queue?${params}`);
    },
    refetchInterval: 30000
  });

  // Fetch stats
  const { data: statsData } = useQuery({
    queryKey: ['engagement-queue-stats'],
    queryFn: async () => api.get('/lead-gen/queue/stats'),
    refetchInterval: 30000
  });

  // Approve mutation
  const approveMutation = useMutation({
    mutationFn: async (id) => api.post(`/lead-gen/queue/${id}/approve`),
    onSuccess: () => {
      queryClient.invalidateQueries(['engagement-queue']);
      queryClient.invalidateQueries(['engagement-queue-stats']);
    }
  });

  // Reject mutation
  const rejectMutation = useMutation({
    mutationFn: async (id) => api.post(`/lead-gen/queue/${id}/reject`),
    onSuccess: () => {
      queryClient.invalidateQueries(['engagement-queue']);
      queryClient.invalidateQueries(['engagement-queue-stats']);
    }
  });

  // Update draft mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, draft_response }) => api.put(`/lead-gen/queue/${id}`, { draft_response }),
    onSuccess: () => {
      queryClient.invalidateQueries(['engagement-queue']);
    }
  });

  const queue = queueData?.data || [];
  const stats = statsData?.data || {};

  return (
    <div className="h-full flex flex-col bg-bg-primary">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border bg-bg-secondary">
        <h1 className="text-xl font-semibold text-text-primary">Engagement Queue</h1>
        <p className="mt-1 text-sm text-text-muted">
          Review and approve drafted responses before posting
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatsCard title="Pending Review" value={stats.pending || 0} color="yellow" />
          <StatsCard title="Approved Today" value={stats.approved || 0} color="green" />
          <StatsCard title="Posted This Week" value={stats.posted || 0} color="blue" />
          <StatsCard title="Total" value={stats.total || 0} color="gray" />
        </div>

        {/* Filters */}
        <div className="bg-bg-secondary border border-border rounded-lg p-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Status</label>
              <select
                value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                className="w-full px-3 py-2 bg-bg-elevated border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:border-accent-primary"
              >
                <option value="pending_review">Pending Review</option>
                <option value="approved">Approved</option>
                <option value="posted">Posted</option>
                <option value="rejected">Rejected</option>
                <option value="all">All</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Platform</label>
              <select
                value={filters.platform}
                onChange={(e) => setFilters({ ...filters, platform: e.target.value })}
                className="w-full px-3 py-2 bg-bg-elevated border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:border-accent-primary"
              >
                <option value="all">All Platforms</option>
                <option value="facebook">Facebook</option>
                <option value="reddit">Reddit</option>
                <option value="linkedin">LinkedIn</option>
                <option value="biggerpockets">BiggerPockets</option>
                <option value="hoatalk">HOATalk</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Min Score</label>
              <select
                value={filters.min_score}
                onChange={(e) => setFilters({ ...filters, min_score: e.target.value })}
                className="w-full px-3 py-2 bg-bg-elevated border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:border-accent-primary"
              >
                <option value="0">All Scores</option>
                <option value="70">70+</option>
                <option value="80">80+</option>
                <option value="90">90+ (Hot Leads)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Queue Items */}
        <div className="space-y-4">
          {isLoading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-accent-primary"></div>
              <p className="mt-2 text-sm text-text-muted">Loading queue...</p>
            </div>
          ) : queue.length === 0 ? (
            <div className="text-center py-12 bg-bg-secondary border border-border rounded-lg">
              <p className="text-text-muted">No items in queue</p>
              <p className="mt-1 text-sm text-text-muted opacity-60">
                The HOA Networker agent will find opportunities and add them here
              </p>
            </div>
          ) : (
            queue.map((item) => (
              <QueueItem
                key={item.id}
                item={item}
                onApprove={() => approveMutation.mutate(item.id)}
                onReject={() => rejectMutation.mutate(item.id)}
                onUpdate={(draft_response) => updateMutation.mutate({ id: item.id, draft_response })}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function StatsCard({ title, value, color }) {
  const colors = {
    yellow: 'border-l-accent-warning text-accent-warning',
    green: 'border-l-accent-success text-accent-success',
    blue: 'border-l-accent-info text-accent-info',
    gray: 'border-l-text-muted text-text-muted',
  };

  return (
    <div className={`px-4 py-4 bg-bg-secondary border border-border border-l-4 rounded-lg ${colors[color]}`}>
      <div className="text-xs font-medium text-text-muted truncate mb-1">{title}</div>
      <div className="text-2xl font-bold text-text-primary">{value}</div>
    </div>
  );
}

function QueueItem({ item, onApprove, onReject, onUpdate }) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftResponse, setDraftResponse] = useState(item.draft_response);

  const scoreColor = item.relevance_score >= 90 ? 'text-red-600' :
                     item.relevance_score >= 80 ? 'text-orange-600' :
                     item.relevance_score >= 70 ? 'text-yellow-600' :
                     'text-gray-600';

  const scoreIcon = item.relevance_score >= 90 ? '🔥' :
                    item.relevance_score >= 80 ? '🟢' :
                    '🟡';

  const handleSaveEdit = () => {
    onUpdate(draftResponse);
    setIsEditing(false);
  };

  return (
    <div className="bg-bg-secondary border border-border rounded-lg p-5 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">{scoreIcon}</span>
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-sm font-semibold ${scoreColor}`}>
              Score: {item.relevance_score}
            </span>
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-accent-info/10 text-accent-info">
              {item.platform}
            </span>
            <span className="text-xs text-text-muted">
              {new Date(item.created_at).toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      {/* Original Post */}
      <div className="border-l-2 border-border pl-4">
        <h3 className="text-xs font-medium text-text-muted mb-1 uppercase tracking-wider">Original Post</h3>
        <p className="text-sm font-semibold text-text-primary mb-1">{item.post_title}</p>
        <p className="text-sm text-text-secondary line-clamp-3">{item.post_body}</p>
        {item.post_url && (
          <a
            href={item.post_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-accent-primary hover:underline mt-1 inline-block"
          >
            View original post →
          </a>
        )}
      </div>

      {/* Detected Signals */}
      {item.detected_signals && item.detected_signals.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-text-muted mb-2 uppercase tracking-wider">Detected Signals</h4>
          <div className="flex flex-wrap gap-1">
            {item.detected_signals.map((signal, idx) => (
              <span
                key={idx}
                className="px-2 py-0.5 rounded text-xs font-medium bg-accent-primary/10 text-accent-primary"
              >
                {signal}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Draft Response */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-medium text-text-muted uppercase tracking-wider">Draft Response</h4>
          {!isEditing && item.status === 'pending_review' && (
            <button
              onClick={() => setIsEditing(true)}
              className="text-xs text-accent-primary hover:underline"
            >
              Edit
            </button>
          )}
        </div>

        {isEditing ? (
          <div className="space-y-2">
            <textarea
              value={draftResponse}
              onChange={(e) => setDraftResponse(e.target.value)}
              rows={8}
              className="w-full px-3 py-2 bg-bg-elevated border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:border-accent-primary resize-none"
            />
            <div className="flex gap-2">
              <button
                onClick={handleSaveEdit}
                className="px-3 py-1.5 bg-accent-primary text-white text-sm rounded-lg hover:bg-opacity-90"
              >
                Save Changes
              </button>
              <button
                onClick={() => { setDraftResponse(item.draft_response); setIsEditing(false); }}
                className="px-3 py-1.5 bg-bg-elevated border border-border text-text-secondary text-sm rounded-lg hover:bg-bg-primary"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-bg-elevated border border-border rounded-lg p-4">
            <p className="text-sm text-text-secondary whitespace-pre-wrap">{item.draft_response}</p>
          </div>
        )}
      </div>

      {/* Actions */}
      {item.status === 'pending_review' && (
        <div className="flex gap-3 pt-3 border-t border-border">
          <button
            onClick={onApprove}
            className="flex-1 px-4 py-2 bg-accent-success/10 text-accent-success border border-accent-success/30 text-sm font-medium rounded-lg hover:bg-accent-success/20 transition-colors"
          >
            ✅ Approve & Post
          </button>
          <button
            onClick={onReject}
            className="flex-1 px-4 py-2 bg-accent-danger/10 text-accent-danger border border-accent-danger/30 text-sm font-medium rounded-lg hover:bg-accent-danger/20 transition-colors"
          >
            ❌ Reject
          </button>
        </div>
      )}

      {item.status === 'approved' && (
        <div className="bg-accent-success/10 border border-accent-success/30 rounded-lg p-3">
          <p className="text-sm text-accent-success">
            ✅ Approved — ready to post to {item.platform}
          </p>
        </div>
      )}

      {item.status === 'posted' && (
        <div className="bg-accent-info/10 border border-accent-info/30 rounded-lg p-3">
          <p className="text-sm text-accent-info">
            Posted on {new Date(item.posted_at).toLocaleString()}
          </p>
        </div>
      )}
    </div>
  );
}
