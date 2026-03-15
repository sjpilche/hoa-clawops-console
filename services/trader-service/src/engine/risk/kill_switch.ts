import { config } from '../../config';
import { getExecStore } from '../../singletons';

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
  async getStatus(): Promise<KillSwitchStatus> {
    try {
      const exec = getExecStore();
      if (exec) return exec.getKillSwitchState() as KillSwitchStatus;
    } catch {}
    return 'armed'; // Default if ExecStore not ready yet
  }

  async isTriggered(): Promise<boolean> {
    return (await this.getStatus()) === 'triggered';
  }

  async triggerManual(mode: KillSwitchMode, reason: string, actor: string): Promise<void> {
    console.log(`🚨 KILL SWITCH TRIGGERED (Manual) — Mode: ${mode}, Reason: ${reason}, Actor: ${actor}`);
    await this.trigger('manual', mode, reason, actor);
  }

  async triggerBreach(reason: string): Promise<void> {
    console.log(`🚨 KILL SWITCH TRIGGERED (Breach) — ${reason}`);
    await this.trigger('breach', config.killSwitchDefaultMode, reason, 'system');
  }

  async triggerDeadman(): Promise<void> {
    console.log(`🚨 KILL SWITCH TRIGGERED (Heartbeat Miss)`);
    await this.trigger('heartbeat_miss', config.killSwitchDefaultMode, 'Service heartbeat timeout', 'system');
  }

  private async trigger(triggerType: KillSwitchTrigger, mode: KillSwitchMode, reason: string, actor: string): Promise<void> {
    try {
      const exec = getExecStore();
      if (exec) {
        exec.transaction(() => {
          exec.setKillSwitchState('triggered');
          exec.logAudit(actor, 'kill_switch_triggered', 'kill_switch', { trigger: triggerType, mode, reason });
        });
      }
    } catch (err: any) {
      console.error('✗ Failed to persist kill switch state:', err.message);
    }

    if (mode === 'soft') {
      console.log('   → Soft mode: Stopping new orders');
    } else {
      console.log('   → Hard mode: Stopping new orders + cancel open + flatten');
    }

    console.log(`✓ Kill switch triggered (${mode} mode)`);
  }

  async reset(actor: string): Promise<void> {
    console.log(`🔄 Resetting kill switch (re-arming) — Actor: ${actor}`);
    try {
      const exec = getExecStore();
      if (exec) {
        exec.setKillSwitchState('armed');
        exec.logAudit(actor, 'kill_switch_reset', 'kill_switch', {});
      }
    } catch {}
    console.log('✓ Kill switch reset (re-armed)');
  }

  async getEvents(limit: number = 100): Promise<KillSwitchEvent[]> {
    try {
      const exec = getExecStore();
      if (exec) {
        return exec.getAuditLog(limit)
          .filter((a: any) => a.action.includes('kill_switch'))
          .map((a: any) => {
            const diff = a.diff_json ? JSON.parse(a.diff_json) : {};
            return {
              eventId: String(a.id),
              trigger: diff.trigger || 'manual',
              mode: diff.mode || 'soft',
              reason: diff.reason || '',
              actor: a.actor,
              timestamp: new Date(a.ts),
            };
          });
      }
    } catch {}
    return [];
  }

  async startMonitoring(): Promise<void> {
    console.log('🔍 Kill switch monitoring started');
    // Simplified — no heartbeat table needed for SQLite single-process
  }
}
