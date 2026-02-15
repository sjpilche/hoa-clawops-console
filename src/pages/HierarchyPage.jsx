/**
 * @file HierarchyPage.jsx
 * @description Agent hierarchy visualization — tree view of agent relationships.
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import {
  GitBranch, ChevronDown, ChevronRight, Bot, Crown,
  Users, Zap, Cog, RefreshCw, Globe
} from 'lucide-react';
import Button from '@/components/ui/Button';

const ROLE_CONFIG = {
  commander: { icon: Crown, color: 'text-yellow-400', bg: 'bg-yellow-400/10', label: 'Commander' },
  coordinator: { icon: Users, color: 'text-blue-400', bg: 'bg-blue-400/10', label: 'Coordinator' },
  specialist: { icon: Zap, color: 'text-purple-400', bg: 'bg-purple-400/10', label: 'Specialist' },
  worker: { icon: Cog, color: 'text-gray-400', bg: 'bg-gray-400/10', label: 'Worker' },
};

const STATUS_COLORS = {
  idle: 'bg-text-muted',
  running: 'bg-accent-success',
  error: 'bg-accent-danger',
  disabled: 'bg-text-muted/50',
};

function TreeNode({ node, depth = 0 }) {
  const [collapsed, setCollapsed] = useState(depth > 2);
  const navigate = useNavigate();
  const hasChildren = node.children && node.children.length > 0;

  const role = ROLE_CONFIG[node.orchestration_role] || ROLE_CONFIG.worker;
  const RoleIcon = role.icon;

  return (
    <div className="select-none">
      <div
        className={`
          flex items-center gap-2 py-1.5 px-2 rounded-md
          hover:bg-bg-elevated transition-colors cursor-pointer group
        `}
        style={{ paddingLeft: `${depth * 24 + 8}px` }}
      >
        {/* Expand/Collapse Toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-4 h-4 flex items-center justify-center shrink-0"
        >
          {hasChildren ? (
            collapsed ? <ChevronRight size={14} className="text-text-muted" /> : <ChevronDown size={14} className="text-text-muted" />
          ) : (
            <span className="w-1 h-1 rounded-full bg-border" />
          )}
        </button>

        {/* Status dot */}
        <div className={`w-2 h-2 rounded-full shrink-0 ${STATUS_COLORS[node.agent_status] || 'bg-text-muted'}`} />

        {/* Role icon */}
        <div className={`w-6 h-6 rounded flex items-center justify-center shrink-0 ${role.bg}`}>
          <RoleIcon size={14} className={role.color} />
        </div>

        {/* Agent name */}
        <span
          className="text-sm text-text-primary hover:text-accent-primary truncate flex-1"
          onClick={() => node.agent_id && navigate(`/agents/${node.agent_id}`)}
        >
          {node.agent_name || 'Unknown Agent'}
        </span>

        {/* Layer badge */}
        <span className="text-[10px] text-text-muted bg-bg-elevated px-1.5 py-0.5 rounded font-mono shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          L{node.layer || 0}
        </span>

        {/* Role label */}
        <span className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${role.bg} ${role.color}`}>
          {role.label}
        </span>
      </div>

      {/* Children */}
      {hasChildren && !collapsed && (
        <div className="relative">
          {/* Connection line */}
          <div
            className="absolute top-0 bottom-0 border-l border-border"
            style={{ left: `${(depth + 1) * 24 + 12}px` }}
          />
          {node.children.map((child, idx) => (
            <TreeNode key={child.agent_id || idx} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function HierarchyPage() {
  const [domains, setDomains] = useState([]);
  const [selectedDomain, setSelectedDomain] = useState('');
  const [tree, setTree] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadDomains(); }, []);

  useEffect(() => {
    if (selectedDomain) loadTree(selectedDomain);
  }, [selectedDomain]);

  const loadDomains = async () => {
    try {
      const data = await api.get('/domains');
      const domainList = data.domains || [];
      setDomains(domainList);
      if (domainList.length > 0) {
        setSelectedDomain(domainList[0].id);
      }
    } catch (err) {
      console.error('Failed to load domains:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadTree = async (domainId) => {
    try {
      setLoading(true);
      const data = await api.get(`/hierarchies/tree/${domainId}`);
      setTree(data.tree || []);
    } catch (err) {
      console.error('Failed to load hierarchy:', err);
      setTree([]);
    } finally {
      setLoading(false);
    }
  };

  // Count total agents across tree
  const countNodes = (nodes) => {
    let count = 0;
    for (const node of nodes) {
      count++;
      if (node.children) count += countNodes(node.children);
    }
    return count;
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
            <GitBranch size={24} /> Agent Hierarchy
          </h1>
          <p className="text-text-muted text-sm mt-1">
            Visualize agent relationships — commanders, coordinators, and specialists.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Domain selector */}
          <div className="flex items-center gap-2">
            <Globe size={16} className="text-text-muted" />
            <select
              value={selectedDomain}
              onChange={e => setSelectedDomain(e.target.value)}
              className="bg-bg-secondary border border-border rounded-lg px-3 py-1.5 text-sm text-text-primary"
            >
              {domains.length === 0 && <option value="">No domains</option>}
              {domains.map(d => (
                <option key={d.id} value={d.id}>{d.display_name}</option>
              ))}
            </select>
          </div>
          <Button variant="secondary" onClick={() => selectedDomain && loadTree(selectedDomain)}>
            <RefreshCw size={16} /> Refresh
          </Button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex gap-4 flex-wrap">
        {Object.entries(ROLE_CONFIG).map(([key, config]) => {
          const Icon = config.icon;
          return (
            <div key={key} className="flex items-center gap-1.5 text-xs text-text-muted">
              <div className={`w-5 h-5 rounded flex items-center justify-center ${config.bg}`}>
                <Icon size={12} className={config.color} />
              </div>
              <span>{config.label}</span>
            </div>
          );
        })}
        <div className="border-l border-border pl-4 flex gap-3">
          {Object.entries(STATUS_COLORS).map(([status, color]) => (
            <div key={status} className="flex items-center gap-1 text-xs text-text-muted">
              <div className={`w-2 h-2 rounded-full ${color}`} />
              <span className="capitalize">{status}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Tree */}
      {loading ? (
        <div className="flex items-center justify-center h-64 text-text-muted">
          Loading hierarchy...
        </div>
      ) : tree.length === 0 ? (
        <div className="text-center py-16 text-text-muted">
          <GitBranch size={48} className="mx-auto mb-4 opacity-30" />
          <p>No agent hierarchy found for this domain.</p>
          <p className="text-sm mt-1">
            {domains.length === 0
              ? 'Create a domain first, then add agents with parent relationships.'
              : 'Add agents to this domain and set up parent/child relationships.'
            }
          </p>
        </div>
      ) : (
        <div className="bg-bg-secondary border border-border rounded-lg p-4">
          <div className="text-xs text-text-muted mb-3">
            {countNodes(tree)} agents in hierarchy
          </div>
          {tree.map((rootNode, idx) => (
            <TreeNode key={rootNode.agent_id || idx} node={rootNode} depth={0} />
          ))}
        </div>
      )}
    </div>
  );
}
