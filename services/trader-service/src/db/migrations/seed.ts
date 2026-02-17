#!/usr/bin/env node
import { Pool } from 'pg';
import { config } from '../../config';

const pool = new Pool({
  connectionString: config.dbUrl,
});

async function seed(): Promise<void> {
  console.log('🌱 Seeding database...\n');

  try {
    // Check if already seeded (risk limits exist)
    const existingLimits = await pool.query('SELECT COUNT(*) FROM trd_risk_limit');
    if (parseInt(existingLimits.rows[0].count, 10) >= 5) {
      console.log('✓ Database already seeded (risk limits exist)');
      console.log('  To reseed, delete data first: DELETE FROM trd_risk_limit;\n');
      return;
    }

    // Seed strategies (mock for now)
    console.log('→ Seeding strategies...');
    await pool.query(`
      INSERT INTO trd_strategy (name, version, enabled, params_json) VALUES
        ('ma-crossover', '1.0.0', false, '{"fastPeriod": 10, "slowPeriod": 50, "symbol": "AAPL"}'),
        ('mean-reversion', '1.0.0', false, '{"lookbackPeriod": 20, "entryThreshold": 2, "symbol": "MSFT"}')
      ON CONFLICT (name) DO NOTHING
    `);
    console.log('✓ Strategies seeded\n');

    // Verify seed
    const strategyCount = await pool.query('SELECT COUNT(*) FROM trd_strategy');
    const limitCount = await pool.query('SELECT COUNT(*) FROM trd_risk_limit');

    console.log('========================================');
    console.log('✓ Seed completed successfully');
    console.log('========================================');
    console.log(`Strategies: ${strategyCount.rows[0].count}`);
    console.log(`Risk Limits: ${limitCount.rows[0].count}`);
    console.log('========================================\n');

  } catch (error) {
    console.error('\n✗ Seed failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run if executed directly
if (require.main === module) {
  seed();
}

export { seed };
