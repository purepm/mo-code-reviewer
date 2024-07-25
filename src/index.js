const core = require('@actions/core');
const github = require('@actions/github');
const { generatePrompt } = require('./utils');
const aiReviewer = require('./ai');

async function main() {
  try {
    core.info('Starting AI-powered pull request review');
    const { octokit, pullRequest, context, severity } = await initialize();

    if (!shouldProcessPullRequest(pullRequest)) {
      core.info('Pull request does not meet processing criteria. Exiting.');
      return;
    }

    core.info('Fetching changed files');
    const changedFiles = await getChangedFiles(octokit, context, pullRequest);
    core.info(`Found ${changedFiles.files.length} changed files`);

    await processChangedFiles(changedFiles, octokit, context, pullRequest);

    core.info('Finalizing pull request');
    await finalizePullRequest(octokit, context, pullRequest);
    core.info('AI review process completed successfully');
  } catch (err) {
    console.error(err);
    core.setFailed(err.message);
  }
}

async function initialize() {
  core.info('Initializing GitHub and AI clients');
  const token = core.getInput('github-token', { required: true });
  const octokit = github.getOctokit(token);

  const provider = core.getInput('ai-provider', { required: false }) || 'anthropic';
  core.info(`Initializing AI reviewer with provider: ${provider}`);
  aiReviewer.initialize(provider);

  const context = github.context;
  const { owner, repo } = context.repo;
  const pull_number = context.payload.pull_request?.number || context.payload.issue.number;

  core.info(`Fetching PR details for ${owner}/${repo}#${pull_number}`);
  const { data: pullRequest } = await octokit.rest.pulls.get({ owner, repo, pull_number });

  return { octokit, pullRequest, context, severity };
}

function shouldProcessPullRequest(pullRequest) {
  const requiredLabel = core.getInput('trigger-label', { required: true });
  core.info(`Checking for required label: ${requiredLabel}`);
  const isRequiredLabelRequested = pullRequest.labels.some(label => label.name === requiredLabel);

  if (!isRequiredLabelRequested) {
    core.info(`Required label ${requiredLabel} not found. Skipping review.`);
    return false;
  }

  if (pullRequest.state === 'closed' || pullRequest.locked) {
    core.info('Pull request is closed or locked. Skipping review.');
    return false;
  }

  core.info('Pull request meets processing criteria');
  return true;
}

async function getChangedFiles(octokit, context, pullRequest) {
  const { owner, repo } = context.repo;
  core.info(`Comparing commits: ${pullRequest.base.sha}...${pullRequest.head.sha}`);
  const { data } = await octokit.rest.repos.compareCommits({
    owner,
    repo,
    base: pullRequest.base.sha,
    head: pullRequest.head.sha,
  });

  return { files: data.files, commits: data.commits };
}

async function processChangedFiles(changedFiles, octokit, context, pullRequest) {
  const { files, commits } = changedFiles;

  for (const file of files) {
    if (file.status !== 'modified' && file.status !== 'added') {
      core.info(`Skipping file ${file.filename} (status: ${file.status})`);
      continue;
    }

    core.info(`Processing file: ${file.filename}`);
    try {
      const prompt = generatePrompt(file.patch || '', file.filename);
      core.info('Requesting AI review');
      const reviewFormatted = await aiReviewer.getReview(prompt);

      if (reviewFormatted && reviewFormatted.hasReview ) {
        core.info(`Creating ${reviewFormatted.reviews.length} review comments`);
        await createReviewComments(octokit, context, pullRequest, file, reviewFormatted, commits);
      } else {
        core.info('No review comments to add');
      }
    } catch (e) {
      core.error(`Review for ${file.filename} failed: ${e.message}`);
    }
  }
}

async function createReviewComments(octokit, context, pullRequest, file, reviewFormatted, commits) {
  const { owner, repo } = context.repo;

  const severity = core.getInput('severity', { required: false }) || 'high';
  const severityArray = severity.split('|');

  
  for (const review of reviewFormatted.reviews) {

    if (!severityArray.includes(review.severity)) {
      core.info(`Skipping review comment for ${file.filename} (${review.category}, severity: ${review.severity})`);
      continue;
    }

    core.info(`Adding review comment for ${file.filename} (${review.category}, severity: ${review.severity})`);
    const body = `
    | Category | Severity |
    | -------- | -------- |
    | ${review.category.toUpperCase()} | ${review.severity} |

${review.comment}

${review.suggestion ? `Suggestion:
\`\`\`${review.language}
${review.suggestion}
\`\`\`` : ''}
`;

    await octokit.rest.pulls.createReviewComment({
      repo,
      owner,
      pull_number: pullRequest.number,
      commit_id: commits[commits.length - 1].sha,
      path: file.filename,
      body: body,
      line: review.lineNumber,
      side: 'RIGHT'
    });
  }
}

async function finalizePullRequest(octokit, context, pullRequest) {
  const { owner, repo } = context.repo;
  const requiredLabel = core.getInput('trigger-label', { required: true });

  try {
    core.info(`Removing label: ${requiredLabel}`);
    await octokit.rest.issues.removeLabel({
      owner,
      repo,
      issue_number: pullRequest.number,
      name: requiredLabel,
    });

    core.info('Approving pull request');
    await octokit.rest.pulls.createReview({
      repo,
      owner,
      pull_number: pullRequest.number,
      commit_id: pullRequest.head.sha,
      event: 'APPROVE',
      body: 'Code review completed successfully by AI Assistant'
    });
    
  } catch (e) {
    core.error(`Finalizing pull request failed: ${e.message}`);
  }
}

main();