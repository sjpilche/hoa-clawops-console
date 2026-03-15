// =============================================================================
// Copy-Trade Engine — Mirror Polymarket wallets automatically
// =============================================================================
// Polls target wallet activity via Polymarket's public Data API.
// When a tracked wallet opens/closes a position → mirrors it at scaled size.
//
// Flow:
//   1. Poll data-api.polymarket.com/activity?user=0x... every 60s per wallet
//   2. Detect new trades (compare against seen trade IDs in memory)
//   3. For BUY trades: open matching position at scaledSize
//   4. For SELL/CLOSE trades: close matching position if we hold it
//   5. Log all activity to SQLite brain (if available)
// =============================================================================

import { BrainStore } from '../learning/brain-store';

const DATA_API = 'https://data-api.polymarket.com';
const GAMMA_API = 'https://gamma-api.polymarket.com';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CopyTarget {
  address: string;
  label: string;           // Human name e.g. "whale_001"
  scalePct: number;        // 0-100: what % of their trade size to copy
  maxUsdPerTrade: number;  // Hard cap per copied trade in USDC
  active: boolean;
  addedAt: Date;
}

export interface WalletTrade {
  id: string;              // Polymarket trade ID
  conditionId: string;
  tokenId: string;
  question: string;
  outcome: 'YES' | 'NO';
  side: 'BUY' | 'SELL';
  size: number;            // Shares
  price: number;           // Per-share price (0-1)
  usdcValue: number;       // size * price
  timestamp: Date;
  walletAddress: string;
}

export interface CopyAction {
  id: string;
  targetAddress: string;
  targetLabel: string;
  sourceTrade: WalletTrade;
  copySize: number;        // Our scaled share count
  copyUsd: number;         // Our USDC spend
  status: 'pending' | 'executed' | 'skipped' | 'failed';
  skipReason?: string;
  executedAt?: Date;
  error?: string;
  createdAt: Date;
}

export interface CopyEngineStatus {
  running: boolean;
  targets: CopyTarget[];
  totalActionsToday: number;
  totalSkipped: number;
  totalExecuted: number;
  lastPollAt: Date | null;
  dryRun: boolean;
}

// ---------------------------------------------------------------------------
// CopyTradeEngine
// ---------------------------------------------------------------------------

export class CopyTradeEngine {
  private targets: Map<string, CopyTarget> = new Map();
  private seenTradeIds: Map<string, Set<string>> = new Map(); // address → Set of trade IDs
  private actions: CopyAction[] = [];
  private running = false;
  private pollInterval: NodeJS.Timeout | null = null;
  private lastPollAt: Date | null = null;
  private brain: BrainStore | null;
  private dryRun: boolean;

  // Configurable limits
  private readonly POLL_INTERVAL_MS = 60_000;   // 1 minute
  private readonly MAX_ACTIONS_STORED = 500;
  private readonly MIN_TRADE_USD = 5;            // Ignore dust trades

  constructor(brain: BrainStore | null = null, dryRun = false) {
    this.brain = brain;
    this.dryRun = dryRun;
  }

  // -------------------------------------------------------------------------
  // Target management
  // -------------------------------------------------------------------------

  addTarget(target: Omit<CopyTarget, 'addedAt'>): void {
    const existing = this.targets.get(target.address.toLowerCase());
    if (existing) {
      // Update existing
      this.targets.set(target.address.toLowerCase(), { ...existing, ...target, addedAt: existing.addedAt });
    } else {
      this.targets.set(target.address.toLowerCase(), { ...target, addedAt: new Date() });
      this.seenTradeIds.set(target.address.toLowerCase(), new Set());
    }
    console.log(`📋 Copy target ${target.active ? 'added' : 'updated'}: ${target.label} (${target.address.slice(0, 8)}...) scale=${target.scalePct}% max=$${target.maxUsdPerTrade}`);
  }

  removeTarget(address: string): boolean {
    const key = address.toLowerCase();
    if (this.targets.has(key)) {
      this.targets.delete(key);
      this.seenTradeIds.delete(key);
      console.log(`📋 Copy target removed: ${address.slice(0, 8)}...`);
      return true;
    }
    return false;
  }

  getTargets(): CopyTarget[] {
    return Array.from(this.targets.values());
  }

  // -------------------------------------------------------------------------
  // Start / Stop
  // -------------------------------------------------------------------------

  start(): void {
    if (this.running) return;
    this.running = true;
    console.log(`🎯 Copy-trade engine started (${this.dryRun ? 'DRY RUN' : 'LIVE'}, ${this.targets.size} targets)`);
    // Immediate first poll
    this.pollAll();
    this.pollInterval = setInterval(() => this.pollAll(), this.POLL_INTERVAL_MS);
  }

  stop(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    this.running = false;
    console.log('🎯 Copy-trade engine stopped');
  }

  isRunning(): boolean { return this.running; }

  // -------------------------------------------------------------------------
  // Poll all active targets
  // -------------------------------------------------------------------------

