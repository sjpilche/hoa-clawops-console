/**
 * @file DashboardPage.jsx
 * @description Chat-centric dashboard - the heart of ClawOps Console.
 *
 * LAYOUT:
 * [ ThreadList Sidebar | Message List | Message Input ]
 *
 * This is where users spend most of their time - chatting with agents,
 * running tasks, and seeing results in real-time.
 */

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useChatStore } from '@/stores/useChatStore';
import { useSocket } from '@/hooks/useSocket';
import { api } from '@/lib/api';
import ThreadList from '@/components/chat/ThreadList';
import MessageList from '@/components/chat/MessageList';
import MessageInput from '@/components/chat/MessageInput';
import ModeToggle from '@/components/chat/ModeToggle';
import RecommendationBanner from '@/components/chat/RecommendationBanner';
import {
  MessageSquare, Globe, Bot, Activity, Puzzle,
  Wrench, CheckCircle, TrendingUp, ArrowRight,
  Megaphone, Building2, DollarSign, Box, Database
} from 'lucide-react';

const ICON_MAP = { Megaphone, Building2, DollarSign, Box, Globe, Bot, Database, Activity };

function DomainOverview({ onStartChat }) {
  const navigate = useNavigate();
  const [domains, setDomains] = useState([]);
  const [stats, setStats] = useState({ agents: 0, extensions: 0, tools: 0, runs: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadOverview();
  }, []);

  const loadOverview = async () => {
    try {
      const [domainRes, agentRes] = await Promise.all([
        api.get('/domains').catch(() => ({ domains: [] })),
        api.get('/agents').catch(() => ({ agents: [] })),
      ]);
      const domainList = domainRes.domains || [];
      const agentList = agentRes.agents || [];
      setDomains(domainList);
      setStats({
        agents: agentList.length,
        extensions: domainList.reduce((sum, d) => sum + (d.stats?.extensions || 0), 0),
        tools: 0,
        runs: agentList.reduce((sum, a) => sum + (a.total_runs || 0), 0),
      });
    } catch (err) {
      console.error('Failed to load overview:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-text-muted">Loading dashboard...</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      {/* Welcome Header */}
      <div className="text-center pt-4 pb-2">
        <div className="w-14 h-14 mx-auto bg-accent-primary/10 rounded-2xl flex items-center justify-center mb-3">
          <MessageSquare size={28} className="text-accent-primary" />
        </div>
        <h2 className="text-2xl font-bold text-text-primary">ClawOps Console</h2>
        <p className="text-text-muted text-sm mt-1">Multi-domain agent orchestration platform</p>
      </div>

      {/* Global Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-3xl mx-auto">
        {[
          { icon: Bot, label: 'Agents', value: stats.agents, color: 'text-accent-primary' },
          { icon: Globe, label: 'Domains', value: domains.length, color: 'text-accent-success' },
          { icon: Puzzle, label: 'Extensions', value: stats.extensions, color: 'text-purple-400' },
          { icon: Activity, label: 'Total Runs', value: stats.runs, color: 'text-accent-warning' },
        ].map(({ icon: Icon, label, value, color }) => (
          <div key={label} className="bg-bg-secondary border border-border rounded-lg p-3 text-center">
            <Icon size={18} className={`${color} mx-auto mb-1`} />
            <div className="text-xl font-bold text-text-primary">{value}</div>
            <div className="text-[10px] text-text-muted uppercase tracking-wide">{label}</div>
          </div>
        ))}
      </div>

      {/* Domain Cards */}
      {domains.length > 0 && (
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-text-primary">Domains</h3>
            <button onClick={() => navigate('/domains')} className="text-xs text-accent-primary hover:underline flex items-center gap-1">
              View all <ArrowRight size={12} />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {domains.slice(0, 6).map(domain => {
              const DomainIcon = ICON_MAP[domain.icon] || Box;
              const domainStats = domain.stats || {};
              return (
                <button
                  key={domain.id}
                  onClick={() => navigate('/domains')}
                  className="bg-bg-secondary border border-border rounded-lg p-4 text-left hover:border-accent-primary/30 transition-colors"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${domain.color}20` }}>
                      <DomainIcon size={16} style={{ color: domain.color }} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-text-primary truncate">{domain.display_name}</div>
                      <div className="text-[10px] text-text-muted font-mono">{domain.name}</div>
                    </div>
                    <div className={`w-2 h-2 rounded-full ml-auto shrink-0 ${domain.status === 'active' ? 'bg-accent-success' : 'bg-text-muted'}`} />
                  </div>
                  <div className="flex gap-3 text-[10px] text-text-muted">
                    <span>{domainStats.agents || 0} agents</span>
                    <span>{domainStats.extensions || 0} ext</span>
                    <span>{domainStats.success_rate || 0}% success</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            onClick={(e) => { e.preventDefault(); onStartChat(); }}
            className="px-5 py-2.5 rounded-lg bg-accent-primary text-bg-primary font-semibold hover:bg-accent-primary/80 transition-colors text-sm"
          >
            Start Conversation
          </button>
          <button
            onClick={() => navigate('/agents')}
            className="px-5 py-2.5 rounded-lg bg-bg-secondary border border-border text-text-primary font-medium hover:border-accent-primary/30 transition-colors text-sm"
          >
            Browse Agents
          </button>
        </div>
        <div className="flex justify-center gap-4 mt-4 text-xs text-text-muted">
          <div className="flex items-center gap-1">
            <code className="px-1.5 py-0.5 bg-bg-elevated rounded text-accent-primary">/run</code>
            <span>Execute agent</span>
          </div>
          <div className="flex items-center gap-1">
            <code className="px-1.5 py-0.5 bg-bg-elevated rounded text-accent-primary">/list</code>
            <span>Show agents</span>
          </div>
          <div className="flex items-center gap-1">
            <code className="px-1.5 py-0.5 bg-bg-elevated rounded text-accent-primary">/help</code>
            <span>Commands</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const {
    threads,
    activeThreadId,
    messages,
    isLoading,
    isSending,
    chatMode,
    showModeRecommendation,
    recommendedMode,
    recommendationReason,
    fetchThreads,
    createThread,
    setActiveThread,
    deleteThread,
    sendMessage,
    setChatMode,
    acceptRecommendation,
    hideRecommendation,
  } = useChatStore();

  // Initialize Socket.io for real-time updates
  useSocket();

  // Load threads on mount
  useEffect(() => {
    fetchThreads();
  }, [fetchThreads]);

  return (
    <div className="h-full flex">
      {/* Thread List Sidebar */}
      <ThreadList
        threads={threads}
        activeThreadId={activeThreadId}
        onSelectThread={setActiveThread}
        onNewThread={createThread}
        onDeleteThread={deleteThread}
      />

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {activeThreadId ? (
          <>
            {/* Mode Toggle */}
            <div className="border-b border-border p-4 bg-bg-secondary flex items-center justify-between">
              <ModeToggle mode={chatMode} onModeChange={setChatMode} />
              <div className="text-xs text-text-muted">
                {chatMode === 'chat' ? '⚡ Fast responses' : '🌐 Browser automation'}
              </div>
            </div>

            {/* Recommendation Banner */}
            {showModeRecommendation && (
              <RecommendationBanner
                recommendedMode={recommendedMode}
                reason={recommendationReason}
                onAccept={acceptRecommendation}
                onDismiss={hideRecommendation}
              />
            )}

            {/* Message List */}
            <MessageList
              messages={messages}
              isLoading={isLoading}
            />

            {/* Message Input */}
            <MessageInput
              onSend={sendMessage}
              isDisabled={isSending}
              placeholder={
                chatMode === 'chat'
                  ? 'Ask me anything... (⚡ Fast mode)'
                  : 'Describe your automation task... (🌐 Agent mode)'
              }
            />
          </>
        ) : (
          /* Empty State - Domain Overview Dashboard */
          <DomainOverview onStartChat={() => createThread('New Conversation')} />
        )}
      </div>
    </div>
  );
}
