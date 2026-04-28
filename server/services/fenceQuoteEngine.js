/**
 * @file fenceQuoteEngine.js
 * @description AI-powered fence quote generation engine.
 *
 * Pricing is DETERMINISTIC — math never comes from AI.
 * AI generates the expert narrative summary only.
 *
 * Pricing model:
 *   Common area: $8.50/LF
 *   Private (homeowner opt-in, 35% participation): $10.00/LF
 *   Assessment fee: $1,500 (credited toward contract)
 *   Program management: $2,500 per community
 */

const PRICING = {
  commonPerLF: 8.50,
  privatePerLF: 10.00,
  assessmentFee: 1500,
  managementFee: 2500,
  privateOptInRate: 0.35,
  avgPrivateLFPerHome: 80,
  avgCommonLFPerHome: 10,
};

/**
 * Calculate pricing from inputs. Never uses AI for numbers.
 */
function calculatePricing(input) {
  let commonLF = input.commonLF || 0;
  let privateLF = input.privateLF || 0;
  let estimationMethod = 'manual';

  // If no LF provided, estimate from home count
  if (!commonLF && input.homesCount) {
    commonLF = input.homesCount * PRICING.avgCommonLFPerHome;
    estimationMethod = 'ai_estimate';
  }

  if (!privateLF && input.homesCount) {
    privateLF = Math.round(input.homesCount * PRICING.privateOptInRate * PRICING.avgPrivateLFPerHome);
    estimationMethod = 'ai_estimate';
  }

  const commonTotal = commonLF * PRICING.commonPerLF;
  const privateTotal = privateLF * PRICING.privatePerLF;
  const totalEstimate = commonTotal + privateTotal + PRICING.assessmentFee + PRICING.managementFee;

  return {
    commonLF,
    privateLF,
    commonTotal: Math.round(commonTotal * 100) / 100,
    privateTotal: Math.round(privateTotal * 100) / 100,
    assessmentFee: PRICING.assessmentFee,
    managementFee: PRICING.managementFee,
    totalEstimate: Math.round(totalEstimate * 100) / 100,
    estimationMethod,
  };
}

/**
 * Generate the expert AI narrative for the quote.
 * Uses ClawOps llmClient or falls back to a template.
 */
async function generateSummary(input, pricing) {
  const systemPrompt = `You are a senior HOA fence maintenance consultant writing a professional estimate summary for a potential client. You sound like an experienced contractor who has walked thousands of fence lines — knowledgeable, direct, and trustworthy. NOT a chatbot.

Rules:
- Write 2-3 paragraphs, under 150 words total
- Mention the community by name
- Reference specific numbers from the pricing (LF counts, totals)
- If the fence condition is poor or the last paint was 5+ years ago, note urgency
- If wood fencing at altitude, mention UV/altitude degradation
- Always mention the 3-year warranty and financing option
- End with a clear next step (free on-site assessment)
- Do NOT use bullet points or headers — flowing prose only
- Do NOT say "I" — use "we" or "our team"`;

  const userMessage = `Generate a professional estimate summary for this HOA fence project:

Community: ${input.communityName}
Location: ${input.city || 'N/A'}, ${input.state || 'N/A'}
Homes: ${input.homesCount || 'Unknown'}
Fence Type: ${input.fenceType || 'Unknown'}
Condition: ${input.fenceCondition || 'Unknown'}
Last Painted: ${input.lastPainted || 'Unknown'}
Common Area LF: ${pricing.commonLF}
Private Fence LF: ${pricing.privateLF}
Common Area Total: $${pricing.commonTotal.toLocaleString()}
Private Total: $${pricing.privateTotal.toLocaleString()}
Assessment Fee: $${pricing.assessmentFee.toLocaleString()} (credited toward contract)
Management Fee: $${pricing.managementFee.toLocaleString()}
Total Estimate: $${pricing.totalEstimate.toLocaleString()}
${pricing.estimationMethod === 'ai_estimate' ? 'Note: Linear feet were estimated from home count — actual LF requires on-site assessment.' : ''}`;

  try {
    const { chat } = require('./llmClient');
    const summary = await chat(systemPrompt, userMessage, {
      temperature: 0.7,
      maxTokens: 300,
    });
    return { summary, confidence: pricing.estimationMethod === 'manual' ? 'high' : 'medium' };
  } catch (err) {
    console.error('[FenceQuoteEngine] LLM error, using template fallback:', err.message);
    return {
      summary: generateFallbackSummary(input, pricing),
      confidence: pricing.estimationMethod === 'manual' ? 'high' : 'medium',
    };
  }
}

