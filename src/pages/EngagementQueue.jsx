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
      const response = await api.get(`/lead-gen/queue?${params}`);
      return response.data;
    },
    refetchInterval: 30000 // Refresh every 30 seconds
  });

  // Fetch stats
  const { data: statsData } = useQuery({
    queryKey: ['engagement-queue-stats'],
    queryFn: async () => {
      const response = await api.get('/lead-gen/queue/stats');
      return response.data;
    },
    refetchInterval: 30000
  });

  // Approve mutation
  const approveMutation = useMutation({
    mutationFn: async (id) => {
      const response = await api.post(`/lead-gen/queue/${id}/approve`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['engagement-queue']);
      queryClient.invalidateQueries(['engagement-queue-stats']);
    }
  });

  // Reject mutation
  const rejectMutation = useMutation({
    mutationFn: async (id) => {
      const response = await api.post(`/lead-gen/queue/${id}/reject`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['engagement-queue']);
      queryClient.invalidateQueries(['engagement-queue-stats']);
    }
  });

  // Update draft mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, draft_response }) => {
      const response = await api.patch(`/lead-gen/queue/${id}`, { draft_response });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['engagement-queue']);
    }
  });

  const queue = queueData?.data || [];
  const stats = statsData?.data || {};

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Engagement Queue</h1>
        <p className="mt-1 text-sm text-gray-500">
          Review and approve drafted responses before posting
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-4">
        <StatsCard
          title="Pending Review"
          value={stats.pending || 0}
          color="yellow"
        />
        <StatsCard
          title="Approved Today"
          value={stats.approved || 0}
          color="green"
        />
        <StatsCard
          title="Posted This Week"
          value={stats.posted || 0}
          color="blue"
        />
        <StatsCard
          title="Total"
          value={stats.total || 0}
          color="gray"
        />
      </div>

      {/* Filters */}
      <div className="bg-white shadow rounded-lg p-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Status
            </label>
            <select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            >
              <option value="pending_review">Pending Review</option>
              <option value="approved">Approved</option>
              <option value="posted">Posted</option>
              <option value="rejected">Rejected</option>
              <option value="all">All</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Platform
            </label>
            <select
              value={filters.platform}
              onChange={(e) => setFilters({ ...filters, platform: e.target.value })}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
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
            <label className="block text-sm font-medium text-gray-700">
              Min Score
            </label>
            <select
              value={filters.min_score}
              onChange={(e) => setFilters({ ...filters, min_score: e.target.value })}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
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
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            <p className="mt-2 text-sm text-gray-500">Loading queue...</p>
          </div>
        ) : queue.length === 0 ? (
          <div className="text-center py-12 bg-white shadow rounded-lg">
            <p className="text-gray-500">No items in queue</p>
            <p className="mt-1 text-sm text-gray-400">
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
  );
}

function StatsCard({ title, value, color }) {
  const colors = {
    yellow: 'bg-yellow-50 text-yellow-800',
    green: 'bg-green-50 text-green-800',
    blue: 'bg-blue-50 text-blue-800',
    gray: 'bg-gray-50 text-gray-800'
  };

  return (
    <div className={`px-4 py-5 sm:p-6 rounded-lg ${colors[color]}`}>
      <dt className="text-sm font-medium truncate">{title}</dt>
      <dd className="mt-1 text-3xl font-semibold">{value}</dd>
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
    <div className="bg-white shadow rounded-lg p-6 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center space-x-2">
          <span className="text-2xl">{scoreIcon}</span>
          <div>
            <div className="flex items-center space-x-2">
              <span className={`text-lg font-semibold ${scoreColor}`}>
                Score: {item.relevance_score}
              </span>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                {item.platform}
              </span>
              <span className="text-sm text-gray-500">
                {new Date(item.created_at).toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Original Post */}
      <div className="border-l-4 border-gray-300 pl-4">
        <h3 className="text-sm font-medium text-gray-900 mb-2">
          Original Post:
        </h3>
        <p className="text-sm font-semibold text-gray-800 mb-1">
          {item.post_title}
        </p>
        <p className="text-sm text-gray-600 line-clamp-3">
          {item.post_body}
        </p>
        <a
          href={item.post_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-indigo-600 hover:text-indigo-500 mt-1 inline-block"
        >
          View original post →
        </a>
      </div>

      {/* Detected Signals */}
      {item.detected_signals && item.detected_signals.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-gray-700 mb-2">Detected Signals:</h4>
          <div className="flex flex-wrap gap-1">
            {item.detected_signals.map((signal, idx) => (
              <span
                key={idx}
                className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800"
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
          <h4 className="text-sm font-medium text-gray-900">Draft Response:</h4>
          {!isEditing && item.status === 'pending_review' && (
            <button
              onClick={() => setIsEditing(true)}
              className="text-xs text-indigo-600 hover:text-indigo-500"
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
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            />
            <div className="flex space-x-2">
              <button
                onClick={handleSaveEdit}
                className="px-3 py-1.5 bg-indigo-600 text-white text-sm rounded-md hover:bg-indigo-500"
              >
                Save Changes
              </button>
              <button
                onClick={() => {
                  setDraftResponse(item.draft_response);
                  setIsEditing(false);
                }}
                className="px-3 py-1.5 bg-gray-200 text-gray-700 text-sm rounded-md hover:bg-gray-300"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-gray-50 rounded-md p-4">
            <p className="text-sm text-gray-700 whitespace-pre-wrap">
              {item.draft_response}
            </p>
          </div>
        )}
      </div>

      {/* Actions */}
      {item.status === 'pending_review' && (
        <div className="flex space-x-3 pt-4 border-t border-gray-200">
          <button
            onClick={onApprove}
            className="flex-1 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-md hover:bg-green-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
          >
            ✅ Approve & Post
          </button>
          <button
            onClick={onReject}
            className="flex-1 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-md hover:bg-red-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
          >
            ❌ Reject
          </button>
        </div>
      )}

      {item.status === 'approved' && (
        <div className="bg-green-50 border border-green-200 rounded-md p-3">
          <p className="text-sm text-green-800">
            ✅ Approved - Ready to post manually to {item.platform}
          </p>
        </div>
      )}

      {item.status === 'posted' && (
        <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
          <p className="text-sm text-blue-800">
            Posted on {new Date(item.posted_at).toLocaleString()}
          </p>
        </div>
      )}
    </div>
  );
}
