/**
 * @file OfficeScene.jsx
 * @description 2D animated Dream Team HQ — silly but useful.
 *
 * Grade states:
 *   A — Agent is VIBRATING with energy, sparks, money signs flying
 *   B — Focused work mode, coffee steaming, papers shuffling
 *   C — Scrolling phone, looking at clock, doodling
 *   D — Full-on sleeping, drool puddle, snoring ZZZs
 *   F — Desk is literally on fire, papers flying, sirens
 */

import React from 'react';

const AGENTS = {
  todd:    { emoji: '👔', name: 'Todd', role: 'Chief of Staff', color: 'amber' },
  scout:   { emoji: '🕵️', name: 'Scout', role: 'Lead Hunter', color: 'blue' },
  revops:  { emoji: '📊', name: 'RevOps', role: 'Economics', color: 'emerald' },
  ralph:   { emoji: '👮', name: 'Ralph', role: 'Quality Police', color: 'red' },
  quill:   { emoji: '🦚', name: 'Quill', role: 'Word Wizard', color: 'purple' },
};

function GradeAnimation({ grade }) {
  switch (grade) {
    case 'A':
      return (
        <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-xl">
          <div className="absolute top-1 right-2 animate-bounce text-xs" style={{ animationDuration: '0.8s' }}>💰</div>
          <div className="absolute top-3 left-3 animate-bounce text-xs" style={{ animationDuration: '1.2s', animationDelay: '0.3s' }}>⚡</div>
          <div className="absolute bottom-2 right-4 animate-bounce text-xs" style={{ animationDuration: '1s', animationDelay: '0.6s' }}>🚀</div>
          <div className="absolute top-2 left-1/2 animate-ping text-[8px]" style={{ animationDuration: '2s' }}>✨</div>
        </div>
      );
    case 'B':
      return (
        <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-xl">
          <div className="absolute top-1 right-2 animate-pulse text-xs">☕</div>
          <div className="absolute bottom-1 left-2 text-[8px] text-text-muted animate-pulse" style={{ animationDuration: '3s' }}>tap tap tap...</div>
        </div>
      );
    case 'C':
      return (
        <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-xl">
          <div className="absolute top-1 right-2 text-xs animate-pulse" style={{ animationDuration: '4s' }}>📱</div>
          <div className="absolute bottom-1 right-2 text-[8px] text-text-muted italic">*yawn*</div>
        </div>
      );
    case 'D':
      return (
        <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-xl">
          <div className="absolute top-0 right-1 flex gap-0.5">
            <span className="text-xs animate-bounce opacity-40" style={{ animationDuration: '2s' }}>z</span>
            <span className="text-sm animate-bounce opacity-50" style={{ animationDuration: '2s', animationDelay: '0.3s' }}>Z</span>
            <span className="text-base animate-bounce opacity-60" style={{ animationDuration: '2s', animationDelay: '0.6s' }}>Z</span>
          </div>
          <div className="absolute bottom-1 left-3 text-[8px] text-text-muted">💤 *snore*</div>
          <div className="absolute bottom-3 left-8 text-xs opacity-30">🤤</div>
        </div>
      );
    case 'F':
      return (
        <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-xl">
          <div className="absolute -top-1 left-1/4 animate-bounce text-sm" style={{ animationDuration: '0.5s' }}>🔥</div>
          <div className="absolute -top-1 right-1/4 animate-bounce text-sm" style={{ animationDuration: '0.6s', animationDelay: '0.2s' }}>🔥</div>
          <div className="absolute top-1 left-1/2 -translate-x-1/2 animate-ping text-xs">🚨</div>
          <div className="absolute bottom-1 left-2 text-[8px] text-accent-danger font-bold animate-pulse">HELP!</div>
          <div className="absolute bottom-1 right-2 animate-bounce text-xs" style={{ animationDuration: '0.4s' }}>📄</div>
        </div>
      );
    default:
      return null;
  }
}

const GRADE_STYLES = {
  A: 'border-accent-success/60 bg-accent-success/5 shadow-lg shadow-accent-success/10',
  B: 'border-accent-info/40 bg-accent-info/5',
  C: 'border-accent-warning/30 bg-accent-warning/5',
  D: 'border-border/40 bg-bg-elevated/50 opacity-60',
  F: 'border-accent-danger/60 bg-accent-danger/5 shadow-lg shadow-accent-danger/10',
};

const GRADE_BADGE = {
  A: 'bg-accent-success text-white',
  B: 'bg-accent-info text-white',
  C: 'bg-accent-warning text-white',
  D: 'bg-gray-500 text-white',
  F: 'bg-accent-danger text-white animate-pulse',
};

const GRADE_QUIPS = {
  A: ['Making it rain', 'On a heater', 'Printing money', 'Can\'t be stopped'],
  B: ['Solid day', 'Getting it done', 'In the zone', 'Locked in'],
  C: ['Meh', 'Could be worse', 'Coasting', 'Phoning it in'],
  D: ['Checked out', 'Asleep at the wheel', 'Gone fishing', 'On vacation?'],
  F: ['THIS IS FINE', 'Send help', 'Resume updated', 'Interviewing elsewhere'],
};

