/**
 * ContentQueuePage.jsx
 * Manage and publish social media posts from the content queue.
 *
 * Features:
 * - View all queued posts with status badges
 * - Generate new posts via the hoa-social-media agent
 * - Manually publish any pending post to Facebook now
 * - Delete posts from the queue
 * - Run publish-due to push all ready posts at once
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import {
  Facebook,
  Plus,
  Send,
  Trash2,
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  Loader,
  Sparkles,
} from 'lucide-react';

// ── Status badge ────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const map = {
    pending:  { label: 'Pending',  cls: 'bg-yellow-500/20 text-yellow-400' },
    posted:   { label: 'Posted',   cls: 'bg-green-500/20 text-green-400' },
    failed:   { label: 'Failed',   cls: 'bg-red-500/20 text-red-400' },
    skipped:  { label: 'Skipped',  cls: 'bg-gray-500/20 text-gray-400' },
  };
  const { label, cls } = map[status] || { label: status, cls: 'bg-gray-500/20 text-gray-400' };
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cls}`}>
      {label}
    </span>
  );
}

// ── Generate modal ──────────────────────────────────────────────────────────

function GenerateModal({ onClose, onGenerated }) {
  const [topic, setTopic] = useState('');
  const [postType, setPostType] = useState('page');
  const [scheduledFor, setScheduledFor] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleGenerate() {
    if (!topic.trim()) { setError('Topic is required'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await api.post('/content-queue/generate', {
        topic: topic.trim(),
        post_type: postType,
        scheduled_for: scheduledFor || undefined,
      });
      onGenerated(res.post);
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Generation failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-bg-secondary border border-border rounded-xl w-full max-w-md p-6 shadow-2xl">
        <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
          <Sparkles size={18} className="text-accent-primary" />
          Generate Facebook Post
        </h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-text-secondary mb-1">Topic / Blog post title</label>
            <input
              className="w-full bg-bg-elevated border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent-primary"
              placeholder="e.g. HOA roof replacement financing options"
              value={topic}
              onChange={e => setTopic(e.target.value)}
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-sm text-text-secondary mb-1">Post type</label>
            <select
              className="w-full bg-bg-elevated border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-primary"
              value={postType}
              onChange={e => setPostType(e.target.value)}
              disabled={loading}
            >
              <option value="page">Company Page Post (with link + CTA)</option>
              <option value="group">Group Discussion Post (no link, builds credibility)</option>
            </select>
          </div>

          <div>
            <label className="block text-sm text-text-secondary mb-1">Schedule for (optional)</label>
            <input
              type="datetime-local"
              className="w-full bg-bg-elevated border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-primary"
              value={scheduledFor}
              onChange={e => setScheduledFor(e.target.value)}
              disabled={loading}
            />
            <p className="text-xs text-text-muted mt-1">Leave blank to post immediately when published</p>
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={handleGenerate}
            disabled={loading}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-accent-primary text-bg-primary text-sm font-medium hover:bg-accent-primary/90 disabled:opacity-50 transition-colors"
          >
            {loading ? <Loader size={15} className="animate-spin" /> : <Sparkles size={15} />}
            {loading ? 'Generating...' : 'Generate with AI'}
          </button>
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 rounded-lg border border-border text-text-secondary text-sm hover:text-text-primary hover:bg-bg-elevated transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Add manual post modal ───────────────────────────────────────────────────

function AddManualModal({ onClose, onAdded }) {
  const [content, setContent] = useState('');
  const [topic, setTopic] = useState('');
  const [postType, setPostType] = useState('page');
  const [scheduledFor, setScheduledFor] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleAdd() {
    if (!content.trim()) { setError('Content is required'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await api.post('/content-queue', {
        content: content.trim(),
        topic: topic.trim() || undefined,
        post_type: postType,
        scheduled_for: scheduledFor || undefined,
      });
      onAdded(res.post);
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to add post');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-bg-secondary border border-border rounded-xl w-full max-w-lg p-6 shadow-2xl">
        <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
          <Plus size={18} className="text-accent-primary" />
          Add Post Manually
        </h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-text-secondary mb-1">Post content</label>
            <textarea
              className="w-full bg-bg-elevated border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent-primary resize-none"
              placeholder="Write your Facebook post text here..."
              rows={6}
              value={content}
              onChange={e => setContent(e.target.value)}
              disabled={loading}
            />
            <p className="text-xs text-text-muted mt-1">{content.length} chars</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-text-secondary mb-1">Topic label</label>
              <input
                className="w-full bg-bg-elevated border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent-primary"
                placeholder="e.g. Roof financing"
                value={topic}
                onChange={e => setTopic(e.target.value)}
                disabled={loading}
              />
            </div>
            <div>
              <label className="block text-sm text-text-secondary mb-1">Post type</label>
              <select
                className="w-full bg-bg-elevated border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-primary"
                value={postType}
                onChange={e => setPostType(e.target.value)}
                disabled={loading}
              >
                <option value="page">Page Post</option>
                <option value="group">Group Post</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm text-text-secondary mb-1">Schedule for (optional)</label>
            <input
              type="datetime-local"
              className="w-full bg-bg-elevated border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-primary"
              value={scheduledFor}
              onChange={e => setScheduledFor(e.target.value)}
              disabled={loading}
            />
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={handleAdd}
            disabled={loading}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-accent-primary text-bg-primary text-sm font-medium hover:bg-accent-primary/90 disabled:opacity-50 transition-colors"
          >
            {loading ? <Loader size={15} className="animate-spin" /> : <Plus size={15} />}
            {loading ? 'Adding...' : 'Add to Queue'}
          </button>
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 rounded-lg border border-border text-text-secondary text-sm hover:text-text-primary hover:bg-bg-elevated transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ───────────────────────────────────────────────────────────────

export default function ContentQueuePage() {
  const [showGenerate, setShowGenerate] = useState(false);
  const [showAddManual, setShowAddManual] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [publishingDue, setPublishingDue] = useState(false);
  const [publishDueResult, setPublishDueResult] = useState(null);

  const queryClient = useQueryClient();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['content-queue', statusFilter],
    queryFn: async () => {
      const params = statusFilter !== 'all' ? `?status=${statusFilter}` : '';
      const res = await api.get(`/content-queue${params}`);
      return res ?? { posts: [], count: 0 };
    },
    refetchInterval: 15000,
  });

  const publishMutation = useMutation({
    mutationFn: async (id) => {
      const res = await api.post(`/content-queue/${id}/publish`);
      return res;
    },
    onSuccess: () => queryClient.invalidateQueries(['content-queue']),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      await api.del(`/content-queue/${id}`);
    },
    onSuccess: () => queryClient.invalidateQueries(['content-queue']),
  });

  async function handlePublishDue() {
    setPublishingDue(true);
    setPublishDueResult(null);
    try {
      const res = await api.post('/content-queue/publish-due');
      setPublishDueResult(res);
      queryClient.invalidateQueries(['content-queue']);
    } catch (err) {
      setPublishDueResult({ success: false, error: err.response?.data?.error || 'Failed' });
    } finally {
      setPublishingDue(false);
    }
  }

  const posts = data?.posts || [];
  const pendingCount = posts.filter(p => p.status === 'pending').length;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Facebook size={20} className="text-blue-400" />
          <div>
            <h1 className="text-lg font-semibold text-text-primary">Content Queue</h1>
            <p className="text-xs text-text-muted">Facebook posts ready to publish</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            className="p-2 rounded-lg text-text-muted hover:text-text-secondary hover:bg-bg-elevated transition-colors"
            title="Refresh"
          >
            <RefreshCw size={15} />
          </button>

          <button
            onClick={handlePublishDue}
            disabled={publishingDue || pendingCount === 0}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border text-sm text-text-secondary hover:text-text-primary hover:bg-bg-elevated disabled:opacity-40 transition-colors"
          >
            {publishingDue ? <Loader size={14} className="animate-spin" /> : <Send size={14} />}
            Publish Due ({pendingCount})
          </button>

          <button
            onClick={() => setShowAddManual(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border text-sm text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-colors"
          >
            <Plus size={14} />
            Add Manually
          </button>

          <button
            onClick={() => setShowGenerate(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-accent-primary text-bg-primary text-sm font-medium hover:bg-accent-primary/90 transition-colors"
          >
            <Sparkles size={14} />
            Generate with AI
          </button>
        </div>
      </div>

      {/* Publish-due result banner */}
      {publishDueResult && (
        <div className={`mx-6 mt-3 px-4 py-3 rounded-lg text-sm flex items-start gap-2 ${
          publishDueResult.success ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
        }`}>
          {publishDueResult.success
            ? <CheckCircle size={15} className="shrink-0 mt-0.5" />
            : <XCircle size={15} className="shrink-0 mt-0.5" />
          }
          <div>
            {publishDueResult.success
              ? `Published ${publishDueResult.published} post(s). Failed: ${publishDueResult.failed}.`
              : `Error: ${publishDueResult.error}`
            }
            {publishDueResult.message && ` ${publishDueResult.message}`}
          </div>
          <button onClick={() => setPublishDueResult(null)} className="ml-auto text-current opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      {/* Filter tabs */}
      <div className="px-6 pt-4 pb-2 flex gap-2 shrink-0">
        {['all', 'pending', 'posted', 'failed'].map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              statusFilter === s
                ? 'bg-accent-primary/20 text-accent-primary'
                : 'text-text-muted hover:text-text-secondary hover:bg-bg-elevated'
            }`}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {/* Posts list */}
      <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-text-muted">
            <Loader size={20} className="animate-spin mr-2" /> Loading queue...
          </div>
        ) : posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-text-muted gap-3">
            <Facebook size={32} className="opacity-30" />
            <p className="text-sm">Queue is empty.</p>
            <button
              onClick={() => setShowGenerate(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent-primary text-bg-primary text-sm font-medium hover:bg-accent-primary/90 transition-colors"
            >
              <Sparkles size={14} /> Generate your first post
            </button>
          </div>
        ) : (
          posts.map(post => (
            <div
              key={post.id}
              className="bg-bg-secondary border border-border rounded-xl p-4 space-y-3"
            >
              {/* Top row */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <StatusBadge status={post.status} />
                  <span className="text-xs text-text-muted bg-bg-elevated px-2 py-0.5 rounded-full">
                    {post.post_type === 'group' ? 'Group' : 'Page'} post
                  </span>
                  {post.topic && (
                    <span className="text-xs text-accent-primary/80">{post.topic}</span>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {post.status === 'pending' && (
                    <button
                      onClick={() => publishMutation.mutate(post.id)}
                      disabled={publishMutation.isPending}
                      title="Publish to Facebook now"
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 text-xs font-medium transition-colors disabled:opacity-40"
                    >
                      <Send size={12} /> Publish Now
                    </button>
                  )}
                  {post.status === 'failed' && (
                    <button
                      onClick={() => publishMutation.mutate(post.id)}
                      disabled={publishMutation.isPending}
                      title="Retry publishing"
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 text-xs font-medium transition-colors disabled:opacity-40"
                    >
                      <RefreshCw size={12} /> Retry
                    </button>
                  )}
                  <button
                    onClick={() => deleteMutation.mutate(post.id)}
                    disabled={deleteMutation.isPending}
                    title="Delete from queue"
                    className="p-1.5 rounded-lg text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              {/* Content preview */}
              <p className="text-sm text-text-secondary leading-relaxed whitespace-pre-wrap">
                {post.content}
              </p>

              {/* Bottom meta */}
              <div className="flex items-center gap-4 text-xs text-text-muted pt-1 border-t border-border/50">
                <span>Added {new Date(post.created_at).toLocaleDateString()}</span>
                {post.scheduled_for && (
                  <span className="flex items-center gap-1">
                    <Clock size={11} />
                    Scheduled {new Date(post.scheduled_for).toLocaleString()}
                  </span>
                )}
                {post.posted_at && (
                  <span className="flex items-center gap-1 text-green-400/70">
                    <CheckCircle size={11} />
                    Posted {new Date(post.posted_at).toLocaleString()}
                  </span>
                )}
                {post.facebook_post_id && (
                  <span className="font-mono text-blue-400/60">FB: {post.facebook_post_id}</span>
                )}
                {post.error_message && (
                  <span className="text-red-400/70">Error: {post.error_message}</span>
                )}
                {post.source_agent && (
                  <span className="ml-auto">via {post.source_agent}</span>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modals */}
      {showGenerate && (
        <GenerateModal
          onClose={() => setShowGenerate(false)}
          onGenerated={() => queryClient.invalidateQueries(['content-queue'])}
        />
      )}
      {showAddManual && (
        <AddManualModal
          onClose={() => setShowAddManual(false)}
          onAdded={() => queryClient.invalidateQueries(['content-queue'])}
        />
      )}
    </div>
  );
}
