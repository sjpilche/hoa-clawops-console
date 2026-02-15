/**
 * @file DomainsPage.jsx
 * @description Business domain management — create, view, and configure domains.
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import {
  Globe, Plus, Trash2, Edit2, ExternalLink, Database,
  Bot, Activity, CheckCircle, XCircle, Megaphone,
  Building2, DollarSign, Box, RefreshCw
} from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';

const ICON_MAP = { Megaphone, Building2, DollarSign, Box, Globe, Bot, Database, Activity };

const DEFAULT_COLORS = ['#10b981', '#6366f1', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6'];

export default function DomainsPage() {
  const navigate = useNavigate();
  const [domains, setDomains] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [formData, setFormData] = useState({
    name: '', display_name: '', description: '', icon: 'Box',
    color: '#6366f1', db_type: '', db_config: { host: '', port: 5432, database: '', user: '', password: '' },
    dashboard_port: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { loadDomains(); }, []);

  const loadDomains = async () => {
    try {
      setLoading(true);
      const data = await api.get('/domains');
      setDomains(data.domains || []);
    } catch (err) {
      console.error('Failed to load domains:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    try {
      setSaving(true);
      setError('');
      const payload = {
        ...formData,
        db_type: formData.db_type || undefined,
        db_config: formData.db_type ? formData.db_config : undefined,
        dashboard_port: formData.dashboard_port ? Number(formData.dashboard_port) : undefined,
      };
      await api.post('/domains', payload);
      setShowCreate(false);
      setFormData({ name: '', display_name: '', description: '', icon: 'Box', color: '#6366f1', db_type: '', db_config: { host: '', port: 5432, database: '', user: '', password: '' }, dashboard_port: '' });
      loadDomains();
    } catch (err) {
      setError(err.message || 'Failed to create domain');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id, name) => {
    if (!confirm(`Delete domain "${name}"? Agents will be unlinked but not deleted.`)) return;
    try {
      await api.del(`/domains/${id}`);
      loadDomains();
    } catch (err) {
      console.error('Failed to delete domain:', err);
    }
  };

  const testConnection = async (id) => {
    try {
      const result = await api.post(`/domains/${id}/test-connection`);
      alert(result.success ? 'Connection successful!' : `Connection failed: ${result.error}`);
    } catch (err) {
      alert(`Test failed: ${err.message}`);
    }
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <p className="text-text-muted">Loading domains...</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
            <Globe size={24} /> Domains
          </h1>
          <p className="text-text-muted text-sm mt-1">
            Manage business domains — each domain groups agents, extensions, and tools.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={loadDomains}>
            <RefreshCw size={16} /> Refresh
          </Button>
          <Button onClick={() => setShowCreate(!showCreate)}>
            <Plus size={16} /> New Domain
          </Button>
        </div>
      </div>

      {/* Create Domain Form */}
      {showCreate && (
        <div className="bg-bg-secondary border border-border rounded-lg p-6 space-y-4">
          <h2 className="text-lg font-semibold text-text-primary">Create Domain</h2>
          {error && <div className="text-accent-danger text-sm bg-accent-danger/10 p-2 rounded">{error}</div>}

          <div className="grid grid-cols-2 gap-4">
            <Input label="Name (slug)" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-')})} placeholder="marketing" />
            <Input label="Display Name" value={formData.display_name} onChange={e => setFormData({...formData, display_name: e.target.value})} placeholder="Marketing Automation" />
          </div>

          <Input label="Description" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} placeholder="AI-powered multi-channel marketing" />

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-text-muted mb-1">Icon</label>
              <select value={formData.icon} onChange={e => setFormData({...formData, icon: e.target.value})}
                className="w-full bg-bg-elevated border border-border rounded px-3 py-2 text-sm text-text-primary">
                {Object.keys(ICON_MAP).map(icon => <option key={icon} value={icon}>{icon}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">Color</label>
              <div className="flex gap-1 flex-wrap">
                {DEFAULT_COLORS.map(c => (
                  <button key={c} onClick={() => setFormData({...formData, color: c})}
                    className={`w-6 h-6 rounded-full border-2 ${formData.color === c ? 'border-text-primary' : 'border-transparent'}`}
                    style={{ backgroundColor: c }} />
                ))}
              </div>
            </div>
            <Input label="Dashboard Port" value={formData.dashboard_port} onChange={e => setFormData({...formData, dashboard_port: e.target.value})} placeholder="18791" type="number" />
          </div>

          {/* Database Config */}
          <div>
            <label className="block text-xs text-text-muted mb-1">External Database (optional)</label>
            <select value={formData.db_type} onChange={e => setFormData({...formData, db_type: e.target.value})}
              className="w-full bg-bg-elevated border border-border rounded px-3 py-2 text-sm text-text-primary mb-2">
              <option value="">None</option>
              <option value="postgresql">PostgreSQL</option>
              <option value="mysql">MySQL</option>
              <option value="sqlite">SQLite</option>
            </select>

            {formData.db_type && (
              <div className="grid grid-cols-2 gap-2 bg-bg-elevated p-3 rounded border border-border">
                <Input label="Host" value={formData.db_config.host} onChange={e => setFormData({...formData, db_config: {...formData.db_config, host: e.target.value}})} placeholder="100.119.132.105" />
                <Input label="Port" value={formData.db_config.port} onChange={e => setFormData({...formData, db_config: {...formData.db_config, port: Number(e.target.value)}})} placeholder="5432" type="number" />
                <Input label="Database" value={formData.db_config.database} onChange={e => setFormData({...formData, db_config: {...formData.db_config, database: e.target.value}})} placeholder="nsg_marketing" />
                <Input label="User" value={formData.db_config.user} onChange={e => setFormData({...formData, db_config: {...formData.db_config, user: e.target.value}})} placeholder="postgres" />
              </div>
            )}
          </div>

          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving || !formData.name || !formData.display_name}>
              {saving ? 'Creating...' : 'Create Domain'}
            </Button>
          </div>
        </div>
      )}

      {/* Domain Grid */}
      {domains.length === 0 ? (
        <div className="text-center py-16 text-text-muted">
          <Globe size={48} className="mx-auto mb-4 opacity-30" />
          <p>No domains configured yet.</p>
          <p className="text-sm mt-1">Create your first domain to start organizing agents.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {domains.map(domain => {
            const DomainIcon = ICON_MAP[domain.icon] || Box;
            const stats = domain.stats || {};
            return (
              <div key={domain.id} className="bg-bg-secondary border border-border rounded-lg p-5 hover:border-accent-primary/30 transition-colors">
                {/* Header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${domain.color}20` }}>
                      <DomainIcon size={20} style={{ color: domain.color }} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-text-primary">{domain.display_name}</h3>
                      <p className="text-xs text-text-muted font-mono">{domain.name}</p>
                    </div>
                  </div>
                  <div className={`w-2 h-2 rounded-full mt-2 ${domain.status === 'active' ? 'bg-accent-success' : 'bg-text-muted'}`} />
                </div>

                {/* Description */}
                {domain.description && (
                  <p className="text-sm text-text-secondary mb-3 line-clamp-2">{domain.description}</p>
                )}

                {/* Stats */}
                <div className="grid grid-cols-3 gap-2 mb-4">
                  <div className="text-center bg-bg-elevated rounded p-2">
                    <div className="text-lg font-bold text-text-primary">{stats.agents || 0}</div>
                    <div className="text-[10px] text-text-muted">Agents</div>
                  </div>
                  <div className="text-center bg-bg-elevated rounded p-2">
                    <div className="text-lg font-bold text-text-primary">{stats.extensions || 0}</div>
                    <div className="text-[10px] text-text-muted">Extensions</div>
                  </div>
                  <div className="text-center bg-bg-elevated rounded p-2">
                    <div className="text-lg font-bold text-text-primary">{stats.success_rate || 0}%</div>
                    <div className="text-[10px] text-text-muted">Success</div>
                  </div>
                </div>

                {/* Database badge */}
                {domain.db_type && (
                  <div className="flex items-center gap-1 text-xs text-text-muted mb-3">
                    <Database size={12} />
                    <span>{domain.db_type.toUpperCase()}</span>
                    {domain.db_config?.host && <span>@ {domain.db_config.host}</span>}
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => navigate(`/domains/${domain.id}`)}>
                    <ExternalLink size={14} /> View
                  </Button>
                  {domain.db_type && (
                    <Button variant="secondary" size="sm" onClick={() => testConnection(domain.id)}>
                      <Activity size={14} /> Test DB
                    </Button>
                  )}
                  <Button variant="danger" size="sm" onClick={() => handleDelete(domain.id, domain.display_name)}>
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
