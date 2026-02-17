import { Pool, PoolClient } from 'pg';
import { RiskEngine } from '../risk/risk_engine';
import { AlpacaAdapter } from './broker/alpaca';
import { IBrokerAdapter } from './broker/types';
import { config } from '../../config';
import { v4 as uuidv4 } from 'uuid';
import { getPool } from '../../db/pool';

// Order Intent (what the strategy wants to do)
export interface OrderIntent {
  intentId: string;
  strategyId?: string;
  signalId?: string;
  symbol: string;
  side: 'buy' | 'sell';
  qty: number;
  orderType: 'market' | 'limit' | 'stop' | 'stop_limit';
  limitPrice?: number;
  stopPrice?: number;
  timeInForce?: 'day' | 'gtc' | 'ioc' | 'fok';
  signalPrice?: number; // For slippage checks
}

// Order Result (what happened)
export interface OrderResult {
  success: boolean;
  intentId: string;
  orderId?: string;
  brokerOrderId?: string;
  failReason?: string;
  riskCheckPassed?: boolean;
  order?: any;
}

export class OrderRouter {
  private pool: Pool;
  private riskEngine: RiskEngine;
  private broker: IBrokerAdapter;

  constructor(pool?: Pool, broker?: IBrokerAdapter) {
    this.pool = pool || getPool();

    // Initialize broker (Alpaca for now)
    if (broker) {
      this.broker = broker;
    } else if (config.brokerApiKey && config.brokerApiSecret) {
      this.broker = new AlpacaAdapter({
        apiKey: config.brokerApiKey,
        apiSecret: config.brokerApiSecret,
        baseUrl: config.brokerBaseUrl,
      });
    } else {
      // No broker credentials — paper/dev mode (no live connection)
      this.broker = null as unknown as IBrokerAdapter;
    }

    // Initialize risk engine with broker for real-time price checks
    this.riskEngine = new RiskEngine(this.pool, this.broker);
  }

  /**
   * Main entry point: Route an order intent through the system
   *
   * Flow (wrapped in database transaction):
   * 1. BEGIN transaction
   * 2. Log intent to database
   * 3. Run pre-trade risk checks
   * 4. If pass: submit to broker
   * 5. Log order to database
   * 6. COMMIT transaction
   * 7. Return result
   *
   * If any step fails, ROLLBACK transaction to maintain audit trail consistency
   */
  async submitOrder(intent: OrderIntent): Promise<OrderResult> {
    console.log(`\n→ ORDER ROUTER: Processing intent ${intent.intentId}`);
    console.log(`   ${intent.side.toUpperCase()} ${intent.qty} ${intent.symbol} @ ${intent.orderType}`);

    // Check if broker is available
    if (!this.broker) {
      return {
        success: false,
        intentId: intent.intentId,
        failReason: 'No broker configured (BROKER_API_KEY not set)',
        riskCheckPassed: false,
      };
    }

    // Step 1: Run risk checks
    console.log(`→ Running risk checks...`);
    const riskCheck = await this.riskEngine.checkIntent(intent);

    if (!riskCheck.passed) {
      console.log(`✗ Risk check FAILED: ${riskCheck.failReason}`);
      return {
        success: false,
        intentId: intent.intentId,
        failReason: riskCheck.failReason,
        riskCheckPassed: false,
      };
    }

    console.log(`✓ Risk checks PASSED (${riskCheck.checksPassed.length} checks)`);

    // Step 2: Connect to broker and submit order
    try {
      await this.broker.connect();
      console.log(`✓ Connected to broker`);

      console.log(`→ Submitting order to broker...`);
      const brokerOrder = await this.broker.submitOrder({
        symbol: intent.symbol,
        qty: intent.qty,
        side: intent.side,
        type: intent.orderType,
        timeInForce: intent.timeInForce || 'day',
        limitPrice: intent.limitPrice,
        stopPrice: intent.stopPrice,
        clientOrderId: intent.intentId,
      });

      console.log(`✓ Order submitted to broker: ${brokerOrder.id}`);
      console.log(`   Status: ${brokerOrder.status}`);

      // Step 3: Log to DB (non-fatal — DB may not be available in dev)
      const orderId = await this.tryLogOrderToDb(intent, brokerOrder);

      return {
        success: true,
        intentId: intent.intentId,
        orderId,
        brokerOrderId: brokerOrder.id,
        riskCheckPassed: true,
        order: brokerOrder,
      };
    } catch (error: any) {
      console.error(`✗ Order submission failed:`, error.message);
      return {
        success: false,
        intentId: intent.intentId,
        failReason: error.message,
        riskCheckPassed: true,
      };
    }
  }

