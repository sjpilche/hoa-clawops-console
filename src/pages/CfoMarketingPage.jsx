/**
 * @file CfoMarketingPage.jsx
 * @description Jake Marketing Pipeline — workflow-oriented CRM for construction CFO outreach
 *
 * Layout: Funnel → Actions → Leads Table → Outreach Queue → Content Library
 * Flow: Discover → Enrich → Draft → Approve → Send → Track
 * Connects to: /api/cfo-marketing/*
 */

import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import { useWorkspace } from '../context/WorkspaceContext';

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

const STATUS_COLORS = {
  new: '#6b7280', contacted: '#3b82f6', replied: '#f59e0b',
  pilot: '#10b981', closed_won: '#22c55e', closed_lost: '#ef4444',
};

const ENRICHMENT_COLORS = {
  pending: { bg: '#1a1a1a', color: '#6b7280', border: '#333' },
  in_progress: { bg: '#1a1a2e', color: '#60a5fa', border: '#1e3a5f' },
  enriched: { bg: '#1a2a1a', color: '#4ade80', border: '#166534' },
  partial: { bg: '#2a2a1a', color: '#f59e0b', border: '#92400e' },
  failed: { bg: '#2a1a1a', color: '#ef4444', border: '#991b1b' },
};

function ScoreBadge({ score }) {
  const color = score >= 70 ? '#22c55e' : score >= 40 ? '#f59e0b' : '#6b7280';
  return (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: color + '22', color, border: `1px solid ${color}55` }}>
      {score}
    </span>
  );
}

function ErpChip({ erp }) {
  const colors = { Vista: '#4ade80', Sage300: '#60a5fa', QBE: '#c084fc' };
  const c = colors[erp] || '#6b7280';
  return (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: c + '15', color: c, border: `1px solid ${c}33` }}>
      {erp || '?'}
    </span>
  );
}

