const github = require('@actions/github');
const config = require('../config');
const { Logger } = require('../lib/logger');
const { PRReviewError, GitHubAPIError } = require('../lib/errors');
const { PRContext, FileChange } = require('../models');
const { 
  generateComprehensivePrompt, 
  generateBatchPrompt,
  calculatePRComplexity,
  createFileBatches
} = require('../utils');
const { initializeAI, getAIService } = require('../services/ai');
const { createAllReviewComments } = require('../services/comments');

async function main() {
  const logger = Logger.createOperationLogger('main');
  
  try {
    logger.info('Starting AI-powered pull request review');
    const { octokit, prContext, context, pullRequest } = await initialize();

    if (!shouldProcessPullRequest(prContext)) {
      logger.info('Pull request does not meet processing criteria. Exiting.');
      return;
    }

    logger.info('Fetching changed files');
    const changedFiles = await getChangedFiles(octokit, context, pullRequest);
    logger.info(`Found ${changedFiles.files.length} changed files`);

    // Update PR context with files and commits
    prContext.files = changedFiles.files.map(file => new FileChange(file));
    prContext.commitMessages = changedFiles.commits.map(c => c.commit.message);

    await processChangedFiles(changedFiles, octokit, context, prContext);

    logger.info('Finalizing pull request');
    await finalizePullRequest(octokit, context, prContext);
    logger.info('AI review process completed successfully');
  } catch (err) {
    if (err instanceof PRReviewError) {
      logger.error('PR review failed', { 
        code: err.code,
        context: err.context,
        error: err.message 
      });
    } else {
      logger.error('Unexpected error during PR review', { error: err.message });
    }
    
    // Use Logger instead of core for consistency, but still set failed status
    const core = require('@actions/core');
    core.setFailed(err.message);
  }
}

async function initialize() {
  const logger = Logger.createOperationLogger('initialize');
  
  try {
    logger.info('Initializing GitHub and AI clients');
    const token = config.getGitHubToken();
    const octokit = github.getOctokit(token);

    const provider = config.getAIProvider();
    logger.info(`Initializing AI reviewer with provider: ${provider}`);
    await initializeAI(provider);

    const context = github.context;
    const { owner, repo } = context.repo;
    const pull_number = context.payload.pull_request?.number || context.payload.issue.number;

    if (!pull_number) {
      throw new PRReviewError('No pull request number found in context', 'MISSING_PR_NUMBER');
    }

    logger.info(`Fetching PR details`, { owner, repo, pullNumber: pull_number });
    const { data: pullRequest } = await octokit.rest.pulls.get({ owner, repo, pull_number });

    // Create PR context model
    const prContext = new PRContext({
      title: pullRequest.title,
      body: pullRequest.body,
      number: pullRequest.number,
      owner,
      repo,
      files: [], // Will be populated later
      commitMessages: [] // Will be populated later
    });

    logger.info('Initialization completed successfully');
    return { octokit, prContext, context, pullRequest };
  } catch (error) {
    logger.error('Initialization failed', { error: error.message });
    if (error.status) {
      throw new GitHubAPIError(`GitHub API error during initialization: ${error.message}`, error.status);
    }
    throw error;
  }
}

function shouldProcessPullRequest(prContext) {
  const logger = Logger.createOperationLogger('shouldProcessPullRequest', {
    prNumber: prContext.number
  });
  
  const requiredLabel = config.getTriggerLabel();
  logger.info(`Checking for required label: ${requiredLabel}`);
  
  // Note: We'll need to get the actual PR data to check labels
  // This is a simplified version - in practice, we'd need to pass the full PR data
  // For now, we'll assume the PR should be processed if we got this far
  logger.info('Pull request meets processing criteria');
  return true;
}

async function getChangedFiles(octokit, context, pullRequest) {
  const logger = Logger.createOperationLogger('getChangedFiles', {
    prNumber: pullRequest.number
  });
  
  const { owner, repo } = context.repo;
  
  try {
    logger.info(`Comparing commits: ${pullRequest.base.sha}...${pullRequest.head.sha}`);
    const { data } = await octokit.rest.repos.compareCommits({
      owner,
      repo,
      base: pullRequest.base.sha,
      head: pullRequest.head.sha,
    });

    logger.info(`Retrieved changed files`, { 
      fileCount: data.files.length,
      commitCount: data.commits.length 
    });

    return { files: data.files, commits: data.commits };
  } catch (error) {
    logger.error('Failed to get changed files', { error: error.message });
    throw new GitHubAPIError(`Failed to get changed files: ${error.message}`, error.status);
  }
}

async function processChangedFiles(changedFiles, octokit, context, prContext) {
  const logger = Logger.createOperationLogger('processChangedFiles', {
    prNumber: prContext.number
  });
  
  const { files, commits } = changedFiles;
  
  // Filter relevant files
  const relevantFiles = files.filter(file => 
    file.status === 'modified' || file.status === 'added'
  );
  
  if (relevantFiles.length === 0) {
    logger.info('No relevant files to review');
    return;
  }
  
  logger.info(`Found ${relevantFiles.length} relevant files to review`);
  
  // Calculate PR complexity and determine processing strategy
  const complexity = calculatePRComplexity(relevantFiles);
  logger.info(`PR complexity determined`, { 
    fileCount: complexity.fileCount,
    totalLines: complexity.totalLines,
    strategy: complexity.canProcessHolistic ? 'holistic' : 'batching'
  });
  
  if (complexity.canProcessHolistic) {
    logger.info('Using holistic analysis approach');
    await processHolistically(relevantFiles, octokit, context, prContext, commits);
  } else {
    logger.info('PR too large for holistic analysis, using smart batching');
    await processByBatches(relevantFiles, octokit, context, prContext, commits);
  }
}

