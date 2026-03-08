#!/usr/bin/env node

import process from "process";
import dotenv from "dotenv";

dotenv.config();

const OWNER = "masteraux101";
const REPO = "auto-evolve";
const WORKFLOW_FILE = "local-auto-evolve.yml";
const SOURCE_REF = "dev";
const TARGET_BRANCH = "dev-gened";
const POLL_INTERVAL_MS = 8000;
const MAX_WAIT_MS = 15 * 60 * 1000;

function getToken() {
  const token = process.env.GITHUB_TOKEN || process.env.GH_PAT;
  if (!token) {
    throw new Error("Missing GITHUB_TOKEN or GH_PAT in .env");
  }
  return token;
}

function getPrompt() {
  if (process.env.USER_PROMPT && process.env.USER_PROMPT.trim()) {
    return process.env.USER_PROMPT.trim();
  }
  return "Run planner/worker on dev code and write output to dev-gened branch, then report failures.";
}

async function githubRequest(path, { method = "GET", body, token, accept } = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: accept || "application/vnd.github+json",
      "Content-Type": "application/json",
      "User-Agent": "auto-evolve-trigger-analyzer",
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
  console.log("[1/5] Triggering workflow_dispatch...");
  const startedAt = new Date().toISOString();

  await githubRequest(
    `/repos/${OWNER}/${REPO}/actions/workflows/${WORKFLOW_FILE}/dispatches`,
    {
      method: "POST",
      token,
      body: {
        ref: SOURCE_REF,
        inputs: {
          user_prompt: getPrompt(),
          target_repository: `${OWNER}/${REPO}`,
          target_branch: TARGET_BRANCH,
          issue_number: "",
        },
      },
    },
  );

  console.log(`[ok] Workflow dispatched on ref=${SOURCE_REF}, target_branch=${TARGET_BRANCH}`);
  return startedAt;
}

async function findTriggeredRun(token, startedAt) {
  console.log("[2/5] Locating the newly triggered run...");
  const startTime = Date.now();

  while (Date.now() - startTime < MAX_WAIT_MS) {
    const runs = await githubRequest(
      `/repos/${OWNER}/${REPO}/actions/workflows/${WORKFLOW_FILE}/runs?event=workflow_dispatch&branch=${SOURCE_REF}&per_page=10`,
      { token },
    );

    const candidate = (runs.workflow_runs || []).find(
      (run) => run.created_at >= startedAt,
    );

    if (candidate) {
      console.log(`[ok] Run found: #${candidate.run_number} id=${candidate.id}`);
      console.log(`     URL: ${candidate.html_url}`);
      return candidate;
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new Error("Timed out while waiting for new workflow run to appear.");
}

async function waitForRunCompletion(token, runId) {
  console.log("[3/5] Waiting for run completion...");
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
      "User-Agent": "auto-evolve-trigger-analyzer",
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

function summarizeIssues(jobSummaries) {
  const issueHints = [];
  const allErrorText = jobSummaries
    .flatMap((job) => job.errorLines)
    .join("\n");

  if (/require is not defined in ES module scope/i.test(allErrorText)) {
    issueHints.push("ESM/CommonJS mixed usage still exists (require used under type=module).");
  }
  if (/Cannot find package|ERR_MODULE_NOT_FOUND/i.test(allErrorText)) {
    issueHints.push("Missing dependency or wrong import path in runtime environment.");
  }
  if (/Process completed with exit code 1/i.test(allErrorText)) {
    issueHints.push("Workflow exits hard on first runtime error; add preflight checks and graceful diagnostics.");
  }

  return issueHints;
}

async function analyzeRunLogs(token, runId) {
  console.log("[4/5] Fetching jobs and logs...");
  const jobsPayload = await githubRequest(
    `/repos/${OWNER}/${REPO}/actions/runs/${runId}/jobs?per_page=20`,
    { token },
  );

  const jobs = jobsPayload.jobs || [];
  const summaries = [];

  for (const job of jobs) {
    console.log(`     job: ${job.name} -> ${job.conclusion || job.status}`);
    let errorLines = [];
    try {
      const logText = await downloadJobLog(token, job.id);
      errorLines = extractErrorLines(logText).slice(0, 30);
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
    });
  }

  return summaries;
}

function printReport(run, jobSummaries) {
  console.log("[5/5] Analysis report");
  console.log("----------------------------------------");
  console.log(`Run: #${run.run_number} (id=${run.id})`);
  console.log(`Branch(ref): ${run.head_branch}`);
  console.log(`Status: ${run.status}`);
  console.log(`Conclusion: ${run.conclusion}`);
  console.log(`URL: ${run.html_url}`);
  console.log("----------------------------------------");

  for (const job of jobSummaries) {
    console.log(`Job: ${job.name}`);
    console.log(`  conclusion: ${job.conclusion || job.status}`);
    if (job.errorLines.length === 0) {
      console.log("  errors: none detected");
    } else {
      console.log("  key error lines:");
      for (const line of job.errorLines.slice(0, 10)) {
        console.log(`    ${line}`);
      }
    }
  }

  const hints = summarizeIssues(jobSummaries);
  if (hints.length > 0) {
    console.log("----------------------------------------");
    console.log("Likely issues to fix:");
    for (const hint of hints) {
      console.log(`- ${hint}`);
    }
  }
}

async function main() {
  const token = getToken();
  const startedAt = await triggerWorkflow(token);
  const triggeredRun = await findTriggeredRun(token, startedAt);
  const completedRun = await waitForRunCompletion(token, triggeredRun.id);
  const jobSummaries = await analyzeRunLogs(token, completedRun.id);
  printReport(completedRun, jobSummaries);

  if (completedRun.conclusion !== "success") {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("Script failed:", error.message);
  process.exit(1);
});
