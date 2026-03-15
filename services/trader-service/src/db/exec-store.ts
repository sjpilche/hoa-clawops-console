// =============================================================================
// ExecStore — SQLite execution adapter (replaces PostgreSQL Pool)
// =============================================================================
// Wraps the brain's better-sqlite3 instance with typed methods for:
// orders, fills, positions, risk checks, strategies, audit, kill switch.
//
// Drop-in replacement for the pg Pool calls scattered across the codebase.
// All methods are synchronous (better-sqlite3) — callers can await them
// since sync returns are valid Promises.
// =============================================================================

import Database from 'better-sqlite3';

export class ExecStore {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
    console.log('✓ ExecStore: SQLite execution adapter ready');
  }

  // ─── Orders ─────────────────────────────────────────────────────────────────

  insertOrder(order: {
    orderId: string;
    intentId: string;
    strategyId?: string;
    signalId?: string;
    brokerOrderId?: string;
    symbol: string;
    side: string;
    qty: number;
    orderType: string;
    limitPrice?: number;
    stopPrice?: number;
    timeInForce?: string;
    signalPrice?: number;
    status?: string;
  }): void {
    this.db.prepare(`
      INSERT INTO exec_orders (order_id, intent_id, strategy_id, signal_id, broker_order_id,
        symbol, side, qty, order_type, limit_price, stop_price, time_in_force, signal_price, status, submitted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      order.orderId, order.intentId, order.strategyId || null, order.signalId || null,
      order.brokerOrderId || null, order.symbol, order.side, order.qty,
      order.orderType, order.limitPrice || null, order.stopPrice || null,
      order.timeInForce || 'day', order.signalPrice || null, order.status || 'new'
    );
  }

  getOpenOrders(): any[] {
    return this.db.prepare(
      "SELECT * FROM exec_orders WHERE status IN ('new', 'submitted', 'partially_filled') ORDER BY created_at DESC"
    ).all();
  }

  getOrderByBrokerId(brokerOrderId: string): any | null {
    return this.db.prepare('SELECT * FROM exec_orders WHERE broker_order_id = ?').get(brokerOrderId);
  }

  updateOrderStatus(orderId: string, status: string, filledPrice?: number, filledQty?: number): void {
    if (filledPrice != null) {
      this.db.prepare(
        "UPDATE exec_orders SET status = ?, filled_price = ?, filled_qty = ?, filled_at = datetime('now'), last_update_at = datetime('now') WHERE order_id = ?"
      ).run(status, filledPrice, filledQty, orderId);
    } else {
      this.db.prepare(
        "UPDATE exec_orders SET status = ?, last_update_at = datetime('now') WHERE order_id = ?"
      ).run(status, orderId);
    }
  }

  updateOrderBrokerId(orderId: string, brokerOrderId: string): void {
    this.db.prepare(
      "UPDATE exec_orders SET broker_order_id = ?, status = 'submitted', submitted_at = datetime('now'), last_update_at = datetime('now') WHERE order_id = ?"
    ).run(brokerOrderId, orderId);
  }

  getOrderHistory(limit: number = 50, offset: number = 0): any[] {
    return this.db.prepare(
      'SELECT * FROM exec_orders ORDER BY created_at DESC LIMIT ? OFFSET ?'
    ).all(limit, offset);
  }

  // ─── Fills ──────────────────────────────────────────────────────────────────

  insertFill(fill: {
    fillId: string;
    orderId: string;
    symbol: string;
    side: string;
    price: number;
    qty: number;
    fee?: number;
    fillTs: string;
  }): void {
    this.db.prepare(`
      INSERT INTO exec_fills (fill_id, order_id, symbol, side, price, qty, fee, fill_ts)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(fill.fillId, fill.orderId, fill.symbol, fill.side, fill.price, fill.qty, fill.fee || 0, fill.fillTs);
  }

  getFillsForOrder(orderId: string): any[] {
    return this.db.prepare('SELECT * FROM exec_fills WHERE order_id = ?').all(orderId);
  }

  // ─── Positions ──────────────────────────────────────────────────────────────

  getLatestPosition(symbol: string): any | null {
    return this.db.prepare(
      'SELECT * FROM exec_positions WHERE symbol = ? ORDER BY ts DESC LIMIT 1'
    ).get(symbol);
  }

  getAllCurrentPositions(): any[] {
    // Get latest snapshot per symbol
    return this.db.prepare(`
      SELECT ep.* FROM exec_positions ep
      INNER JOIN (SELECT symbol, MAX(ts) as max_ts FROM exec_positions GROUP BY symbol) latest
        ON ep.symbol = latest.symbol AND ep.ts = latest.max_ts
      WHERE ep.qty != 0
    `).all();
  }

  insertPositionSnapshot(symbol: string, qty: number, avgPrice: number, marketPrice: number, unrealizedPnl: number): void {
    this.db.prepare(`
      INSERT INTO exec_positions (symbol, qty, avg_price, market_price, unrealized_pnl)
      VALUES (?, ?, ?, ?, ?)
    `).run(symbol, qty, avgPrice, marketPrice, unrealizedPnl);
  }

  // ─── Risk ───────────────────────────────────────────────────────────────────

  getRiskLimits(): Record<string, number> {
    const rows = this.db.prepare('SELECT limit_type, value FROM exec_risk_limits').all() as any[];
    const limits: Record<string, number> = {};
    for (const row of rows) limits[row.limit_type] = row.value;
    return limits;
  }

  getDailyPnl(date: string): any | null {
    return this.db.prepare('SELECT * FROM exec_daily_pnl WHERE date = ?').get(date);
  }

  updateDailyPnl(date: string, realizedPnl: number, unrealizedPnl: number, fees: number, tradeCount: number): void {
    this.db.prepare(`
      INSERT INTO exec_daily_pnl (date, realized_pnl, unrealized_pnl, fees, trade_count)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(date) DO UPDATE SET
        realized_pnl = realized_pnl + excluded.realized_pnl,
        unrealized_pnl = excluded.unrealized_pnl,
        fees = fees + excluded.fees,
        trade_count = trade_count + excluded.trade_count
    `).run(date, realizedPnl, unrealizedPnl, fees, tradeCount);
  }

  insertRiskCheck(intentId: string, passed: boolean, failReason: string | null, limits: any): void {
    this.db.prepare(`
      INSERT INTO exec_risk_checks (intent_id, passed, fail_reason, limits_json)
      VALUES (?, ?, ?, ?)
    `).run(intentId, passed ? 1 : 0, failReason, JSON.stringify(limits));
  }

  getTodayTradeCount(): number {
    const today = new Date().toISOString().slice(0, 10);
    const row = this.db.prepare(
      "SELECT COUNT(*) as c FROM exec_orders WHERE DATE(created_at) = ? AND status != 'rejected'"
    ).get(today) as any;
    return row?.c || 0;
  }

  // ─── Audit ──────────────────────────────────────────────────────────────────

  logAudit(actor: string, action: string, resource: string, diff?: any): void {
    this.db.prepare(
      'INSERT INTO exec_audit_log (actor, action, resource, diff_json) VALUES (?, ?, ?, ?)'
    ).run(actor, action, resource, diff ? JSON.stringify(diff) : null);
  }

  getAuditLog(limit: number = 50): any[] {
    return this.db.prepare('SELECT * FROM exec_audit_log ORDER BY ts DESC LIMIT ?').all(limit);
  }

  // ─── Kill Switch ────────────────────────────────────────────────────────────

  getKillSwitchState(): string {
    const row = this.db.prepare('SELECT status FROM exec_kill_switch WHERE id = 1').get() as any;
    return row?.status || 'armed';
  }

  setKillSwitchState(status: string): void {
    this.db.prepare("UPDATE exec_kill_switch SET status = ?, updated_at = datetime('now') WHERE id = 1").run(status);
  }

  // ─── Strategies ─────────────────────────────────────────────────────────────

  getStrategies(): any[] {
    return this.db.prepare('SELECT * FROM exec_strategies ORDER BY name').all();
  }

  upsertStrategy(id: string, name: string, version: string, enabled: boolean, params: any): void {
    this.db.prepare(`
      INSERT INTO exec_strategies (strategy_id, name, version, enabled, params_json)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(strategy_id) DO UPDATE SET
        name = excluded.name, version = excluded.version, enabled = excluded.enabled,
        params_json = excluded.params_json, updated_at = datetime('now')
    `).run(id, name, version, enabled ? 1 : 0, JSON.stringify(params));
  }

  setStrategyEnabled(id: string, enabled: boolean): void {
    this.db.prepare("UPDATE exec_strategies SET enabled = ?, updated_at = datetime('now') WHERE strategy_id = ?").run(enabled ? 1 : 0, id);
  }

  // ─── Performance Queries ────────────────────────────────────────────────────

  getTradeHistory(limit: number = 100): any[] {
    return this.db.prepare(`
      SELECT o.*, f.price as filled_price_actual, f.qty as filled_qty_actual, f.fee, f.fill_ts
      FROM exec_orders o
      LEFT JOIN exec_fills f ON f.order_id = o.order_id
      WHERE o.status IN ('filled', 'partially_filled')
      ORDER BY o.created_at DESC LIMIT ?
    `).all(limit);
  }

  getDailyPnlHistory(days: number = 30): any[] {
    return this.db.prepare(`
      SELECT * FROM exec_daily_pnl
      WHERE date >= date('now', '-${days} days')
      ORDER BY date ASC
    `).all();
  }

  // ─── Transaction helper ─────────────────────────────────────────────────────

  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }
}
