// NOAA Weather Data Integration
// Free API, no auth required. Rate limit ~30 req/min.
// Docs: https://www.weather.gov/documentation/services-web-api

import {
  CityConfig,
  HourlyForecast,
  ExtremeWeatherAlert,
} from './types';

// --- NOAA response types (internal) ---

interface NOAAPointsResponse {
  properties: {
    forecastOffice: string;
    gridId: string;
    gridX: number;
    gridY: number;
    forecastHourly: string;
  };
}

interface NOAAPeriod {
  startTime: string;
  endTime: string;
  temperature: number;
  temperatureUnit: string;
  windSpeed: string;
  windDirection: string;
  shortForecast: string;
  isDaytime: boolean;
  relativeHumidity?: { value: number };
  probabilityOfPrecipitation?: { value: number | null };
}

interface NOAAForecastResponse {
  properties: {
    periods: NOAAPeriod[];
  };
}

// --- Cache structures ---

interface GridInfo {
  office: string;
  gridX: number;
  gridY: number;
  forecastUrl: string;
}

interface ForecastCacheEntry {
  forecasts: HourlyForecast[];
  fetchedAt: number;
}

const gridCache = new Map<string, GridInfo>();
const forecastCache = new Map<string, ForecastCacheEntry>();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

const USER_AGENT = '(OpenClaw Weather Bot, contact@example.com)';
const RETRY_DELAY_MS = 2000;
const INTER_CITY_DELAY_MS = 500;

// --- Helpers ---

function log(msg: string): void {
  console.log(`[Weather] ${msg}`);
}

function warn(msg: string): void {
  console.warn(`[Weather] ${msg}`);
}

async function noaaFetch<T>(url: string): Promise<T> {
  const headers = { 'User-Agent': USER_AGENT, Accept: 'application/geo+json' };

  let res = await fetch(url, { headers });

  // Retry once on server error
  if (res.status >= 500) {
    warn(`NOAA returned ${res.status} for ${url} — retrying in ${RETRY_DELAY_MS}ms`);
    await sleep(RETRY_DELAY_MS);
    res = await fetch(url, { headers });
  }

  if (!res.ok) {
    throw new Error(`NOAA API ${res.status}: ${res.statusText} (${url})`);
  }

  return res.json() as Promise<T>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// --- Core API functions ---

/**
 * Get NOAA grid coordinates for a city. Cached permanently (grid coords don't change).
 */
export async function getGridCoordinates(city: CityConfig): Promise<GridInfo> {
  const cached = gridCache.get(city.slug);
  if (cached) return cached;

  const url = `https://api.weather.gov/points/${city.lat},${city.lon}`;
  const data = await noaaFetch<NOAAPointsResponse>(url);

  const info: GridInfo = {
    office: data.properties.gridId,
    gridX: data.properties.gridX,
    gridY: data.properties.gridY,
    forecastUrl: data.properties.forecastHourly,
  };

  gridCache.set(city.slug, info);
  log(`Grid for ${city.name}: ${info.office} (${info.gridX},${info.gridY})`);
  return info;
}

/**
 * Fetch hourly forecast for a city. Returns up to 156 periods (~7 days).
 * Results cached for 30 minutes; stale cache used if fresh fetch fails.
 */
export async function fetchHourlyForecast(city: CityConfig): Promise<HourlyForecast[]> {
  // Check cache
  const cached = forecastCache.get(city.slug);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    const ageMin = Math.round((Date.now() - cached.fetchedAt) / 60_000);
    log(`Cache hit for ${city.name} (${ageMin} min old)`);
    return cached.forecasts;
  }

  try {
    const grid = await getGridCoordinates(city);
    const data = await noaaFetch<NOAAForecastResponse>(grid.forecastUrl);
    const periods = data.properties.periods;

    const forecasts: HourlyForecast[] = periods.map((p) => ({
      time: new Date(p.startTime),
      temperature: p.temperature,
      temperatureUnit: p.temperatureUnit,
      humidity: p.relativeHumidity?.value ?? 0,
      windSpeed: p.windSpeed,
      windDirection: p.windDirection,
      precipitation: p.probabilityOfPrecipitation?.value ?? 0,
      shortForecast: p.shortForecast,
      isDaytime: p.isDaytime,
    }));

    forecastCache.set(city.slug, { forecasts, fetchedAt: Date.now() });

    const temps = forecasts.map((f) => f.temperature);
    const min = Math.min(...temps);
    const max = Math.max(...temps);
    log(
      `Fetched ${city.name} forecast: ${forecasts.length} periods, range ${min}°F-${max}°F, next 48h`
    );

    return forecasts;
  } catch (err: any) {
    // Fall back to stale cache
    if (cached) {
      const ageMin = Math.round((Date.now() - cached.fetchedAt) / 60_000);
      warn(
        `NOAA API error for ${city.name}: ${err.message} — using cached data (${ageMin} min old)`
      );
      return cached.forecasts;
    }
    warn(`NOAA API error for ${city.name}: ${err.message} — no cached data available`);
    throw err;
  }
}

