/**
 * @file useRunStore.js
 * @description Active/queued/completed runs state. Phase 3 implementation.
 */
import { create } from 'zustand';

const useRunStore = create((set) => ({
  runs: [],
  activeRuns: [],
  setRuns: (runs) => set({ runs }),
}));

export { useRunStore };
