/**
 * Large PR mock data - Major API refactor
 * Used for testing batch processing on large PRs
 */

module.exports = {
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
};
