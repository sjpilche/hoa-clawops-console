import dotenv from 'dotenv';
import { z } from 'zod';
import path from 'path';

// Load environment variables — try .env.trader first, fall back to .env.local in the console root
const serviceDir = path.resolve(__dirname, '../..');
const consoleRoot = path.resolve(serviceDir, '../..');
dotenv.config({ path: path.join(serviceDir, '.env.trader') });
dotenv.config({ path: path.join(consoleRoot, '.env.local') });

// Configuration schema
const ConfigSchema = z.object({
  // Server
  port: z.coerce.number().default(3002),
  metricsPort: z.coerce.number().default(9090),
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),

  // Database (optional in development — service runs with in-memory fallbacks)
  dbUrl: z.string().default('postgresql://localhost:5432/trader_dev'),

  // Broker
  brokerApiKey: z.string().optional(),
  brokerApiSecret: z.string().optional(),
  brokerBaseUrl: z.string().default('https://paper-api.alpaca.markets'),

  // Trading Mode
  tradingMode: z.enum(['paper', 'live']).default('paper'),

  // Risk Limits
  riskMaxDailyLoss: z.coerce.number().default(500),
  riskMaxPositionUsd: z.coerce.number().default(2000),
  riskMaxGrossExposureUsd: z.coerce.number().default(5000),
  riskMaxTradesPerDay: z.coerce.number().default(10),

  // Kill Switch
  killSwitchEnabled: z.string().optional().transform((v) => v !== 'false' && v !== '0').default('true'),
  killSwitchDefaultMode: z.enum(['soft', 'hard']).default('soft'),

  // Market Hours
  enforceMarketHours: z.string().optional().transform((v) => v !== 'false' && v !== '0').default('true'),

  // Console JWT (optional in development — auth is disabled)
  consoleJwtIssuer: z.string().default('openclaw-console'),
  consoleJwtAudience: z.string().default('trader-service'),
  consoleJwtPublicKey: z.string().optional().default(''),
  consoleUrl: z.string().default('http://localhost:5173'),

  // Logging
  logLevel: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
});

export type Config = z.infer<typeof ConfigSchema>;

function loadConfig(): Config {
  const config = ConfigSchema.parse({
    port: process.env.PORT,
    metricsPort: process.env.METRICS_PORT,
    nodeEnv: process.env.NODE_ENV,
    dbUrl: process.env.DB_URL_TRADER,
    brokerApiKey: process.env.BROKER_API_KEY,
    brokerApiSecret: process.env.BROKER_API_SECRET,
    brokerBaseUrl: process.env.BROKER_BASE_URL,
    tradingMode: process.env.TRADING_MODE,
    riskMaxDailyLoss: process.env.RISK_MAX_DAILY_LOSS,
    riskMaxPositionUsd: process.env.RISK_MAX_POSITION_USD,
    riskMaxGrossExposureUsd: process.env.RISK_MAX_GROSS_EXPOSURE_USD,
    riskMaxTradesPerDay: process.env.RISK_MAX_TRADES_PER_DAY,
    killSwitchEnabled: process.env.KILL_SWITCH_ENABLED,
    killSwitchDefaultMode: process.env.KILL_SWITCH_DEFAULT_MODE,
    enforceMarketHours: process.env.ENFORCE_MARKET_HOURS,
    consoleJwtIssuer: process.env.CONSOLE_JWT_ISSUER,
    consoleJwtAudience: process.env.CONSOLE_JWT_AUDIENCE,
    consoleJwtPublicKey: process.env.CONSOLE_JWT_PUBLIC_KEY,
    consoleUrl: process.env.CONSOLE_URL,
    logLevel: process.env.LOG_LEVEL,
  });

  return config;
}

export const config = loadConfig();
