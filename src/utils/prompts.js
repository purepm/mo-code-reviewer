const config = require('../config');

/**
 * Generate comprehensive prompt for holistic PR analysis
 */
function generateComprehensivePrompt(prContext) {
  // Build file context with line number information
  const filesContext = prContext.files.map(file => {
    const availableLines = extractAvailableLines(file.patch);
    return `
### ${file.filename} (${file.status})
**Changes:** +${file.additions} -${file.deletions}
**Available lines for comments:** ${availableLines.join(', ')}

\`\`\`diff
${file.patch}
\`\`\``;
  }).join('\n');

  return `You are tasked with performing a comprehensive code review on a pull request. Your goal is to identify potential bugs, security risks, and suggest improvements while considering the full context of all changes.

## Pull Request Context
**Title:** ${prContext.title || 'No title provided'}
**Description:** ${prContext.description || 'No description provided'}

## Commit Messages
${prContext.commitMessages && prContext.commitMessages.length > 0 
  ? prContext.commitMessages.map(msg => `- ${msg}`).join('\n')
  : '- No commit messages available'}

## Changed Files (${prContext.files.length} files)
${filesContext}

## Analysis Instructions
1. Review ALL changes as a cohesive unit
2. Consider interactions between files
3. Look for cross-file dependencies and impacts
4. Identify architectural concerns
5. Focus on:
   - Potential bugs and logic errors
   - Security vulnerabilities
   - Performance implications
   - Breaking changes
   - Cross-file consistency
   - API contract changes
   - Code quality and best practices

## Response Format
Provide your review in JSON format:
{
  "hasReview": boolean,
  "overallAssessment": "Provide a analysis of the PR formatted in markdown with proper structure. Be thorough but concise. Focus on actionable items. Use markdown for better presentation.",
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
- Maximum ${config.LIMITS.MAX_REVIEWS_PER_BATCH} reviews total, prioritized by severity and impact
- Set "hasReview" to false if there are no significant issues
- Focus on lines that were actually changed or are contextually relevant
- Consider the full context when making recommendations
- Provide actionable, specific feedback
- **Suggestions**: Only include code suggestions for critical issues (security vulnerabilities, major bugs) or very simple fixes. Most reviews should have suggestion: null
- Ensure JSON is valid and parseable

Guidelines:
- **Individual Reviews**: Keep comments brief and focused - identify the issue quickly without lengthy explanations
- **Overall Assessment**: Focus on actionable items. - analyze the PR holistically using proper markdown formatting.
- **Clear Labeling**: When mentioning medium/low severity issues, MUST use explicit phrases like "Additional considerations include...", "Minor improvements needed...", "Lower priority issues...", or "Note: the following medium/low severity issues won't have inline comments:" to explain why they don't have inline comments
- **Avoid Confusion**: Don't extensively discuss medium/low severity issues without clearly indicating their lower priority status
- **Suggestions**: Only provide code suggestions for critical security vulnerabilities, major bugs, or when the fix is simple and obvious. Most reviews should have suggestion: null
- **Prioritization**: Focus on security and correctness issues first
- **Brevity**: Individual comments should be concise
- Do not include any text outside the JSON structure`;
}

/**
 * Generate batch prompt for processing file batches
 */
function generateBatchPrompt(batchContext) {
  const filesContext = batchContext.files.map(file => {
    const availableLines = extractAvailableLines(file.patch);
    return `
### ${file.filename} (${file.status})
**Changes:** +${file.additions} -${file.deletions}
**Available lines for comments:** ${availableLines.join(', ')}

\`\`\`diff
${file.patch}
\`\`\``;
  }).join('\n');

  const relatedContext = batchContext.relatedFiles 
    ? `\n## Related Files Context\n${batchContext.relatedFiles}` 
    : '';

  return `You are reviewing a batch of related files from a larger pull request. Consider both the files in this batch and their relationship to the broader PR context.

## Pull Request Context
**Title:** ${batchContext.title || 'No title provided'}
**Description:** ${batchContext.description || 'No description provided'}

## Files in This Batch (${batchContext.files.length} files)
${filesContext}
${relatedContext}

## Analysis Instructions
1. Review these files as a cohesive unit
2. Consider how they relate to each other and the broader PR
3. Focus on interactions and dependencies within this batch
4. Apply the same analysis criteria as a comprehensive review

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
- Maximum ${config.LIMITS.MAX_REVIEWS_PER_BATCH} reviews for this batch
- **Individual comments**: Keep brief and focused
- **Overall assessment**: Provide a analysis of this batch's role in the PR. Focus on actionable items.
- **Clear Labeling**: If mentioning medium/low severity issues, explicitly label them as "additional considerations" or "minor improvements"
- Prioritize by severity and cross-file impact
- Consider the broader PR context when available`;
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