/**
 * Fetch forecasts for all cities in parallel.
 * Adds 500ms delay between requests to respect NOAA rate limits.
 * Logs failures but does not crash — partial results are returned.
 */
export async function fetchAllForecasts(
  cities: CityConfig[]
): Promise<Map<string, HourlyForecast[]>> {
  const results = new Map<string, HourlyForecast[]>();

  // Stagger requests to respect rate limit (~30 req/min)
  const promises = cities.map((city, i) =>
    sleep(i * INTER_CITY_DELAY_MS).then(async () => {
      try {
        const forecasts = await fetchHourlyForecast(city);
        return { slug: city.slug, forecasts, ok: true as const };
      } catch (err: any) {
        warn(`Failed to fetch ${city.name}: ${err.message}`);
        return { slug: city.slug, forecasts: [] as HourlyForecast[], ok: false as const };
      }
    })
  );

  const settled = await Promise.allSettled(promises);

  for (const result of settled) {
    if (result.status === 'fulfilled' && result.value.ok) {
      results.set(result.value.slug, result.value.forecasts);
    }
  }

  log(`Fetched forecasts for ${results.size}/${cities.length} cities`);
  return results;
}

// --- Probability calculation functions ---

/**
 * Calculate probability that the temperature falls within [bucketLow, bucketHigh] on targetDate.
 * Looks at all hourly periods for the target date and computes the fraction in range.
 */
export function calculateTemperatureProbability(
  forecasts: HourlyForecast[],
  bucketLow: number,
  bucketHigh: number,
  targetDate: string // ISO date like '2026-03-19'
): number {
  const dayForecasts = forecasts.filter((f) => toISODate(f.time) === targetDate);
  if (dayForecasts.length === 0) return 0;

  const temps = dayForecasts.map((f) => f.temperature);
  const maxTemp = Math.max(...temps);
  const minTemp = Math.min(...temps);

  // If forecast is very tight (spread <= 4°F), treat as high-confidence point estimate
  const spread = maxTemp - minTemp;
  if (spread <= 4) {
    // Check if the daily high falls in the bucket
    return maxTemp >= bucketLow && maxTemp <= bucketHigh ? 0.9 : 0.05;
  }

  // Count hourly periods where temp falls in bucket
  const inBucket = temps.filter((t) => t >= bucketLow && t <= bucketHigh).length;
  const rawProbability = inBucket / temps.length;

  // Also check: does the daily high land in the bucket?
  // Many Polymarket weather markets ask about the daily high
  const highInBucket = maxTemp >= bucketLow && maxTemp <= bucketHigh;

  if (highInBucket) {
    // Boost probability — daily high is in range
    return Math.min(1, rawProbability + 0.3);
  }

  return rawProbability;
}

/**
 * Calculate probability for "Will it be above/below X°F?" style markets.
 * Uses daytime forecasts to find the expected daily high, then estimates confidence
 * based on how tight the forecast spread is.
 */
