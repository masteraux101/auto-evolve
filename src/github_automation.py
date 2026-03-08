import subprocess
import logging
import sys

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

def run_command(command):
    """Runs a shell command and logs its output."""
    try:
        logging.info(f"Running command: {' '.join(command)}")
        result = subprocess.run(command, check=True, capture_output=True, text=True)
        if result.stdout:
            logging.info(f"stdout:\n{result.stdout}")
        if result.stderr:
            logging.warning(f"stderr:\n{result.stderr}")
        return True
    except subprocess.CalledProcessError as e:
        logging.error(f"Command '{' '.join(command)}' failed with return code {e.returncode}")
        if e.stdout:
            logging.error(f"stdout:\n{e.stdout}")
        if e.stderr:
            logging.error(f"stderr:\n{e.stderr}")
        return False
    except FileNotFoundError:
        logging.error(f"Command not found: {command[0]}. Is git installed and in your PATH?")
        return False

def create_branch(branch_name: str, base_branch: str = "dev"):
    """
    Checks out the base branch, pulls the latest changes, and creates a new branch.
    """
    logging.info(f"Creating new branch '{branch_name}' from '{base_branch}'...")
    if not run_command(["git", "checkout", base_branch]):
        logging.error(f"Failed to checkout base branch '{base_branch}'.")
        return False
    if not run_command(["git", "pull", "origin", base_branch]):
        logging.error(f"Failed to pull latest changes from '{base_branch}'.")
        return False
    if not run_command(["git", "checkout", "-b", branch_name]):
        logging.error(f"Failed to create new branch '{branch_name}'.")
        return False
    logging.info(f"Successfully created and checked out branch '{branch_name}'.")
    return True

def commit_changes(commit_message: str):
    """
    Stages all changes and commits them with the given message.
    """
    logging.info("Staging all changes...")
    if not run_command(["git", "add", "."]):
        logging.error("Failed to stage changes.")
        return False
    
    # Check if there are staged changes
    # `git diff --staged --quiet` exits with 1 if there are staged changes, 0 if not.
    result = subprocess.run(["git", "diff", "--staged", "--quiet"])
    if result.returncode == 0:
        logging.warning("No changes staged for commit.")
        return True # Considered a success as there's nothing to do.

    logging.info(f"Committing changes with message: '{commit_message}'")
    if not run_command(["git", "commit", "-m", commit_message]):
        logging.error("Failed to commit changes.")
        return False
    
    logging.info("Changes committed successfully.")
    return True

def push_branch(branch_name: str):
    """
    Pushes the specified branch to the remote repository.
    """
    logging.info(f"Pushing branch '{branch_name}' to remote 'origin'...")
    if not run_command(["git", "push", "-u", "origin", branch_name]):
        logging.error(f"Failed to push branch '{branch_name}'.")
        return False
    logging.info(f"Successfully pushed branch '{branch_name}'.")
    return True

if __name__ == '__main__':
    # Example usage:
    # python src/github_automation.py create_branch my-new-feature
    # python src/github_automation.py commit "feat: add new feature"
    # python src/github_automation.py push my-new-feature
    
    if len(sys.argv) < 3:
        print("Usage:")
        print("  python src/github_automation.py create_branch <branch_name>")
        print("  python src/github_automation.py commit \"<commit_message>\"")
        print("  python src/github_automation.py push <branch_name>")
        sys.exit(1)
        
    operation = sys.argv[1]
    
    if operation == "create_branch":
        branch_name = sys.argv[2]
        if not create_branch(branch_name):
            sys.exit(1)
    elif operation == "commit":
        commit_message = sys.argv[2]
        if not commit_changes(commit_message):
            sys.exit(1)
    elif operation == "push":
        branch_name = sys.argv[2]
        if not push_branch(branch_name):
            sys.exit(1)
    else:
        print(f"Unknown operation: {operation}")
        sys.exit(1)
