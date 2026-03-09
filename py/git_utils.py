import subprocess
import logging

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

def run_command(command):
    """Runs a shell command and returns its output."""
    try:
        logging.info(f"Running command: {' '.join(command)}")
        result = subprocess.run(command, check=True, capture_output=True, text=True)
        logging.info(f"Command output:\n{result.stdout}")
        if result.stderr:
            logging.warning(f"Command stderr:\n{result.stderr}")
        return result.stdout.strip()
    except subprocess.CalledProcessError as e:
        logging.error(f"Command failed: {' '.join(command)}")
        logging.error(f"Return code: {e.returncode}")
        logging.error(f"Output:\n{e.stdout}")
        logging.error(f"Error output:\n{e.stderr}")
        raise

def create_branch(branch_name, base_branch='dev'):
    """
    Creates a new branch from a specified base branch.
    Args:
        branch_name (str): The name of the new branch.
        base_branch (str): The branch to create the new branch from. Defaults to 'dev'.
    """
    try:
        logging.info(f"Checking out base branch '{base_branch}'...")
        run_command(['git', 'checkout', base_branch])
        logging.info(f"Pulling latest changes for '{base_branch}'...")
        run_command(['git', 'pull'])
        logging.info(f"Creating new branch '{branch_name}' from '{base_branch}'...")
        run_command(['git', 'checkout', '-b', branch_name])
        logging.info(f"Successfully created and checked out branch '{branch_name}'.")
    except Exception as e:
        logging.error(f"Failed to create branch '{branch_name}': {e}")
        raise

def stage_changes(file_path='.'):
    """
    Stages changes in the repository.
    Args:
        file_path (str): The path to the file or directory to stage. Defaults to '.' (all changes).
    """
    try:
        logging.info(f"Staging changes for path: {file_path}")
        run_command(['git', 'add', file_path])
        logging.info("Changes staged successfully.")
    except Exception as e:
        logging.error(f"Failed to stage changes: {e}")
        raise

def create_commit(message):
    """
    Creates a commit with the given message.
    Args:
        message (str): The commit message.
    """
    try:
        logging.info(f"Creating commit with message: '{message}'")
        run_command(['git', 'commit', '-m', message])
        logging.info("Commit created successfully.")
    except subprocess.CalledProcessError as e:
        # It's possible 'git commit' fails if there's nothing to commit.
        if "nothing to commit" in e.stdout.lower() or "nothing to commit" in e.stderr.lower():
            logging.warning("No changes to commit.")
        else:
            raise
    except Exception as e:
        logging.error(f"Failed to create commit: {e}")
        raise

def push_branch(branch_name, remote='origin'):
    """
    Pushes the specified branch to the remote repository.
    Args:
        branch_name (str): The name of the branch to push.
        remote (str): The name of the remote. Defaults to 'origin'.
    """
    try:
        logging.info(f"Pushing branch '{branch_name}' to remote '{remote}'...")
        run_command(['git', 'push', '-u', remote, branch_name])
        logging.info(f"Branch '{branch_name}' pushed successfully.")
    except Exception as e:
        logging.error(f"Failed to push branch '{branch_name}': {e}")
        raise
