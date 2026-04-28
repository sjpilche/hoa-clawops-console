/**
 * @file CostDashboardPage.jsx
 * @description Cost tracking and analytics dashboard
 */

import { useState, useEffect } from 'react';
import { DollarSign, TrendingUp, AlertTriangle, RefreshCw } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import StatCard from '@/components/ui/StatCard';
import SectionHeader from '@/components/ui/SectionHeader';
import Button from '@/components/ui/Button';
import Tabs from '@/components/ui/Tabs';
import { CHART_COLORS, CHART_TOOLTIP, CHART_GRID, CHART_AXIS } from '@/lib/chartTheme';

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
    if (data.success) setSummary(data.summary);
  };

  const fetchByAgent = async () => {
    const response = await fetch('/api/costs/by-agent');
    const data = await response.json();
    if (data.success) setByAgent(data.breakdown);
  };

  const fetchTimeline = async () => {
    const response = await fetch(`/api/costs/timeline?period=${timelinePeriod}&days=30`);
    const data = await response.json();
    if (data.success) setTimeline(data.timeline);
  };

  const fetchProjections = async () => {
    const response = await fetch('/api/costs/projections');
    const data = await response.json();
    if (data.success) setProjections(data.projections);
  };

  const formatCurrency = (amount) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(amount || 0);

  const formatNumber = (num) =>
    new Intl.NumberFormat('en-US').format(num || 0);

  if (loading) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="flex items-center justify-center py-16 text-text-muted text-sm gap-2">
          <RefreshCw size={16} className="animate-spin" /> Loading cost data...
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <DollarSign className="w-8 h-8 text-accent-success" />
          <h1 className="text-2xl font-bold text-text-primary">Cost Dashboard</h1>
        </div>
        <p className="text-sm text-text-muted">
          Track and analyze AI agent costs across all operations
        </p>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon={DollarSign}
            label="Total Cost"
            value={formatCurrency(summary.total_cost)}
            sub={`${formatNumber(summary.total_runs)} runs`}
            color="text-accent-success"
          />
          <StatCard
            icon={TrendingUp}
            label="Avg Cost/Run"
            value={formatCurrency(summary.avg_cost_per_run)}
            sub={`${formatNumber(summary.total_tokens)} tokens`}
            color="text-accent-primary"
          />
          <StatCard
            label="Last 24 Hours"
            value={formatCurrency(summary.cost_last_24h)}
            color="text-accent-info"
          />
          <StatCard
            label="Last 7 Days"
            value={formatCurrency(summary.cost_last_7d)}
            color="text-accent-info"
          />
        </div>
      )}

      {/* Projections */}
      {projections && (
        <div className="bg-accent-info/5 p-5 rounded-lg border border-accent-info/20">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-5 h-5 text-accent-info" />
            <h2 className="font-semibold text-text-primary">Cost Projections</h2>
            <span className="text-xs text-text-muted">(based on last 7 days)</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <div className="text-xs text-text-muted uppercase tracking-wider">Daily Average</div>
              <div className="text-xl font-bold text-accent-info font-mono">{formatCurrency(projections.daily_avg)}</div>
            </div>
            <div>
              <div className="text-xs text-text-muted uppercase tracking-wider">Weekly Projected</div>
              <div className="text-xl font-bold text-text-primary font-mono">{formatCurrency(projections.weekly_projected)}</div>
            </div>
            <div>
              <div className="text-xs text-text-muted uppercase tracking-wider">Monthly Projected</div>
              <div className="text-xl font-bold text-purple-400 font-mono">{formatCurrency(projections.monthly_projected)}</div>
            </div>
            <div>
              <div className="text-xs text-text-muted uppercase tracking-wider">Annual Projected</div>
              <div className="text-xl font-bold text-accent-warning font-mono">{formatCurrency(projections.annual_projected)}</div>
            </div>
          </div>
        </div>
      )}

      {/* Cost Timeline Chart */}
      <div className="bg-bg-secondary p-5 rounded-lg border border-border">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-text-primary">Cost Over Time</h2>
          <select
            value={timelinePeriod}
            onChange={(e) => setTimelinePeriod(e.target.value)}
            aria-label="Timeline period"
            className="px-3 py-1.5 bg-bg-elevated border border-border rounded-lg text-sm text-text-primary"
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
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border, #333)" />
              <XAxis dataKey="period" stroke="var(--color-text-muted, #888)" fontSize={12} />
              <YAxis stroke="var(--color-text-muted, #888)" fontSize={12} />
              <Tooltip
                contentStyle={CHART_TOOLTIP.contentStyle}
                labelStyle={{ color: '#999' }}
                formatter={(value, name) => {
                  if (name === 'cost') return formatCurrency(value);
                  if (name === 'tokens') return formatNumber(value);
                  return value;
                }}
              />
              <Line type="monotone" dataKey="cost" stroke="#3b82f6" strokeWidth={2} name="Cost" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="text-center py-12 text-text-muted text-sm">
            No cost data available for the selected period
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Cost by Agent */}
        <div className="bg-bg-secondary p-5 rounded-lg border border-border">
          <h2 className="font-semibold text-text-primary mb-4">Cost by Agent</h2>
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
                    labelLine={{ stroke: '#555' }}
                  >
                    {byAgent.slice(0, 6).map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={CHART_TOOLTIP.contentStyle}
                    formatter={(value) => formatCurrency(value)}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-4 space-y-2">
                {byAgent.slice(0, 5).map((agent, index) => (
                  <div key={agent.agent_id} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }} />
                      <span className="font-medium text-text-primary">{agent.agent_name || 'Unknown'}</span>
                    </div>
                    <div className="text-text-muted font-mono text-xs">
                      {formatCurrency(agent.total_cost)} ({agent.run_count} runs)
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="text-center py-12 text-text-muted text-sm">
              No agent cost data available
            </div>
          )}
        </div>

        {/* Top Cost Insights */}
        <div className="bg-bg-secondary p-5 rounded-lg border border-border">
          <h2 className="font-semibold text-text-primary mb-4">Top Cost Insights</h2>
          {summary?.most_expensive_agent ? (
            <div className="space-y-4">
              <div className="p-4 bg-accent-info/5 rounded-lg border border-accent-info/20">
                <div className="text-xs text-text-muted uppercase tracking-wider mb-1">Most Expensive Agent</div>
                <div className="font-semibold text-text-primary">{summary.most_expensive_agent.agent_name}</div>
                <div className="text-2xl font-bold text-accent-info font-mono mt-2">
                  {formatCurrency(summary.most_expensive_agent.total_cost)}
                </div>
                <div className="text-xs text-text-muted mt-1">
                  {summary.most_expensive_agent.run_count} runs · Avg: {formatCurrency(summary.most_expensive_agent.avg_cost)}
                </div>
              </div>

              {summary.costliest_run && (
                <div className="p-4 bg-accent-warning/5 rounded-lg border border-accent-warning/20">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertTriangle className="w-4 h-4 text-accent-warning" />
                    <div className="text-xs text-text-muted uppercase tracking-wider">Costliest Single Run</div>
                  </div>
                  <div className="font-semibold text-text-primary">{summary.costliest_run.agent_name}</div>
                  <div className="text-2xl font-bold text-accent-warning font-mono mt-2">
                    {formatCurrency(summary.costliest_run.cost_usd)}
                  </div>
                  <div className="text-xs text-text-muted mt-1">
                    {formatNumber(summary.costliest_run.tokens_used)} tokens
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-12 text-text-muted text-sm">
              No cost insights available
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
