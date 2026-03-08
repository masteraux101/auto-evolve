import os
import requests
import json

def create_pull_request(branch_name, title, body):
    """
    Creates a pull request on GitHub.

    Args:
        branch_name (str): The name of the branch to merge from.
        title (str): The title of the pull request.
        body (str): The body/description of the pull request.

    Returns:
        dict: The JSON response from the GitHub API if successful, otherwise None.
    """
    github_token = os.getenv("GITHUB_TOKEN")
    repo = os.getenv("GITHUB_REPOSITORY")

    if not github_token:
        print("Error: GITHUB_TOKEN environment variable not set.")
        return None
    if not repo:
        print("Error: GITHUB_REPOSITORY environment variable not set.")
        return None

    url = f"https://api.github.com/repos/{repo}/pulls"
    
    headers = {
        "Authorization": f"token {github_token}",
        "Accept": "application/vnd.github.v3+json",
    }
    
    data = {
        "title": title,
        "body": body,
        "head": branch_name,
        "base": "dev",
    }
    
    try:
        response = requests.post(url, headers=headers, data=json.dumps(data))
        response.raise_for_status()  # Raises an HTTPError for bad responses (4xx or 5xx)
        
        pr_data = response.json()
        print(f"Successfully created pull request: {pr_data.get('html_url')}")
        return pr_data
        
    except requests.exceptions.RequestException as e:
        print(f"Error creating pull request: {e}")
        if hasattr(e, 'response') and e.response:
            print(f"Response status code: {e.response.status_code}")
            print(f"Response content: {e.response.text}")
        return None
