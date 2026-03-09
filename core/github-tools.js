import process from "process";

class GitHubApiError extends Error {
  constructor(message, status, path, details) {
    super(message);
    this.name = "GitHubApiError";
    this.status = status;
    this.path = path;
    this.details = details;
  }
}

function getRepoConfig() {
  const token = process.env.GITHUB_TOKEN || process.env.GH_PAT;
  const repository = process.env.TARGET_REPOSITORY || process.env.GITHUB_REPOSITORY;

  if (!token) {
    console.error("[GitHub Tools] Missing GITHUB_TOKEN (or GH_PAT) environment variable");
    throw new Error("Missing GITHUB_TOKEN (or GH_PAT).");
  }
  if (!repository || !repository.includes("/")) {
    console.error("[GitHub Tools] Missing or invalid TARGET_REPOSITORY/GITHUB_REPOSITORY");
    throw new Error("Missing or invalid TARGET_REPOSITORY/GITHUB_REPOSITORY (owner/repo).");
  }

  const [owner, repo] = repository.split("/");
  console.log(`[GitHub Tools] Using repository: ${owner}/${repo}`);
  return { token, owner, repo, repository };
}

async function githubRequest(path, options = {}) {
  const { token } = getRepoConfig();
  const maxAttempts = 3;
  let lastError;

  console.log(`[GitHub Tools] API request: ${options.method || "GET"} ${path}`);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const response = await fetch(`https://api.github.com${path}`, {
      method: options.method || "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "User-Agent": "auto-evolve-js-agent",
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (response.ok) {
      if (response.status === 204) {
        console.log(`[GitHub Tools] Request successful: ${path} (204 No Content)`);
        return {};
      }
      console.log(`[GitHub Tools] Request successful: ${path} (${response.status})`);
      return response.json();
    }

    const text = await response.text();
    console.error(`[GitHub Tools] Request failed: ${path} (${response.status}), attempt ${attempt}/${maxAttempts}`);
    const error = new GitHubApiError(
      `GitHub API failed (${response.status}) ${path}: ${text}`,
      response.status,
      path,
      text,
    );

    const retryAfter = Number(response.headers.get("retry-after") || 0);
    const remaining = Number(response.headers.get("x-ratelimit-remaining") || "-1");
    const resetEpochSec = Number(response.headers.get("x-ratelimit-reset") || 0);
    const resetDelayMs = resetEpochSec > 0 ? Math.max(0, resetEpochSec * 1000 - Date.now()) : 0;
    const backoffMs = 500 * 2 ** (attempt - 1);

    const shouldRetry =
      attempt < maxAttempts &&
      (response.status === 429 ||
        response.status >= 500 ||
        (response.status === 403 && (remaining === 0 || /rate limit/i.test(text))));

    if (!shouldRetry) {
      console.error(`[GitHub Tools] Request failed permanently: ${path}`);
      throw error;
    }

    lastError = error;
    const waitMs = retryAfter > 0 ? retryAfter * 1000 : Math.max(backoffMs, resetDelayMs);
    console.log(`[GitHub Tools] Retrying in ${waitMs}ms...`);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  throw lastError;
}

function ensureString(value, fieldName) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Invalid input: '${fieldName}' must be a non-empty string.`);
  }
  return value;
}

function ensureIssueNumber(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error("Invalid input: 'issueNumber' must be a positive integer.");
  }
  return parsed;
}

function toBase64(content) {
  return Buffer.from(content, "utf8").toString("base64");
}

function fromBase64(content) {
  return Buffer.from(content, "base64").toString("utf8");
}

export async function listDirectory(path = "", ref = process.env.TARGET_BRANCH || "main") {
  const { owner, repo } = getRepoConfig();
  const encodedPath = path ? `/${encodeURIComponent(path).replace(/%2F/g, "/")}` : "";
  const data = await githubRequest(`/repos/${owner}/${repo}/contents${encodedPath}?ref=${encodeURIComponent(ref)}`);

  const items = Array.isArray(data) ? data : [data];
  return items.map((item) => ({
    name: item.name,
    path: item.path,
    type: item.type,
    sha: item.sha,
    size: item.size,
  }));
}

export async function readFile(path, ref = process.env.TARGET_BRANCH || "main") {
  ensureString(path, "path");
  const { owner, repo } = getRepoConfig();
  const encodedPath = encodeURIComponent(path).replace(/%2F/g, "/");
  const data = await githubRequest(`/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(ref)}`);
  return {
    path: data.path,
    sha: data.sha,
    content: fromBase64(data.content || ""),
  };
}

export async function upsertFile(path, content, message, branch = process.env.TARGET_BRANCH || "main") {
  ensureString(path, "path");
  ensureString(content, "content");
  ensureString(message, "message");
  const { owner, repo } = getRepoConfig();
  const encodedPath = encodeURIComponent(path).replace(/%2F/g, "/");
  let sha;

  try {
    const existing = await githubRequest(`/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`);
    sha = existing.sha;
  } catch (error) {
    if (error instanceof GitHubApiError && error.status === 404) {
      sha = undefined;
    } else {
      throw error;
    }
  }

  const result = await githubRequest(`/repos/${owner}/${repo}/contents/${encodedPath}`, {
    method: "PUT",
    body: {
      message,
      content: toBase64(content),
      branch,
      sha,
    },
  });

  return {
    path,
    commitSha: result.commit?.sha,
    created: !sha,
  };
}

export async function deleteFile(path, message, branch = process.env.TARGET_BRANCH || "main") {
  ensureString(path, "path");
  ensureString(message, "message");
  const { owner, repo } = getRepoConfig();
  const encodedPath = encodeURIComponent(path).replace(/%2F/g, "/");
  const existing = await githubRequest(`/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`);

  const result = await githubRequest(`/repos/${owner}/${repo}/contents/${encodedPath}`, {
    method: "DELETE",
    body: {
      message,
      sha: existing.sha,
      branch,
    },
  });

  return {
    path,
    commitSha: result.commit?.sha,
    deleted: true,
  };
}

export async function listIssues(state = "open", perPage = 20) {
  const { owner, repo } = getRepoConfig();
  const data = await githubRequest(`/repos/${owner}/${repo}/issues?state=${encodeURIComponent(state)}&per_page=${perPage}`);
  return data.map((item) => ({
    number: item.number,
    title: item.title,
    state: item.state,
    url: item.html_url,
  }));
}

export async function createIssue(title, body) {
  ensureString(title, "title");
  const { owner, repo } = getRepoConfig();
  const data = await githubRequest(`/repos/${owner}/${repo}/issues`, {
    method: "POST",
    body: { title, body },
  });

  return {
    number: data.number,
    url: data.html_url,
  };
}

export async function commentIssue(issueNumber, body) {
  const normalizedIssueNumber = ensureIssueNumber(issueNumber);
  ensureString(body, "body");
  const { owner, repo } = getRepoConfig();
  const data = await githubRequest(`/repos/${owner}/${repo}/issues/${normalizedIssueNumber}/comments`, {
    method: "POST",
    body: { body },
  });

  return {
    id: data.id,
    url: data.html_url,
  };
}

export async function createBranch(owner, repo, branchName, baseBranch = "main") {
  try {
    // Get the SHA of the base branch
    const baseRef = await githubRequest(`/repos/${owner}/${repo}/git/refs/heads/${baseBranch}`);
    const baseSha = baseRef.object.sha;

    // Create new branch
    const data = await githubRequest(`/repos/${owner}/${repo}/git/refs`, {
      method: "POST",
      body: {
        ref: `refs/heads/${branchName}`,
        sha: baseSha,
      },
    });

    console.log(`[GitHub Tools] Created branch: ${branchName}`);
    return {
      name: branchName,
      sha: data.object.sha,
      url: data.object.url,
    };
  } catch (error) {
    throw new Error(`Failed to create branch ${branchName}: ${error.message}`);
  }
}

export async function createPullRequest(owner, repo, title, headBranch, baseBranch = "main", body = "") {
  try {
    const data = await githubRequest(`/repos/${owner}/${repo}/pulls`, {
      method: "POST",
      body: {
        title,
        head: headBranch,
        base: baseBranch,
        body: body || "",
      },
    });

    console.log(`[GitHub Tools] Created pull request #${data.number}: ${title}`);
    return {
      number: data.number,
      url: data.html_url,
      title: data.title,
      state: data.state,
    };
  } catch (error) {
    throw new Error(`Failed to create pull request: ${error.message}`);
  }
}

