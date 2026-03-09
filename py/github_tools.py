# This file will contain functions to interact with the GitHub API.

import requests
import os
import json
from urllib.parse import urljoin

GITHUB_TOKEN = os.getenv('GITHUB_TOKEN')
HEADERS = {
    'Authorization': f'token {GITHUB_TOKEN}',
    'Accept': 'application/vnd.github.v3+json',
}
BASE_URL = 'https://api.github.com'

def create_pull_request(repo, title, head, base, body):
    """
    Create a pull request on GitHub.
    
    Args:
        repo: Repository in format 'owner/repo'
        title: Pull request title
        head: Source branch name
        base: Target branch name
        body: Pull request description
    
    Returns:
        dict: Response from GitHub API containing PR details (number, html_url, etc.)
    
    Raises:
        Exception: If the API request fails
    """
    if not GITHUB_TOKEN:
        raise ValueError("GITHUB_TOKEN environment variable is not set")
    
    if '/' not in repo:
        raise ValueError(f"Invalid repo format: {repo}. Expected 'owner/repo'")
    
    owner, repo_name = repo.split('/', 1)
    
    url = f'{BASE_URL}/repos/{owner}/{repo_name}/pulls'
    
    payload = {
        'title': title,
        'head': head,
        'base': base,
        'body': body,
        'draft': False
    }
    
    try:
        response = requests.post(url, headers=HEADERS, json=payload)
        
        if response.status_code == 201:
            return response.json()
        elif response.status_code == 422:
            # PR might already exist or validation error
            error_data = response.json()
            raise Exception(f"GitHub API 422 error: {error_data.get('message', 'Unknown error')}")
        else:
            error_data = response.json() if response.text else {}
            raise Exception(f"GitHub API {response.status_code}: {error_data.get('message', response.text)}")
    
    except requests.RequestException as e:
        raise Exception(f"Failed to create pull request: {str(e)}")


def create_branch(repo, branch_name, source_branch='main'):
    """
    Create a new branch in a GitHub repository.
    
    Args:
        repo: Repository in format 'owner/repo'
        branch_name: Name of the new branch to create
        source_branch: Name of the branch to create from (default: 'main')
    
    Returns:
        dict: Response from GitHub API containing branch details
    
    Raises:
        Exception: If the API request fails
    """
    if not GITHUB_TOKEN:
        raise ValueError("GITHUB_TOKEN environment variable is not set")
    
    if '/' not in repo:
        raise ValueError(f"Invalid repo format: {repo}. Expected 'owner/repo'")
    
    owner, repo_name = repo.split('/', 1)
    
    # First, get the SHA of the source branch
    url = f'{BASE_URL}/repos/{owner}/{repo_name}/git/refs/heads/{source_branch}'
    
    try:
        response = requests.get(url, headers=HEADERS)
        
        if response.status_code != 200:
            raise Exception(f"Failed to get source branch {source_branch}: {response.status_code}")
        
        source_sha = response.json()['object']['sha']
        
        # Create new branch pointing to the same commit
        create_url = f'{BASE_URL}/repos/{owner}/{repo_name}/git/refs'
        payload = {
            'ref': f'refs/heads/{branch_name}',
            'sha': source_sha
        }
        
        response = requests.post(create_url, headers=HEADERS, json=payload)
        
        if response.status_code == 201:
            return response.json()
        else:
            error_data = response.json() if response.text else {}
            raise Exception(f"GitHub API {response.status_code}: {error_data.get('message', response.text)}")
    
    except requests.RequestException as e:
        raise Exception(f"Failed to create branch: {str(e)}")


def commit_file(repo, branch, file_path, content, commit_message):
    """
    Create or update a file on a branch with a commit.
    
    Args:
        repo: Repository in format 'owner/repo'
        branch: Target branch name
        file_path: Path to the file in the repository
        content: Content to write to the file
        commit_message: Git commit message
    
    Returns:
        dict: Response from GitHub API containing commit details
    
    Raises:
        Exception: If the API request fails
    """
    if not GITHUB_TOKEN:
        raise ValueError("GITHUB_TOKEN environment variable is not set")
    
    if '/' not in repo:
        raise ValueError(f"Invalid repo format: {repo}. Expected 'owner/repo'")
    
    owner, repo_name = repo.split('/', 1)
    
    # First check if file exists
    url = f'{BASE_URL}/repos/{owner}/{repo_name}/contents/{file_path}'
    
    import base64
    
    try:
        response = requests.get(url, headers=HEADERS, params={'ref': branch})
        
        sha = None
        if response.status_code == 200:
            sha = response.json()['sha']
        
        # Encode content to base64
        encoded_content = base64.b64encode(content.encode('utf-8')).decode('utf-8')
        
        payload = {
            'message': commit_message,
            'content': encoded_content,
            'branch': branch
        }
        
        if sha:
            payload['sha'] = sha
        
        response = requests.put(url, headers=HEADERS, json=payload)
        
        if response.status_code in [200, 201]:
            return response.json()
        else:
            error_data = response.json() if response.text else {}
            raise Exception(f"GitHub API {response.status_code}: {error_data.get('message', response.text)}")
    
    except requests.RequestException as e:
        raise Exception(f"Failed to commit file: {str(e)}")