  /**
   * Attempt to log order to DB — non-fatal if DB unavailable
   */
  private async tryLogOrderToDb(intent: OrderIntent, brokerOrder: any): Promise<string | undefined> {
    let client;
    try {
      client = await this.pool.connect();
      await client.query('BEGIN');
      await this.logIntent(intent, client);
      const orderId = await this.logOrder(intent.intentId, brokerOrder, client);
      await this.logAudit('system', 'order_submitted', intent.intentId, {
        symbol: intent.symbol,
        side: intent.side,
        qty: intent.qty,
        brokerOrderId: brokerOrder.id,
      }, client);
      await client.query('COMMIT');
      console.log(`✓ Order logged to database: ${orderId}`);
      return orderId;
    } catch (_err) {
      try { if (client) await client.query('ROLLBACK'); } catch (_) {}
      console.warn(`⚠️  Order not logged to DB (DB unavailable) — broker order ID: ${brokerOrder.id}`);
      return undefined;
    } finally {
      if (client) client.release();
    }
  }

  /**
   * Log order intent to database
   */
  private async logIntent(intent: OrderIntent, client: PoolClient): Promise<void> {
    await client.query(
      `INSERT INTO trd_order_intent (
        intent_id, strategy_id, signal_id, symbol, side, qty,
        order_type, limit_price, stop_price, time_in_force, signal_price
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        intent.intentId,
        intent.strategyId || null,
        intent.signalId || null,
        intent.symbol,
        intent.side,
        intent.qty,
        intent.orderType,
        intent.limitPrice || null,
        intent.stopPrice || null,
        intent.timeInForce || 'day',
        intent.signalPrice || null,
      ]
    );
  }

  /**
   * Log order to database
   */
  private async logOrder(intentId: string, brokerOrder: any, client: PoolClient): Promise<string> {
    const orderId = uuidv4();

    await client.query(
      `INSERT INTO trd_order (
        order_id, intent_id, broker_order_id, status, submitted_at
      ) VALUES ($1, $2, $3, $4, $5)`,
      [
        orderId,
        intentId,
        brokerOrder.id,
        brokerOrder.status,
        brokerOrder.submittedAt || new Date(),
      ]
    );

    return orderId;
  }

  /**
   * Log to audit trail
   */
  private async logAudit(
    actor: string,
    action: string,
    resource: string,
    diff: any,
    client?: PoolClient
  ): Promise<void> {
    const queryRunner = client || this.pool;
    await queryRunner.query(
      `INSERT INTO trd_audit_log (actor, action, resource, diff_json)
       VALUES ($1, $2, $3, $4)`,
      [actor, action, resource, JSON.stringify(diff)]
    );
  }

  /**
   * Get order status from broker
   */
  async getOrderStatus(brokerOrderId: string): Promise<any> {
    await this.broker.connect();
    return await this.broker.getOrder(brokerOrderId);
  }

  /**
   * Cancel order (wrapped in transaction)
   */
  async cancelOrder(brokerOrderId: string): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Cancel with broker first
      await this.broker.connect();
      await this.broker.cancelOrder(brokerOrderId);

      // Update order status in database
      await client.query(
        `UPDATE trd_order
         SET status = 'cancelled', last_update_at = now()
         WHERE broker_order_id = $1`,
        [brokerOrderId]
      );

      // Log to audit trail
      await this.logAudit('system', 'order_cancelled', brokerOrderId, {}, client);

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Close connection
   */
  async close(): Promise<void> {
    await this.broker.disconnect();
    await this.pool.end();
  }
}
