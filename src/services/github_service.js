const fetch = require('node-fetch');

const GITHUB_API_URL = 'https://api.github.com';

/**
 * Creates a pull request on GitHub.
 *
 * @param {string} owner - The owner of the repository.
 * @param {string} repo - The name of the repository.
 * @param {string} head - The name of the branch where your changes are implemented.
 * @param {string} base - The name of the branch you want the changes pulled into.
 * @param {string} title - The title of the pull request.
 * @param {string} body - The body of the pull request.
 * @returns {Promise<object>} The JSON response from the GitHub API.
 */
async function createPullRequest(owner, repo, head, base, title, body) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error('GITHUB_TOKEN environment variable is not set.');
  }

  const url = `${GITHUB_API_URL}/repos/${owner}/${repo}/pulls`;

  const prData = {
    title,
    body,
    head,
    base,
  };

  console.log(`Creating pull request to ${base} from ${head}`);
  console.log(`PR Title: ${title}`);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(prData),
    });

    const responseData = await response.json();

    if (!response.ok) {
      console.error('Failed to create pull request. Response:', responseData);
      throw new Error(`Failed to create pull request: ${response.statusText}. ${responseData.message || ''}`);
    }

    console.log('Successfully created pull request:', responseData.html_url);
    return responseData;
  } catch (error) {
    console.error('Error creating pull request:', error);
    throw error;
  }
}

module.exports = {
  createPullRequest,
};
