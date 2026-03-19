/**
 * Weather Market Question Parser
 * Parses Polymarket weather market questions into structured data
 * for matching against NOAA forecasts.
 */

import { DEFAULT_CITIES, CityConfig } from './types';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ParsedWeatherMarket {
  city: string | null;
  citySlug: string | null;
  metric: 'high_temp' | 'low_temp' | 'precipitation' | 'wind' | 'snow' | 'other';
  bucketLow: number | null;
  bucketHigh: number | null;
  threshold: number | null;
  direction: 'above' | 'below' | 'between' | null;
  targetDate: string | null;   // ISO date (YYYY-MM-DD)
  unit: 'F' | 'C' | 'inches' | 'mph' | null;
  confidence: number;          // 0-1
}

// ---------------------------------------------------------------------------
// City aliases  (lowercase → slug)
// ---------------------------------------------------------------------------

const CITY_ALIASES: Record<string, string> = {
  'nyc':            'nyc',
  'new york':       'nyc',
  'new york city':  'nyc',
  'manhattan':      'nyc',
  'brooklyn':       'nyc',
  'chicago':        'chicago',
  'chi':            'chicago',
  'seattle':        'seattle',
  'atlanta':        'atlanta',
  'atl':            'atlanta',
  'dallas':         'dallas',
  'dfw':            'dallas',
  'miami':          'miami',
  'denver':         'denver',
  'los angeles':    'la',
  'la':             'la',
  'l.a.':           'la',
  'san francisco':  'sf',
  'sf':             'sf',
  'boston':          'boston',
  'houston':        'houston',
  'phoenix':        'phoenix',
  'philadelphia':   'philadelphia',
  'philly':         'philadelphia',
  'minneapolis':    'minneapolis',
  'detroit':        'detroit',
  'portland':       'portland',
  'las vegas':      'las-vegas',
  'vegas':          'las-vegas',
  'washington':     'dc',
  'washington dc':  'dc',
  'dc':             'dc',
};

// Build a quick lookup: slug → city name (from DEFAULT_CITIES)
const SLUG_TO_NAME: Record<string, string> = {};
for (const c of DEFAULT_CITIES) {
  SLUG_TO_NAME[c.slug] = c.name;
}

// ---------------------------------------------------------------------------
// Weather keyword sets
// ---------------------------------------------------------------------------

const WEATHER_KEYWORDS = /\b(temperature|temp|°[FC]|degrees?\s*[FC]|\d+\s*[FC]\b|rain|rainfall|precipitation|snow|snowfall|wind|weather|forecast|high\s*temp|low\s*temp|daily\s*high|daily\s*low)\b/i;

const METRIC_PATTERNS: { pattern: RegExp; metric: ParsedWeatherMarket['metric'] }[] = [
  { pattern: /\b(high\s*temp|daily\s*high|high\s*temperature)\b/i, metric: 'high_temp' },
  { pattern: /\b(low\s*temp|daily\s*low|low\s*temperature|overnight\s*low)\b/i, metric: 'low_temp' },
  { pattern: /\b(rain|rainfall|precipitation|inches?\s*of\s*rain)\b/i, metric: 'precipitation' },
  { pattern: /\b(snow|snowfall|inches?\s*of\s*snow)\b/i, metric: 'snow' },
  { pattern: /\b(wind|wind\s*speed|gusts?)\b/i, metric: 'wind' },
];

// ---------------------------------------------------------------------------
// Month names for date parsing
// ---------------------------------------------------------------------------

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

// ---------------------------------------------------------------------------
// isWeatherMarket — quick filter
// ---------------------------------------------------------------------------

export function isWeatherMarket(question: string): boolean {
  return WEATHER_KEYWORDS.test(question);
}

// ---------------------------------------------------------------------------
// matchCitySlug — match text against known cities
// ---------------------------------------------------------------------------

