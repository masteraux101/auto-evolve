import unittest
from unittest.mock import patch, call, MagicMock
import subprocess
import os
import tempfile
import shutil

# Assuming the git_handler module is in the src directory
from src import git_handler

class TestGitHandler(unittest.TestCase):

    def setUp(self):
        """Set up a temporary directory to simulate a git repository."""
        self.test_dir = tempfile.mkdtemp()
        self.repo_path = os.path.join(self.test_dir, "test_repo")
        os.makedirs(self.repo_path)

    def tearDown(self):
        """Clean up the temporary directory after tests."""
        shutil.rmtree(self.test_dir)

    @patch('subprocess.run')
    def test_clone_repo(self, mock_run):
        """Test that clone_repo calls 'git clone' with the correct arguments."""
        mock_run.return_value = MagicMock(returncode=0, stdout='', stderr='')
        repo_url = "https://github.com/user/repo.git"
        target_path = os.path.join(self.test_dir, "clone_target")

        git_handler.clone_repo(repo_url, target_path)

        mock_run.assert_called_once_with(
            ['git', 'clone', repo_url, target_path],
            check=True, capture_output=True, text=True
        )

    @patch('subprocess.run')
    def test_create_branch(self, mock_run):
        """Test that create_branch calls 'git checkout -b' correctly."""
        mock_run.return_value = MagicMock(returncode=0, stdout='', stderr='')
        branch_name = "new-feature-branch"

        git_handler.create_branch(branch_name, self.repo_path)

        mock_run.assert_called_once_with(
            ['git', 'checkout', '-b', branch_name],
            check=True, capture_output=True, text=True, cwd=self.repo_path
        )

    @patch('subprocess.run')
    def test_add_commit_push(self, mock_run):
        """Test the sequence of add, commit, and push commands."""
        mock_run.return_value = MagicMock(returncode=0, stdout='', stderr='')
        commit_message = "feat: add new feature"
        branch_name = "feature-branch"

        git_handler.add_commit_push(commit_message, branch_name, self.repo_path)

        expected_calls = [
            call(['git', 'add', '.'], check=True, capture_output=True, text=True, cwd=self.repo_path),
            call(['git', 'commit', '-m', commit_message], check=True, capture_output=True, text=True, cwd=self.repo_path),
            call(['git', 'push', 'origin', branch_name], check=True, capture_output=True, text=True, cwd=self.repo_path)
        ]
        mock_run.assert_has_calls(expected_calls, any_order=False)
        self.assertEqual(mock_run.call_count, 3)

    @patch('subprocess.run')
    def test_get_current_branch(self, mock_run):
        """Test that the current branch name is correctly parsed from stdout."""
        expected_branch = "main"
        mock_run.return_value = MagicMock(
            returncode=0,
            stdout=f"{expected_branch}\n",
            stderr=''
        )

        branch = git_handler.get_current_branch(self.repo_path)

        self.assertEqual(branch, expected_branch)
        mock_run.assert_called_once_with(
            ['git', 'rev-parse', '--abbrev-ref', 'HEAD'],
            check=True, capture_output=True, text=True, cwd=self.repo_path
        )

    @patch('subprocess.run')
    def test_get_repo_status(self, mock_run):
        """Test that 'git status' output is returned correctly."""
        expected_status = "On branch main\nYour branch is up to date with 'origin/main'.\n\nnothing to commit, working tree clean"
        mock_run.return_value = MagicMock(
            returncode=0,
            stdout=expected_status,
            stderr=''
        )

        status = git_handler.get_repo_status(self.repo_path)

        self.assertEqual(status, expected_status)
        mock_run.assert_called_once_with(
            ['git', 'status'],
            check=True, capture_output=True, text=True, cwd=self.repo_path
        )

    @patch('subprocess.run')
    def test_command_failure_raises_exception(self, mock_run):
        """Test that a failing git command raises CalledProcessError."""
        error_message = "fatal: not a git repository"
        mock_run.side_effect = subprocess.CalledProcessError(
            returncode=128,
            cmd=['git', 'status'],
            stderr=error_message
        )

        with self.assertRaises(subprocess.CalledProcessError):
            git_handler.get_repo_status(self.repo_path)

if __name__ == '__main__':
    unittest.main()
