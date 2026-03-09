import unittest
from unittest.mock import patch, MagicMock, call
import subprocess
import os
import sys

# Add src directory to path to import github_automation
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'src')))

# Assuming these functions exist in github_automation
# We will create dummy functions if the import fails, allowing tests to be written
try:
    from github_automation import (
        clone_repo,
        create_and_checkout_branch,
        add_commit_push,
        create_pull_request,
        get_repo_name_from_url
    )
except ImportError:
    # Define dummy functions if the module or functions don't exist yet
    def clone_repo(repo_url, local_path): pass
    def create_and_checkout_branch(branch_name, repo_path): pass
    def add_commit_push(commit_message, branch_name, repo_path): pass
    def create_pull_request(repo_name, title, body, head_branch, base_branch): pass
    def get_repo_name_from_url(url): pass


class TestGitHubAutomation(unittest.TestCase):

    @patch('github_automation.subprocess.run')
    def test_clone_repo_success(self, mock_run):
        """Test successful repository cloning."""
        mock_process = MagicMock()
        mock_process.returncode = 0
        mock_process.stdout = "Cloned successfully"
        mock_process.stderr = ""
        mock_run.return_value = mock_process

        repo_url = "https://github.com/user/repo.git"
        local_path = "/tmp/repo"
        clone_repo(repo_url, local_path)

        mock_run.assert_called_once_with(
            ['git', 'clone', repo_url, local_path],
            check=True,
            capture_output=True,
            text=True
        )

    @patch('github_automation.subprocess.run')
    def test_clone_repo_failure(self, mock_run):
        """Test repository cloning failure."""
        mock_run.side_effect = subprocess.CalledProcessError(
            returncode=1,
            cmd=['git', 'clone'],
            stderr="Authentication failed"
        )

        repo_url = "https://github.com/user/repo.git"
        local_path = "/tmp/repo"
        with self.assertRaises(subprocess.CalledProcessError):
            clone_repo(repo_url, local_path)

    @patch('github_automation.subprocess.run')
    def test_create_and_checkout_branch(self, mock_run):
        """Test creating and checking out a new branch."""
        mock_process = MagicMock()
        mock_process.returncode = 0
        mock_run.return_value = mock_process
        
        branch_name = "test-branch"
        repo_path = "/tmp/repo"
        create_and_checkout_branch(branch_name, repo_path)

        mock_run.assert_called_once_with(
            ['git', 'checkout', '-b', branch_name],
            check=True,
            cwd=repo_path,
            capture_output=True,
            text=True
        )

    @patch('github_automation.subprocess.run')
    def test_add_commit_push(self, mock_run):
        """Test adding, committing, and pushing changes."""
        mock_process = MagicMock()
        mock_process.returncode = 0
        mock_run.return_value = mock_process

        commit_message = "feat: new feature"
        branch_name = "test-branch"
        repo_path = "/tmp/repo"
        add_commit_push(commit_message, branch_name, repo_path)

        expected_calls = [
            call(['git', 'add', '.'], check=True, cwd=repo_path, capture_output=True, text=True),
            call(['git', 'commit', '-m', commit_message], check=True, cwd=repo_path, capture_output=True, text=True),
            call(['git', 'push', '-u', 'origin', branch_name], check=True, cwd=repo_path, capture_output=True, text=True)
        ]
        mock_run.assert_has_calls(expected_calls, any_order=False)
        self.assertEqual(mock_run.call_count, 3)

    @patch('github_automation.requests.post')
    @patch('github_automation.os.getenv')
    def test_create_pull_request_success(self, mock_getenv, mock_post):
        """Test successful pull request creation."""
        mock_getenv.return_value = "fake_github_token"
        
        mock_response = MagicMock()
        mock_response.status_code = 201
        mock_response.json.return_value = {"html_url": "https://github.com/user/repo/pull/1"}
        mock_post.return_value = mock_response

        repo_name = "user/repo"
        title = "New Feature"
        body = "This is a new feature."
        head_branch = "test-branch"
        base_branch = "main"
        
        result = create_pull_request(repo_name, title, body, head_branch, base_branch)

        expected_url = f"https://api.github.com/repos/{repo_name}/pulls"
        expected_headers = {
            "Authorization": "token fake_github_token",
            "Accept": "application/vnd.github.v3+json"
        }
        expected_data = {
            "title": title,
            "body": body,
            "head": head_branch,
            "base": base_branch
        }
        
        mock_post.assert_called_once_with(
            expected_url,
            headers=expected_headers,
            json=expected_data
        )
        self.assertEqual(result, {"html_url": "https://github.com/user/repo/pull/1"})

    @patch('github_automation.requests.post')
    @patch('github_automation.os.getenv')
    def test_create_pull_request_failure(self, mock_getenv, mock_post):
        """Test pull request creation failure."""
        mock_getenv.return_value = "fake_github_token"

        mock_response = MagicMock()
        mock_response.status_code = 422
        mock_response.json.return_value = {"message": "Validation Failed"}
        mock_response.raise_for_status.side_effect = Exception("API Error")
        mock_post.return_value = mock_response

        with self.assertRaises(Exception):
            create_pull_request("user/repo", "title", "body", "head", "base")

    def test_get_repo_name_from_url(self):
        """Test extracting repo name from various URL formats."""
        urls = {
            "https://github.com/masteraux101/auto-evolve.git": "masteraux101/auto-evolve",
            "git@github.com:masteraux101/auto-evolve.git": "masteraux101/auto-evolve",
            "https://github.com/user/repo": "user/repo"
        }
        for url, expected in urls.items():
            with self.subTest(url=url):
                self.assertEqual(get_repo_name_from_url(url), expected)

    def test_get_repo_name_from_url_invalid(self):
        """Test invalid URL formats for repo name extraction."""
        self.assertIsNone(get_repo_name_from_url("https://example.com/user/repo.git"))


if __name__ == '__main__':
    unittest.main()
