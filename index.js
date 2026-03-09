import process from "process";
import { buildFinalOutput, buildPlannerGraph } from "./graph.js";
import { createInitialState } from "./state.js";
import { createBranch, createPullRequest } from "./core/github-tools.js";

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

async function createAndSubmitPR(result) {
  const token = process.env.GITHUB_TOKEN;
  const repository = process.env.TARGET_REPOSITORY || process.env.GITHUB_REPOSITORY;
  const targetBranch = process.env.TARGET_BRANCH || "dev";

  if (!token || !repository) {
    console.log("[Index] skip PR creation - missing GITHUB_TOKEN or repository env");
    return null;
  }

  // Check if there are any successful task completions
  const hasTasksCompleted = result.tasks && result.tasks.length > 0 && 
    result.tasks.some(task => task.status === "completed");

  if (!hasTasksCompleted) {
    console.log("[Index] skip PR creation - no tasks completed or no result.tasks");
    return null;
  }

  const [owner, repo] = repository.split("/");
  if (!owner || !repo) {
    console.log("[Index] skip PR creation - invalid repository env");
    return null;
  }

  try {
    // Generate a unique branch name
    const timestamp = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 12);
    const featureBranch = `auto-evolve/feature-${timestamp}`;

    console.log(`[Index] creating PR - branch: ${featureBranch} -> ${targetBranch}`);

    // Create feature branch from target branch
    await createBranch(owner, repo, featureBranch, targetBranch);
    console.log(`[Index] feature branch created: ${featureBranch}`);

    // Create at least one dummy commit to make the PR valid
    // Get the latest commit SHA from the base branch to use as parent
    const branchRef = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${targetBranch}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
        },
      }
    ).then(r => r.json());

    if (!branchRef.object || !branchRef.object.sha) {
      throw new Error("Failed to get base branch ref");
    }

    const baseSha = branchRef.object.sha;

    // Create a dummy commit with workflow summary
    const commitMessage = `Auto-Evolve: Generated Implementation\n\n${buildFinalOutput(result).substring(0, 200)}`;
    const commitTree = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/commits/${baseSha}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
        },
      }
    ).then(r => r.json()).then(c => c.tree.sha);

    const newCommit = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/commits`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: commitMessage,
          tree: commitTree,
          parents: [baseSha],
        }),
      }
    ).then(r => r.json());

    // Update feature branch to point to new commit
    await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${featureBranch}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sha: newCommit.sha,
          force: false,
        }),
      }
    );

    console.log(`[Index] added commit to feature branch: ${newCommit.sha.substring(0, 7)}`);

    // Create pull request
    const prTitle = `Auto-Evolve: Generated Implementation (${new Date().toLocaleDateString()})`;
    const tasksSummary = result.tasks
      ? result.tasks.map(t => `- ${t.title}: ${t.status}`).join("\n")
      : "No tasks";
      
    const prBody = 
      `## Automated PR Creation\n\n` +
      `This PR contains automatically generated changes based on the user prompt.\n\n` +
      `### Generated Tasks\n${tasksSummary}\n\n` +
      `### Summary\n${buildFinalOutput(result).substring(0, 300)}...\n\n` +
      `Generated by auto-evolve workflow on ${new Date().toISOString()}.`;

    const pullRequest = await createPullRequest(owner, repo, prTitle, featureBranch, targetBranch, prBody);
    console.log(`[Index] ✅ PR created successfully: ${pullRequest.html_url}`);
    return pullRequest;
  } catch (error) {
    console.warn(`[Index] ⚠️  PR creation failed (non-fatal): ${error.message}`);
    return null;
  }
}

async function main() {
  console.log("[Index] start planner/worker run");

  const graph = buildPlannerGraph();
  const state = createInitialState();
  state.userPrompt = getUserPromptFromEnv();

  const result = await graph.invoke(state, {
    recursionLimit: Number(process.env.GRAPH_RECURSION_LIMIT || 200),
  });
  const output = buildFinalOutput(result);

  console.log("[Index] final output:");
  console.log(output);

  const issueNumberRaw = process.env.ISSUE_NUMBER;
  const shouldWriteBack = String(process.env.WRITE_BACK_TO_ISSUE || "false").toLowerCase() === "true";
  if (shouldWriteBack && issueNumberRaw) {
    const issueNumber = Number(issueNumberRaw);
    if (Number.isInteger(issueNumber) && issueNumber > 0) {
      await postResultToGitHubIssue(issueNumber, output);
      console.log("[Index] writeback complete");
    } else {
      console.log("[Index] skip writeback - invalid ISSUE_NUMBER");
    }
  }

  // Attempt to create PR if tasks were completed
  const pr = await createAndSubmitPR(result);
  if (pr) {
    console.log(`[Index] 📝 PR submission: #${pr.number} - ${pr.html_url}`);
  }

  if (result.error) {
    throw new Error(`Planner/Worker ended with error: ${result.error}`);
  }

  console.log("[Index] run completed");
}

main().catch((error) => {
  console.error("[Index] fatal error", error);
  process.exit(1);
});
