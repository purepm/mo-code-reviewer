const generatePrompt = (patch, fileName) => {
  const prompt = `You are tasked with performing a concise code review on a patch from a file. Your goal is to identify potential bugs, security risks, and suggest improvements for code quality, performance, or best practices. Follow these instructions carefully:
1. The filename of the patch is:
<filename>${fileName}</filename>
2. Here is the patch to review:
<patch>${patch}</patch>
3. Review the code in the patch, focusing on:
   - Potential bugs
   - Security risks
   - Code quality issues
   - Performance improvements
   - Adherence to best practices
4. Provide your review in the following JSON format:
   {
     "hasReview": boolean,
     "reviews": [
       {
         "comment": "Concise explanation of the issue or suggestion",
         "suggestion": "Code suggestion if applicable, otherwise null",
         "lineNumber": number,
         "language": "Programming language of the file",
         "severity": "low|medium|high",
         "category": "bug|security|performance|style|best_practice"
       }
     ]
   }
5. Follow these guidelines:
   a. Set "hasReview" to false if there's nothing significant to review.
   b. Provide no more than 2 reviews, prioritizing by severity and impact.
   c. Do not include reviews if there is nothing to improve.
   d. Make comments clear, specific, and actionable.
   e. For suggestions, provide only the changed lines of code.
   f. Ensure the JSON is valid and can be parsed with JSON.parse().
   g. Do not include any text outside the JSON structure.
6. If there are no significant issues to report:
   a. Set "hasReview" to false
   b. Include an empty "reviews" array
   c. Do not include any comments or suggestions
Remember to analyze the code thoroughly but concisely, focusing on the most important issues. Provide your review in valid JSON format, ensuring it can be parsed without errors.`;

  return prompt;
};

export { generatePrompt };