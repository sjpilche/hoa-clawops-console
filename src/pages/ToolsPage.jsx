/**
 * @file ToolsPage.jsx
 * @description MCP tool catalog — browse and search all available tools.
 */

import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Wrench, Search, Filter, Puzzle, Hash } from 'lucide-react';
import Input from '@/components/ui/Input';

export default function ToolsPage() {
  const [tools, setTools] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState(null);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [toolsRes, catsRes] = await Promise.all([
        api.get('/tools'),
        api.get('/tools/categories'),
      ]);
      setTools(toolsRes.tools || []);
      setCategories(catsRes.categories || []);
    } catch (err) {
      console.error('Failed to load tools:', err);
    } finally {
      setLoading(false);
    }
  };

  // Filter tools by search and category
  const filteredTools = tools.filter(tool => {
    const matchesSearch = !search ||
      tool.name.toLowerCase().includes(search.toLowerCase()) ||
      (tool.display_name && tool.display_name.toLowerCase().includes(search.toLowerCase())) ||
      (tool.description && tool.description.toLowerCase().includes(search.toLowerCase()));
    const matchesCategory = !activeCategory || tool.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <p className="text-text-muted">Loading tools...</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
          <Wrench size={24} /> Tool Catalog
        </h1>
        <p className="text-text-muted text-sm mt-1">
          Browse all MCP tools available from installed extensions.
          {tools.length > 0 && <span className="ml-1 font-medium">{tools.length} tools total.</span>}
        </p>
      </div>

      {/* Search + Filters */}
      <div className="flex gap-4">
        <div className="flex-1 relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search tools by name or description..."
            className="w-full bg-bg-secondary border border-border rounded-lg pl-9 pr-4 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-primary"
          />
        </div>
      </div>

      {/* Category Pills */}
      {categories.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setActiveCategory(null)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${!activeCategory ? 'bg-accent-primary text-white' : 'bg-bg-elevated text-text-muted hover:text-text-primary'}`}
          >
            All ({tools.length})
          </button>
          {categories.map(cat => (
            <button
              key={cat.category}
              onClick={() => setActiveCategory(activeCategory === cat.category ? null : cat.category)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${activeCategory === cat.category ? 'bg-accent-primary text-white' : 'bg-bg-elevated text-text-muted hover:text-text-primary'}`}
            >
              {cat.category} ({cat.count})
            </button>
          ))}
        </div>
      )}

      {/* Tools Grid */}
      {filteredTools.length === 0 ? (
        <div className="text-center py-16 text-text-muted">
          <Wrench size={48} className="mx-auto mb-4 opacity-30" />
          <p>{search || activeCategory ? 'No tools match your filters.' : 'No tools discovered yet.'}</p>
          <p className="text-sm mt-1">Go to Extensions and click "Sync from OpenClaw" to discover tools.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {filteredTools.map(tool => (
            <div key={tool.id} className="bg-bg-secondary border border-border rounded-lg p-4 hover:border-accent-primary/30 transition-colors">
              <div className="flex items-start gap-2 mb-2">
                <Wrench size={16} className="text-accent-primary shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <h3 className="font-mono text-sm text-text-primary truncate">{tool.name}</h3>
                  {tool.display_name && tool.display_name !== tool.name && (
                    <p className="text-xs text-text-secondary">{tool.display_name}</p>
                  )}
                </div>
              </div>

              {tool.description && (
                <p className="text-xs text-text-muted mb-3 line-clamp-3">{tool.description}</p>
              )}

              <div className="flex items-center gap-2 flex-wrap">
                {tool.category && (
                  <span className="text-[10px] font-medium bg-accent-primary/10 text-accent-primary px-1.5 py-0.5 rounded">
                    {tool.category}
                  </span>
                )}
                {tool.extension_name && (
                  <span className="text-[10px] text-text-muted flex items-center gap-0.5">
                    <Puzzle size={10} /> {tool.extension_name}
                  </span>
                )}
                {tool.usage_count > 0 && (
                  <span className="text-[10px] text-text-muted flex items-center gap-0.5">
                    <Hash size={10} /> {tool.usage_count} uses
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
