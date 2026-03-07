#!/usr/bin/env node
import fs from "fs";
import os from "os";
import path from "path";
import process from "process";
import { execSync } from "child_process";
import sodium from "tweetsodium";

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const current = argv[i];
    if (!current.startsWith("--")) {
      continue;
    }
    const key = current.slice(2);
    const value = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : "true";
    args[key] = value;
    if (value !== "true") {
      i += 1;
    }
  }
  return args;
}

function required(value, name) {
  if (!value || value === "true") {
    throw new Error(`Missing required argument: ${name}`);
  }
  return value;
}

function run(command, cwd) {
  execSync(command, { stdio: "inherit", cwd });
}

async function githubRequest(pathname, token, options = {}) {
  const response = await fetch(`https://api.github.com${pathname}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "User-Agent": "auto-evolve-deployer",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub API error ${response.status} ${pathname}: ${text}`);
  }

  if (response.status === 204) {
    return {};
  }

  return response.json();
}

async function setRepoSecret(owner, repo, token, secretName, secretValue) {
  const publicKey = await githubRequest(`/repos/${owner}/${repo}/actions/secrets/public-key`, token);
  const messageBytes = Buffer.from(secretValue);
  const keyBytes = Buffer.from(publicKey.key, "base64");
  const encryptedBytes = sodium.seal(messageBytes, keyBytes);
  const encryptedValue = Buffer.from(encryptedBytes).toString("base64");

  await githubRequest(`/repos/${owner}/${repo}/actions/secrets/${secretName}`, token, {
    method: "PUT",
    body: {
      encrypted_value: encryptedValue,
      key_id: publicKey.key_id,
    },
  });
}

function ensureCleanDirectory(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function writeWorkflow(workflowPath) {
  const content = [
    "name: auto-evolve-agent",
    "",
    "on:",
    "  workflow_dispatch:",
    "    inputs:",
    "      user_prompt:",
    "        description: Prompt for planner/worker",
    "        required: true",
    "        type: string",
    "      target_repository:",
    "        description: Target repo in owner/repo format (defaults to current repo)",
    "        required: false",
    "        type: string",
    "      target_branch:",
    "        description: Target branch (defaults to current ref name)",
    "        required: false",
    "        type: string",
    "      issue_number:",
    "        description: Optional issue number for writeback",
    "        required: false",
    "        type: string",
    "",
    "jobs:",
    "  run-agent:",
    "    runs-on: ubuntu-latest",
    "    permissions:",
    "      contents: write",
    "      issues: write",
    "    steps:",
    "      - name: Checkout",
    "        uses: actions/checkout@v4",
    "",
    "      - name: Setup Node",
    "        uses: actions/setup-node@v4",
    "        with:",
    "          node-version: '20'",
    "",
    "      - name: Install dependencies",
    "        run: npm ci",
    "",
    "      - name: Run planner/worker",
    "        env:",
    "          GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}",
    "          GEMINI_MODEL: ${{ vars.GEMINI_MODEL || 'gemini-2.5-pro' }}",
    "          GITHUB_TOKEN: ${{ secrets.AUTO_EVOLVE_GITHUB_PAT }}",
    "          TARGET_REPOSITORY: ${{ inputs.target_repository || github.repository }}",
    "          TARGET_BRANCH: ${{ inputs.target_branch || github.ref_name }}",
    "          USER_PROMPT: ${{ inputs.user_prompt }}",
    "          ISSUE_NUMBER: ${{ inputs.issue_number }}",
    "          WRITE_BACK_TO_ISSUE: ${{ inputs.issue_number != '' }}",
    "        run: npm start",
    "",
  ].join("\n");

  fs.writeFileSync(workflowPath, content, "utf8");
}

async function main() {
  const args = parseArgs(process.argv);
  const targetRepo = required(args.repo || process.env.TARGET_REPOSITORY, "--repo owner/repo");
  const pat = required(args.pat || process.env.GITHUB_PAT, "--pat <github_pat>");
  const geminiApiKey = required(args.geminiKey || process.env.GEMINI_API_KEY, "--geminiKey <gemini_api_key>");
  const branch = args.branch || "main";

  if (!targetRepo.includes("/")) {
    throw new Error("--repo must be in owner/repo format");
  }

  const [owner, repo] = targetRepo.split("/");
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "auto-evolve-deploy-"));
  const targetDir = path.join(tempRoot, repo);

  console.log(`[Deploy] cloning ${targetRepo}...`);
  run(`git clone https://x-access-token:${pat}@github.com/${targetRepo}.git ${targetDir}`, process.cwd());

  const sourceRoot = process.cwd();
  const filesToCopy = [
    "index.js",
    "graph.js",
    "planner.js",
    "worker.js",
    "state.js",
    "llm.js",
    "github-tools.js",
    "package.json",
    "package-lock.json",
    ".env.example",
    "README.md",
  ];

  console.log("[Deploy] copying agent files...");
  for (const relative of filesToCopy) {
    const src = path.join(sourceRoot, relative);
    const dest = path.join(targetDir, relative);
    ensureCleanDirectory(path.dirname(dest));
    fs.copyFileSync(src, dest);
  }

  const workflowDir = path.join(targetDir, ".github", "workflows");
  ensureCleanDirectory(workflowDir);
  writeWorkflow(path.join(workflowDir, "auto-evolve-agent.yml"));

  console.log("[Deploy] installing action secrets...");
  await setRepoSecret(owner, repo, pat, "AUTO_EVOLVE_GITHUB_PAT", pat);
  await setRepoSecret(owner, repo, pat, "GEMINI_API_KEY", geminiApiKey);

  console.log("[Deploy] committing and pushing...");
  run("git add .", targetDir);
  try {
    run(`git commit -m \"chore: deploy auto-evolve JS agent\"`, targetDir);
  } catch {
    console.log("[Deploy] no changes to commit");
  }

  run(`git push origin HEAD:${branch}`, targetDir);

  console.log("[Deploy] done");
  console.log(`[Deploy] workflow URL: https://github.com/${targetRepo}/actions/workflows/auto-evolve-agent.yml`);
}

main().catch((error) => {
  console.error("[Deploy] failed", error.message);
  process.exit(1);
});
