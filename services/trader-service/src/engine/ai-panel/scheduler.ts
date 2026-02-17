// =============================================================================
// Panel Scheduler
// =============================================================================
// Runs the AI analyst panel on a configurable schedule.
// Default: Once daily at 9:45 AM ET (15 min after market open, data has settled)
//
// Usage:
//   npx ts-node scheduler.ts                  # Start with defaults
//   PANEL_CRON="0 10,14 * * 1-5" npx ts-node scheduler.ts  # Custom: 10am + 2pm
// =============================================================================

import { execSync, spawn } from 'child_process';
import * as path from 'path';

// Default: 9:45 AM ET, Monday-Friday
// Cron format: minute hour day month weekday
const CRON_SCHEDULE = process.env.PANEL_CRON || '45 9 * * 1-5';
const DRY_RUN = process.env.PANEL_DRY_RUN === 'true';
const DIRECT_ALPACA = process.env.PANEL_DIRECT_ALPACA === 'true';

function parseCron(expr: string): { minute: string; hour: string; days: string } {
  const parts = expr.split(' ');
  return {
    minute: parts[0] || '*',
    hour: parts[1] || '*',
    days: parts[4] || '*',
  };
}

function shouldRunNow(expr: string): boolean {
  const now = new Date();
  const parts = expr.split(' ');

  const minute = parts[0];
  const hour = parts[1];
  const dayOfMonth = parts[2];
  const month = parts[3];
  const dayOfWeek = parts[4];

  const matchesMinute = minute === '*' || minute.split(',').includes(String(now.getMinutes()));
  const matchesHour = hour === '*' || hour.split(',').includes(String(now.getHours()));
  const matchesDayOfMonth = dayOfMonth === '*' || dayOfMonth.split(',').includes(String(now.getDate()));
  const matchesMonth = month === '*' || month.split(',').includes(String(now.getMonth() + 1));
  const matchesDayOfWeek = dayOfWeek === '*' || dayOfWeek.split(',').includes(String(now.getDay()))
    || (dayOfWeek.includes('-') && isInRange(now.getDay(), dayOfWeek));

  return matchesMinute && matchesHour && matchesDayOfMonth && matchesMonth && matchesDayOfWeek;
}

function isInRange(value: number, range: string): boolean {
  const [start, end] = range.split('-').map(Number);
  return value >= start && value <= end;
}

async function runPanel(): Promise<void> {
  console.log(`\n🕐 ${new Date().toISOString()} — Triggering panel run...`);

  const args: string[] = [];
  if (DRY_RUN) args.push('--dry-run');
  if (DIRECT_ALPACA) args.push('--direct-alpaca');

  const scriptPath = path.join(__dirname, 'run-panel.ts');

  return new Promise((resolve, reject) => {
    const proc = spawn('npx', ['ts-node', scriptPath, ...args], {
      stdio: 'inherit',
      shell: true,
    });

    proc.on('close', (code) => {
      if (code === 0) {
        console.log(`✅ Panel run completed successfully`);
        resolve();
      } else {
        console.error(`❌ Panel run exited with code ${code}`);
        reject(new Error(`Exit code ${code}`));
      }
    });
  });
}

// =============================================================================
// Main loop — check every minute if we should run
// =============================================================================

async function main() {
  const cron = parseCron(CRON_SCHEDULE);
  console.log(`${'🦞'.repeat(20)}`);
  console.log(`🦞 AI Analyst Panel Scheduler`);
  console.log(`🦞 Schedule: ${CRON_SCHEDULE}`);
  console.log(`🦞 (Minute: ${cron.minute}, Hour: ${cron.hour}, Days: ${cron.days})`);
  console.log(`🦞 Dry Run: ${DRY_RUN}`);
  console.log(`🦞 Direct Alpaca: ${DIRECT_ALPACA}`);
  console.log(`${'🦞'.repeat(20)}\n`);
  console.log('Waiting for next scheduled run...\n');

  let lastRunMinute = -1;

  setInterval(async () => {
    const now = new Date();
    const currentMinute = now.getHours() * 60 + now.getMinutes();

    // Avoid running twice in the same minute
    if (currentMinute === lastRunMinute) return;

    if (shouldRunNow(CRON_SCHEDULE)) {
      lastRunMinute = currentMinute;
      try {
        await runPanel();
      } catch (err) {
        console.error('Panel run failed:', err);
      }
    }
  }, 30_000); // Check every 30 seconds
}

main().catch(console.error);
