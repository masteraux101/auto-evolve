import { Git } from './git.js';
import { GitHub } from './github.js';

// This function will be the main entry point for the script.
async function runWorkflow() {
  try {
    // These would typically come from a configuration file, environment variables,
    // or command-line arguments. For this example, we'll use values based on
    // the provided repository context.
    const config = {
      targetRepository: 'masteraux101/auto-evolve',
      targetBranch: 'dev',
      currentTaskId: 'task-3',
      // The commit message and PR details should be provided by the planner step.
      // We'll use placeholders for now.
      commitMessage: 'feat: implement changes for task-3',
      prTitle: 'Implement changes for task-3',
      prBody: 'This pull request was automatically generated to address task-3.',
    };

    const git = new Git();
    const github = new GitHub();

    const branchName = `feat/${config.currentTaskId}`;

    console.log(`[WORKFLOW] Starting workflow for task: ${config.currentTaskId}`);

    // 1. Create and switch to a new branch
    console.log(`[GIT] Creating and checking out new branch: ${branchName}`);
    await git.createAndCheckoutBranch(branchName, config.targetBranch);

    // 2. Add all changes and commit
    // This assumes that file modifications have already been made in the working directory.
    console.log('[GIT] Staging all changes...');
    await git.addAll();

    console.log(`[GIT] Committing with message: "${config.commitMessage}"`);
    await git.commit(config.commitMessage);

    // 3. Push the new branch to the remote repository
    console.log(`[GIT] Pushing branch "${branchName}" to origin...`);
    await git.push(branchName);

    // 4. Create a Pull Request on GitHub
    console.log(`[GITHUB] Creating Pull Request...`);
    const pr = await github.createPullRequest(
      config.targetRepository,
      branchName,
      config.targetBranch,
      config.prTitle,
      config.prBody
    );

    console.log(`[SUCCESS] Pull Request created successfully: ${pr.html_url}`);

  } catch (error) {
    console.error('[ERROR] Workflow failed:', error.message);
    // In a real CI/CD environment, you might want to exit with a non-zero code
    // to signal failure to the runner.
    process.exit(1);
  }
}

// Execute the workflow
runWorkflow();
