/**
 * Small PR mock data - Authentication bug fix
 * Used for testing holistic analysis on small PRs
 */

module.exports = {
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
};
