/**
 * Polymarket Probability Strategy
 * Trade prediction markets based on probability analysis
 */

import { Pool } from 'pg';
import { IStrategy, StrategyConfig, Signal } from '../types';
import { PolymarketAdapter } from '../../execution/broker/polymarket';
import { PolymarketMarket } from '../../execution/broker/polymarket-types';
import { v4 as uuidv4 } from 'uuid';

interface PolymarketStrategyParams {
  categories: string[];  // e.g., ["Politics", "Sports", "Crypto"]
  minLiquidity: number;  // Minimum market liquidity in USDC
  minVolume: number;     // Minimum 24h volume
  maxPrice: number;      // Don't buy above this price (e.g., 0.90 = 90%)
  minPrice: number;      // Don't sell below this price (e.g., 0.10 = 10%)
  targetSpread: number;  // Look for spreads larger than this (e.g., 0.05 = 5%)
  positionSize: number;  // USDC per trade
  minTimeToClose: number; // Hours before market closes
}

export class PolymarketProbabilityStrategy implements IStrategy {
  private id: string;
  private name: string = 'Polymarket Probability';
  private version: string = '1.0.0';
  private config: StrategyConfig;
  private pool: Pool;
  private broker: PolymarketAdapter;
  private params: PolymarketStrategyParams;

  constructor(
    strategyId: string,
    config: StrategyConfig,
    pool: Pool,
    broker: PolymarketAdapter
  ) {
    this.id = strategyId;
    this.config = config;
    this.pool = pool;
    this.broker = broker;

    // Parse parameters
    this.params = {
      categories: config.params.categories || ['Politics', 'Crypto'],
      minLiquidity: config.params.minLiquidity || 1000,
      minVolume: config.params.minVolume || 100,
      maxPrice: config.params.maxPrice || 0.85,
      minPrice: config.params.minPrice || 0.15,
      targetSpread: config.params.targetSpread || 0.05,
      positionSize: config.params.positionSize || 50,
      minTimeToClose: config.params.minTimeToClose || 24,
    };
  }

  getId(): string {
    return this.id;
  }

  getName(): string {
    return this.name;
  }

  getVersion(): string {
    return this.version;
  }

  getConfig(): StrategyConfig {
    return this.config;
  }

  async initialize(): Promise<void> {
    console.log(`✓ ${this.name} initialized`);
    console.log(`  Categories: ${this.params.categories.join(', ')}`);
    console.log(`  Min Liquidity: $${this.params.minLiquidity}`);
    console.log(`  Position Size: $${this.params.positionSize}`);
  }

  async cleanup(): Promise<void> {
    console.log(`✓ ${this.name} cleaned up`);
  }

  /**
   * Generate signals based on market analysis
   */
  async generateSignals(): Promise<Signal[]> {
    const signals: Signal[] = [];

    try {
      // Get markets for configured categories
      for (const category of this.params.categories) {
        const markets = await this.broker.getMarkets({
          category,
          active: true,
        });

        for (const market of markets) {
          // Filter by liquidity and volume
          if (market.liquidity < this.params.minLiquidity) continue;
          if (market.volume < this.params.minVolume) continue;

          // Check time to close
          const hoursToClose = this.getHoursUntilClose(market.endDate);
          if (hoursToClose < this.params.minTimeToClose) continue;

          // Analyze market for trading opportunities
          const signal = await this.analyzeMarket(market);
          if (signal) {
            signals.push(signal);
          }
        }
      }

      console.log(`📊 ${this.name}: Generated ${signals.length} signals`);
      return signals;
    } catch (error: any) {
      console.error(`Error generating signals: ${error.message}`);
      return [];
    }
  }

