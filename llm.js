import process from "process";

const DEFAULT_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-pro";

function getApiKey() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    console.error("[LLM] GEMINI_API_KEY is not set in environment variables");
    throw new Error("Missing GEMINI_API_KEY.");
  }
  console.log("[LLM] API key found, using model:", process.env.GEMINI_MODEL || DEFAULT_MODEL);
  return key;
}

/**
 * @param {string} prompt
 * @param {{responseMimeType?: string, temperature?: number}=} options
 */
async function callGemini(prompt, options = {}) {
  const apiKey = getApiKey();
  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const maxAttempts = 5;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    console.log(
      `[LLM] Calling Gemini API with model: ${model}, prompt length: ${prompt.length} chars, attempt ${attempt}/${maxAttempts}`,
    );

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: options.temperature ?? 0.2,
          responseMimeType: options.responseMimeType,
        },
      }),
    });

    if (response.ok) {
      const payload = await response.json();
      const text = payload?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n")?.trim();
      if (!text) {
        console.error("[LLM] Gemini API returned empty content");
        throw new Error("Gemini API returned empty content.");
      }

      console.log(`[LLM] Successfully received response, length: ${text.length} chars`);
      return text;
    }

    const bodyText = await response.text();
    const retryable = response.status === 429 || response.status === 503 || response.status >= 500;
    console.error(`[LLM] Gemini API request failed with status ${response.status}:`, bodyText);

    if (!retryable || attempt === maxAttempts) {
      throw new Error(`Gemini API failed (${response.status}): ${bodyText}`);
    }

    const waitMs = 1000 * 2 ** (attempt - 1);
    console.log(`[LLM] Retryable failure, backing off for ${waitMs}ms`);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  throw new Error("Gemini API request did not complete successfully.");
}

function extractJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    // Continue to fenced JSON extraction below.
  }

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) {
    return JSON.parse(fenced[1]);
  }

  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) {
    return JSON.parse(text.slice(first, last + 1));
  }

  throw new Error("Model did not return valid JSON content.");
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
  return extractJson(content);
}

/**
 * @param {string} taskTitle
 * @param {string} taskDescription
 * @param {Object<string, any>} repoContext
 */
export async function generateTaskOutput(taskTitle, taskDescription, repoContext = {}) {
  const prompt = [
    "You are a senior JavaScript engineer.",
    "Return strict JSON only.",
    "Schema:",
    "{",
    '  "write": true,',
    '  "path": "src/example.js",',
    '  "content": "full file content here",',
    '  "message": "feat: implement ...",',
    '  "summary": "what changed and why"',
    "}",
    "Rules:",
    "- If task should not modify repository, set write=false and leave path/content empty strings.",
    "- content must be the full target file content, no markdown fences.",
    "- message must be a concise commit message.",
    "",
    `Task title: ${taskTitle}`,
    `Task description: ${taskDescription}`,
    "Repository context (JSON):",
    JSON.stringify(repoContext, null, 2),
  ].join("\n");

  const content = await callGemini(prompt, { responseMimeType: "application/json", temperature: 0.2 });
  return extractJson(content);
}
