const { Octokit } = require('@octokit/rest');
const { throttling } = require("@octokit/plugin-throttling");

const MyOctokit = Octokit.plugin(throttling);

// Ensure GITHUB_TOKEN and GITHUB_REPOSITORY are set
if (!process.env.GITHUB_TOKEN) {
    throw new Error('GITHUB_TOKEN environment variable is not set.');
}
if (!process.env.GITHUB_REPOSITORY) {
    throw new Error('GITHUB_REPOSITORY environment variable is not set (e.g., "owner/repo").');
}

const octokit = new MyOctokit({
  auth: process.env.GITHUB_TOKEN,
  throttle: {
    onRateLimit: (retryAfter, options, octokit, retryCount) => {
      octokit.log.warn(
        `Request quota exhausted for request ${options.method} ${options.url}`
      );

      if (retryCount < 1) {
        // only retry once
        octokit.log.info(`Retrying after ${retryAfter} seconds!`);
        return true;
      }
    },
    onSecondaryRateLimit: (retryAfter, options, octokit) => {
      // does not retry, only logs a warning
      octokit.log.warn(
        `SecondaryRateLimit detected for request ${options.method} ${options.url}`
      );
    },
  },
});

const [owner, repo] = process.env.GITHUB_REPOSITORY.split('/');

/**
 * Fetches the logs for a specific workflow run.
 * The logs are returned as a buffer containing a zip archive.
 * @param {number} runId The ID of the workflow run.
 * @returns {Promise<Buffer>} A buffer with the zipped log files.
 */
async function getWorkflowRunLogs(runId) {
  try {
    const response = await octokit.rest.actions.downloadWorkflowRunLogs({
      owner,
      repo,
      run_id: runId,
    });
    // response.data is an ArrayBuffer
    return Buffer.from(response.data);
  } catch (error) {
    console.error(`Error fetching workflow run logs for run ID ${runId}:`, error);
    throw error;
  }
}

/**
 * Creates a pull request.
 * @param {string} title The title of the pull request.
 * @param {string} head The name of the branch where your changes are implemented.
 * @param {string} base The name of the branch you want the changes pulled into.
 * @param {string} [body=''] The body of the pull request.
 * @returns {Promise<object>} The created pull request object.
 */
async function createPullRequest(title, head, base, body = '') {
    try {
        const response = await octokit.rest.pulls.create({
            owner,
            repo,
            title,
            head,
            base,
            body,
        });
        return response.data;
    } catch (error) {
        console.error('Error creating pull request:', error);
        throw error;
    }
}

/**
 * Fetches context from the GitHub repository, such as open issues.
 * @returns {Promise<object>} An object containing repository context.
 */
async function getRepositoryContext() {
    try {
        const { data: issues } = await octokit.rest.issues.listForRepo({
            owner,
            repo,
            state: 'open',
        });
        return {
            openIssues: issues.map(issue => ({
                number: issue.number,
                title: issue.title,
                state: issue.state,
                url: issue.html_url,
            })),
        };
    } catch (error) {
        console.error('Error fetching repository context:', error);
        throw error;
    }
}


module.exports = {
  getWorkflowRunLogs,
  createPullRequest,
  getRepositoryContext,
  octokit,
  owner,
  repo,
};
