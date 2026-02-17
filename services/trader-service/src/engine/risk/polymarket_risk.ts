/**
 * Polymarket-Specific Risk Checks
 * Additional risk controls for prediction market trading
 */

import { Pool } from 'pg';
import { PolymarketAdapter } from '../execution/broker/polymarket';
import {
  PolymarketMarket,
  PolymarketOrder,
  PolymarketPosition,
} from '../execution/broker/polymarket-types';

export interface PolymarketRiskCheckResult {
  passed: boolean;
  failReason?: string;
  warnings?: string[];
}

export class PolymarketRiskEngine {
  private pool: Pool;
  private broker: PolymarketAdapter;

  constructor(pool: Pool, broker: PolymarketAdapter) {
    this.pool = pool;
    this.broker = broker;
  }

  /**
   * Comprehensive Polymarket risk checks
   */
  async checkOrder(order: PolymarketOrder): Promise<PolymarketRiskCheckResult> {
    const warnings: string[] = [];

    // 1. Market Liquidity Check
    const liquidityCheck = await this.checkLiquidity(order);
    if (!liquidityCheck.passed) {
      return liquidityCheck;
    }
    if (liquidityCheck.warnings) {
      warnings.push(...liquidityCheck.warnings);
    }

    // 2. Market Time to Close Check
    const timeCheck = await this.checkMarketTimeRemaining(order);
    if (!timeCheck.passed) {
      return timeCheck;
    }
    if (timeCheck.warnings) {
      warnings.push(...timeCheck.warnings);
    }

    // 3. Price Reasonableness Check
    const priceCheck = await this.checkPriceReasonableness(order);
    if (!priceCheck.passed) {
      return priceCheck;
    }
    if (priceCheck.warnings) {
      warnings.push(...priceCheck.warnings);
    }

    // 4. Concentration Risk Check
    const concentrationCheck = await this.checkConcentrationRisk(order);
    if (!concentrationCheck.passed) {
      return concentrationCheck;
    }
    if (concentrationCheck.warnings) {
      warnings.push(...concentrationCheck.warnings);
    }

    // 5. Volume Check (prevent wash trading)
    const volumeCheck = await this.checkHistoricalVolume(order);
    if (!volumeCheck.passed) {
      return volumeCheck;
    }
    if (volumeCheck.warnings) {
      warnings.push(...volumeCheck.warnings);
    }

    // 6. Binary Outcome Validation
    const outcomeCheck = this.checkBinaryOutcome(order);
    if (!outcomeCheck.passed) {
      return outcomeCheck;
    }

    // 7. Maximum Exposure Check
    const exposureCheck = await this.checkMaximumExposure(order);
    if (!exposureCheck.passed) {
      return exposureCheck;
    }
    if (exposureCheck.warnings) {
      warnings.push(...exposureCheck.warnings);
    }

    return {
      passed: true,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  /**
   * Check 1: Market Liquidity
   * Ensure market has sufficient liquidity for order
   */
  private async checkLiquidity(
    order: PolymarketOrder
  ): Promise<PolymarketRiskCheckResult> {
    try {
      const market = await this.broker.getMarket(order.conditionId);
      const warnings: string[] = [];

      // Check minimum liquidity threshold ($1000)
      if (market.liquidity < 1000) {
        return {
          passed: false,
          failReason: `Market liquidity too low: $${market.liquidity.toFixed(2)} (min: $1000)`,
        };
      }

      // Warn if liquidity is low relative to order size
      const orderValue = order.size * order.price;
      if (orderValue > market.liquidity * 0.1) {
        warnings.push(
          `Order value ($${orderValue.toFixed(2)}) is >10% of market liquidity ($${market.liquidity.toFixed(2)})`
        );
      }

      return { passed: true, warnings };
    } catch (error: any) {
      return {
        passed: false,
        failReason: `Failed to check liquidity: ${error.message}`,
      };
    }
  }

  /**
   * Check 2: Market Time Remaining
   * Don't trade on markets too close to expiration
   */
  private async checkMarketTimeRemaining(
    order: PolymarketOrder
  ): Promise<PolymarketRiskCheckResult> {
    try {
      const market = await this.broker.getMarket(order.conditionId);
      const now = new Date();
      const timeRemaining = market.endDate.getTime() - now.getTime();
      const hoursRemaining = timeRemaining / (1000 * 60 * 60);

      const warnings: string[] = [];

      // Fail if market closes in < 1 hour
      if (hoursRemaining < 1) {
        return {
          passed: false,
          failReason: `Market closes too soon: ${hoursRemaining.toFixed(1)} hours remaining (min: 1 hour)`,
        };
      }

      // Warn if < 24 hours remaining
      if (hoursRemaining < 24) {
        warnings.push(
          `Market closes soon: ${hoursRemaining.toFixed(1)} hours remaining`
        );
      }

      return { passed: true, warnings };
    } catch (error: any) {
      return {
        passed: false,
        failReason: `Failed to check market time: ${error.message}`,
      };
    }
  }

  /**
   * Check 3: Price Reasonableness
   * Prevent trading at extreme prices that indicate potential manipulation
   */
  private async checkPriceReasonableness(
    order: PolymarketOrder
  ): Promise<PolymarketRiskCheckResult> {
    try {
      const orderBook = await this.broker.getOrderBook(order.tokenId);
      const currentPrice = orderBook.midPrice;
      const warnings: string[] = [];

      // For YES outcomes
      if (order.outcome === 'YES') {
        // Fail if buying YES at > 95% (overpriced)
        if (order.side === 'BUY' && order.price > 0.95) {
          return {
            passed: false,
            failReason: `Buy price too high: ${(order.price * 100).toFixed(1)}% (max: 95%)`,
          };
        }

        // Fail if selling YES at < 5% (underpriced)
        if (order.side === 'SELL' && order.price < 0.05) {
          return {
            passed: false,
            failReason: `Sell price too low: ${(order.price * 100).toFixed(1)}% (min: 5%)`,
          };
        }

        // Warn if price deviates >10% from current price
        const deviation = Math.abs(order.price - currentPrice) / currentPrice;
        if (deviation > 0.10) {
          warnings.push(
            `Price ${(order.price * 100).toFixed(1)}% deviates ${(deviation * 100).toFixed(1)}% from market ${(currentPrice * 100).toFixed(1)}%`
          );
        }
      }

      // For NO outcomes (inverse pricing)
      if (order.outcome === 'NO') {
        const noPrice = 1 - order.price;

        if (order.side === 'BUY' && noPrice > 0.95) {
          return {
            passed: false,
            failReason: `Buy price too high (NO): ${(noPrice * 100).toFixed(1)}% (max: 95%)`,
          };
        }

        if (order.side === 'SELL' && noPrice < 0.05) {
          return {
            passed: false,
            failReason: `Sell price too low (NO): ${(noPrice * 100).toFixed(1)}% (min: 5%)`,
          };
        }
      }

      return { passed: true, warnings };
    } catch (error: any) {
      return {
        passed: false,
        failReason: `Failed to check price reasonableness: ${error.message}`,
      };
    }
  }

  /**
   * Check 4: Concentration Risk
   * Prevent over-concentration in single market
   */
  private async checkConcentrationRisk(
    order: PolymarketOrder
  ): Promise<PolymarketRiskCheckResult> {
    try {
      const positions = await this.broker.getPositions();
      const account = await this.broker.getAccount();

      const warnings: string[] = [];

      // Calculate exposure in this market
      const existingPosition = positions.find(
        p => p.conditionId === order.conditionId && p.outcome === order.outcome
      );

      const currentExposure = existingPosition ? existingPosition.marketValue : 0;
      const orderValue = order.size * order.price;
      const newTotalExposure = currentExposure + orderValue;

      // Fail if single market would be >25% of portfolio
      const portfolioValue = account.portfolioValue;
      const concentration = newTotalExposure / portfolioValue;

      if (concentration > 0.25) {
        return {
          passed: false,
          failReason: `Market concentration too high: ${(concentration * 100).toFixed(1)}% (max: 25%)`,
        };
      }

      // Warn if >15%
      if (concentration > 0.15) {
        warnings.push(
          `Market concentration: ${(concentration * 100).toFixed(1)}% of portfolio`
        );
      }

      return { passed: true, warnings };
    } catch (error: any) {
      return {
        passed: false,
        failReason: `Failed to check concentration: ${error.message}`,
      };
    }
  }

  /**
   * Check 5: Historical Volume
   * Ensure market has real trading activity
   */
  private async checkHistoricalVolume(
    order: PolymarketOrder
  ): Promise<PolymarketRiskCheckResult> {
    try {
      const market = await this.broker.getMarket(order.conditionId);
      const warnings: string[] = [];

      // Fail if market has < $100 volume
      if (market.volume < 100) {
        return {
          passed: false,
          failReason: `Market volume too low: $${market.volume.toFixed(2)} (min: $100)`,
        };
      }

      // Warn if order is >20% of total market volume
      const orderValue = order.size * order.price;
      if (orderValue > market.volume * 0.20) {
        warnings.push(
          `Order value ($${orderValue.toFixed(2)}) is >20% of total market volume ($${market.volume.toFixed(2)})`
        );
      }

      return { passed: true, warnings };
    } catch (error: any) {
      return {
        passed: false,
        failReason: `Failed to check volume: ${error.message}`,
      };
    }
  }

  /**
   * Check 6: Binary Outcome Validation
   * Ensure trading valid binary outcomes
   */
  private checkBinaryOutcome(
    order: PolymarketOrder
  ): PolymarketRiskCheckResult {
    if (order.outcome !== 'YES' && order.outcome !== 'NO') {
      return {
        passed: false,
        failReason: `Invalid outcome: ${order.outcome}. Must be YES or NO`,
      };
    }

    return { passed: true };
  }

  /**
   * Check 7: Maximum Exposure
   * Total account exposure limits
   */
  private async checkMaximumExposure(
    order: PolymarketOrder
  ): Promise<PolymarketRiskCheckResult> {
    try {
      const account = await this.broker.getAccount();
      const positions = await this.broker.getPositions();

      const warnings: string[] = [];

      // Calculate total position value
      const totalPositionValue = positions.reduce(
        (sum, p) => sum + p.marketValue,
        0
      );

      // Calculate new total if order executes
      const orderValue = order.size * order.price;
      const newTotalExposure = totalPositionValue + orderValue;

      // Get risk limits from database
      const limitsResult = await this.pool.query(
        `SELECT value FROM trd_risk_limit WHERE limit_type = 'max_polymarket_exposure_usd'`
      );

      const maxExposure = limitsResult.rows.length > 0
        ? parseFloat(limitsResult.rows[0].value)
        : 5000;  // Default $5000 max

      if (newTotalExposure > maxExposure) {
        return {
          passed: false,
          failReason: `Total Polymarket exposure would exceed limit: $${newTotalExposure.toFixed(2)} > $${maxExposure.toFixed(2)}`,
        };
      }

      // Warn if approaching limit (>80%)
      if (newTotalExposure > maxExposure * 0.80) {
        warnings.push(
          `Approaching exposure limit: $${newTotalExposure.toFixed(2)} / $${maxExposure.toFixed(2)} (${((newTotalExposure / maxExposure) * 100).toFixed(1)}%)`
        );
      }

      return { passed: true, warnings };
    } catch (error: any) {
      return {
        passed: false,
        failReason: `Failed to check maximum exposure: ${error.message}`,
      };
    }
  }

  /**
   * Additional Check: Category Limits
   * Prevent over-exposure to single category
   */
  async checkCategoryExposure(
    order: PolymarketOrder
  ): Promise<PolymarketRiskCheckResult> {
    try {
      const market = await this.broker.getMarket(order.conditionId);
      const positions = await this.broker.getPositions();
      const warnings: string[] = [];

      // Get all markets for positions
      const categoryExposure: Record<string, number> = {};

      for (const position of positions) {
        try {
          const positionMarket = await this.broker.getMarket(position.conditionId);
          const category = positionMarket.category;

          if (!categoryExposure[category]) {
            categoryExposure[category] = 0;
          }

          categoryExposure[category] += position.marketValue;
        } catch (error) {
          // Skip if market data unavailable
          continue;
        }
      }

      // Add new order exposure
      const orderValue = order.size * order.price;
      const orderCategory = market.category;

      const newCategoryExposure = (categoryExposure[orderCategory] || 0) + orderValue;

      // Calculate total portfolio value
      const totalValue = Object.values(categoryExposure).reduce((a, b) => a + b, 0) + orderValue;

      // Fail if single category >40% of portfolio
      const concentration = newCategoryExposure / totalValue;

      if (concentration > 0.40) {
        return {
          passed: false,
          failReason: `Category '${orderCategory}' concentration too high: ${(concentration * 100).toFixed(1)}% (max: 40%)`,
        };
      }

      // Warn if >25%
      if (concentration > 0.25) {
        warnings.push(
          `Category '${orderCategory}' concentration: ${(concentration * 100).toFixed(1)}%`
        );
      }

      return { passed: true, warnings };
    } catch (error: any) {
      // Don't fail on category check errors
      return { passed: true };
    }
  }
}
