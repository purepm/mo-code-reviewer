const core = require('@actions/core');

/**
 * Centralized configuration management
 */
class Config {
  constructor() {
    this._cache = new Map();
  }

  // Performance limits
  static LIMITS = {
    MAX_FILES_HOLISTIC: 15,        // Max files for single holistic analysis
    MAX_TOTAL_LINES: 2000,         // Max total patch lines across all files
    MAX_FILE_LINES: 500,           // Max patch lines per file
    MAX_BATCH_SIZE: 5,             // Max files per batch in fallback mode
    MAX_REVIEWS_PER_BATCH: 8,      // Max reviews per batch
    MAX_RETRIES: 3,                // Max AI API retries
    MAX_BACKOFF_DELAY: 10000       // Max retry delay in ms
  };

  // Valid severity levels
  static SEVERITY_LEVELS = ['low', 'medium', 'high'];

  // Valid AI providers
  static AI_PROVIDERS = ['anthropic', 'openai'];

  // Retryable HTTP status codes
  static RETRYABLE_STATUS_CODES = [429, 500, 502, 503, 504, 529];

  // Retryable network error codes
  static RETRYABLE_ERROR_CODES = ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND'];

  /**
   * Get configuration value with caching
   */
  get(key, options = {}) {
    if (this._cache.has(key)) {
      return this._cache.get(key);
    }

    const value = core.getInput(key, options);
    this._cache.set(key, value);
    return value;
  }

  /**
   * Get GitHub token
   */
  getGitHubToken() {
    return this.get('github-token', { required: true });
  }

  /**
   * Get AI provider configuration
   */
  getAIProvider() {
    const provider = this.get('ai-provider') || 'anthropic';
    if (!Config.AI_PROVIDERS.includes(provider)) {
      throw new Error(`Unsupported AI provider: ${provider}. Supported: ${Config.AI_PROVIDERS.join(', ')}`);
    }
    return provider;
  }

  /**
   * Get AI API key based on provider
   */
  getAIApiKey(provider = null) {
    const actualProvider = provider || this.getAIProvider();
    const keyName = `${actualProvider}-api-key`;
    return this.get(keyName, { required: true });
  }

  /**
   * Get trigger label
   */
  getTriggerLabel() {
    return this.get('trigger-label', { required: true });
  }

  /**
   * Get severity levels array
   */
  getSeverityLevels() {
    const severity = this.get('severity') || 'high';
    const levels = severity.split('|').map(s => s.trim());
    
    // Validate severity levels
    const invalid = levels.filter(level => !Config.SEVERITY_LEVELS.includes(level));
    if (invalid.length > 0) {
      core.warning(`Invalid severity levels: ${invalid.join(', ')}. Valid: ${Config.SEVERITY_LEVELS.join(', ')}`);
    }
    
    return levels.filter(level => Config.SEVERITY_LEVELS.includes(level));
  }

  /**
   * Clear configuration cache
   */
  clearCache() {
    this._cache.clear();
  }
}

const configInstance = new Config();

// Export both the instance and static properties
module.exports = configInstance;
module.exports.LIMITS = Config.LIMITS;
module.exports.SEVERITY_LEVELS = Config.SEVERITY_LEVELS;
module.exports.AI_PROVIDERS = Config.AI_PROVIDERS;
module.exports.RETRYABLE_STATUS_CODES = Config.RETRYABLE_STATUS_CODES;
module.exports.RETRYABLE_ERROR_CODES = Config.RETRYABLE_ERROR_CODES;
