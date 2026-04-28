/**
 * @file WarRoomPage.jsx
 * @description The one page Steve opens every morning.
 * Answers: "Is this thing making me money?"
 *
 * Shows: leads discovered, emails sent, replies received, pipeline value,
 * funnel visualization, and real-time activity feed.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Users, Send, MessageSquare, DollarSign, TrendingUp,
  ArrowRight, RefreshCw, Zap, MapPin, Mail, Clock,
  CheckCircle, AlertCircle, Activity,
} from 'lucide-react';
import { api } from '@/lib/api';

// ── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({ icon: Icon, label, value, sub, color = 'text-accent-primary', link }) {
  const content = (
    <div className="bg-bg-card border border-border-default rounded-xl p-5 flex items-center gap-4 hover:border-accent-primary/40 transition-colors">
      <div className={`w-12 h-12 rounded-lg bg-bg-elevated flex items-center justify-center ${color}`}>
        <Icon size={24} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-3xl font-bold text-text-primary tracking-tight">{value ?? '—'}</div>
        <div className="text-sm text-text-muted">{label}</div>
        {sub && <div className="text-xs text-text-subtle mt-0.5">{sub}</div>}
      </div>
    </div>
  );
  return link ? <Link to={link}>{content}</Link> : content;
}

// ── Funnel Bar ───────────────────────────────────────────────────────────────

function FunnelBar({ stages }) {
  const maxVal = Math.max(...stages.map(s => s.value), 1);
  return (
    <div className="space-y-2">
      {stages.map((s, i) => (
        <div key={s.label} className="flex items-center gap-3">
          <div className="w-24 text-xs text-text-muted text-right shrink-0">{s.label}</div>
          <div className="flex-1 bg-bg-elevated rounded-full h-7 overflow-hidden relative">
            <div
              className={`h-full rounded-full transition-all duration-700 ${s.color || 'bg-accent-primary'}`}
              style={{ width: `${Math.max((s.value / maxVal) * 100, 2)}%` }}
            />
            <span className="absolute inset-0 flex items-center px-3 text-xs font-semibold text-text-primary">
              {s.value}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Activity Item ────────────────────────────────────────────────────────────

function ActivityItem({ event }) {
  const iconMap = {
    sent: <Send size={14} className="text-accent-success" />,
    draft: <Mail size={14} className="text-accent-warning" />,
    replied: <MessageSquare size={14} className="text-accent-info" />,
    enriched: <CheckCircle size={14} className="text-accent-success" />,
    discovered: <MapPin size={14} className="text-accent-primary" />,
    failed: <AlertCircle size={14} className="text-accent-danger" />,
  };
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-border-subtle last:border-0">
      <div className="mt-0.5">{iconMap[event.type] || <Activity size={14} className="text-text-muted" />}</div>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-text-primary leading-snug">{event.text}</div>
        <div className="text-xs text-text-subtle mt-0.5">{relativeTime(event.time)}</div>
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function WarRoomPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      // Parallel fetch: funnel + stats + recent outreach + health
      const [funnel, stats, outreach, health] = await Promise.all([
        api.get('/cfo-marketing/leads/funnel').catch(() => ({})),
        api.get('/cfo-marketing/leads/stats').catch(() => ({})),
        api.get('/cfo-marketing/outreach?limit=30').catch(() => ({ sequences: [] })),
        api.get('/health').catch(() => ({})),
      ]);

      // Build activity feed from outreach sequences
      const events = (outreach.sequences || [])
        .filter(s => s.status !== 'cancelled')
        .map(s => ({
          type: s.status === 'sent' ? 'sent' : s.status === 'replied' ? 'replied' : s.status === 'draft' ? 'draft' : 'enriched',
          text: s.status === 'sent'
            ? `Sent to ${s.contact_name || 'contact'} at ${s.company_name || 'company'}`
            : s.status === 'replied'
            ? `Reply from ${s.contact_email || 'unknown'} — ${s.company_name}`
            : s.status === 'draft'
            ? `Draft ready: ${s.email_subject || s.company_name}`
            : `${s.company_name} — ${s.status}`,
          time: s.sent_at || s.created_at,
        }))
        .sort((a, b) => new Date(b.time) - new Date(a.time))
        .slice(0, 20);

      // Count 7-day metrics
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const recentSent = (outreach.sequences || []).filter(s => s.status === 'sent' && s.sent_at > sevenDaysAgo).length;
      const recentReplied = (outreach.sequences || []).filter(s => s.status === 'replied').length;

      setData({
        funnel: funnel || {},
        stats: stats || {},
        events,
        recentSent,
        recentReplied,
        agentCount: health?.components?.database?.tables?.agents || 0,
        uptime: health?.uptime_seconds || 0,
      });
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000); // refresh every 30s
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="animate-spin text-accent-primary" size={32} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-center">
        <AlertCircle className="mx-auto text-accent-danger mb-2" size={32} />
        <p className="text-text-muted">{error}</p>
        <button onClick={fetchData} className="mt-3 text-accent-primary hover:underline text-sm">Retry</button>
      </div>
    );
  }

  const f = data.funnel;
  const pipelineValue = (f.replied || 0) * 490 + (f.pilot || 0) * 1200 + (f.closed_won || 0) * 5000;

  const funnelStages = [
    { label: 'Discovered', value: f.total || 0, color: 'bg-accent-primary/60' },
    { label: 'Enriched', value: (f.enriched || 0) + (f.contacted || 0) + (f.replied || 0), color: 'bg-accent-primary/80' },
    { label: 'Drafted', value: f.has_draft || 0, color: 'bg-accent-warning' },
    { label: 'Sent', value: f.contacted || 0, color: 'bg-accent-success/70' },
    { label: 'Replied', value: f.replied || 0, color: 'bg-accent-success' },
    { label: 'Pilot', value: f.pilot || 0, color: 'bg-accent-info' },
    { label: 'Won', value: f.closed_won || 0, color: 'bg-green-500' },
  ];

  const greeting = new Date().getHours() < 12 ? 'Morning' : new Date().getHours() < 17 ? 'Afternoon' : 'Evening';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">War Room</h1>
          <p className="text-sm text-text-muted mt-0.5">{greeting}, Steve. {data.agentCount} agents online.</p>
        </div>
        <button
          onClick={fetchData}
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-text-muted hover:text-text-primary border border-border-default rounded-lg hover:bg-bg-elevated transition-colors"
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={Users}
          label="Leads Discovered"
          value={f.total || 0}
          sub={`${f.needs_enrichment || 0} need enrichment`}
          color="text-accent-primary"
          link="/pipeline-health"
        />
        <KpiCard
          icon={Send}
          label="Emails Sent"
          value={f.contacted || 0}
          sub={`${data.recentSent} this week`}
          color="text-accent-success"
          link="/jake-marketing"
        />
        <KpiCard
          icon={MessageSquare}
          label="Replies"
          value={f.replied || 0}
          sub={f.replied > 0 ? `${((f.replied / Math.max(f.contacted, 1)) * 100).toFixed(1)}% reply rate` : 'Waiting...'}
          color="text-accent-info"
          link="/jake-marketing"
        />
        <KpiCard
          icon={DollarSign}
          label="Pipeline Value"
          value={`$${pipelineValue.toLocaleString()}`}
          sub={`${f.pilot || 0} pilots, ${f.closed_won || 0} won`}
          color="text-green-400"
          link="/revenue"
        />
      </div>

      {/* Two columns: Funnel + Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Funnel */}
        <div className="lg:col-span-3 bg-bg-card border border-border-default rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
              <TrendingUp size={18} className="text-accent-primary" /> Pipeline Funnel
            </h2>
            <Link to="/pipeline-health" className="text-xs text-accent-primary hover:underline flex items-center gap-1">
              Details <ArrowRight size={12} />
            </Link>
          </div>
          <FunnelBar stages={funnelStages} />

          {/* Source breakdown */}
          {data.stats.source_breakdown && data.stats.source_breakdown.length > 0 && (
            <div className="mt-4 pt-4 border-t border-border-subtle">
              <div className="text-xs text-text-muted mb-2">Lead sources</div>
              <div className="flex gap-4">
                {data.stats.source_breakdown.map(s => (
                  <div key={s.source_agent} className="text-sm">
                    <span className="font-medium text-text-primary">{s.n}</span>
                    <span className="text-text-muted ml-1">{s.source_agent}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Activity Feed */}
        <div className="lg:col-span-2 bg-bg-card border border-border-default rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
              <Zap size={18} className="text-accent-warning" /> Activity
            </h2>
            <Link to="/jake-marketing" className="text-xs text-accent-primary hover:underline flex items-center gap-1">
              All outreach <ArrowRight size={12} />
            </Link>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {data.events.length > 0 ? (
              data.events.map((e, i) => <ActivityItem key={i} event={e} />)
            ) : (
              <div className="text-sm text-text-muted text-center py-8">
                No activity yet. Run the pipeline to get started.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-bg-card border border-border-default rounded-xl p-5">
        <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wider mb-3">Quick Actions</h2>
        <div className="flex flex-wrap gap-3">
          <Link
            to="/jake-marketing"
            className="flex items-center gap-2 px-4 py-2 bg-accent-primary/10 text-accent-primary rounded-lg hover:bg-accent-primary/20 transition-colors text-sm font-medium"
          >
            <Zap size={16} /> Jake Outreach
          </Link>
          <Link
            to="/data-rehab"
            className="flex items-center gap-2 px-4 py-2 bg-accent-info/10 text-accent-info rounded-lg hover:bg-accent-info/20 transition-colors text-sm font-medium"
          >
            <Activity size={16} /> Data Rehab
          </Link>
          <Link
            to="/schedule"
            className="flex items-center gap-2 px-4 py-2 bg-bg-elevated text-text-muted rounded-lg hover:bg-bg-elevated/80 transition-colors text-sm font-medium"
          >
            <Clock size={16} /> Schedules
          </Link>
          <Link
            to="/agents"
            className="flex items-center gap-2 px-4 py-2 bg-bg-elevated text-text-muted rounded-lg hover:bg-bg-elevated/80 transition-colors text-sm font-medium"
          >
            <Users size={16} /> Agents
          </Link>
        </div>
      </div>
    </div>
  );
}
