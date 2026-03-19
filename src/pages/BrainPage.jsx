/**
 * @file BrainPage.jsx
 * @description Collective Brain Intelligence Dashboard.
 *
 * Visualizes the 4-layer learning system:
 *   Layer 1 — Observations (raw signals)
 *   Layer 2 — Feedback (approve/reject)
 *   Layer 3 — Episodes (outcome memory)
 *   Layer 4 — Knowledge Base (distilled patterns)
 *
 * Also shows: learning velocity, agent rankings, feedback health, gaps.
 */

import React, { useEffect, useState } from 'react';
import {
  Brain,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Layers,
  Award,
  BarChart2,
  Zap,
  BookOpen,
  MessageSquare,
  Play,
} from 'lucide-react';
import { api } from '@/lib/api';
import Button from '@/components/ui/Button';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

export default function BrainPage() {
  const [data, setData] = useState(null);
  const [autopilot, setAutopilot] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDistilling, setIsDistilling] = useState(false);
  const [distillResult, setDistillResult] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchIntelligence();
    fetchAutopilot();
  }, []);

  const fetchIntelligence = async () => {
    setIsLoading(true);
    setError('');
    try {
      const result = await api.get('/brain/intelligence');
      setData(result);
    } catch (err) {
      setError(err.message || 'Failed to load brain intelligence');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchAutopilot = async () => {
    try {
      const result = await api.get('/brain/autonomy-dashboard');
      setAutopilot(result);
    } catch {} // Non-fatal — page still works without autopilot data
  };

  const triggerDistillation = async () => {
    setIsDistilling(true);
    setDistillResult(null);
    try {
      const result = await api.post('/brain/distill', {});
      setDistillResult(result);
      // Refresh stats after distillation
      setTimeout(fetchIntelligence, 1000);
    } catch (err) {
      setDistillResult({ error: err.message });
    } finally {
      setIsDistilling(false);
    }
  };

  if (isLoading) return <LoadingSpinner label="Loading brain intelligence..." />;

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <AlertTriangle size={40} className="text-accent-danger" />
        <p className="text-text-secondary">{error}</p>
        <Button variant="outline" size="sm" onClick={fetchIntelligence}>
          <RefreshCw size={14} /> Retry
        </Button>
      </div>
    );
  }

  const { stats, velocity, feedbackHealth, episodeQuality, agentRankings, chromaBrain, gaps, timestamp } = data || {};

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary flex items-center gap-2">
            <Brain size={24} className="text-accent-primary" />
            Collective Brain
          </h1>
          <p className="text-sm text-text-muted mt-1">
            4-layer learning system — observations → feedback → episodes → knowledge
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-muted">
            {timestamp ? `Updated ${new Date(timestamp).toLocaleTimeString()}` : ''}
          </span>
          <Button variant="outline" size="sm" onClick={fetchIntelligence}>
            <RefreshCw size={14} /> Refresh
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={triggerDistillation}
            disabled={isDistilling}
          >
            <Zap size={14} />
            {isDistilling ? 'Distilling...' : 'Run Distillation'}
          </Button>
        </div>
      </div>

      {/* Distillation result banner */}
      {distillResult && (
        <div className={`px-4 py-3 rounded-lg border text-sm ${
          distillResult.error
            ? 'bg-accent-danger/10 border-accent-danger text-accent-danger'
            : 'bg-accent-success/10 border-accent-success text-accent-success'
        }`}>
          {distillResult.error
            ? `Distillation failed: ${distillResult.error}`
            : `Distillation complete — ${distillResult.promoted || 0} promoted, ${distillResult.decayed || 0} decayed`
          }
        </div>
      )}

      {/* Learning Gaps — top of page if any */}
      {gaps && gaps.length > 0 && (
        <div className="bg-accent-warning/5 border border-accent-warning/30 rounded-lg p-4 space-y-2">
          <div className="flex items-center gap-2 text-accent-warning text-sm font-medium">
            <AlertTriangle size={16} />
            Learning Gaps ({gaps.length})
          </div>
          {gaps.map((gap, i) => (
            <div key={i} className="text-sm text-text-secondary pl-6">• {gap}</div>
          ))}
        </div>
      )}

      {/* Layer Stats — 4 cards */}
      <div>
        <h2 className="text-xs font-medium text-text-muted uppercase tracking-wider mb-3">
          Memory Layers
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <LayerCard
            icon={<MessageSquare size={18} className="text-accent-info" />}
            label="Observations"
            sublabel="Layer 1 — Raw signals"
            count={stats?.observations || 0}
            velocity={velocity?.observations}
            color="accent-info"
          />
          <LayerCard
            icon={<CheckCircle2 size={18} className="text-accent-success" />}
            label="Feedback"
            sublabel="Layer 2 — Human signals"
            count={stats?.feedback || 0}
            velocity={velocity?.feedback}
            color="accent-success"
          />
          <LayerCard
            icon={<BarChart2 size={18} className="text-accent-warning" />}
            label="Episodes"
            sublabel="Layer 3 — Outcome memory"
            count={stats?.episodes || 0}
            velocity={velocity?.episodes}
            color="accent-warning"
          />
          <LayerCard
            icon={<BookOpen size={18} className="text-accent-primary" />}
            label="Knowledge"
            sublabel="Layer 4 — Distilled patterns"
            count={stats?.knowledge || 0}
            velocity={velocity?.knowledge}
            color="accent-primary"
          />
        </div>
      </div>

      {/* Middle row — Feedback Health + Episode Quality */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Feedback Health */}
        <div className="bg-bg-secondary border border-border rounded-lg p-4">
          <h2 className="text-sm font-medium text-text-primary mb-4 flex items-center gap-2">
            <CheckCircle2 size={16} className="text-accent-success" />
            Feedback Health
          </h2>
          {feedbackHealth && (
            <div className="space-y-4">
              {/* Approval rate bar */}
              <div>
                <div className="flex justify-between text-xs text-text-muted mb-1.5">
                  <span>Approval Rate</span>
                  <span className={`font-medium ${
                    feedbackHealth.approvalRate >= 60 ? 'text-accent-success' :
                    feedbackHealth.approvalRate >= 30 ? 'text-accent-warning' : 'text-accent-danger'
                  }`}>{feedbackHealth.approvalRate}%</span>
                </div>
                <div className="h-2 bg-bg-elevated rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      feedbackHealth.approvalRate >= 60 ? 'bg-accent-success' :
                      feedbackHealth.approvalRate >= 30 ? 'bg-accent-warning' : 'bg-accent-danger'
                    }`}
                    style={{ width: `${feedbackHealth.approvalRate}%` }}
                  />
                </div>
              </div>
              {/* Counts */}
              <div className="grid grid-cols-3 gap-2 text-center">
                <FeedbackStat label="Approved" value={feedbackHealth.approved} color="text-accent-success" />
                <FeedbackStat label="Edited" value={feedbackHealth.edited} color="text-accent-warning" />
                <FeedbackStat label="Rejected" value={feedbackHealth.rejected} color="text-accent-danger" />
              </div>
              <div className="text-xs text-text-muted text-center">
                {feedbackHealth.total} total feedback signals
              </div>
            </div>
          )}
        </div>

        {/* Episode Quality */}
        <div className="bg-bg-secondary border border-border rounded-lg p-4">
          <h2 className="text-sm font-medium text-text-primary mb-4 flex items-center gap-2">
            <BarChart2 size={16} className="text-accent-warning" />
            Episode Quality
          </h2>
          {episodeQuality && (
            <div className="space-y-4">
              {/* Win rate bar */}
              <div>
                <div className="flex justify-between text-xs text-text-muted mb-1.5">
                  <span>High-Score Rate (≥0.7)</span>
                  <span className={`font-medium ${
                    episodeQuality.avgScore >= 50 ? 'text-accent-success' :
                    episodeQuality.avgScore >= 25 ? 'text-accent-warning' : 'text-accent-danger'
                  }`}>{episodeQuality.avgScore}%</span>
                </div>
                <div className="h-2 bg-bg-elevated rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent-success rounded-full transition-all"
                    style={{ width: `${episodeQuality.avgScore}%` }}
                  />
                </div>
              </div>
              {/* Counts */}
              <div className="grid grid-cols-3 gap-2 text-center">
                <FeedbackStat label="Wins (≥0.7)" value={episodeQuality.highScore} color="text-accent-success" />
                <FeedbackStat label="Total" value={episodeQuality.total} color="text-text-primary" />
                <FeedbackStat label="Losses (<0.3)" value={episodeQuality.lowScore} color="text-accent-danger" />
              </div>
              {/* Outcome types */}
              {episodeQuality.byType && Object.keys(episodeQuality.byType).length > 0 && (
                <div className="space-y-1">
                  {Object.entries(episodeQuality.byType).map(([type, info]) => (
                    <div key={type} className="flex items-center justify-between text-xs">
                      <span className="text-text-muted capitalize">{type.replace(/_/g, ' ')}</span>
                      <span className="text-text-secondary font-data">{info.count} runs · {info.avgScore}% avg</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Agent Rankings */}
      {agentRankings && agentRankings.length > 0 && (
        <div className="bg-bg-secondary border border-border rounded-lg p-4">
          <h2 className="text-sm font-medium text-text-primary mb-4 flex items-center gap-2">
            <Award size={16} className="text-accent-primary" />
            Agent Learning Rankings
            <span className="text-xs text-text-muted font-normal ml-1">(by avg outcome score)</span>
          </h2>
          <div className="space-y-2">
            {agentRankings.map((agent, idx) => (
              <AgentRankRow key={agent.agent} rank={idx + 1} agent={agent} />
            ))}
          </div>
        </div>
      )}

      {/* ChromaBrain + Raw Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* ChromaBrain */}
        <div className="bg-bg-secondary border border-border rounded-lg p-4">
          <h2 className="text-sm font-medium text-text-primary mb-3 flex items-center gap-2">
            <Layers size={16} className="text-accent-primary" />
            ChromaBrain (Semantic Search)
          </h2>
          {chromaBrain && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${chromaBrain.ready ? 'bg-accent-success' : 'bg-accent-danger'}`} />
                <span className="text-sm text-text-secondary">
                  {chromaBrain.ready ? 'Online' : 'Offline'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-bg-elevated rounded-lg px-3 py-2">
                  <div className="text-xs text-text-muted">Episodes Indexed</div>
                  <div className="text-lg font-bold text-text-primary font-data">{chromaBrain.episodes || 0}</div>
                </div>
                <div className="bg-bg-elevated rounded-lg px-3 py-2">
                  <div className="text-xs text-text-muted">KB Indexed</div>
                  <div className="text-lg font-bold text-text-primary font-data">{chromaBrain.knowledge || 0}</div>
                </div>
              </div>
              <div className="text-xs text-text-muted">
                Keyword-based semantic search · SQLite-backed · no external API
              </div>
            </div>
          )}
        </div>

        {/* Learning Velocity */}
        <div className="bg-bg-secondary border border-border rounded-lg p-4">
          <h2 className="text-sm font-medium text-text-primary mb-3 flex items-center gap-2">
            <TrendingUp size={16} className="text-accent-success" />
            Learning Velocity
            <span className="text-xs text-text-muted font-normal ml-1">(avg per day, last 7d)</span>
          </h2>
          {velocity && (
            <div className="grid grid-cols-2 gap-3">
              <VelocityStat label="Observations/day" value={velocity.observations} threshold={5} />
              <VelocityStat label="Feedback/day" value={velocity.feedback} threshold={2} />
              <VelocityStat label="Episodes/day" value={velocity.episodes} threshold={1} />
              <VelocityStat label="KB updates/day" value={velocity.knowledge} threshold={1} />
            </div>
          )}
        </div>
      </div>

      {/* ═══ AUTOPILOT SECTION ═══ */}
      {autopilot && (
        <>
          <div className="border-t border-border pt-6 mt-2">
            <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2 mb-4">
              <Play size={20} className="text-accent-primary" />
              Autopilot
            </h2>
          </div>

          {/* Autopilot Status + Outcome Attribution */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Auto-Approval Status */}
            <div className="bg-bg-secondary border border-border rounded-lg p-4">
              <h3 className="text-sm font-medium text-text-primary mb-3">Auto-Approval</h3>
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${
                    autopilot.autoApproval.paused ? 'bg-accent-danger' :
                    autopilot.autoApproval.enabled ? 'bg-accent-success' : 'bg-text-muted'
                  }`} />
                  <span className="text-sm text-text-secondary">
                    {autopilot.autoApproval.paused ? 'Paused' :
                     autopilot.autoApproval.enabled ? 'Active' : 'Disabled'}
                  </span>
                </div>
                {autopilot.autoApproval.today && (
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-bg-elevated rounded px-2 py-1">
                      <div className="text-lg font-bold text-accent-success font-data">{autopilot.autoApproval.today.approved}</div>
                      <div className="text-[10px] text-text-muted">Approved</div>
                    </div>
                    <div className="bg-bg-elevated rounded px-2 py-1">
                      <div className="text-lg font-bold text-text-primary font-data">{autopilot.autoApproval.today.sent}</div>
                      <div className="text-[10px] text-text-muted">Sent</div>
                    </div>
                    <div className="bg-bg-elevated rounded px-2 py-1">
                      <div className="text-lg font-bold text-accent-warning font-data">{autopilot.autoApproval.today.held}</div>
                      <div className="text-[10px] text-text-muted">Held</div>
                    </div>
                  </div>
                )}
                {autopilot.autoApproval.circuitBreaker && (
                  <div className="text-xs text-text-muted">
                    Bounce rate: {autopilot.autoApproval.circuitBreaker.bounceRate7d}% · Cap: {autopilot.autoApproval.dailyCap}/day
                  </div>
                )}
              </div>
            </div>

            {/* Outcome Attribution */}
            <div className="bg-bg-secondary border border-border rounded-lg p-4">
              <h3 className="text-sm font-medium text-text-primary mb-3">Outcome Attribution</h3>
              {autopilot.outcomeAttribution && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 text-center">
                    <div className="bg-bg-elevated rounded px-2 py-1">
                      <div className="text-lg font-bold text-accent-success font-data">{autopilot.outcomeAttribution.real}</div>
                      <div className="text-[10px] text-text-muted">Real outcomes</div>
                    </div>
                    <div className="bg-bg-elevated rounded px-2 py-1">
                      <div className="text-lg font-bold text-text-muted font-data">{autopilot.outcomeAttribution.placeholder}</div>
                      <div className="text-[10px] text-text-muted">Placeholder</div>
                    </div>
                  </div>
                  {autopilot.outcomeAttribution.total > 0 && (
                    <div>
                      <div className="flex justify-between text-xs text-text-muted mb-1">
                        <span>Real outcome rate</span>
                        <span className="font-medium text-text-primary">
                          {Math.round((autopilot.outcomeAttribution.real / autopilot.outcomeAttribution.total) * 100)}%
                        </span>
                      </div>
                      <div className="h-1.5 bg-bg-elevated rounded-full overflow-hidden">
                        <div
                          className="h-full bg-accent-success rounded-full"
                          style={{ width: `${(autopilot.outcomeAttribution.real / autopilot.outcomeAttribution.total) * 100}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Schedule Health */}
            <div className="bg-bg-secondary border border-border rounded-lg p-4">
              <h3 className="text-sm font-medium text-text-primary mb-3">Schedule Health</h3>
              {autopilot.scheduleHealth && (
                <div className="space-y-3">
                  <div className="grid grid-cols-4 gap-2 text-center">
                    <div className="bg-bg-elevated rounded px-2 py-1">
                      <div className="text-lg font-bold text-accent-success font-data">{autopilot.scheduleHealth.green}</div>
                      <div className="text-[10px] text-text-muted">Healthy</div>
                    </div>
                    <div className="bg-bg-elevated rounded px-2 py-1">
                      <div className="text-lg font-bold text-amber-400 font-data">{autopilot.scheduleHealth.yellow}</div>
                      <div className="text-[10px] text-text-muted">Marginal</div>
                    </div>
                    <div className="bg-bg-elevated rounded px-2 py-1">
                      <div className="text-lg font-bold text-accent-danger font-data">{autopilot.scheduleHealth.red}</div>
                      <div className="text-[10px] text-text-muted">Poor</div>
                    </div>
                    <div className="bg-bg-elevated rounded px-2 py-1">
                      <div className="text-lg font-bold text-accent-warning font-data">{autopilot.scheduleHealth.paused}</div>
                      <div className="text-[10px] text-text-muted">Paused</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Market Intelligence Table */}
          {autopilot.marketIntel && autopilot.marketIntel.length > 0 && (
            <div className="bg-bg-secondary border border-border rounded-lg p-4">
              <h3 className="text-sm font-medium text-text-primary mb-3 flex items-center gap-2">
                <TrendingUp size={16} className="text-accent-primary" />
                Market Intelligence
                <span className="text-xs text-text-muted font-normal ml-1">(from real outcomes)</span>
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-text-muted uppercase">
                      <th className="pb-2 font-medium">Market</th>
                      <th className="pb-2 font-medium text-right">Episodes</th>
                      <th className="pb-2 font-medium text-right">Avg Score</th>
                      <th className="pb-2 font-medium text-right">Wins</th>
                      <th className="pb-2 font-medium text-right">Losses</th>
                      <th className="pb-2 font-medium text-right">Win Rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {autopilot.marketIntel.map((m, i) => (
                      <tr key={i} className="hover:bg-bg-elevated transition-colors">
                        <td className="py-1.5 text-text-primary font-medium">{m.market}</td>
                        <td className="py-1.5 text-right text-text-secondary font-data">{m.total}</td>
                        <td className={`py-1.5 text-right font-data font-medium ${
                          m.avgScore >= 50 ? 'text-accent-success' : m.avgScore >= 25 ? 'text-accent-warning' : 'text-accent-danger'
                        }`}>{m.avgScore}%</td>
                        <td className="py-1.5 text-right text-accent-success font-data">{m.wins}</td>
                        <td className="py-1.5 text-right text-accent-danger font-data">{m.losses}</td>
                        <td className="py-1.5 text-right font-data">
                          <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                            m.winRate >= 40 ? 'bg-accent-success/10 text-accent-success' :
                            m.winRate >= 20 ? 'bg-accent-warning/10 text-accent-warning' :
                            'bg-accent-danger/10 text-accent-danger'
                          }`}>{m.winRate}%</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Auto-Approval Activity Feed */}
          {autopilot.autoApprovalActivity && autopilot.autoApprovalActivity.length > 0 && (
            <div className="bg-bg-secondary border border-border rounded-lg p-4">
              <h3 className="text-sm font-medium text-text-primary mb-3">Recent Auto-Decisions</h3>
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {autopilot.autoApprovalActivity.map((a, i) => (
                  <div key={i} className="flex items-center gap-3 text-xs py-1 px-2 rounded hover:bg-bg-elevated">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      a.details?.includes('approved') ? 'bg-accent-success' :
                      a.details?.includes('paused') ? 'bg-accent-danger' : 'bg-text-muted'
                    }`} />
                    <span className="text-text-secondary flex-1 truncate">{a.details}</span>
                    <span className="text-text-muted shrink-0">
                      {a.created_at ? new Date(a.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function LayerCard({ icon, label, sublabel, count, velocity, color }) {
  return (
    <div className="bg-bg-secondary border border-border rounded-lg p-4">
      <div className="flex items-start justify-between mb-3">
        <div className={`p-2 rounded-lg bg-${color}/10`}>{icon}</div>
        {velocity !== undefined && velocity !== null && (
          <span className="text-xs text-text-muted">{velocity}/day</span>
        )}
      </div>
      <div className="text-2xl font-bold text-text-primary font-data">{count.toLocaleString()}</div>
      <div className="text-sm font-medium text-text-primary mt-1">{label}</div>
      <div className="text-xs text-text-muted">{sublabel}</div>
    </div>
  );
}

function FeedbackStat({ label, value, color }) {
  return (
    <div className="bg-bg-elevated rounded-lg py-2 px-1">
      <div className={`text-lg font-bold font-data ${color}`}>{value}</div>
      <div className="text-xs text-text-muted">{label}</div>
    </div>
  );
}

function VelocityStat({ label, value, threshold }) {
  const isGood = value >= threshold;
  const isOk = value > 0;
  return (
    <div className="bg-bg-elevated rounded-lg px-3 py-2">
      <div className={`text-lg font-bold font-data ${
        isGood ? 'text-accent-success' : isOk ? 'text-accent-warning' : 'text-accent-danger'
      }`}>{value}</div>
      <div className="text-xs text-text-muted">{label}</div>
    </div>
  );
}

function AgentRankRow({ rank, agent }) {
  const scoreColor = agent.avgScore >= 60
    ? 'text-accent-success'
    : agent.avgScore >= 30 ? 'text-accent-warning' : 'text-accent-danger';

  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-bg-elevated transition-colors">
      <span className="text-xs text-text-muted w-5 text-right font-data">{rank}</span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-text-primary truncate">{agent.agent}</div>
        <div className="text-xs text-text-muted">
          {agent.episodes} episodes · {agent.wins}W / {agent.losses}L
        </div>
      </div>
      <div className="text-right">
        <div className={`text-sm font-bold font-data ${scoreColor}`}>{agent.avgScore}%</div>
        <div className="text-xs text-text-muted">win rate: {agent.winRate}%</div>
      </div>
      {/* Score bar */}
      <div className="w-16 h-1.5 bg-bg-elevated rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${
            agent.avgScore >= 60 ? 'bg-accent-success' :
            agent.avgScore >= 30 ? 'bg-accent-warning' : 'bg-accent-danger'
          }`}
          style={{ width: `${agent.avgScore}%` }}
        />
      </div>
    </div>
  );
}
