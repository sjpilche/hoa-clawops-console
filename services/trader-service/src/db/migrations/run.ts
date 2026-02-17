#!/usr/bin/env node
import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import { config } from '../../config';

const pool = new Pool({
  connectionString: config.dbUrl,
});

interface Migration {
  version: number;
  name: string;
  filename: string;
}

async function createMigrationsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  console.log('✓ Migrations table ready');
}

async function getAppliedMigrations(): Promise<number[]> {
  const result = await pool.query(
    'SELECT version FROM schema_migrations ORDER BY version'
  );
  return result.rows.map((row) => row.version);
}

async function getPendingMigrations(applied: number[]): Promise<Migration[]> {
  const migrationsDir = __dirname;
  const files = fs.readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const migrations: Migration[] = files.map((filename) => {
    const match = filename.match(/^(\d+)_(.+)\.sql$/);
    if (!match) {
      throw new Error(`Invalid migration filename: ${filename}`);
    }
    return {
      version: parseInt(match[1], 10),
      name: match[2],
      filename,
    };
  });

  return migrations.filter((m) => !applied.includes(m.version));
}

async function runMigration(migration: Migration): Promise<void> {
  const filepath = path.join(__dirname, migration.filename);
  const sql = fs.readFileSync(filepath, 'utf8');

  console.log(`\n→ Running migration ${migration.version}: ${migration.name}`);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Run migration SQL
    await client.query(sql);

    // Record migration
    await client.query(
      'INSERT INTO schema_migrations (version, name) VALUES ($1, $2)',
      [migration.version, migration.name]
    );

    await client.query('COMMIT');
    console.log(`✓ Migration ${migration.version} applied successfully`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(`✗ Migration ${migration.version} failed:`, error);
    throw error;
  } finally {
    client.release();
  }
}

async function runMigrations(): Promise<void> {
  console.log('🦞 OpenClaw Trader - Database Migrations');
  console.log('========================================\n');

  try {
    await createMigrationsTable();

    const applied = await getAppliedMigrations();
    console.log(`Applied migrations: ${applied.length}`);

    const pending = await getPendingMigrations(applied);
    console.log(`Pending migrations: ${pending.length}`);

    if (pending.length === 0) {
      console.log('\n✓ Database is up to date');
      return;
    }

    for (const migration of pending) {
      await runMigration(migration);
    }

    console.log('\n========================================');
    console.log('✓ All migrations completed successfully');
    console.log('========================================\n');
  } catch (error) {
    console.error('\n✗ Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run if executed directly
if (require.main === module) {
  runMigrations();
}

export { runMigrations };
