import process from "process";

const DEFAULT_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-pro";

function getApiKey() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error("Missing GEMINI_API_KEY.");
  }
  return key;
}

/**
 * @param {string} prompt
 * @param {{responseMimeType?: string, temperature?: number}=} options
 */
async function callGemini(prompt, options = {}) {
  const apiKey = getApiKey();
  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: options.temperature ?? 0.2,
        responseMimeType: options.responseMimeType,
      },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gemini API failed (${response.status}): ${text}`);
  }

  const payload = await response.json();
  const text = payload?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n")?.trim();
  if (!text) {
    throw new Error("Gemini API returned empty content.");
  }

  return text;
}

/**
 * @param {string} userPrompt
 * @param {string[]} newRequirements
 */
export async function generatePlan(userPrompt, newRequirements) {
  const prompt = [
    "You are a software planner for a Planner/Worker agent.",
    "Return strict JSON only.",
    "Schema:",
    "{",
    '  "tasks": [{"id":"task-1","title":"...","description":"...","milestoneId":"ms-1","status":"pending","toolAction":null,"toolInput":{}}],',
    '  "milestones": [{"id":"ms-1","title":"...","tests":["..."]}]',
    "}",
    "Rules:",
    "- At least 3 tasks.",
    "- Use toolAction only when task must interact with GitHub repo.",
    "- toolAction allowed: read_file, list_directory, upsert_file, delete_file, create_issue, list_issues, comment_issue, null.",
    "- Keep each title <= 80 chars.",
    "",
    "User prompt:",
    userPrompt,
    "",
    "New requirements:",
    JSON.stringify(newRequirements),
  ].join("\n");

  const content = await callGemini(prompt, { responseMimeType: "application/json", temperature: 0.1 });
  return JSON.parse(content);
}

/**
 * @param {string} taskTitle
 * @param {string} taskDescription
 * @param {Object<string, any>} repoContext
 */
export async function generateTaskOutput(taskTitle, taskDescription, repoContext = {}) {
  const prompt = [
    "You are a senior JavaScript engineer.",
    "Generate concise implementation output in markdown with code blocks when needed.",
    "Include what changed and why.",
    "",
    `Task title: ${taskTitle}`,
    `Task description: ${taskDescription}`,
    "Repository context (JSON):",
    JSON.stringify(repoContext, null, 2),
  ].join("\n");

  return callGemini(prompt, { temperature: 0.2 });
}
