import os
import requests
import json
import logging

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

class GitHubClient:
    """
    A client to interact with the GitHub API.
    """
    def __init__(self):
        """
        Initializes the GitHub client.
        Requires GITHUB_TOKEN and GITHUB_REPOSITORY environment variables.
        """
        self.token = os.getenv("GITHUB_TOKEN")
        if not self.token:
            raise ValueError("GITHUB_TOKEN environment variable not set.")
        
        repo = os.getenv("GITHUB_REPOSITORY")
        if not repo or '/' not in repo:
            raise ValueError("GITHUB_REPOSITORY environment variable not set or in incorrect format (expected 'owner/repo').")
        
        self.owner, self.repo = repo.split('/')
        self.api_url = f"https://api.github.com/repos/{self.owner}/{self.repo}"
        self.headers = {
            "Authorization": f"token {self.token}",
            "Accept": "application/vnd.github.v3+json",
        }

    def create_pull_request(self, title: str, body: str, head: str, base: str) -> dict:
        """
        Creates a pull request on GitHub.

        Args:
            title (str): The title of the pull request.
            body (str): The body/description of the pull request.
            head (str): The name of the branch where your changes are implemented.
            base (str): The name of the branch you want the changes pulled into.

        Returns:
            dict: The JSON response from the GitHub API if successful.
        
        Raises:
            Exception: If the API request fails.
        """
        url = f"{self.api_url}/pulls"
        data = {
            "title": title,
            "body": body,
            "head": head,
            "base": base,
        }
        
        logging.info(f"Creating pull request from '{head}' to '{base}' with title: '{title}'")
        
        try:
            response = requests.post(url, headers=self.headers, data=json.dumps(data))
            response.raise_for_status()  # Raises an HTTPError for bad responses (4xx or 5xx)
            
            pr_data = response.json()
            logging.info(f"Successfully created pull request: {pr_data.get('html_url')}")
            return pr_data
        except requests.exceptions.HTTPError as http_err:
            logging.error(f"HTTP error occurred: {http_err}")
            logging.error(f"Response content: {response.text}")
            # Check for specific GitHub error messages
            if response.status_code == 422:
                error_details = response.json()
                errors = error_details.get('errors', [])
                for error in errors:
                    if error.get('message', '').startswith('A pull request already exists'):
                        logging.warning("A pull request for this branch already exists.")
            raise Exception(f"Failed to create pull request. Status code: {response.status_code}, Response: {response.text}") from http_err
        except requests.exceptions.RequestException as req_err:
            logging.error(f"Request error occurred: {req_err}")
            raise Exception("An error occurred while making the request to GitHub.") from req_err
