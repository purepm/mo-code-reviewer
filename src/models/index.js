const { ConfigurationError } = require('../lib/errors');
const config = require('../config');

/**
 * Data models and validation for PR review system
 */

/**
 * Pull Request Context model
 */
class PRContext {
  constructor(data) {
    this.title = data.title || '';
    this.description = data.description || data.body || '';
    this.files = (data.files || []).map(file => new FileChange(file));
    this.commitMessages = data.commitMessages || [];
    this.number = data.number;
    this.owner = data.owner;
    this.repo = data.repo;
    
    this.validate();
  }

  validate() {
    if (!this.number) throw new ConfigurationError('PR number is required');
    if (!this.owner) throw new ConfigurationError('Repository owner is required');
    if (!this.repo) throw new ConfigurationError('Repository name is required');
    if (!Array.isArray(this.files)) throw new ConfigurationError('Files must be an array');
  }

  /**
   * Get complexity metrics for this PR
   */
  getComplexity() {
    const fileCount = this.files.length;
    const totalLines = this.files.reduce((sum, file) => sum + file.getPatchLineCount(), 0);
    
    return {
      fileCount,
      totalLines,
      canProcessHolistic: fileCount <= config.LIMITS.MAX_FILES_HOLISTIC && 
                         totalLines <= config.LIMITS.MAX_TOTAL_LINES,
      needsBatching: fileCount > config.LIMITS.MAX_FILES_HOLISTIC || 
                     totalLines > config.LIMITS.MAX_TOTAL_LINES
    };
  }

  /**
   * Convert to format expected by prompt generation
   */
  toPromptFormat() {
    return {
      title: this.title,
      description: this.description,
      files: this.files.map(file => file.toPromptFormat()),
      commitMessages: this.commitMessages
    };
  }
}

/**
 * File Change model
 */
class FileChange {
  constructor(data) {
    this.filename = data.filename;
    this.status = data.status;
    this.patch = data.patch || '';
    this.additions = data.additions || 0;
    this.deletions = data.deletions || 0;
    
    this.validate();
  }

  validate() {
    if (!this.filename) throw new ConfigurationError('Filename is required');
    if (!this.status) throw new ConfigurationError('File status is required');
    
    const validStatuses = ['added', 'modified', 'removed', 'renamed'];
    if (!validStatuses.includes(this.status)) {
      throw new ConfigurationError(`Invalid file status: ${this.status}. Valid: ${validStatuses.join(', ')}`);
    }
  }

  /**
   * Check if this file should be reviewed
   */
  shouldReview() {
    return this.status === 'modified' || this.status === 'added';
  }

  /**
   * Get patch line count
   */
  getPatchLineCount() {
    return this.patch ? this.patch.split('\n').length : 0;
  }

  /**
   * Check if file is too large for processing
   */
  isTooLarge() {
    return this.getPatchLineCount() > config.LIMITS.MAX_FILE_LINES;
  }

  /**
   * Convert to format expected by prompt generation
   */
  toPromptFormat() {
    return {
      filename: this.filename,
      status: this.status,
      patch: this.patch,
      additions: this.additions,
      deletions: this.deletions
    };
  }
}

/**
 * AI Review Response model
 */
class AIReviewResponse {
  constructor(data) {
    this.hasReview = Boolean(data.hasReview);
    this.overallAssessment = data.overallAssessment || '';
    this.reviews = (data.reviews || []).map(review => new ReviewComment(review));
    
    this.validate();
  }

  validate() {
    if (typeof this.hasReview !== 'boolean') {
      throw new ConfigurationError('hasReview must be boolean');
    }
    
    if (!Array.isArray(this.reviews)) {
      throw new ConfigurationError('reviews must be an array');
    }
  }

  /**
   * Filter reviews by severity
   */
  filterBySeverity(allowedSeverities) {
    return new AIReviewResponse({
      hasReview: this.hasReview,
      overallAssessment: this.overallAssessment,
      reviews: this.reviews.filter(review => allowedSeverities.includes(review.severity))
    });
  }

  /**
   * Get review statistics
   */
  getStats() {
    const severityCounts = this.reviews.reduce((acc, review) => {
      acc[review.severity] = (acc[review.severity] || 0) + 1;
      return acc;
    }, {});

    const categoryCounts = this.reviews.reduce((acc, review) => {
      acc[review.category] = (acc[review.category] || 0) + 1;
      return acc;
    }, {});

    return {
      totalReviews: this.reviews.length,
      severityCounts,
      categoryCounts,
      hasAssessment: Boolean(this.overallAssessment)
    };
  }
}

/**
 * Review Comment model
 */
class ReviewComment {
  constructor(data) {
    this.filename = data.filename;
    this.lineNumber = Number(data.lineNumber);
    this.comment = data.comment;
    this.suggestion = data.suggestion || null;
    this.language = data.language || 'javascript';
    this.severity = data.severity;
    this.category = data.category;
    
    this.validate();
  }

  validate() {
    if (!this.filename) throw new ConfigurationError('Review filename is required');
    if (!this.comment) throw new ConfigurationError('Review comment is required');
    if (!Number.isInteger(this.lineNumber) || this.lineNumber < 1) {
      throw new ConfigurationError('Review lineNumber must be a positive integer');
    }
    
    if (!config.SEVERITY_LEVELS.includes(this.severity)) {
      throw new ConfigurationError(`Invalid severity: ${this.severity}. Valid: ${config.SEVERITY_LEVELS.join(', ')}`);
    }
  }
}

/**
 * Comment Statistics model
 */
class CommentStats {
  constructor(created = 0, skipped = 0, errors = 0) {
    this.created = created;
    this.skipped = skipped;
    this.errors = errors;
  }

  get total() {
    return this.created + this.skipped + this.errors;
  }

  get successRate() {
    return this.total > 0 ? (this.created / this.total) * 100 : 0;
  }

  add(other) {
    return new CommentStats(
      this.created + other.created,
      this.skipped + other.skipped,
      this.errors + other.errors
    );
  }
}

module.exports = {
  PRContext,
  FileChange,
  AIReviewResponse,
  ReviewComment,
  CommentStats
};
