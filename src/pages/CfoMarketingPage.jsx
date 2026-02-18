/**
 * @file CfoMarketingPage.jsx
 * @description CFO AI Suite Marketing System dashboard
 *
 * Phase 0: Find $10M-$75M construction companies using Vista/Sage300/QBE,
 * generate Steve-voice content, draft personalized pilot outreach emails.
 *
 * Tabs: Leads | Content | Outreach
 * Connects to: /api/cfo-marketing/*
 */

import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';

async function fetchApi(path, opts = {}) {
  if (opts.method === 'PUT' || opts.method === 'put') {
    return api.put(path, opts.body ? JSON.parse(opts.body) : undefined);
  }
  if (opts.method === 'POST' || opts.method === 'post') {
    return api.post(path, opts.body ? JSON.parse(opts.body) : undefined);
  }
  return api.get(path);
}

// ── Style helpers ─────────────────────────────────────────────────

const ERP_COLORS = {
  Vista: 'background:#1a2a1a;color:#4ade80;border:1px solid #166534',
  Sage300: 'background:#1a1f2e;color:#60a5fa;border:1px solid #1e3a5f',
  QBE: 'background:#2a1a2a;color:#c084fc;border:1px solid #581c87',
  Unknown: 'background:#1a1a1a;color:#6b7280;border:1px solid #374151',
};

const STATUS_COLORS = {
  new: '#6b7280',
  contacted: '#3b82f6',
  replied: '#f59e0b',
  pilot: '#10b981',
  closed_won: '#22c55e',
  closed_lost: '#ef4444',
};

function ScoreBadge({ score }) {
  const color = score >= 70 ? '#22c55e' : score >= 40 ? '#f59e0b' : '#6b7280';
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: 999,
      fontSize: 11,
      fontWeight: 700,
      background: color + '22',
      color,
      border: `1px solid ${color}55`,
    }}>
      {score}
    </span>
  );
}

function ErpChip({ erp }) {
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: 4,
      fontSize: 11,
      fontWeight: 600,
      ...(ERP_COLORS[erp] ? Object.fromEntries(ERP_COLORS[erp].split(';').map(s => {
        const [k, v] = s.split(':');
        return [k.trim().replace(/-([a-z])/g, (_, c) => c.toUpperCase()), v?.trim()];
      }).filter(([k]) => k)) : {}),
    }}>
      {erp || '?'}
    </span>
  );
}

