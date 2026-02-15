/**
 * @file CostDashboardPage.jsx
 * @description Cost tracking and analytics dashboard
 */

import { useState, useEffect } from 'react';
import { DollarSign, TrendingUp, Calendar, AlertTriangle } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#6366f1'];

export default function CostDashboardPage() {
  const [summary, setSummary] = useState(null);
  const [byAgent, setByAgent] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [projections, setProjections] = useState(null);
  const [loading, setLoading] = useState(true);
  const [timelinePeriod, setTimelinePeriod] = useState('day');

  useEffect(() => {
    fetchAllData();
  }, [timelinePeriod]);

  const fetchAllData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        fetchSummary(),
        fetchByAgent(),
        fetchTimeline(),
        fetchProjections(),
      ]);
    } catch (error) {
      console.error('Failed to fetch cost data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchSummary = async () => {
    const response = await fetch('/api/costs/summary');
    const data = await response.json();
    if (data.success) {
      setSummary(data.summary);
    }
  };

  const fetchByAgent = async () => {
    const response = await fetch('/api/costs/by-agent');
    const data = await response.json();
    if (data.success) {
      setByAgent(data.breakdown);
    }
  };

  const fetchTimeline = async () => {
    const response = await fetch(`/api/costs/timeline?period=${timelinePeriod}&days=30`);
    const data = await response.json();
    if (data.success) {
      setTimeline(data.timeline);
    }
  };

  const fetchProjections = async () => {
    const response = await fetch('/api/costs/projections');
    const data = await response.json();
    if (data.success) {
      setProjections(data.projections);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    }).format(amount || 0);
  };

  const formatNumber = (num) => {
    return new Intl.NumberFormat('en-US').format(num || 0);
  };

  if (loading) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="text-center py-12">
          <div className="text-gray-600">Loading cost data...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <DollarSign className="w-8 h-8 text-green-600" />
          <h1 className="text-3xl font-bold">Cost Dashboard</h1>
        </div>
        <p className="text-gray-600">
          Track and analyze AI agent costs across all operations
        </p>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white p-4 rounded-lg border border-gray-200">
            <div className="text-sm text-gray-600 mb-1">Total Cost</div>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(summary.total_cost)}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {formatNumber(summary.total_runs)} runs
            </div>
          </div>

          <div className="bg-white p-4 rounded-lg border border-gray-200">
            <div className="text-sm text-gray-600 mb-1">Avg Cost/Run</div>
            <div className="text-2xl font-bold">
              {formatCurrency(summary.avg_cost_per_run)}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {formatNumber(summary.total_tokens)} tokens
            </div>
          </div>

          <div className="bg-white p-4 rounded-lg border border-gray-200">
            <div className="text-sm text-gray-600 mb-1">Last 24 Hours</div>
            <div className="text-2xl font-bold text-blue-600">
              {formatCurrency(summary.cost_last_24h)}
            </div>
          </div>

          <div className="bg-white p-4 rounded-lg border border-gray-200">
            <div className="text-sm text-gray-600 mb-1">Last 7 Days</div>
            <div className="text-2xl font-bold text-purple-600">
              {formatCurrency(summary.cost_last_7d)}
            </div>
          </div>
        </div>
      )}

      {/* Projections */}
      {projections && (
        <div className="bg-gradient-to-r from-blue-50 to-purple-50 p-6 rounded-lg border border-blue-200 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-5 h-5 text-blue-600" />
            <h2 className="font-semibold text-lg">Cost Projections</h2>
            <span className="text-xs text-gray-600">(based on last 7 days)</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <div className="text-sm text-gray-600">Daily Average</div>
              <div className="text-xl font-bold text-blue-600">
                {formatCurrency(projections.daily_avg)}
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Weekly Projected</div>
              <div className="text-xl font-bold">
                {formatCurrency(projections.weekly_projected)}
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Monthly Projected</div>
              <div className="text-xl font-bold text-purple-600">
                {formatCurrency(projections.monthly_projected)}
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Annual Projected</div>
              <div className="text-xl font-bold text-indigo-600">
                {formatCurrency(projections.annual_projected)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cost Timeline Chart */}
      <div className="bg-white p-6 rounded-lg border border-gray-200 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-lg">Cost Over Time</h2>
          <select
            value={timelinePeriod}
            onChange={(e) => setTimelinePeriod(e.target.value)}
            className="px-3 py-1 border border-gray-300 rounded-md text-sm"
          >
            <option value="hour">Hourly</option>
            <option value="day">Daily</option>
            <option value="week">Weekly</option>
            <option value="month">Monthly</option>
          </select>
        </div>
        {timeline.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={timeline}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="period" />
              <YAxis />
              <Tooltip
                formatter={(value, name) => {
                  if (name === 'cost') return formatCurrency(value);
                  if (name === 'tokens') return formatNumber(value);
                  return value;
                }}
              />
              <Line
                type="monotone"
                dataKey="cost"
                stroke="#3b82f6"
                strokeWidth={2}
                name="Cost"
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="text-center py-12 text-gray-500">
            No cost data available for the selected period
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Cost by Agent */}
        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <h2 className="font-semibold text-lg mb-4">Cost by Agent</h2>
          {byAgent.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={byAgent.slice(0, 6)}
                    dataKey="total_cost"
                    nameKey="agent_name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label={(entry) => `${entry.agent_name}: ${formatCurrency(entry.total_cost)}`}
                  >
                    {byAgent.slice(0, 6).map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => formatCurrency(value)} />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-4 space-y-2">
                {byAgent.slice(0, 5).map((agent, index) => (
                  <div key={agent.agent_id} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: COLORS[index % COLORS.length] }}
                      />
                      <span className="font-medium">{agent.agent_name || 'Unknown'}</span>
                    </div>
                    <div className="text-gray-600">
                      {formatCurrency(agent.total_cost)} ({agent.run_count} runs)
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="text-center py-12 text-gray-500">
              No agent cost data available
            </div>
          )}
        </div>

        {/* Most Expensive Agent */}
        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <h2 className="font-semibold text-lg mb-4">Top Cost Insights</h2>
          {summary?.most_expensive_agent ? (
            <div className="space-y-4">
              <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                <div className="text-sm text-gray-600 mb-1">Most Expensive Agent</div>
                <div className="font-semibold text-lg">{summary.most_expensive_agent.agent_name}</div>
                <div className="text-2xl font-bold text-blue-600 mt-2">
                  {formatCurrency(summary.most_expensive_agent.total_cost)}
                </div>
                <div className="text-sm text-gray-600 mt-1">
                  {summary.most_expensive_agent.run_count} runs • Avg: {formatCurrency(summary.most_expensive_agent.avg_cost)}
                </div>
              </div>

              {summary.costliest_run && (
                <div className="p-4 bg-amber-50 rounded-lg border border-amber-200">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    <div className="text-sm text-gray-600">Costliest Single Run</div>
                  </div>
                  <div className="font-semibold">{summary.costliest_run.agent_name}</div>
                  <div className="text-2xl font-bold text-amber-600 mt-2">
                    {formatCurrency(summary.costliest_run.cost_usd)}
                  </div>
                  <div className="text-sm text-gray-600 mt-1">
                    {formatNumber(summary.costliest_run.tokens_used)} tokens
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-12 text-gray-500">
              No cost insights available
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