export function calculateHighTempProbability(
  forecasts: HourlyForecast[],
  threshold: number,
  direction: 'above' | 'below',
  targetDate: string
): number {
  const dayForecasts = forecasts.filter((f) => toISODate(f.time) === targetDate);
  if (dayForecasts.length === 0) return 0;

  // Use daytime forecasts for high temp; fall back to all if none marked daytime
  const daytime = dayForecasts.filter((f) => f.isDaytime);
  const relevantForecasts = daytime.length > 0 ? daytime : dayForecasts;

  const temps = relevantForecasts.map((f) => f.temperature);
  const maxTemp = Math.max(...temps);
  const minTemp = Math.min(...temps);
  const spread = maxTemp - minTemp;

  // Confidence scaling: tighter forecast = higher confidence
  // Spread <= 3°F → very confident (0.90-0.95)
  // Spread 4-8°F → moderately confident (0.75-0.90)
  // Spread > 8°F → less confident (0.60-0.80)
  let confidence: number;
  if (spread <= 3) {
    confidence = 0.93;
  } else if (spread <= 8) {
    confidence = 0.85;
  } else {
    confidence = 0.70;
  }

  if (direction === 'above') {
    if (maxTemp > threshold + spread) {
      // Well above threshold — very likely
      return confidence;
    } else if (maxTemp > threshold) {
      // Above but close — scale by margin
      const margin = maxTemp - threshold;
      const scaleFactor = Math.min(1, margin / Math.max(spread, 1));
      return 0.5 + scaleFactor * (confidence - 0.5);
    } else if (maxTemp === threshold) {
      return 0.45; // Right on the edge
    } else {
      // Below threshold
      const deficit = threshold - maxTemp;
      const scaleFactor = Math.min(1, deficit / Math.max(spread, 1));
      return Math.max(0.05, 0.4 - scaleFactor * 0.35);
    }
  } else {
    // direction === 'below'
    if (maxTemp < threshold - spread) {
      return confidence;
    } else if (maxTemp < threshold) {
      const margin = threshold - maxTemp;
      const scaleFactor = Math.min(1, margin / Math.max(spread, 1));
      return 0.5 + scaleFactor * (confidence - 0.5);
    } else if (maxTemp === threshold) {
      return 0.45;
    } else {
      const excess = maxTemp - threshold;
      const scaleFactor = Math.min(1, excess / Math.max(spread, 1));
      return Math.max(0.05, 0.4 - scaleFactor * 0.35);
    }
  }
}

// --- Extreme weather detection ---

/** Keywords mapped to alert types */
const EXTREME_PATTERNS: { pattern: RegExp; type: string; severity: ExtremeWeatherAlert['severity'] }[] = [
  { pattern: /tornado\s*(watch|warning)/i, type: 'tornado', severity: 'extreme' },
  { pattern: /hurricane\s*(watch|warning)/i, type: 'hurricane', severity: 'extreme' },
  { pattern: /tropical\s*storm/i, type: 'hurricane', severity: 'severe' },
  { pattern: /blizzard\s*(watch|warning)?/i, type: 'blizzard', severity: 'severe' },
  { pattern: /ice\s*storm/i, type: 'blizzard', severity: 'severe' },
  { pattern: /extreme\s*(heat|cold)/i, type: 'heat_wave', severity: 'extreme' },
  { pattern: /heat\s*(advisory|warning|wave)/i, type: 'heat_wave', severity: 'severe' },
  { pattern: /excessive\s*heat/i, type: 'heat_wave', severity: 'extreme' },
  { pattern: /flash\s*flood/i, type: 'flood', severity: 'severe' },
  { pattern: /flood\s*(watch|warning)/i, type: 'flood', severity: 'moderate' },
  { pattern: /severe\s*thunderstorm/i, type: 'tornado', severity: 'moderate' },
  { pattern: /winter\s*storm\s*(watch|warning)/i, type: 'blizzard', severity: 'moderate' },
  { pattern: /wind\s*chill\s*(advisory|warning)/i, type: 'blizzard', severity: 'moderate' },
];

/**
 * Scan forecast text for extreme weather conditions that could create
 * tradeable events on Polymarket.
 */
export function detectExtremeWeather(
  forecasts: HourlyForecast[],
  city?: string
): ExtremeWeatherAlert[] {
  const alerts: ExtremeWeatherAlert[] = [];
  const seen = new Set<string>(); // dedupe by type+date

  for (const forecast of forecasts) {
    const text = forecast.shortForecast;

    for (const { pattern, type, severity } of EXTREME_PATTERNS) {
      if (!pattern.test(text)) continue;

      const dateKey = `${type}-${toISODate(forecast.time)}`;
      if (seen.has(dateKey)) continue;
      seen.add(dateKey);

      // Estimate alert window: onset at this period, expires 12h later
      const onset = forecast.time;
      const expires = new Date(onset.getTime() + 12 * 60 * 60 * 1000);

      alerts.push({
        city: city ?? 'unknown',
        type,
        severity,
        headline: `${type.replace('_', ' ').toUpperCase()}: ${text}`,
        onset,
        expires,
      });
    }
  }

  if (alerts.length > 0) {
    log(`Detected ${alerts.length} extreme weather alert(s) for ${city ?? 'unknown'}`);
  }

  return alerts;
}
