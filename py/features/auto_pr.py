import logging
from typing import List, Dict, Tuple

logging.basicConfig(level=logging.INFO)

def create_pull_request_from_changes(
    github_client,
    branch_name: str,
    commit_message: str,
    pr_title: str,
    pr_body: str,
    file_changes: List[Dict[str, str]],
    base_branch: str = "dev"
) -> Tuple[int, str]:
    """
    Orchestrates the end-to-end process of creating a pull request with specified code changes.

    Args:
        github_client: An instance of the GithubClient.
        branch_name: The name of the new branch to create.
        commit_message: The commit message for the changes.
        pr_title: The title of the pull request.
        pr_body: The body/description of the pull request.
        file_changes: A list of dictionaries, each with 'path' and 'content' for a file.
        base_branch: The branch to create the new branch from and open the PR against.

    Returns:
        A tuple containing the pull request number and its HTML URL.
    """
    try:
        # 1. Create a new branch from the base branch
        logging.info(f"Creating branch '{branch_name}' from '{base_branch}'...")
        base_branch_sha = github_client.get_branch_sha(base_branch)
        github_client.create_branch(branch_name, base_branch_sha)
        logging.info(f"Branch '{branch_name}' created successfully.")

        # 2. Commit the specified code changes to the new branch
        logging.info(f"Committing changes to '{branch_name}'...")
        
        # Get the latest commit on the new branch to use as a parent
        latest_commit_sha = github_client.get_branch_sha(branch_name)
        latest_commit = github_client.get_commit(latest_commit_sha)
        base_tree_sha = latest_commit['tree']['sha']

        # Create blobs for each file change
        tree_items = []
        for change in file_changes:
            blob_sha = github_client.create_blob(change['content'])
            tree_items.append({
                "path": change['path'],
                "mode": "100644",  # file
                "type": "blob",
                "sha": blob_sha
            })

        # Create a new tree with the new blobs
        new_tree_sha = github_client.create_tree(base_tree_sha, tree_items)

        # Create a new commit
        new_commit_sha = github_client.create_commit(
            message=commit_message,
            tree_sha=new_tree_sha,
            parent_sha=latest_commit_sha
        )

        # Update the branch to point to the new commit
        github_client.update_branch(branch_name, new_commit_sha)
        logging.info(f"Changes committed successfully. Commit SHA: {new_commit_sha}")

        # 3. Create a pull request
        logging.info(f"Creating pull request from '{branch_name}' to '{base_branch}'...")
        pull_request = github_client.create_pull_request(
            head=branch_name,
            base=base_branch,
            title=pr_title,
            body=pr_body
        )
        pr_number = pull_request['number']
        pr_url = pull_request['html_url']
        logging.info(f"Pull request created successfully: {pr_url}")

        return pr_number, pr_url

    except Exception as e:
        logging.error(f"Failed to create pull request: {e}")
        raise
