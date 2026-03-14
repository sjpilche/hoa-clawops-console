/**
 * @file chatService.js
 * @description Direct ChatGPT API integration for fast conversational responses.
 *
 * This service provides quick AI responses WITHOUT browser automation.
 * Use this for simple questions, conversation, help, etc.
 * Use OpenClaw agents for tasks that need browser interaction.
 */

const { chatMessages } = require('./llmClient');

const SYSTEM_PROMPT = 'You are a helpful assistant for ClawOps Console, a browser automation platform. Answer questions concisely and helpfully.';

/**
 * Call OpenAI ChatGPT API directly for fast responses.
 * @param {string} message - User's message
 * @param {Array} conversationHistory - Previous messages for context
 * @returns {Promise<string>} - AI response
 */
async function getChatResponse(message, conversationHistory = []) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...conversationHistory.slice(-10),
    { role: 'user', content: message },
  ];

  return chatMessages(messages, {
    model: 'gpt-4o-mini',
    provider: 'openai',
    temperature: 0.7,
    maxTokens: 500,
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
