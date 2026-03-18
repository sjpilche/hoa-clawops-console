/**
 * Alpaca Options Broker — Chain fetching, contract selection, and order execution
 *
 * Uses Alpaca's options API endpoints:
 *   GET  /v2/options/contracts     — fetch options chain
 *   POST /v2/orders                — place options orders (same endpoint as equities)
 *   GET  /v2/positions             — includes options positions
 */

import { config } from '../../config';
import {
  OptionContract, OptionChainParams, OptionQuote,
  ContractSelection, OptionType, OptionSide, OptionsPosition,
} from './types';

export class AlpacaOptionsClient {
  private baseUrl: string;
  private headers: Record<string, string>;

  constructor() {
    this.baseUrl = config.brokerBaseUrl || 'https://paper-api.alpaca.markets';
    this.headers = {
      'APCA-API-KEY-ID': config.brokerApiKey || '',
      'APCA-API-SECRET-KEY': config.brokerApiSecret || '',
      'Content-Type': 'application/json',
    };
  }

  // ---------------------------------------------------------------------------
  // Chain fetching
  // ---------------------------------------------------------------------------

  async getChain(params: OptionChainParams): Promise<OptionContract[]> {
    const qs = new URLSearchParams();
    qs.set('underlying_symbols', params.underlyingSymbol);
    if (params.type) qs.set('type', params.type);
    if (params.expirationDateGte) qs.set('expiration_date_gte', params.expirationDateGte);
    if (params.expirationDateLte) qs.set('expiration_date_lte', params.expirationDateLte);
    if (params.strikePriceGte) qs.set('strike_price_gte', String(params.strikePriceGte));
    if (params.strikePriceLte) qs.set('strike_price_lte', String(params.strikePriceLte));
    qs.set('limit', String(params.limit || 50));

    const res = await fetch(`${this.baseUrl}/v2/options/contracts?${qs}`, {
      headers: this.headers,
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Options chain error ${res.status}: ${err}`);
    }

    const data = await res.json() as any;
    return (data.option_contracts || []).map((c: any) => ({
      id: c.id,
      symbol: c.symbol,
      name: c.name,
      underlyingSymbol: c.underlying_symbol,
      type: c.type as OptionType,
      style: c.style,
      strikePrice: parseFloat(c.strike_price),
      expirationDate: c.expiration_date,
      multiplier: parseInt(c.multiplier) || 100,
      tradable: c.tradable,
      openInterest: parseInt(c.open_interest) || 0,
      lastPrice: parseFloat(c.close_price) || 0,
    }));
  }

  // ---------------------------------------------------------------------------
  // Smart contract selection
  // ---------------------------------------------------------------------------

  /**
   * Find the optimal contract for a given trade idea.
   * Picks the contract closest to target moneyness + DTE + liquidity requirements.
   */
  async findContract(
    underlyingSymbol: string,
    underlyingPrice: number,
    type: OptionType,
    selection: ContractSelection,
  ): Promise<OptionContract | null> {
    const targetExpiry = new Date();
    targetExpiry.setDate(targetExpiry.getDate() + selection.daysToExpiry);
    const minExpiry = new Date();
    minExpiry.setDate(minExpiry.getDate() + Math.max(1, selection.daysToExpiry - 5));
    const maxExpiry = new Date();
    maxExpiry.setDate(maxExpiry.getDate() + selection.daysToExpiry + 5);

    // Calculate target strike based on moneyness
    const targetStrike = type === 'call'
      ? underlyingPrice * (1 + selection.moneyness)   // OTM call = above current price
      : underlyingPrice * (1 - selection.moneyness);  // OTM put = below current price

    // Fetch chain around the target
    const strikeRange = underlyingPrice * 0.05; // ±5% range
    const contracts = await this.getChain({
      underlyingSymbol,
      type,
      expirationDateGte: minExpiry.toISOString().slice(0, 10),
      expirationDateLte: maxExpiry.toISOString().slice(0, 10),
      strikePriceGte: Math.floor(targetStrike - strikeRange),
      strikePriceLte: Math.ceil(targetStrike + strikeRange),
      limit: 50,
    });

    if (contracts.length === 0) return null;

    // Filter by liquidity
    const liquid = contracts.filter(c =>
      c.tradable &&
      c.openInterest >= selection.minOpenInterest
    );

    if (liquid.length === 0) {
      // Fall back to any tradable contract
      const tradable = contracts.filter(c => c.tradable);
      if (tradable.length === 0) return null;
      return this.closestToTarget(tradable, targetStrike, targetExpiry);
    }

    return this.closestToTarget(liquid, targetStrike, targetExpiry);
  }

  private closestToTarget(contracts: OptionContract[], targetStrike: number, targetExpiry: Date): OptionContract {
    const targetMs = targetExpiry.getTime();
    return contracts.reduce((best, c) => {
      const strikeDist = Math.abs(c.strikePrice - targetStrike) / targetStrike;
      const expiryDist = Math.abs(new Date(c.expirationDate).getTime() - targetMs) / 86400000 / 30;
      const score = strikeDist + expiryDist * 0.5; // weight strike more than expiry

      const bestStrikeDist = Math.abs(best.strikePrice - targetStrike) / targetStrike;
      const bestExpiryDist = Math.abs(new Date(best.expirationDate).getTime() - targetMs) / 86400000 / 30;
      const bestScore = bestStrikeDist + bestExpiryDist * 0.5;

      return score < bestScore ? c : best;
    });
  }

  // ---------------------------------------------------------------------------
  // Order execution
  // ---------------------------------------------------------------------------

  async submitOrder(params: {
    contractSymbol: string;
    qty: number;
    side: 'buy' | 'sell';
    orderType: 'market' | 'limit';
    limitPrice?: number;
    timeInForce?: 'day' | 'gtc';
  }): Promise<any> {
    const body: any = {
      symbol: params.contractSymbol,
      qty: String(params.qty),
      side: params.side,
      type: params.orderType,
      time_in_force: params.timeInForce || 'day',
    };

    if (params.orderType === 'limit' && params.limitPrice) {
      body.limit_price = String(params.limitPrice);
    }

    console.log(`[OPTIONS] Submitting order: ${params.side} ${params.qty}x ${params.contractSymbol} @ ${params.orderType}${params.limitPrice ? ' $' + params.limitPrice : ''}`);

    const res = await fetch(`${this.baseUrl}/v2/orders`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Options order error ${res.status}: ${err}`);
    }

    const order = await res.json();
    console.log(`[OPTIONS] Order placed: ${(order as any).id}`);
    return order;
  }

