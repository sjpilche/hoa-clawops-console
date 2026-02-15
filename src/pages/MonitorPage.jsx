/**
 * @file MonitorPage.jsx
 * @description Hybrid operations monitor - combines OpenClaw Monitor plugin with custom UI.
 *
 * LAYOUT:
 * - Top: Key metrics cards (sessions, costs, tokens)
 * - Bottom: Full Monitor dashboard (iframe embed)
 *
 * DATA SOURCE: OpenClaw Monitor plugin (port 18790)
 */

import React, { useEffect, useState } from 'react';
import { Activity, DollarSign, Zap, TrendingUp, ExternalLink } from 'lucide-react';

const MONITOR_URL = 'http://127.0.0.1:18790';

export default function MonitorPage() {
  const [summary, setSummary] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchMonitorData();
    const interval = setInterval(fetchMonitorData, 5000); // Refresh every 5s
    return () => clearInterval(interval);
  }, []);

  const fetchMonitorData = async () => {
    try {
      const response = await fetch(`${MONITOR_URL}/api/summary`);
      const data = await response.json();
      setSummary(data);
      setIsLoading(false);
      setError(null);
    } catch (err) {
      console.error('[MonitorPage] Failed to fetch data:', err);
      setError('Monitor not responding. Is OpenClaw gateway running?');
      setIsLoading(false);
    }
  };

  if (error) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="text-center space-y-4">
          <Activity size={48} className="mx-auto text-text-muted" />
          <h3 className="text-lg font-semibold text-text-primary">Monitor Offline</h3>
          <p className="text-sm text-text-secondary max-w-md">
            {error}
          </p>
          <p className="text-xs text-text-muted">
            Start with: <code className="px-2 py-1 bg-bg-elevated rounded">openclaw gateway run</code>
          </p>
        </div>
      </div>
    );
  }

  const totals = summary?.costs?.totals || {};
  const sessionCount = summary?.sessions?.totals?.sessionCount || 0;

  return (
    <div className="h-full flex flex-col">
      {/* Key Metrics Bar */}
      <div className="border-b border-border bg-bg-secondary p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-semibold text-text-primary">Operations Monitor</h1>
            <p className="text-sm text-text-secondary mt-1">
              Real-time observability powered by OpenClaw Monitor
            </p>
          </div>
          <a
            href={MONITOR_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 text-sm text-accent-primary hover:text-accent-primary/80 transition-colors"
          >
            <ExternalLink size={16} />
            Open Full Dashboard
          </a>
        </div>

        {/* Metrics Grid */}
        {!isLoading && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <MetricCard
              icon={Activity}
              label="Sessions"
              value={sessionCount}
              subtitle="total runs"
              color="text-accent-info"
            />
            <MetricCard
              icon={Zap}
              label="Tokens"
              value={(totals.totalTokens || 0).toLocaleString()}
              subtitle="processed"
              color="text-accent-cyan"
            />
            <MetricCard
              icon={DollarSign}
              label="Total Cost"
              value={`$${(totals.totalCost || 0).toFixed(2)}`}
              subtitle="estimated"
              color="text-accent-success"
            />
            <MetricCard
              icon={TrendingUp}
              label="Avg Cost/Run"
              value={
                sessionCount > 0
                  ? `$${(totals.totalCost / sessionCount).toFixed(3)}`
                  : '$0.00'
              }
              subtitle="per session"
              color="text-accent-warning"
            />
          </div>
        )}
      </div>

      {/* Embedded Monitor Dashboard */}
      <div className="flex-1 relative">
        <iframe
          src={MONITOR_URL}
          className="absolute inset-0 w-full h-full border-0"
          title="OpenClaw Monitor Dashboard"
        />
      </div>
    </div>
  );
}

/** Metric card component */
function MetricCard({ icon: Icon, label, value, subtitle, color }) {
  return (
    <div className="bg-bg-elevated border border-border rounded-lg p-4">
      <div className="flex items-center gap-3 mb-2">
        <Icon size={18} className={color} />
        <span className="text-xs text-text-muted uppercase tracking-wider font-medium">
          {label}
        </span>
      </div>
      <div className={`text-2xl font-semibold font-data ${color}`}>{value}</div>
      <div className="text-xs text-text-muted mt-0.5">{subtitle}</div>
    </div>
  );
}
