import { Pool } from 'pg';
import { config } from '../config';

/**
 * Singleton PostgreSQL Connection Pool
 *
 * This fixes the connection pool leak where a new pool was created
 * for every request, causing the service to crash after ~100 requests.
 *
 * Usage:
 *   import { getPool } from '@/db/pool';
 *   const pool = getPool();
 *   const result = await pool.query('SELECT * FROM ...');
 */

let poolInstance: Pool | null = null;

/**
 * Get the singleton database connection pool
 * Creates the pool on first call, returns existing instance on subsequent calls
 */
export function getPool(): Pool {
  if (!poolInstance) {
    poolInstance = new Pool({
      connectionString: config.dbUrl,
      max: 20,                    // Maximum number of clients in the pool
      idleTimeoutMillis: 30000,   // Close idle clients after 30 seconds
      connectionTimeoutMillis: 2000, // Return error after 2 seconds if connection can't be established
      allowExitOnIdle: false      // Keep pool alive even if all clients are idle
    });

    // Log pool errors
    poolInstance.on('error', (err, client) => {
      console.error('Unexpected error on idle database client:', err);
    });

    // Log pool connection events (useful for debugging)
    poolInstance.on('connect', (client) => {
      console.log('New database client connected to pool');
    });

    poolInstance.on('remove', (client) => {
      console.log('Database client removed from pool');
    });

    console.log('✓ Database connection pool initialized (max 20 connections)');
  }

  return poolInstance;
}

/**
 * Close the connection pool
 * Should be called on application shutdown
 */
export async function closePool(): Promise<void> {
  if (poolInstance) {
    await poolInstance.end();
    poolInstance = null;
    console.log('✓ Database connection pool closed');
  }
}

/**
 * Get current pool statistics
 * Useful for monitoring and debugging
 */
export function getPoolStats() {
  if (!poolInstance) {
    return null;
  }

  return {
    totalCount: poolInstance.totalCount,
    idleCount: poolInstance.idleCount,
    waitingCount: poolInstance.waitingCount
  };
}
