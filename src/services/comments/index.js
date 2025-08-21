const config = require('../../config');
const { Logger } = require('../../lib/logger');
const { GitHubAPIError } = require('../../lib/errors');
const { CommentStats } = require('../../models');

/**
 * Creates review comments on a GitHub pull request
 * @param {Object} octokit - GitHub API client
 * @param {Object} context - GitHub context
 * @param {Object} pullRequest - Pull request data
 * @param {Object} reviewFormatted - AI review response
 * @param {Array} files - Array of changed files
 * @param {Array} commits - Array of commits
 */
async function createAllReviewComments(octokit, context, pullRequest, reviewFormatted, files, commits) {
  const logger = Logger.createOperationLogger('createAllReviewComments', { 
    prNumber: pullRequest.number,
    reviewCount: reviewFormatted.reviews.length 
  });
  
  const { owner, repo } = context.repo;
  const severityArray = config.getSeverityLevels();
  
  // Create a map of files for quick lookup
  const fileMap = new Map(files.map(file => [file.filename, file]));
  
  logger.info(`Processing review comments`, { 
    totalReviews: reviewFormatted.reviews.length,
    allowedSeverities: severityArray.join('|') 
  });
  
  const stats = new CommentStats();
  
  for (const review of reviewFormatted.reviews) {
    const reviewLogger = Logger.createOperationLogger('processReview', {
      filename: review.filename,
      severity: review.severity,
      category: review.category
    });
    
    // Skip if severity doesn't match
    if (!severityArray.includes(review.severity)) {
      reviewLogger.info(`Skipping review: severity not allowed`);
      stats.skipped++;
      continue;
    }
    
    // Get the corresponding file
    const file = fileMap.get(review.filename);
    if (!file) {
      reviewLogger.warning(`File not found in changed files, skipping comment`);
      stats.skipped++;
      continue;
    }
    
    // Validate line number exists in the patch
    if (!validateLineNumber(review.lineNumber, file)) {
      reviewLogger.warning(`Invalid line number ${review.lineNumber}, skipping comment`);
      stats.skipped++;
      continue;
    }
    
    reviewLogger.info(`Creating review comment at line ${review.lineNumber}`);
    
    try {
      await createSingleReviewComment(octokit, context, pullRequest, review, commits, file);
      stats.created++;
      reviewLogger.debug(`Review comment created successfully`);
    } catch (error) {
      reviewLogger.error(`Failed to create comment`, { error: error.message });
      stats.errors++;
    }
  }
  
  logger.info(`Review comments processing completed`, { 
    created: stats.created,
    skipped: stats.skipped,
    errors: stats.errors,
    successRate: `${stats.successRate.toFixed(1)}%`
  });
  
  return stats;
}

/**
 * Creates a single review comment on GitHub
 * @param {Object} octokit - GitHub API client
 * @param {Object} context - GitHub context
 * @param {Object} pullRequest - Pull request data
 * @param {Object} review - Single review object from AI
 * @param {Array} commits - Array of commits
 * @param {Object} file - File object with patch data
 */
async function createSingleReviewComment(octokit, context, pullRequest, review, commits, file) {
  const logger = Logger.createOperationLogger('createSingleReviewComment', {
    filename: review.filename,
    lineNumber: review.lineNumber
  });
  
  const { owner, repo } = context.repo;
  
  try {
    const body = formatReviewComment(review);
    
    // Extract the diff hunk for this line
    const diffHunk = extractDiffHunk(file.patch, review.lineNumber);
    
    const commentParams = {
      repo,
      owner,
      pull_number: pullRequest.number,
      commit_id: commits[commits.length - 1].sha,
      path: review.filename,
      body: body,
      line: review.lineNumber,
      side: 'RIGHT'
    };
    
    // Add diff_hunk if we found one
    if (diffHunk) {
      commentParams.diff_hunk = diffHunk;
      logger.debug(`Adding diff_hunk to API call`, { diffHunkLength: diffHunk.length });
    }
    
    await octokit.rest.pulls.createReviewComment(commentParams);
    
    logger.debug(`GitHub API call successful`);
  } catch (error) {
    logger.error(`GitHub API call failed`, { error: error.message });
    throw new GitHubAPIError(`Failed to create review comment: ${error.message}`, error.status, {
      filename: review.filename,
      lineNumber: review.lineNumber
    });
  }
}

/**
 * Formats a review comment with enhanced information
 * @param {Object} review - Review object from AI
 * @returns {string} Formatted comment body
 */
function formatReviewComment(review) {
  const contextType = review.crossFileImpact ? 'Cross-file impact' : 'File-specific';
  
  let body = `
| Category | Severity | Context |
| -------- | -------- | ------- |
| ${review.category.toUpperCase()} | ${review.severity} | ${contextType} |

## Issue
${review.comment}`;

  // Add contextual reasoning if provided
  if (review.contextualReason) {
    body += `

## Context
${review.contextualReason}`;
  }

  // Add cross-file impact if provided
  if (review.crossFileImpact) {
    body += `

## Cross-file Impact
${review.crossFileImpact}`;
  }

  // Add code suggestion if provided
  if (review.suggestion) {
    body += `

## Suggestion
\`\`\`${review.language || 'javascript'}
${review.suggestion}
\`\`\``;
  }

  return body;
}

