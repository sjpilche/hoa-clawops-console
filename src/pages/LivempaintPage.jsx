/**
 * @file LivempaintPage.jsx
 * @description Livempaint contacts viewer — 7K+ NSG warm contacts from Azure SQL.
 * Filter by segment, state, outreach status. Sort any column. Reassign client_type inline.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '@/lib/api';

// ── Segment config ────────────────────────────────────────────────────────────
const SEGMENTS = [
  { value: 'all',              label: 'All',              color: 'bg-bg-elevated text-text-secondary' },
  { value: 'Property Manager', label: 'Property Manager', color: 'bg-blue-500/20 text-blue-400' },
  { value: 'General Contractor',label: 'GC',             color: 'bg-orange-500/20 text-orange-400' },
  { value: 'Subcontractor',    label: 'Subcontractor',   color: 'bg-yellow-500/20 text-yellow-400' },
  { value: 'HOA Board',        label: 'HOA Board',       color: 'bg-green-500/20 text-green-400' },
  { value: 'Owner',            label: 'Owner',            color: 'bg-purple-500/20 text-purple-400' },
  { value: 'Unknown',          label: 'Unknown',          color: 'bg-bg-elevated text-text-muted' },
];

const SEGMENT_BADGE = {
  'Property Manager':   'bg-blue-500/20 text-blue-400',
  'General Contractor': 'bg-orange-500/20 text-orange-400',
  'Subcontractor':      'bg-yellow-500/20 text-yellow-400',
  'HOA Board':          'bg-green-500/20 text-green-400',
  'Owner':              'bg-purple-500/20 text-purple-400',
  'Law Firm':           'bg-red-500/20 text-red-400',
  'Unknown':            'bg-bg-elevated text-text-muted',
};

const STATUS_BADGE = {
  new:           'bg-accent-info/20 text-accent-info',
  contacted:     'bg-accent-warning/20 text-accent-warning',
  replied:       'bg-accent-success/20 text-accent-success',
  unsubscribed:  'bg-accent-danger/20 text-accent-danger',
};

const VALID_TYPES = [
  'Property Manager',
  'General Contractor',
  'Subcontractor',
  'HOA Board',
  'Owner',
  'Law Firm',
  'Unknown',
];

const SORT_DIRS = { score: 'desc', name: 'asc', company: 'asc', state: 'asc', status: 'asc' };

// ── Debounce hook ─────────────────────────────────────────────────────────────
function useDebounce(value, delay = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// ── Main component ────────────────────────────────────────────────────────────
export default function LivempaintPage() {
  const [contacts, setContacts] = useState([]);
  const [stats, setStats]       = useState(null);
  const [total, setTotal]       = useState(0);
  const [loading, setLoading]   = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [error, setError]       = useState(null);

  // Filters
  const [segment, setSegment]         = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [stateFilter, setStateFilter]  = useState('all');
  const [search, setSearch]           = useState('');
  const debouncedSearch               = useDebounce(search);

  // Sort
  const [sortKey, setSortKey] = useState('score');
  const [sortDir, setSortDir] = useState('desc');

  // Pagination
  const [offset, setOffset] = useState(0);
  const LIMIT = 50;

  // Inline type editing
  const [editingId, setEditingId]   = useState(null);
  const [savingId, setSavingId]     = useState(null);
  const selectRef = useRef(null);

  // ── Fetch contacts ──────────────────────────────────────────────────────────
  const fetchContacts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        limit:  LIMIT,
        offset: offset,
        sort:   sortKey,
        dir:    sortDir,
      });
      if (segment !== 'all')      params.set('client_type', segment);
      if (statusFilter !== 'all') params.set('outreach_status', statusFilter);
      if (stateFilter !== 'all')  params.set('state', stateFilter);
      if (debouncedSearch)        params.set('search', debouncedSearch);

      const res = await api.get(`/livempaint?${params}`);
      if (res.error) throw new Error(res.error);
      setContacts(res.contacts || []);
      setTotal(res.total || 0);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [segment, statusFilter, stateFilter, debouncedSearch, sortKey, sortDir, offset]);

  // ── Fetch stats (once on mount) ─────────────────────────────────────────────
  useEffect(() => {
    api.get('/livempaint/stats')
      .then(res => { if (!res.error) setStats(res); })
      .finally(() => setStatsLoading(false));
  }, []);

  // ── Re-fetch when filters/sort/page change ──────────────────────────────────
  useEffect(() => {
    setOffset(0); // reset to page 1 on filter change
  }, [segment, statusFilter, stateFilter, debouncedSearch, sortKey, sortDir]);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  // ── Sort toggle ─────────────────────────────────────────────────────────────
  function handleSort(key) {
    if (key === sortKey) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir(SORT_DIRS[key] || 'asc');
    }
  }

  // ── Inline type update ──────────────────────────────────────────────────────
  async function handleTypeChange(id, newType) {
    setSavingId(id);
    setEditingId(null);
    try {
      const res = await api.patch(`/livempaint/${id}`, { client_type: newType });
      if (res.error) throw new Error(res.error);
      setContacts(prev => prev.map(c => c.id === id ? { ...c, client_type: newType } : c));
    } catch (err) {
      alert(`Failed to update type: ${err.message}`);
    } finally {
      setSavingId(null);
    }
  }

  // ── Click outside to close dropdown ────────────────────────────────────────
  useEffect(() => {
    function onClickOutside(e) {
      if (selectRef.current && !selectRef.current.contains(e.target)) {
        setEditingId(null);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  // ── Sort indicator ─────────────────────────────────────────────────────────
  function SortArrow({ col }) {
    if (col !== sortKey) return <span className="ml-1 text-text-muted opacity-40">↕</span>;
    return <span className="ml-1 text-accent-primary">{sortDir === 'asc' ? '↑' : '↓'}</span>;
  }

  const totalPages = Math.ceil(total / LIMIT);
  const currentPage = Math.floor(offset / LIMIT) + 1;

  return (
    <div className="space-y-6">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Livempaint Contacts</h1>
          <p className="text-sm text-text-muted mt-1">
            NSG Empire Painting customers — warm contacts for HOA + Jake outreach
          </p>
        </div>
        {!statsLoading && stats && (
          <div className="text-right">
            <div className="text-2xl font-bold text-accent-primary">{stats.total.toLocaleString()}</div>
            <div className="text-xs text-text-muted">contacts with email</div>
          </div>
        )}
      </div>

      {/* ── Stats cards ────────────────────────────────────────────────────── */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {stats.byType.slice(0, 4).map(t => (
            <button
              key={t.client_type}
              onClick={() => setSegment(segment === t.client_type ? 'all' : t.client_type)}
              className={`p-3 rounded-lg border text-left transition-all cursor-pointer ${
                segment === t.client_type
                  ? 'border-accent-primary bg-accent-primary/10'
                  : 'border-border bg-bg-secondary hover:bg-bg-elevated'
              }`}
            >
              <div className="text-xs text-text-muted mb-1">{t.client_type || 'Unknown'}</div>
              <div className="text-xl font-bold text-text-primary">{t.cnt.toLocaleString()}</div>
            </button>
          ))}
        </div>
      )}

      {/* ── Outreach status strip ──────────────────────────────────────────── */}
      {stats && (
        <div className="flex gap-3 flex-wrap">
          {stats.byStatus.map(s => (
            <button
              key={s.outreach_status}
              onClick={() => setStatusFilter(statusFilter === s.outreach_status ? 'all' : s.outreach_status)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all cursor-pointer ${
                STATUS_BADGE[s.outreach_status] || 'bg-bg-elevated text-text-muted'
              } ${statusFilter === s.outreach_status ? 'ring-2 ring-offset-1 ring-offset-bg-primary ring-accent-primary' : 'opacity-70 hover:opacity-100'}`}
            >
              {s.outreach_status || 'unknown'} ({s.cnt.toLocaleString()})
            </button>
          ))}
        </div>
      )}

      {/* ── Filter bar ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-3 items-center">

        {/* Search */}
        <input
          type="text"
          placeholder="Search name, company, email..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="px-3 py-2 bg-bg-secondary border border-border rounded-lg text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent-primary w-64"
        />

        {/* Segment pills */}
        <div className="flex gap-1 flex-wrap">
          {SEGMENTS.map(seg => (
            <button
              key={seg.value}
              onClick={() => setSegment(seg.value)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all cursor-pointer ${seg.color} ${
                segment === seg.value ? 'ring-2 ring-accent-primary' : 'opacity-60 hover:opacity-100'
              }`}
            >
              {seg.label}
            </button>
          ))}
        </div>

        {/* State filter */}
        {stats?.topStates?.length > 0 && (
          <select
            value={stateFilter}
            onChange={e => setStateFilter(e.target.value)}
            className="px-3 py-2 bg-bg-secondary border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:border-accent-primary cursor-pointer"
          >
            <option value="all">All states</option>
            {stats.topStates.map(s => (
              <option key={s.state} value={s.state}>{s.state} ({s.cnt})</option>
            ))}
          </select>
        )}

        {/* Clear filters */}
        {(segment !== 'all' || statusFilter !== 'all' || stateFilter !== 'all' || search) && (
          <button
            onClick={() => { setSegment('all'); setStatusFilter('all'); setStateFilter('all'); setSearch(''); }}
            className="px-3 py-1.5 text-xs text-text-muted hover:text-text-primary border border-border rounded-lg transition-colors cursor-pointer"
          >
            Clear filters
          </button>
        )}

        <div className="ml-auto text-xs text-text-muted">
          {total.toLocaleString()} contacts
        </div>
      </div>

      {/* ── Error ──────────────────────────────────────────────────────────── */}
      {error && (
        <div className="p-4 bg-accent-danger/10 border border-accent-danger/30 rounded-lg text-accent-danger text-sm">
          Azure SQL error: {error}
        </div>
      )}

      {/* ── Table ──────────────────────────────────────────────────────────── */}
      <div className="bg-bg-secondary border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-bg-elevated border-b border-border">
              <tr>
                <th
                  onClick={() => handleSort('name')}
                  className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider cursor-pointer hover:text-text-primary select-none"
                >
                  Name <SortArrow col="name" />
                </th>
                <th
                  onClick={() => handleSort('company')}
                  className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider cursor-pointer hover:text-text-primary select-none"
                >
                  Company <SortArrow col="company" />
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                  Email
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                  Type
                </th>
                <th
                  onClick={() => handleSort('state')}
                  className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider cursor-pointer hover:text-text-primary select-none"
                >
                  Location <SortArrow col="state" />
                </th>
                <th
                  onClick={() => handleSort('score')}
                  className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider cursor-pointer hover:text-text-primary select-none"
                >
                  Score <SortArrow col="score" />
                </th>
                <th
                  onClick={() => handleSort('status')}
                  className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider cursor-pointer hover:text-text-primary select-none"
                >
                  Status <SortArrow col="status" />
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-text-muted">
                    Loading contacts...
                  </td>
                </tr>
              ) : contacts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-text-muted">
                    No contacts match these filters.
                  </td>
                </tr>
              ) : (
                contacts.map(c => (
                  <tr key={c.id} className="hover:bg-bg-elevated transition-colors">

                    {/* Name */}
                    <td className="px-4 py-3 text-text-primary font-medium whitespace-nowrap">
                      {c.full_name || '—'}
                      {c.title && (
                        <div className="text-xs text-text-muted font-normal">{c.title}</div>
                      )}
                    </td>

                    {/* Company */}
                    <td className="px-4 py-3 text-text-secondary max-w-[200px] truncate" title={c.company_name}>
                      {c.company_name || '—'}
                    </td>

                    {/* Email */}
                    <td className="px-4 py-3">
                      <a
                        href={`mailto:${c.email}`}
                        className="text-accent-info hover:underline text-xs"
                      >
                        {c.email}
                      </a>
                    </td>

                    {/* Type — inline editable */}
                    <td className="px-4 py-3 relative" ref={editingId === c.id ? selectRef : null}>
                      {savingId === c.id ? (
                        <span className="text-xs text-text-muted">Saving...</span>
                      ) : editingId === c.id ? (
                        <select
                          autoFocus
                          defaultValue={c.client_type || 'Unknown'}
                          onChange={e => handleTypeChange(c.id, e.target.value)}
                          onBlur={() => setEditingId(null)}
                          className="px-2 py-1 bg-bg-elevated border border-accent-primary rounded text-xs text-text-primary focus:outline-none cursor-pointer"
                        >
                          {VALID_TYPES.map(t => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                      ) : (
                        <button
                          onClick={() => setEditingId(c.id)}
                          title="Click to reassign type"
                          className={`px-2 py-0.5 rounded text-xs font-medium cursor-pointer hover:ring-1 hover:ring-accent-primary transition-all ${
                            SEGMENT_BADGE[c.client_type] || 'bg-bg-elevated text-text-muted'
                          }`}
                        >
                          {c.client_type || 'Unknown'}
                        </button>
                      )}
                    </td>

                    {/* Location */}
                    <td className="px-4 py-3 text-text-secondary text-xs whitespace-nowrap">
                      {[c.city, c.state].filter(Boolean).join(', ') || '—'}
                    </td>

                    {/* Score */}
                    <td className="px-4 py-3">
                      <span className={`text-sm font-bold ${
                        c.pilot_fit_score >= 80 ? 'text-accent-success' :
                        c.pilot_fit_score >= 50 ? 'text-accent-warning' :
                        'text-text-muted'
                      }`}>
                        {c.pilot_fit_score ?? '—'}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        STATUS_BADGE[c.outreach_status] || 'bg-bg-elevated text-text-muted'
                      }`}>
                        {c.outreach_status || 'new'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-border flex items-center justify-between">
            <span className="text-xs text-text-muted">
              Page {currentPage} of {totalPages} &nbsp;·&nbsp; {total.toLocaleString()} total
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setOffset(Math.max(0, offset - LIMIT))}
                disabled={offset === 0}
                className="px-3 py-1 text-xs rounded border border-border text-text-secondary hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
              >
                Prev
              </button>
              <button
                onClick={() => setOffset(offset + LIMIT)}
                disabled={offset + LIMIT >= total}
                className="px-3 py-1 text-xs rounded border border-border text-text-secondary hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
