// =============================================================================
// Singletons — shared references to brain, scheduler, and tracker
// =============================================================================
// server.ts sets these after initialization. Routes import getters.

import type { BrainStore } from './engine/learning/brain-store';
import type { OutcomeTracker } from './engine/learning/outcome-tracker';
import type { TradingScheduler } from './engine/ai-panel/scheduler';
import type { PanelRunner } from './engine/ai-panel/panel-runner';
import type { CopyTradeEngine } from './engine/copy-trade/copy-trade-engine';
import type { ExecStore } from './db/exec-store';

let _brain: BrainStore | null = null;
let _scheduler: TradingScheduler | null = null;
let _outcomeTracker: OutcomeTracker | null = null;
let _panelRunner: PanelRunner | null = null;
let _copyEngine: CopyTradeEngine | null = null;
let _execStore: ExecStore | null = null;

export function setBrain(b: BrainStore | null) { _brain = b; }
export function setScheduler(s: TradingScheduler | null) { _scheduler = s; }
export function setOutcomeTracker(t: OutcomeTracker | null) { _outcomeTracker = t; }
export function setPanelRunner(p: PanelRunner | null) { _panelRunner = p; }
export function setCopyEngine(c: CopyTradeEngine | null) { _copyEngine = c; }
export function setExecStore(e: ExecStore | null) { _execStore = e; }

export function getBrain(): BrainStore | null { return _brain; }
export function getScheduler(): TradingScheduler | null { return _scheduler; }
export function getOutcomeTracker(): OutcomeTracker | null { return _outcomeTracker; }
export function getPanelRunner(): PanelRunner | null { return _panelRunner; }
export function getCopyEngine(): CopyTradeEngine | null { return _copyEngine; }
export function getExecStore(): ExecStore | null { return _execStore; }
