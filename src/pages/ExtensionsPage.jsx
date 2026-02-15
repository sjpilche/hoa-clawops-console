/**
 * @file ExtensionsPage.jsx
 * @description OpenClaw extension management — discover, configure, and monitor extensions.
 */

import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import {
  Puzzle, RefreshCw, ChevronDown, ChevronRight,
  CheckCircle, XCircle, AlertCircle, Wrench, Settings
} from 'lucide-react';
import Button from '@/components/ui/Button';

export default function ExtensionsPage() {
  const [extensions, setExtensions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [expandedExt, setExpandedExt] = useState(null);

  useEffect(() => { loadExtensions(); }, []);

  const loadExtensions = async () => {
    try {
      setLoading(true);
      const data = await api.get('/extensions');
      setExtensions(data.extensions || []);
    } catch (err) {
      console.error('Failed to load extensions:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    try {
      setSyncing(true);
      setSyncResult(null);
      const result = await api.post('/extensions/sync');
      setSyncResult(result);
      loadExtensions();
    } catch (err) {
      setSyncResult({ errors: [err.message] });
    } finally {
      setSyncing(false);
    }
  };

  const toggleExtension = async (id, enabled) => {
    try {
      await api.post(`/extensions/${id}/${enabled ? 'disable' : 'enable'}`);
      loadExtensions();
    } catch (err) {
      console.error('Failed to toggle extension:', err);
    }
  };

  const loadTools = async (extId) => {
    if (expandedExt === extId) {
      setExpandedExt(null);
      return;
    }
    try {
      const data = await api.get(`/extensions/${extId}/tools`);
      const ext = extensions.find(e => e.id === extId);
      if (ext) ext._tools = data.tools || [];
      setExtensions([...extensions]);
      setExpandedExt(extId);
    } catch (err) {
      console.error('Failed to load tools:', err);
    }
  };

  const statusIcon = (status) => {
    switch (status) {
      case 'active': return <CheckCircle size={14} className="text-accent-success" />;
      case 'inactive': return <XCircle size={14} className="text-text-muted" />;
      case 'error': return <AlertCircle size={14} className="text-accent-danger" />;
      default: return <AlertCircle size={14} className="text-accent-warning" />;
    }
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <p className="text-text-muted">Loading extensions...</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
            <Puzzle size={24} /> Extensions
          </h1>
          <p className="text-text-muted text-sm mt-1">
            OpenClaw extensions provide MCP tools that agents use to interact with external systems.
          </p>
        </div>
        <Button onClick={handleSync} disabled={syncing}>
          <RefreshCw size={16} className={syncing ? 'animate-spin' : ''} />
          {syncing ? 'Syncing...' : 'Sync from OpenClaw'}
        </Button>
      </div>

      {/* Sync Result */}
      {syncResult && (
        <div className={`p-3 rounded-lg border text-sm ${syncResult.errors?.length > 0 ? 'bg-accent-warning/10 border-accent-warning/30' : 'bg-accent-success/10 border-accent-success/30'}`}>
          <p className="font-medium">
            Synced {syncResult.extensions || 0} extensions with {syncResult.tools || 0} tools.
          </p>
          {syncResult.errors?.length > 0 && (
            <ul className="mt-1 text-xs text-accent-warning">
              {syncResult.errors.map((err, i) => <li key={i}>- {err}</li>)}
            </ul>
          )}
        </div>
      )}

      {/* Extensions List */}
      {extensions.length === 0 ? (
        <div className="text-center py-16 text-text-muted">
          <Puzzle size={48} className="mx-auto mb-4 opacity-30" />
          <p>No extensions discovered.</p>
          <p className="text-sm mt-1">Click "Sync from OpenClaw" to discover installed extensions.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {extensions.map(ext => (
            <div key={ext.id} className="bg-bg-secondary border border-border rounded-lg overflow-hidden">
              {/* Extension Header */}
              <div className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-accent-primary/10 flex items-center justify-center">
                    <Puzzle size={20} className="text-accent-primary" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-text-primary">{ext.name}</h3>
                      {statusIcon(ext.status)}
                      {ext.version && (
                        <span className="text-xs text-text-muted bg-bg-elevated px-1.5 py-0.5 rounded font-mono">
                          v{ext.version}
                        </span>
                      )}
                    </div>
                    {ext.description && (
                      <p className="text-xs text-text-muted mt-0.5">{ext.description}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {/* Tool count badge */}
                  <button
                    onClick={() => loadTools(ext.id)}
                    className="flex items-center gap-1 text-xs text-text-muted hover:text-text-primary bg-bg-elevated px-2 py-1 rounded transition-colors"
                  >
                    <Wrench size={12} />
                    {ext.tools_count || 0} tools
                    {expandedExt === ext.id ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  </button>

                  {/* Enable/disable toggle */}
                  <button
                    onClick={() => toggleExtension(ext.id, ext.enabled)}
                    className={`w-10 h-5 rounded-full transition-colors relative ${ext.enabled ? 'bg-accent-success' : 'bg-bg-elevated'}`}
                  >
                    <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform ${ext.enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </button>
                </div>
              </div>

              {/* Expanded Tools List */}
              {expandedExt === ext.id && ext._tools && (
                <div className="border-t border-border px-4 py-3 bg-bg-elevated/50">
                  <div className="text-xs font-medium text-text-muted mb-2 uppercase tracking-wide">
                    MCP Tools ({ext._tools.length})
                  </div>
                  {ext._tools.length === 0 ? (
                    <p className="text-xs text-text-muted">No tools discovered for this extension.</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {ext._tools.map(tool => (
                        <div key={tool.id} className="bg-bg-secondary rounded p-2 border border-border">
                          <div className="flex items-center gap-1.5">
                            <Wrench size={12} className="text-accent-primary shrink-0" />
                            <span className="font-mono text-xs text-text-primary truncate">{tool.name}</span>
                          </div>
                          {tool.category && (
                            <span className="text-[10px] text-text-muted bg-bg-elevated px-1 py-0.5 rounded mt-1 inline-block">
                              {tool.category}
                            </span>
                          )}
                          {tool.description && (
                            <p className="text-[10px] text-text-muted mt-1 line-clamp-2">{tool.description}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
