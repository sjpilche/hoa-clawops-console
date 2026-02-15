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
import { Shield } from 'lucide-react';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useSettingsStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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
    <div className="min-h-screen bg-bg-primary flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Branding */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-accent-primary flex items-center justify-center mx-auto mb-4">
            <span className="text-bg-primary font-bold text-2xl">C</span>
          </div>
          <h1 className="text-2xl font-semibold text-text-primary">ClawOps Console</h1>
          <p className="text-sm text-text-muted mt-1">Browser Automation Command Center</p>
        </div>

        {/* Login Card */}
        <div className="bg-bg-secondary border border-border rounded-xl p-6">
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

            <Input
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />

            {error && (
              <div className="text-sm text-accent-danger bg-accent-danger/10 rounded-md px-3 py-2">
                {error}
              </div>
            )}

            <Button type="submit" disabled={loading} className="w-full mt-2">
              {loading ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>

          {/* First-time setup hint */}
          <div className="mt-4 flex items-start gap-2 text-xs text-text-muted">
            <Shield size={14} className="mt-0.5 shrink-0" />
            <span>
              Default login: admin@clawops.local / changeme123
              <br />
              Change this password after first login!
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
