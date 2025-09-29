const OpenAI = require('openai');
const config = require('../../config');
const BaseAIService = require('./base');

/**
 * OpenAI service implementation
 */
class OpenAIService extends BaseAIService {
  constructor() {
    super('openai');
  }

  async initialize() {
    try {
      this.logger.info(`Initializing OpenAI service`);
      const apiKey = config.getAIApiKey('openai');
      this.client = new OpenAI({ apiKey });
      this.logger.info(`OpenAI service initialized successfully`);
    } catch (error) {
      this.logger.error(`Failed to initialize OpenAI service`, { error: error.message });
      throw error;
    }
  }

  async callAI(prompt) {
    const completion = await this.client.chat.completions.create({
      model: "gpt-4",
      stream: false,
      messages: [
        { 
          role: "system", 
          content: "You are an expert code reviewer. Always respond with valid JSON that can be parsed." 
        },
        { role: "user", content: prompt }
      ],
    });
  
    const responseText = completion.choices[0].message.content;
    return this.parseAIResponse(responseText);
  }
}

module.exports = OpenAIService;
