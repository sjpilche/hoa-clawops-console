import { useState, useEffect } from 'react';
import { api } from '../lib/api';

export default function HOALeadsPage() {
  const [leads, setLeads] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [leadsRes, statsRes] = await Promise.all([
        api.get('/hoa-leads?limit=100'),
        api.get('/hoa-leads/stats')
      ]);
      if (leadsRes.success) setLeads(leadsRes.leads);
      if (statsRes.success) setStats(statsRes.stats);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="p-6 text-text-muted">Loading...</div>;

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-6 text-text-primary">HOA Lead Agent Results</h1>

      {stats && (
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-bg-secondary border border-border p-4 rounded-lg">
            <div className="text-text-muted text-sm">Total</div>
            <div className="text-2xl font-bold text-text-primary">{stats.overall.total}</div>
          </div>
          <div className="bg-bg-secondary border border-border p-4 rounded-lg">
            <div className="text-text-muted text-sm">With Email</div>
            <div className="text-2xl font-bold text-accent-success">{stats.overall.with_email}</div>
          </div>
          <div className="bg-bg-secondary border border-border p-4 rounded-lg">
            <div className="text-text-muted text-sm">High Value</div>
            <div className="text-2xl font-bold text-accent-info">{stats.overall.high_value}</div>
          </div>
          <div className="bg-bg-secondary border border-border p-4 rounded-lg">
            <div className="text-text-muted text-sm">Avg Score</div>
            <div className="text-2xl font-bold text-text-primary">{Math.round(stats.overall.avg_score)}</div>
          </div>
        </div>
      )}

      {leads.length === 0 ? (
        <div className="text-center py-12 text-text-muted">No leads found.</div>
      ) : (
        <div className="bg-bg-secondary border border-border rounded-lg overflow-hidden">
          <table className="min-w-full">
            <thead className="bg-bg-elevated">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">Company</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">Contact</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">Email</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">Location</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {leads.map(lead => (
                <tr key={lead.id} className="hover:bg-bg-elevated transition-colors">
                  <td className="px-4 py-3 text-sm text-text-primary">{lead.hoa_name}</td>
                  <td className="px-4 py-3 text-sm text-text-secondary">{lead.contact_person || '—'}</td>
                  <td className="px-4 py-3 text-sm">
                    {lead.email
                      ? <a href={`mailto:${lead.email}`} className="text-accent-info hover:underline">{lead.email}</a>
                      : <span className="text-text-muted">—</span>}
                  </td>
                  <td className="px-4 py-3 text-sm text-text-secondary">{lead.city}, {lead.state}</td>
                  <td className="px-4 py-3 text-sm text-text-primary">{lead.confidence_score}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
