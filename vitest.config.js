import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    // Run in Node.js environment (not browser)
    environment: 'node',

    // Test file patterns
    include: ['tests/**/*.test.js', 'server/**/__tests__/**/*.test.js'],

    // Global setup/teardown
    globalSetup: './tests/setup.js',

    // Timeout per test (some agent tests may be slow)
    testTimeout: 15000,

    // Run tests sequentially (SQLite doesn't handle parallel well)
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },

    // Coverage
    coverage: {
      provider: 'v8',
      include: ['server/services/**', 'server/routes/**'],
      exclude: ['node_modules', 'tests', '**/__tests__'],
      reporter: ['text', 'text-summary'],
    },
  },

  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
});
