const GitService = require('../services/git_service');
const GitHubService = require('../services/github_service');
const logger = require('../utils/logger');

class PullRequestController {
  constructor() {
    this.gitService = new GitService();
    this.githubService = new GitHubService();
  }

  /**
   * Orchestrates the entire workflow of creating a pull request.
   * @param {string} commitMessage - The commit message and PR title.
   * @param {string} commitBody - The detailed body for the commit and PR.
   * @param {string} baseBranch - The branch to merge into (e.g., 'dev').
   * @returns {Promise<object>} - The created pull request data from GitHub, including number and URL.
   */
  async createPullRequestWorkflow({ commitMessage, commitBody, baseBranch }) {
    logger.info('Starting pull request creation workflow...');

    try {
      // 1. Git Operations: Branch, Commit, Push
      const branchName = `feature/auto-evolve-${Date.now()}`;
      logger.info(`Creating and switching to new branch: ${branchName}`);
      await this.gitService.createBranch(branchName);

      logger.info('Staging all changes...');
      await this.gitService.stageAllChanges();

      logger.info(`Committing changes with message: "${commitMessage}"`);
      await this.gitService.commit(commitMessage, commitBody);

      logger.info(`Pushing branch ${branchName} to origin...`);
      await this.gitService.push(branchName);

      // 2. GitHub Operation: Create Pull Request
      logger.info(`Creating pull request from ${branchName} to ${baseBranch}...`);
      const pullRequest = await this.githubService.createPullRequest(
        branchName,
        baseBranch,
        commitMessage, // Use commit message as PR title
        commitBody     // Use commit body as PR body
      );

      // 3. Report Result
      const result = {
        number: pullRequest.number,
        url: pullRequest.html_url,
      };

      logger.info(`Successfully created Pull Request #${result.number}`);
      logger.info(`PR URL: ${result.url}`);

      return result;
    } catch (error) {
      logger.error('Error during pull request workflow:', error);
      // In a real scenario, we might want to add cleanup logic here,
      // like deleting the local/remote branch if the PR creation fails.
      throw error; // Re-throw the error to be handled by the caller
    }
  }
}

module.exports = PullRequestController;
