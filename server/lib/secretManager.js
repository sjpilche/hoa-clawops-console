/**
 * @file secretManager.js
 * @description Environment variable validation and secret management.
 *
 * This module validates all environment variables on server startup,
 * ensuring the application never runs with invalid or insecure configuration.
 *
 * Usage:
 *   const { validateEnvironment } = require('./lib/secretManager');
 *   validateEnvironment(); // Call before starting server
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/**
 * Color codes for terminal output
 */
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

/**
 * Log error message and exit
 */
function fatal(message) {
  console.error(`${colors.red}❌ FATAL ERROR:${colors.reset} ${message}`);
  process.exit(1);
}

/**
 * Log warning message
 */
function warn(message) {
  console.warn(`${colors.yellow}⚠️  WARNING:${colors.reset} ${message}`);
}

/**
 * Log success message
 */
function success(message) {
  console.log(`${colors.green}✅${colors.reset} ${message}`);
}

/**
 * Log info message
 */
function info(message) {
  console.log(`${colors.cyan}ℹ${colors.reset}  ${message}`);
}

/**
 * Validate that a required environment variable exists
 */
function requireEnv(key, description) {
  const value = process.env[key];
  if (!value || value.trim() === '') {
    fatal(
      `Missing required environment variable: ${key}\n` +
        `   Description: ${description}\n` +
        `   Add to .env.local: ${key}=<value>`
    );
  }
  return value;
}

/**
 * Validate that an optional environment variable, if present, meets requirements
 */
function optionalEnv(key, defaultValue, validator) {
  const value = process.env[key] || defaultValue;
  if (validator) {
    try {
      validator(value, key);
    } catch (error) {
      fatal(`Invalid environment variable ${key}: ${error.message}`);
    }
  }
  return value;
}

/**
 * Validate JWT_SECRET strength
 */
function validateJWTSecret(secret) {
  // Check minimum length
  if (secret.length < 32) {
    fatal(
      `JWT_SECRET is too short: ${secret.length} characters\n` +
        `   Minimum required: 32 characters\n` +
        `   Recommended: 64+ characters\n` +
        `   Generate a strong secret:\n` +
        `   node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`
    );
  }

  // Check for forbidden default values
  const forbiddenPatterns = [
    'change-me',
    'changeme',
    'secret',
    'password',
    'dev-only',
    'example',
    'default',
  ];

  const lowerSecret = secret.toLowerCase();
  for (const pattern of forbiddenPatterns) {
    if (lowerSecret.includes(pattern)) {
      fatal(
        `JWT_SECRET contains forbidden pattern: "${pattern}"\n` +
          `   Never use default or example secrets in production!\n` +
          `   Generate a new random secret immediately.`
      );
    }
  }

  // Check entropy (variety of characters)
  const uniqueChars = new Set(secret).size;
  if (uniqueChars < 16) {
    warn(
      `JWT_SECRET has low entropy: only ${uniqueChars} unique characters\n` +
        `   Consider generating a new secret with more randomness.`
    );
  }

  // Warn if too short (but still acceptable)
  if (secret.length < 64) {
    warn(
      `JWT_SECRET is ${secret.length} characters. Recommended: 64+\n` +
        `   Current length is acceptable but consider increasing for better security.`
    );
  }

  success(`JWT_SECRET validated (${secret.length} chars, ${uniqueChars} unique chars)`);
}

/**
 * Validate database path
 */
function validateDatabasePath(dbPath) {
  const dir = path.dirname(dbPath);

  // Check if directory exists or can be created
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      info(`Created database directory: ${dir}`);
    } catch (error) {
      fatal(`Cannot create database directory ${dir}: ${error.message}`);
    }
  }

  // Check write permissions
  try {
    fs.accessSync(dir, fs.constants.W_OK);
  } catch (error) {
    fatal(`Database directory ${dir} is not writable: ${error.message}`);
  }

  success(`Database path validated: ${dbPath}`);
}

/**
 * Validate port number
 */
function validatePort(port, name) {
  const portNum = parseInt(port, 10);

  if (isNaN(portNum)) {
    fatal(`${name} must be a number, got: ${port}`);
  }

  if (portNum < 1 || portNum > 65535) {
    fatal(`${name} must be between 1 and 65535, got: ${portNum}`);
  }

  if (portNum < 1024 && process.platform !== 'win32') {
    warn(
      `${name} is ${portNum} (requires root/admin privileges on Unix systems)\n` +
        `   Consider using a port above 1024 for development.`
    );
  }

  return portNum;
}

/**
 * Validate safety limits
 */
