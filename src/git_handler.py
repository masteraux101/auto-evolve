import subprocess
import logging

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

def run_command(command):
    """Executes a shell command and logs its output."""
    logging.info(f"Executing command: {' '.join(command)}")
    try:
        result = subprocess.run(command, check=True, capture_output=True, text=True)
        logging.info(f"Command successful. STDOUT:\n{result.stdout}")
        if result.stderr:
            logging.warning(f"Command has STDERR:\n{result.stderr}")
        return True, result.stdout
    except subprocess.CalledProcessError as e:
        logging.error(f"Command failed with exit code {e.returncode}.")
        logging.error(f"STDOUT:\n{e.stdout}")
        logging.error(f"STDERR:\n{e.stderr}")
        return False, e.stderr
    except FileNotFoundError:
        logging.error(f"Command not found: {command[0]}. Is git installed and in your PATH?")
        return False, f"Command not found: {command[0]}"

def create_branch(branch_name, base_branch='dev'):
    """
    Creates a new branch from a base branch (default: 'dev').
    """
    logging.info(f"Attempting to create branch '{branch_name}' from '{base_branch}'...")

    # Checkout the base branch and pull the latest changes
    success, _ = run_command(['git', 'checkout', base_branch])
    if not success:
        logging.error(f"Failed to checkout base branch '{base_branch}'.")
        return False

    success, _ = run_command(['git', 'pull', 'origin', base_branch])
    if not success:
        logging.error(f"Failed to pull latest changes for '{base_branch}'.")
        return False

    # Create the new branch
    success, _ = run_command(['git', 'checkout', '-b', branch_name])
    if not success:
        logging.error(f"Failed to create new branch '{branch_name}'.")
        return False

    logging.info(f"Successfully created and checked out new branch '{branch_name}'.")
    return True

def commit_changes(message):
    """
    Commits staged changes with a given message.
    Assumes files have already been staged.
    """
    logging.info(f"Attempting to commit with message: '{message}'")

    # Commit the staged changes
    success, _ = run_command(['git', 'commit', '-m', message])
    if not success:
        logging.error("Failed to commit changes.")
        return False

    logging.info("Successfully committed changes.")
    return True

def push_branch(branch_name):
    """
    Pushes the specified branch to the remote 'origin' and sets it to track.
    """
    logging.info(f"Attempting to push branch '{branch_name}' to origin...")

    # Push the new branch to the remote
    success, _ = run_command(['git', 'push', '-u', 'origin', branch_name])
    if not success:
        logging.error(f"Failed to push branch '{branch_name}'.")
        return False

    logging.info(f"Successfully pushed branch '{branch_name}' to origin.")
    return True

if __name__ == '__main__':
    # Example usage for testing purposes
    logging.info("Running git_handler.py example usage...")
    # This part should not be run in production, it's for demonstration.
    # Replace 'test-branch' and 'Test commit message' with actual values.
    
    # Example:
    # test_branch_name = "feature/test-branch-from-script"
    # test_commit_message = "feat: Add test file via script"
    
    # print("\n--- Creating a dummy file for commit ---")
    # with open("test_file.txt", "w") as f:
    #     f.write("This is a test file.")
    
    # print("\n--- Staging the file ---")
    # run_command(['git', 'add', 'test_file.txt'])

    # print(f"\n--- Creating branch: {test_branch_name} ---")
    # if create_branch(test_branch_name):
    #     print(f"\n--- Committing changes with message: '{test_commit_message}' ---")
    #     if commit_changes(test_commit_message):
    #         print(f"\n--- Pushing branch: {test_branch_name} ---")
    #         push_branch(test_branch_name)

    print("Example usage block. Uncomment and modify to test.")
