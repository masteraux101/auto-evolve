#!/usr/bin/env node

import process from "process";
import dotenv from "dotenv";

dotenv.config();

const OWNER = "masteraux101";
const REPO = "auto-evolve";
const WORKFLOW_FILE = "local-auto-evolve.yml";
const SOURCE_REF = "main";
const TARGET_BRANCH = "dev";
const POLL_INTERVAL_MS = 8000;
const MAX_WAIT_MS = 15 * 60 * 1000;

// Instruction to trigger PR creation feature
const PR_CREATION_PROMPT =
  "Implement a new feature to automatically create pull requests via GitHub API. " +
  "The feature should: 1) Generate a meaningful commit with code changes, " +
  "2) Create a new branch from dev, 3) Push changes to the branch, " +
  "4) Create a pull request to merge back into dev with descriptive title and body. " +
  "Report the PR number and URL in the task output.";

function getToken() {
  const token = process.env.GITHUB_TOKEN || process.env.GH_PAT;
  if (!token) {
    throw new Error("Missing GITHUB_TOKEN or GH_PAT in .env");
  }
  return token;
}

async function githubRequest(path, { method = "GET", body, token, accept } = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: accept || "application/vnd.github+json",
      "Content-Type": "application/json",
      "User-Agent": "auto-evolve-pr-test",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub API ${method} ${path} failed (${response.status}): ${text}`);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

async function triggerWorkflow(token) {
  console.log("[1/6] Triggering workflow_dispatch with PR creation prompt...");
  const startedAt = new Date().toISOString();

  await githubRequest(
    `/repos/${OWNER}/${REPO}/actions/workflows/${WORKFLOW_FILE}/dispatches`,
    {
      method: "POST",
      token,
      body: {
        ref: SOURCE_REF,
        inputs: {
          user_prompt: PR_CREATION_PROMPT,
          target_repository: `${OWNER}/${REPO}`,
          target_branch: TARGET_BRANCH,
          issue_number: "",
        },
      },
    },
  );

  console.log(`[ok] Workflow dispatched on ref=${SOURCE_REF}, target_branch=${TARGET_BRANCH}`);
  console.log(`[ok] Prompt: "${PR_CREATION_PROMPT.substring(0, 80)}..."`);
  return startedAt;
}

async function findTriggeredRun(token, startedAt) {
  console.log("[2/6] Locating the newly triggered run...");
  const startTime = Date.now();
  let attemptCount = 0;

  while (Date.now() - startTime < MAX_WAIT_MS) {
    attemptCount++;
    const runs = await githubRequest(
      `/repos/${OWNER}/${REPO}/actions/runs?event=workflow_dispatch&branch=${SOURCE_REF}&per_page=20`,
      { token },
    );

    const sortedRuns = (runs.workflow_runs || []).sort((a, b) => 
      new Date(b.created_at) - new Date(a.created_at)
    );

    const candidate = sortedRuns.find(
      (run) => new Date(run.created_at) >= new Date(startedAt),
    );

    if (candidate) {
      console.log(`[ok] Run found on attempt ${attemptCount}: #${candidate.run_number} id=${candidate.id}`);
      console.log(`     URL: ${candidate.html_url}`);
      return candidate;
    }

    if (attemptCount <= 3) {
      console.log(`     [attempt ${attemptCount}] no new run yet, retrying...`);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new Error("Timed out while waiting for new workflow run to appear.");
}

async function waitForRunCompletion(token, runId) {
  console.log("[3/6] Waiting for run completion...");
  const startTime = Date.now();

  while (Date.now() - startTime < MAX_WAIT_MS) {
    const run = await githubRequest(
      `/repos/${OWNER}/${REPO}/actions/runs/${runId}`,
      { token },
    );

    console.log(`     status=${run.status}, conclusion=${run.conclusion || "N/A"}`);

    if (run.status === "completed") {
      return run;
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new Error("Timed out while waiting for run completion.");
}

async function downloadJobLog(token, jobId) {
  const response = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/actions/jobs/${jobId}/logs`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "auto-evolve-pr-test",
    },
    redirect: "follow",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to download logs for job ${jobId} (${response.status}): ${text}`);
  }

  return response.text();
}

function extractErrorLines(logText) {
  const lines = logText.split("\n");
  return lines.filter((line) =>
    /(error|failed|exception|traceback|ReferenceError|TypeError|SyntaxError)/i.test(line),
  );
}

