import subprocess
import logging
import os

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

class GitHandler:
    """
    A wrapper for local Git operations.
    """

    def __init__(self, repo_path='.'):
        """
        Initializes the GitHandler.
        :param repo_path: The path to the local git repository.
        """
        if not os.path.isdir(os.path.join(repo_path, '.git')):
            raise ValueError(f"'{repo_path}' is not a valid git repository.")
        self.repo_path = repo_path

    def _run_command(self, command):
        """
        Runs a shell command in the repository's directory.
        :param command: A list of command arguments.
        :return: The command's stdout.
        :raises: CalledProcessError if the command fails.
        """
        try:
            logging.info(f"Running command: {' '.join(command)}")
            result = subprocess.run(
                command,
                cwd=self.repo_path,
                check=True,
                capture_output=True,
                text=True
            )
            logging.info(f"Command output:\n{result.stdout}")
            if result.stderr:
                logging.warning(f"Command stderr:\n{result.stderr}")
            return result.stdout
        except subprocess.CalledProcessError as e:
            logging.error(f"Command failed: {' '.join(command)}")
            logging.error(f"Stderr: {e.stderr}")
            logging.error(f"Stdout: {e.stdout}")
            raise

    def create_branch(self, branch_name, base_branch='dev'):
        """
        Creates a new branch from a base branch.
        :param branch_name: The name of the new branch.
        :param base_branch: The branch to branch off from. Defaults to 'dev'.
        """
        logging.info(f"Creating branch '{branch_name}' from '{base_branch}'")
        self._run_command(['git', 'checkout', base_branch])
        self._run_command(['git', 'pull', 'origin', base_branch])
        self._run_command(['git', 'checkout', '-b', branch_name])
        logging.info(f"Successfully created and checked out branch '{branch_name}'.")

    def add_commit(self, files, commit_message):
        """
        Adds specified files and commits them.
        :param files: A list of file paths to add.
        :param commit_message: The commit message.
        """
        if not files:
            logging.warning("No files to add and commit.")
            return
        logging.info(f"Adding files: {files}")
        self._run_command(['git', 'add'] + files)
        logging.info(f"Committing with message: '{commit_message}'")
        self._run_command(['git', 'commit', '-m', commit_message])
        logging.info("Successfully committed changes.")

    def push_branch(self, branch_name, remote='origin'):
        """
        Pushes the new branch to the remote repository.
        :param branch_name: The name of the branch to push.
        :param remote: The name of the remote. Defaults to 'origin'.
        """
        logging.info(f"Pushing branch '{branch_name}' to remote '{remote}'.")
        self._run_command(['git', 'push', '-u', remote, branch_name])
        logging.info(f"Successfully pushed branch '{branch_name}'.")

if __name__ == '__main__':
    # Example usage (for testing purposes)
    try:
        # This part is for demonstration and should not be run in production
        # without proper configuration and safety checks.
        print("This is a module for programmatic git operations. See example usage in the source code.")
    except (ValueError, subprocess.CalledProcessError) as e:
        print(f"An error occurred: {e}")
