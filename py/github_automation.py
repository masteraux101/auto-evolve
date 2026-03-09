import os
import requests
import subprocess
import logging
import re

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# --- Configuration ---
# Load from environment variables with sensible defaults
GITHUB_TOKEN = os.getenv("GITHUB_TOKEN")
REPO_OWNER = os.getenv("REPO_OWNER", "masteraux101")
REPO_NAME = os.getenv("REPO_NAME", "auto-evolve")
BASE_BRANCH = os.getenv("BASE_BRANCH", "main")

# --- Helper Functions ---

def run_git_command(command):
    """Runs a Git command and handles errors."""
    logging.info(f"Running command: {' '.join(command)}")
    try:
        result = subprocess.run(command, check=True, capture_output=True, text=True)
        logging.info(f"Command output:\n{result.stdout}")
        return result.stdout.strip()
    except subprocess.CalledProcessError as e:
        logging.error(f"Git command failed: {' '.join(command)}")
        logging.error(f"Stderr: {e.stderr}")
        raise  # Re-raise the exception to be handled by the caller

def make_api_request(method, url, headers=None, json=None):
    """Makes an API request and handles errors."""
    if headers is None:
        headers = {}
    
    default_headers = {
        "Authorization": f"token {GITHUB_TOKEN}",
        "Accept": "application/vnd.github.v3+json"
    }
    headers.update(default_headers)

    logging.info(f"Making {method} request to {url}")
    try:
        response = requests.request(method, url, headers=headers, json=json)
        response.raise_for_status()  # Raises an HTTPError for bad responses (4xx or 5xx)
        return response.json()
    except requests.exceptions.RequestException as e:
        logging.error(f"API request failed: {e}")
        raise

# --- Core Logic ---

def create_pull_request(head_branch, title, body):
    """Creates a pull request on GitHub."""
    if not GITHUB_TOKEN:
        logging.error("GITHUB_TOKEN environment variable not set.")
        raise ValueError("GITHUB_TOKEN is required for API authentication.")

    url = f"https://api.github.com/repos/{REPO_OWNER}/{REPO_NAME}/pulls"
    payload = {
        "title": title,
        "head": head_branch,
        "base": BASE_BRANCH,
        "body": body,
    }
    
    try:
        pr_data = make_api_request("POST", url, json=payload)
        logging.info(f"Successfully created pull request: {pr_data.get('html_url')}")
        return pr_data
    except Exception as e:
        logging.error(f"Failed to create pull request: {e}")
        # Potentially handle specific errors, e.g., if a PR already exists
        return None

def main():
    """Main execution function for demonstration."""
    try:
        # Example usage:
        # 1. Ensure we are on the base branch and up-to-date
        run_git_command(["git", "checkout", BASE_BRANCH])
        run_git_command(["git", "pull", "origin", BASE_BRANCH])

        # 2. Create a new branch for our changes
        new_branch = "feature/example-change"
        run_git_command(["git", "checkout", "-b", new_branch])

        # 3. (Simulate making a change)
        with open("example_change.txt", "w") as f:
            f.write("This is an automated change.")
        
        run_git_command(["git", "add", "example_change.txt"])
        run_git_command(["git", "commit", "-m", "feat: Add example change"])

        # 4. Push the new branch
        run_git_command(["git", "push", "-u", "origin", new_branch])

        # 5. Create the pull request
        pr_title = "Automated Feature: Example Change"
        pr_body = "This pull request was created automatically."
        create_pull_request(new_branch, pr_title, pr_body)

    except Exception as e:
        logging.error(f"An unexpected error occurred during the automation process: {e}")


if __name__ == "__main__":
    # This script is intended to be used as a module,
    # but a main block is included for demonstration and testing.
    logging.warning("Running main() block for demonstration. This is not the primary use case.")
    # main() # Commented out to prevent accidental execution on import