function validateSafetyLimits() {
  const maxConcurrent = parseInt(process.env.MAX_CONCURRENT_AGENTS || '3', 10);
  const maxCost = parseFloat(process.env.MAX_COST_PER_RUN || '5.00');
  const maxDuration = parseInt(process.env.MAX_DURATION_PER_RUN || '300', 10);
  const maxTokens = parseInt(process.env.MAX_TOKENS_PER_RUN || '100000', 10);
  const maxRunsPerHour = parseInt(process.env.MAX_RUNS_PER_HOUR || '20', 10);

  // Validate ranges
  if (maxConcurrent < 1 || maxConcurrent > 10) {
    fatal(`MAX_CONCURRENT_AGENTS must be between 1 and 10, got: ${maxConcurrent}`);
  }

  if (maxCost < 0.01 || maxCost > 100) {
    fatal(`MAX_COST_PER_RUN must be between $0.01 and $100, got: $${maxCost}`);
  }

  if (maxDuration < 30 || maxDuration > 3600) {
    fatal(`MAX_DURATION_PER_RUN must be between 30 and 3600 seconds, got: ${maxDuration}`);
  }

  if (maxTokens < 100 || maxTokens > 1000000) {
    fatal(`MAX_TOKENS_PER_RUN must be between 100 and 1,000,000, got: ${maxTokens}`);
  }

  if (maxRunsPerHour < 1 || maxRunsPerHour > 1000) {
    fatal(`MAX_RUNS_PER_HOUR must be between 1 and 1000, got: ${maxRunsPerHour}`);
  }

  success(
    `Safety limits validated (concurrent: ${maxConcurrent}, cost: $${maxCost}, ` +
      `duration: ${maxDuration}s, tokens: ${maxTokens}, runs/hr: ${maxRunsPerHour})`
  );
}

/**
 * Validate OpenClaw configuration
 */
function validateOpenClawConfig() {
  const mode = process.env.OPENCLAW_MODE || 'shell';
  const openclawPath = process.env.OPENCLAW_PATH;

  // Validate mode
  if (!['shell', 'gateway'].includes(mode)) {
    fatal(`OPENCLAW_MODE must be 'shell' or 'gateway', got: ${mode}`);
  }

  // If shell mode, validate OpenClaw path
  if (mode === 'shell') {
    if (!openclawPath) {
      warn(
        `OPENCLAW_PATH not set. OpenClaw commands may fail.\n` +
          `   Set in .env.local: OPENCLAW_PATH=/path/to/openclaw`
      );
    } else {
      // Don't fail if path doesn't exist (might be on WSL)
      info(`OpenClaw mode: ${mode}, path: ${openclawPath}`);
    }
  }

  // If gateway mode, validate gateway URL
  if (mode === 'gateway') {
    const gatewayUrl = process.env.OPENCLAW_GATEWAY_URL;
    if (!gatewayUrl) {
      warn(
        `OPENCLAW_MODE is 'gateway' but OPENCLAW_GATEWAY_URL not set.\n` +
          `   Gateway mode may not work without a valid URL.`
      );
    } else {
      try {
        new URL(gatewayUrl);
        info(`OpenClaw gateway URL: ${gatewayUrl}`);
      } catch (error) {
        fatal(`OPENCLAW_GATEWAY_URL is not a valid URL: ${gatewayUrl}`);
      }
    }
  }

  success(`OpenClaw configuration validated (mode: ${mode})`);
}

/**
 * Validate NODE_ENV
 */
function validateNodeEnv() {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const validEnvironments = ['development', 'production', 'test'];

  if (!validEnvironments.includes(nodeEnv)) {
    warn(
      `NODE_ENV is "${nodeEnv}" (expected: development, production, or test)\n` +
        `   Defaulting to development mode.`
    );
    process.env.NODE_ENV = 'development';
  }

  const isProd = nodeEnv === 'production';
  const color = isProd ? colors.yellow : colors.green;
  console.log(`${color}🔧 Environment: ${nodeEnv}${colors.reset}`);

  // Production-specific warnings
  if (isProd) {
    warn('Running in PRODUCTION mode - ensure all secrets are properly rotated!');

    // Check if using example .env.local
    if (process.env.DEFAULT_ADMIN_PASSWORD === 'changeme123') {
      fatal(
        'DEFAULT_ADMIN_PASSWORD is still "changeme123" in production!\n' +
          '   Change this immediately in .env.local'
      );
    }
  }
}

/**
 * Check .env.local file permissions (Unix-like systems)
 */
function checkEnvFilePermissions() {
  const envPath = path.join(process.cwd(), '.env.local');

  if (!fs.existsSync(envPath)) {
    warn('.env.local file not found. Using defaults or .env.example.');
    return;
  }

  // Only check permissions on Unix-like systems
  if (process.platform === 'win32') {
    info('.env.local found (Windows - skipping permission check)');
    return;
  }

  try {
    const stats = fs.statSync(envPath);
    const mode = stats.mode & 0o777; // Get permission bits

    // Should be 600 (owner read/write only)
    if (mode !== 0o600) {
      warn(
        `.env.local has permissive file permissions: ${mode.toString(8)}\n` +
          `   Recommended: 600 (owner read/write only)\n` +
          `   Fix with: chmod 600 .env.local`
      );
    } else {
      success('.env.local permissions: 600 (secure)');
    }
  } catch (error) {
    warn(`Could not check .env.local permissions: ${error.message}`);
  }
}

