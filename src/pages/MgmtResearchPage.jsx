/**
 * @file MgmtResearchPage.jsx
 * @description Management Company Research dashboard (Agents 36-40)
 *
 * Shows: company pipeline, hot leads, review signals, pipeline stats
 * Connects to: /api/mgmt-research/*
 */

import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';

function fetchApi(path) {
  return api.get(path);
}

const TIER_COLORS = {
  AAMC_TOP: 'bg-yellow-500/20 text-yellow-300',
  DESIGNATED: 'bg-blue-500/20 text-blue-300',
  MEMBER: 'bg-gray-500/20 text-gray-300',
  UNKNOWN: 'bg-gray-700/20 text-gray-500',
};

const HEALTH_COLORS = {
  critical: 'text-red-400',
  deteriorating: 'text-orange-400',
  concerning: 'text-yellow-400',
  healthy: 'text-green-400',
  unknown: 'text-gray-500',
};

const URGENCY_COLORS = {
  critical: 'bg-red-500/20 text-red-300',
  high: 'bg-orange-500/20 text-orange-300',
  medium: 'bg-yellow-500/20 text-yellow-300',
  low: 'bg-gray-500/20 text-gray-400',
};

export default function MgmtResearchPage() {
  const [tab, setTab] = useState('dashboard');
  const [companies, setCompanies] = useState([]);
  const [stats, setStats] = useState(null);
  const [hotLeads, setHotLeads] = useState([]);
  const [queue, setQueue] = useState([]);
  const [signals, setSignals] = useState([]);
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchApi('/mgmt-research/dashboard?limit=200');
      setCompanies(data.companies || []);
      setStats(data.stats || {});
    } catch (e) {
      console.error('Dashboard load error:', e);
    }
    setLoading(false);
  }, []);

  const loadHotLeads = useCallback(async () => {
    try {
      const data = await fetchApi('/mgmt-research/hot-leads');
      setHotLeads(data.hot_leads || []);
    } catch (e) {
      console.error('Hot leads error:', e);
    }
  }, []);

  const loadQueue = useCallback(async () => {
    try {
      const data = await fetchApi('/mgmt-research/queue');
      setQueue(data.queue || []);
    } catch (e) {
      console.error('Queue error:', e);
    }
  }, []);

  const loadSignals = useCallback(async (companyId) => {
    try {
      const data = await fetchApi(`/mgmt-research/signals/${companyId}`);
      setSignals(data.signals || []);
    } catch (e) {
      console.error('Signals error:', e);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
    loadHotLeads();
    loadQueue();
  }, [loadDashboard, loadHotLeads, loadQueue]);

  const pipelineProgress = (c) => {
    const done = (c.portfolio_scraped || 0) + (c.contacts_pulled || 0) + (c.portfolio_mapped || 0) + (c.reviews_scanned || 0);
    return Math.round((done / 4) * 100);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Management Company Research</h1>
        <p className="text-text-muted mt-1">
          Pipeline: CAI Directory → Portfolio Scrape → Contact Pull → Portfolio Map → Review Scan
        </p>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          <StatCard label="Total Companies" value={stats.total || 0} />
          <StatCard label="AAMC" value={stats.aamc || 0} color="text-yellow-400" />
          <StatCard label="Portfolios Scraped" value={stats.scraped || 0} />
          <StatCard label="Contacts Pulled" value={stats.contacts || 0} />
          <StatCard label="Mapped" value={stats.mapped || 0} />
          <StatCard label="Reviews Scanned" value={stats.scanned || 0} />
          <StatCard label="Unhealthy" value={stats.unhealthy || 0} color="text-red-400" />
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-border-subtle pb-2">
        {['dashboard', 'hot-leads', 'queue', 'signals'].map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-t text-sm font-medium transition ${
              tab === t
                ? 'bg-bg-elevated text-text-primary border-b-2 border-accent-primary'
                : 'text-text-muted hover:text-text-primary'
            }`}
          >
            {t === 'dashboard' && 'Companies'}
            {t === 'hot-leads' && `Hot Leads (${hotLeads.length})`}
            {t === 'queue' && `Queue (${queue.length})`}
            {t === 'signals' && 'Signals'}
          </button>
        ))}
      </div>

      {/* Dashboard Tab */}
      {tab === 'dashboard' && (
        <div className="bg-bg-surface border border-border-subtle rounded-lg overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-text-muted">Loading...</div>
          ) : companies.length === 0 ? (
            <div className="p-8 text-center text-text-muted">
              <p className="text-lg mb-2">No management companies found</p>
              <p>Run Agent 40 (CAI Directory Scraper) to populate the pipeline.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-bg-elevated text-text-muted uppercase text-xs">
                  <tr>
                    <th className="px-4 py-3 text-left">Company</th>
                    <th className="px-4 py-3 text-left">Tier</th>
                    <th className="px-4 py-3 text-center">Portfolio</th>
                    <th className="px-4 py-3 text-center">Pipeline</th>
                    <th className="px-4 py-3 text-center">Health</th>
                    <th className="px-4 py-3 text-center">Rating</th>
                    <th className="px-4 py-3 text-center">Signals</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {companies.map(c => (
                    <tr key={c.id} className="hover:bg-bg-elevated/50 cursor-pointer" onClick={() => { setSelectedCompany(c); loadSignals(c.id); setTab('signals'); }}>
                      <td className="px-4 py-3">
                        <div className="font-medium text-text-primary">{c.name}</div>
                        <div className="text-xs text-text-muted">{c.website_url || c.website || 'No website'}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${TIER_COLORS[c.priority_tier] || TIER_COLORS.UNKNOWN}`}>
                          {c.priority_tier || 'UNKNOWN'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-text-muted">
                        {c.communities_managed || c.communities_scraped || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-bg-elevated rounded-full h-2">
                            <div className="bg-accent-primary h-2 rounded-full transition-all" style={{ width: `${pipelineProgress(c)}%` }} />
                          </div>
                          <span className="text-xs text-text-muted w-8 text-right">{pipelineProgress(c)}%</span>
                        </div>
                        <div className="flex gap-1 mt-1">
                          <PipelineDot done={c.portfolio_scraped} label="S" />
                          <PipelineDot done={c.contacts_pulled} label="C" />
                          <PipelineDot done={c.portfolio_mapped} label="M" />
                          <PipelineDot done={c.reviews_scanned} label="R" />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={HEALTH_COLORS[c.company_health] || HEALTH_COLORS.unknown}>
                          {c.company_health || 'unknown'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-text-muted">
                        {c.google_rating ? `${c.google_rating}★` : '—'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {c.switching_signals > 0 && (
                          <span className="text-red-400 font-medium">{c.switching_signals}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Hot Leads Tab */}
      {tab === 'hot-leads' && (
        <div className="bg-bg-surface border border-border-subtle rounded-lg overflow-hidden">
          {hotLeads.length === 0 ? (
            <div className="p-8 text-center text-text-muted">
              <p>No hot review leads yet. Run Agent 39 (Review Scanner) to find struggling communities.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-bg-elevated text-text-muted uppercase text-xs">
                  <tr>
                    <th className="px-4 py-3 text-left">Community</th>
                    <th className="px-4 py-3 text-left">Location</th>
                    <th className="px-4 py-3 text-left">Mgmt Company</th>
                    <th className="px-4 py-3 text-center">Signal Score</th>
                    <th className="px-4 py-3 text-center">Reviews</th>
                    <th className="px-4 py-3 text-center">Urgency</th>
                    <th className="px-4 py-3 text-left">Issues</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {hotLeads.map((lead, i) => (
                    <tr key={i} className="hover:bg-bg-elevated/50">
                      <td className="px-4 py-3 font-medium text-text-primary">{lead.community_name}</td>
                      <td className="px-4 py-3 text-text-muted">{lead.city}, {lead.state}</td>
                      <td className="px-4 py-3 text-text-muted">{lead.management_company}</td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-accent-warning font-bold">{lead.combined_signal_score}</span>
                      </td>
                      <td className="px-4 py-3 text-center text-text-muted">{lead.total_reviews}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-1 rounded text-xs ${URGENCY_COLORS[lead.max_urgency] || ''}`}>
                          {lead.max_urgency}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-text-muted text-xs max-w-xs truncate">{lead.issues}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Queue Tab */}
      {tab === 'queue' && (
        <div className="bg-bg-surface border border-border-subtle rounded-lg overflow-hidden">
          {queue.length === 0 ? (
            <div className="p-8 text-center text-text-muted">
              <p>All companies have completed the pipeline.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-bg-elevated text-text-muted uppercase text-xs">
                  <tr>
                    <th className="px-4 py-3 text-left">Company</th>
                    <th className="px-4 py-3 text-left">Tier</th>
                    <th className="px-4 py-3 text-center">Portfolio</th>
                    <th className="px-4 py-3 text-center">Scraped</th>
                    <th className="px-4 py-3 text-center">Contacts</th>
                    <th className="px-4 py-3 text-center">Mapped</th>
                    <th className="px-4 py-3 text-center">Reviews</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {queue.map(c => (
                    <tr key={c.id} className="hover:bg-bg-elevated/50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-text-primary">{c.name}</div>
                        <div className="text-xs text-text-muted">{c.website_url || c.website || ''}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded text-xs ${TIER_COLORS[c.priority_tier] || ''}`}>
                          {c.priority_tier}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-text-muted">{c.communities_managed || '—'}</td>
                      <td className="px-4 py-3 text-center">{c.portfolio_scraped ? '✓' : '—'}</td>
                      <td className="px-4 py-3 text-center">{c.contacts_pulled ? '✓' : '—'}</td>
                      <td className="px-4 py-3 text-center">{c.portfolio_mapped ? '✓' : '—'}</td>
                      <td className="px-4 py-3 text-center">{c.reviews_scanned ? '✓' : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Signals Tab */}
      {tab === 'signals' && (
        <div className="bg-bg-surface border border-border-subtle rounded-lg overflow-hidden">
          {selectedCompany && (
            <div className="px-4 py-3 bg-bg-elevated border-b border-border-subtle">
              <span className="font-medium text-text-primary">Review Signals: {selectedCompany.name}</span>
              <button onClick={() => { setSelectedCompany(null); setSignals([]); setTab('dashboard'); }} className="ml-4 text-sm text-text-muted hover:text-text-primary">← Back</button>
            </div>
          )}
          {signals.length === 0 ? (
            <div className="p-8 text-center text-text-muted">
              {selectedCompany ? 'No signals found for this company.' : 'Select a company from the Dashboard tab to view signals.'}
            </div>
          ) : (
            <div className="divide-y divide-border-subtle">
              {signals.map(s => (
                <div key={s.id} className="p-4 hover:bg-bg-elevated/30">
                  <div className="flex items-center gap-3 mb-2">
                    <span className={`px-2 py-0.5 rounded text-xs ${URGENCY_COLORS[s.urgency] || ''}`}>{s.urgency}</span>
                    <span className="text-accent-warning font-bold text-sm">Score: {s.signal_score}</span>
                    <span className="text-text-muted text-xs">{s.review_source} • {s.star_rating}★ • {s.review_date}</span>
                    {s.reviewer_name && <span className="text-text-muted text-xs">by {s.reviewer_name}</span>}
                  </div>
                  {s.community_mentioned && (
                    <div className="text-sm text-accent-primary mb-1">Community: {s.community_mentioned} {s.community_city && `(${s.community_city}, ${s.community_state})`}</div>
                  )}
                  <p className="text-sm text-text-secondary leading-relaxed">{s.review_text?.substring(0, 300)}{s.review_text?.length > 300 ? '...' : ''}</p>
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {s.primary_issue && <span className="text-xs bg-red-500/10 text-red-400 px-2 py-0.5 rounded">{s.primary_issue}</span>}
                    {JSON.parse(s.tier1_signals || '[]').map(k => <span key={k} className="text-xs bg-red-500/10 text-red-300 px-1.5 py-0.5 rounded">{k}</span>)}
                    {JSON.parse(s.tier2_signals || '[]').map(k => <span key={k} className="text-xs bg-orange-500/10 text-orange-300 px-1.5 py-0.5 rounded">{k}</span>)}
                    {JSON.parse(s.tier3_signals || '[]').map(k => <span key={k} className="text-xs bg-yellow-500/10 text-yellow-300 px-1.5 py-0.5 rounded">{k}</span>)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div className="bg-bg-surface border border-border-subtle rounded-lg p-3 text-center">
      <div className={`text-2xl font-bold ${color || 'text-text-primary'}`}>{value}</div>
      <div className="text-xs text-text-muted mt-1">{label}</div>
    </div>
  );
}

function PipelineDot({ done, label }) {
  return (
    <span className={`w-5 h-5 inline-flex items-center justify-center rounded-full text-[10px] font-bold ${
      done ? 'bg-accent-success/20 text-accent-success' : 'bg-bg-elevated text-text-muted'
    }`}>
      {label}
    </span>
  );
}
