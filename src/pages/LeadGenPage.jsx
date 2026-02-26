/**
 * @file LeadGenPage.jsx
 * @description HOA Networker — review agent-drafted responses, copy to clipboard, post manually, track engagement.
 *
 * WORKFLOW:
 *   Pending Review → read post + response → Edit if needed → Approve
 *   Approved       → copy response → open post link → paste & post → Mark Posted → log engagement
 *   Posted         → track likes/replies/clicks after the fact
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  Users, MessageCircle, MousePointerClick, TrendingUp, CheckCircle,
  XCircle, Edit2, ExternalLink, AlertCircle, Copy, Check, Send,
  Clock, Flame, ChevronDown, ChevronUp, BarChart2, ArrowRight,
  RefreshCw, ThumbsUp, MessageSquare,
} from 'lucide-react';
import { api } from '@/lib/api';
import Button from '@/components/ui/Button';

// ── helpers ───────────────────────────────────────────────────────────────────

const PLATFORM_COLORS = {
  reddit:        'bg-orange-500/10 text-orange-400 border-orange-500/20',
  facebook:      'bg-blue-500/10 text-blue-400 border-blue-500/20',
  linkedin:      'bg-blue-700/10 text-blue-300 border-blue-700/20',
  biggerpockets: 'bg-green-500/10 text-green-400 border-green-500/20',
  quora:         'bg-red-500/10 text-red-400 border-red-500/20',
  nextdoor:      'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
};
const platformColor = (p) => PLATFORM_COLORS[p?.toLowerCase()] || 'bg-bg-elevated text-text-muted border-border';

const PLATFORM_URLS = {
  reddit: 'reddit.com',
  facebook: 'facebook.com',
  linkedin: 'linkedin.com',
  biggerpockets: 'biggerpockets.com',
};

function scoreColor(s) {
  if (s >= 85) return 'text-red-400 bg-red-500/10';
  if (s >= 70) return 'text-accent-warning bg-accent-warning/10';
  return 'text-accent-success bg-accent-success/10';
}

function CopyButton({ text, label = 'Copy', className = '' }) {
  const [copied, setCopied] = useState(false);
  const copy = async (e) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={copy}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors
        ${copied
          ? 'bg-accent-success/20 text-accent-success border border-accent-success/30'
          : 'bg-bg-primary text-text-secondary border border-border hover:text-text-primary hover:border-accent-primary/40'}
        ${className}`}
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
      {copied ? 'Copied!' : label}
    </button>
  );
}

// ── main component ────────────────────────────────────────────────────────────

export default function LeadGenPage() {
  const [queue, setQueue]                 = useState([]);
  const [stats, setStats]                 = useState(null);
  const [communities, setCommunities]     = useState([]);
  const [isLoading, setIsLoading]         = useState(true);
  const [statusFilter, setStatusFilter]   = useState('pending_review');
  const [expandedId, setExpandedId]       = useState(null);
  const [editingId, setEditingId]         = useState(null);
  const [editText, setEditText]           = useState('');
  const [engagementModal, setEngagementModal] = useState(null); // { id, likes, replies, clicks }
  const [saving, setSaving]               = useState(null);
  const [toast, setToast]                 = useState(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2500);
  };

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [queueData, statsData, commData] = await Promise.all([
        api.get(`/lead-gen/queue?status=${statusFilter}&limit=50`),
        api.get('/lead-gen/queue/stats'),
        api.get('/lead-gen/communities').catch(() => ({ data: [] })),
      ]);
      // Sort: hot items (score >= 85) first, then by score desc
      const items = (queueData.data || []).sort((a, b) => {
        const hotA = (a.relevance_score || 0) >= 85 ? 1 : 0;
        const hotB = (b.relevance_score || 0) >= 85 ? 1 : 0;
        if (hotB !== hotA) return hotB - hotA;
        return (b.relevance_score || 0) - (a.relevance_score || 0);
      });
      setQueue(items);
      setStats(statsData.data || {});
      setCommunities(commData.data || []);
    } catch (err) {
      console.error('[LeadGenPage]', err);
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const approve = async (id, e) => {
    e?.stopPropagation();
    setSaving(id);
    try {
      await api.post(`/lead-gen/queue/${id}/approve`);
      showToast('Approved — switch to the Approved tab to copy & post');
      await fetchData();
      setExpandedId(id); // auto-expand so user sees next step
    } catch (err) {
      showToast('Failed to approve', 'error');
    } finally {
      setSaving(null);
    }
  };

  const reject = async (id, e) => {
    e?.stopPropagation();
    setSaving(id);
    try {
      await api.post(`/lead-gen/queue/${id}/reject`);
      showToast('Rejected');
      await fetchData();
    } finally {
      setSaving(null);
    }
  };

  const saveEdit = async (id, e) => {
    e?.stopPropagation();
    setSaving(id);
    try {
      await api.put(`/lead-gen/queue/${id}`, { draft_response: editText });
      showToast('Response saved');
      setEditingId(null);
      await fetchData();
    } finally {
      setSaving(null);
    }
  };

  const markPosted = async (id, e) => {
    e?.stopPropagation();
    setSaving(id);
    try {
      await api.post(`/lead-gen/queue/${id}/post`);
      showToast('Marked as posted ✓ — log engagement when you get reactions');
      await fetchData();
    } finally {
      setSaving(null);
    }
  };

  const saveEngagement = async () => {
    if (!engagementModal) return;
    const { id, likes, replies, clicks } = engagementModal;
    setSaving(id);
    try {
      await api.put(`/lead-gen/queue/${id}`, {
        engagement_likes: parseInt(likes) || 0,
        engagement_replies: parseInt(replies) || 0,
        engagement_clicks: parseInt(clicks) || 0,
      });
      showToast('Engagement logged');
      setEngagementModal(null);
      await fetchData();
    } finally {
      setSaving(null);
    }
  };

  const approvedCount = stats?.approved || 0;
  const pendingCount  = stats?.pending  || 0;
  const postedCount   = stats?.posted   || 0;

  const TAB_CONFIG = [
    { key: 'pending_review', label: 'Review',   count: pendingCount,  color: 'text-accent-warning' },
    { key: 'approved',       label: 'Ready to Post', count: approvedCount, color: 'text-accent-success' },
    { key: 'posted',         label: 'Posted',   count: postedCount,   color: 'text-accent-info' },
    { key: 'rejected',       label: 'Rejected', count: null,          color: 'text-text-muted' },
  ];

  // ── loading ──────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <Users className="mx-auto mb-3 text-text-muted animate-pulse" size={40} />
          <p className="text-sm text-text-muted">Loading engagement queue...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-bg-primary relative">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium flex items-center gap-2
          ${toast.type === 'error' ? 'bg-red-500/20 text-red-300 border border-red-500/30' : 'bg-accent-success/20 text-accent-success border border-accent-success/30'}`}>
          {toast.type === 'error' ? <AlertCircle size={14} /> : <Check size={14} />}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="px-6 py-4 border-b border-border bg-bg-secondary flex-shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-semibold text-text-primary flex items-center gap-2">
              <Users size={22} className="text-accent-primary" />
              HOA Networker
            </h1>
            <p className="text-xs text-text-muted mt-0.5">
              Agent scans communities → drafts responses → you review & post manually
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Stats row */}
            {[
              { label: 'Need Review', val: pendingCount, color: 'text-accent-warning' },
              { label: 'Ready to Post', val: approvedCount, color: 'text-accent-success' },
              { label: 'Posted', val: postedCount, color: 'text-accent-info' },
            ].map(s => (
              <div key={s.label} className="text-center px-3 py-1.5 bg-bg-elevated rounded-lg border border-border">
                <div className={`text-xl font-bold ${s.color}`}>{s.val}</div>
                <div className="text-xs text-text-muted">{s.label}</div>
              </div>
            ))}
            <button onClick={fetchData} className="p-2 text-text-muted hover:text-text-primary rounded-lg border border-border hover:border-accent-primary/40 transition-colors">
              <RefreshCw size={14} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1">
          {TAB_CONFIG.map(tab => (
            <button
              key={tab.key}
              onClick={() => setStatusFilter(tab.key)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5
                ${statusFilter === tab.key
                  ? 'bg-accent-primary text-bg-primary'
                  : 'bg-bg-elevated text-text-secondary hover:text-text-primary border border-border'}`}
            >
              {tab.label}
              {tab.count !== null && tab.count > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${statusFilter === tab.key ? 'bg-white/20' : 'bg-bg-primary border border-border ' + tab.color}`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Workflow hint banners */}
      {statusFilter === 'pending_review' && queue.length > 0 && (
        <div className="mx-6 mt-4 px-4 py-2.5 bg-accent-warning/5 border border-accent-warning/20 rounded-lg text-xs text-accent-warning flex items-center gap-2 flex-shrink-0">
          <Clock size={12} />
          <span><strong>Workflow:</strong> Read the post + response → Edit if needed → Approve → switch to "Ready to Post" tab to copy & post</span>
        </div>
      )}
      {statusFilter === 'approved' && queue.length > 0 && (
        <div className="mx-6 mt-4 px-4 py-2.5 bg-accent-success/5 border border-accent-success/20 rounded-lg text-xs text-accent-success flex items-center gap-2 flex-shrink-0">
          <ArrowRight size={12} />
          <span><strong>Ready to post:</strong> Click "Open Post" to go to the thread → click "Copy Response" → paste your reply → come back and click "Mark Posted"</span>
        </div>
      )}
      {statusFilter === 'posted' && queue.length > 0 && (
        <div className="mx-6 mt-4 px-4 py-2.5 bg-accent-info/5 border border-accent-info/20 rounded-lg text-xs text-accent-info flex items-center gap-2 flex-shrink-0">
          <BarChart2 size={12} />
          <span><strong>Track results:</strong> Click "Log Engagement" after 24h to record likes, replies, and clicks back to the site</span>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Queue — left 2/3 */}
          <div className="lg:col-span-2 space-y-3">

            {queue.length === 0 ? (
              <div className="bg-bg-elevated rounded-lg border border-border p-10 text-center">
                <AlertCircle className="mx-auto mb-3 text-text-muted" size={32} />
                <p className="text-text-muted font-medium">No {statusFilter.replace('_', ' ')} items</p>
                {statusFilter === 'pending_review' && (
                  <p className="text-xs text-text-muted mt-2">The HOA Networker agent scans Reddit, Facebook, and LinkedIn twice daily and drops drafts here for review.</p>
                )}
              </div>
            ) : (
              queue.map((opp) => {
                const isHot      = (opp.relevance_score || 0) >= 85;
                const isExpanded = expandedId === opp.id;
                const isEditing  = editingId === opp.id;

                return (
                  <div
                    key={opp.id}
                    className={`bg-bg-elevated rounded-lg border transition-colors
                      ${isHot ? 'border-red-500/30' : 'border-border hover:border-accent-primary/30'}`}
                  >
                    {/* Card header — always visible */}
                    <div
                      className="p-4 cursor-pointer"
                      onClick={() => setExpandedId(isExpanded ? null : opp.id)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                            {isHot && (
                              <span className="flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-red-500/15 text-red-400 border border-red-500/30">
                                <Flame size={10} /> HOT
                              </span>
                            )}
                            <span className={`px-2 py-0.5 rounded text-xs font-medium border ${platformColor(opp.platform)}`}>
                              {opp.platform}
                            </span>
                            {opp.community && (
                              <span className="text-xs text-text-muted">{opp.community}</span>
                            )}
                            {opp.relevance_score > 0 && (
                              <span className={`px-2 py-0.5 rounded text-xs font-medium ${scoreColor(opp.relevance_score)}`}>
                                {opp.relevance_score}% match
                              </span>
                            )}
                            {opp.post_age_hours && (
                              <span className="text-xs text-text-muted flex items-center gap-1">
                                <Clock size={10} /> {opp.post_age_hours}h ago
                              </span>
                            )}
                          </div>
                          <h3 className="font-medium text-text-primary leading-snug">
                            {opp.post_title || 'Untitled Post'}
                          </h3>
                          {opp.post_summary && !isExpanded && (
                            <p className="text-xs text-text-muted mt-1 line-clamp-2">{opp.post_summary}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <a
                            href={opp.post_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-text-muted hover:text-accent-primary transition-colors"
                            onClick={(e) => e.stopPropagation()}
                            title={`Open on ${opp.platform}`}
                          >
                            <ExternalLink size={14} />
                          </a>
                          {isExpanded ? <ChevronUp size={14} className="text-text-muted" /> : <ChevronDown size={14} className="text-text-muted" />}
                        </div>
                      </div>

                      {/* Quick action row — always visible in pending/approved */}
                      {statusFilter === 'pending_review' && (
                        <div className="flex gap-2 mt-3" onClick={(e) => e.stopPropagation()}>
                          <button
                            disabled={saving === opp.id}
                            onClick={(e) => approve(opp.id, e)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-accent-success/15 text-accent-success border border-accent-success/30 hover:bg-accent-success/25 transition-colors disabled:opacity-50"
                          >
                            <CheckCircle size={12} />
                            Approve
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setEditingId(isEditing ? null : opp.id); setEditText(opp.draft_response); setExpandedId(opp.id); }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-bg-primary text-text-secondary border border-border hover:text-text-primary transition-colors"
                          >
                            <Edit2 size={12} />
                            Edit
                          </button>
                          <button
                            disabled={saving === opp.id}
                            onClick={(e) => reject(opp.id, e)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                          >
                            <XCircle size={12} />
                            Reject
                          </button>
                        </div>
                      )}

                      {statusFilter === 'approved' && (
                        <div className="flex gap-2 mt-3" onClick={(e) => e.stopPropagation()}>
                          <a
                            href={opp.post_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-accent-primary/15 text-accent-primary border border-accent-primary/30 hover:bg-accent-primary/25 transition-colors"
                          >
                            <ExternalLink size={12} />
                            1. Open Post
                          </a>
                          <CopyButton text={opp.draft_response} label="2. Copy Response" />
                          <button
                            disabled={saving === opp.id}
                            onClick={(e) => markPosted(opp.id, e)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-accent-success/15 text-accent-success border border-accent-success/30 hover:bg-accent-success/25 transition-colors disabled:opacity-50"
                          >
                            <Check size={12} />
                            3. Mark Posted
                          </button>
                        </div>
                      )}

                      {statusFilter === 'posted' && (
                        <div className="flex gap-2 mt-3 items-center" onClick={(e) => e.stopPropagation()}>
                          {opp.engagement_likes > 0 || opp.engagement_replies > 0 ? (
                            <div className="flex items-center gap-3 text-xs text-text-muted">
                              <span className="flex items-center gap-1"><ThumbsUp size={11} /> {opp.engagement_likes} likes</span>
                              <span className="flex items-center gap-1"><MessageSquare size={11} /> {opp.engagement_replies} replies</span>
                              <span className="flex items-center gap-1"><MousePointerClick size={11} /> {opp.engagement_clicks} clicks</span>
                            </div>
                          ) : (
                            <span className="text-xs text-text-muted italic">No engagement logged yet</span>
                          )}
                          <button
                            onClick={(e) => { e.stopPropagation(); setEngagementModal({ id: opp.id, likes: opp.engagement_likes || 0, replies: opp.engagement_replies || 0, clicks: opp.engagement_clicks || 0 }); }}
                            className="flex items-center gap-1 px-2.5 py-1 rounded text-xs text-text-secondary border border-border hover:text-text-primary transition-colors ml-auto"
                          >
                            <BarChart2 size={11} />
                            Log Engagement
                          </button>
                          <a href={opp.post_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
                            className="text-text-muted hover:text-accent-primary transition-colors">
                            <ExternalLink size={12} />
                          </a>
                        </div>
                      )}
                    </div>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div className="px-4 pb-4 border-t border-border/50 pt-3 space-y-3">
                        {/* Original post body */}
                        {opp.post_summary && (
                          <div>
                            <div className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-1">Original Post</div>
                            <p className="text-sm text-text-secondary bg-bg-primary rounded p-3 border border-border">
                              {opp.post_summary}
                            </p>
                          </div>
                        )}

                        {/* Draft response — editable or view */}
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <div className="text-xs font-semibold text-text-muted uppercase tracking-wide">Draft Response</div>
                            <div className="flex items-center gap-2">
                              {!isEditing && <CopyButton text={opp.draft_response} />}
                              {statusFilter !== 'posted' && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); setEditingId(isEditing ? null : opp.id); setEditText(opp.draft_response); }}
                                  className="text-xs text-text-muted hover:text-text-primary flex items-center gap-1"
                                >
                                  <Edit2 size={11} /> {isEditing ? 'Cancel' : 'Edit'}
                                </button>
                              )}
                            </div>
                          </div>
                          {isEditing ? (
                            <div>
                              <textarea
                                value={editText}
                                onChange={(e) => setEditText(e.target.value)}
                                className="w-full h-40 px-3 py-2 bg-bg-primary border border-accent-primary/40 rounded text-sm text-text-primary font-mono resize-none focus:outline-none focus:border-accent-primary"
                                onClick={(e) => e.stopPropagation()}
                              />
                              <div className="flex gap-2 mt-2">
                                <button
                                  onClick={(e) => saveEdit(opp.id, e)}
                                  disabled={saving === opp.id}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-accent-primary text-bg-primary hover:bg-accent-primary/80 transition-colors"
                                >
                                  <Check size={12} /> Save
                                </button>
                                {statusFilter === 'pending_review' && (
                                  <button
                                    onClick={(e) => { saveEdit(opp.id, e).then(() => approve(opp.id)); }}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-accent-success/15 text-accent-success border border-accent-success/30 hover:bg-accent-success/25 transition-colors"
                                  >
                                    <CheckCircle size={12} /> Save & Approve
                                  </button>
                                )}
                              </div>
                            </div>
                          ) : (
                            <div className="text-sm text-text-secondary bg-bg-primary rounded p-3 border border-border whitespace-pre-wrap">
                              {opp.draft_response}
                            </div>
                          )}
                        </div>

                        {/* Posting instructions for approved tab */}
                        {statusFilter === 'approved' && !isEditing && (
                          <div className="bg-accent-success/5 border border-accent-success/20 rounded p-3">
                            <div className="text-xs font-semibold text-accent-success mb-2">How to post this</div>
                            <ol className="space-y-1 text-xs text-text-secondary">
                              <li className="flex items-start gap-2"><span className="text-accent-primary font-bold">1.</span> Click <strong>"Open Post"</strong> above — it opens the original thread on {opp.platform}</li>
                              <li className="flex items-start gap-2"><span className="text-accent-primary font-bold">2.</span> Click <strong>"Copy Response"</strong> to copy the draft to your clipboard</li>
                              <li className="flex items-start gap-2"><span className="text-accent-primary font-bold">3.</span> Paste into the reply/comment box and submit</li>
                              <li className="flex items-start gap-2"><span className="text-accent-primary font-bold">4.</span> Come back and click <strong>"Mark Posted"</strong> to track it</li>
                            </ol>
                          </div>
                        )}

                        {/* Metadata row */}
                        <div className="flex flex-wrap gap-3 text-xs text-text-muted pt-1">
                          {opp.post_author && <span>Posted by: {opp.post_author}</span>}
                          {opp.recommended_template && <span>Template: {opp.recommended_template}</span>}
                          {opp.includes_link ? <span className="text-accent-info">Includes site link</span> : <span>No link included</span>}
                          {opp.approved_at && <span>Approved: {new Date(opp.approved_at).toLocaleDateString()}</span>}
                          {opp.posted_at && <span>Posted: {new Date(opp.posted_at).toLocaleDateString()}</span>}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Right sidebar */}
          <div className="space-y-5">

            {/* How this works */}
            <div className="bg-bg-elevated rounded-lg border border-border p-4">
              <h3 className="font-semibold text-text-primary mb-3 text-sm flex items-center gap-2">
                <ArrowRight size={14} className="text-accent-primary" />
                How This Works
              </h3>
              <ol className="space-y-2 text-xs text-text-secondary">
                {[
                  ['Agent scans', 'Reddit r/HOA, Facebook groups, LinkedIn — twice daily at 9AM & 3PM'],
                  ['Scores & drafts', 'Finds high-relevance posts, picks a template, writes a response'],
                  ['You review', 'Edit if needed, approve the good ones, reject the irrelevant'],
                  ['You post', '"Ready to Post" tab shows copy button + direct link — 10 seconds per post'],
                  ['Track it', 'Log likes/replies after 24h to see what\'s working'],
                ].map(([step, desc], i) => (
                  <li key={i} className="flex gap-2">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-accent-primary/20 text-accent-primary flex items-center justify-center text-xs font-bold">{i + 1}</span>
                    <span><strong className="text-text-primary">{step}</strong> — {desc}</span>
                  </li>
                ))}
              </ol>
            </div>

            {/* Tracked Communities */}
            <div className="bg-bg-elevated rounded-lg border border-border p-4">
              <h3 className="font-semibold text-text-primary mb-3 text-sm flex items-center gap-2">
                <Users size={14} className="text-accent-primary" />
                Tracked Communities
              </h3>
              <div className="space-y-2 max-h-52 overflow-y-auto">
                {communities.length === 0 ? (
                  <p className="text-xs text-text-muted text-center py-3">No communities tracked yet</p>
                ) : (
                  communities.slice(0, 10).map((c) => (
                    <div key={c.id} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
                      <div>
                        <div className="text-xs font-medium text-text-primary">{c.community_name}</div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className={`px-1.5 py-0.5 rounded text-xs border ${platformColor(c.platform)}`}>{c.platform}</span>
                          <span className="text-xs text-text-muted">{c.our_status}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-bold text-accent-primary">{c.posts_made || 0}</div>
                        <div className="text-xs text-text-muted">posts</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Performance */}
            {(postedCount > 0 || (stats?.platform_stats || []).length > 0) && (
              <div className="bg-bg-elevated rounded-lg border border-border p-4">
                <h3 className="font-semibold text-text-primary mb-3 text-sm flex items-center gap-2">
                  <TrendingUp size={14} className="text-accent-success" />
                  Performance
                </h3>
                <div className="space-y-2">
                  {(stats?.platform_stats || []).map((p, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <span className={`px-2 py-0.5 rounded border ${platformColor(p.platform)}`}>{p.platform}</span>
                      <div className="flex items-center gap-3 text-text-muted">
                        <span className="flex items-center gap-1"><Send size={10} /> {p.posts || 0} posted</span>
                        <span className="flex items-center gap-1"><MousePointerClick size={10} /> {p.total_clicks || 0} clicks</span>
                      </div>
                    </div>
                  ))}
                  {(!stats?.platform_stats || stats.platform_stats.length === 0) && (
                    <p className="text-xs text-text-muted text-center py-2">Post something and log engagement to see stats</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Engagement modal */}
      {engagementModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setEngagementModal(null)}>
          <div className="bg-bg-secondary border border-border rounded-xl p-6 w-80 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-text-primary mb-1">Log Engagement</h3>
            <p className="text-xs text-text-muted mb-4">Check the post and enter what you see</p>
            {[
              { key: 'likes',   label: 'Upvotes / Likes', icon: ThumbsUp },
              { key: 'replies', label: 'Replies / Comments', icon: MessageSquare },
              { key: 'clicks',  label: 'Site Clicks (from UTM)', icon: MousePointerClick },
            ].map(({ key, label, icon: Icon }) => (
              <div key={key} className="mb-3">
                <label className="text-xs text-text-muted mb-1 flex items-center gap-1"><Icon size={11} /> {label}</label>
                <input
                  type="number"
                  min="0"
                  value={engagementModal[key]}
                  onChange={(e) => setEngagementModal(m => ({ ...m, [key]: e.target.value }))}
                  className="w-full px-3 py-2 bg-bg-primary border border-border rounded text-sm text-text-primary focus:outline-none focus:border-accent-primary"
                />
              </div>
            ))}
            <div className="flex gap-2 mt-4">
              <button
                onClick={saveEngagement}
                disabled={saving === engagementModal.id}
                className="flex-1 py-2 rounded bg-accent-primary text-bg-primary text-sm font-medium hover:bg-accent-primary/80 transition-colors"
              >
                Save
              </button>
              <button onClick={() => setEngagementModal(null)} className="px-4 py-2 rounded border border-border text-sm text-text-secondary hover:text-text-primary transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
