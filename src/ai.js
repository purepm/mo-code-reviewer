const Anthropic = require('@anthropic-ai/sdk');
const core = require('@actions/core');
const { ChatGPTAPI } = require('chatgpt');

class AIReviewer {
  constructor() {
    this.client = null;
    this.provider = null;
  }

  initialize(provider = 'anthropic') {
    this.provider = provider;
    switch (provider) {
      case 'anthropic':
        const anthropicApiKey = core.getInput('anthropic-api-key', { required: true });
        this.client = new Anthropic({ apiKey: anthropicApiKey });
        break;
      case 'openai':
        const openaiApiKey = core.getInput('openai-api-key', { required: true });
        this.client = new ChatGPTAPI({ apiKey: openaiApiKey });
        break;
      default:
        throw new Error(`Unsupported AI provider: ${provider}`);
    }
  }

  async getReview(prompt) {
    if (!this.client) {
      throw new Error('AI client not initialized. Call initialize() first.');
    }

    try {
      switch (this.provider) {
        case 'anthropic':
          return await this.getAnthropicReview(prompt);
        case 'openai':
          return await this.getOpenAIReview(prompt);
        default:
          throw new Error(`Unsupported AI provider: ${this.provider}`);
      }
    } catch (error) {
      console.error('Error getting AI review:', error);
      throw error;
    }
  }

  async getAnthropicReview(prompt) {
   const message = await this.client.messages.create({
     model: "claude-3-5-sonnet-20240620",
     max_tokens: 1024,
     system: "You are an expert code reviewer and software engineer. Your task is to analyze code snippets provided by users and offer detailed, constructive feedback.",
     messages: [{ role: "user", content: prompt }],
   });

    return JSON.parse(message.content[0].text);
  }

  async getOpenAIReview(prompt) {
    const completion = await this.client.chat.completions.create({
      model: "gpt-4",
      messages: [{ role: "user", content: prompt }],
    });
  
    return JSON.parse(completion.choices[0].message.content);
  }
}

module.exports = new AIReviewer();