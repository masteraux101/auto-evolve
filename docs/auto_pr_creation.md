# Automated Pull Request (PR) Creation

This document outlines the setup, configuration, and usage of the automated pull request creation feature in `auto-evolve`. This feature automatically creates a pull request when changes are committed to a feature branch.

## Overview

The auto-PR feature streamlines the development workflow by eliminating the manual step of creating a pull request after pushing code changes. When enabled, the system will detect new commits on a designated branch and automatically open a PR against a target branch (e.g., `main` or `dev`).

## Setup and Configuration

To enable and configure this feature, you need to set specific environment variables. These variables control the behavior of the PR creation process.

### Required Environment Variables

*   `AUTO_CREATE_PR`: Set this to `"true"` to enable the feature. If this variable is not set, is empty, or is set to any other value, the feature will be disabled.
*   `GITHUB_TOKEN`: A GitHub Personal Access Token (PAT) with the necessary permissions to create pull requests in the target repository.
*   `PR_TARGET_BRANCH`: The name of the branch you want to merge your changes into (e.g., `main`, `develop`). Defaults to `main` if not set.
*   `PR_TITLE`: (Optional) The title for the automatically created pull request. If not set, a default title will be generated based on the commit message.
*   `PR_BODY`: (Optional) The body content for the pull request. If not set, a default body will be generated.

### Example `.env` configuration:

```
AUTO_CREATE_PR="true"
GITHUB_TOKEN="ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
PR_TARGET_BRANCH="main"
PR_TITLE="feat: Implement new feature"
PR_BODY="This PR implements the new feature as described in issue #123."
```

## Permissions

The `GITHUB_TOKEN` provided must have the following permissions for the target repository:

*   `repo`: Full control of private repositories.
    *   Specifically, `contents: write` and `pull_requests: write` are required.

Please ensure the token is configured with the minimum necessary permissions to enhance security.

## Usage

1.  **Enable the feature**: Set `AUTO_CREATE_PR="true"` in your environment variables.
2.  **Configure variables**: Set `GITHUB_TOKEN` and optionally `PR_TARGET_BRANCH`, `PR_TITLE`, and `PR_BODY`.
3.  **Push changes**: Once the `auto-evolve` worker commits and pushes a change to your feature branch, it will automatically trigger the PR creation process.
4.  **Verify**: A new pull request will be created in your GitHub repository, targeting the branch specified in `PR_TARGET_BRANCH`. You can then review, comment on, and merge the PR as part of your standard workflow.

## Troubleshooting

*   **PR not created**:
    *   Verify that `AUTO_CREATE_PR` is set to `"true"`.
    *   Check if the `GITHUB_TOKEN` is valid and has the correct permissions.
    *   Ensure the source branch has commits that are not yet in the target branch.
    *   Look at the worker's logs for any error messages related to the GitHub API.