function getQuip(grade) {
  const quips = GRADE_QUIPS[grade] || GRADE_QUIPS.C;
  return quips[Math.floor(Math.random() * quips.length)];
}

function AgentDesk({ agentKey, scorecard }) {
  const agent = AGENTS[agentKey];
  if (!agent) return null;

  const grade = scorecard?.grade || '—';
  const score = scorecard?.composite_score || 0;
  const trend = scorecard?.trend;
  const style = GRADE_STYLES[grade] || '';
  const quip = grade !== '—' ? getQuip(grade) : 'Waiting for first review...';

  return (
    <div className={`relative border-2 rounded-xl p-3 transition-all duration-500 ${style}`}>
      <GradeAnimation grade={grade} />

      {/* Agent row */}
      <div className="flex items-center gap-2 relative z-10">
        <span className={`text-2xl ${grade === 'A' ? 'animate-bounce' : grade === 'D' ? 'grayscale opacity-40' : grade === 'F' ? 'animate-spin' : ''}`}
          style={{ animationDuration: grade === 'A' ? '1.5s' : grade === 'F' ? '3s' : undefined }}>
          {agent.emoji}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-bold text-text-primary">{agent.name}</span>
            <span className="text-[10px] text-text-muted">{agent.role}</span>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            {/* Score bar */}
            <div className="flex-1 h-1.5 bg-bg-elevated rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-1000 ${
                  score >= 90 ? 'bg-accent-success' : score >= 75 ? 'bg-accent-info' : score >= 60 ? 'bg-accent-warning' : 'bg-accent-danger'
                }`}
                style={{ width: `${score}%` }}
              />
            </div>
            <span className="text-[10px] text-text-muted font-data w-6 text-right">{score}</span>
          </div>
        </div>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-black shrink-0 ${GRADE_BADGE[grade] || 'bg-bg-elevated text-text-muted'}`}>
          {grade}
        </div>
      </div>

      {/* Quip + trend */}
      <div className="flex items-center justify-between mt-2 relative z-10">
        <span className="text-[10px] text-text-muted italic truncate">"{quip}"</span>
        {trend && (
          <span className={`text-[10px] font-medium ${
            trend === 'up' ? 'text-accent-success' : trend === 'down' ? 'text-accent-danger' : 'text-text-muted'
          }`}>
            {trend === 'up' ? '📈 improving' : trend === 'down' ? '📉 slipping' : '➡️ steady'}
          </span>
        )}
      </div>
    </div>
  );
}

export default function OfficeScene({ scorecards }) {
  const cards = Array.isArray(scorecards) ? scorecards : [];

  const cardMap = {};
  for (const c of cards) {
    if (!cardMap[c.agent_name] || c.score_date > cardMap[c.agent_name].score_date) {
      cardMap[c.agent_name] = c;
    }
  }

  // Compute team stats
  const graded = Object.values(cardMap);
  const avgScore = graded.length > 0 ? Math.round(graded.reduce((s, c) => s + (c.composite_score || 0), 0) / graded.length) : 0;
  const failCount = graded.filter(c => c.grade === 'F').length;
  const aceCount = graded.filter(c => c.grade === 'A').length;

  let teamMood = '🏢 Normal day at the office';
  if (aceCount >= 4) teamMood = '🎉 TEAM IS ON FIRE (the good kind)';
  else if (aceCount >= 2) teamMood = '💪 Solid performance today';
  else if (failCount >= 3) teamMood = '🚨 EMERGENCY TEAM MEETING NEEDED';
  else if (failCount >= 1) teamMood = '⚠️ Someone needs a pep talk';
  else if (graded.length === 0) teamMood = '😴 Office is empty — run the nightly cycle';

  return (
    <div className="bg-bg-secondary border border-border rounded-xl p-5">
      {/* Office header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-lg">🏢</span>
          <h2 className="text-sm font-semibold text-text-primary">Dream Team HQ</h2>
          <span className="text-xs text-text-muted">{teamMood}</span>
        </div>
        <div className="flex items-center gap-3 text-xs text-text-muted">
          {graded.length > 0 && (
            <>
              <span>Team avg: <span className="font-bold text-text-primary">{avgScore}/100</span></span>
              <span className="text-text-muted/30">|</span>
              <span>{cardMap.todd?.score_date || '—'}</span>
            </>
          )}
        </div>
      </div>

      {/* The office — 5 desks */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <AgentDesk agentKey="todd" scorecard={cardMap.todd} />
        <AgentDesk agentKey="scout" scorecard={cardMap.scout} />
        <AgentDesk agentKey="revops" scorecard={cardMap.charlie} />
        <AgentDesk agentKey="ralph" scorecard={cardMap.ralph} />
        <AgentDesk agentKey="quill" scorecard={cardMap.quill} />
      </div>
    </div>
  );
}
