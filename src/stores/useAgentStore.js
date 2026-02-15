/**
 * @file useAgentStore.js
 * @description Agent registry and status state. Phase 3 implementation.
 */
import { create } from 'zustand';

const useAgentStore = create((set) => ({
  agents: [],
  setAgents: (agents) => set({ agents }),
  activeAgentCount: 0,
}));

export { useAgentStore };