/**
 * Validates that a line number exists in the file's patch
 * @param {number} lineNumber - Line number to validate (new file line number)
 * @param {Object} file - File object with patch
 * @returns {boolean} True if line number is valid for commenting
 */
function validateLineNumber(lineNumber, file) {
  const logger = Logger.createOperationLogger('validateLineNumber', {
    filename: file.filename,
    lineNumber
  });
  
  if (!file.patch) {
    logger.warning(`No patch available for file`);
    return false;
  }
  
  const lines = file.patch.split('\n');
  let newLineNumber = 0;
  let inHunk = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Parse hunk header to get starting line numbers
    if (line.startsWith('@@')) {
      const match = line.match(/@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match) {
        newLineNumber = parseInt(match[1]) - 1; // -1 because we increment before checking
        inHunk = true;
      }
      continue;
    }
    
    if (!inHunk) continue;
    
    // Handle different line types
    if (line.startsWith('+')) {
      // Added line - increment new line number and check if it matches
      newLineNumber++;
      if (newLineNumber === lineNumber) {
        logger.debug(`Line number validation successful - added line`);
        return true;
      }
    } else if (line.startsWith('-')) {
      // Deleted line - don't increment new line number, not commentable
      continue;
    } else if (line.length > 0) {
      // Context line - increment new line number and check if it matches
      newLineNumber++;
      if (newLineNumber === lineNumber) {
        logger.debug(`Line number validation successful - context line`);
        return true;
      }
    }
  }
  
  logger.debug(`Line number ${lineNumber} not found in patch`);
  return false;
}

/**
 * Creates a summary comment with overall assessment
 * @param {Object} octokit - GitHub API client
 * @param {Object} context - GitHub context
 * @param {Object} pullRequest - Pull request data
 * @param {Object} reviewFormatted - AI review response
 * @param {Object} commentStats - Statistics about created comments
 */
async function createSummaryComment(octokit, context, pullRequest, reviewFormatted, commentStats) {
  const logger = Logger.createOperationLogger('createSummaryComment', {
    prNumber: pullRequest.number
  });
  
  if (!reviewFormatted.overallAssessment) {
    logger.debug(`No overall assessment provided, skipping summary comment`);
    return;
  }
  
  const { owner, repo } = context.repo;
  const reviewStats = reviewFormatted.getStats();
  
  const summaryBody = `
## 🤖 AI Code Review Summary

${reviewFormatted.overallAssessment}

### Review Statistics
- **Comments Created**: ${commentStats.created}
- **Comments Skipped**: ${commentStats.skipped}
- **Comments Failed**: ${commentStats.errors}
- **Total Issues Found**: ${reviewStats.totalReviews}
- **Success Rate**: ${commentStats.successRate.toFixed(1)}%

### Issue Breakdown
**By Severity**: ${Object.entries(reviewStats.severityCounts).map(([severity, count]) => `${severity}: ${count}`).join(', ')}
**By Category**: ${Object.entries(reviewStats.categoryCounts).map(([category, count]) => `${category}: ${count}`).join(', ')}

---
*This review was generated automatically by AI. Please review the suggestions and use your judgment.*
`;

  try {
    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: pullRequest.number,
      body: summaryBody
    });
    
    logger.info('AI review summary comment created successfully');
  } catch (error) {
    logger.warning(`Failed to create summary comment`, { error: error.message });
    throw new GitHubAPIError(`Failed to create summary comment: ${error.message}`, error.status);
  }
}

/**
 * Extract the diff hunk that contains the specified line number
 * @param {string} patch - The patch content
 * @param {number} targetLineNumber - The line number to find
 * @returns {string|null} The diff hunk or null if not found
 */
function extractDiffHunk(patch, targetLineNumber) {
  if (!patch) return null;
  
  const lines = patch.split('\n');
  let currentHunk = [];
  let newLineNumber = 0;
  let inHunk = false;
  let hunkStartIndex = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Start of a new hunk
    if (line.startsWith('@@')) {
      // If we were in a previous hunk and didn't find the line, reset
      if (inHunk && currentHunk.length > 0) {
        currentHunk = [];
      }
      
      // Parse hunk header
      const match = line.match(/@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match) {
        newLineNumber = parseInt(match[1]) - 1;
        inHunk = true;
        hunkStartIndex = i;
        currentHunk = [line]; // Start with the hunk header
      }
      continue;
    }
    
    if (!inHunk) continue;
    
    currentHunk.push(line);
    
    // Handle different line types
    if (line.startsWith('+')) {
      newLineNumber++;
      if (newLineNumber === targetLineNumber) {
        // Found the target line! Return the current hunk
        return currentHunk.join('\n');
      }
    } else if (line.startsWith('-')) {
      // Deleted line - don't increment new line number
      continue;
    } else if (line.length > 0) {
      // Context line
      newLineNumber++;
      if (newLineNumber === targetLineNumber) {
        // Found the target line! Return the current hunk
        return currentHunk.join('\n');
      }
    }
  }
  
  return null;
}

module.exports = {
  createAllReviewComments,
  createSingleReviewComment,
  formatReviewComment,
  validateLineNumber,
  createSummaryComment,
  extractDiffHunk
};
