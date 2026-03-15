import { Router, Request, Response } from 'express';
import { authenticateJWT } from '../middleware/auth';

const router = Router();
router.use(authenticateJWT);

const GAMMA_API = 'https://gamma-api.polymarket.com';
const CLOB_API  = 'https://clob.polymarket.com';

// Shared fetch with timeout
async function apiFetch(url: string, timeoutMs = 10000): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// ─── Market Browser (Gamma API — public, no auth) ────────────────────────────

router.get('/markets', async (req: Request, res: Response) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    const order  = (req.query.order as string) || 'volume';
    const cat    = req.query.category as string;
    const q      = req.query.q as string;

    let url = `${GAMMA_API}/markets?active=true&limit=${limit}&offset=${offset}&order=${order}&ascending=false`;
    if (cat) url += `&category=${encodeURIComponent(cat)}`;
    if (q)   url += `&search=${encodeURIComponent(q)}`;

    const data = await apiFetch(url);
    const markets = Array.isArray(data) ? data : (data.markets || []);

    const formatted = markets.map((m: any) => ({
      conditionId:  m.conditionId || m.id,
      question:     m.question,
      category:     m.category || 'General',
      active:       m.active,
      closed:       m.closed || false,
      endDate:      m.endDate || m.end_date_iso,
      volume:       parseFloat(m.volume || m.volumeNum || '0'),
      liquidity:    parseFloat(m.liquidity || m.liquidityNum || '0'),
      outcomes:     m.outcomes ? JSON.parse(m.outcomes) : ['Yes', 'No'],
      outcomePrices: m.outcomePrices ? JSON.parse(m.outcomePrices) : [],
      url:          m.url || `https://polymarket.com/event/${m.slug || m.conditionId}`,
    }));

    res.json({ markets: formatted, total: formatted.length, offset });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Single Market ────────────────────────────────────────────────────────────

router.get('/markets/:conditionId', async (req: Request, res: Response) => {
  try {
    const data = await apiFetch(`${GAMMA_API}/markets/${req.params.conditionId}`);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Top Markets (macro-relevant for analyst context) ─────────────────────────

router.get('/top-markets', async (_req: Request, res: Response) => {
  try {
    const data = await apiFetch(
      `${GAMMA_API}/markets?active=true&limit=100&order=volume&ascending=false`
    );
    const markets = Array.isArray(data) ? data : (data.markets || []);

    // Filter for macro/equity-relevant keywords
    const MACRO_KEYWORDS = [
      'fed', 'rate', 'recession', 'inflation', 'gdp', 'cpi',
      's&p', 'nasdaq', 'dow', 'market', 'stock', 'earnings',
      'nvda', 'apple', 'tesla', 'bitcoin', 'crypto', 'economy',
      'unemployment', 'jobs', 'fomc', 'powell', 'tariff', 'trade',
    ];

    const relevant = markets
      .filter((m: any) => {
        const q = (m.question || '').toLowerCase();
        const vol = parseFloat(m.volume || m.volumeNum || '0');
        // Include: macro-keyword markets with $1k+ volume OR any market with $500k+ volume
        return (MACRO_KEYWORDS.some(kw => q.includes(kw)) && vol >= 1000) || vol >= 500000;
      })
      .slice(0, 20)
      .map((m: any) => {
        const outcomes     = m.outcomes     ? JSON.parse(m.outcomes)      : ['Yes', 'No'];
        const outcomePrices = m.outcomePrices ? JSON.parse(m.outcomePrices) : [];
        const yesPrice = parseFloat(outcomePrices[0] || '0.5');
        const noPrice  = parseFloat(outcomePrices[1] || (1 - yesPrice).toString());

        return {
          conditionId:  m.conditionId || m.id,
          question:     m.question,
          category:     m.category || 'Macro',
          volume:       parseFloat(m.volume || m.volumeNum || '0'),
          liquidity:    parseFloat(m.liquidity || m.liquidityNum || '0'),
          yesPrice:     Math.round(yesPrice * 100),
          noPrice:      Math.round(noPrice  * 100),
          endDate:      m.endDate || m.end_date_iso,
          url:          m.url || `https://polymarket.com/event/${m.slug || m.conditionId}`,
        };
      })
      .sort((a: any, b: any) => b.volume - a.volume);

    res.json({ markets: relevant, total: relevant.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Market Categories ────────────────────────────────────────────────────────

router.get('/categories', async (_req: Request, res: Response) => {
  try {
    const data = await apiFetch(`${GAMMA_API}/markets?active=true&limit=500&order=volume&ascending=false`);
    const markets = Array.isArray(data) ? data : (data.markets || []);

    const catMap = new Map<string, { count: number; volume: number }>();
    for (const m of markets) {
      const cat = m.category || 'General';
      const vol = parseFloat(m.volume || m.volumeNum || '0');
      const existing = catMap.get(cat) || { count: 0, volume: 0 };
      catMap.set(cat, { count: existing.count + 1, volume: existing.volume + vol });
    }

    const categories = Array.from(catMap.entries())
      .map(([name, stats]) => ({ name, ...stats }))
      .sort((a, b) => b.volume - a.volume);

    res.json({ categories });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Order Book (CLOB API — public) ──────────────────────────────────────────

router.get('/orderbook/:tokenId', async (req: Request, res: Response) => {
  try {
    const data = await apiFetch(`${CLOB_API}/book?token_id=${req.params.tokenId}`);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Price History ────────────────────────────────────────────────────────────

router.get('/prices/:conditionId', async (req: Request, res: Response) => {
  try {
    const data = await apiFetch(
      `${GAMMA_API}/prices-history?market=${req.params.conditionId}&interval=1d`
    );
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Account / Wallet Status (requires POLYMARKET_PRIVATE_KEY) ───────────────

router.get('/wallet-status', (_req: Request, res: Response) => {
  const hasKey = !!process.env.POLYMARKET_PRIVATE_KEY;
  const hasApi = !!(process.env.POLYMARKET_API_KEY && process.env.POLYMARKET_API_SECRET);

  res.json({
    configured: hasKey && hasApi,
    hasPrivateKey: hasKey,
    hasApiCredentials: hasApi,
    message: hasKey && hasApi
      ? 'Wallet configured — live trading available'
      : 'Add POLYMARKET_PRIVATE_KEY + POLYMARKET_API_KEY/SECRET to .env.trader for live trading',
    readonlyMode: !hasKey,
  });
});

export default router;
