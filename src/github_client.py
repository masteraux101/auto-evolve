import requests
import os
import json
import base64

class GitHubClient:
    """
    A client for interacting with the GitHub REST API.
    """
    API_URL = "https://api.github.com"

    def __init__(self, owner, repo, token):
        """
        Initializes the GitHub client.
        :param owner: The owner of the repository.
        :param repo: The name of the repository.
        :param token: A GitHub personal access token for authentication.
        """
        self.owner = owner
        self.repo = repo
        self.token = token
        self.session = requests.Session()
        self.session.headers.update({
            "Authorization": f"token {self.token}",
            "Accept": "application/vnd.github.v3+json",
        })

    def _request(self, method, endpoint, **kwargs):
        """
        Makes a request to the GitHub API.
        :param method: The HTTP method (GET, POST, PATCH, etc.).
        :param endpoint: The API endpoint (e.g., /repos/{owner}/{repo}/...).
        :param kwargs: Additional arguments to pass to requests.
        :return: The JSON response.
        """
        url = f"{self.API_URL}{endpoint}"
        response = self.session.request(method, url, **kwargs)
        response.raise_for_status()
        return response.json() if response.content else None

    def get_ref(self, ref):
        """
        Gets the SHA for a given reference.
        :param ref: The reference (e.g., 'heads/main').
        :return: The SHA of the reference.
        """
        endpoint = f"/repos/{self.owner}/{self.repo}/git/refs/{ref}"
        data = self._request("GET", endpoint)
        return data["object"]["sha"]

    def create_branch(self, new_branch_name, from_branch="main"):
        """
        Creates a new branch from an existing branch.
        :param new_branch_name: The name of the new branch.
        :param from_branch: The branch to create from.
        :return: The JSON response from the API.
        """
        from_sha = self.get_ref(f"heads/{from_branch}")
        endpoint = f"/repos/{self.owner}/{self.repo}/git/refs"
        payload = {
            "ref": f"refs/heads/{new_branch_name}",
            "sha": from_sha,
        }
        return self._request("POST", endpoint, json=payload)

    def create_blob(self, content):
        """
        Creates a new blob (file content).
        :param content: The content of the file.
        :return: The SHA of the new blob.
        """
        endpoint = f"/repos/{self.owner}/{self.repo}/git/blobs"
        payload = {
            "content": content,
            "encoding": "utf-8",
        }
        data = self._request("POST", endpoint, json=payload)
        return data["sha"]

    def create_tree(self, base_tree_sha, file_path, blob_sha):
        """
        Creates a new tree object.
        :param base_tree_sha: The SHA of the base tree.
        :param file_path: The path of the file in the repository.
        :param blob_sha: The SHA of the blob for the file.
        :return: The SHA of the new tree.
        """
        endpoint = f"/repos/{self.owner}/{self.repo}/git/trees"
        payload = {
            "base_tree": base_tree_sha,
            "tree": [
                {
                    "path": file_path,
                    "mode": "100644",
                    "type": "blob",
                    "sha": blob_sha,
                }
            ],
        }
        data = self._request("POST", endpoint, json=payload)
        return data["sha"]

    def create_commit(self, message, tree_sha, parent_commit_sha):
        """
        Creates a new commit.
        :param message: The commit message.
        :param tree_sha: The SHA of the tree for this commit.
        :param parent_commit_sha: The SHA of the parent commit.
        :return: The SHA of the new commit.
        """
        endpoint = f"/repos/{self.owner}/{self.repo}/git/commits"
        payload = {
            "message": message,
            "tree": tree_sha,
            "parents": [parent_commit_sha],
        }
        data = self._request("POST", endpoint, json=payload)
        return data["sha"]

    def update_ref(self, ref, commit_sha):
        """
        Updates a reference to point to a new commit.
        :param ref: The reference to update (e.g., 'heads/main').
        :param commit_sha: The SHA of the new commit.
        :return: The JSON response from the API.
        """
        endpoint = f"/repos/{self.owner}/{self.repo}/git/refs/{ref}"
        payload = {
            "sha": commit_sha,
            "force": False, # Set to True to force update
        }
        return self._request("PATCH", endpoint, json=payload)

    def commit_files(self, branch_name, files, commit_message):
        """
        Commits one or more files to a branch.
        :param branch_name: The name of the branch to commit to.
        :param files: A list of dictionaries, each with 'path' and 'content'.
        :param commit_message: The commit message.
        :return: The JSON response from the final ref update.
        """
        ref = f"heads/{branch_name}"
        latest_commit_sha = self.get_ref(ref)
        
        latest_commit_endpoint = f"/repos/{self.owner}/{self.repo}/git/commits/{latest_commit_sha}"
        latest_commit_data = self._request("GET", latest_commit_endpoint)
        base_tree_sha = latest_commit_data["tree"]["sha"]

        tree_items = []
        for file_info in files:
            blob_sha = self.create_blob(file_info["content"])
            tree_items.append({
                "path": file_info["path"],
                "mode": "100644",
                "type": "blob",
                "sha": blob_sha,
            })

        tree_endpoint = f"/repos/{self.owner}/{self.repo}/git/trees"
        tree_payload = {
            "base_tree": base_tree_sha,
            "tree": tree_items,
        }
        new_tree_data = self._request("POST", tree_endpoint, json=tree_payload)
        new_tree_sha = new_tree_data["sha"]

        new_commit_sha = self.create_commit(commit_message, new_tree_sha, latest_commit_sha)
        
        return self.update_ref(ref, new_commit_sha)


    def create_pull_request(self, title, body, head_branch, base_branch):
        """
        Creates a new pull request.
        :param title: The title of the pull request.
        :param body: The body/description of the pull request.
        :param head_branch: The branch where your changes are implemented.
        :param base_branch: The branch you want the changes pulled into.
        :return: The JSON response from the API.
        """
        endpoint = f"/repos/{self.owner}/{self.repo}/pulls"
        payload = {
            "title": title,
            "body": body,
            "head": head_branch,
            "base": base_branch,
        }
        return self._request("POST", endpoint, json=payload)

