const core = require('@actions/core');

/**
 * Centralized logging and error handling
 */
class Logger {
  /**
   * Log info message with context
   */
  static info(message, context = {}) {
    const formatted = this.formatMessage(message, context);
    core.info(formatted);
  }

  /**
   * Log warning message with context
   */
  static warning(message, context = {}) {
    const formatted = this.formatMessage(message, context);
    core.warning(formatted);
  }

  /**
   * Log error message with context
   */
  static error(message, context = {}) {
    const formatted = this.formatMessage(message, context);
    core.error(formatted);
  }

  /**
   * Log debug message (only in debug mode)
   */
  static debug(message, context = {}) {
    if (core.isDebug()) {
      const formatted = this.formatMessage(message, context);
      core.debug(formatted);
    }
  }

  /**
   * Format message with context
   */
  static formatMessage(message, context) {
    if (Object.keys(context).length === 0) {
      return message;
    }
    
    const contextStr = Object.entries(context)
      .map(([key, value]) => `${key}=${value}`)
      .join(' ');
    
    return `${message} [${contextStr}]`;
  }

  /**
   * Create operation logger with context
   */
  static createOperationLogger(operation, context = {}) {
    return {
      info: (message, additionalContext = {}) => 
        this.info(`${operation}: ${message}`, { ...context, ...additionalContext }),
      
      warning: (message, additionalContext = {}) => 
        this.warning(`${operation}: ${message}`, { ...context, ...additionalContext }),
      
      error: (message, additionalContext = {}) => 
        this.error(`${operation}: ${message}`, { ...context, ...additionalContext }),
      
      debug: (message, additionalContext = {}) => 
        this.debug(`${operation}: ${message}`, { ...context, ...additionalContext })
    };
  }
}

module.exports = {
  Logger
};
