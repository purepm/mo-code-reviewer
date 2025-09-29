const OpenAI = require('openai');
const config = require('../../config');
const BaseAIService = require('./base');

/**
 * OpenRouter AI service implementation
 * Uses OpenRouter API which provides access to multiple AI models through OpenAI-compatible interface
 */
class OpenRouterService extends BaseAIService {
  constructor() {
    super('openrouter');
  }

  async initialize() {
    try {
      this.logger.info(`Initializing OpenRouter AI service`);
      const apiKey = config.getAIApiKey('openrouter');
      
      // Initialize OpenAI client with OpenRouter base URL
      this.client = new OpenAI({
        apiKey,
        baseURL: 'https://openrouter.ai/api/v1'
      });
      
      this.logger.info(`OpenRouter AI service initialized successfully`);
    } catch (error) {
      this.logger.error(`Failed to initialize OpenRouter AI service`, { error: error.message });
      throw error;
    }
  }

  async callAI(prompt) {
    const completion = await this.client.chat.completions.create({
      model: config.getOpenRouterAIModel(), // Using GPT OSS 120B through OpenRouter
      stream: false, // Explicitly disable streaming to get a single response
      extra_headers: {
        "HTTP-Referer": "https://github.com/mo-code-reviewer", // Site URL for OpenRouter rankings
        "X-Title": "MO Code Reviewer", // Site title for OpenRouter rankings
      },
      messages: [
        { 
          role: "system", 
          content: "You are an expert code reviewer and software engineer. Your task is to analyze code snippets provided by users and provide constructive feedback. Always respond with valid JSON that can be parsed." 
        },
        { role: "user", content: prompt }
      ],
    });

    const responseText = completion.choices[0].message.content;
    return this.parseAIResponse(responseText);
  }
}

module.exports = OpenRouterService;