if __name__ == '__main__':
    # Example usage:
    # Requires GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO environment variables
    
    # This is an example and will not run in the current context.
    # It demonstrates how the client could be used.
    
    token = os.getenv("GITHUB_TOKEN")
    owner = os.getenv("GITHUB_OWNER")
    repo = os.getenv("GITHUB_REPO")

    if not all([token, owner, repo]):
        print("Please set GITHUB_TOKEN, GITHUB_OWNER, and GITHUB_REPO environment variables.")
    else:
        client = GitHubClient(owner=owner, repo=repo, token=token)
        
        try:
            # 1. Create a new branch
            new_branch = "feature/my-new-feature"
            print(f"Creating branch: {new_branch}")
            client.create_branch(new_branch, from_branch="main")
            print("Branch created successfully.")

            # 2. Commit a new file to the branch
            file_content = "Hello, World!\nThis is a new file."
            file_path = "src/new_file.txt"
            commit_msg = "feat: Add new_file.txt"
            print(f"Committing file '{file_path}' to branch '{new_branch}'")
            client.commit_files(
                branch_name=new_branch,
                files=[{"path": file_path, "content": file_content}],
                commit_message=commit_msg
            )
            print("File committed successfully.")

            # 3. Create a pull request
            pr_title = "Add my new feature"
            pr_body = "This PR adds an important new file."
            print(f"Creating pull request from '{new_branch}' to 'main'")
            pr_response = client.create_pull_request(
                title=pr_title,
                body=pr_body,
                head_branch=new_branch,
                base_branch="main"
            )
            print(f"Pull request created successfully: {pr_response['html_url']}")

        except requests.exceptions.HTTPError as e:
            print(f"An HTTP error occurred: {e}")
            print(f"Response body: {e.response.text}")
        except Exception as e:
            print(f"An unexpected error occurred: {e}")
