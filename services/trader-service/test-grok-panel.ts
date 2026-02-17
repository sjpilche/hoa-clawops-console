#!/usr/bin/env tsx
/**
 * Test script for Grok AI Analyst Panel
 * Run: npx tsx apps/trader-service/test-grok-panel.ts
 */

import dotenv from 'dotenv';
import path from 'path';

// Load environment
dotenv.config({ path: path.join(__dirname, '../../.env.trader') });

import { LLMClient } from './src/engine/ai-panel/llm-client';
import { GROK_MARKET_ANALYST } from './src/engine/ai-panel/grok-config';

async function testGrokPanel() {
  console.log('🦞 Testing Grok AI Analyst Panel\n');

  // Check API key
  if (!process.env.GROK_API_KEY) {
    console.error('❌ GROK_API_KEY not found in environment');
    process.exit(1);
  }

  console.log('✅ Grok API key found');
  console.log(`📊 Model: ${GROK_MARKET_ANALYST.model}`);
  console.log(`🎯 Focus: ${GROK_MARKET_ANALYST.focusArea}\n`);

  // Create LLM client
  const client = new LLMClient();

  // Build test market context
  const portfolioContext = `
CURRENT HOLDINGS:
- None (starting fresh)

ACCOUNT VALUE: $500
CASH AVAILABLE: $500
`;

  const marketContext = `
DATE: ${new Date().toLocaleDateString()}
TIME: ${new Date().toLocaleTimeString()} ET

MARKET OVERVIEW:
- SPY: Recent close around $680
- Tech sector showing volatility
- Retail traders active on X/Twitter

TRENDING TICKERS ON X:
- Check for unusual volume/sentiment
`;

  const universe = `
FOCUS ON LIQUID NAMES:
AAPL, MSFT, GOOGL, AMZN, TSLA, NVDA, META, SPY, QQQ
Or scan for ANY compelling opportunities
`;

  const userPrompt = GROK_MARKET_ANALYST.userPromptTemplate
    .replace('{portfolio}', portfolioContext)
    .replace('{market_data}', marketContext)
    .replace('{universe}', universe);

  console.log('📡 Calling Grok API...\n');

  const startTime = Date.now();

  try {
    const response = await client.call({
      provider: 'grok',
      model: GROK_MARKET_ANALYST.model,
      systemPrompt: GROK_MARKET_ANALYST.systemPrompt,
      userPrompt,
      temperature: GROK_MARKET_ANALYST.temperature,
      maxTokens: 4096,
    });

    const latency = Date.now() - startTime;

    console.log('✅ Response received!\n');
    console.log('📊 Stats:');
    console.log(`   Latency: ${latency}ms`);
    console.log(`   Prompt tokens: ${response.promptTokens}`);
    console.log(`   Completion tokens: ${response.completionTokens}`);

    const cost = client.estimateCost('grok', GROK_MARKET_ANALYST.model, response.promptTokens, response.completionTokens);
    console.log(`   Estimated cost: $${cost.toFixed(4)}\n`);

    console.log('📝 Raw Response:');
    console.log('─'.repeat(80));
    console.log(response.content);
    console.log('─'.repeat(80));

    // Try to parse JSON
    try {
      const parsed = JSON.parse(response.content);
      console.log('\n✅ Valid JSON response!\n');
      console.log(`📈 Market Commentary: ${parsed.marketCommentary}`);
      console.log(`🎯 Picks: ${parsed.picks?.length || 0}`);

      if (parsed.picks && parsed.picks.length > 0) {
        console.log('\n📋 Analyst Recommendations:\n');
        parsed.picks.forEach((pick: any, i: number) => {
          console.log(`${i + 1}. ${pick.side.toUpperCase()} ${pick.symbol}`);
          console.log(`   Conviction: ${pick.conviction}/5`);
          console.log(`   Type: ${pick.opportunityType}`);
          console.log(`   Thesis: ${pick.thesis}`);
          console.log(`   Risks: ${pick.risks}`);
          console.log('');
        });
      }

      console.log('🎉 Test PASSED - Grok panel is working!');
    } catch (parseError) {
      console.error('\n❌ JSON parse error:', parseError);
      console.error('Response was not valid JSON. Check the format.');
      process.exit(1);
    }

  } catch (error: any) {
    console.error('\n❌ API call failed:', error.message);
    if (error.message.includes('401') || error.message.includes('403')) {
      console.error('\n💡 Check that your GROK_API_KEY is valid');
    }
    process.exit(1);
  }
}

testGrokPanel().catch(console.error);
