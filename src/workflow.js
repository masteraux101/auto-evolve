const { createBranch, commitChanges, pushBranch } = require('./git_utils.js');
const { createPullRequest } = require('./github_client.js');

/**
 * Orchestrates the entire Git and GitHub workflow.
 * @param {string} branchName - The name of the new branch.
 * @param {string} commitMessage - The commit message for the changes.
 * @param {string} prTitle - The title of the pull request.
 * @param {string} prBody - The body/description of the pull request.
 * @param {string} baseBranch - The branch to open the pull request against.
 */
const runWorkflow = async ({ branchName, commitMessage, prTitle, prBody, baseBranch = 'dev' }) => {
  console.log(`🚀 Starting workflow for branch: ${branchName}`);

  try {
    // 1. Create a new branch
    console.log(`[1/4] Creating branch '${branchName}'...`);
    const branchResult = await createBranch(branchName);
    console.log(branchResult);

    // 2. Commit changes
    // Note: This assumes files have already been staged (e.g., `git add .`)
    console.log(`[2/4] Committing changes with message: "${commitMessage}"...`);
    const commitResult = await commitChanges(commitMessage);
    console.log(commitResult);

    // 3. Push the branch to the remote
    console.log(`[3/4] Pushing branch '${branchName}' to origin...`);
    const pushResult = await pushBranch(branchName);
    console.log(pushResult);

    // 4. Create a pull request
    console.log(`[4/4] Creating pull request...`);
    const pr = await createPullRequest(branchName, baseBranch, prTitle, prBody);
    console.log('✅ Pull request created successfully!');
    console.log(`  - PR Number: ${pr.number}`);
    console.log(`  - PR URL: ${pr.html_url}`);

    return pr;

  } catch (error) {
    console.error('❌ Workflow failed:');
    console.error(error.message);
    // Re-throw the error to allow the caller to handle it
    throw error;
  }
};

// This allows the script to be run directly from the command line
const main = async () => {
  // Example usage: node src/workflow.js <branch-name> <commit-message> <pr-title> [pr-body]
  const args = process.argv.slice(2);
  if (args.length < 3) {
    console.error('Usage: node src/workflow.js <branch-name> <commit-message> <pr-title> [pr-body]');
    process.exit(1);
  }

  const [branchName, commitMessage, prTitle] = args;
  const prBody = args[3] || `Automated PR for: ${prTitle}`;

  try {
    await runWorkflow({ branchName, commitMessage, prTitle, prBody });
  } catch (error) {
    process.exit(1);
  }
};

if (require.main === module) {
  main();
}

module.exports = { runWorkflow };