export function matchCitySlug(text: string): string | null {
  const lower = text.toLowerCase();

  // Try longest alias first so "new york city" beats "new york"
  const sortedAliases = Object.keys(CITY_ALIASES).sort((a, b) => b.length - a.length);

  for (const alias of sortedAliases) {
    if (lower.includes(alias)) {
      return CITY_ALIASES[alias];
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// parseWeatherMarket — main parser
// ---------------------------------------------------------------------------

export function parseWeatherMarket(question: string): ParsedWeatherMarket {
  let confidence = 0;

  // --- City detection ---
  const citySlug = matchCitySlug(question);
  const city = citySlug ? (SLUG_TO_NAME[citySlug] || citySlug) : null;
  if (citySlug) confidence += 0.25;

  // --- Metric detection ---
  let metric: ParsedWeatherMarket['metric'] = 'other';
  for (const { pattern, metric: m } of METRIC_PATTERNS) {
    if (pattern.test(question)) {
      metric = m;
      confidence += 0.2;
      break;
    }
  }
  // If no explicit metric but we see temperature numbers with °F/°C, assume high_temp
  if (metric === 'other' && /\d+\s*°?\s*[FC]/i.test(question)) {
    metric = 'high_temp';
    confidence += 0.1;
  }

  // --- Unit detection ---
  let unit: ParsedWeatherMarket['unit'] = null;
  if (/°?\s*F\b|fahrenheit/i.test(question)) unit = 'F';
  else if (/°?\s*C\b|celsius/i.test(question)) unit = 'C';
  else if (/\binch(es)?\b/i.test(question)) unit = 'inches';
  else if (/\bmph\b/i.test(question)) unit = 'mph';
  if (unit) confidence += 0.05;

  // --- Temperature / threshold extraction ---
  let bucketLow: number | null = null;
  let bucketHigh: number | null = null;
  let threshold: number | null = null;
  let direction: ParsedWeatherMarket['direction'] = null;

  // Pattern: "72-76°F" or "72–76°F" or "72 - 76 °F" (range/bucket)
  // Must have °F/°C after the range to avoid matching dates like "March 22 — 68"
  const rangeMatch = question.match(/(\d{2,3}(?:\.\d+)?)\s*[-–]\s*(\d{2,3}(?:\.\d+)?)\s*°\s*[FC]/i)
    || question.match(/(\d{2,3}(?:\.\d+)?)°?\s*[FC]?\s*[-–]\s*(\d{2,3}(?:\.\d+)?)\s*°\s*[FC]/i);
  if (rangeMatch) {
    bucketLow = parseFloat(rangeMatch[1]);
    bucketHigh = parseFloat(rangeMatch[2]);
    direction = 'between';
    confidence += 0.2;
  }

  // Pattern: "above 72°F", "exceed 90°F", "over 72 degrees"
  if (!rangeMatch) {
    const aboveMatch = question.match(/\b(above|exceed|exceeds?|over|more\s+than|greater\s+than|at\s+least)\s+(\d+(?:\.\d+)?)\s*°?\s*[FC]?/i);
    if (aboveMatch) {
      threshold = parseFloat(aboveMatch[2]);
      direction = 'above';
      confidence += 0.2;
    }
  }

  // Pattern: "below 72°F", "under 60 degrees"
  if (!rangeMatch && !threshold) {
    const belowMatch = question.match(/\b(below|under|less\s+than|lower\s+than|at\s+most)\s+(\d+(?:\.\d+)?)\s*°?\s*[FC]?/i);
    if (belowMatch) {
      threshold = parseFloat(belowMatch[2]);
      direction = 'below';
      confidence += 0.2;
    }
  }

  // For precipitation: "more than 0.5 inches"
  if (!rangeMatch && !threshold && metric === 'precipitation') {
    const precMatch = question.match(/(\d+(?:\.\d+)?)\s*inch/i);
    if (precMatch) {
      threshold = parseFloat(precMatch[1]);
      direction = 'above';
      confidence += 0.15;
    }
  }

  // Fallback: if we see a bare number with °F and no direction keywords, treat as threshold above
  if (!rangeMatch && threshold === null) {
    const bareTemp = question.match(/\b(\d+(?:\.\d+)?)\s*°\s*[FC]/i);
    if (bareTemp) {
      threshold = parseFloat(bareTemp[1]);
      // Guess direction from context
      if (/\b(will|snow|rain|get)\b/i.test(question)) {
        direction = 'above';
      }
      confidence += 0.1;
    }
  }

  // --- Date extraction ---
  const targetDate = extractDate(question);
  if (targetDate) confidence += 0.15;

  // --- Snow / rain as boolean markets ---
  if (metric === 'snow' && threshold === null && direction === null) {
    // "Will Seattle get snow?" — boolean market
    threshold = 0;
    direction = 'above';
    unit = unit || 'inches';
    confidence += 0.1;
  }

  // Clamp confidence
  confidence = Math.min(confidence, 1.0);

  return {
    city,
    citySlug,
    metric,
    bucketLow,
    bucketHigh,
    threshold,
    direction,
    targetDate,
    unit,
    confidence,
  };
}

// ---------------------------------------------------------------------------
// Date extraction helper
// ---------------------------------------------------------------------------

function extractDate(question: string): string | null {
  const now = new Date();
  const currentYear = now.getFullYear();

  // Pattern: "March 20", "Mar 20", "March 20th"
  const monthDayMatch = question.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\s+(\d{1,2})(?:st|nd|rd|th)?\b/i);
  if (monthDayMatch) {
    const month = MONTHS[monthDayMatch[1].toLowerCase()];
    const day = parseInt(monthDayMatch[2], 10);
    if (month && day >= 1 && day <= 31) {
      return formatISODate(currentYear, month, day);
    }
  }

  // Pattern: "3/20", "03/20"
  const slashMatch = question.match(/\b(\d{1,2})\/(\d{1,2})\b/);
  if (slashMatch) {
    const month = parseInt(slashMatch[1], 10);
    const day = parseInt(slashMatch[2], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return formatISODate(currentYear, month, day);
    }
  }

  // Pattern: day names — "Saturday", "Monday"
  const dayNameMatch = question.match(new RegExp(`\\b(${DAY_NAMES.join('|')})\\b`, 'i'));
  if (dayNameMatch) {
    const targetDay = DAY_NAMES.indexOf(dayNameMatch[1].toLowerCase());
    const today = now.getDay();
    let daysAhead = targetDay - today;
    if (daysAhead <= 0) daysAhead += 7;
    const target = new Date(now);
    target.setDate(target.getDate() + daysAhead);
    return formatISODate(target.getFullYear(), target.getMonth() + 1, target.getDate());
  }

  // Pattern: "tomorrow"
  if (/\btomorrow\b/i.test(question)) {
    const target = new Date(now);
    target.setDate(target.getDate() + 1);
    return formatISODate(target.getFullYear(), target.getMonth() + 1, target.getDate());
  }

  // Pattern: "today"
  if (/\btoday\b/i.test(question)) {
    return formatISODate(now.getFullYear(), now.getMonth() + 1, now.getDate());
  }

  return null;
}

function formatISODate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
