# AI-Powered Pull Request Reviewer

This GitHub Action automatically reviews pull requests using AI, providing code suggestions and comments.

## Features

- Automatically triggered by a specific label on pull requests
- Reviews changed files in the pull request
- Generates AI-powered code reviews and suggestions
- Supports multiple AI providers (currently Anthropic, with easy extensibility)
- Adds review comments directly to the pull request
- Approves the pull request after successful review
- Removes the trigger label after completion

## Setup

1. Add this action to your repository's `.github/workflows` directory.
2. Configure the necessary secrets and inputs (see below).

## Usage

To use this action, add a specific label (configured as `trigger-label`) to your pull request. The action will then automatically review the changes and provide feedback.

## Configuration

### Inputs

- `github-token`: GitHub token for API access (required)
- `anthropic-api-key`: API key for Anthropic (required if using Anthropic as the AI provider)
- `openai-api-key`: API key for OpenAI (required if using OpenAI as the AI provider)
- `trigger-label`: The label that triggers the review process (required)
- `ai-provider`: The AI provider to use (optional, defaults to 'anthropic') values: ('anthropic', 'openai')
- `severity`: The AI provide the comments with a severity flag, you can decide which of those add to the review by passing the values here ("low|medium|high"), by default only add the high severity comments.

### Secrets

Make sure to set up the following secrets in your repository:

- `GITHUB_TOKEN`: Automatically provided by GitHub Actions
- `ANTHROPIC_API_KEY`: Your Anthropic API key (if required)
- `OPENAI_API_KEY`: Your OpenAI API key (if required)

## Workflow Example

```yaml
name: AI Pull Request Review

on:
  pull_request:
    types: [labeled]

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: AI Pull Request Review
        uses: purepm/mo-code-reviewer@v1.2.0
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          trigger-label: 'mo-review'
          severity: 'low|medium|high'
```

## Testing

This action includes comprehensive local testing capabilities to help you validate changes before deployment.

### Quick Start Testing

1. **Set up API keys** in `scripts/test.sh`:
   ```bash
   export ANTHROPIC_API_KEY="your-anthropic-key-here"
   # OR
   export OPENAI_API_KEY="your-openai-key-here"
   ```

2. **Run tests**:
   ```bash
   npm run test
   ```

### Testing with Real PR Data

To test the action with actual PR changes from your repository:

1. **Get PR diff**: Find an open PR and get the diff between main and the PR branch:
   ```bash
   git diff main-commit-hash...pr-commit-hash > pr-diff.patch
   ```

2. **Convert diff to test data**: Use AI to convert your diff into the test data format. Ask an AI service to:
   - Take your `pr-diff.patch` content
   - Convert it to match the format in `scripts/test-data/custom-pr.js`
   - Include proper `title`, `description`, `files` array with `filename`, `status`, `additions`, `deletions`, and `patch` fields
   - Add relevant `commitMessages`

3. **Update test data**: Replace the content in `scripts/test-data/custom-pr.js` with your converted data

4. **Run test**: Execute `npm run test` to see how the action would review your actual PR

### Test Data Structure

Test files in `scripts/test-data/` follow this structure:

```javascript
module.exports = {
  title: "PR title",
  description: "PR description", 
  files: [
    {
      filename: "path/to/file.js",
      status: "modified", // "added", "modified", "deleted"
      additions: 10,
      deletions: 5,
      patch: `@@ -1,5 +1,10 @@
// Git diff patch format
-old line
+new line`
    }
  ],
  commitMessages: [
    "commit message 1",
    "commit message 2"
  ]
};
```

### Available Test Scenarios

- **`small-pr.js`**: Small authentication bug fix (tests holistic analysis)
- **`custom-pr.js`**: Your custom PR data (replace with real PR data)
- **`large-pr.js`**: Large API refactor (tests batch processing)

### Troubleshooting

- **No AI response**: Ensure API keys are correctly set in `scripts/test.sh`
- **Prompt too long**: Large PRs automatically use batch processing
- **Invalid test data**: Ensure your converted PR data matches the required format
- **Missing dependencies**: Run `npm install` before testing