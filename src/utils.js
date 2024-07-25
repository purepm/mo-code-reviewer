const generatePrompt = (patch, fileName) => {
  const prompt = `Perform a concise code review on the following patch from file "${fileName}". Identify potential bugs, security risks, and suggest improvements for code quality, performance, or best practices. Respond in the following JSON format:

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

  Guidelines:
  1. Set "hasReview" to false if there's nothing significant to review.
  2. Provide no more than 3 reviews, prioritizing by severity and impact.
  3. Make comments clear, specific, and actionable.
  4. For suggestions, provide only the changed lines of code.
  5. Ensure the JSON is valid and can be parsed with JSON.parse().
  6. Do not include any text outside the JSON structure.

  Patch:
  ${patch}`;

  return prompt;
};

export { generatePrompt };