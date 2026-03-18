/**
 * Options Trading Types
 */

export type OptionType = 'call' | 'put';
export type OptionSide = 'buy_to_open' | 'sell_to_open' | 'buy_to_close' | 'sell_to_close';

export interface OptionContract {
  id: string;
  symbol: string;              // e.g. SPY260325C00665000
  name: string;                // e.g. SPY Mar 25 2026 665 Call
  underlyingSymbol: string;    // SPY
  type: OptionType;
  style: 'american' | 'european';
  strikePrice: number;
  expirationDate: string;      // YYYY-MM-DD
  multiplier: number;          // 100
  tradable: boolean;
  openInterest: number;
  lastPrice: number;
}

export interface OptionChainParams {
  underlyingSymbol: string;
  type?: OptionType;
  expirationDateGte?: string;  // YYYY-MM-DD
  expirationDateLte?: string;
  strikePriceGte?: number;
  strikePriceLte?: number;
  limit?: number;
}

export interface OptionQuote {
  symbol: string;
  bid: number;
  ask: number;
  mid: number;
  last: number;
  volume: number;
  openInterest: number;
}

export interface ContractSelection {
  /** Target: how far OTM as a decimal (0.02 = 2% OTM, -0.01 = 1% ITM) */
  moneyness: number;
  /** Target days to expiration */
  daysToExpiry: number;
  /** Minimum open interest */
  minOpenInterest: number;
  /** Maximum bid-ask spread as % of mid */
  maxSpreadPct: number;
}

export interface OptionsSignal {
  signalId: string;
  strategyId: string;
  underlyingSymbol: string;
  optionType: OptionType;
  side: OptionSide;
  contractSymbol?: string;     // specific contract if already selected
  strike?: number;
  expiration?: string;
  qty: number;                 // number of contracts
  maxPremium: number;          // max $ to pay per contract (for buys)
  reason: string;
  strength: number;
  features?: Record<string, any>;
  timestamp: Date;
}

export interface OptionsPosition {
  contractSymbol: string;
  underlyingSymbol: string;
  type: OptionType;
  side: 'long' | 'short';
  strike: number;
  expiration: string;
  qty: number;
  avgEntryPrice: number;
  currentPrice: number;
  unrealizedPnl: number;
  daysToExpiry: number;
}
