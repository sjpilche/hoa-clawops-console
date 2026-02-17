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
      if (leadsRes.data.success) setLeads(leadsRes.data.leads);
      if (statsRes.data.success) setStats(statsRes.data.stats);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="p-6">Loading...</div>;

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-6">HOA Lead Agent Results</h1>
      
      {stats && (
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-white p-4 rounded shadow">
            <div className="text-gray-600 text-sm">Total</div>
            <div className="text-2xl font-bold">{stats.overall.total}</div>
          </div>
          <div className="bg-white p-4 rounded shadow">
            <div className="text-gray-600 text-sm">With Email</div>
            <div className="text-2xl font-bold text-green-600">{stats.overall.with_email}</div>
          </div>
          <div className="bg-white p-4 rounded shadow">
            <div className="text-gray-600 text-sm">High Value</div>
            <div className="text-2xl font-bold text-blue-600">{stats.overall.high_value}</div>
          </div>
          <div className="bg-white p-4 rounded shadow">
            <div className="text-gray-600 text-sm">Avg Score</div>
            <div className="text-2xl font-bold">{Math.round(stats.overall.avg_score)}</div>
          </div>
        </div>
      )}

      <div className="bg-white rounded shadow">
        <table className="min-w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Company</th>
              <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Contact</th>
              <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Email</th>
              <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Location</th>
              <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Score</th>
            </tr>
          </thead>
          <tbody>
            {leads.map(lead => (
              <tr key={lead.id} className="border-t">
                <td className="px-4 py-2">{lead.hoa_name}</td>
                <td className="px-4 py-2">{lead.contact_person || '-'}</td>
                <td className="px-4 py-2">
                  {lead.email ? <a href={`mailto:${lead.email}`} className="text-blue-600">{lead.email}</a> : '-'}
                </td>
                <td className="px-4 py-2">{lead.city}, {lead.state}</td>
                <td className="px-4 py-2">{lead.confidence_score}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
