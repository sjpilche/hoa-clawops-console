import { RiskEngine } from '../risk/risk_engine';
import { AlpacaAdapter } from './broker/alpaca';
import { IBrokerAdapter } from './broker/types';
import { config } from '../../config';
import { v4 as uuidv4 } from 'uuid';
import { getExecStore } from '../../singletons';
import { ExecStore } from '../../db/exec-store';

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
  signalPrice?: number;
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
  private riskEngine: RiskEngine;
  private broker: IBrokerAdapter;

  constructor(broker?: IBrokerAdapter) {
    if (broker) {
      this.broker = broker;
    } else if (config.brokerApiKey && config.brokerApiSecret) {
      this.broker = new AlpacaAdapter({
        apiKey: config.brokerApiKey,
        apiSecret: config.brokerApiSecret,
        baseUrl: config.brokerBaseUrl,
      });
    } else {
      this.broker = null as unknown as IBrokerAdapter;
    }

    this.riskEngine = new RiskEngine(this.broker);
  }

  private get exec(): ExecStore {
    const store = getExecStore();
    if (!store) throw new Error('ExecStore not initialized');
    return store;
  }

  /**
   * Main entry point: Route an order intent through the system
   */
  async submitOrder(intent: OrderIntent): Promise<OrderResult> {
    console.log(`\n→ ORDER ROUTER: Processing intent ${intent.intentId}`);
    console.log(`   ${intent.side.toUpperCase()} ${intent.qty} ${intent.symbol} @ ${intent.orderType}`);

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

    // Step 2: Submit to broker
    try {
      await this.broker.connect();

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

      console.log(`✓ Order submitted to broker: ${brokerOrder.id} (status: ${brokerOrder.status})`);

      // Step 3: Log to SQLite
      const orderId = uuidv4();
      this.exec.transaction(() => {
        this.exec.insertOrder({
          orderId,
          intentId: intent.intentId,
          strategyId: intent.strategyId,
          signalId: intent.signalId,
          brokerOrderId: brokerOrder.id,
          symbol: intent.symbol,
          side: intent.side,
          qty: intent.qty,
          orderType: intent.orderType,
          limitPrice: intent.limitPrice,
          stopPrice: intent.stopPrice,
          timeInForce: intent.timeInForce,
          signalPrice: intent.signalPrice,
          status: brokerOrder.status || 'submitted',
        });

        this.exec.logAudit('system', 'order_submitted', orderId, {
          symbol: intent.symbol, side: intent.side, qty: intent.qty,
          brokerOrderId: brokerOrder.id,
        });
      });

      console.log(`✓ Order logged: ${orderId}`);

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

  async getOrderStatus(brokerOrderId: string): Promise<any> {
    await this.broker.connect();
    return await this.broker.getOrder(brokerOrderId);
  }

  async cancelOrder(brokerOrderId: string): Promise<void> {
    await this.broker.connect();
    await this.broker.cancelOrder(brokerOrderId);

    const order = this.exec.getOrderByBrokerId(brokerOrderId);
    if (order) {
      this.exec.updateOrderStatus(order.order_id, 'cancelled');
      this.exec.logAudit('system', 'order_cancelled', order.order_id, { brokerOrderId });
    }
  }

  async close(): Promise<void> {
    if (this.broker) await this.broker.disconnect();
  }
}