  // ---------------------------------------------------------------------------
  // Positions
  // ---------------------------------------------------------------------------

  async getOptionsPositions(): Promise<OptionsPosition[]> {
    const res = await fetch(`${this.baseUrl}/v2/positions`, {
      headers: this.headers,
    });

    if (!res.ok) return [];

    const positions = await res.json() as any[];
    return positions
      .filter((p: any) => p.asset_class === 'us_option')
      .map((p: any) => {
        const symbol = p.symbol || '';
        const isCall = symbol.includes('C');
        const expMatch = symbol.match(/(\d{6})/);
        const expDate = expMatch ? `20${expMatch[1].slice(0, 2)}-${expMatch[1].slice(2, 4)}-${expMatch[1].slice(4, 6)}` : '';
        const daysToExpiry = expDate ? Math.max(0, Math.ceil((new Date(expDate).getTime() - Date.now()) / 86400000)) : 0;

        return {
          contractSymbol: symbol,
          underlyingSymbol: p.symbol?.replace(/\d.*/, '') || '',
          type: isCall ? 'call' : 'put' as OptionType,
          side: parseInt(p.qty) > 0 ? 'long' : 'short' as 'long' | 'short',
          strike: parseFloat(p.avg_entry_price) || 0, // approximate
          expiration: expDate,
          qty: Math.abs(parseInt(p.qty)),
          avgEntryPrice: parseFloat(p.avg_entry_price) || 0,
          currentPrice: parseFloat(p.current_price) || 0,
          unrealizedPnl: parseFloat(p.unrealized_pl) || 0,
          daysToExpiry,
        };
      });
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /** Get current price of the underlying stock */
  async getUnderlyingPrice(symbol: string): Promise<number> {
    const res = await fetch(`${this.baseUrl}/v2/stocks/${symbol}/quotes/latest`, {
      headers: this.headers,
    });
    if (!res.ok) throw new Error(`Quote error: ${res.status}`);
    const data = await res.json() as any;
    return (data.quote?.bp + data.quote?.ap) / 2 || data.quote?.bp || 0;
  }
}
