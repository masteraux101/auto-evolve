# Pull Request Feature Integration Plan

## 1. Objective

To implement the capability for the agent to create a GitHub Pull Request (PR) as part of its workflow.

## 2. Codebase Analysis

The current project structure includes key files relevant to this feature:

- `github-tools.js`: A dedicated module for all interactions with the GitHub API using Octokit. This is the logical location for any new GitHub-related functionality.
- `worker.js`: The agent responsible for executing tasks. It contains a `tools` array where new capabilities can be defined and exposed to the planner.
- `planner.js`: The agent that creates a sequence of tasks for the worker. It will need to be made aware of the new PR creation tool.
- `src/`: An empty directory, indicating a potential future location for more organized source code modules.

## 3. Proposed Implementation Steps

### Step 3.1: Enhance GitHub Tools

**File:** `github-tools.js`

1.  **Add `createPullRequest` function:** A new asynchronous function will be added to handle the PR creation. This keeps all GitHub API calls consolidated.

    ```javascript
    async function createPullRequest({ owner, repo, title, head, base, body }) {
      console.log(`Creating pull request: ${title}`);
      try {
        const response = await octokit.pulls.create({
          owner,
          repo,
          title,
          head,
          base,
          body,
        });
        console.log(`Pull request created: ${response.data.html_url}`);
        return response.data;
      } catch (error) {
        console.error('Error creating pull request:', error);
        throw error;
      }
    }
    ```

2.  **Export the function:** The new `createPullRequest` function must be added to the `module.exports` object in `github-tools.js`.

### Step 3.2: Integrate into Worker

**File:** `worker.js`

1.  **Import the new tool:** Ensure `createPullRequest` is accessible within the worker, likely via the `github-tools` instance.

2.  **Define the new tool:** Add a new tool definition to the `tools` array within the `Worker` class constructor.

    ```javascript
    {
      name: 'create_pull_request',
      description: 'Creates a new pull request on the specified repository.',
      schema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'The title of the pull request.' },
          head: { type: 'string', description: 'The name of the branch where your changes are implemented.' },
          base: { type: 'string', description: 'The name of the branch you want the changes pulled into.' },
          body: { type: 'string', description: 'The contents of the pull request. Can be markdown.' },
        },
        required: ['title', 'head', 'base'],
      },
      execute: async ({ title, head, base, body }) => {
        const [owner, repo] = process.env.GITHUB_REPOSITORY.split('/');
        return await this.githubTools.createPullRequest({ owner, repo, title, head, base, body });
      },
    }
    ```

### Step 3.3: Update Planner (Future Step)

**File:** `planner.js`

The system prompt and logic for the planner will need to be updated to understand when it's appropriate to create a pull request (e.g., after committing changes to a new branch). It should then generate a task that utilizes the `create_pull_request` tool.

## 4. Long-term Structure

While the immediate plan is to modify existing files to maintain consistency, a future refactoring effort should consider moving `github-tools.js` to `src/tools/github.js` to better organize the codebase as it grows.