function StatCard({ label, value, sub, color = '#f97316' }) {
  return (
    <div style={{
      background: '#111',
      border: '1px solid #222',
      borderRadius: 10,
      padding: '20px 24px',
      minWidth: 130,
      flex: 1,
    }}>
      <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.8px', color: '#666', marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color, lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: '#555', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function RunAgentButton({ agentId, agentName, message, onComplete }) {
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState('');

  async function runAgent() {
    setRunning(true);
    setStatus('Starting...');
    try {
      // POST to trigger run
      const startRes = await fetchApi(`/agents/${agentId}/run`, {
        method: 'POST',
        body: JSON.stringify({ message: JSON.stringify(message || {}) }),
      });

      if (startRes.runId) {
        setStatus('Running...');
        // Confirm run
        await fetchApi(`/runs/${startRes.runId}/confirm`, { method: 'POST' });
        setStatus('Complete!');
        setTimeout(() => { setStatus(''); onComplete && onComplete(); }, 2000);
      } else {
        setStatus('Error: ' + (startRes.error || 'unknown'));
      }
    } catch (e) {
      setStatus('Error: ' + e.message);
    }
    setRunning(false);
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <button
        onClick={runAgent}
        disabled={running}
        style={{
          padding: '8px 16px',
          background: running ? '#1a1a1a' : '#1a3a1a',
          color: running ? '#555' : '#4ade80',
          border: `1px solid ${running ? '#333' : '#166534'}`,
          borderRadius: 6,
          fontSize: 13,
          fontWeight: 600,
          cursor: running ? 'not-allowed' : 'pointer',
        }}
      >
        {running ? '⏳ Running...' : `▶ Run ${agentName}`}
      </button>
      {status && <span style={{ fontSize: 12, color: '#888' }}>{status}</span>}
    </div>
  );
}

// ── Leads Tab ─────────────────────────────────────────────────────

function LeadsTab({ leads, stats, onRefresh, onStatusChange }) {
  const [filterStatus, setFilterStatus] = useState('');
  const [filterErp, setFilterErp] = useState('');
  const [editingId, setEditingId] = useState(null);

  const filtered = leads.filter(l =>
    (!filterStatus || l.status === filterStatus) &&
    (!filterErp || l.erp_type === filterErp)
  );

  async function updateStatus(id, status) {
    await fetchApi(`/cfo-marketing/leads/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    });
    onStatusChange && onStatusChange();
  }

  return (
    <div>
      {/* Stats row */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <StatCard label="Total Leads" value={stats?.total_leads || 0} />
        <StatCard label="New" value={stats?.pipeline?.new || 0} color="#6b7280" />
        <StatCard label="Contacted" value={stats?.pipeline?.contacted || 0} color="#3b82f6" />
        <StatCard label="Replied" value={stats?.pipeline?.replied || 0} color="#f59e0b" />
        <StatCard label="Pilots" value={stats?.pipeline?.pilot || 0} color="#10b981" />
        <StatCard label="Pipeline Value" value={`$${((stats?.pilot_pipeline_value || 0) / 1000).toFixed(1)}k`} color="#22c55e" sub="est. at $490 avg" />
      </div>

      {/* Run Scout + Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <RunAgentButton
          agentId="cfo-lead-scout"
          agentName="Lead Scout"
          message={{ erp_type: 'all', limit: 30 }}
          onComplete={onRefresh}
        />
        <select
          value={filterErp}
          onChange={e => setFilterErp(e.target.value)}
          style={{ background: '#111', color: '#aaa', border: '1px solid #333', borderRadius: 6, padding: '6px 10px', fontSize: 13 }}
        >
          <option value="">All ERPs</option>
          <option value="Vista">Vista</option>
          <option value="Sage300">Sage 300</option>
          <option value="QBE">QBE</option>
        </select>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          style={{ background: '#111', color: '#aaa', border: '1px solid #333', borderRadius: 6, padding: '6px 10px', fontSize: 13 }}
        >
          <option value="">All Statuses</option>
          <option value="new">New</option>
          <option value="contacted">Contacted</option>
          <option value="replied">Replied</option>
          <option value="pilot">Pilot</option>
          <option value="closed_won">Won</option>
          <option value="closed_lost">Lost</option>
        </select>
        <span style={{ color: '#555', fontSize: 13 }}>{filtered.length} leads</span>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#555' }}>
          No leads yet. Run Lead Scout to find $10M-$75M construction companies using Vista/Sage300/QBE.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #222' }}>
                {['Score', 'Company', 'ERP', 'State', 'Contact', 'Status', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: '#555', fontWeight: 600, fontSize: 11, textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(lead => (
                <tr key={lead.id} style={{ borderBottom: '1px solid #1a1a1a' }}>
                  <td style={{ padding: '10px 12px' }}><ScoreBadge score={lead.pilot_fit_score} /></td>
                  <td style={{ padding: '10px 12px' }}>
                    <div style={{ fontWeight: 600, color: '#e0e0e0' }}>{lead.company_name}</div>
                    {lead.website && <div style={{ fontSize: 11, color: '#555', marginTop: 2 }}>{lead.website.replace(/^https?:\/\//, '').split('/')[0]}</div>}
                    {lead.pilot_fit_reason && <div style={{ fontSize: 11, color: '#4a4a4a', marginTop: 2 }}>{lead.pilot_fit_reason}</div>}
                  </td>
                  <td style={{ padding: '10px 12px' }}><ErpChip erp={lead.erp_type} /></td>
                  <td style={{ padding: '10px 12px', color: '#888' }}>{lead.state || '—'}</td>
                  <td style={{ padding: '10px 12px', color: '#888' }}>
                    {lead.contact_name ? (
                      <div>
                        <div style={{ color: '#ccc' }}>{lead.contact_name}</div>
                        <div style={{ fontSize: 11, color: '#666' }}>{lead.contact_title}</div>
                      </div>
                    ) : '—'}
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <select
                      value={lead.status}
                      onChange={e => updateStatus(lead.id, e.target.value)}
                      style={{
                        background: '#111',
                        color: STATUS_COLORS[lead.status] || '#888',
                        border: `1px solid ${STATUS_COLORS[lead.status] || '#333'}55`,
                        borderRadius: 4,
                        padding: '4px 8px',
                        fontSize: 12,
                        fontWeight: 600,
                      }}
                    >
                      {['new', 'contacted', 'replied', 'pilot', 'closed_won', 'closed_lost'].map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <RunAgentButton
                      agentId="cfo-outreach-agent"
                      agentName="Draft Email"
                      message={{ lead_id: lead.id, company_name: lead.company_name, erp_type: lead.erp_type }}
                      onComplete={onRefresh}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Content Tab ────────────────────────────────────────────────────

function ContentTab({ pieces, onRefresh }) {
  const [filterStatus, setFilterStatus] = useState('');

  const filtered = pieces.filter(p => !filterStatus || p.status === filterStatus);

  async function updateContentStatus(id, status) {
    await fetchApi(`/cfo-marketing/content/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    });
    onRefresh();
  }

  const STATUS_STYLE = {
    draft: { bg: '#1a1a2e', color: '#60a5fa', border: '#1e3a5f' },
    approved: { bg: '#1a2a1a', color: '#4ade80', border: '#166534' },
    published: { bg: '#0d2818', color: '#22c55e', border: '#14532d' },
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <RunAgentButton
          agentId="cfo-content-engine"
          agentName="Content Engine"
          message={{ pillar: 'cash_flow', channel: 'linkedin' }}
          onComplete={onRefresh}
        />
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          style={{ background: '#111', color: '#aaa', border: '1px solid #333', borderRadius: 6, padding: '6px 10px', fontSize: 13 }}
        >
          <option value="">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="approved">Approved</option>
          <option value="published">Published</option>
        </select>
        <span style={{ color: '#555', fontSize: 13 }}>{filtered.length} pieces</span>
      </div>

      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#555' }}>
          No content yet. Run Content Engine to generate Steve-voice LinkedIn posts.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filtered.map(piece => {
            const s = STATUS_STYLE[piece.status] || STATUS_STYLE.draft;
            return (
              <div key={piece.id} style={{ background: '#111', border: '1px solid #222', borderRadius: 8, padding: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div>
                    <div style={{ fontWeight: 600, color: '#e0e0e0', fontSize: 15 }}>{piece.title || '(untitled)'}</div>
                    <div style={{ fontSize: 12, color: '#555', marginTop: 4 }}>
                      {piece.pillar} · {piece.channel} · {piece.created_at?.split('T')[0]}
                    </div>
                  </div>
                  <span style={{
                    padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600,
                    background: s.bg, color: s.color, border: `1px solid ${s.border}`,
                  }}>
                    {piece.status}
                  </span>
                </div>
                {piece.cta && <div style={{ fontSize: 13, color: '#888', marginBottom: 12 }}>CTA: {piece.cta}</div>}
                <div style={{ display: 'flex', gap: 8 }}>
                  {piece.status === 'draft' && (
                    <button
                      onClick={() => updateContentStatus(piece.id, 'approved')}
                      style={{ padding: '6px 14px', background: '#1a2a1a', color: '#4ade80', border: '1px solid #166534', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                    >
                      ✓ Approve
                    </button>
                  )}
                  {piece.status === 'approved' && (
                    <button
                      onClick={() => updateContentStatus(piece.id, 'published')}
                      style={{ padding: '6px 14px', background: '#0d2818', color: '#22c55e', border: '1px solid #14532d', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                    >
                      ↑ Mark Published
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Outreach Tab ───────────────────────────────────────────────────

function OutreachTab({ sequences, onRefresh }) {
  const [filterStatus, setFilterStatus] = useState('draft');

  const filtered = sequences.filter(s => !filterStatus || s.status === filterStatus);

  async function updateSequenceStatus(id, status) {
    await fetchApi(`/cfo-marketing/outreach/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    });
    onRefresh();
  }

  const OFFER_LABELS = {
    spend_leak: 'Spend Leak Finder',
    close_acceleration: 'Close Acceleration',
    get_paid_faster: 'Get Paid Faster',
  };

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          style={{ background: '#111', color: '#aaa', border: '1px solid #333', borderRadius: 6, padding: '6px 10px', fontSize: 13 }}
        >
          <option value="">All</option>
          <option value="draft">Draft</option>
          <option value="approved">Approved</option>
          <option value="sent">Sent</option>
          <option value="replied">Replied</option>
        </select>
        <span style={{ color: '#555', fontSize: 13 }}>{filtered.length} emails</span>
        <span style={{ color: '#444', fontSize: 12 }}>Tip: Approve from the Leads tab or use the Outreach Agent.</span>
      </div>

      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#555' }}>
          No outreach drafts yet. Run the Outreach Agent from any lead row.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filtered.map(seq => (
            <div key={seq.id} style={{ background: '#111', border: '1px solid #222', borderRadius: 8, padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div>
                  <div style={{ fontWeight: 600, color: '#e0e0e0' }}>{seq.company_name || `Lead #${seq.lead_id}`}</div>
                  <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                    {seq.contact_name} · <ErpChip erp={seq.erp_type} /> · <ScoreBadge score={seq.pilot_fit_score || 0} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexDirection: 'column', alignItems: 'flex-end' }}>
                  <span style={{
                    padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600,
                    background: seq.status === 'draft' ? '#1a1f2e' : seq.status === 'sent' ? '#0d2818' : '#1a1a1a',
                    color: seq.status === 'draft' ? '#60a5fa' : seq.status === 'sent' ? '#22c55e' : '#888',
                    border: `1px solid ${seq.status === 'draft' ? '#1e3a5f' : seq.status === 'sent' ? '#14532d' : '#333'}`,
                  }}>
                    {seq.status}
                  </span>
                  {seq.pilot_offer && (
                    <span style={{ fontSize: 11, color: '#f59e0b' }}>{OFFER_LABELS[seq.pilot_offer] || seq.pilot_offer}</span>
                  )}
                </div>
              </div>

              <div style={{ fontWeight: 600, color: '#aaa', marginBottom: 6, fontSize: 13 }}>
                Subject: {seq.email_subject}
              </div>
              <div style={{ fontSize: 12, color: '#666', whiteSpace: 'pre-wrap', lineHeight: 1.6, maxHeight: 120, overflow: 'hidden', marginBottom: 12 }}>
                {seq.email_body?.substring(0, 300)}{seq.email_body?.length > 300 ? '...' : ''}
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                {seq.status === 'draft' && (
                  <>
                    <button
                      onClick={() => updateSequenceStatus(seq.id, 'approved')}
                      style={{ padding: '6px 14px', background: '#1a2a1a', color: '#4ade80', border: '1px solid #166534', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                    >
                      ✓ Approve
                    </button>
                  </>
                )}
                {seq.status === 'approved' && (
                  <button
                    onClick={() => updateSequenceStatus(seq.id, 'sent')}
                    style={{ padding: '6px 14px', background: '#0d2818', color: '#22c55e', border: '1px solid #14532d', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                  >
                    ↑ Mark Sent
                  </button>
                )}
                {seq.status === 'sent' && (
                  <button
                    onClick={() => updateSequenceStatus(seq.id, 'replied')}
                    style={{ padding: '6px 14px', background: '#1a1a2e', color: '#60a5fa', border: '1px solid #1e3a5f', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                  >
                    ↩ Got Reply
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────

export default function CfoMarketingPage() {
  const [tab, setTab] = useState('leads');
  const [leads, setLeads] = useState([]);
  const [stats, setStats] = useState(null);
  const [content, setContent] = useState([]);
  const [outreach, setOutreach] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [leadsData, statsData, contentData, outreachData] = await Promise.all([
        fetchApi('/cfo-marketing/leads?limit=200'),
        fetchApi('/cfo-marketing/leads/stats'),
        fetchApi('/cfo-marketing/content?limit=50'),
        fetchApi('/cfo-marketing/outreach?limit=50'),
      ]);
      setLeads(leadsData.leads || []);
      setStats(statsData);
      setContent(contentData.pieces || []);
      setOutreach(outreachData.sequences || []);
    } catch (e) {
      console.error('CFO Marketing load error:', e);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const TABS = [
    { id: 'leads', label: `Leads (${leads.length})` },
    { id: 'content', label: `Content (${content.length})` },
    { id: 'outreach', label: `Outreach (${outreach.filter(s => s.status === 'draft').length} drafts)` },
  ];

  return (
    <div style={{ background: '#0a0a0a', minHeight: '100vh', color: '#e0e0e0', fontFamily: 'monospace' }}>
      {/* Header */}
      <div style={{ borderBottom: '1px solid #1a1a1a', padding: '20px 32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: '#fff', margin: 0 }}>
              CFO AI Suite Marketing
            </h1>
            <div style={{ fontSize: 13, color: '#555', marginTop: 4 }}>
              Phase 0 Blitz: Find $10M–$75M construction companies using Vista / Sage 300 / QBE
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ textAlign: 'right', fontSize: 12, color: '#555' }}>
              <div>Spend Leak Finder: $490–$2,500</div>
              <div>Close Acceleration: $950–$5,000</div>
              <div>Get Paid Faster: $750–$3,000</div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #1a1a1a', padding: '0 32px' }}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: '12px 20px',
              background: 'none',
              border: 'none',
              borderBottom: `2px solid ${tab === t.id ? '#f97316' : 'transparent'}`,
              color: tab === t.id ? '#f97316' : '#666',
              fontSize: 14,
              fontWeight: tab === t.id ? 600 : 400,
              cursor: 'pointer',
              fontFamily: 'monospace',
            }}
          >
            {t.label}
          </button>
        ))}
        <button
          onClick={loadAll}
          style={{
            marginLeft: 'auto',
            alignSelf: 'center',
            padding: '6px 14px',
            background: '#111',
            border: '1px solid #333',
            borderRadius: 6,
            color: '#666',
            fontSize: 12,
            cursor: 'pointer',
            fontFamily: 'monospace',
          }}
        >
          ↻ Refresh
        </button>
      </div>

      {/* Content */}
      <div style={{ padding: 32 }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#555' }}>Loading...</div>
        ) : (
          <>
            {tab === 'leads' && (
              <LeadsTab leads={leads} stats={stats} onRefresh={loadAll} onStatusChange={loadAll} />
            )}
            {tab === 'content' && (
              <ContentTab pieces={content} onRefresh={loadAll} />
            )}
            {tab === 'outreach' && (
              <OutreachTab sequences={outreach} onRefresh={loadAll} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
