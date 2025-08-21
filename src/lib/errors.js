/**
 * Custom error classes for better error handling
 */

class PRReviewError extends Error {
  constructor(message, code = 'UNKNOWN', context = {}) {
    super(message);
    this.name = 'PRReviewError';
    this.code = code;
    this.context = context;
  }
}

class AIProviderError extends PRReviewError {
  constructor(message, provider, statusCode = null, context = {}) {
    super(message, 'AI_PROVIDER_ERROR', { provider, statusCode, ...context });
    this.provider = provider;
    this.statusCode = statusCode;
  }
}

class GitHubAPIError extends PRReviewError {
  constructor(message, statusCode = null, context = {}) {
    super(message, 'GITHUB_API_ERROR', { statusCode, ...context });
    this.statusCode = statusCode;
  }
}

class ConfigurationError extends PRReviewError {
  constructor(message, configKey = null, context = {}) {
    super(message, 'CONFIGURATION_ERROR', { configKey, ...context });
    this.configKey = configKey;
  }
}

module.exports = {
  PRReviewError,
  AIProviderError,
  GitHubAPIError,
  ConfigurationError
};
