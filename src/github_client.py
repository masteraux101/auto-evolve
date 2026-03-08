import os
import requests
import json

class GitHubClient:
    """
    A client to interact with the GitHub API, specifically for creating pull requests.
    """

    def __init__(self, owner, repo, token):
        """
        Initializes the GitHubClient.

        :param owner: The owner of the repository.
        :param repo: The name of the repository.
        :param token: A GitHub personal access token for authentication.
        """
        if not all([owner, repo, token]):
            raise ValueError("owner, repo, and token must be provided.")
        
        self.owner = owner
        self.repo = repo
        self.token = token
        self.api_url = f"https://api.github.com/repos/{owner}/{repo}"
        self.headers = {
            "Authorization": f"token {self.token}",
            "Accept": "application/vnd.github.v3+json",
            "X-GitHub-Api-Version": "2022-11-28"
        }

    def create_pull_request(self, title, body, head_branch, base_branch):
        """
        Creates a pull request on the specified repository.

        :param title: The title of the pull request.
        :param body: The body/description of the pull request.
        :param head_branch: The name of the branch where your changes are implemented.
        :param base_branch: The name of the branch you want the changes pulled into.
        :return: The JSON response from the GitHub API or None if an error occurred.
        """
        pulls_url = f"{self.api_url}/pulls"
        payload = {
            "title": title,
            "body": body,
            "head": head_branch,
            "base": base_branch,
        }

        try:
            response = requests.post(pulls_url, headers=self.headers, data=json.dumps(payload))
            response.raise_for_status()  # Raises an HTTPError for bad responses (4xx or 5xx)
            
            pr_data = response.json()
            print(f"Successfully created pull request: {pr_data.get('html_url')}")
            return pr_data
        except requests.exceptions.RequestException as e:
            print(f"An error occurred while creating the pull request: {e}")
            if e.response is not None:
                print(f"Response status code: {e.response.status_code}")
                print(f"Response content: {e.response.text}")
            return None

def main():
    """
    Example usage of the GitHubClient.
    Reads configuration from environment variables and creates a pull request.
    """
    github_token = os.getenv("GITHUB_TOKEN")
    repo_full_name = os.getenv("GITHUB_REPOSITORY", "masteraux101/auto-evolve")
    head_branch = os.getenv("HEAD_BRANCH") # The new branch with changes
    base_branch = os.getenv("BASE_BRANCH", "dev")

    if not github_token:
        print("Error: GITHUB_TOKEN environment variable not set.")
        return
    
    if not head_branch:
        print("Error: HEAD_BRANCH environment variable not set.")
        return

    try:
        owner, repo = repo_full_name.split('/')
    except ValueError:
        print(f"Error: GITHUB_REPOSITORY format is invalid. Expected 'owner/repo', got '{repo_full_name}'.")
        return

    client = GitHubClient(owner=owner, repo=repo, token=github_token)

    title = f"feat: Integrate changes from {head_branch}"
    body = f"This pull request was automatically created to merge changes from `{head_branch}` into `{base_branch}`."

    client.create_pull_request(
        title=title,
        body=body,
        head_branch=head_branch,
        base_branch=base_branch
    )

if __name__ == "__main__":
    main()
