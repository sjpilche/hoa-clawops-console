/**
 * @file KillSwitch.jsx
 * @description Global emergency stop button — ALWAYS VISIBLE in the header.
 *
 * SAFETY REQUIREMENT:
 * This button is ALWAYS accessible, regardless of what page the user is on.
 * When clicked, it sends a request to stop ALL running agents immediately.
 *
 * VISUAL DESIGN:
 * - Red background, white text — unmissable
 * - Pulses with animation when agents are actively running
 * - Disabled (gray) when no agents are running
 *
 * In Phase 1, this is a visual placeholder. Phase 4 wires it to openclawBridge.stopAll().
 */

import React, { useState } from 'react';
import { OctagonX } from 'lucide-react';
import { useAgentStore } from '@/stores/useAgentStore';
import { api } from '@/lib/api';

export default function KillSwitch() {
  const { activeAgentCount } = useAgentStore();
  const [isConfirming, setIsConfirming] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const hasRunningAgents = activeAgentCount > 0;

  const handleClick = async () => {
    if (!hasRunningAgents || isStopping) return;

    if (!isConfirming) {
      // First click — show confirmation
      setIsConfirming(true);
      // Auto-reset after 3 seconds if they don't confirm
      setTimeout(() => setIsConfirming(false), 3000);
      return;
    }

    // Second click — execute kill
    setIsStopping(true);
    try {
      console.log('[KillSwitch] 🛑 EMERGENCY STOP — Stopping all agents...');

      // Call OpenClaw Bridge to stop all agents
      const result = await api.post('/test/stop-all');

      console.log('[KillSwitch] ✅ All agents stopped:', result);
      alert(`✅ Emergency stop complete. Stopped ${result.count || 0} agents.`);
    } catch (error) {
      console.error('[KillSwitch] Failed to stop agents:', error);
      alert(`❌ Failed to stop agents: ${error.message}`);
    } finally {
      setIsConfirming(false);
      setIsStopping(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={!hasRunningAgents}
      className={`
        inline-flex items-center gap-2 px-4 py-2 rounded-lg
        text-sm font-semibold transition-all duration-200 cursor-pointer
        ${hasRunningAgents
          ? isConfirming
            ? 'bg-accent-danger text-white scale-105 shadow-lg shadow-accent-danger/30'
            : 'bg-accent-danger/20 text-accent-danger hover:bg-accent-danger hover:text-white kill-switch-active'
          : 'bg-bg-elevated text-text-muted cursor-not-allowed'
        }
      `}
      title={
        hasRunningAgents
          ? isConfirming
            ? 'Click again to STOP ALL agents'
            : 'Emergency Stop — Kill all running agents'
          : 'No agents running'
      }
    >
      <OctagonX size={18} />
      {isConfirming ? 'CONFIRM STOP ALL' : 'Kill Switch'}
    </button>
  );
}
