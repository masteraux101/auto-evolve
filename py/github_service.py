import requests
import os
import base64
import logging

class GithubService:
    def __init__(self, token, owner, repo):
        if not token:
            raise ValueError("GitHub token is required.")
        self.token = token
        self.owner = owner
        self.repo = repo
        self.headers = {
            'Authorization': f'token {self.token}',
            'Accept': 'application/vnd.github.v3+json',
        }
        self.base_url = f'https://api.github.com/repos/{self.owner}/{self.repo}'
        logging.basicConfig(level=logging.INFO)

    def _make_request(self, method, endpoint, json=None, params=None):
        url = f'{self.base_url}{endpoint}'
        try:
            response = requests.request(method, url, headers=self.headers, json=json, params=params)
            response.raise_for_status()
            if response.status_code == 204:
                return None
            return response.json()
        except requests.exceptions.HTTPError as e:
            logging.error(f"HTTP Error for {method} {url}: {e.response.status_code} {e.response.text}")
            raise
        except requests.exceptions.RequestException as e:
            logging.error(f"Request failed for {method} {url}: {e}")
            raise

    def get_issues(self):
        return self._make_request('GET', '/issues')

    def get_issue(self, issue_number):
        return self._make_request('GET', f'/issues/{issue_number}')

    def create_comment(self, issue_number, body):
        return self._make_request('POST', f'/issues/{issue_number}/comments', json={'body': body})

    def get_file_content(self, path, branch):
        try:
            endpoint = f'/contents/{path}'
            params = {'ref': branch}
            response = self._make_request('GET', endpoint, params=params)
            if response['encoding'] == 'base64':
                return base64.b64decode(response['content']).decode('utf-8')
            return response['content']
        except requests.exceptions.HTTPError as e:
            if e.response.status_code == 404:
                return None # File not found
            raise

    def get_repo_tree(self, branch, recursive=True):
        ref_data = self._make_request('GET', f'/git/refs/heads/{branch}')
        commit_sha = ref_data['object']['sha']
        commit_data = self._make_request('GET', f'/git/commits/{commit_sha}')
        tree_sha = commit_data['tree']['sha']
        params = {'recursive': '1'} if recursive else {}
        tree_data = self._make_request('GET', f'/git/trees/{tree_sha}', params=params)
        return tree_data['tree']

    def commit_and_push(self, branch, commit_message, file_changes):
        """
        Commits and pushes file changes to a specified branch.

        :param branch: The branch to commit to.
        :param commit_message: The commit message.
        :param file_changes: A list of dictionaries, each with 'path' and 'content'.
        """
        # 1. Get the reference for the branch
        try:
            ref_data = self._make_request('GET', f'/git/refs/heads/{branch}')
            latest_commit_sha = ref_data['object']['sha']
        except requests.exceptions.HTTPError as e:
            if e.response.status_code == 404:
                logging.error(f"Branch '{branch}' not found.")
                raise
            raise

        # 2. Get the latest commit to find the base tree SHA
        commit_data = self._make_request('GET', f'/git/commits/{latest_commit_sha}')
        base_tree_sha = commit_data['tree']['sha']

        # 3. Create blobs for each file change
        tree_items = []
        for change in file_changes:
            blob_data = {
                'content': change['content'],
                'encoding': 'utf-8'
            }
            blob_info = self._make_request('POST', '/git/blobs', json=blob_data)
            tree_items.append({
                'path': change['path'],
                'mode': '100644',  # file
                'type': 'blob',
                'sha': blob_info['sha']
            })

        # 4. Create a new tree
        new_tree_data = {
            'base_tree': base_tree_sha,
            'tree': tree_items
        }
        new_tree_info = self._make_request('POST', '/git/trees', json=new_tree_data)
        new_tree_sha = new_tree_info['sha']

        # 5. Create a new commit
        new_commit_data = {
            'message': commit_message,
            'tree': new_tree_sha,
            'parents': [latest_commit_sha]
        }
        new_commit_info = self._make_request('POST', '/git/commits', json=new_commit_data)
        new_commit_sha = new_commit_info['sha']

        # 6. Update the branch reference
        update_ref_data = {
            'sha': new_commit_sha
        }
        self._make_request('PATCH', f'/git/refs/heads/{branch}', json=update_ref_data)

        logging.info(f"Successfully committed {new_commit_sha} to branch {branch}")
        return new_commit_info