// ── Issue 高级操作 ──────────────────────────────────────────────────────────

export async function getIssue(issueNumber) {
  const num = ensureIssueNumber(issueNumber);
  const { owner, repo } = getRepoConfig();
  const data = await githubRequest(`/repos/${owner}/${repo}/issues/${num}`);
  return {
    number: data.number,
    title: data.title,
    body: data.body,
    state: data.state,
    labels: data.labels.map((l) => l.name),
    assignees: data.assignees.map((a) => a.login),
    url: data.html_url,
    created_at: data.created_at,
    updated_at: data.updated_at,
  };
}

export async function updateIssue(issueNumber, updates = {}) {
  const num = ensureIssueNumber(issueNumber);
  const { owner, repo } = getRepoConfig();
  const data = await githubRequest(`/repos/${owner}/${repo}/issues/${num}`, {
    method: "PATCH",
    body: updates,
  });
  return {
    number: data.number,
    title: data.title,
    state: data.state,
    url: data.html_url,
  };
}

export async function closeIssue(issueNumber) {
  return updateIssue(issueNumber, { state: "closed" });
}

export async function addLabels(issueNumber, labels) {
  const num = ensureIssueNumber(issueNumber);
  if (!Array.isArray(labels) || labels.length === 0) {
    throw new Error("labels must be a non-empty array of strings");
  }
  const { owner, repo } = getRepoConfig();
  const data = await githubRequest(`/repos/${owner}/${repo}/issues/${num}/labels`, {
    method: "POST",
    body: { labels },
  });
  return data.map((l) => l.name);
}

