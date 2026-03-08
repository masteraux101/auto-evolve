const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const TARGET_REPOSITORY = process.env.TARGET_REPOSITORY;

if (!GITHUB_TOKEN || !TARGET_REPOSITORY) {
  throw new Error('GITHUB_TOKEN and TARGET_REPOSITORY environment variables are required.');
}

const [REPO_OWNER, REPO_NAME] = TARGET_REPOSITORY.split('/');

/**
 * Finds an existing open pull request for a given branch.
 * @param {string} branchName - The name of the head branch.
 * @param {string} baseBranch - The name of the base branch.
 * @returns {Promise<object|null>} - The existing PR data or null if not found.
 */
async function findExistingPullRequest(branchName, baseBranch) {
    const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/pulls?state=open&head=${REPO_OWNER}:${branchName}&base=${baseBranch}`;
    const headers = {
        'Accept': 'application/vnd.github+json',
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'X-GitHub-Api-Version': '2022-11-28',
    };

    try {
        const response = await fetch(url, { headers });
        if (!response.ok) {
            console.error(`Error finding existing PR: ${response.status}`);
            return null;
        }
        const prs = await response.json();
        return prs.length > 0 ? prs[0] : null;
    } catch (error) {
        console.error('Exception while finding existing PR:', error);
        return null;
    }
}

/**
 * Creates a pull request on GitHub.
 * @param {string} branchName - The name of the new branch (head).
 * @param {string} baseBranch - The name of the base branch.
 * @param {string} title - The title of the pull request.
 * @param {string} body - The body content of the pull request.
 * @returns {Promise<{prNumber: number, prUrl: string}>} - The PR number and URL.
 */
async function createPullRequest(branchName, baseBranch, title, body) {
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/pulls`;

  console.log(`Creating PR from ${branchName} to ${baseBranch} in ${REPO_OWNER}/${REPO_NAME}`);

  const headers = {
    'Accept': 'application/vnd.github+json',
    'Authorization': `Bearer ${GITHUB_TOKEN}`,
    'Content-Type': 'application/json',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  const requestBody = {
    title,
    body,
    head: branchName,
    base: baseBranch,
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(requestBody),
    });

    const responseData = await response.json();

    if (response.status === 422) { // Unprocessable Entity - often means PR already exists
        console.warn(`Could not create PR (status 422). A PR for this branch may already exist.`, responseData.errors);
        const existingPr = await findExistingPullRequest(branchName, baseBranch);
        if (existingPr) {
            console.log(`Found existing pull request #${existingPr.number}`);
            return {
                prNumber: existingPr.number,
                prUrl: existingPr.html_url,
            };
        }
    }

    if (response.status !== 201) {
      console.error('Failed to create pull request. Status:', response.status);
      console.error('Response Body:', responseData);
      throw new Error(`GitHub API responded with status ${response.status}: ${responseData.message || JSON.stringify(responseData)}`);
    }

    console.log(`Successfully created pull request #${responseData.number}: ${responseData.html_url}`);
    return {
      prNumber: responseData.number,
      prUrl: responseData.html_url,
    };
  } catch (error) {
    console.error('Error creating pull request:', error);
    throw error;
  }
}

module.exports = {
  createPullRequest,
};