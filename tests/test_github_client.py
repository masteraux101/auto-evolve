import pytest
import requests
from unittest.mock import patch, MagicMock

# Assuming the client is in src/github_client.py
# This might need adjustment based on the actual project structure and PYTHONPATH.
from src.github_client import GitHubClient

# --- Test Constants ---
TEST_TOKEN = "fake_token"
TEST_OWNER = "test_owner"
TEST_REPO = "test_repo"
BASE_API_URL = f"https://api.github.com/repos/{TEST_OWNER}/{TEST_REPO}"

# --- Pytest Fixture ---
@pytest.fixture
def client():
    """Provides a GitHubClient instance for tests."""
    # In a real scenario, you might load these from a test configuration
    return GitHubClient(token=TEST_TOKEN, repo_owner=TEST_OWNER, repo_name=TEST_REPO)

# --- Test Cases ---

@patch('src.github_client.requests.get')
def test_get_issue_success(mock_get, client):
    """
    Tests that get_issue successfully retrieves and parses an issue.
    """
    issue_number = 42
    mock_response = MagicMock()
    mock_response.status_code = 200
    expected_issue = {"id": 1, "number": issue_number, "title": "Test Issue"}
    mock_response.json.return_value = expected_issue
    mock_get.return_value = mock_response

    issue = client.get_issue(issue_number)

    expected_url = f"{BASE_API_URL}/issues/{issue_number}"
    mock_get.assert_called_once_with(expected_url, headers=client.headers)
    mock_response.raise_for_status.assert_called_once()
    assert issue == expected_issue

@patch('src.github_client.requests.get')
def test_get_issue_failure(mock_get, client):
    """
    Tests that get_issue raises an HTTPError on API failure.
    """
    issue_number = 99
    mock_response = MagicMock()
    mock_response.status_code = 404
    mock_response.raise_for_status.side_effect = requests.exceptions.HTTPError("404 Client Error: Not Found")
    mock_get.return_value = mock_response

    with pytest.raises(requests.exceptions.HTTPError):
        client.get_issue(issue_number)

    expected_url = f"{BASE_API_URL}/issues/{issue_number}"
    mock_get.assert_called_once_with(expected_url, headers=client.headers)

@patch('src.github_client.requests.post')
def test_create_comment_success(mock_post, client):
    """
    Tests that create_comment successfully posts a comment.
    """
    issue_number = 42
    comment_body = "This is a test comment."
    mock_response = MagicMock()
    mock_response.status_code = 201
    expected_comment = {"id": 123, "body": comment_body}
    mock_response.json.return_value = expected_comment
    mock_post.return_value = mock_response

    comment = client.create_comment(issue_number, comment_body)

    expected_url = f"{BASE_API_URL}/issues/{issue_number}/comments"
    expected_payload = {"body": comment_body}
    mock_post.assert_called_once_with(expected_url, headers=client.headers, json=expected_payload)
    mock_response.raise_for_status.assert_called_once()
    assert comment == expected_comment

@patch('src.github_client.requests.get')
def test_get_open_issues_success(mock_get, client):
    """
    Tests that get_open_issues successfully retrieves a list of open issues.
    """
    mock_response = MagicMock()
    mock_response.status_code = 200
    expected_issues = [
        {"id": 1, "number": 1, "title": "First Issue", "state": "open"},
        {"id": 2, "number": 2, "title": "Second Issue", "state": "open"},
    ]
    mock_response.json.return_value = expected_issues
    mock_get.return_value = mock_response

    issues = client.get_open_issues()

    expected_url = f"{BASE_API_URL}/issues"
    expected_params = {"state": "open"}
    mock_get.assert_called_once_with(expected_url, headers=client.headers, params=expected_params)
    mock_response.raise_for_status.assert_called_once()
    assert issues == expected_issues

@patch('src.github_client.requests.get')
def test_get_repo_content_success(mock_get, client):
    """
    Tests successful retrieval of repository file content.
    """
    file_path = "src/main.py"
    mock_response = MagicMock()
    mock_response.status_code = 200
    expected_content = {
        "name": "main.py",
        "path": "src/main.py",
        "sha": "some_sha",
        "content": "cHJpbnQoJ2hlbGxvLCB3b3JsZCcp", # base64 of "print('hello, world')"
        "encoding": "base64"
    }
    mock_response.json.return_value = expected_content
    mock_get.return_value = mock_response

    content = client.get_repo_content(file_path)

    expected_url = f"{BASE_API_URL}/contents/{file_path}"
    mock_get.assert_called_once_with(expected_url, headers=client.headers)
    assert content == expected_content

@patch('src.github_client.requests.put')
def test_update_file_success(mock_put, client):
    """
    Tests successful update of a file in the repository.
    This assumes the client has an 'update_file' method.
    """
    file_path = "src/main.py"
    message = "feat: update main.py"
    content_b64 = "bmV3IGNvbnRlbnQ=" # base64 of "new content"
    sha = "old_file_sha"
    branch = "dev"

    mock_response = MagicMock()
    mock_response.status_code = 200
    expected_response = {"commit": {"sha": "new_commit_sha"}}
    mock_response.json.return_value = expected_response
    mock_put.return_value = mock_response

    # This method name is an assumption
    response = client.update_file(file_path, message, content_b64, sha, branch)

    expected_url = f"{BASE_API_URL}/contents/{file_path}"
    expected_payload = {
        "message": message,
        "content": content_b64,
        "sha": sha,
        "branch": branch
    }
    mock_put.assert_called_once_with(expected_url, headers=client.headers, json=expected_payload)
    assert response == expected_response

@patch('src.github_client.requests.put')
def test_create_file_success(mock_put, client):
    """
    Tests successful creation of a new file in the repository.
    This assumes the client has a 'create_file' method.
    """
    file_path = "src/new_file.py"
    message = "feat: add new_file.py"
    content_b64 = "cHJpbnQoJ25ldyBmaWxlJyk=" # base64 of "print('new file')"
    branch = "dev"

    mock_response = MagicMock()
    mock_response.status_code = 201
    expected_response = {"commit": {"sha": "new_commit_sha_for_create"}}
    mock_response.json.return_value = expected_response
    mock_put.return_value = mock_response

    # This method name is an assumption
    response = client.create_file(file_path, message, content_b64, branch)

    expected_url = f"{BASE_API_URL}/contents/{file_path}"
    expected_payload = {
        "message": message,
        "content": content_b64,
        "branch": branch
    }
    mock_put.assert_called_once_with(expected_url, headers=client.headers, json=expected_payload)
    assert response == expected_response