export async function removeLabel(issueNumber, label) {
  const num = ensureIssueNumber(issueNumber);
  ensureString(label, "label");
  const { owner, repo } = getRepoConfig();
  await githubRequest(`/repos/${owner}/${repo}/issues/${num}/labels/${encodeURIComponent(label)}`, {
    method: "DELETE",
  });
  return { removed: label };
}

// ── Pull Request 操作 ────────────────────────────────────────────────────────

export async function listPullRequests(state = "open", perPage = 20) {
  const { owner, repo } = getRepoConfig();
  const data = await githubRequest(
    `/repos/${owner}/${repo}/pulls?state=${encodeURIComponent(state)}&per_page=${perPage}`,
  );
  return data.map((pr) => ({
    number: pr.number,
    title: pr.title,
    state: pr.state,
    head: pr.head.ref,
    base: pr.base.ref,
    url: pr.html_url,
    mergeable: pr.mergeable,
    draft: pr.draft,
  }));
}

export async function getPullRequest(prNumber) {
  const num = ensureIssueNumber(prNumber);
  const { owner, repo } = getRepoConfig();
  const data = await githubRequest(`/repos/${owner}/${repo}/pulls/${num}`);
  return {
    number: data.number,
    title: data.title,
    body: data.body,
    state: data.state,
    head: data.head.ref,
    base: data.base.ref,
    mergeable: data.mergeable,
    merged: data.merged,
    draft: data.draft,
    url: data.html_url,
    diff_url: data.diff_url,
    changed_files: data.changed_files,
    additions: data.additions,
    deletions: data.deletions,
  };
}

export async function mergePullRequest(prNumber, method = "squash", commitTitle = "") {
  const num = ensureIssueNumber(prNumber);
  const { owner, repo } = getRepoConfig();
  const body = { merge_method: method };
  if (commitTitle) body.commit_title = commitTitle;
  const data = await githubRequest(`/repos/${owner}/${repo}/pulls/${num}/merge`, {
    method: "PUT",
    body,
  });
  console.log(`[GitHub Tools] Merged PR #${num} via ${method}`);
  return {
    merged: data.merged,
    message: data.message,
    sha: data.sha,
  };
}

export async function listPRFiles(prNumber) {
  const num = ensureIssueNumber(prNumber);
  const { owner, repo } = getRepoConfig();
  const data = await githubRequest(`/repos/${owner}/${repo}/pulls/${num}/files`);
  return data.map((f) => ({
    filename: f.filename,
    status: f.status,
    additions: f.additions,
    deletions: f.deletions,
    patch: f.patch,
  }));
}

// ── Branch 操作 ──────────────────────────────────────────────────────────────

export async function listBranches(perPage = 30) {
  const { owner, repo } = getRepoConfig();
  const data = await githubRequest(`/repos/${owner}/${repo}/branches?per_page=${perPage}`);
  return data.map((b) => ({
    name: b.name,
    sha: b.commit.sha,
    protected: b.protected,
  }));
}

export async function deleteBranch(branchName) {
  ensureString(branchName, "branchName");
  const { owner, repo } = getRepoConfig();
  await githubRequest(`/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branchName)}`, {
    method: "DELETE",
  });
  console.log(`[GitHub Tools] Deleted branch: ${branchName}`);
  return { deleted: branchName };
}

// ── Git Tree API（批量提交多文件） ───────────────────────────────────────────

