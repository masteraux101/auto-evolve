import os
import requests
import json

class GitHubService:
    """
    A service to interact with the GitHub API.
    """

    def __init__(self, token=None, repo=None):
        """
        Initializes the GitHubService.

        Args:
            token (str, optional): GitHub personal access token. Defaults to GITHUB_TOKEN env var.
            repo (str, optional): The repository name in 'owner/repo' format. Defaults to GITHUB_REPOSITORY env var.
        """
        self.token = token or os.getenv('GITHUB_TOKEN')
        self.repo = repo or os.getenv('GITHUB_REPOSITORY')
        if not self.token:
            raise ValueError("GitHub token not provided. Set GITHUB_TOKEN environment variable.")
        if not self.repo:
            raise ValueError("Repository name not provided. Set GITHUB_REPOSITORY environment variable.")
        
        self.api_url = f"https://api.github.com/repos/{self.repo}"
        self.headers = {
            "Authorization": f"token {self.token}",
            "Accept": "application/vnd.github.v3+json",
        }

    def create_pull_request(self, head, base, title, body):
        """
        Creates a pull request on GitHub.

        Args:
            head (str): The name of the branch where your changes are implemented.
            base (str): The name of the branch you want the changes pulled into.
            title (str): The title of the pull request.
            body (str): The contents of the pull request.

        Returns:
            dict: The JSON response from the GitHub API.
        
        Raises:
            requests.exceptions.HTTPError: If the API request fails.
        """
        url = f"{self.api_url}/pulls"
        data = {
            "title": title,
            "body": body,
            "head": head,
            "base": base,
        }
        
        response = requests.post(url, headers=self.headers, data=json.dumps(data))
        response.raise_for_status()  # Raises an HTTPError for bad responses (4xx or 5xx)
        
        return response.json()

if __name__ == '__main__':
    # Example usage (requires environment variables to be set)
    # export GITHUB_TOKEN="your_github_token"
    # export GITHUB_REPOSITORY="owner/repo"
    
    try:
        github_service = GitHubService()
        
        # Example PR creation
        # pr_response = github_service.create_pull_request(
        #     head="dev-branch",
        #     base="main",
        #     title="feat: New feature",
        #     body="This PR introduces a new feature. Please review."
        # )
        # print("Pull Request created successfully:")
        # print(json.dumps(pr_response, indent=2))
        print("GitHubService initialized successfully. Ready to use.")
        print(f"Target repository: {github_service.repo}")

    except (ValueError, requests.exceptions.HTTPError) as e:
        print(f"An error occurred: {e}")
