import { Router, Request, Response } from 'express';
import { OrderRouter, OrderIntent } from '../../engine/execution/order_router';
import { v4 as uuidv4 } from 'uuid';
import { authenticateJWT, requireRole } from '../middleware/auth';
import { validate, orderIntentSchema, paginationSchema } from '../middleware/validate';
import { getPool } from '../../db/pool';

const router = Router();
const pool = getPool(); // Use singleton pool
const orderRouter = new OrderRouter();

// POST /api/orders/submit - Submit a new order (PROTECTED)
router.post('/submit',
  authenticateJWT,
  requireRole('trd_admin', 'trd_operator'),
  validate(orderIntentSchema),
  async (req: Request, res: Response) => {
  try {
    const { symbol, side, qty, orderType, limitPrice, stopPrice, timeInForce, signalPrice, strategyId } = req.body;

    // Create order intent
    const intent: OrderIntent = {
      intentId: uuidv4(),
      strategyId: strategyId || null,
      symbol: symbol.toUpperCase(),
      side,
      qty: parseFloat(qty),
      orderType,
      limitPrice: limitPrice ? parseFloat(limitPrice) : undefined,
      stopPrice: stopPrice ? parseFloat(stopPrice) : undefined,
      timeInForce: timeInForce || 'day',
      signalPrice: signalPrice ? parseFloat(signalPrice) : undefined,
    };

    console.log('\n📨 ORDER SUBMISSION REQUEST');
    console.log('='.repeat(50));
    console.log(`Symbol: ${intent.symbol}`);
    console.log(`Side: ${intent.side.toUpperCase()}`);
    console.log(`Qty: ${intent.qty}`);
    console.log(`Type: ${intent.orderType}`);
    if (intent.limitPrice) console.log(`Limit Price: $${intent.limitPrice}`);
    console.log('='.repeat(50));

    // Submit order through router
    const result = await orderRouter.submitOrder(intent);

    if (result.success) {
      console.log('\n✅ ORDER SUBMITTED SUCCESSFULLY');
      console.log(`   Intent ID: ${result.intentId}`);
      console.log(`   Order ID: ${result.orderId}`);
      console.log(`   Broker Order ID: ${result.brokerOrderId}`);
      console.log('');

      return res.status(201).json({
        success: true,
        message: 'Order submitted successfully',
        intentId: result.intentId,
        orderId: result.orderId,
        brokerOrderId: result.brokerOrderId,
        order: result.order,
      });
    } else {
      console.log('\n❌ ORDER REJECTED');
      console.log(`   Reason: ${result.failReason}`);
      console.log(`   Risk Check Passed: ${result.riskCheckPassed}`);
      console.log('');

      return res.status(400).json({
        success: false,
        error: 'Order rejected',
        reason: result.failReason,
        riskCheckPassed: result.riskCheckPassed,
        intentId: result.intentId,
      });
    }
  } catch (error: any) {
    console.error('Order submission error:', error);
    return res.status(500).json({
      error: 'Order submission failed',
      message: error.message,
    });
  }
});

// GET /api/orders/:brokerOrderId - Get order status
router.get('/:brokerOrderId', async (req: Request, res: Response) => {
  try {
    const { brokerOrderId } = req.params;

    const order = await orderRouter.getOrderStatus(brokerOrderId);

    res.json({
      order,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Failed to get order status:', error);
    res.status(500).json({
      error: 'Failed to get order status',
      message: error.message,
    });
  }
});

// DELETE /api/orders/:brokerOrderId - Cancel order (PROTECTED)
router.delete('/:brokerOrderId',
  authenticateJWT,
  requireRole('trd_admin', 'trd_operator'),
  async (req: Request, res: Response) => {
  try {
    const { brokerOrderId } = req.params;

    await orderRouter.cancelOrder(brokerOrderId);

    res.json({
      success: true,
      message: 'Order cancelled',
      brokerOrderId,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Failed to cancel order:', error);
    res.status(500).json({
      error: 'Failed to cancel order',
      message: error.message,
    });
  }
});

// GET /api/orders - Get order history (from database)
router.get('/',
  authenticateJWT,
  async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 1000);
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);

    const result = await pool.query(`
      SELECT
        i.intent_id,
        i.strategy_id,
        i.symbol,
        i.side,
        i.qty,
        i.order_type,
        i.limit_price,
        i.created_at as intent_created_at,
        o.order_id,
        o.broker_order_id,
        o.status,
        o.submitted_at,
        r.passed as risk_passed,
        r.fail_reason
      FROM trd_order_intent i
      LEFT JOIN trd_risk_check r ON r.intent_id = i.intent_id
      LEFT JOIN trd_order o ON o.intent_id = i.intent_id
      ORDER BY i.created_at DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);

    res.json({
      orders: result.rows,
      count: result.rows.length,
      timestamp: new Date().toISOString(),
    });
  } catch (_error: any) {
    // DB unavailable — return empty order history
    res.json({ orders: [], count: 0, timestamp: new Date().toISOString() });
  }
});

export default router;