export async function commitMultipleFiles(files, message, branch = process.env.TARGET_BRANCH || "main") {
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error("files must be a non-empty array of { path, content }");
  }
  ensureString(message, "message");
  const { owner, repo } = getRepoConfig();

  // 1. 获取 branch 最新 commit SHA
  const refData = await githubRequest(`/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`);
  const latestCommitSha = refData.object.sha;

  // 2. 获取该 commit 的 tree SHA
  const commitData = await githubRequest(`/repos/${owner}/${repo}/git/commits/${latestCommitSha}`);
  const baseTreeSha = commitData.tree.sha;

  // 3. 为每个文件创建 blob 并构建 tree 条目
  const treeItems = [];
  for (const file of files) {
    ensureString(file.path, "file.path");
    ensureString(file.content, "file.content");
    const blob = await githubRequest(`/repos/${owner}/${repo}/git/blobs`, {
      method: "POST",
      body: { content: file.content, encoding: "utf-8" },
    });
    treeItems.push({
      path: file.path,
      mode: "100644",
      type: "blob",
      sha: blob.sha,
    });
  }

  // 4. 创建新 tree
  const newTree = await githubRequest(`/repos/${owner}/${repo}/git/trees`, {
    method: "POST",
    body: { base_tree: baseTreeSha, tree: treeItems },
  });

  // 5. 创建新 commit
  const newCommit = await githubRequest(`/repos/${owner}/${repo}/git/commits`, {
    method: "POST",
    body: { message, tree: newTree.sha, parents: [latestCommitSha] },
  });

  // 6. 更新 branch ref
  await githubRequest(`/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, {
    method: "PATCH",
    body: { sha: newCommit.sha },
  });

  console.log(`[GitHub Tools] Committed ${files.length} files to ${branch} (${newCommit.sha.slice(0, 7)})`);
  return {
    commitSha: newCommit.sha,
    treeSha: newTree.sha,
    filesCommitted: files.map((f) => f.path),
  };
}

// ── GitHub Actions / Workflow 操作 ───────────────────────────────────────────

export async function listWorkflows() {
  const { owner, repo } = getRepoConfig();
  const data = await githubRequest(`/repos/${owner}/${repo}/actions/workflows`);
  return data.workflows.map((w) => ({
    id: w.id,
    name: w.name,
    path: w.path,
    state: w.state,
  }));
}

export async function listWorkflowRuns(workflowId, status = "", perPage = 10) {
  const { owner, repo } = getRepoConfig();
  let url = `/repos/${owner}/${repo}/actions/workflows/${workflowId}/runs?per_page=${perPage}`;
  if (status) url += `&status=${encodeURIComponent(status)}`;
  const data = await githubRequest(url);
  return data.workflow_runs.map((r) => ({
    id: r.id,
    name: r.name,
    status: r.status,
    conclusion: r.conclusion,
    branch: r.head_branch,
    url: r.html_url,
    created_at: r.created_at,
  }));
}

export async function triggerWorkflow(workflowId, ref = "main", inputs = {}) {
  const { owner, repo } = getRepoConfig();
  await githubRequest(`/repos/${owner}/${repo}/actions/workflows/${workflowId}/dispatches`, {
    method: "POST",
    body: { ref, inputs },
  });
  console.log(`[GitHub Tools] Triggered workflow ${workflowId} on ${ref}`);
  return { triggered: true, workflowId, ref };
}

export async function getWorkflowRunLogs(runId) {
  const { owner, repo } = getRepoConfig();
  // 此 API 返回 302 重定向到下载 URL，直接获取 jobs 信息更实用
  const data = await githubRequest(`/repos/${owner}/${repo}/actions/runs/${runId}/jobs`);
  return data.jobs.map((j) => ({
    id: j.id,
    name: j.name,
    status: j.status,
    conclusion: j.conclusion,
    steps: j.steps?.map((s) => ({
      name: s.name,
      status: s.status,
      conclusion: s.conclusion,
    })),
  }));
}

/**
 * 创建或更新一个定时 GitHub Actions 工作流文件。
 * 本质上是通过 upsertFile 把 YAML 写到 .github/workflows/ 下。
 *
 * @param {string} workflowName - 工作流文件名（不含路径，如 "auto-evolve-cron.yml"）
 * @param {object} config - 工作流配置
 * @param {string} config.schedule - cron 表达式，如 "0 2 * * *"
 * @param {string} config.jobName - job 名称
 * @param {string[]} config.steps - 要执行的 run 命令列表
 * @param {string} [config.branch] - 提交到哪个分支
 */
export async function createScheduledWorkflow(workflowName, config = {}) {
  ensureString(workflowName, "workflowName");
  const schedule = ensureString(config.schedule, "config.schedule");
  const jobName = config.jobName || "scheduled-job";
  const steps = config.steps || ["echo 'Hello from scheduled workflow'"];
  const branch = config.branch || process.env.TARGET_BRANCH || "main";

  const stepsYaml = steps
    .map((cmd, i) => `      - name: Step ${i + 1}\n        run: ${cmd}`)
    .join("\n");

  const yamlContent = `name: ${workflowName.replace(/\.yml$/, "")}

on:
  schedule:
    - cron: '${schedule}'
  workflow_dispatch:

jobs:
  ${jobName}:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
${stepsYaml}
`;

  const filePath = `.github/workflows/${workflowName}`;
  const result = await upsertFile(filePath, yamlContent, `ci: create scheduled workflow ${workflowName}`, branch);
  console.log(`[GitHub Tools] Created scheduled workflow: ${filePath}`);
  return { ...result, schedule, filePath };
}

// ── Repo 信息 ────────────────────────────────────────────────────────────────

export async function getRepoInfo() {
  const { owner, repo } = getRepoConfig();
  const data = await githubRequest(`/repos/${owner}/${repo}`);
  return {
    name: data.full_name,
    description: data.description,
    default_branch: data.default_branch,
    language: data.language,
    open_issues_count: data.open_issues_count,
    visibility: data.visibility,
    url: data.html_url,
  };
}

export async function executeGithubTool(action, input = {}) {
  const { owner, repo } = action === "create_branch" || action === "create_pull_request"
    ? (input.owner && input.repo ? { owner: input.owner, repo: input.repo } : getRepoConfig())
    : { owner: undefined, repo: undefined };

  switch (action) {
    // ── 文件操作 ──
    case "read_file":
      return readFile(ensureString(input.path, "path"), input.ref);
    case "list_directory":
      return listDirectory(input.path, input.ref);
    case "upsert_file":
      return upsertFile(
        ensureString(input.path, "path"),
        ensureString(input.content, "content"),
        input.message || `chore: upsert ${input.path}`,
        input.branch,
      );
    case "delete_file":
      return deleteFile(ensureString(input.path, "path"), input.message || `chore: delete ${input.path}`, input.branch);
    case "commit_multiple_files":
      return commitMultipleFiles(input.files, input.message, input.branch);

    // ── Issue 操作 ──
    case "create_issue":
      return createIssue(input.title, input.body || "");
    case "get_issue":
      return getIssue(input.issueNumber);
    case "update_issue":
      return updateIssue(input.issueNumber, input.updates);
    case "close_issue":
      return closeIssue(input.issueNumber);
    case "list_issues":
      return listIssues(input.state, input.perPage);
    case "comment_issue":
      return commentIssue(input.issueNumber, input.body || "");
    case "add_labels":
      return addLabels(input.issueNumber, input.labels);
    case "remove_label":
      return removeLabel(input.issueNumber, input.label);

    // ── PR 操作 ──
    case "create_pull_request": {
      const o = input.owner || getRepoConfig().owner;
      const r = input.repo || getRepoConfig().repo;
      return createPullRequest(o, r, input.title, input.headBranch, input.baseBranch, input.body);
    }
    case "list_pull_requests":
      return listPullRequests(input.state, input.perPage);
    case "get_pull_request":
      return getPullRequest(input.prNumber);
    case "merge_pull_request":
      return mergePullRequest(input.prNumber, input.method, input.commitTitle);
    case "list_pr_files":
      return listPRFiles(input.prNumber);

    // ── Branch 操作 ──
    case "create_branch": {
      const o = input.owner || getRepoConfig().owner;
      const r = input.repo || getRepoConfig().repo;
      return createBranch(o, r, input.branchName, input.baseBranch);
    }
    case "list_branches":
      return listBranches(input.perPage);
    case "delete_branch":
      return deleteBranch(input.branchName);

    // ── Workflow / Actions 操作 ──
    case "list_workflows":
      return listWorkflows();
    case "list_workflow_runs":
      return listWorkflowRuns(input.workflowId, input.status, input.perPage);
    case "trigger_workflow":
      return triggerWorkflow(input.workflowId, input.ref, input.inputs);
    case "get_workflow_run_logs":
      return getWorkflowRunLogs(input.runId);
    case "create_scheduled_workflow":
      return createScheduledWorkflow(input.workflowName, input.config || input);

    // ── Repo 信息 ──
    case "get_repo_info":
      return getRepoInfo();

    default:
      return { skipped: true, reason: `Unsupported or empty tool action: ${String(action)}` };
  }
}
