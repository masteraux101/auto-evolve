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

export async function executeGithubTool(action, input = {}) {
  switch (action) {
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
    case "create_issue":
      return createIssue(input.title, input.body || "");
    case "list_issues":
      return listIssues(input.state, input.perPage);
    case "comment_issue":
      return commentIssue(input.issueNumber, input.body || "");
    default:
      return { skipped: true, reason: `Unsupported or empty tool action: ${String(action)}` };
  }
}
