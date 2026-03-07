import process from "process";

function getRepoConfig() {
  const token = process.env.GITHUB_TOKEN || process.env.GH_PAT;
  const repository = process.env.TARGET_REPOSITORY || process.env.GITHUB_REPOSITORY;

  if (!token) {
    throw new Error("Missing GITHUB_TOKEN (or GH_PAT).");
  }
  if (!repository || !repository.includes("/")) {
    throw new Error("Missing or invalid TARGET_REPOSITORY/GITHUB_REPOSITORY (owner/repo).");
  }

  const [owner, repo] = repository.split("/");
  return { token, owner, repo, repository };
}

async function githubRequest(path, options = {}) {
  const { token } = getRepoConfig();
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

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub API failed (${response.status}) ${path}: ${text}`);
  }

  if (response.status === 204) {
    return {};
  }

  return response.json();
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
  const { owner, repo } = getRepoConfig();
  const encodedPath = encodeURIComponent(path).replace(/%2F/g, "/");
  let sha;

  try {
    const existing = await githubRequest(`/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`);
    sha = existing.sha;
  } catch {
    sha = undefined;
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
  const { owner, repo } = getRepoConfig();
  const data = await githubRequest(`/repos/${owner}/${repo}/issues/${issueNumber}/comments`, {
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
      return readFile(input.path, input.ref);
    case "list_directory":
      return listDirectory(input.path, input.ref);
    case "upsert_file":
      return upsertFile(input.path, input.content, input.message || `chore: upsert ${input.path}`, input.branch);
    case "delete_file":
      return deleteFile(input.path, input.message || `chore: delete ${input.path}`, input.branch);
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
