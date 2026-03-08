import os
from github import Github, GithubException

def get_github_client():
    """
    Initializes and returns a PyGithub client instance.

    Authenticates using the GITHUB_TOKEN environment variable.
    """
    token = os.getenv("GITHUB_TOKEN")
    if not token:
        raise ValueError("GITHUB_TOKEN environment variable not set.")
    return Github(token)

def create_branch(repo_name: str, new_branch_name: str, source_branch_name: str = 'dev'):
    """
    Creates a new branch in the specified repository from a source branch.

    Args:
        repo_name (str): The name of the repository (e.g., 'owner/repo').
        new_branch_name (str): The name for the new branch.
        source_branch_name (str): The name of the source branch. Defaults to 'dev'.

    Returns:
        bool: True if the branch was created successfully, False otherwise.
    """
    try:
        g = get_github_client()
        repo = g.get_repo(repo_name)

        # Get the source branch to find its latest commit SHA
        source_ref = repo.get_git_ref(f"heads/{source_branch_name}")
        source_sha = source_ref.object.sha

        # Create the new branch by creating a new ref
        ref_path = f"refs/heads/{new_branch_name}"
        repo.create_git_ref(ref=ref_path, sha=source_sha)
        
        print(f"Successfully created branch '{new_branch_name}' from '{source_branch_name}' in repo '{repo_name}'.")
        return True
    except GithubException as e:
        # Handle cases where the branch might already exist
        if e.status == 422 and "Reference already exists" in str(e.data):
            print(f"Branch '{new_branch_name}' already exists in repo '{repo_name}'.")
            # If the branch already exists, we can consider it a success for idempotency
            return True 
        else:
            print(f"An error occurred while creating the branch: {e}")
            return False
    except Exception as e:
        print(f"An unexpected error occurred: {e}")
        return False
