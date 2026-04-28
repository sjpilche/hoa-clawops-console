/**
 * @file LoginPage.jsx
 * @description Authentication page — email + password login form.
 *
 * DESIGN:
 * - Centered card on dark background
 * - ClawOps branding
 * - Simple form with validation
 * - Error messages for failed login attempts
 *
 * FLOW:
 * 1. User enters email + password
 * 2. POST /api/auth/login
 * 3. On success: store JWT token, redirect to dashboard
 * 4. On failure: show error message
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, setToken } from '@/lib/api';
import { useSettingsStore } from '@/stores/useSettingsStore';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { Shield, Eye, EyeOff, ChevronDown, ChevronUp } from 'lucide-react';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useSettingsStore();

  const [email, setEmail] = useState('admin@clawops.local');
  const [password, setPassword] = useState('changeme123');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showHint, setShowHint] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const data = await api.post('/auth/login', { email, password });
      // Server returns token as { token, expiresAt, expiresIn } — extract the JWT string
      login(data.token.token, data.user);
      navigate('/');
    } catch (err) {
      setError(err.message || 'Login failed. Check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg-primary flex items-center justify-center p-4 relative overflow-hidden">
      {/* Ambient background blobs */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-accent-primary/[0.07] rounded-full blur-3xl animate-pulse" />
        <div className="absolute -bottom-48 -right-48 w-[500px] h-[500px] bg-accent-info/[0.05] rounded-full blur-3xl animate-pulse [animation-delay:2s]" />
        <div className="absolute top-1/3 right-1/4 w-64 h-64 bg-accent-success/[0.04] rounded-full blur-3xl animate-pulse [animation-delay:4s]" />
      </div>

      <div className="w-full max-w-sm relative z-10">
        {/* Branding */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-accent-primary flex items-center justify-center mx-auto mb-4 shadow-lg shadow-accent-primary/30 ring-1 ring-accent-primary/20 ring-offset-4 ring-offset-bg-primary">
            <span className="text-bg-primary font-bold text-2xl">C</span>
          </div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">ClawOps</h1>
          <p className="text-sm text-text-secondary mt-1">AI-Powered Operations Console</p>
        </div>

        {/* Login Card */}
        <div className="bg-bg-secondary border border-border rounded-xl p-6 shadow-xl shadow-black/30 backdrop-blur-sm">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Input
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@clawops.local"
              autoFocus
              required
            />

            <div className="relative">
              <Input
                label="Password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-[34px] text-text-muted hover:text-text-secondary transition-colors"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            {error && (
              <div className="text-sm text-accent-danger bg-accent-danger/10 rounded-lg px-3 py-2 border border-accent-danger/20">
                {error}
              </div>
            )}

            <Button type="submit" disabled={loading} className="w-full mt-2">
              {loading ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>

          {/* Collapsible first-time hint */}
          <div className="mt-4 border-t border-border pt-3">
            <button
              type="button"
              onClick={() => setShowHint(!showHint)}
              className="flex items-center gap-2 text-xs text-text-muted hover:text-text-secondary transition-colors w-full cursor-pointer"
            >
              <Shield size={13} />
              <span>First time?</span>
              {showHint ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
            {showHint && (
              <div className="mt-2 text-xs text-text-muted bg-bg-elevated rounded-lg px-3 py-2">
                Default: <span className="font-mono text-text-secondary">admin@clawops.local</span> / <span className="font-mono text-text-secondary">changeme123</span>
                <br />
                <span className="text-accent-warning">Change this password after first login.</span>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-[10px] text-text-muted/50 mt-6 font-mono tracking-wider">
          ClawOps Console v2
        </p>
      </div>
    </div>
  );
}
