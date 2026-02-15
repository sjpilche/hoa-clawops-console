/**
 * @file chatService.js
 * @description Direct ChatGPT API integration for fast conversational responses.
 *
 * This service provides quick AI responses WITHOUT browser automation.
 * Use this for simple questions, conversation, help, etc.
 * Use OpenClaw agents for tasks that need browser interaction.
 */

const https = require('https');

/**
 * Call OpenAI ChatGPT API directly for fast responses.
 * @param {string} message - User's message
 * @param {Array} conversationHistory - Previous messages for context
 * @returns {Promise<string>} - AI response
 */
async function getChatResponse(message, conversationHistory = []) {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return reject(new Error('OPENAI_API_KEY not configured'));
    }

    const messages = [
      {
        role: 'system',
        content: 'You are a helpful assistant for ClawOps Console, a browser automation platform. Answer questions concisely and helpfully.',
      },
      ...conversationHistory.slice(-10), // Last 10 messages for context
      { role: 'user', content: message },
    ];

    const requestBody = JSON.stringify({
      model: 'gpt-4o-mini',
      messages,
      temperature: 0.7,
      max_tokens: 500,
    });

    const options = {
      hostname: 'api.openai.com',
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(requestBody),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const response = JSON.parse(data);

          if (response.error) {
            return reject(new Error(response.error.message));
          }

          const reply = response.choices[0]?.message?.content || 'No response';
          resolve(reply);
        } catch (error) {
          reject(new Error(`Failed to parse OpenAI response: ${error.message}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(new Error(`OpenAI API request failed: ${error.message}`));
    });

    req.write(requestBody);
    req.end();
  });
}

/**
 * Analyze a message to determine if it needs browser automation.
 * Returns recommendation: 'chat' or 'agent'
 *
 * @param {string} message - User's message
 * @returns {Promise<Object>} - { needsAgent: boolean, reason: string }
 */
async function analyzeMessageIntent(message) {
  const lowerMessage = message.toLowerCase();

  // Keywords that suggest browser automation is needed
  const agentKeywords = [
    'extract', 'scrape', 'download', 'submit', 'fill', 'navigate',
    'click', 'login', 'upload', 'export', 'import', 'automate',
    'sage', 'quickbooks', 'procore', 'website', 'browser', 'form',
    'invoice', 'data', 'report', 'portal', 'dashboard'
  ];

  // Keywords that suggest simple chat is sufficient
  const chatKeywords = [
    'what is', 'how do i', 'can you explain', 'tell me about',
    'why', 'when', 'where', 'who', 'define', 'help', '?'
  ];

  const hasAgentKeyword = agentKeywords.some(kw => lowerMessage.includes(kw));
  const hasChatKeyword = chatKeywords.some(kw => lowerMessage.includes(kw));

  if (hasAgentKeyword && !hasChatKeyword) {
    return {
      needsAgent: true,
      recommendedMode: 'agent',
      reason: 'This looks like a browser automation task. Agent Mode will use OpenClaw to interact with websites.',
      confidence: 'high',
    };
  }

  if (hasChatKeyword && !hasAgentKeyword) {
    return {
      needsAgent: false,
      recommendedMode: 'chat',
      reason: 'This is a simple question. Chat Mode will give you faster responses.',
      confidence: 'high',
    };
  }

  // Ambiguous - return current mode preference
  return {
    needsAgent: null,
    recommendedMode: null,
    reason: 'Could work in either mode',
    confidence: 'low',
  };
}

module.exports = {
  getChatResponse,
  analyzeMessageIntent,
};
