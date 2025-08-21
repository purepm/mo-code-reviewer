const config = require('../../config');
const { Logger } = require('../../lib/logger');
const { AIProviderError } = require('../../lib/errors');
const { AIReviewResponse } = require('../../models');

/**
 * Base AI service class
 */
class BaseAIService {
  constructor(provider) {
    this.provider = provider;
    this.client = null;
    this.logger = Logger.createOperationLogger(`AIService.${provider}`);
  }

  /**
   * Initialize the AI service
   */
  async initialize() {
    throw new Error('initialize() must be implemented by subclass');
  }

  /**
   * Get review from AI service
   */
  async getReview(prompt, retries = null) {
    const maxRetries = retries || config.LIMITS.MAX_RETRIES;
    
    if (!this.client) {
      throw new AIProviderError('AI client not initialized. Call initialize() first.', this.provider);
    }

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        this.logger.debug(`Attempting AI review`, { attempt, maxRetries });
        
        const rawResponse = await this.callAI(prompt);
        
        // Validate and wrap response in model
        const reviewResponse = new AIReviewResponse(rawResponse);
        this.logger.info(`AI review completed successfully`, { 
          hasReview: reviewResponse.hasReview,
          reviewCount: reviewResponse.reviews.length 
        });
        
        return reviewResponse;
      } catch (error) {
        const isRetryable = this.isRetryableError(error);
        
        if (attempt === maxRetries || !isRetryable) {
          this.logger.error(`AI review failed after ${attempt} attempts`, { error: error.message });
          throw new AIProviderError(`AI review failed: ${error.message}`, this.provider, error.status);
        }
        
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), config.LIMITS.MAX_BACKOFF_DELAY);
        this.logger.warning(`AI review attempt ${attempt} failed, retrying`, { 
          error: error.message, 
          delayMs: delay,
          nextAttempt: attempt + 1 
        });
        await this.sleep(delay);
      }
    }
  }

  /**
   * Call the AI service (to be implemented by subclasses)
   */
  async callAI(prompt) {
    throw new Error('callAI() must be implemented by subclass');
  }

  /**
   * Parse AI response
   */
  parseAIResponse(responseText) {
    const logger = Logger.createOperationLogger('BaseAIService.parseAIResponse', { provider: this.provider });
    
    try {
      logger.debug(`Parsing AI response`, { responseLength: responseText.length });
      
      // Clean up markdown-wrapped JSON if present
      let cleanedText = responseText.trim();
      if (cleanedText.startsWith('```json')) {
        cleanedText = cleanedText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (cleanedText.startsWith('```')) {
        cleanedText = cleanedText.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }
      
      // Try to parse the response as JSON
      const parsed = JSON.parse(cleanedText);
      
      // Basic validation - detailed validation will be done by AIReviewResponse model
      if (typeof parsed.hasReview !== 'boolean') {
        throw new Error('Invalid response: hasReview must be boolean');
      }
      
      if (!Array.isArray(parsed.reviews)) {
        throw new Error('Invalid response: reviews must be an array');
      }
      
      // Fix invalid severity levels
      for (const review of parsed.reviews) {
        if (review.severity && !config.SEVERITY_LEVELS.includes(review.severity)) {
          logger.warning(`Invalid severity "${review.severity}" in review, defaulting to "medium"`);
          review.severity = 'medium';
        }
      }
      
      logger.debug(`AI response parsed successfully`, { 
        hasReview: parsed.hasReview,
        reviewCount: parsed.reviews.length 
      });
      
      return parsed;
    } catch (error) {
      logger.error(`Failed to parse ${this.provider} response`, { 
        error: error.message,
        responsePreview: responseText.substring(0, 500) 
      });
      
      // Return a safe fallback response
      return {
        hasReview: false,
        overallAssessment: `Failed to parse ${this.provider} response: ${error.message}`,
        reviews: []
      };
    }
  }

  /**
   * Check if error is retryable
   */
  isRetryableError(error) {
    // Check for retryable HTTP status codes
    if (error.status) {
      return config.RETRYABLE_STATUS_CODES.includes(error.status);
    }
    
    // Check for network errors
    if (error.code) {
      return config.RETRYABLE_ERROR_CODES.includes(error.code);
    }
    
    return false;
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = BaseAIService;
