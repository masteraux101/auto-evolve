import { Octokit } from "@octokit/rest";

let octokit;

function getOctokit() {
  if (!octokit) {
    const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
    if (!GITHUB_TOKEN) {
      throw new Error("GITHUB_TOKEN environment variable is not set.");
    }
    console.log("[github_tools] Initializing Octokit with GITHUB_TOKEN");
    octokit = new Octokit({ auth: GITHUB_TOKEN });
  }
  return octokit;
}

/**
 * Creates a new branch from a base branch.
 * @param {string} owner - The repository owner.
 * @param {string} repo - The repository name.
 * @param {string} branchName - The name of the new branch.
 * @param {string} baseBranch - The branch to create from (e.g., 'main').
 * @returns {Promise<void>}
 */
async function createBranch(owner, repo, branchName, baseBranch = 'main') {
  const kit = getOctokit();
  try {
    const { data: baseBranchRef } = await kit.git.getRef({
      owner,
      repo,
      ref: `heads/${baseBranch}`,
    });

    await kit.git.createRef({
      owner,
      repo,
      ref: `refs/heads/${branchName}`,
      sha: baseBranchRef.object.sha,
    });
    console.log(`Branch '${branchName}' created successfully.`);
  } catch (error) {
    if (error.status === 422 && error.message.includes("Reference already exists")) {
        console.warn(`Branch '${branchName}' already exists. Skipping creation.`);
    } else {
        console.error(`Error creating branch '${branchName}':`, error);
        throw error;
    }
  }
}

/**
 * Creates a pull request.
 * @param {string} owner - The repository owner.
 * @param {string} repo - The repository name.
 * @param {string} title - The title of the pull request.
 * @param {string} head - The source branch for the pull request.
 * @param {string} base - The target branch for the pull request.
 * @param {string} body - The body/description of the pull request.
 * @returns {Promise<object>} - The created pull request object.
 */
async function createPullRequest(owner, repo, title, head, base, body) {
  const kit = getOctokit();
  try {
    const { data: pullRequest } = await kit.pulls.create({
      owner,
      repo,
      title,
      head,
      base,
      body,
    });
    console.log(`Pull request created: ${pullRequest.html_url}`);
    return pullRequest;
  } catch (error) {
    console.error("Error creating pull request:", error.message);
    if (error.status === 422 && error.errors && error.errors.some(e => e.message.includes("A pull request already exists"))) {
        console.warn(`A pull request for branch '${head}' already exists.`);
        const { data: existingPRs } = await kit.pulls.list({
            owner,
            repo,
            head: `${owner}:${head}`,
            base,
            state: 'open',
        });
        if (existingPRs.length > 0) {
            console.log(`Found existing PR: ${existingPRs[0].html_url}`);
            return existingPRs[0];
        }
    }
    throw error;
  }
}

/**
 * Gets the content of a file from the repository.
 * @param {string} owner - The repository owner.
 * @param {string} repo - The repository name.
 * @param {string} path - The path to the file.
 * @param {string} [ref] - The branch, tag, or commit SHA. Defaults to the default branch.
 * @returns {Promise<string>} - The decoded content of the file.
 */
async function getFileContent(owner, repo, path, ref) {
    const kit = getOctokit();
    try {
        const { data } = await kit.repos.getContent({
            owner,
            repo,
            path,
            ref,
        });

        if (data.type !== 'file') {
            throw new Error(`Path '${path}' is not a file.`);
        }

        return Buffer.from(data.content, 'base64').toString('utf-8');
    } catch (error) {
        console.error(`Error getting file content for '${path}':`, error);
        throw error;
    }
}

/**
 * Commits a file to a branch.
 * @param {string} owner
 * @param {string} repo
 * @param {string} branch
 * @param {string} path
 * @param {string} content
 * @param {string} message
 * @returns {Promise<object>}
 */
async function commitFile(owner, repo, branch, path, content, message) {
    const kit = getOctokit();
    try {
        let currentFileSha;
        try {
            const { data: existingFile } = await kit.repos.getContent({
                owner,
                repo,
                path,
                ref: branch,
            });
            currentFileSha = existingFile.sha;
        } catch (error) {
            if (error.status !== 404) {
                throw error;
            }
        }

        const { data: commitData } = await kit.repos.createOrUpdateFileContents({
            owner,
            repo,
            path,
            message,
            content: Buffer.from(content).toString('base64'),
            branch,
            sha: currentFileSha,
        });

        console.log(`Successfully committed '${path}' to branch '${branch}'. Commit SHA: ${commitData.commit.sha}`);
        return commitData;
    } catch (error) {
        console.error(`Error committing file '${path}':`, error);
        throw error;
    }
}


export {
  createBranch,
  createPullRequest,
  getFileContent,
  commitFile,
};
