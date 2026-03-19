// Weather Module Types — NOAA forecast data + Polymarket weather market matching

export interface CityConfig {
  name: string;
  lat: number;
  lon: number;
  slug: string; // e.g., 'nyc', 'chicago'
}

export interface HourlyForecast {
  time: Date;
  temperature: number; // °F
  temperatureUnit: string; // 'F' or 'C'
  humidity: number; // %
  windSpeed: string; // e.g., "10 mph"
  windDirection: string;
  precipitation: number; // probability %
  shortForecast: string; // "Partly Cloudy", "Rain", etc.
  isDaytime: boolean;
}

export interface TemperatureBucket {
  low: number;
  high: number;
  probability: number; // 0-1
}

export interface ExtremeWeatherAlert {
  city: string;
  type: string; // 'tornado', 'hurricane', 'blizzard', 'heat_wave', 'flood'
  severity: 'minor' | 'moderate' | 'severe' | 'extreme';
  headline: string;
  onset: Date;
  expires: Date;
}

export interface WeatherMarketMatch {
  marketId: string; // Polymarket conditionId
  question: string; // Market question text
  city: string;
  targetDate: string; // ISO date
  bucketLow: number;
  bucketHigh: number;
  metric: 'temperature' | 'precipitation' | 'wind' | 'snow';
  noaaProbability: number; // 0-1
  marketPrice: number; // 0-1 (YES token price)
  edge: number; // noaaProbability - marketPrice
}

export interface WeatherStrategyConfig {
  entryThreshold: number; // Min edge to buy (default 0.15)
  exitThreshold: number; // Sell when price reaches this (default 0.45)
  maxPositionSize: number; // USD per position (default 2.00)
  maxTradesPerScan: number; // Max trades per cycle (default 5)
  scanFrequencyMs: number; // Scan interval (default 120000 = 2 min)
  cities: string[]; // City slugs
  minLiquidity: number; // Min market liquidity (default 100)
  minEdge: number; // Min edge to consider (default 0.20)
  maxHoursUntilResolution: number; // Only trade near-term markets (default 48)
  stopLossThreshold: number; // Cut loss if price drops to this (default 0.03)
}

export const DEFAULT_CITIES: CityConfig[] = [
  { name: 'New York', lat: 40.7128, lon: -74.006, slug: 'nyc' },
  { name: 'Chicago', lat: 41.8781, lon: -87.6298, slug: 'chicago' },
  { name: 'Seattle', lat: 47.6062, lon: -122.3321, slug: 'seattle' },
  { name: 'Atlanta', lat: 33.749, lon: -84.388, slug: 'atlanta' },
  { name: 'Dallas', lat: 32.7767, lon: -96.797, slug: 'dallas' },
  { name: 'Miami', lat: 25.7617, lon: -80.1918, slug: 'miami' },
  { name: 'Denver', lat: 39.7392, lon: -104.9903, slug: 'denver' },
  { name: 'Los Angeles', lat: 34.0522, lon: -118.2437, slug: 'la' },
];
