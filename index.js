import process from "process";
import { buildFinalOutput, buildPlannerGraph } from "./graph.js";
import { createInitialState } from "./state.js";

function getUserPromptFromEnv() {
  const explicitPrompt = process.env.USER_PROMPT;
  if (explicitPrompt && explicitPrompt.trim().length > 0) {
    return explicitPrompt.trim();
  }

  const issueTitle = process.env.ISSUE_TITLE ?? "";
  const issueBody = process.env.ISSUE_BODY ?? "";
  const merged = [issueTitle, issueBody].filter(Boolean).join("\n\n").trim();
  return merged || "No prompt provided.";
}

async function postResultToGitHubIssue(issueNumber, body) {
  const token = process.env.GITHUB_TOKEN;
  const repository = process.env.TARGET_REPOSITORY || process.env.GITHUB_REPOSITORY;
  if (!token || !repository) {
    console.log("[Index] skip GitHub writeback - missing GITHUB_TOKEN or repository env");
    return;
  }

  const [owner, repo] = repository.split("/");
  if (!owner || !repo) {
    console.log("[Index] skip GitHub writeback - invalid repository env");
    return;
  }

  console.log("[Index] writing summary comment back to GitHub issue", { issueNumber });

  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/comments`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "User-Agent": "auto-evolve-js-agent",
    },
    body: JSON.stringify({ body }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub comment failed (${response.status}): ${text}`);
  }
}

async function main() {
  const issueNumber = process.env.ISSUE_NUMBER ?? "manual";
  const userPrompt = getUserPromptFromEnv();

  console.log("[Index] start", {
    issueNumber,
    promptLength: userPrompt.length,
    targetRepository: process.env.TARGET_REPOSITORY || process.env.GITHUB_REPOSITORY || "",
  });

  const graph = buildPlannerGraph();
  const initialState = createInitialState();
  initialState.userPrompt = userPrompt;

  const finalState = await graph.invoke(initialState);
  const summary = buildFinalOutput(finalState);

  console.log("[Index] final state summary\n", summary);

  const writeBackEnabled = process.env.WRITE_BACK_TO_ISSUE === "true";
  if (writeBackEnabled && issueNumber !== "manual") {
    const body = ["## Planner/Worker Agent Run Result", "", "```json", summary, "```"].join("\n");
    await postResultToGitHubIssue(issueNumber, body);
    console.log("[Index] GitHub issue comment posted");
  }

  console.log("[Index] done");
}

main().catch((error) => {
  console.error("[Index] fatal error", error);
  process.exitCode = 1;
});
