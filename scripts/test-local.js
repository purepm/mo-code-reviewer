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

// Mock GitHub Action inputs
const mockInputs = {
  'github-token': process.env.GITHUB_TOKEN || 'mock-token',
  'anthropic-api-key': process.env.ANTHROPIC_API_KEY || '',
  'openai-api-key': process.env.OPENAI_API_KEY || '',
  'trigger-label': 'mo-review',
  'ai-provider': process.env.AI_PROVIDER || 'anthropic',
  'severity': 'low|medium|high'
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

// Sample PR data for testing
const mockPRData = {
  small: {
    title: "Fix user authentication bug",
    description: "This PR fixes a critical bug in the user authentication flow where tokens were not being validated properly.",
    files: [
      {
        filename: "src/auth.js",
        status: "modified",
        additions: 5,
        deletions: 2,
        patch: `@@ -10,7 +10,10 @@ function validateToken(token) {
   if (!token) {
     return false;
   }
-  return jwt.verify(token, process.env.JWT_SECRET);
+  try {
+    return jwt.verify(token, process.env.JWT_SECRET);
+  } catch (error) {
+    console.error('Token validation failed:', error);
+    return false;
+  }
 }`
      },
      {
        filename: "src/middleware.js",
        status: "modified", 
        additions: 3,
        deletions: 1,
        patch: `@@ -15,6 +15,8 @@ function authMiddleware(req, res, next) {
   const token = req.headers.authorization?.split(' ')[1];
   
   if (!validateToken(token)) {
+    console.log('Authentication failed for request:', req.path);
     return res.status(401).json({ error: 'Unauthorized' });
   }
   
   next();
 }`
      }
    ],
    commitMessages: [
      "fix: add proper error handling to token validation",
      "feat: add logging for failed authentication attempts"
    ]
  },
  large: {
    title: "Major refactor: Update API endpoints and database schema",
    description: "This PR includes a major refactor of our API endpoints and updates the database schema to support new features.",
    files: Array.from({ length: 20 }, (_, i) => ({
      filename: `src/api/endpoint${i + 1}.js`,
      status: "modified",
      additions: Math.floor(Math.random() * 50) + 10,
      deletions: Math.floor(Math.random() * 20) + 5,
      patch: `@@ -1,10 +1,15 @@
 const express = require('express');
 const router = express.Router();
 
+// Updated endpoint ${i + 1}
 router.get('/endpoint${i + 1}', async (req, res) => {
-  // Old implementation
-  const data = await getData();
+  try {
+    // New implementation with error handling
+    const data = await getData();
+    res.json({ success: true, data });
+  } catch (error) {
+    res.status(500).json({ error: error.message });
+  }
-  res.json(data);
 });
 
 module.exports = router;`
    })),
    commitMessages: [
      "refactor: update all API endpoints with proper error handling",
      "feat: add consistent response format across all endpoints",
      "fix: handle edge cases in data retrieval"
    ]
  }
};

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
    
          if (process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY) {
        try {
          console.log('🤖 Calling AI for review...');
          await initializeAI(process.env.AI_PROVIDER || 'anthropic');
          const aiService = getAIService();
          const review = await aiService.getReview(prompt);
          console.log('✅ AI Review Result:', JSON.stringify(review, null, 2));
        } catch (error) {
          console.log('❌ AI call failed:', error.message);
        }
      } else {
        console.log('⚠️  No AI API key provided, skipping actual AI call');
        console.log('💡 Set ANTHROPIC_API_KEY or OPENAI_API_KEY to test AI integration');
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
  await testHolisticAnalysis(mockPRData.small);
  
  // Test with large PR (batching)
  await testHolisticAnalysis(mockPRData.large);
  
  console.log('\n✅ Testing completed!');
  console.log('\n💡 Tips:');
  console.log('   - Set ANTHROPIC_API_KEY or OPENAI_API_KEY to test AI integration');
  console.log('   - Set AI_PROVIDER=openai to test OpenAI instead of Anthropic');
  console.log('   - Modify mockPRData in this script to test different scenarios');
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { mockPRData, testHolisticAnalysis, testBatchProcessing, testLimits };
