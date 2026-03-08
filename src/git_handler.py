import subprocess
import os

def _run_command(command, cwd=None):
    """Helper function to run a shell command and return its output."""
    try:
        result = subprocess.run(
            command,
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            cwd=cwd
        )
        return result.stdout.strip()
    except subprocess.CalledProcessError as e:
        print(f"Error executing command: {' '.join(command)}")
        print(f"Stderr: {e.stderr}")
        raise

def create_branch(branch_name, base_branch='dev'):
    """
    Creates a new branch from a base branch.
    """
    print(f"Switching to base branch '{base_branch}'...")
    _run_command(['git', 'checkout', base_branch])
    print(f"Pulling latest changes for '{base_branch}'...")
    _run_command(['git', 'pull'])
    print(f"Creating and switching to new branch '{branch_name}'...")
    _run_command(['git', 'checkout', '-b', branch_name])
    print(f"Successfully created and switched to branch '{branch_name}'.")

def add_files(files):
    """
    Adds a list of files to the staging area.
    """
    if not files:
        print("No files to add.")
        return
    print(f"Adding files to staging: {', '.join(files)}")
    command = ['git', 'add'] + files
    _run_command(command)
    print("Files added successfully.")

def commit_changes(message):
    """
    Commits the staged changes with a given message.
    """
    print(f"Committing changes with message: '{message}'")
    _run_command(['git', 'commit', '-m', message])
    print("Changes committed successfully.")

def push_branch(branch_name):
    """
    Pushes the specified branch to the remote repository.
    """
    print(f"Pushing branch '{branch_name}' to remote 'origin'...")
    _run_command(['git', 'push', '-u', 'origin', branch_name])
    print(f"Branch '{branch_name}' pushed successfully.")

def get_current_branch():
    """
    Gets the current active Git branch.
    """
    return _run_command(['git', 'rev-parse', '--abbrev-ref', 'HEAD'])