  private async pollAll(): Promise<void> {
    this.lastPollAt = new Date();
    const activeTargets = Array.from(this.targets.values()).filter(t => t.active);
    if (activeTargets.length === 0) return;

    await Promise.allSettled(
      activeTargets.map(target => this.pollTarget(target))
    );
  }

  private async pollTarget(target: CopyTarget): Promise<void> {
    try {
      const trades = await this.fetchRecentTrades(target.address);
      const seen = this.seenTradeIds.get(target.address.toLowerCase()) || new Set();

      // On first poll, just seed the seen set (don't copy historical trades)
      const isFirstPoll = seen.size === 0;

      for (const trade of trades) {
        if (seen.has(trade.id)) continue;
        seen.add(trade.id);

        if (isFirstPoll) continue; // Skip historical — only copy future trades

        // Process new trade
        await this.processTrade(target, trade);
      }

      this.seenTradeIds.set(target.address.toLowerCase(), seen);
    } catch (err: any) {
      console.warn(`⚠️  Copy-trade poll failed for ${target.label}: ${err.message}`);
    }
  }

  // -------------------------------------------------------------------------
  // Fetch recent trades for a wallet (public Data API)
  // -------------------------------------------------------------------------

  private async fetchRecentTrades(address: string): Promise<WalletTrade[]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);

    try {
      const res = await fetch(
        `${DATA_API}/activity?user=${address}&limit=50`,
        { signal: controller.signal }
      );

      if (!res.ok) throw new Error(`Data API ${res.status}`);
      const data = await res.json() as any[];

      return (Array.isArray(data) ? data : []).map((t: any) => ({
        id: t.id || t.transactionHash || `${address}-${t.timestamp}`,
        conditionId: t.conditionId || t.market,
        tokenId: t.asset || t.tokenId || '',
        question: t.title || t.question || '',
        outcome: (t.outcome || 'YES').toUpperCase() as 'YES' | 'NO',
        side: (t.type || t.side || 'BUY').toUpperCase() as 'BUY' | 'SELL',
        size: parseFloat(t.size || t.shares || '0'),
        price: parseFloat(t.price || '0.5'),
        usdcValue: parseFloat(t.usdcValue || t.amount || '0') || parseFloat(t.size || '0') * parseFloat(t.price || '0.5'),
        timestamp: new Date(t.timestamp || t.createdAt || Date.now()),
        walletAddress: address,
      })).filter(t => t.size > 0 && t.usdcValue >= this.MIN_TRADE_USD);
    } finally {
      clearTimeout(timer);
    }
  }

  // -------------------------------------------------------------------------
  // Process a new trade from a target wallet
  // -------------------------------------------------------------------------

  private async processTrade(target: CopyTarget, trade: WalletTrade): Promise<void> {
    const actionId = `${target.address.slice(0, 8)}-${trade.id}`;

    console.log(`\n🎯 Copy signal: ${target.label} ${trade.side} ${trade.outcome} on "${trade.question?.slice(0, 50)}" @ ${(trade.price * 100).toFixed(0)}% ($${trade.usdcValue.toFixed(2)})`);

    // Calculate our scaled position size
    const scaledUsd = Math.min(
      trade.usdcValue * (target.scalePct / 100),
      target.maxUsdPerTrade
    );
    const scaledSize = trade.price > 0 ? scaledUsd / trade.price : 0;

    const action: CopyAction = {
      id: actionId,
      targetAddress: target.address,
      targetLabel: target.label,
      sourceTrade: trade,
      copySize: scaledSize,
      copyUsd: scaledUsd,
      status: 'pending',
      createdAt: new Date(),
    };

    // Pre-flight checks
    if (scaledUsd < this.MIN_TRADE_USD) {
      action.status = 'skipped';
      action.skipReason = `Scaled size $${scaledUsd.toFixed(2)} below minimum $${this.MIN_TRADE_USD}`;
      this.recordAction(action);
      console.log(`   ⏭  Skipped: ${action.skipReason}`);
      return;
    }

    if (!trade.conditionId) {
      action.status = 'skipped';
      action.skipReason = 'Missing conditionId — cannot route order';
      this.recordAction(action);
      return;
    }

    if (this.dryRun) {
      action.status = 'skipped';
      action.skipReason = `DRY RUN — would ${trade.side} ${scaledSize.toFixed(1)} shares @ $${scaledUsd.toFixed(2)}`;
      this.recordAction(action);
      console.log(`   🏃 ${action.skipReason}`);
      this.logToBrain(action);
      return;
    }

    // Live execution — requires PolymarketAdapter (injected via env check)
    const hasWallet = !!process.env.POLYMARKET_PRIVATE_KEY && !!process.env.POLYMARKET_API_KEY;
    if (!hasWallet) {
      action.status = 'skipped';
      action.skipReason = 'No wallet credentials configured';
      this.recordAction(action);
      console.log(`   ⚠️  Skipped: wallet not configured`);
      return;
    }

    try {
      // Dynamically import adapter to avoid loading ethers.js if not needed
      const { PolymarketAdapter } = await import('../execution/broker/polymarket');
      const adapter = new PolymarketAdapter({
        apiKey: process.env.POLYMARKET_API_KEY!,
        apiSecret: process.env.POLYMARKET_API_SECRET!,
        privateKey: process.env.POLYMARKET_PRIVATE_KEY!,
        chainId: 137,
        apiBaseUrl: process.env.POLYMARKET_BASE_URL || 'https://clob.polymarket.com',
        wsBaseUrl: 'wss://ws.polymarket.com',
        rpcUrl: process.env.POLYMARKET_RPC_URL || 'https://polygon-rpc.com',
        ctfExchangeAddress: '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045',
        collateralTokenAddress: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
        defaultSlippage: 0.02,
        maxOrderSize: target.maxUsdPerTrade,
        minOrderSize: this.MIN_TRADE_USD,
        enableLiveTrading: true,
        enableWebSocket: false,
        orderTimeout: 30_000,
        retryAttempts: 3,
        retryDelay: 1000,
      });

      const order = {
        tokenId: trade.tokenId,
        conditionId: trade.conditionId,
        outcome: trade.outcome,
        side: trade.side,
        size: scaledSize,
        price: trade.price,
        type: 'LIMIT' as const,
        slippage: 0.02,
        clientOrderId: actionId,
      };

      const result = await adapter.submitOrder(order);
      action.status = 'executed';
      action.executedAt = new Date();
      console.log(`   ✅ Copied: order ${result.orderId} — ${trade.side} ${scaledSize.toFixed(1)} shares @ $${scaledUsd.toFixed(2)}`);
    } catch (err: any) {
      action.status = 'failed';
      action.error = err.message;
      console.error(`   ❌ Copy failed: ${err.message}`);
    }

    this.recordAction(action);
    this.logToBrain(action);
  }

  // -------------------------------------------------------------------------
  // Record + log
  // -------------------------------------------------------------------------

  private recordAction(action: CopyAction): void {
    this.actions.unshift(action);
    if (this.actions.length > this.MAX_ACTIONS_STORED) {
      this.actions = this.actions.slice(0, this.MAX_ACTIONS_STORED);
    }
  }

  private logToBrain(action: CopyAction): void {
    if (!this.brain) return;
    try {
      this.brain.observe(
        `copy-${action.id}`,
        `copy-trade:${action.targetLabel}`,
        'copy_trade_action',
        `${action.status.toUpperCase()}: ${action.sourceTrade.side} ${action.sourceTrade.outcome} "${action.sourceTrade.question?.slice(0, 60)}"`,
        {
          targetAddress: action.targetAddress,
          targetLabel: action.targetLabel,
          sourceSide: action.sourceTrade.side,
          sourceUsd: action.sourceTrade.usdcValue,
          copyUsd: action.copyUsd,
          status: action.status,
          skipReason: action.skipReason,
          error: action.error,
        }
      );
    } catch { /* non-fatal */ }
  }

  // -------------------------------------------------------------------------
  // Query
  // -------------------------------------------------------------------------

  getActions(limit = 50): CopyAction[] {
    return this.actions.slice(0, limit);
  }

  getStatus(): CopyEngineStatus {
    const today = new Date().toDateString();
    const todayActions = this.actions.filter(a => a.createdAt.toDateString() === today);
    return {
      running: this.running,
      targets: this.getTargets(),
      totalActionsToday: todayActions.length,
      totalSkipped: this.actions.filter(a => a.status === 'skipped').length,
      totalExecuted: this.actions.filter(a => a.status === 'executed').length,
      lastPollAt: this.lastPollAt,
      dryRun: this.dryRun,
    };
  }

  // -------------------------------------------------------------------------
  // Leaderboard lookup (find wallets worth copying)
  // -------------------------------------------------------------------------

  static async fetchLeaderboard(limit = 20): Promise<any[]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const res = await fetch(
        `${DATA_API}/profiles?sortBy=profit&limit=${limit}`,
        { signal: controller.signal }
      );
      if (!res.ok) throw new Error(`Leaderboard API ${res.status}`);
      const data = await res.json() as any;
      const profiles = Array.isArray(data) ? data : (data.profiles || data.data || []);
      return profiles.map((p: any) => ({
        address: p.proxyWallet || p.address || p.wallet,
        username: p.name || p.username || 'Unknown',
        profit: parseFloat(p.profit || p.pnl || '0'),
        volume: parseFloat(p.volume || '0'),
        tradesCount: parseInt(p.tradesCount || p.trades || '0'),
        winRate: parseFloat(p.winRate || '0'),
        roi: parseFloat(p.roi || '0'),
        avatar: p.profileImage || p.avatar,
      })).filter((p: any) => p.address);
    } finally {
      clearTimeout(timer);
    }
  }

  // Fetch recent activity for any wallet (for preview before adding as target)
  static async fetchWalletActivity(address: string, limit = 20): Promise<any[]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const res = await fetch(
        `${DATA_API}/activity?user=${address}&limit=${limit}`,
        { signal: controller.signal }
      );
      if (!res.ok) throw new Error(`Activity API ${res.status}`);
      const data = await res.json() as any[];
      return Array.isArray(data) ? data : [];
    } finally {
      clearTimeout(timer);
    }
  }
}