  /**
   * Analyze individual market for trading opportunity
   */
  private async analyzeMarket(market: PolymarketMarket): Promise<Signal | null> {
    const yesPrice = market.outcomePrices[0];
    const noPrice = market.outcomePrices[1];

    // Strategy 1: Look for undervalued YES
    if (yesPrice < this.params.maxPrice && yesPrice > this.params.minPrice) {
      if (market.liquidity > this.params.minLiquidity * 2) {
        return {
          signalId: uuidv4(),
          strategyId: this.id,
          symbol: market.conditionId,
          side: 'buy',
          confidence: this.calculateConfidence(market, 'YES'),
          signalTs: new Date(),
          reason: `Buy YES at ${(yesPrice * 100).toFixed(1)}% - High liquidity market`,
          featuresJson: {
            question: market.question,
            category: market.category,
            yesPrice,
            noPrice,
            liquidity: market.liquidity,
            volume: market.volume,
            outcome: 'YES',
            tokenId: market.conditionId + '-YES',
          },
        };
      }
    }

    // Strategy 2: Look for undervalued NO
    if (noPrice < this.params.maxPrice && noPrice > this.params.minPrice) {
      if (market.liquidity > this.params.minLiquidity * 2) {
        return {
          signalId: uuidv4(),
          strategyId: this.id,
          symbol: market.conditionId,
          side: 'buy',
          confidence: this.calculateConfidence(market, 'NO'),
          signalTs: new Date(),
          reason: `Buy NO at ${(noPrice * 100).toFixed(1)}% - High liquidity market`,
          featuresJson: {
            question: market.question,
            category: market.category,
            yesPrice,
            noPrice,
            liquidity: market.liquidity,
            volume: market.volume,
            outcome: 'NO',
            tokenId: market.conditionId + '-NO',
          },
        };
      }
    }

    // Strategy 3: Look for large spreads (arbitrage opportunity)
    const spread = Math.abs(yesPrice + noPrice - 1);
    if (spread > this.params.targetSpread) {
      const outcomeToTrade = yesPrice < noPrice ? 'YES' : 'NO';
      const price = outcomeToTrade === 'YES' ? yesPrice : noPrice;

      return {
        signalId: uuidv4(),
        strategyId: this.id,
        symbol: market.conditionId,
        side: 'buy',
        confidence: 0.9, // High confidence for arbitrage
        signalTs: new Date(),
        reason: `Spread arbitrage: ${(spread * 100).toFixed(2)}% spread detected`,
        featuresJson: {
          question: market.question,
          category: market.category,
          yesPrice,
          noPrice,
          spread,
          outcome: outcomeToTrade,
          tokenId: market.conditionId + '-' + outcomeToTrade,
        },
      };
    }

    return null;
  }

  /**
   * Calculate confidence score for signal
   */
  private calculateConfidence(market: PolymarketMarket, outcome: 'YES' | 'NO'): number {
    let confidence = 0.5; // Base confidence

    // Higher liquidity = higher confidence
    if (market.liquidity > this.params.minLiquidity * 5) {
      confidence += 0.2;
    } else if (market.liquidity > this.params.minLiquidity * 2) {
      confidence += 0.1;
    }

    // Higher volume = higher confidence
    if (market.volume > this.params.minVolume * 10) {
      confidence += 0.1;
    }

    // More time to close = higher confidence
    const hoursToClose = this.getHoursUntilClose(market.endDate);
    if (hoursToClose > 168) { // > 1 week
      confidence += 0.1;
    }

    // Price in sweet spot = higher confidence
    const price = outcome === 'YES' ? market.outcomePrices[0] : market.outcomePrices[1];
    if (price >= 0.3 && price <= 0.7) {
      confidence += 0.1;
    }

    return Math.min(confidence, 1.0);
  }

  /**
   * Convert signal to order intent
   */
  async signalToIntent(signal: Signal): Promise<any> {
    const features = signal.featuresJson as any;
    const outcome = features.outcome || 'YES';
    const price = outcome === 'YES' ? features.yesPrice : features.noPrice;

    return {
      intentId: uuidv4(),
      signalId: signal.signalId,
      strategyId: this.id,
      symbol: signal.symbol, // conditionId
      side: signal.side,
      qty: Math.floor(this.params.positionSize / price), // Shares to buy
      orderType: 'limit',
      limitPrice: price,
      timeInForce: 'day',
      signalPrice: price,
      broker: 'polymarket',
      metadata: {
        question: features.question,
        category: features.category,
        outcome,
        confidence: signal.confidence,
        tokenId: features.tokenId,
      },
    };
  }

  /**
   * Helper: Get hours until market closes
   */
  private getHoursUntilClose(endDate: Date): number {
    const now = new Date();
    const diff = endDate.getTime() - now.getTime();
    return diff / (1000 * 60 * 60);
  }
}
