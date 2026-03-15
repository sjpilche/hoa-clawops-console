// =============================================================================
// PostgreSQL Pool — REMOVED
// =============================================================================
// This service now uses SQLite via ExecStore (same DB as the brain).
// PostgreSQL is no longer required.
//
// If you see this error, a file still imports from '@/db/pool'.
// Fix: Replace with `import { getExecStore } from '../singletons'`
// =============================================================================

export function getPool(): never {
  throw new Error(
    'PostgreSQL pool removed — use ExecStore (SQLite) instead. ' +
    'Import { getExecStore } from singletons.ts'
  );
}

export async function closePool(): Promise<void> {
  // No-op — SQLite closes automatically
}

export function getPoolStats() {
  return null;
}
