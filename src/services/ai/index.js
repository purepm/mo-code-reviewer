const config = require('../../config');
const { AIProviderError } = require('../../lib/errors');
const AnthropicService = require('./anthropic');
const OpenAIService = require('./openai');
const OpenRouterService = require('./openRouter');

/**
 * AI service factory
 */
class AIServiceFactory {
  static create() {
    const provider = config.getAIProvider();
    
    switch (provider) {
      case 'anthropic':
        return new AnthropicService();
      case 'openai':
        return new OpenAIService();
      case 'openrouter':
        return new OpenRouterService();
      default:
        throw new AIProviderError(`Unsupported AI provider: ${provider}`, provider);
    }
  }
}

// Create singleton instance
let aiServiceInstance = null;

/**
 * Get AI service singleton
 */
function getAIService() {
  if (!aiServiceInstance) {
    aiServiceInstance = AIServiceFactory.create();
  }
  return aiServiceInstance;
}

/**
 * Initialize AI service
 */
async function initializeAI() {
  const service = getAIService();
  await service.initialize();
  return service;
}

module.exports = {
  AIServiceFactory,
  getAIService,
  initializeAI
};
