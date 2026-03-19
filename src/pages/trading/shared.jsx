/**
 * Shared trading page utilities — API client + UI primitives
 * Used by all trading tab components.
 */

import React from 'react';
import {
  RefreshCw, XCircle, WifiOff,
} from 'lucide-react';

const TRADER_BASE = import.meta.env.VITE_TRADER_URL || 'http://localhost:3002';

// ─── API client ───────────────────────────────────────────────────────────────
export const traderApi = {
  get: async (path) => {
    const res = await fetch(`${TRADER_BASE}${path}`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.message || body.error || `${res.status} ${res.statusText}`);
    }
    return res.json();
  },
  post: async (path, body) => {
    const res = await fetch(`${TRADER_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.message || errBody.error || `${res.status} ${res.statusText}`);
    }
    return res.json();
  },
  put: async (path, body) => {
    const res = await fetch(`${TRADER_BASE}${path}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.message || errBody.error || `${res.status} ${res.statusText}`);
    }
    return res.json();
  },
  del: async (path) => {
    const res = await fetch(`${TRADER_BASE}${path}`, { method: 'DELETE' });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.message || errBody.error || `${res.status} ${res.statusText}`);
    }
    return res.json();
  },
};

// ─── UI primitives ────────────────────────────────────────────────────────────

export function Card({ children, className = '' }) {
  return (
    <div className={`bg-bg-elevated border border-border rounded-lg p-4 ${className}`}>
      {children}
    </div>
  );
}

export function SectionTitle({ children, action }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-sm font-semibold text-text-primary">{children}</h2>
      {action}
    </div>
  );
}

export function Badge({ children, variant = 'default' }) {
  const styles = {
    default: 'bg-bg-secondary text-text-muted',
    success: 'bg-accent-success/10 text-accent-success',
    danger:  'bg-accent-danger/10 text-accent-danger',
    warning: 'bg-accent-warning/10 text-accent-warning',
    info:    'bg-accent-info/10 text-accent-info',
    purple:  'bg-purple-500/10 text-purple-400',
  };
  return (
    <span className={`px-2 py-0.5 text-xs rounded font-medium ${styles[variant] || styles.default}`}>
      {children}
    </span>
  );
}

export function StatCard({ label, value, sub, variant, icon: Icon }) {
  const colors = {
    success: 'text-accent-success',
    danger: 'text-accent-danger',
    warning: 'text-accent-warning',
    info: 'text-accent-info',
    purple: 'text-purple-400',
  };
  return (
    <Card>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs text-text-muted uppercase tracking-wider mb-1">{label}</div>
          <div className={`text-lg font-bold font-mono ${colors[variant] || 'text-text-primary'}`}>{value}</div>
          {sub && <div className="text-xs text-text-muted mt-0.5">{sub}</div>}
        </div>
        {Icon && <Icon size={16} className={`${colors[variant] || 'text-text-muted'} mt-1 opacity-50`} />}
      </div>
    </Card>
  );
}

export function ErrorState({ message, onRetry }) {
  const isOffline = message?.includes('Failed to fetch') || message?.includes('NetworkError') || message?.includes('ERR_CONNECTION_REFUSED');
  const isDbError = message?.includes('ECONNREFUSED') || message?.toLowerCase().includes('database') || message?.toLowerCase().includes('postgres');
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center gap-4">
      {isOffline ? <WifiOff size={36} className="text-accent-danger" /> : <XCircle size={36} className="text-accent-danger" />}
      <div>
        <p className="text-text-primary font-semibold">
          {isOffline ? 'Trader Service Offline' : isDbError ? 'Database Unavailable' : 'Request Failed'}
        </p>
        <p className="text-sm text-text-secondary mt-1 max-w-sm">
          {isDbError ? 'This feature requires PostgreSQL (port 5433).' : message}
        </p>
        {isOffline && (
          <p className="text-xs text-text-muted mt-2">
            Start with <code className="px-1.5 py-0.5 bg-bg-elevated rounded font-mono">pm2 start ecosystem.config.cjs</code>
          </p>
        )}
      </div>
      {onRetry && (
        <button onClick={onRetry} className="flex items-center gap-2 px-4 py-2 text-sm bg-accent-primary/10 text-accent-primary rounded hover:bg-accent-primary/20 transition-colors">
          <RefreshCw size={14} /> Retry
        </button>
      )}
    </div>
  );
}

export function Loading({ label = 'Loading...' }) {
  return (
    <div className="flex items-center justify-center py-16 text-text-muted text-sm gap-2">
      <RefreshCw size={16} className="animate-spin" /> {label}
    </div>
  );
}

export function PnlValue({ value, className = '' }) {
  const v = value ?? 0;
  return (
    <span className={`${v >= 0 ? 'text-accent-success' : 'text-accent-danger'} ${className}`}>
      {v >= 0 ? '+' : ''}${v.toFixed(2)}
    </span>
  );
}

export function RefreshBtn({ onClick, size = 11 }) {
  return (
    <button onClick={onClick} className="text-xs text-text-muted hover:text-text-primary flex items-center gap-1">
      <RefreshCw size={size} /> Refresh
    </button>
  );
}

export function MiniBar({ value, max, color = 'bg-accent-primary' }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="w-full h-1.5 bg-bg-secondary rounded-full overflow-hidden">
      <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function WinRateRing({ wins, total }) {
  const pct = total > 0 ? Math.round((wins / total) * 100) : 0;
  const circumference = 2 * Math.PI * 18;
  const offset = circumference - (pct / 100) * circumference;
  const color = pct >= 60 ? '#22c55e' : pct >= 40 ? '#eab308' : '#ef4444';
  return (
    <div className="relative w-12 h-12">
      <svg className="w-12 h-12 -rotate-90" viewBox="0 0 40 40">
        <circle cx="20" cy="20" r="18" fill="none" stroke="currentColor" strokeWidth="3" className="text-bg-secondary" />
        <circle cx="20" cy="20" r="18" fill="none" stroke={color} strokeWidth="3"
          strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-xs font-bold text-text-primary">{pct}%</div>
    </div>
  );
}
