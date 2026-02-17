import { Pool } from 'pg';
import { config } from '../../config';

export type KillSwitchTrigger = 'manual' | 'breach' | 'heartbeat_miss';
export type KillSwitchMode = 'soft' | 'hard';
export type KillSwitchStatus = 'armed' | 'triggered';

export interface KillSwitchEvent {
  eventId: string;
  trigger: KillSwitchTrigger;
  mode: KillSwitchMode;
  reason: string;
  actor: string;
  timestamp: Date;
}

export class KillSwitch {
  private pool: Pool;

  constructor(pool?: Pool) {
    this.pool = pool || new Pool({ connectionString: config.dbUrl });
  }

  /**
   * Get current kill switch status
   */
  async getStatus(): Promise<KillSwitchStatus> {
    const result = await this.pool.query(
      'SELECT status FROM trd_kill_switch_state WHERE id = 1'
    );

    if (result.rows.length === 0) {
      throw new Error('Kill switch state not initialized');
    }

    return result.rows[0].status as KillSwitchStatus;
  }

  /**
   * Check if kill switch is triggered
   */
  async isTriggered(): Promise<boolean> {
    const status = await this.getStatus();
    return status === 'triggered';
  }

  /**
   * Trigger kill switch manually (from console UI)
   */
  async triggerManual(mode: KillSwitchMode, reason: string, actor: string): Promise<void> {
    console.log(`🚨 KILL SWITCH TRIGGERED (Manual)`);
    console.log(`   Mode: ${mode}`);
    console.log(`   Reason: ${reason}`);
    console.log(`   Actor: ${actor}`);

    await this.trigger('manual', mode, reason, actor);
  }

  /**
   * Trigger kill switch automatically (breach detection)
   */
  async triggerBreach(reason: string): Promise<void> {
    console.log(`🚨 KILL SWITCH TRIGGERED (Breach)`);
    console.log(`   Reason: ${reason}`);

    await this.trigger('breach', config.killSwitchDefaultMode, reason, 'system');
  }

  /**
   * Trigger kill switch via deadman (heartbeat timeout)
   */
  async triggerDeadman(): Promise<void> {
    console.log(`🚨 KILL SWITCH TRIGGERED (Heartbeat Miss)`);

    await this.trigger(
      'heartbeat_miss',
      config.killSwitchDefaultMode,
      'Service heartbeat timeout',
      'system'
    );
  }

  /**
   * Core trigger method
   */
  private async trigger(
    triggerType: KillSwitchTrigger,
    mode: KillSwitchMode,
    reason: string,
    actor: string
  ): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Update state to triggered
      await client.query(
        `UPDATE trd_kill_switch_state
         SET status = 'triggered', updated_at = now(), updated_by = $1
         WHERE id = 1`,
        [actor]
      );

      // Log event
      await client.query(
        `INSERT INTO trd_kill_switch_event (trigger, mode, reason, actor)
         VALUES ($1, $2, $3, $4)`,
        [triggerType, mode, reason, actor]
      );

      // Execute kill switch actions
      await this.executeKillSwitch(mode, client);

      await client.query('COMMIT');

      console.log(`✓ Kill switch triggered successfully (${mode} mode)`);
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('✗ Failed to trigger kill switch:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Execute kill switch actions based on mode
   */
  private async executeKillSwitch(mode: KillSwitchMode, client: any): Promise<void> {
    if (mode === 'soft') {
      // Soft mode: Stop new orders only
      console.log('   → Soft mode: Stopping new orders');
      // Orders will be blocked by isTriggered() check in order flow
    } else {
      // Hard mode: Stop + Cancel + Flatten
      console.log('   → Hard mode: Stopping new orders');
      console.log('   → Hard mode: Cancelling open orders (TODO: implement broker calls)');
      console.log('   → Hard mode: Flattening positions (TODO: implement broker calls)');

      // TODO: Implement broker integration
      // await this.cancelAllOrders(client);
      // await this.flattenAllPositions(client);
    }
  }

  /**
   * Reset kill switch (re-arm)
   */
  async reset(actor: string): Promise<void> {
    console.log(`🔄 Resetting kill switch (re-arming)`);
    console.log(`   Actor: ${actor}`);

    await this.pool.query(
      `UPDATE trd_kill_switch_state
       SET status = 'armed', updated_at = now(), updated_by = $1
       WHERE id = 1`,
      [actor]
    );

    console.log('✓ Kill switch reset (re-armed)');
  }

  /**
   * Get kill switch event history
   */
  async getEvents(limit: number = 100): Promise<KillSwitchEvent[]> {
    const result = await this.pool.query(
      `SELECT event_id, trigger, mode, reason, actor, ts as timestamp
       FROM trd_kill_switch_event
       ORDER BY ts DESC
       LIMIT $1`,
      [limit]
    );

    return result.rows.map((row) => ({
      eventId: row.event_id,
      trigger: row.trigger,
      mode: row.mode,
      reason: row.reason,
      actor: row.actor,
      timestamp: row.timestamp,
    }));
  }

  /**
   * Monitor for breach conditions and auto-trigger
   */
  async monitorForBreaches(): Promise<void> {
    // This should be called periodically (e.g., every 30 seconds)
    // Check conditions that would trigger automatic kill switch

    // TODO: Implement breach detection logic
    // - Check if daily loss exceeds limit
    // - Check if position reconciliation fails
    // - Check for unknown error states
  }

  /**
   * Update heartbeat (to prevent deadman trigger)
   */
  async updateHeartbeat(): Promise<void> {
    await this.pool.query(
      `INSERT INTO trd_heartbeat (service, last_seen_at, status)
       VALUES ('trader-service', now(), 'healthy')
       ON CONFLICT (service)
       DO UPDATE SET last_seen_at = now(), status = 'healthy'`
    );
  }

  /**
   * Check if heartbeat has timed out (deadman trigger)
   */
  async checkHeartbeat(): Promise<boolean> {
    const result = await this.pool.query(
      `SELECT last_seen_at FROM trd_heartbeat WHERE service = 'trader-service'`
    );

    if (result.rows.length === 0) {
      return false; // No heartbeat record
    }

    const lastSeen = new Date(result.rows[0].last_seen_at);
    const now = new Date();
    const secondsSinceLastSeen = (now.getTime() - lastSeen.getTime()) / 1000;

    // Timeout threshold (default: 30 seconds)
    const timeoutSeconds = 30;

    if (secondsSinceLastSeen > timeoutSeconds) {
      console.warn(`⚠️  Heartbeat timeout: ${secondsSinceLastSeen}s since last seen`);
      return false;
    }

    return true;
  }

  /**
   * Start monitoring loop (should run in background)
   */
  async startMonitoring(): Promise<void> {
    console.log('🔍 Kill switch monitoring started');

    // Update heartbeat every 10 seconds
    const heartbeatInterval = setInterval(async () => {
      try {
        await this.updateHeartbeat();
      } catch (_error) {
        // Silently skip — DB may not be available in dev mode
      }
    }, 10000);

    // Check for breaches every 30 seconds
    const breachInterval = setInterval(async () => {
      try {
        await this.monitorForBreaches();
      } catch (error) {
        console.error('Failed to monitor breaches:', error);
      }
    }, 30000);

    // Cleanup on process exit
    process.on('SIGTERM', () => {
      clearInterval(heartbeatInterval);
      clearInterval(breachInterval);
    });

    process.on('SIGINT', () => {
      clearInterval(heartbeatInterval);
      clearInterval(breachInterval);
    });
  }
}