/**
 * Fallback template if LLM is unavailable.
 */
function generateFallbackSummary(input, pricing) {
  const community = input.communityName || 'your community';
  const lfNote = pricing.estimationMethod === 'ai_estimate'
    ? `Based on an estimated ${pricing.commonLF} linear feet of common area fencing`
    : `For ${pricing.commonLF} linear feet of common area fencing`;

  return `${lfNote}, ${community} is looking at a total program cost of approximately $${pricing.totalEstimate.toLocaleString()}. This includes professional assessment, paint/stain execution, full homeowner coordination, and a 3-year warranty on all work.

Our turnkey program eliminates the coordination burden for your board — one contract covers everything from the initial walk-through to the final inspection. Financing is available through HOA Project Funding, so there's no need for a special assessment.

We recommend starting with a free on-site assessment to verify linear foot counts and document current fence conditions. This gives your board a professional condition report with photos — yours to keep regardless of whether you move forward.`;
}

/**
 * Build the branded HTML quote email.
 */
function buildQuoteEmail(input, pricing, summary) {
  const disclaimer = pricing.estimationMethod !== 'manual'
    ? '<p style="font-size:12px;color:#888;margin-top:24px;font-style:italic;">This is a ballpark estimate based on the information provided. Linear foot counts were estimated and final pricing requires an on-site assessment.</p>'
    : '<p style="font-size:12px;color:#888;margin-top:24px;font-style:italic;">This estimate is based on the linear foot counts you provided. Final pricing will be confirmed after an on-site assessment.</p>';

  return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:'DM Sans',Arial,sans-serif;color:#1a1a2e;background:#faf8f5;margin:0;padding:0">
<div style="max-width:600px;margin:0 auto;background:#fff">

  <!-- Header -->
  <div style="background:linear-gradient(135deg,#0f1f3d,#162d52);padding:32px 40px;text-align:center">
    <h1 style="color:#fff;font-family:Georgia,serif;font-size:24px;margin:0 0 8px">Terrapin Station Community Services</h1>
    <p style="color:rgba(255,255,255,0.6);font-size:13px;margin:0">Turnkey HOA Fence Maintenance</p>
  </div>

  <!-- Body -->
  <div style="padding:32px 40px">
    <h2 style="font-family:Georgia,serif;color:#0f1f3d;font-size:20px;margin:0 0 4px">
      Estimated Scope for ${input.communityName}
    </h2>
    <p style="color:#5a6677;font-size:13px;margin:0 0 24px">
      ${input.city || ''}${input.city && input.state ? ', ' : ''}${input.state || ''} &bull; ${input.homesCount || '—'} homes
    </p>

    <!-- AI Summary -->
    <div style="font-size:15px;line-height:1.7;color:#333;margin-bottom:28px">
      ${summary.split('\n').map(p => `<p style="margin:0 0 12px">${p}</p>`).join('')}
    </div>

    <!-- Pricing Table -->
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
      <tr style="background:#0f1f3d;color:#fff">
        <td style="padding:10px 16px;font-weight:bold;font-size:13px">Item</td>
        <td style="padding:10px 16px;font-weight:bold;font-size:13px;text-align:right">Amount</td>
      </tr>
      <tr style="border-bottom:1px solid #e8ebe6">
        <td style="padding:10px 16px;font-size:14px">Common Area Painting (${pricing.commonLF.toLocaleString()} LF × $${PRICING.commonPerLF}/LF)</td>
        <td style="padding:10px 16px;font-size:14px;text-align:right;color:#0d8a72;font-weight:bold">$${pricing.commonTotal.toLocaleString()}</td>
      </tr>
      ${pricing.privateLF > 0 ? `<tr style="border-bottom:1px solid #e8ebe6">
        <td style="padding:10px 16px;font-size:14px">Private Fence Opt-In (${pricing.privateLF.toLocaleString()} LF × $${PRICING.privatePerLF}/LF)</td>
        <td style="padding:10px 16px;font-size:14px;text-align:right;color:#0d8a72;font-weight:bold">$${pricing.privateTotal.toLocaleString()}</td>
      </tr>` : ''}
      <tr style="border-bottom:1px solid #e8ebe6">
        <td style="padding:10px 16px;font-size:14px">Community Assessment & Inspection</td>
        <td style="padding:10px 16px;font-size:14px;text-align:right;color:#0d8a72;font-weight:bold">$${pricing.assessmentFee.toLocaleString()}</td>
      </tr>
      <tr style="border-bottom:1px solid #e8ebe6">
        <td style="padding:10px 16px;font-size:14px">Program Management Fee</td>
        <td style="padding:10px 16px;font-size:14px;text-align:right;color:#0d8a72;font-weight:bold">$${pricing.managementFee.toLocaleString()}</td>
      </tr>
      <tr style="background:#f4f0eb">
        <td style="padding:12px 16px;font-size:16px;font-weight:bold;color:#0f1f3d">Total Estimated Program Cost</td>
        <td style="padding:12px 16px;font-size:18px;font-weight:bold;text-align:right;color:#0d8a72;font-family:Georgia,serif">$${pricing.totalEstimate.toLocaleString()}</td>
      </tr>
    </table>

    <!-- Financing -->
    <div style="background:rgba(13,138,114,0.06);border-left:3px solid #0d8a72;padding:12px 16px;border-radius:0 8px 8px 0;margin-bottom:24px">
      <p style="margin:0;font-size:14px;color:#5a6677">
        <strong style="color:#0f1f3d">Financing available</strong> — through HOA Project Funding, your board can spread the cost with no special assessment.
      </p>
    </div>

    <!-- CTA -->
    <div style="text-align:center;margin:32px 0">
      <a href="https://terrapinstationfences.com/contact" style="display:inline-block;padding:14px 32px;background:#0d8a72;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold;font-size:15px">
        Schedule Your Free On-Site Assessment →
      </a>
    </div>

    ${disclaimer}
  </div>

  <!-- Footer -->
  <div style="background:#0f1f3d;padding:20px 40px;text-align:center">
    <p style="color:rgba(255,255,255,0.5);font-size:12px;margin:0">
      Terrapin Station Community Services &bull; Powered by HOA Project Funding
    </p>
  </div>

</div>
</body>
</html>`;
}

/**
 * Build plain text version of the quote.
 */
function buildQuoteText(input, pricing, summary) {
  return `TERRAPIN STATION FENCES — Estimated Scope for ${input.communityName}
${input.city || ''}${input.city && input.state ? ', ' : ''}${input.state || ''} | ${input.homesCount || '—'} homes

${summary}

PRICING BREAKDOWN
─────────────────────────────────
Common Area Painting (${pricing.commonLF.toLocaleString()} LF × $${PRICING.commonPerLF}/LF): $${pricing.commonTotal.toLocaleString()}
${pricing.privateLF > 0 ? `Private Fence Opt-In (${pricing.privateLF.toLocaleString()} LF × $${PRICING.privatePerLF}/LF): $${pricing.privateTotal.toLocaleString()}\n` : ''}Community Assessment: $${pricing.assessmentFee.toLocaleString()}
Program Management: $${pricing.managementFee.toLocaleString()}
─────────────────────────────────
TOTAL ESTIMATE: $${pricing.totalEstimate.toLocaleString()}

Financing available through HOA Project Funding — no special assessment required.

Ready for an exact quote? Schedule your free on-site assessment:
https://terrapinstationfences.com/contact

This is a ballpark estimate. Final pricing requires an on-site assessment.`;
}

/**
 * Full quote generation pipeline.
 */
async function generateQuote(input) {
  const pricing = calculatePricing({
    commonLF: input.commonLF ? parseInt(input.commonLF) : 0,
    privateLF: input.privateLF ? parseInt(input.privateLF) : 0,
    homesCount: input.homesCount ? parseInt(input.homesCount) : 0,
  });

  const { summary, confidence } = await generateSummary(input, pricing);

  const quoteHtml = buildQuoteEmail(input, pricing, summary);
  const quoteText = buildQuoteText(input, pricing, summary);

  return {
    pricing,
    summary,
    confidence,
    quoteHtml,
    quoteText,
  };
}

module.exports = {
  calculatePricing,
  generateSummary,
  generateQuote,
  buildQuoteEmail,
  buildQuoteText,
  PRICING,
};
