/**
 * @file BlitzPage.jsx
 * @description Blitz Mode - placeholder until backend is implemented.
 *
 * Concept: Run all relevant HOA agents sequentially (content-writer,
 * social-media, networker, email-campaigns, facebook-poster) for a
 * full media blitz in one click.
 *
 * TODO: Implement /api/blitz routes to support this.
 */

import React from 'react';
import { Zap } from 'lucide-react';

const PLANNED_AGENTS = [
  { name: 'HOA Content Writer', description: 'Generates blog post content', icon: '✍️' },
  { name: 'HOA CMS Publisher', description: 'Publishes post to site via GitHub', icon: '🚀' },
  { name: 'HOA Social Media', description: 'Writes social captions for the post', icon: '📣' },
  { name: 'HOA Networker', description: 'Finds engagement opportunities in communities', icon: '🤝' },
  { name: 'HOA Email Campaigns', description: 'Drafts outreach emails to leads', icon: '📧' },
  { name: 'HOA Facebook Poster', description: 'Publishes content queue to Facebook page', icon: '📘' },
];

export default function BlitzPage() {
  return (
    <div className="h-full flex flex-col bg-bg-primary">
      {/* Header */}
      <div className="border-b border-border bg-bg-elevated px-6 py-4">
        <h1 className="text-2xl font-bold text-text-primary flex items-center gap-3">
          <Zap className="text-accent-primary" size={28} />
          Blitz Mode
        </h1>
        <p className="text-sm text-text-muted mt-1">
          One-click media blitz — runs all agents in sequence
        </p>
      </div>

      {/* Coming Soon */}
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <div className="w-20 h-20 rounded-2xl bg-accent-primary/10 flex items-center justify-center mb-6">
          <Zap size={40} className="text-accent-primary" />
        </div>
        <h2 className="text-2xl font-bold text-text-primary mb-2">Coming Soon</h2>
        <p className="text-text-muted text-center max-w-md mb-10">
          Blitz Mode will run all agents back-to-back for a full coordinated media push.
          Use the <strong className="text-text-primary">Scheduler</strong> tab to run agents
          individually in the meantime.
        </p>

        {/* Planned pipeline */}
        <div className="w-full max-w-lg space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-3">
            Planned Pipeline
          </div>
          {PLANNED_AGENTS.map((agent, i) => (
            <div
              key={agent.name}
              className="flex items-center gap-4 p-3 bg-bg-secondary border border-border rounded-lg opacity-60"
            >
              <div className="text-xl w-8 text-center">{agent.icon}</div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-text-primary">{agent.name}</div>
                <div className="text-xs text-text-muted">{agent.description}</div>
              </div>
              <div className="text-xs text-text-muted shrink-0">Step {i + 1}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
