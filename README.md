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
        uses: purepm/mo-code-reviewer@v1.0.0
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          trigger-label: 'mo-review'
```