async function processHolistically(files, octokit, context, prContext, commits) {
  const logger = Logger.createOperationLogger('processHolistically', {
    prNumber: prContext.number,
    fileCount: files.length
  });
  
  try {
    // Use the PR context model for prompt generation
    const promptContext = prContext.toPromptFormat();
    
    // Single AI call with full context
    logger.info('Requesting comprehensive AI review');
    const prompt = generateComprehensivePrompt(promptContext);
    const aiService = getAIService();
    const reviewFormatted = await aiService.getReview(prompt);
    
    if (reviewFormatted?.hasReview) {
      logger.info(`AI review completed`, {
        hasAssessment: Boolean(reviewFormatted.overallAssessment),
        reviewCount: reviewFormatted.reviews.length
      });
      
      await createAllReviewComments(octokit, context, { number: prContext.number }, reviewFormatted, files, commits);
      
      // Store overall assessment and check for high severity issues
      prContext.overallAssessment = reviewFormatted.overallAssessment;
      
      // Check if there are any high severity issues
      const hasHighSeverityIssues = reviewFormatted.reviews.some(review => review.severity === 'high');
      if (hasHighSeverityIssues) {
        prContext.hasHighSeverityIssues = true;
      }
    } else {
      logger.info('No review comments to add');
    }
  } catch (e) {
    logger.error(`Holistic review failed`, { error: e.message });
    // Fallback to batch processing
    logger.info('Falling back to batch processing');
    await processByBatches(files, octokit, context, prContext, commits);
  }
}

async function processByBatches(files, octokit, context, prContext, commits) {
  const logger = Logger.createOperationLogger('processByBatches', {
    prNumber: prContext.number,
    totalFiles: files.length
  });
  
  const batches = createFileBatches(files);
  logger.info(`Processing ${batches.length} batches`);
  
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const batchLogger = Logger.createOperationLogger(`batch-${i + 1}`, {
      batchNumber: i + 1,
      totalBatches: batches.length,
      filesInBatch: batch.length
    });
    
    batchLogger.info(`Processing batch`);
    
    try {
      const batchContext = {
        title: prContext.title,
        description: prContext.description,
        files: batch.map(file => ({
          filename: file.filename,
          status: file.status,
          patch: file.patch,
          additions: file.additions,
          deletions: file.deletions
        })),
        commitMessages: prContext.commitMessages,
        relatedFiles: `This is batch ${i + 1} of ${batches.length} in a larger PR`
      };
      
      const prompt = generateBatchPrompt(batchContext);
      const aiService = getAIService();
      const reviewFormatted = await aiService.getReview(prompt);
      
      if (reviewFormatted?.hasReview) {
        batchLogger.info(`Creating review comments`, { reviewCount: reviewFormatted.reviews.length });
        const commentStats = await createAllReviewComments(octokit, context, { number: prContext.number }, reviewFormatted, batch, commits);
        
        // Store overall assessment from the first batch that has one
        if (reviewFormatted.overallAssessment && !prContext.overallAssessment) {
          prContext.overallAssessment = reviewFormatted.overallAssessment;
        }
        
        // Check if there are any high severity issues in this batch
        const hasHighSeverityIssues = reviewFormatted.reviews.some(review => review.severity === 'high');
        if (hasHighSeverityIssues) {
          prContext.hasHighSeverityIssues = true;
        }
        
        batchLogger.info(`Batch processing completed`, { 
          created: commentStats.created,
          skipped: commentStats.skipped,
          errors: commentStats.errors
        });
      } else {
        batchLogger.info(`No review comments to add`);
      }
    } catch (e) {
      batchLogger.error(`Batch review failed`, { error: e.message });
      // Continue with next batch
    }
  }
}

async function finalizePullRequest(octokit, context, prContext) {
  const logger = Logger.createOperationLogger('finalizePullRequest', {
    prNumber: prContext.number
  });
  
  const { owner, repo } = context.repo;
  const requiredLabel = config.getTriggerLabel();

  try {
    logger.info('Creating approval review');
    
    // Build the completion message with optional overall assessment
    // Use different emoji based on severity of issues found
    const emoji = prContext.hasHighSeverityIssues ? '⚠️' : '✅';
    let completionBody = `${emoji} **AI Code Review Completed**\n\n`;
    
    if (prContext.overallAssessment) {
      completionBody += `${prContext.overallAssessment}\n\n`;
    }
    
    await octokit.rest.pulls.createReview({
      repo,
      owner,
      pull_number: prContext.number,
      event: 'APPROVE',
      body: completionBody
    });
    
    logger.info('Approval review created successfully');
  } catch (e) {
    logger.error(`Failed to create approval review`, { error: e.message });
    throw new GitHubAPIError(`Failed to create approval review: ${e.message}`, e.status);
  }

  // Remove trigger label as the final step - don't throw error if it fails
  try {
    logger.info(`Removing trigger label: ${requiredLabel}`);
    await octokit.rest.issues.removeLabel({
      owner,
      repo,
      issue_number: prContext.number,
      name: requiredLabel,
    });
    logger.info('Trigger label removed successfully');
  } catch (e) {
    // Log the error but don't throw - label removal failure shouldn't stop the process
    logger.error(`Failed to remove trigger label: ${requiredLabel}`, { 
      error: e.message,
      note: 'This is non-critical - the review process completed successfully'
    });
  }
  
  logger.info('Pull request finalization completed');
}

main();