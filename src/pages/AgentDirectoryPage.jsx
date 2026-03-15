/**
 * @file AgentDirectoryPage.jsx
 * @description Agent Directory — visual org map, health grid, and pipeline flow.
 * Three views: Overview (org chart), Health (scorecard grid), Pipeline (stage flow).
 * Matches MissionControl design language.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { api } from '@/lib/api';
import {
  Users, Search, Bot, Crown, Zap, Cog, Shield, Activity, Clock,
  DollarSign, Brain, AlertTriangle, CheckCircle, XCircle, X,
  Play, GitBranch, Send, Target, Eye, ChevronDown, ChevronUp,
  RefreshCw, LayoutGrid, Map, GitMerge, ArrowRight, Cpu,
  Building2, Radar, Radio, TrendingUp, Heart,
} from 'lucide-react';
import Button from '@/components/ui/Button';

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

const VIEWS = [
  { id: 'overview', label: 'Org Map', icon: Map },
  { id: 'health', label: 'Health', icon: Heart },
  { id: 'pipeline', label: 'Pipeline', icon: GitMerge },
];

const DEPT_CONFIG = {
  executive:    { label: 'Executive',    icon: Crown,    color: 'yellow', accent: '#FACC15' },
  research:     { label: 'Research',     icon: Search,   color: 'cyan',   accent: '#06B6D4' },
  engineering:  { label: 'Engineering',  icon: Cog,      color: 'orange', accent: '#F97316' },
  marketing:    { label: 'Marketing',    icon: Send,     color: 'rose',   accent: '#F43F5E' },
  finance:      { label: 'Finance',      icon: DollarSign, color: 'emerald', accent: '#10B981' },
  operations:   { label: 'Operations',   icon: Activity, color: 'blue',   accent: '#3B82F6' },
  opportunity:  { label: 'Opportunity',  icon: Radar,    color: 'purple', accent: '#A855F7' },
  rse:          { label: 'Signal Engine', icon: Radio,   color: 'violet', accent: '#8B5CF6' },
};

// Map every agent to a department
const AGENT_DEPT = {
  'main': 'executive', 'todd': 'executive',
  'jake-construction-discovery': 'research', 'hoa-discovery': 'research', 'jake-pain-signal-monitor': 'research',
  'competitor-intel': 'research', 'hoa-minutes-monitor': 'research', 'google-reviews-monitor': 'research',
  'jake-hiring-signal-agent': 'research', 'hoa-contact-finder': 'research', 'hoa-special-assessment-monitor': 'research',
  'mgmt-portfolio-scraper': 'research', 'mgmt-portfolio-mapper': 'research', 'mgmt-contact-puller': 'research',
  'mgmt-review-scanner': 'research', 'mgmt-cai-scraper': 'research',
  'opportunity-scanner': 'opportunity', 'opportunity-scorer': 'opportunity',
  'software-factory': 'engineering', 'traction-monitor': 'engineering', 'idle-trainer': 'engineering',
  'jake-lead-scout': 'marketing', 'cfo-lead-scout': 'marketing', 'jake-contact-enricher': 'marketing',
  'hoa-contact-enricher': 'marketing', 'jake-outreach-agent': 'marketing', 'cfo-outreach-agent': 'marketing',
  'jake-follow-up-agent': 'marketing', 'jake-reply-classifier': 'marketing', 'jake-meeting-booker': 'marketing',
  'jake-content-engine': 'marketing', 'cfo-content-engine': 'marketing', 'hoa-content-writer': 'marketing',
  'hoa-outreach-drafter': 'marketing', 'hoa-facebook-poster': 'marketing', 'jake-crm-sync': 'marketing',
  'content-repurposer': 'marketing', 'hoa-networker': 'marketing',
  'urgency-scorer': 'finance', 'lead-dossier-generator': 'finance',
  'pipeline-director': 'operations', 'pipeline-state-tracker': 'operations', 'pipeline-digest': 'operations',
  'tenacity-cadence-engine': 'operations', 'brain-distillation': 'operations', 'daily-debrief': 'operations',
  'morning-digest': 'operations', 'ralph-qa': 'operations', 'database-backup': 'operations',
  'rse-channel-monitor': 'rse', 'rse-transcript-extractor': 'rse', 'rse-signal-scorer': 'rse',
  'rse-expert-librarian': 'rse', 'rse-feedback-loop': 'rse',
};

const PIPELINE_STAGES = [
  { id: 'discovery', label: 'Discovery', icon: Search, agents: ['jake-construction-discovery', 'hoa-discovery', 'jake-lead-scout', 'cfo-lead-scout'] },
  { id: 'enrichment', label: 'Enrichment', icon: Users, agents: ['jake-contact-enricher', 'hoa-contact-enricher', 'hoa-contact-finder'] },
  { id: 'scoring', label: 'Scoring', icon: Target, agents: ['urgency-scorer', 'lead-dossier-generator'] },
  { id: 'outreach', label: 'Outreach', icon: Send, agents: ['jake-outreach-agent', 'cfo-outreach-agent', 'hoa-outreach-drafter'] },
  { id: 'followup', label: 'Follow-Up', icon: RefreshCw, agents: ['jake-follow-up-agent', 'tenacity-cadence-engine'] },
  { id: 'reply', label: 'Reply', icon: CheckCircle, agents: ['jake-reply-classifier'] },
  { id: 'close', label: 'Close', icon: TrendingUp, agents: ['jake-meeting-booker', 'jake-crm-sync'] },
];

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

function healthColor(score) {
  if (score >= 80) return { text: 'text-emerald-400', bg: 'bg-emerald-400', bar: 'bg-emerald-400', pill: 'bg-emerald-400/15 text-emerald-400 border-emerald-400/30' };
  if (score >= 50) return { text: 'text-amber-400', bg: 'bg-amber-400', bar: 'bg-amber-400', pill: 'bg-amber-400/15 text-amber-400 border-amber-400/30' };
  return { text: 'text-red-400', bg: 'bg-red-400', bar: 'bg-red-400', pill: 'bg-red-400/15 text-red-400 border-red-400/30' };
}

function statusDot(status) {
  if (status === 'running') return 'bg-blue-400 animate-pulse';
  if (status === 'error') return 'bg-red-400';
  return 'bg-slate-500';
}

function fmt$(n) { return `$${(n || 0).toFixed(4)}`; }

// ═══════════════════════════════════════════════════════════════
// AGENT NODE — used in org map and pipeline
// ═══════════════════════════════════════════════════════════════

function AgentNode({ agent, healthData, selected, onSelect, compact }) {
  const h = healthData || {};
  const hc = healthColor(h.health_score ?? 100);
  const isSelected = selected === agent.name;

  return (
    <button
      onClick={() => onSelect(isSelected ? null : agent.name)}
      className={`
        group relative flex items-center gap-2.5 px-3 py-2 rounded-lg border transition-all text-left w-full
        ${isSelected
          ? 'bg-accent-primary/10 border-accent-primary/50 shadow-lg shadow-accent-primary/5'
          : 'bg-bg-secondary border-border hover:border-accent-primary/30 hover:bg-bg-elevated'}
      `}
    >
      {/* Status dot */}
      <div className={`w-2 h-2 rounded-full shrink-0 ${statusDot(agent.status)}`} />

      {/* Name + meta */}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-text-primary truncate">{agent.name}</div>
        {!compact && (
          <div className="flex items-center gap-2 mt-0.5">
            {h.health_score != null && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded border font-mono ${hc.pill}`}>
                {h.health_score}
              </span>
            )}
            {h.runs_7d > 0 && (
              <span className="text-[10px] text-text-muted font-mono">{h.runs_7d} runs</span>
            )}
          </div>
        )}
      </div>

      {/* Health bar */}
      {h.health_score != null && !compact && (
        <div className="w-12 h-1.5 rounded-full bg-bg-primary overflow-hidden shrink-0">
          <div className={`h-full rounded-full ${hc.bar}`} style={{ width: `${h.health_score}%` }} />
        </div>
      )}
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════
// AGENT DETAIL PANEL — inline expansion
// ═══════════════════════════════════════════════════════════════

function AgentDetail({ agentName, agentData, healthData }) {
  const [soul, setSoul] = useState(null);
  const [loadingSoul, setLoadingSoul] = useState(true);

  useEffect(() => {
    setLoadingSoul(true);
    api.get(`/directory/${encodeURIComponent(agentName)}/soul`)
      .then(d => setSoul(d.soul || null))
      .catch(() => setSoul(null))
      .finally(() => setLoadingSoul(false));
  }, [agentName]);

  const h = healthData || {};
  const config = (() => {
    try { return typeof agentData?.config === 'string' ? JSON.parse(agentData.config) : agentData?.config || {}; }
    catch { return {}; }
  })();

  return (
    <div className="bg-bg-secondary border border-accent-primary/30 rounded-xl p-5 space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-accent-info/10 flex items-center justify-center">
          <Bot size={20} className="text-accent-info" />
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-text-primary">{agentName}</h3>
          <p className="text-xs text-text-muted">{agentData?.description || 'No description'}</p>
        </div>
        {h.health_score != null && (
          <div className={`text-2xl font-mono font-bold ${healthColor(h.health_score).text}`}>
            {h.health_score}
          </div>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Runs', value: agentData?.total_runs ?? 0, icon: Play },
          { label: 'Success Rate', value: agentData?.success_rate != null ? `${Math.round(agentData.success_rate * 100)}%` : 'N/A', icon: CheckCircle },
          { label: 'Cost (7d)', value: fmt$(h.cost_7d), icon: DollarSign },
          { label: 'Handler', value: config.special_handler || config.openclaw_id || 'LLM', icon: Cpu },
        ].map(s => (
          <div key={s.label} className="bg-bg-primary rounded-lg p-3">
            <div className="flex items-center gap-1.5 text-text-muted mb-1">
              <s.icon size={12} />
              <span className="text-[10px] uppercase tracking-wider">{s.label}</span>
            </div>
            <div className="text-sm font-semibold text-text-primary truncate">{s.value}</div>
          </div>
        ))}
      </div>

      {/* SOUL preview */}
      <div>
        <div className="flex items-center gap-2 text-xs font-semibold text-text-secondary mb-2">
          <Brain size={12} /> SOUL
        </div>
        {loadingSoul ? (
          <div className="text-xs text-text-muted">Loading...</div>
        ) : soul ? (
          <pre className="bg-bg-primary border border-border rounded-lg p-3 text-[11px] text-text-secondary whitespace-pre-wrap font-mono leading-relaxed max-h-48 overflow-y-auto">
            {soul.slice(0, 1500)}{soul.length > 1500 ? '\n\n[... truncated ...]' : ''}
          </pre>
        ) : (
          <div className="text-xs text-text-muted bg-bg-primary border border-border rounded-lg p-3">
            No SOUL.md found. {config.special_handler ? 'Runs as deterministic special handler.' : ''}
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// VIEW 1: ORG MAP
// ═══════════════════════════════════════════════════════════════

function OrgMapView({ agents, healthMap, selected, onSelect }) {
  const deptGroups = useMemo(() => {
    const groups = {};
    for (const [deptId, cfg] of Object.entries(DEPT_CONFIG)) {
      groups[deptId] = { ...cfg, agents: [] };
    }
    for (const agent of agents) {
      const dept = AGENT_DEPT[agent.name] || 'operations';
      if (groups[dept]) groups[dept].agents.push(agent);
    }
    return groups;
  }, [agents]);

  return (
    <div className="space-y-4">
      {/* CEO → Todd connection */}
      <div className="bg-bg-secondary border border-yellow-400/30 rounded-xl p-4">
        <div className="flex items-center gap-6">
          {/* Steve */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-10 h-10 rounded-full bg-yellow-400/10 flex items-center justify-center ring-2 ring-yellow-400/30">
              <Crown size={18} className="text-yellow-400" />
            </div>
            <div>
              <div className="text-sm font-bold text-text-primary">Steve Pilcher</div>
              <div className="text-[10px] text-yellow-400 uppercase tracking-wider">CEO</div>
            </div>
          </div>

          <ArrowRight size={16} className="text-yellow-400/50 shrink-0" />

          {/* Todd */}
          <div className="flex-1 max-w-xs">
            {agents.find(a => a.name === 'main') && (
              <AgentNode
                agent={agents.find(a => a.name === 'main')}
                healthData={healthMap['main']}
                selected={selected}
                onSelect={onSelect}
                compact
              />
            )}
          </div>

          <ArrowRight size={16} className="text-text-muted/30 shrink-0 hidden sm:block" />

          {/* Department count pills */}
          <div className="flex flex-wrap gap-1.5 hidden sm:flex">
            {Object.entries(deptGroups).filter(([id]) => id !== 'executive').map(([id, dept]) => (
              <span key={id} className={`text-[10px] px-2 py-0.5 rounded-full bg-${dept.color}-400/10 text-${dept.color}-400`}>
                {dept.label} ({dept.agents.length})
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Selected agent detail (if in executive) */}
      {selected === 'main' && agents.find(a => a.name === 'main') && (
        <AgentDetail agentName="main" agentData={agents.find(a => a.name === 'main')} healthData={healthMap['main']} />
      )}

      {/* Department swim lanes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {Object.entries(deptGroups)
          .filter(([id]) => id !== 'executive')
          .filter(([_, dept]) => dept.agents.length > 0)
          .map(([deptId, dept]) => {
            const DeptIcon = dept.icon;
            return (
              <div key={deptId} className={`bg-bg-secondary border border-${dept.color}-400/20 rounded-xl p-4`}>
                {/* Department header */}
                <div className="flex items-center gap-2.5 mb-3">
                  <div className={`w-8 h-8 rounded-lg bg-${dept.color}-400/10 flex items-center justify-center`}>
                    <DeptIcon size={16} className={`text-${dept.color}-400`} />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-text-primary">{dept.label}</div>
                    <div className="text-[10px] text-text-muted">{dept.agents.length} agents</div>
                  </div>
                </div>

                {/* Agent list */}
                <div className="space-y-1.5">
                  {dept.agents.map(agent => (
                    <React.Fragment key={agent.name}>
                      <AgentNode
                        agent={agent}
                        healthData={healthMap[agent.name]}
                        selected={selected}
                        onSelect={onSelect}
                      />
                      {selected === agent.name && (
                        <AgentDetail agentName={agent.name} agentData={agent} healthData={healthMap[agent.name]} />
                      )}
                    </React.Fragment>
                  ))}
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// VIEW 2: HEALTH GRID
// ═══════════════════════════════════════════════════════════════

function HealthGridView({ agents, healthMap, selected, onSelect }) {
  const [sortBy, setSortBy] = useState('health');
  const [filterDept, setFilterDept] = useState('all');

  const sorted = useMemo(() => {
    let list = agents.map(a => ({
      ...a,
      health: healthMap[a.name]?.health_score ?? 100,
      runs7d: healthMap[a.name]?.runs_7d ?? 0,
      cost7d: healthMap[a.name]?.cost_7d ?? 0,
      failures7d: healthMap[a.name]?.failures_7d ?? 0,
      dept: AGENT_DEPT[a.name] || 'operations',
    }));

    if (filterDept !== 'all') list = list.filter(a => a.dept === filterDept);

    if (sortBy === 'health') list.sort((a, b) => a.health - b.health); // worst first
    else if (sortBy === 'runs') list.sort((a, b) => b.runs7d - a.runs7d);
    else if (sortBy === 'cost') list.sort((a, b) => b.cost7d - a.cost7d);
    else if (sortBy === 'name') list.sort((a, b) => a.name.localeCompare(b.name));

    return list;
  }, [agents, healthMap, sortBy, filterDept]);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 bg-bg-secondary border border-border rounded-lg p-0.5">
          {[
            { id: 'health', label: 'Health' },
            { id: 'runs', label: 'Activity' },
            { id: 'cost', label: 'Cost' },
            { id: 'name', label: 'Name' },
          ].map(s => (
            <button
              key={s.id}
              onClick={() => setSortBy(s.id)}
              className={`px-2.5 py-1 rounded-md text-xs transition-colors ${sortBy === s.id ? 'bg-accent-primary/20 text-accent-primary' : 'text-text-muted hover:text-text-primary'}`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <select
          value={filterDept}
          onChange={e => setFilterDept(e.target.value)}
          className="bg-bg-secondary border border-border rounded-lg px-2.5 py-1.5 text-xs text-text-primary"
        >
          <option value="all">All departments</option>
          {Object.entries(DEPT_CONFIG).map(([id, cfg]) => (
            <option key={id} value={id}>{cfg.label}</option>
          ))}
        </select>

        <span className="text-xs text-text-muted ml-auto">{sorted.length} agents</span>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {sorted.map(agent => {
          const hc = healthColor(agent.health);
          const deptCfg = DEPT_CONFIG[agent.dept];
          const isSelected = selected === agent.name;

          return (
            <React.Fragment key={agent.name}>
              <button
                onClick={() => onSelect(isSelected ? null : agent.name)}
                className={`
                  text-left bg-bg-secondary border rounded-xl p-4 transition-all
                  ${isSelected ? 'border-accent-primary/50 shadow-lg shadow-accent-primary/5' : 'border-border hover:border-accent-primary/30'}
                `}
              >
                {/* Header row */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${statusDot(agent.status)}`} />
                    <span className="text-sm font-medium text-text-primary truncate">{agent.name}</span>
                  </div>
                  <span className={`text-lg font-mono font-bold ${hc.text}`}>{agent.health}</span>
                </div>

                {/* Health bar */}
                <div className="w-full h-1.5 rounded-full bg-bg-primary mb-3 overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-500 ${hc.bar}`} style={{ width: `${agent.health}%` }} />
                </div>

                {/* Stats row */}
                <div className="flex items-center justify-between text-[10px] text-text-muted">
                  <span>{agent.runs7d} runs/7d</span>
                  <span>{agent.failures7d > 0 ? `${agent.failures7d} fail` : 'clean'}</span>
                  <span>{fmt$(agent.cost7d)}</span>
                </div>

                {/* Department badge */}
                {deptCfg && (
                  <div className={`mt-2 text-[10px] px-2 py-0.5 rounded-full inline-block bg-${deptCfg.color}-400/10 text-${deptCfg.color}-400`}>
                    {deptCfg.label}
                  </div>
                )}
              </button>

              {isSelected && (
                <div className="col-span-full">
                  <AgentDetail agentName={agent.name} agentData={agent} healthData={healthMap[agent.name]} />
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// VIEW 3: PIPELINE FLOW
// ═══════════════════════════════════════════════════════════════

function PipelineFlowView({ agents, healthMap, selected, onSelect }) {
  return (
    <div className="space-y-4">
      <p className="text-xs text-text-muted">Lead pipeline: Discovery through Close. Click any agent to see details.</p>

      {/* Flow */}
      <div className="flex flex-col lg:flex-row gap-3 items-stretch">
        {PIPELINE_STAGES.map((stage, idx) => {
          const StageIcon = stage.icon;
          const stageAgents = stage.agents.map(name => agents.find(a => a.name === name)).filter(Boolean);
          const avgHealth = stageAgents.length > 0
            ? Math.round(stageAgents.reduce((s, a) => s + (healthMap[a.name]?.health_score ?? 100), 0) / stageAgents.length)
            : 100;
          const hc = healthColor(avgHealth);

          return (
            <React.Fragment key={stage.id}>
              {/* Stage card */}
              <div className="flex-1 bg-bg-secondary border border-border rounded-xl p-4 min-w-0">
                {/* Stage header */}
                <div className="flex items-center gap-2 mb-3">
                  <div className={`w-8 h-8 rounded-lg ${hc.pill} border flex items-center justify-center`}>
                    <StageIcon size={16} />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-text-primary">{stage.label}</div>
                    <div className="text-[10px] text-text-muted">{stageAgents.length} agents</div>
                  </div>
                  <span className={`ml-auto text-sm font-mono font-bold ${hc.text}`}>{avgHealth}</span>
                </div>

                {/* Agents in this stage */}
                <div className="space-y-1.5">
                  {stageAgents.map(agent => (
                    <React.Fragment key={agent.name}>
                      <AgentNode
                        agent={agent}
                        healthData={healthMap[agent.name]}
                        selected={selected}
                        onSelect={onSelect}
                        compact
                      />
                      {selected === agent.name && (
                        <AgentDetail agentName={agent.name} agentData={agent} healthData={healthMap[agent.name]} />
                      )}
                    </React.Fragment>
                  ))}
                </div>
              </div>

              {/* Arrow between stages */}
              {idx < PIPELINE_STAGES.length - 1 && (
                <div className="flex items-center justify-center lg:self-start lg:mt-8 py-1 lg:py-0 lg:px-0">
                  <ArrowRight size={16} className="text-text-muted/30 rotate-90 lg:rotate-0" />
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════

export default function AgentDirectoryPage() {
  const [agents, setAgents] = useState([]);
  const [healthAgents, setHealthAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('overview');
  const [selected, setSelected] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const [agentData, healthData] = await Promise.all([
        api.get('/agents'),
        api.get('/health/agents').catch(() => ({ agents: [] })),
      ]);
      setAgents(agentData.agents || []);
      setHealthAgents(healthData.agents || []);
    } catch (err) {
      console.error('[Directory] Fetch failed:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Build health lookup by agent name
  const healthMap = useMemo(() => {
    const map = {};
    for (const h of healthAgents) map[h.name] = h;
    return map;
  }, [healthAgents]);

  // Fleet stats
  const totalAgents = agents.length;
  const activeAgents = agents.filter(a => a.total_runs > 0).length;
  const runningNow = agents.filter(a => a.status === 'running').length;
  const totalCost7d = healthAgents.reduce((s, h) => s + (h.cost_7d || 0), 0);
  const avgHealth = healthAgents.length > 0
    ? Math.round(healthAgents.reduce((s, h) => s + (h.health_score || 0), 0) / healthAgents.length)
    : 0;
  const failedThisWeek = healthAgents.reduce((s, h) => s + (h.failures_7d || 0), 0);

  return (
    <div className="h-full overflow-y-auto p-6 space-y-4">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users className="w-5 h-5 text-accent-primary" />
          <h1 className="text-xl font-semibold">Agent Directory</h1>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={fetchData} className="p-1.5 rounded hover:bg-bg-elevated transition-colors text-text-muted" title="Refresh">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ── Fleet Stats Strip ── */}
      <div className="bg-bg-secondary border border-border rounded-xl p-4">
        <div className="flex flex-wrap items-center gap-4">
          {[
            { icon: Bot, label: 'Agents', value: totalAgents, sub: `${activeAgents} active` },
            { icon: Play, label: 'Running', value: runningNow, sub: runningNow > 0 ? 'now' : 'idle' },
            { icon: Heart, label: 'Health', value: avgHealth, sub: '/100 avg', color: healthColor(avgHealth).text },
            { icon: XCircle, label: 'Failures', value: failedThisWeek, sub: '7d', color: failedThisWeek > 0 ? 'text-red-400' : 'text-emerald-400' },
            { icon: DollarSign, label: 'Cost', value: fmt$(totalCost7d), sub: '7d' },
          ].map(s => (
            <div key={s.label} className="flex items-center gap-2.5">
              <s.icon size={14} className="text-text-muted shrink-0" />
              <div>
                <div className={`text-lg font-mono font-semibold ${s.color || 'text-text-primary'}`}>{s.value}</div>
                <div className="text-[10px] text-text-muted uppercase tracking-wider">{s.label} <span className="normal-case">{s.sub}</span></div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── View Tabs ── */}
      <div className="flex items-center gap-1 bg-bg-secondary border border-border rounded-lg p-0.5 w-fit">
        {VIEWS.map(v => {
          const VIcon = v.icon;
          return (
            <button
              key={v.id}
              onClick={() => { setView(v.id); setSelected(null); }}
              className={`
                flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors
                ${view === v.id ? 'bg-accent-primary/20 text-accent-primary' : 'text-text-muted hover:text-text-primary'}
              `}
            >
              <VIcon size={14} /> {v.label}
            </button>
          );
        })}
      </div>

      {/* ── Active View ── */}
      {loading ? (
        <div className="flex items-center justify-center h-64 text-text-muted">Loading fleet data...</div>
      ) : (
        <>
          {view === 'overview' && (
            <OrgMapView agents={agents} healthMap={healthMap} selected={selected} onSelect={setSelected} />
          )}
          {view === 'health' && (
            <HealthGridView agents={agents} healthMap={healthMap} selected={selected} onSelect={setSelected} />
          )}
          {view === 'pipeline' && (
            <PipelineFlowView agents={agents} healthMap={healthMap} selected={selected} onSelect={setSelected} />
          )}
        </>
      )}
    </div>
  );
}
