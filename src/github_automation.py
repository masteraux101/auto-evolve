import os
import subprocess
import requests
import json
from datetime import datetime

# --- Configuration ---
# These should be configured for your repository
REPO_OWNER = "masteraux101"
REPO_NAME = "auto-evolve"
BASE_BRANCH = "dev"
# Ensure GITHUB_TOKEN is set in your environment variables
GITHUB_TOKEN = os.getenv("GITHUB_TOKEN")

# --- Git Functions ---

def run_command(command):
    """Helper function to run a shell command and handle errors."""
    try:
        result = subprocess.run(command, check=True, capture_output=True, text=True)
        print(result.stdout)
        return result
    except subprocess.CalledProcessError as e:
        print(f"Error executing command: {' '.join(command)}")
        print(f"Stderr: {e.stderr}")
        raise

def create_branch(branch_name):
    """Creates and checks out a new branch from the base branch."""
    print(f"Creating and switching to new branch: {branch_name} from {BASE_BRANCH}")
    run_command(["git", "checkout", BASE_BRANCH])
    run_command(["git", "pull", "origin", BASE_BRANCH])
    run_command(["git", "checkout", "-b", branch_name])
    print(f"Successfully switched to a new branch: {branch_name}")

def add_commit_push(file_paths, commit_message, branch_name):
    """Adds, commits, and pushes changes to the specified branch."""
    print(f"Adding files to commit: {', '.join(file_paths)}")
    run_command(["git", "add", *file_paths])
    
    print(f"Committing with message: '{commit_message}'")
    run_command(["git", "commit", "-m", commit_message])
    
    print(f"Pushing changes to origin/{branch_name}")
    run_command(["git", "push", "-u", "origin", branch_name])
    print("Changes pushed successfully.")

# --- GitHub API Functions ---

def create_pull_request(branch_name, title, body):
    """Creates a pull request on GitHub."""
    print(f"Creating pull request for branch '{branch_name}' against '{BASE_BRANCH}'")
    url = f"https://api.github.com/repos/{REPO_OWNER}/{REPO_NAME}/pulls"
    headers = {
        "Authorization": f"token {GITHUB_TOKEN}",
        "Accept": "application/vnd.github.v3+json",
    }
    data = {
        "title": title,
        "head": branch_name,
        "base": BASE_BRANCH,
        "body": body,
    }
    
    response = requests.post(url, headers=headers, json=data)
    
    if response.status_code == 201:
        print("Pull request created successfully.")
        return response.json()
    else:
        print(f"Failed to create pull request. Status code: {response.status_code}")
        print(f"Response: {response.text}")
        return None

# --- Main Workflow Orchestration ---

def main():
    """
    Orchestrates the full workflow:
    1. Creates a new branch.
    2. Commits changes (in this example, this script itself).
    3. Pushes the branch to the remote repository.
    4. Creates a pull request.
    5. Parses and reports the pull request URL and number.
    """
    if not GITHUB_TOKEN:
        print("Error: GITHUB_TOKEN environment variable not set.")
        return

    try:
        # 1. Define parameters for the run
        timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        new_branch_name = f"feature/auto-pr-{timestamp}"
        commit_message = "feat: Implement automated workflow orchestration"
        pr_title = "feat: Implement automated workflow orchestration"
        pr_body = "This PR was automatically created by the `github_automation.py` script.\n\nIt orchestrates the process of branching, committing, pushing, and creating a pull request."
        
        # In a real scenario, this list would be populated with the paths of files
        # that were actually changed by the automated process.
        # For this example, we'll assume this script is the change.
        files_to_commit = ["src/github_automation.py"]

        # 2. Execute the workflow
        create_branch(new_branch_name)
        add_commit_push(files_to_commit, commit_message, new_branch_name)
        pr_response_json = create_pull_request(new_branch_name, pr_title, pr_body)

        # 3. Handle and report the API response
        if pr_response_json:
            pr_number = pr_response_json.get("number")
            pr_url = pr_response_json.get("html_url")
            
            if pr_number and pr_url:
                print("\n--- Pull Request Details ---")
                print(f"  Number: {pr_number}")
                print(f"  URL: {pr_url}")
                print("--------------------------")
            else:
                print("\nError: Could not parse PR number or URL from API response.")
                print("Full response:")
                print(json.dumps(pr_response_json, indent=2))
        else:
            print("\nWorkflow finished with errors: Pull request creation failed.")

    except Exception as e:
        print(f"\nAn unexpected error occurred during the workflow: {e}")

if __name__ == "__main__":
    main()