async function analyzeRunLogs(token, runId) {
  console.log("[4/6] Fetching jobs and logs...");
  const jobsPayload = await githubRequest(
    `/repos/${OWNER}/${REPO}/actions/runs/${runId}/jobs?per_page=20`,
    { token },
  );

  const jobs = jobsPayload.jobs || [];
  const summaries = [];

  for (const job of jobs) {
    console.log(`     job: ${job.name} -> ${job.conclusion || job.status}`);
    let errorLines = [];
    let fullLog = "";
    try {
      fullLog = await downloadJobLog(token, job.id);
      errorLines = extractErrorLines(fullLog).slice(0, 15);
    } catch (error) {
      errorLines = [`Log download failed: ${error.message}`];
    }

    summaries.push({
      id: job.id,
      name: job.name,
      status: job.status,
      conclusion: job.conclusion,
      htmlUrl: job.html_url,
      errorLines,
      fullLog,
    });
  }

  return summaries;
}

async function checkForCreatedPRs(token, sinceTime) {
  console.log("[5/6] Checking for newly created pull requests...");
  
  const prs = await githubRequest(
    `/repos/${OWNER}/${REPO}/pulls?state=all&per_page=10`,
    { token },
  );

  const newPRs = (prs || []).filter(pr => {
    const prCreatedAt = new Date(pr.created_at);
    return prCreatedAt >= new Date(sinceTime);
  });

  if (newPRs.length === 0) {
    console.log("[!] No new PRs detected since workflow started");
    return [];
  }

  console.log(`[ok] Found ${newPRs.length} new PR(s):`);
  for (const pr of newPRs) {
    console.log(
      `     PR #${pr.number}: "${pr.title}"`
        + ` (${pr.head.ref} -> ${pr.base.ref})`
    );
    console.log(`     URL: ${pr.html_url}`);
    console.log(`     State: ${pr.state}, Merged: ${pr.merged}`);
  }

  return newPRs;
}

function printReport(run, jobSummaries, createdPRs) {
  console.log("[6/6] Final report");
  console.log("========================================");
  console.log(`Run: #${run.run_number} (id=${run.id})`);
  console.log(`Branch(ref): ${run.head_branch}`);
  console.log(`Status: ${run.status}`);
  console.log(`Conclusion: ${run.conclusion}`);
  console.log(`URL: ${run.html_url}`);
  console.log("----------------------------------------");

  console.log("\n📋 Job Summary:");
  for (const job of jobSummaries) {
    console.log(`  • ${job.name}: ${job.conclusion || job.status}`);
    if (job.errorLines.length > 0) {
      console.log("    ⚠️  Errors found:");
      for (const line of job.errorLines.slice(0, 5)) {
        console.log(`       ${line.substring(0, 120)}`);
      }
    }
  }

  console.log("\n🔍 PR Creation Result:");
  if (createdPRs.length === 0) {
    console.log("  ❌ NO PULL REQUESTS CREATED");
    console.log("     (Expected: PR creation feature should have generated at least 1 PR)");
  } else {
    console.log(`  ✅ ${createdPRs.length} PULL REQUEST(S) CREATED`);
    for (const pr of createdPRs) {
      console.log(`     • PR #${pr.number}: ${pr.title}`);
      console.log(`       ${pr.head.ref} → ${pr.base.ref}`);
    }
  }

  console.log("========================================");
  
  // Final verdict
  if (run.conclusion === "success" && createdPRs.length > 0) {
    console.log("\n✨ TEST PASSED: Workflow succeeded and PR(s) were created!");
    return 0;
  } else if (run.conclusion === "success" && createdPRs.length === 0) {
    console.log("\n⚠️  TEST PARTIAL: Workflow succeeded but NO PRs created");
    return 1;
  } else {
    console.log("\n❌ TEST FAILED: Workflow did not succeed");
    return 1;
  }
}

async function main() {
  const token = getToken();
  const startedAt = await triggerWorkflow(token);
  const triggeredRun = await findTriggeredRun(token, startedAt);
  const completedRun = await waitForRunCompletion(token, triggeredRun.id);
  const jobSummaries = await analyzeRunLogs(token, completedRun.id);
  const createdPRs = await checkForCreatedPRs(token, startedAt);
  const exitCode = printReport(completedRun, jobSummaries, createdPRs);

  process.exitCode = exitCode;
}

main().catch((error) => {
  console.error("❌ Script failed:", error.message);
  process.exit(1);
});
