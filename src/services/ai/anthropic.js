const Anthropic = require('@anthropic-ai/sdk');
const config = require('../../config');
const BaseAIService = require('./base');

/**
 * Anthropic AI service implementation
 */
class AnthropicService extends BaseAIService {
  constructor() {
    super('anthropic');
  }

  async initialize() {
    try {
      this.logger.info(`Initializing Anthropic AI service`);
      const apiKey = config.getAIApiKey('anthropic');
      this.client = new Anthropic({ apiKey });
      this.logger.info(`Anthropic AI service initialized successfully`);
    } catch (error) {
      this.logger.error(`Failed to initialize Anthropic AI service`, { error: error.message });
      throw error;
    }
  }

  async callAI(prompt) {
    const message = await this.client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      system: "You are an expert code reviewer and software engineer. Your task is to analyze code snippets provided by users and offer detailed, constructive feedback. Always respond with valid JSON that can be parsed.",
      messages: [{ role: "user", content: prompt }],
    });

    const responseText = message.content[0].text;
    return this.parseAIResponse(responseText);
  }
}

module.exports = AnthropicService;
