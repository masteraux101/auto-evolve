import os
import logging
from dotenv import load_dotenv

from src.git_handler import GitHandler
from src.github_client import GitHubClient

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

def main():
    """
    Main function to orchestrate the git push and pull request creation workflow.
    """
    logging.info("Starting the PR creation workflow...")

    # Load environment variables from .env file for local development
    load_dotenv()

    # --- Configuration from environment variables ---
    github_token = os.getenv("GITHUB_TOKEN")
    repo_name = os.getenv("REPO_NAME")  # e.g., "owner/repo"
    repo_path = os.getenv("REPO_PATH", ".")  # Local path to the repository
    base_branch = os.getenv("BASE_BRANCH", "main")
    head_branch = os.getenv("HEAD_BRANCH")
    commit_message = os.getenv("COMMIT_MESSAGE", "feat: automated changes")
    pr_title = os.getenv("PR_TITLE", "Automated PR")
    pr_body = os.getenv("PR_BODY", "This pull request was created automatically.")

    # --- Validation ---
    if not all([github_token, repo_name, head_branch]):
        logging.error("Missing required environment variables: GITHUB_TOKEN, REPO_NAME, HEAD_BRANCH")
        return

    logging.info(f"Repository: {repo_name}")
    logging.info(f"Targeting branch '{base_branch}' from '{head_branch}'")

    try:
        # --- Git Operations ---
        logging.info("Initializing GitHandler...")
        git_handler = GitHandler(repo_path, base_branch, head_branch)

        logging.info("Checking for changes...")
        if not git_handler.has_changes():
            logging.info("No changes to commit. Exiting.")
            return

        logging.info(f"Committing and pushing changes to '{head_branch}'...")
        git_handler.push_changes(commit_message)
        logging.info("Changes pushed successfully.")

        # --- GitHub PR Creation ---
        logging.info("Initializing GitHubClient...")
        github_client = GitHubClient(github_token, repo_name)

        logging.info(f"Creating pull request: '{pr_title}'")
        pull_request = github_client.create_pr(pr_title, pr_body, head_branch, base_branch)

        if pull_request:
            pr_number = pull_request.get("number")
            pr_url = pull_request.get("html_url")
            logging.info(f"Successfully created Pull Request #{pr_number}")
            print(f"PR_NUMBER={pr_number}")
            print(f"PR_URL={pr_url}")
        else:
            logging.warning("Pull request creation did not return data. It might already exist.")

    except Exception as e:
        logging.error(f"An error occurred during the workflow: {e}", exc_info=True)

if __name__ == "__main__":
    main()