/**
 * Validate API keys
 */
function validateAPIKeys() {
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!openaiKey || openaiKey === 'YOUR_NEW_API_KEY_HERE') {
    warn(
      'OPENAI_API_KEY not set or using placeholder value.\n' +
        '   Fast chat mode will not work without a valid OpenAI API key.\n' +
        '   Get a key at: https://platform.openai.com/api-keys'
    );
  } else if (openaiKey.startsWith('sk-proj-')) {
    success('OpenAI API key configured');
  } else {
    warn('OPENAI_API_KEY format looks unusual (expected to start with "sk-")');
  }
}

/**
 * Main validation function - validates all environment variables
 */
function validateEnvironment() {
  console.log('\n' + '='.repeat(60));
  console.log(`${colors.cyan}🔐 Environment Variable Validation${colors.reset}`);
  console.log('='.repeat(60) + '\n');

  try {
    // 1. Validate NODE_ENV
    validateNodeEnv();

    // 2. Check .env.local file permissions
    checkEnvFilePermissions();

    // 3. Validate required secrets
    const jwtSecret = requireEnv('JWT_SECRET', 'JSON Web Token signing secret');
    validateJWTSecret(jwtSecret);

    requireEnv('JWT_EXPIRY', 'JWT token expiry duration (e.g., "24h")');

    // 4. Validate database configuration
    const dbPath = requireEnv('DB_PATH', 'SQLite database file path');
    validateDatabasePath(dbPath);

    // 5. Validate server ports
    const serverPort = requireEnv('SERVER_PORT', 'Express server port');
    validatePort(serverPort, 'SERVER_PORT');

    const vitePort = optionalEnv('VITE_DEV_PORT', '5173');
    validatePort(vitePort, 'VITE_DEV_PORT');

    // 6. Validate safety limits
    validateSafetyLimits();

    // 7. Validate OpenClaw configuration
    validateOpenClawConfig();

    // 8. Validate API keys (warnings only)
    validateAPIKeys();

    // 9. Validate admin credentials
    requireEnv('DEFAULT_ADMIN_EMAIL', 'Default admin user email');
    requireEnv('DEFAULT_ADMIN_PASSWORD', 'Default admin user password');

    console.log('\n' + '='.repeat(60));
    console.log(`${colors.green}✅ All environment variables validated successfully!${colors.reset}`);
    console.log('='.repeat(60) + '\n');

    return true;
  } catch (error) {
    console.error(`\n${colors.red}❌ Environment validation failed!${colors.reset}\n`);
    throw error;
  }
}

/**
 * Generate a secure random secret
 */
function generateSecret(bytes = 64) {
  return crypto.randomBytes(bytes).toString('hex');
}

/**
 * Check if .env.example is up to date with current environment variables
 */
function checkEnvExample() {
  const examplePath = path.join(process.cwd(), '.env.example');

  if (!fs.existsSync(examplePath)) {
    warn('.env.example file not found - create one as a template for other developers');
    return;
  }

  const exampleContent = fs.readFileSync(examplePath, 'utf-8');
  const exampleKeys = new Set(
    exampleContent
      .split('\n')
      .filter((line) => line.trim() && !line.startsWith('#'))
      .map((line) => line.split('=')[0].trim())
  );

  const currentKeys = new Set(Object.keys(process.env).filter((key) => key.startsWith('VITE_') || [
    'SERVER_PORT',
    'JWT_SECRET',
    'JWT_EXPIRY',
    'DB_PATH',
    'OPENCLAW_MODE',
    'OPENCLAW_PATH',
    'OPENCLAW_GATEWAY_URL',
    'MAX_CONCURRENT_AGENTS',
    'MAX_COST_PER_RUN',
    'MAX_DURATION_PER_RUN',
    'MAX_TOKENS_PER_RUN',
    'MAX_RUNS_PER_HOUR',
    'OPENAI_API_KEY',
    'DEFAULT_ADMIN_EMAIL',
    'DEFAULT_ADMIN_PASSWORD',
    'NODE_ENV',
    'LOG_LEVEL',
  ].includes(key)));

  const missingInExample = [...currentKeys].filter((key) => !exampleKeys.has(key));

  if (missingInExample.length > 0) {
    warn(
      `Some environment variables are missing from .env.example:\n` +
        missingInExample.map((k) => `   - ${k}`).join('\n') +
        '\n   Consider adding them to .env.example for other developers.'
    );
  }
}

module.exports = {
  validateEnvironment,
  generateSecret,
  checkEnvExample,
  requireEnv,
  optionalEnv,
};
