#!/usr/bin/env node

/**
 * Local testing script for mo-code-reviewer
 * This simulates the GitHub Action environment for local development
 */

const core = require('@actions/core');
const config = require('../src/config');
const {
  generateComprehensivePrompt,
  generateBatchPrompt,
  calculatePRComplexity,
  createFileBatches
} = require('../src/utils');
const { initializeAI, getAIService } = require('../src/services/ai');
const mockPRData = require('./test-data');

// Mock GitHub Action inputs
const mockInputs = {
  'github-token': process.env.GITHUB_TOKEN || 'mock-token',
  'anthropic-api-key': process.env.ANTHROPIC_API_KEY || '',
  'openai-api-key': process.env.OPENAI_API_KEY || '',
  'openrouter-api-key': process.env.OPENROUTER_API_KEY || '',
  'trigger-label': 'mo-review',
  'ai-provider': process.env.AI_PROVIDER || 'anthropic',
  'severity': process.env.SEVERITY || 'low|medium|high',
  'openrouter-ai-model': process.env.OPENROUTER_AI_MODEL || ''
};

// Mock core.getInput
core.getInput = (name, options) => {
  const value = mockInputs[name];
  if (options?.required && !value) {
    throw new Error(`Input required and not supplied: ${name}`);
  }
  return value || '';
};

// Mock core logging
core.info = (message) => console.log(`ℹ️  ${message}`);
core.warning = (message) => console.log(`⚠️  ${message}`);
core.error = (message) => console.log(`❌ ${message}`);

// Mock PR data is now imported from separate files in ./test-data/

async function testHolisticAnalysis(prData) {
  console.log('\n🔍 Testing Holistic Analysis');
  console.log('================================');

  const complexity = calculatePRComplexity(prData.files);
  console.log(`📊 PR Complexity:`, complexity);

  if (complexity.canProcessHolistic) {
    console.log('✅ Using holistic analysis');

    const prContext = {
      title: prData.title,
      description: prData.description,
      files: prData.files,
      commitMessages: prData.commitMessages
    };

    const prompt = generateComprehensivePrompt(prContext);
    console.log(`📝 Prompt length: ${prompt.length} characters`);
    console.log(`📄 First 200 chars: ${prompt.substring(0, 200)}...`);

    if (process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY) {
      try {
        console.log('🤖 Calling AI for review...');
        await initializeAI();
        const aiService = getAIService();
        const review = await aiService.getReview(prompt);
        console.log('✅ AI Review Result:', JSON.stringify(review, null, 2));
      } catch (error) {
        console.log('❌ AI call failed:', error.message);
      }
    } else {
      console.log('⚠️  No AI API key provided, skipping actual AI call');
      console.log('💡 Set ANTHROPIC_API_KEY or OPENAI_API_KEY or OPENROUTER_API_KEY to test AI integration');
    }
  } else {
    console.log('📦 Would use batch processing');
    testBatchProcessing(prData);
  }
}

function testBatchProcessing(prData) {
  console.log('\n📦 Testing Batch Processing');
  console.log('=============================');

  const batches = createFileBatches(prData.files);
  console.log(`📊 Created ${batches.length} batches`);

  batches.forEach((batch, index) => {
    console.log(`\n📁 Batch ${index + 1}:`);
    console.log(`   Files: ${batch.length}`);
    console.log(`   Names: ${batch.map(f => f.filename).join(', ')}`);

    const batchContext = {
      title: prData.title,
      description: prData.description,
      files: batch,
      commitMessages: prData.commitMessages,
      relatedFiles: `This is batch ${index + 1} of ${batches.length} in a larger PR`
    };

    const prompt = generateBatchPrompt(batchContext);
    console.log(`   Prompt length: ${prompt.length} characters`);
  });
}

function testLimits() {
  console.log('\n⚙️  Testing Limits Configuration');
  console.log('=================================');
  console.log('Current limits:', config.LIMITS);

  // Test edge cases
  const testCases = [
    { name: 'Small PR', files: 3, totalLines: 150 },
    { name: 'Medium PR', files: 10, totalLines: 800 },
    { name: 'Large PR', files: 20, totalLines: 3000 },
    { name: 'Huge PR', files: 50, totalLines: 10000 }
  ];

  testCases.forEach(testCase => {
    const mockFiles = Array.from({ length: testCase.files }, (_, i) => ({
      filename: `file${i}.js`,
      patch: 'x'.repeat(Math.floor(testCase.totalLines / testCase.files))
    }));

    const complexity = calculatePRComplexity(mockFiles);
    console.log(`\n${testCase.name}:`);
    console.log(`  Files: ${complexity.fileCount}, Lines: ${complexity.totalLines}`);
    console.log(`  Strategy: ${complexity.canProcessHolistic ? 'Holistic' : 'Batching'}`);
  });
}

async function main() {
  console.log('🧪 mo-code-reviewer Local Testing');
  console.log('==================================');

  // Test limits and configuration
  testLimits();

  // Test with small PR (holistic)
  // await testHolisticAnalysis(mockPRData.small);

  // Test with accounting PR (holistic)
  await testHolisticAnalysis(mockPRData.custom);

  // Test with large PR (batching)
  // await testHolisticAnalysis(mockPRData.large);

  console.log('\n✅ Testing completed!');
  console.log('\n💡 Tips:');
  console.log('   - Set ANTHROPIC_API_KEY or OPENAI_API_KEY or OPENROUTER_API_KEY to test AI integration');
  console.log('   - Set AI_PROVIDER=openai to test OpenAI instead of Anthropic');
  console.log('   - Set AI_PROVIDER=openrouter to test OpenRouter instead of Anthropic');
  console.log('   - Modify files in ./test-data/ to test different scenarios');
  console.log('   - Add new PR test cases by creating files in ./test-data/ and updating the index.js');
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { mockPRData, testHolisticAnalysis, testBatchProcessing, testLimits };
