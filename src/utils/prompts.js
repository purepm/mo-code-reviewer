const config = require('../config');

/**
 * Generate file context with line number information
 */
function generateFileContext(file) {
  const availableLines = extractAvailableLines(file.patch);
  return `
### ${file.filename} (${file.status})
**Changes:** +${file.additions} -${file.deletions}
**Available lines for comments:** ${availableLines.join(', ')}

\`\`\`diff
${file.patch}
\`\`\``;
}


/**
 * Generate comprehensive prompt for holistic PR analysis
 */
function generateComprehensivePrompt(prContext) {

  // Build file context with line number information
  const filesContext = prContext.files.map(file => {
    return generateFileContext(file);
  }).join('\n');

  return `You are tasked to perform a code review on a pull request. Your goal is to identify potential bugs, security risks, and suggest improvements while considering the full context of all changes.

## Pull Request Context
**Title:** ${prContext.title || 'No title provided'}

## Changed Files (${prContext.files.length} files)
${filesContext}

## Analysis Instructions
1. Review ALL changes as a cohesive unit
2. Focus on:
   - Potential bugs and logic errors
   - Security vulnerabilities
   - Performance issues

## Response Format
Provide your review in JSON format:
{
  "hasReview": boolean,
  "overallAssessment": "Provide a analysis of the PR. Be concise. Focus on actionable items. If the recommended changes are not critical, mention the file name and line number. Use markdown.",
  "reviews": [
    {
      "filename": "exact filename from the changed files",
      "lineNumber": number,
      "comment": "Brief, focused explanation of the specific issue (1-2 sentences max)",
      "suggestion": "Only provide code suggestion if absolutely necessary for critical fixes, otherwise null",
      "language": "Programming language",
      "severity": "low|medium|high",
      "category": "bug|security|performance|style|best_practice|architecture"
    }
  ]
}

## Critical Instructions:
- ONLY use line numbers that appear in the "Available lines for comments" list for each file
- Line numbers refer to positions within the diff/patch (not absolute file positions)
- Each review MUST include a valid lineNumber from the available lines
- Set "hasReview" to false if there are no significant issues
- Focus on lines that were actually changed
- Only use "high" severity for critical issues that could cause system failures, security breaches, or data loss
- Provide actionable, specific feedback
- Ensure review comments are not repetitive
- Avoid nitpicking minor issues that don't impact functionality
- Dont add comments on test files
- Ensure JSON is valid and parseable`;
}

/**
 * Generate batch prompt for processing file batches
 */
function generateBatchPrompt(batchContext) {
  const filesContext = batchContext.files.map(file => generateFileContext(file)).join('\n');

  return `You are reviewing a batch of related files from a larger pull request. Consider both the files in this batch and their relationship to the broader PR context.

## Pull Request Context
**Title:** ${batchContext.title || 'No title provided'}

## Files in This Batch (${batchContext.files.length} files)
${filesContext}

## Analysis Instructions
1. Review these files as a cohesive unit
2. Consider how they relate to each other and the broader PR
3. Focus on interactions and dependencies within this batch

## Response Format
Use the same JSON format as comprehensive reviews:
{
  "hasReview": boolean,
  "overallAssessment": "Analysis of this batch formatted in markdown. Focus on actionable items.",
  "reviews": [
    {
      "filename": "exact filename from the batch",
      "lineNumber": number,
      "comment": "Brief, focused explanation of the specific issue (1-2 sentences max)",
      "suggestion": "Only provide code suggestion if absolutely necessary for critical fixes, otherwise null",
      "language": "Programming language", 
      "severity": "low|medium|high",
      "category": "bug|security|performance|style|best_practice|architecture"
    }
  ]
}

## Critical Instructions:
- ONLY use line numbers from the "Available lines for comments" lists
- **Individual comments**: Keep brief and focused
- **Overall assessment**: Provide a analysis of this batch's role in the PR. Focus on actionable items.
- Only use "high" severity for critical issues that could cause system failures, security breaches, or data loss
- Ensure review comments are not repetitive
- Prioritize by severity and cross-file impact
- Avoid nitpicking minor issues that don't impact functionality
- Dont add comments on test files
- Ensure JSON is valid and parseable`;
}

/**
 * Extract available line numbers from a patch
 * Returns line numbers in the new version of the file (right side of diff)
 */
function extractAvailableLines(patch) {
  if (!patch) return [];
  
  const lines = patch.split('\n');
  const availableLines = [];
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
      // Added line - increment new line number and mark as commentable
      newLineNumber++;
      availableLines.push(newLineNumber);
    } else if (line.startsWith('-')) {
      // Deleted line - don't increment new line number, not commentable
      continue;
    } else if (line.length > 0) {
      // Context line - increment new line number and mark as commentable
      newLineNumber++;
      availableLines.push(newLineNumber);
    }
  }
  
  return availableLines;
}

module.exports = {
  generateComprehensivePrompt,
  generateBatchPrompt,
  extractAvailableLines
};
