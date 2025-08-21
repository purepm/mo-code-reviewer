#!/bin/bash
export ANTHROPIC_API_KEY="your-api-key-here"

# Local testing script for mo-code-reviewer
echo "🧪 mo-code-reviewer Local Testing Setup"
echo "======================================="

# Check if API keys are set
if [ -z "$ANTHROPIC_API_KEY" ] && [ -z "$OPENAI_API_KEY" ]; then
    echo "⚠️  No AI API keys found in environment"
    echo "💡 To test AI integration, set one of:"
    echo "   export ANTHROPIC_API_KEY='your-key-here'"
    echo "   export OPENAI_API_KEY='your-key-here'"
    echo ""
fi

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Run the test
echo "🚀 Running local tests..."
node scripts/test-local.js

echo ""
echo "🔧 Other testing options:"
echo "   npm run build          # Test the build process"
echo "   node scripts/test-local.js      # Run tests again"
echo "   AI_PROVIDER=openai node scripts/test-local.js  # Test with OpenAI"
