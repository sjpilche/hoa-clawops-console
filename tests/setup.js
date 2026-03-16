/**
 * @file tests/setup.js
 * @description Global test setup — runs once before all test files.
 * Sets environment variables and loads dotenv for test mode.
 */

export async function setup() {
  // Force test environment
  process.env.NODE_ENV = 'test';
  process.env.DB_PATH = ':memory:';

  // Suppress noisy console output during tests
  process.env.LOG_LEVEL = 'error';

  console.log('[Test Setup] Environment: test, DB: in-memory');
}

export async function teardown() {
  console.log('[Test Teardown] Done');
}
