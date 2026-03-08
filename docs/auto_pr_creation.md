# Automated Pull Request Creation

This document outlines the setup and usage of the automated PR creation feature.

## Configuration

Set the following environment variables:
- `GITHUB_TOKEN`: Your personal access token.
- `REPO_OWNER`: The owner of the repository.
- `REPO_NAME`: The name of the repository.

## Usage

Run the script with the required arguments:
```bash
python create_pr.py --branch-name 'feature/my-new-feature' --commit-message 'feat: Implement my new feature'
```