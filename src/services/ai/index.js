const config = require('../../config');
const { AIProviderError } = require('../../lib/errors');
const AnthropicService = require('./anthropic');
const OpenAIService = require('./openai');

/**
 * AI service factory
 */
class AIServiceFactory {
  static create(provider = null) {
    const actualProvider = provider || config.getAIProvider();
    
    switch (actualProvider) {
      case 'anthropic':
        return new AnthropicService();
      case 'openai':
        return new OpenAIService();
      default:
        throw new AIProviderError(`Unsupported AI provider: ${actualProvider}`, actualProvider);
    }
  }
}

// Create singleton instance
let aiServiceInstance = null;

/**
 * Get AI service singleton
 */
function getAIService(provider = null) {
  if (!aiServiceInstance) {
    aiServiceInstance = AIServiceFactory.create(provider);
  }
  return aiServiceInstance;
}

/**
 * Initialize AI service
 */
async function initializeAI(provider = null) {
  const service = getAIService(provider);
  await service.initialize();
  return service;
}

module.exports = {
  AIServiceFactory,
  getAIService,
  initializeAI
};