function SourceBadge({ source }) {
  const colors = { jake: { color: '#818cf8', border: '#312e81' }, cfo: { color: '#4ade80', border: '#166534' }, 'data-rehab': { color: '#c4391a', border: '#7f1d1d' } };
  const s = colors[source] || { color: '#888', border: '#333' };
  return (
    <span style={{ display: 'inline-block', padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', background: s.color + '15', color: s.color, border: `1px solid ${s.border}` }}>
      {source || '?'}
    </span>
  );
}

// ── Data Rehab Tier Badge ─────────────────────────────────────────
const TIER_COLORS = {
  autopsy: { color: '#f59e0b', border: '#92400e', label: 'Autopsy $5K' },
  lite: { color: '#60a5fa', border: '#1e3a5f', label: 'Lite $15K' },
  core: { color: '#8b5cf6', border: '#4c1d95', label: 'Core $25K' },
  complex: { color: '#ec4899', border: '#831843', label: 'Complex $40K' },
};

function classifyTier(lead) {
  // Tier based on company signals: system count, entity count, employee count, pain keywords
  const systems = (lead.erp_type || '').split(/[,+\/&]/).filter(Boolean).length || 1;
  const employees = parseInt(lead.employee_count) || 0;
  const pain = (lead.pain_signals || lead.notes || '').toLowerCase();
  const multiEntity = pain.includes('multi-entity') || pain.includes('multiple entities') || pain.includes('multi-location');

  if (systems >= 4 || multiEntity || employees > 200) return 'complex';
  if (systems >= 2 || employees > 50 || pain.includes('reconciliation') || pain.includes('migration')) return 'core';
  if (lead.status === 'new' || !lead.contact_email) return 'autopsy';
  return 'lite';
}

function TierBadge({ lead }) {
  const tier = classifyTier(lead);
  const t = TIER_COLORS[tier];
  return (
    <span style={{ display: 'inline-block', padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: t.color + '15', color: t.color, border: `1px solid ${t.border}` }}>
      {t.label}
    </span>
  );
}

function RunAgentButton({ agentId, agentName, message, onComplete, style: btnStyle }) {
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState('');

  async function runAgent() {
    setRunning(true);
    setStatus('Starting...');
    try {
      const startRes = await fetchApi(`/agents/${agentId}/run`, {
        method: 'POST',
        body: JSON.stringify({ message: JSON.stringify(message || {}) }),
      });
      if (startRes.runId) {
        setStatus('Running...');
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
      <button onClick={runAgent} disabled={running} style={{
        padding: '8px 16px', background: running ? '#1a1a1a' : '#1a3a1a', color: running ? '#555' : '#4ade80',
        border: `1px solid ${running ? '#333' : '#166534'}`, borderRadius: 6, fontSize: 13, fontWeight: 600,
        cursor: running ? 'not-allowed' : 'pointer', ...btnStyle,
      }}>
        {running ? '...' : `${agentName}`}
      </button>
      {status && <span style={{ fontSize: 12, color: '#888' }}>{status}</span>}
    </div>
  );
}

// ── Tone Options ──────────────────────────────────────────────────

const TONE_OPTIONS = [
  { value: 'ai-curious-cfo', label: 'AI-curious CFO', desc: 'For CFOs who know their data is messy and are wondering if AI agents could help.' },
  { value: 'peer-frustrated', label: 'Jake peer', desc: 'Blue-collar, 2am spreadsheet energy. CFO to CFO.' },
  { value: 'steve-credible', label: 'Steve data', desc: 'Named operator, hard numbers, Trust Envelope.' },
  { value: 'curious-question', label: 'Question', desc: 'Opens with a question. Low pressure.' },
  { value: 'short-punch', label: '3-line', desc: 'Hook, pain, CTA. Nothing else.' },
];

// ── Funnel Bar ────────────────────────────────────────────────────

const FUNNEL_STAGES = [
  { key: 'needs_enrichment', label: 'Needs Email', color: '#ef4444' },
  { key: 'enriched', label: 'Ready', color: '#f59e0b' },
  { key: 'has_draft', label: 'Drafted', color: '#60a5fa' },
  { key: 'has_approved', label: 'Approved', color: '#818cf8' },
  { key: 'contacted', label: 'Sent', color: '#22c55e' },
  { key: 'replied', label: 'Replied', color: '#fbbf24' },
  { key: 'pilot', label: 'Pilot', color: '#10b981' },
  { key: 'closed_won', label: 'Won', color: '#4ade80' },
];

function FunnelBar({ funnel, activeStage, onStageClick }) {
  return (
    <div style={{ display: 'flex', gap: 4, marginBottom: 20, flexWrap: 'wrap' }}>
      <button
        onClick={() => onStageClick(null)}
        style={{
          padding: '8px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'monospace',
          border: `1px solid ${!activeStage ? '#f97316' : '#333'}`,
          background: !activeStage ? '#f9731622' : '#111',
          color: !activeStage ? '#f97316' : '#666',
        }}
      >
        All ({funnel?.total || 0})
      </button>
      {FUNNEL_STAGES.map(stage => {
        const count = funnel?.[stage.key] || 0;
        const active = activeStage === stage.key;
        return (
          <button
            key={stage.key}
            onClick={() => onStageClick(active ? null : stage.key)}
            style={{
              padding: '8px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'monospace',
              border: `1px solid ${active ? stage.color : '#222'}`,
              background: active ? stage.color + '22' : '#0d0d0d',
              color: active ? stage.color : count > 0 ? '#888' : '#333',
              opacity: count === 0 && !active ? 0.5 : 1,
            }}
          >
            {stage.label} ({count})
          </button>
        );
      })}
    </div>
  );
}

// ── Outreach Queue Section ────────────────────────────────────────

function OutreachSection({ sequences, onRefresh, onSendError }) {
  const [filterStatus, setFilterStatus] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [sendingAll, setSendingAll] = useState(false);
  const [sendResult, setSendResult] = useState(null);

  const filtered = sequences.filter(s => !filterStatus || s.status === filterStatus);

  async function updateStatus(id, status) {
    try {
      const result = await fetchApi(`/cfo-marketing/outreach/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ status }),
      });
      if (result.error) {
        onSendError && onSendError(result.error);
      }
    } catch (e) {
      if (e.response?.data?.needs_enrichment) {
        onSendError && onSendError('No contact email for this lead. Enrich the lead first.');
      } else {
        onSendError && onSendError(e.message);
      }
    }
    onRefresh();
  }

  async function bulkSend() {
    setSendingAll(true);
    setSendResult(null);
    try {
      const result = await fetchApi('/cfo-marketing/outreach/bulk-send', { method: 'POST', body: '{}' });
      setSendResult(result);
      onRefresh();
    } catch (e) {
      setSendResult({ error: e.message });
    }
    setSendingAll(false);
  }

  const draftCount = sequences.filter(s => s.status === 'draft').length;
  const approvedCount = sequences.filter(s => s.status === 'approved').length;

  return (
    <div style={{ marginTop: 32 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: '#ccc', margin: 0 }}>Outreach Queue</h2>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          style={{ background: '#111', color: '#aaa', border: '1px solid #333', borderRadius: 6, padding: '6px 10px', fontSize: 13 }}>
          <option value="">All ({sequences.length})</option>
          <option value="draft">Draft ({draftCount})</option>
          <option value="approved">Approved ({approvedCount})</option>
          <option value="sent">Sent</option>
          <option value="replied">Replied</option>
        </select>
        {approvedCount > 0 && (
          <button onClick={bulkSend} disabled={sendingAll} style={{
            padding: '6px 14px', background: sendingAll ? '#111' : '#0d2818', color: sendingAll ? '#555' : '#22c55e',
            border: `1px solid ${sendingAll ? '#333' : '#14532d'}`, borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: sendingAll ? 'not-allowed' : 'pointer',
          }}>
            {sendingAll ? 'Sending...' : `Send All Approved (${approvedCount})`}
          </button>
        )}
        {sendResult && !sendResult.error && (
          <span style={{ fontSize: 12, color: '#4ade80' }}>Sent: {sendResult.sent}, Failed: {sendResult.failed}</span>
        )}
        {sendResult?.error && (
          <span style={{ fontSize: 12, color: '#ef4444' }}>{sendResult.error}</span>
        )}
      </div>

      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#444', background: '#0d0d0d', borderRadius: 8, border: '1px solid #1a1a1a' }}>
          No outreach emails yet. Enrich leads, then use Draft All above.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(seq => {
            const isExpanded = expandedId === seq.id;
            const deliveryColor = seq.delivery_status === 'delivered' ? '#4ade80' : seq.delivery_status === 'failed' ? '#ef4444' : null;
            return (
              <div key={seq.id} style={{ background: '#0d0d0d', border: `1px solid ${isExpanded ? '#333' : '#1a1a1a'}`, borderRadius: 8, padding: '14px 16px' }}>
                <div onClick={() => setExpandedId(isExpanded ? null : seq.id)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontWeight: 600, color: '#ddd', fontSize: 13 }}>{seq.company_name || `Lead #${seq.lead_id}`}</span>
                    <SourceBadge source={seq.source_agent} />
                    {seq.contact_email && <span style={{ fontSize: 11, color: '#4ade80' }}>{seq.contact_email}</span>}
                    {!seq.contact_email && <span style={{ fontSize: 11, color: '#ef4444' }}>no email</span>}
                    <span style={{ fontSize: 11, color: '#444' }}>{isExpanded ? '▲' : '▼'}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {deliveryColor && <span style={{ fontSize: 10, color: deliveryColor, fontWeight: 600 }}>{seq.delivery_status}</span>}
                    <span style={{
                      padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600,
                      background: seq.status === 'draft' ? '#1a1f2e' : seq.status === 'approved' ? '#1a2a1a' : seq.status === 'sent' ? '#0d2818' : '#1a1a1a',
                      color: seq.status === 'draft' ? '#60a5fa' : seq.status === 'approved' ? '#4ade80' : seq.status === 'sent' ? '#22c55e' : '#888',
                    }}>
                      {seq.status}
                    </span>
                  </div>
                </div>

                {isExpanded && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontWeight: 600, color: '#aaa', marginBottom: 6, fontSize: 13 }}>Subject: {seq.email_subject}</div>
                    <div style={{ fontSize: 13, color: '#888', whiteSpace: 'pre-wrap', lineHeight: 1.7, background: '#111', padding: '12px 14px', borderRadius: 6, border: '1px solid #1a1a1a', marginBottom: 10 }}>
                      {seq.email_body || '(no body)'}
                    </div>
                    {seq.delivery_error && <div style={{ fontSize: 12, color: '#ef4444', marginBottom: 8 }}>Delivery error: {seq.delivery_error}</div>}
                    <div style={{ display: 'flex', gap: 8 }}>
                      {seq.status === 'draft' && <button onClick={() => updateStatus(seq.id, 'approved')} style={btnStyle('#1a2a1a', '#4ade80', '#166534')}>Approve</button>}
                      {seq.status === 'approved' && <button onClick={() => updateStatus(seq.id, 'sent')} style={btnStyle('#0d2818', '#22c55e', '#14532d')}>Send Email</button>}
                      {seq.status === 'sent' && <button onClick={() => updateStatus(seq.id, 'replied')} style={btnStyle('#1a1a2e', '#60a5fa', '#1e3a5f')}>Got Reply</button>}
                      {seq.status === 'draft' && <button onClick={() => updateStatus(seq.id, 'discarded')} style={btnStyle('#111', '#555', '#2a2a2a')}>Discard</button>}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function btnStyle(bg, color, border) {
  return { padding: '6px 14px', background: bg, color, border: `1px solid ${border}`, borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' };
}

// ── Classification colors ────────────────────────────────────────

const CLASSIFICATION_COLORS = {
  INTERESTED: { bg: '#0d2818', color: '#4ade80', border: '#14532d' },
  NOT_NOW: { bg: '#2a2a1a', color: '#f59e0b', border: '#92400e' },
  WRONG_PERSON: { bg: '#2a1a1a', color: '#ef4444', border: '#991b1b' },
  UNSUBSCRIBE: { bg: '#2a1a1a', color: '#f87171', border: '#7f1d1d' },
  BOUNCE: { bg: '#1a1a1a', color: '#6b7280', border: '#374151' },
  OOO: { bg: '#1a1a2e', color: '#60a5fa', border: '#1e3a5f' },
  UNKNOWN: { bg: '#1a1a1a', color: '#555', border: '#333' },
};

// ── Replies & Escalation Section ─────────────────────────────────

function RepliesEscalationSection({ pendingRuns, replies, onRefresh }) {
  const [open, setOpen] = useState(false);
  const [actionStatus, setActionStatus] = useState({});

  async function confirmRun(runId) {
    setActionStatus(prev => ({ ...prev, [runId]: 'confirming...' }));
    try {
      await fetchApi(`/runs/${runId}/confirm`, { method: 'POST' });
      setActionStatus(prev => ({ ...prev, [runId]: 'confirmed' }));
      setTimeout(() => onRefresh(), 1000);
    } catch (e) {
      setActionStatus(prev => ({ ...prev, [runId]: 'error: ' + e.message }));
    }
  }

  async function cancelRun(runId) {
    setActionStatus(prev => ({ ...prev, [runId]: 'cancelling...' }));
    try {
      await fetchApi(`/runs/${runId}/cancel`, { method: 'POST' });
      setActionStatus(prev => ({ ...prev, [runId]: 'cancelled' }));
      setTimeout(() => onRefresh(), 1000);
    } catch (e) {
      setActionStatus(prev => ({ ...prev, [runId]: 'error: ' + e.message }));
    }
  }

  function parseRunData(run) {
    try {
      const resultData = typeof run.result_data === 'string' ? JSON.parse(run.result_data) : run.result_data;
      const message = typeof resultData?.message === 'string' ? JSON.parse(resultData.message) : resultData?.message;
      return { companyName: message?.company_name || message?.lead_id ? `Lead #${message.lead_id}` : 'Unknown', replyText: message?.reply_text || '' };
    } catch {
      return { companyName: 'Unknown', replyText: '' };
    }
  }

  const interestedCount = replies.filter(r => r.classification === 'INTERESTED').length;
  const notNowCount = replies.filter(r => r.classification === 'NOT_NOW').length;

  return (
    <div style={{ marginTop: 32 }}>
      <div onClick={() => setOpen(!open)} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: open ? 16 : 0 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: '#ccc', margin: 0 }}>
          Replies &amp; Escalation
        </h2>
        {pendingRuns.length > 0 && (
          <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: '#f59e0b22', color: '#f59e0b', border: '1px solid #92400e' }}>
            {pendingRuns.length} pending
          </span>
        )}
        <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600, background: '#1a1a1a', color: '#888', border: '1px solid #333' }}>
          {replies.length} replies
        </span>
        <span style={{ fontSize: 12, color: '#555' }}>{open ? '▲' : '▼'}</span>
      </div>

      {open && (
        <div>
          {/* Summary bar */}
          {replies.length > 0 && (
            <div style={{ display: 'flex', gap: 16, marginBottom: 16, padding: '10px 14px', background: '#0d0d0d', border: '1px solid #1a1a1a', borderRadius: 8, fontSize: 12 }}>
              <span style={{ color: '#888' }}>Total: <span style={{ color: '#ccc', fontWeight: 600 }}>{replies.length}</span></span>
              <span style={{ color: '#888' }}>Interested: <span style={{ color: '#4ade80', fontWeight: 600 }}>{interestedCount}</span></span>
              <span style={{ color: '#888' }}>Not now: <span style={{ color: '#f59e0b', fontWeight: 600 }}>{notNowCount}</span></span>
            </div>
          )}

          {/* Pending meeting booker runs */}
          {pendingRuns.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, color: '#f59e0b', margin: '0 0 10px 0', textTransform: 'uppercase', letterSpacing: 1 }}>
                Pending Confirmation ({pendingRuns.length})
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {pendingRuns.map(run => {
                  const { companyName, replyText } = parseRunData(run);
                  const status = actionStatus[run.id];
                  return (
                    <div key={run.id} style={{ background: '#0d0d0d', border: '1px solid #92400e33', borderRadius: 8, padding: '14px 16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                            <span style={{ fontWeight: 600, color: '#ddd', fontSize: 13 }}>{companyName}</span>
                            <span style={{ fontSize: 10, color: '#555' }}>{new Date(run.created_at).toLocaleString()}</span>
                          </div>
                          {replyText && (
                            <div style={{ fontSize: 12, color: '#888', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 600 }}>
                              {replyText.slice(0, 200)}
                            </div>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginLeft: 12, flexShrink: 0 }}>
                          {!status && (
                            <>
                              <button onClick={() => confirmRun(run.id)} style={btnStyle('#0d2818', '#22c55e', '#14532d')}>Confirm</button>
                              <button onClick={() => cancelRun(run.id)} style={btnStyle('#2a1a1a', '#ef4444', '#991b1b')}>Cancel</button>
                            </>
                          )}
                          {status && <span style={{ fontSize: 11, color: '#888' }}>{status}</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Classified replies */}
          <div>
            <h3 style={{ fontSize: 13, fontWeight: 700, color: '#888', margin: '0 0 10px 0', textTransform: 'uppercase', letterSpacing: 1 }}>
              Classified Replies
            </h3>
            {replies.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#444', background: '#0d0d0d', borderRadius: 8, border: '1px solid #1a1a1a' }}>
                No classified replies yet.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {replies.map((reply, idx) => {
                  const cls = CLASSIFICATION_COLORS[reply.classification] || CLASSIFICATION_COLORS.UNKNOWN;
                  return (
                    <div key={reply.id || idx} style={{ background: '#0d0d0d', border: '1px solid #1a1a1a', borderRadius: 8, padding: '12px 16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <span style={{ fontWeight: 600, color: '#ccc', fontSize: 13 }}>{reply.from_email || reply.from || '(unknown sender)'}</span>
                          <span style={{
                            display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                            background: cls.bg, color: cls.color, border: `1px solid ${cls.border}`,
                          }}>
                            {reply.classification || 'UNKNOWN'}
                          </span>
                        </div>
                        <span style={{ fontSize: 10, color: '#555' }}>{reply.created_at ? new Date(reply.created_at).toLocaleString() : ''}</span>
                      </div>
                      {(reply.body || reply.body_preview) && (
                        <div style={{ fontSize: 12, color: '#666', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>
                          {(reply.body || reply.body_preview || '').slice(0, 200)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Content Library (collapsible) ─────────────────────────────────

function ContentSection({ pieces, onRefresh }) {
  const [open, setOpen] = useState(false);

  async function updateContentStatus(id, status) {
    await fetchApi(`/cfo-marketing/content/${id}`, { method: 'PUT', body: JSON.stringify({ status }) });
    onRefresh();
  }

  return (
    <div style={{ marginTop: 32 }}>
      <div onClick={() => setOpen(!open)} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: open ? 16 : 0 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: '#ccc', margin: 0 }}>Content Library ({pieces.length})</h2>
        <span style={{ fontSize: 12, color: '#555' }}>{open ? '▲' : '▼'}</span>
        <RunAgentButton agentId="cfo-content-engine" agentName="Run Content Engine" message={{ pillar: 'cash_flow', channel: 'linkedin' }} onComplete={onRefresh} />
      </div>
      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {pieces.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#444', background: '#0d0d0d', borderRadius: 8, border: '1px solid #1a1a1a' }}>
              No content yet. Run the Content Engine.
            </div>
          ) : pieces.map(piece => (
            <div key={piece.id} style={{ background: '#0d0d0d', border: '1px solid #1a1a1a', borderRadius: 8, padding: '14px 16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={{ fontWeight: 600, color: '#ddd', fontSize: 13 }}>{piece.title || '(untitled)'}</span>
                  <span style={{ fontSize: 11, color: '#555', marginLeft: 8 }}><SourceBadge source={piece.source_agent} /> {piece.pillar} / {piece.channel}</span>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {piece.status === 'draft' && <button onClick={() => updateContentStatus(piece.id, 'approved')} style={btnStyle('#1a2a1a', '#4ade80', '#166534')}>Approve</button>}
                  {piece.status === 'approved' && <button onClick={() => updateContentStatus(piece.id, 'published')} style={btnStyle('#0d2818', '#22c55e', '#14532d')}>Publish</button>}
                  <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600,
                    background: piece.status === 'draft' ? '#1a1f2e' : piece.status === 'approved' ? '#1a2a1a' : '#0d2818',
                    color: piece.status === 'draft' ? '#60a5fa' : piece.status === 'approved' ? '#4ade80' : '#22c55e',
                  }}>
                    {piece.status}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────

export default function CfoMarketingPage({ defaultSource = '' }) {
  const { activeWorkspaceId, activeWorkspaceSlug, setFromSource } = useWorkspace();
  const [leads, setLeads] = useState([]);
  const [funnel, setFunnel] = useState(null);
  const [content, setContent] = useState([]);
  const [outreach, setOutreach] = useState([]);
  const [pendingRuns, setPendingRuns] = useState([]);
  const [replies, setReplies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sourceFilter, setSourceFilter] = useState(defaultSource);
  const [tone, setTone] = useState('ai-curious-cfo');
  const [funnelStage, setFunnelStage] = useState(null);
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkStatus, setBulkStatus] = useState('');
  const [enrichRunning, setEnrichRunning] = useState(false);
  const [enrichStatus, setEnrichStatus] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Sync route-based defaultSource → workspace context on mount
  useEffect(() => {
    if (defaultSource) setFromSource(defaultSource);
  }, [defaultSource, setFromSource]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      // Prefer workspace_id filter, fall back to source_agent for backwards compat
      const wsParam = activeWorkspaceId ? `&workspace_id=${activeWorkspaceId}` : '';
      const wsParamFirst = activeWorkspaceId ? `?workspace_id=${activeWorkspaceId}` : '';
      const sq = wsParam || (sourceFilter ? `&source_agent=${sourceFilter}` : '');
      const sqp = wsParamFirst || (sourceFilter ? `?source_agent=${sourceFilter}` : '');
      const [leadsData, funnelData, contentData, outreachData, pendingRunsData, repliesData] = await Promise.all([
        fetchApi(`/cfo-marketing/leads?limit=200${sq}`),
        fetchApi(`/cfo-marketing/leads/funnel${sqp}`),
        fetchApi(`/cfo-marketing/content?limit=50${sq}`),
        fetchApi(`/cfo-marketing/outreach?limit=100${sq}`),
        fetchApi('/runs?status=pending&limit=20').catch(() => ({ runs: [] })),
        fetchApi('/cfo-marketing/replies?limit=20').catch(() => ({ replies: [] })),
      ]);
      setLeads(leadsData.leads || []);
      setFunnel(funnelData);
      setContent(contentData.pieces || []);
      setOutreach(outreachData.sequences || []);
      setPendingRuns(pendingRunsData.runs || pendingRunsData || []);
      setReplies(repliesData.replies || repliesData || []);
    } catch (e) {
      console.error('Pipeline load error:', e);
    }
    setLoading(false);
  }, [sourceFilter, activeWorkspaceId]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Filter leads by funnel stage
  const filteredLeads = leads.filter(lead => {
    if (!funnelStage) return true;
    switch (funnelStage) {
      case 'needs_enrichment': return (!lead.contact_email || lead.contact_email === '') && (lead.enrichment_status === 'pending' || !lead.enrichment_status);
      case 'enriched': return lead.enrichment_status === 'enriched' && lead.status === 'new';
      case 'has_draft': return outreach.some(s => s.lead_id === lead.id && s.status === 'draft');
      case 'has_approved': return outreach.some(s => s.lead_id === lead.id && s.status === 'approved');
      case 'contacted': return lead.status === 'contacted';
      case 'replied': return lead.status === 'replied';
      case 'pilot': return lead.status === 'pilot';
      case 'closed_won': return lead.status === 'closed_won';
      default: return true;
    }
  });

  // Enrich all unenriched leads
  async function enrichAll() {
    setEnrichRunning(true);
    setEnrichStatus('Enriching top 20 leads...');
    try {
      const result = await fetchApi('/cfo-marketing/leads/bulk-enrich', {
        method: 'POST',
        body: JSON.stringify({ limit: 20, min_score: 45 }),
      });
      setEnrichStatus(`Done: ${result.enriched}/${result.total} enriched`);
      setTimeout(() => { setEnrichStatus(''); loadAll(); }, 3000);
    } catch (e) {
      setEnrichStatus('Error: ' + e.message);
    }
    setEnrichRunning(false);
  }

  // Draft emails for enriched leads — workspace-aware outreach agent
  const outreachAgentName = activeWorkspaceSlug === 'data-rehab' ? 'data-rehab-outreach' : 'jake-outreach-agent';
  async function draftAll() {
    const targets = leads.filter(l => l.enrichment_status === 'enriched' && l.status === 'new' && l.contact_email).slice(0, 20);
    if (targets.length === 0) {
      setBulkStatus('No enriched leads ready for drafting. Enrich leads first.');
      setTimeout(() => setBulkStatus(''), 3000);
      return;
    }
    setBulkRunning(true);
    let done = 0;
    for (const lead of targets) {
      setBulkStatus(`Drafting ${done + 1}/${targets.length}: ${lead.company_name}...`);
      try {
        const startRes = await fetchApi(`/agents/${outreachAgentName}/run`, {
          method: 'POST',
          body: JSON.stringify({ message: JSON.stringify({
            lead_id: lead.id, company_name: lead.company_name,
            contact_name: lead.contact_name || null, contact_title: lead.contact_title || null,
            trade: 'GC', location: `${lead.city || ''} ${lead.state || ''}`.trim(),
            erp_type: lead.erp_type || 'Unknown',
            pain_signals: ['legacy data', 'AR chaos', 'manual reconciliation'],
            tone,
          }) }),
        });
        if (startRes.runId) await fetchApi(`/runs/${startRes.runId}/confirm`, { method: 'POST' });
        done++;
        if (done < targets.length) await new Promise(r => setTimeout(r, 15000));
      } catch (e) {
        console.error(`Draft failed for ${lead.company_name}:`, e.message);
      }
    }
    setBulkRunning(false);
    setBulkStatus(`Done: ${done} drafts queued.`);
    setTimeout(() => { setBulkStatus(''); loadAll(); }, 3000);
  }

  // One-button pipeline: Discover → Enrich → Draft (workspace-aware)
  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [pipelineStatus, setPipelineStatus] = useState('');
  async function runFullPipeline() {
    setPipelineRunning(true);
    try {
      // Step 1: Discover
      const discoverAgent = activeWorkspaceSlug === 'data-rehab' ? 'data-rehab-discovery'
        : activeWorkspaceSlug === 'hoa' ? 'hoa-discovery'
        : 'jake-construction-discovery';
      setPipelineStatus('1/3 — Finding leads...');
      const discRes = await fetchApi(`/agents/${discoverAgent}/run`, {
        method: 'POST', body: JSON.stringify({ message: JSON.stringify({ limit: 50 }) }),
      });
      if (discRes.runId) await fetchApi(`/runs/${discRes.runId}/confirm`, { method: 'POST' });

      // Step 2: Enrich
      setPipelineStatus('2/3 — Enriching contacts...');
      await fetchApi('/cfo-marketing/leads/bulk-enrich', {
        method: 'POST', body: JSON.stringify({ limit: 20, min_score: 0 }),
      });

      // Step 3: Draft outreach
      setPipelineStatus('3/3 — Drafting outreach...');
      await loadAll(); // refresh to get new leads
      // Don't auto-draft — user should review leads first
      setPipelineStatus('Done — leads discovered + enriched. Review and draft when ready.');
      setTimeout(() => { setPipelineStatus(''); loadAll(); }, 5000);
    } catch (e) {
      setPipelineStatus('Error: ' + e.message);
      setTimeout(() => setPipelineStatus(''), 5000);
    }
    setPipelineRunning(false);
  }

  // Single lead enrichment
  async function enrichSingle(leadId) {
    try {
      await fetchApi(`/cfo-marketing/leads/${leadId}/enrich`, { method: 'POST', body: '{}' });
      loadAll();
    } catch (e) {
      setErrorMsg('Enrich failed: ' + e.message);
      setTimeout(() => setErrorMsg(''), 4000);
    }
  }

  // Update lead status
  async function updateLeadStatus(id, status) {
    await fetchApi(`/cfo-marketing/leads/${id}`, { method: 'PUT', body: JSON.stringify({ status }) });
    loadAll();
  }

  const enrichedReadyCount = leads.filter(l => l.enrichment_status === 'enriched' && l.status === 'new' && l.contact_email).length;

  return (
    <div style={{ background: '#0a0a0a', minHeight: '100vh', color: '#e0e0e0', fontFamily: 'monospace' }}>
      {/* ── Header ── */}
      <div style={{ borderBottom: '1px solid #1a1a1a', padding: '16px 32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: '#fff', margin: 0 }}>
              {activeWorkspaceSlug === 'owen' ? 'Owen CFO — Property Management'
                : activeWorkspaceSlug === 'data-rehab' ? 'Data Rehab — AI Readiness'
                : activeWorkspaceSlug === 'hoa' ? 'HOA — Project Funding'
                : activeWorkspaceSlug === 'jake' ? 'Jake CFO — Construction Finance'
                : defaultSource === 'owen' ? 'Owen CFO — Property Management'
                : defaultSource === 'data-rehab' ? 'Data Rehab — AI Readiness'
                : 'Jake CFO — Construction Finance'}
            </h1>
            <div style={{ fontSize: 12, color: '#555', marginTop: 2 }}>
              {activeWorkspaceSlug === 'data-rehab' ? 'Discover → Enrich → Pitch Autopsy → Close → Upsell Sprint' : 'Discover → Enrich → Draft → Send → Track'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button onClick={loadAll} style={{ padding: '5px 12px', background: '#111', border: '1px solid #333', borderRadius: 6, color: '#666', fontSize: 12, cursor: 'pointer', fontFamily: 'monospace' }}>
              Refresh
            </button>
          </div>
        </div>

        {/* Tone selector — only for Jake/Owen (Data Rehab uses August voice, not selectable) */}
        {activeWorkspaceSlug !== 'data-rehab' && (
          <div style={{ display: 'flex', gap: 6, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: '#555', fontWeight: 600 }}>TONE:</span>
            {TONE_OPTIONS.map(t => (
              <button key={t.value} onClick={() => setTone(t.value)} title={t.desc} style={{
                padding: '4px 10px', borderRadius: 4, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'monospace',
                border: `1px solid ${tone === t.value ? '#f97316' : '#222'}`,
                background: tone === t.value ? '#f9731622' : 'transparent',
                color: tone === t.value ? '#f97316' : '#555',
              }}>
                {t.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Main Content ── */}
      <div style={{ padding: '24px 32px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#555' }}>Loading...</div>
        ) : (
          <>
            {/* Error bar */}
            {errorMsg && <div style={{ padding: '10px 16px', background: '#2a1a1a', border: '1px solid #991b1b', borderRadius: 6, color: '#ef4444', fontSize: 13, marginBottom: 16 }}>{errorMsg}</div>}

            {/* ── Funnel ── */}
            <FunnelBar funnel={funnel} activeStage={funnelStage} onStageClick={setFunnelStage} />

            {/* ── Actions Bar ── */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
              {/* One-button pipeline */}
              <button onClick={runFullPipeline} disabled={pipelineRunning} style={{
                padding: '8px 20px', background: pipelineRunning ? '#1a1a1a' : '#1a2a1a', color: pipelineRunning ? '#555' : '#4ade80',
                border: `1px solid ${pipelineRunning ? '#333' : '#166534'}`, borderRadius: 6, fontSize: 13, fontWeight: 700,
                cursor: pipelineRunning ? 'not-allowed' : 'pointer',
              }}>
                {pipelineRunning ? 'Running...' : activeWorkspaceSlug === 'data-rehab' ? 'Run Pipeline' : 'Discover + Enrich'}
              </button>

              <button onClick={enrichAll} disabled={enrichRunning} style={{
                padding: '8px 16px', background: enrichRunning ? '#1a1a1a' : '#1a1a2e', color: enrichRunning ? '#555' : '#60a5fa',
                border: `1px solid ${enrichRunning ? '#333' : '#1e3a5f'}`, borderRadius: 6, fontSize: 13, fontWeight: 600,
                cursor: enrichRunning ? 'not-allowed' : 'pointer',
              }}>
                {enrichRunning ? 'Enriching...' : `Enrich (${funnel?.needs_enrichment || 0})`}
              </button>
              <button onClick={draftAll} disabled={bulkRunning || enrichedReadyCount === 0} style={{
                padding: '8px 16px', background: bulkRunning ? '#1a1a1a' : enrichedReadyCount > 0 ? '#1a1a3a' : '#111',
                color: bulkRunning ? '#555' : enrichedReadyCount > 0 ? '#818cf8' : '#333',
                border: `1px solid ${bulkRunning ? '#333' : enrichedReadyCount > 0 ? '#312e81' : '#1a1a1a'}`,
                borderRadius: 6, fontSize: 13, fontWeight: 600,
                cursor: bulkRunning || enrichedReadyCount === 0 ? 'not-allowed' : 'pointer',
              }}>
                {bulkRunning ? 'Drafting...' : `Draft (${enrichedReadyCount} ready)`}
              </button>
              {pipelineStatus && <span style={{ fontSize: 12, color: '#4ade80', fontWeight: 600 }}>{pipelineStatus}</span>}
              {enrichStatus && <span style={{ fontSize: 12, color: '#60a5fa' }}>{enrichStatus}</span>}
              {bulkStatus && <span style={{ fontSize: 12, color: '#818cf8' }}>{bulkStatus}</span>}
            </div>

            {/* ── Leads Table ── */}
            <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: '#ccc', margin: 0 }}>
                Leads {funnelStage ? `— ${FUNNEL_STAGES.find(s => s.key === funnelStage)?.label || funnelStage}` : ''} ({filteredLeads.length})
              </h2>
            </div>

            {filteredLeads.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#444', background: '#0d0d0d', borderRadius: 8, border: '1px solid #1a1a1a' }}>
                {funnelStage ? 'No leads in this stage.' : 'No leads yet. Run Lead Scout or a Jake Blitz.'}
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #222' }}>
                      {['Score', 'Company', 'ERP', 'Source', 'Contact', 'Email', 'Enrichment', 'Status', ''].map(h => (
                        <th key={h} style={{ padding: '8px 10px', textAlign: 'left', color: '#555', fontWeight: 600, fontSize: 11, textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLeads.slice(0, 100).map(lead => {
                      const es = ENRICHMENT_COLORS[lead.enrichment_status] || ENRICHMENT_COLORS.pending;
                      return (
                        <tr key={lead.id} style={{ borderBottom: '1px solid #111' }}>
                          <td style={{ padding: '8px 10px' }}><ScoreBadge score={lead.pilot_fit_score} /></td>
                          <td style={{ padding: '8px 10px' }}>
                            <div style={{ fontWeight: 600, color: '#ddd' }}>{lead.company_name}</div>
                            {lead.city && <div style={{ fontSize: 11, color: '#555' }}>{lead.city}, {lead.state}</div>}
                          </td>
                          <td style={{ padding: '8px 10px' }}><ErpChip erp={lead.erp_type} /></td>
                          <td style={{ padding: '8px 10px' }}>
                            <SourceBadge source={lead.source_agent} />
                            {activeWorkspaceSlug === 'data-rehab' && <span style={{ marginLeft: 4 }}><TierBadge lead={lead} /></span>}
                          </td>
                          <td style={{ padding: '8px 10px', color: '#888' }}>
                            {lead.contact_name ? (
                              <div>
                                <div style={{ color: '#ccc' }}>{lead.contact_name}</div>
                                {lead.contact_title && <div style={{ fontSize: 11, color: '#555' }}>{lead.contact_title}</div>}
                              </div>
                            ) : <span style={{ color: '#333' }}>—</span>}
                          </td>
                          <td style={{ padding: '8px 10px' }}>
                            {lead.contact_email ? (
                              <span style={{ fontSize: 12, color: '#4ade80' }}>{lead.contact_email}</span>
                            ) : (
                              <span style={{ fontSize: 11, color: '#ef4444' }}>missing</span>
                            )}
                          </td>
                          <td style={{ padding: '8px 10px' }}>
                            <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: es.bg, color: es.color, border: `1px solid ${es.border}` }}>
                              {lead.enrichment_status || 'pending'}
                            </span>
                          </td>
                          <td style={{ padding: '8px 10px' }}>
                            <select value={lead.status} onChange={e => updateLeadStatus(lead.id, e.target.value)} style={{
                              background: '#111', color: STATUS_COLORS[lead.status] || '#888',
                              border: `1px solid ${(STATUS_COLORS[lead.status] || '#333')}55`, borderRadius: 4, padding: '3px 6px', fontSize: 12, fontWeight: 600,
                            }}>
                              {['new', 'contacted', 'replied', 'pilot', 'closed_won', 'closed_lost'].map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                          </td>
                          <td style={{ padding: '8px 10px' }}>
                            {(!lead.contact_email && lead.enrichment_status !== 'in_progress') && (
                              <button onClick={() => enrichSingle(lead.id)} style={btnStyle('#1a1a2e', '#60a5fa', '#1e3a5f')}>Enrich</button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {filteredLeads.length > 100 && <div style={{ textAlign: 'center', padding: 12, color: '#555', fontSize: 12 }}>Showing first 100 of {filteredLeads.length} leads</div>}
              </div>
            )}

            {/* ── Outreach Queue ── */}
            <OutreachSection
              sequences={outreach}
              onRefresh={loadAll}
              onSendError={msg => { setErrorMsg(msg); setTimeout(() => setErrorMsg(''), 5000); }}
            />

            {/* ── Replies & Escalation ── */}
            <RepliesEscalationSection
              pendingRuns={pendingRuns}
              replies={replies}
              onRefresh={loadAll}
            />

            {/* ── Content Library ── */}
            <ContentSection pieces={content} onRefresh={loadAll} />
          </>
        )}
      </div>
    </div>
  );
}
