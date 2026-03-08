/**
 * Creates a pull request on GitHub.
 *
 * @param {object} options - The options for creating the pull request.
 * @param {string} options.owner - The owner of the repository.
 * @param {string} options.repo - The name of the repository.
 * @param {string} options.title - The title of the pull request.
 * @param {string} options.body - The body of the pull request.
 * @param {string} options.head - The name of the source branch.
 * @param {string} options.base - The name of the target branch.
 * @param {string} options.token - The GitHub token for authentication.
 * @returns {Promise<object>} The response from the GitHub API.
 */
export async function createPullRequest({ owner, repo, title, body, head, base, token }) {
  const url = `https://api.github.com/repos/${owner}/${repo}/pulls`;

  console.log(`Creating pull request from ${head} to ${base} in ${owner}/${repo}`);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title,
        body,
        head,
        base,
      }),
    });

    const responseData = await response.json();

    if (!response.ok) {
      console.error(`Failed to create pull request. Status: ${response.status}`);
      console.error(`Response: ${JSON.stringify(responseData, null, 2)}`);
      // The GitHub API can return a 422 if a PR already exists.
      // This is not a fatal error in our workflow.
      if (response.status === 422 && responseData.errors?.some(e => e.message?.includes('A pull request already exists'))) {
          console.log('A pull request already exists for this branch. Proceeding.');
          // A more robust solution would be to list PRs for the head branch to get the URL.
          return { ...responseData, html_url: `https://github.com/${owner}/${repo}/pulls`, already_exists: true };
      }
      throw new Error(`Failed to create pull request: ${responseData.message || response.statusText}`);
    }

    console.log(`Successfully created pull request: ${responseData.html_url}`);
    return responseData;
  } catch (error) {
    console.error(`Error creating pull request: ${error.message}`);
    throw error;
  }
}
