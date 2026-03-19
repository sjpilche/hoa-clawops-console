import React, { useState, useEffect } from 'react';
import {
  DollarSign, TrendingUp, Users, Target, Clock, Zap,
  BarChart3, ArrowRight, ChevronDown, RefreshCw
} from 'lucide-react';
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, FunnelChart, Funnel, LabelList,
} from 'recharts';

const STAGE_COLORS = {
  discovered: '#6b7280',
  contacted: '#3b82f6',
  replied: '#8b5cf6',
  meeting: '#f59e0b',
  pilot: '#f97316',
  closed_won: '#22c55e',
  closed_lost: '#ef4444',
  lost: '#991b1b',
};

const STAGE_LABELS = {
  discovered: 'Discovered',
  contacted: 'Contacted',
  replied: 'Replied',
  meeting: 'Meeting',
  pilot: 'Pilot',
  closed_won: 'Won',
  closed_lost: 'Lost',
  lost: 'Lost',
};

function formatCurrency(cents) {
  if (cents == null) return '$0';
  return '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function formatDollars(dollars) {
  if (dollars == null) return '$0';
  return '$' + parseFloat(dollars).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export default function RevenueDashboard() {
  const [funnel, setFunnel] = useState(null);
  const [hoaFunnel, setHoaFunnel] = useState(null);
  const [agents, setAgents] = useState([]);
  const [variants, setVariants] = useState([]);
  const [engagement, setEngagement] = useState([]);
  const [cycleTime, setCycleTime] = useState([]);
  const [contentPerf, setContentPerf] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('funnel');
  const [variantGroup, setVariantGroup] = useState('angle_type');

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const headers = {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
        'Content-Type': 'application/json',
      };
      const [f, hf, a, v, e, ct, cp] = await Promise.all([
        fetch('/api/revenue/funnel', { headers }).then(r => r.json()),
        fetch('/api/revenue/funnel/hoa', { headers }).then(r => r.json()),
        fetch('/api/revenue/agents', { headers }).then(r => r.json()),
        fetch(`/api/revenue/variants?group_by=${variantGroup}`, { headers }).then(r => r.json()),
        fetch('/api/revenue/engagement?limit=15', { headers }).then(r => r.json()),
        fetch('/api/revenue/cycle-time', { headers }).then(r => r.json()),
        fetch('/api/revenue/content', { headers }).then(r => r.json()),
      ]);
      setFunnel(f?.counts ? f : null);
      setHoaFunnel(hf?.counts ? hf : null);
      setAgents(Array.isArray(a) ? a : a?.agents || []);
      setVariants(Array.isArray(v) ? v : v?.variants || []);
      setEngagement(Array.isArray(e) ? e : e?.leads || []);
      setCycleTime(Array.isArray(ct) ? ct : ct?.stages || []);
      setContentPerf(cp?.error ? null : cp);
    } catch (err) {
      console.error('Revenue fetch failed:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchVariants = async (group) => {
    setVariantGroup(group);
    try {
      const headers = { 'Authorization': `Bearer ${localStorage.getItem('token')}` };
      const v = await fetch(`/api/revenue/variants?group_by=${group}`, { headers }).then(r => r.json());
      setVariants(v);
    } catch {}
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="animate-spin text-text-muted" size={24} />
        <span className="ml-2 text-text-muted">Loading revenue data...</span>
      </div>
    );
  }

  const funnelData = funnel?.counts ? [
    { name: 'Discovered', value: funnel.counts.discovered || 0, fill: STAGE_COLORS.discovered },
    { name: 'Contacted', value: funnel.counts.contacted || 0, fill: STAGE_COLORS.contacted },
    { name: 'Replied', value: funnel.counts.replied || 0, fill: STAGE_COLORS.replied },
    { name: 'Meeting', value: funnel.counts.meeting || 0, fill: STAGE_COLORS.meeting },
    { name: 'Pilot', value: funnel.counts.pilot || 0, fill: STAGE_COLORS.pilot },
    { name: 'Won', value: funnel.counts.closed_won || 0, fill: STAGE_COLORS.closed_won },
  ] : [];

  const tabs = [
    { id: 'funnel', label: 'Funnel', icon: BarChart3 },
    { id: 'content', label: 'Content', icon: TrendingUp },
    { id: 'agents', label: 'Agent ROI', icon: Users },
    { id: 'variants', label: 'A/B Testing', icon: Target },
    { id: 'engagement', label: 'Hot Leads', icon: Zap },
    { id: 'cycle', label: 'Cycle Time', icon: Clock },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-text-primary">Revenue Attribution</h1>
          <p className="text-text-muted">Discovery to dollars — every stage measured</p>
        </div>
        <button onClick={fetchAll} className="flex items-center gap-2 px-3 py-2 bg-bg-secondary border border-border rounded-lg hover:border-accent-primary/40 text-sm text-text-muted">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <KpiCard
          icon={DollarSign}
          label="Total Revenue"
          value={formatDollars(funnel?.totalRevenueDollars)}
          color="text-green-500"
        />
        <KpiCard
          icon={Target}
          label="Deals Won"
          value={funnel?.dealCount || 0}
          sub={`Avg ${formatDollars(funnel?.avgDealDollars)}`}
          color="text-green-500"
        />
        <KpiCard
          icon={Users}
          label="Total Leads"
          value={funnel?.counts ? Object.values(funnel.counts).reduce((a, b) => a + b, 0) : 0}
          sub={`+ ${hoaFunnel?.counts ? Object.values(hoaFunnel.counts).reduce((a, b) => a + b, 0) : 0} HOA`}
          color="text-blue-400"
        />
        <KpiCard
          icon={TrendingUp}
          label="Contact → Reply"
          value={`${funnel?.rates?.contacted_to_replied || 0}%`}
          color="text-purple-400"
        />
        <KpiCard
          icon={Zap}
          label="Reply → Meeting"
          value={`${funnel?.rates?.replied_to_meeting || 0}%`}
          color="text-yellow-400"
        />
        <KpiCard
          icon={Clock}
          label="Avg Days to Close"
          value={funnel?.avgDaysToClose ?? '—'}
          sub="days"
          color="text-orange-400"
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-bg-secondary border border-border rounded-lg p-1">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors ${
              activeTab === tab.id
                ? 'bg-accent-primary/20 text-accent-primary font-medium'
                : 'text-text-muted hover:text-text-primary'
            }`}
          >
            <tab.icon size={14} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'funnel' && <FunnelTab data={funnelData} funnel={funnel} hoaFunnel={hoaFunnel} />}
      {activeTab === 'content' && <ContentPerfTab data={contentPerf} />}
      {activeTab === 'agents' && <AgentROITab agents={agents} />}
      {activeTab === 'variants' && <VariantsTab variants={variants} group={variantGroup} onGroupChange={fetchVariants} />}
      {activeTab === 'engagement' && <EngagementTab leads={engagement} />}
      {activeTab === 'cycle' && <CycleTimeTab data={cycleTime} />}
    </div>
  );
}

// ─── KPI Card ────────────────────────────────────────────────────────────────

function KpiCard({ icon: Icon, label, value, sub, color = 'text-accent-primary' }) {
  return (
    <div className="p-4 bg-bg-secondary border border-border rounded-xl hover:border-accent-primary/40 transition-colors">
      <div className="flex items-center gap-2 mb-2">
        <Icon size={16} className={color} />
        <span className="text-xs text-text-muted uppercase tracking-wide">{label}</span>
      </div>
      <div className="text-2xl font-bold text-text-primary font-mono">{value ?? '—'}</div>
      {sub && <div className="text-xs text-text-muted mt-0.5">{sub}</div>}
    </div>
  );
}

// ─── Funnel Tab ──────────────────────────────────────────────────────────────

function FunnelTab({ data, funnel, hoaFunnel }) {
  return (
    <div className="space-y-6">
      {/* Funnel Visualization */}
      <div className="bg-bg-secondary border border-border rounded-xl p-6">
        <h2 className="text-sm font-semibold text-text-primary mb-4">Jake/CFO Pipeline Funnel</h2>
        {data.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis type="number" stroke="#94a3b8" fontSize={12} />
              <YAxis type="category" dataKey="name" stroke="#94a3b8" fontSize={12} width={80} />
              <Tooltip
                contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                labelStyle={{ color: '#e2e8f0' }}
                itemStyle={{ color: '#94a3b8' }}
              />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {data.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="text-center py-12 text-text-muted">No funnel data yet</div>
        )}
      </div>

      {/* Conversion Rates */}
      {funnel?.rates && (
        <div className="bg-bg-secondary border border-border rounded-xl p-6">
          <h2 className="text-sm font-semibold text-text-primary mb-4">Stage Conversion Rates</h2>
          <div className="flex flex-wrap gap-2">
            {Object.entries(funnel.rates).map(([key, rate]) => {
              const [from, , to] = key.split('_');
              return (
                <div key={key} className="flex items-center gap-2 px-3 py-2 bg-bg-elevated rounded-lg">
                  <span className="text-xs text-text-muted capitalize">{STAGE_LABELS[from] || from}</span>
                  <ArrowRight size={12} className="text-text-muted" />
                  <span className="text-xs text-text-muted capitalize">{STAGE_LABELS[to] || to}</span>
                  <span className={`text-sm font-bold font-mono ${rate >= 20 ? 'text-green-400' : rate >= 10 ? 'text-yellow-400' : 'text-red-400'}`}>
                    {rate}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* HOA Funnel Summary */}
      {hoaFunnel?.counts && (
        <div className="bg-bg-secondary border border-border rounded-xl p-6">
          <h2 className="text-sm font-semibold text-text-primary mb-3">HOA Pipeline</h2>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
            {['discovered', 'contacted', 'replied', 'meeting', 'pilot', 'closed_won'].map(stage => (
              <div key={stage} className="text-center">
                <div className="text-lg font-bold font-mono text-text-primary">{hoaFunnel.counts[stage] || 0}</div>
                <div className="text-xs text-text-muted capitalize">{STAGE_LABELS[stage]}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Agent ROI Tab ───────────────────────────────────────────────────────────

function AgentROITab({ agents }) {
  return (
    <div className="bg-bg-secondary border border-border rounded-xl p-6">
      <h2 className="text-sm font-semibold text-text-primary mb-4">Revenue by Agent</h2>
      {agents.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 text-text-muted font-medium">Agent</th>
                <th className="text-right py-2 text-text-muted font-medium">Events</th>
                <th className="text-right py-2 text-text-muted font-medium">Deals</th>
                <th className="text-right py-2 text-text-muted font-medium">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((a, i) => (
                <tr key={i} className="border-b border-border/50 hover:bg-bg-elevated/50">
                  <td className="py-2 text-text-primary font-mono text-xs">{a.agent_name}</td>
                  <td className="py-2 text-right text-text-muted font-mono">{a.events}</td>
                  <td className="py-2 text-right text-text-primary font-mono font-bold">{a.deals}</td>
                  <td className="py-2 text-right font-mono font-bold text-green-400">
                    {formatCurrency(a.revenue_cents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-12 text-text-muted">No agent revenue data yet. Deals will appear here as they close.</div>
      )}
    </div>
  );
}

// ─── A/B Variants Tab ────────────────────────────────────────────────────────

function VariantsTab({ variants, group, onGroupChange }) {
  const groupOptions = [
    { value: 'angle_type', label: 'Angle' },
    { value: 'tone', label: 'Tone' },
    { value: 'personalization_level', label: 'Personalization' },
    { value: 'template_name', label: 'Template' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-sm text-text-muted">Group by:</span>
        {groupOptions.map(opt => (
          <button
            key={opt.value}
            onClick={() => onGroupChange(opt.value)}
            className={`px-3 py-1 rounded-md text-xs ${
              group === opt.value
                ? 'bg-accent-primary/20 text-accent-primary'
                : 'bg-bg-secondary text-text-muted hover:text-text-primary'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="bg-bg-secondary border border-border rounded-xl p-6">
        <h2 className="text-sm font-semibold text-text-primary mb-4">Outreach Performance by {groupOptions.find(o => o.value === group)?.label}</h2>
        {variants.length > 0 ? (
          <>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={variants}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="variant" stroke="#94a3b8" fontSize={11} angle={-20} textAnchor="end" height={60} />
                <YAxis stroke="#94a3b8" fontSize={12} />
                <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }} />
                <Bar dataKey="reply_rate" name="Reply %" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="conversion_rate" name="Convert %" fill="#22c55e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>

            <div className="overflow-x-auto mt-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 text-text-muted font-medium">Variant</th>
                    <th className="text-right py-2 text-text-muted font-medium">Sent</th>
                    <th className="text-right py-2 text-text-muted font-medium">Opens</th>
                    <th className="text-right py-2 text-text-muted font-medium">Replies</th>
                    <th className="text-right py-2 text-text-muted font-medium">Reply %</th>
                    <th className="text-right py-2 text-text-muted font-medium">Converts</th>
                    <th className="text-right py-2 text-text-muted font-medium">Conv %</th>
                  </tr>
                </thead>
                <tbody>
                  {variants.map((v, i) => (
                    <tr key={i} className="border-b border-border/50">
                      <td className="py-2 text-text-primary">{v.variant || '(none)'}</td>
                      <td className="py-2 text-right font-mono text-text-muted">{v.sent}</td>
                      <td className="py-2 text-right font-mono text-text-muted">{v.opens}</td>
                      <td className="py-2 text-right font-mono text-text-primary">{v.replies}</td>
                      <td className="py-2 text-right font-mono font-bold text-purple-400">{v.reply_rate}%</td>
                      <td className="py-2 text-right font-mono text-text-primary">{v.conversions}</td>
                      <td className="py-2 text-right font-mono font-bold text-green-400">{v.conversion_rate}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="text-center py-12 text-text-muted">No variant data yet. Send outreach to start tracking A/B performance.</div>
        )}
      </div>
    </div>
  );
}

// ─── Engagement Tab ──────────────────────────────────────────────────────────

function EngagementTab({ leads }) {
  return (
    <div className="bg-bg-secondary border border-border rounded-xl p-6">
      <h2 className="text-sm font-semibold text-text-primary mb-4">Hottest Leads by Engagement</h2>
      {leads.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 text-text-muted font-medium">Company</th>
                <th className="text-left py-2 text-text-muted font-medium">Contact</th>
                <th className="text-right py-2 text-text-muted font-medium">Engagement</th>
                <th className="text-right py-2 text-text-muted font-medium">Urgency</th>
                <th className="text-left py-2 text-text-muted font-medium">Stage</th>
                <th className="text-left py-2 text-text-muted font-medium">Last Active</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((l, i) => (
                <tr key={i} className="border-b border-border/50 hover:bg-bg-elevated/50">
                  <td className="py-2 text-text-primary font-medium">{l.company_name}</td>
                  <td className="py-2 text-text-muted text-xs">{l.contact_name || l.contact_email}</td>
                  <td className="py-2 text-right">
                    <span className={`font-mono font-bold ${l.engagement_score >= 50 ? 'text-green-400' : l.engagement_score >= 25 ? 'text-yellow-400' : 'text-text-muted'}`}>
                      {l.engagement_score}
                    </span>
                  </td>
                  <td className="py-2 text-right font-mono text-text-muted">{l.urgency_score || '—'}</td>
                  <td className="py-2">
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium"
                      style={{ background: `${STAGE_COLORS[l.revenue_stage] || '#6b7280'}22`, color: STAGE_COLORS[l.revenue_stage] || '#6b7280' }}>
                      {STAGE_LABELS[l.revenue_stage] || l.revenue_stage}
                    </span>
                  </td>
                  <td className="py-2 text-text-muted text-xs">
                    {l.last_engaged_at ? new Date(l.last_engaged_at).toLocaleDateString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-12 text-text-muted">No engagement data yet. Scores build as emails are opened and clicked.</div>
      )}
    </div>
  );
}

// ─── Cycle Time Tab ──────────────────────────────────────────────────────────

function CycleTimeTab({ data }) {
  return (
    <div className="bg-bg-secondary border border-border rounded-xl p-6">
      <h2 className="text-sm font-semibold text-text-primary mb-4">Average Time in Each Stage</h2>
      {data.length > 0 ? (
        <>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="revenue_stage" stroke="#94a3b8" fontSize={12}
                tickFormatter={(v) => STAGE_LABELS[v] || v} />
              <YAxis stroke="#94a3b8" fontSize={12} label={{ value: 'Days', angle: -90, position: 'insideLeft', style: { fill: '#94a3b8' } }} />
              <Tooltip
                contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                formatter={(value, name) => [`${value} days`, name === 'avg_days_in_stage' ? 'Avg Days' : name]}
                labelFormatter={(v) => STAGE_LABELS[v] || v}
              />
              <Bar dataKey="avg_days_in_stage" name="Avg Days" fill="#f59e0b" radius={[4, 4, 0, 0]}>
                {data.map((entry, i) => (
                  <Cell key={i} fill={STAGE_COLORS[entry.revenue_stage] || '#6b7280'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-4">
            {data.map((d, i) => (
              <div key={i} className="text-center p-3 bg-bg-elevated rounded-lg">
                <div className="text-lg font-bold font-mono text-text-primary">{d.avg_days_in_stage || 0}d</div>
                <div className="text-xs text-text-muted capitalize">{STAGE_LABELS[d.revenue_stage] || d.revenue_stage}</div>
                <div className="text-xs text-text-muted opacity-60">{d.leads} leads</div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="text-center py-12 text-text-muted">Cycle time data appears as leads move through stages.</div>
      )}
    </div>
  );
}

// ─── Content Performance Tab ─────────────────────────────────────────────────

function ContentPerfTab({ data }) {
  if (!data) return <div className="text-center py-12 text-text-muted">Loading content data...</div>;

  return (
    <div className="space-y-6">
      {/* Pillar Performance */}
      {data.pillarStats?.length > 0 && (
        <div className="bg-bg-secondary border border-border rounded-xl p-6">
          <h2 className="text-sm font-semibold text-text-primary mb-4">Content Pillar Performance</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.pillarStats}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="pillar" stroke="#94a3b8" fontSize={11} />
              <YAxis stroke="#94a3b8" fontSize={12} />
              <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }} />
              <Bar dataKey="avg_score" name="Avg Score" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
              <Bar dataKey="total_leads" name="Total Leads" fill="#22c55e" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Top Posts */}
      <div className="bg-bg-secondary border border-border rounded-xl p-6">
        <h2 className="text-sm font-semibold text-text-primary mb-4">Published Content — Ranked by Performance</h2>
        {data.posts?.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 text-text-muted font-medium">Title</th>
                  <th className="text-right py-2 text-text-muted font-medium">Score</th>
                  <th className="text-right py-2 text-text-muted font-medium">Leads</th>
                  <th className="text-right py-2 text-text-muted font-medium">Clicks</th>
                  <th className="text-right py-2 text-text-muted font-medium">Social</th>
                  <th className="text-left py-2 text-text-muted font-medium">Keyword</th>
                  <th className="text-left py-2 text-text-muted font-medium">Pillar</th>
                </tr>
              </thead>
              <tbody>
                {data.posts.map((p, i) => (
                  <tr key={i} className="border-b border-border/50 hover:bg-bg-elevated/50">
                    <td className="py-2 text-text-primary text-xs max-w-xs truncate">{p.title}</td>
                    <td className="py-2 text-right">
                      <span className={`font-mono font-bold ${(p.performance_score || 0) >= 30 ? 'text-green-400' : (p.performance_score || 0) > 0 ? 'text-yellow-400' : 'text-text-muted'}`}>
                        {p.performance_score ?? '—'}
                      </span>
                    </td>
                    <td className="py-2 text-right font-mono text-text-primary">{p.leads_generated || 0}</td>
                    <td className="py-2 text-right font-mono text-text-muted">{p.email_clicks || 0}</td>
                    <td className="py-2 text-right font-mono text-text-muted">{p.social_shares || 0}</td>
                    <td className="py-2 text-text-muted text-xs">{p.target_keyword || '—'}</td>
                    <td className="py-2">
                      {p.pillar && (
                        <span className="px-2 py-0.5 rounded-full text-xs bg-accent-primary/10 text-accent-primary">
                          {p.pillar}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12 text-text-muted">No published content yet. Content writers will produce posts on schedule.</div>
        )}
      </div>

      {/* Learnings */}
      {data.learnings?.length > 0 && (
        <div className="bg-bg-secondary border border-border rounded-xl p-6">
          <h2 className="text-sm font-semibold text-text-primary mb-4">System Learnings</h2>
          <div className="space-y-2">
            {data.learnings.map((l, i) => (
              <div key={i} className="flex items-start gap-3 p-3 bg-bg-elevated rounded-lg">
                <span className={`mt-0.5 px-1.5 py-0.5 rounded text-xs font-mono ${
                  l.confidence >= 0.8 ? 'bg-green-500/20 text-green-400' :
                  l.confidence >= 0.6 ? 'bg-yellow-500/20 text-yellow-400' :
                  'bg-gray-500/20 text-gray-400'
                }`}>
                  {Math.round(l.confidence * 100)}%
                </span>
                <div>
                  <div className="text-sm text-text-primary">{l.summary}</div>
                  <div className="text-xs text-text-muted mt-0.5">{l.learning_type} — {new Date(l.created_at).toLocaleDateString()}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Calendar Status */}
      {data.calendarStats?.length > 0 && (
        <div className="bg-bg-secondary border border-border rounded-xl p-6">
          <h2 className="text-sm font-semibold text-text-primary mb-4">Content Calendar</h2>
          <div className="flex gap-4">
            {data.calendarStats.map((s, i) => (
              <div key={i} className="text-center p-3 bg-bg-elevated rounded-lg">
                <div className="text-lg font-bold font-mono text-text-primary">{s.n}</div>
                <div className="text-xs text-text-muted capitalize">{s.status}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
