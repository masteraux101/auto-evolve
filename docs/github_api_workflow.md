# GitHub API Workflow for Creating Branches and Pull Requests

This document outlines the steps required to create a new branch, commit file changes, and open a pull request using the GitHub REST API.

## Authentication

All API requests must be authenticated. The recommended method is using a Personal Access Token (PAT) with the `repo` scope.

The token should be included in the `Authorization` header of each request:

```
Authorization: Bearer YOUR_PERSONAL_ACCESS_TOKEN
```

## 1. Create a New Branch

Creating a new branch is a two-step process.

### Step 1.1: Get the SHA of the Base Branch

First, you need the SHA of the latest commit on the branch you want to branch from (e.g., `main` or `dev`).

- **Endpoint:** `GET /repos/{owner}/{repo}/git/ref/heads/{branch}`
- **Example:** `GET /repos/masteraux101/auto-evolve/git/ref/heads/dev`
- **Success Response:** A JSON object containing the ref details. The required SHA is at `object.sha`.

### Step 1.2: Create the New Branch (Reference)

Now, create a new reference (the branch) pointing to the SHA obtained in the previous step.

- **Endpoint:** `POST /repos/{owner}/{repo}/git/refs`
- **Payload:**
  ```json
  {
    "ref": "refs/heads/your-new-feature-branch",
    "sha": "sha-from-step-1.1"
  }
  ```

## 2. Commit File Changes

Committing files via the API is more complex and involves the Git Data API. It mirrors the internal workings of Git.

### Step 2.1: Create a Blob for Each File

For each file you want to add or modify, you must create a "blob".

- **Endpoint:** `POST /repos/{owner}/{repo}/git/blobs`
- **Payload:**
  ```json
  {
    "content": "The full content of the file.",
    "encoding": "utf-8"
  }
  ```
- **Success Response:** A JSON object containing the `sha` of the newly created blob. Save this SHA.

### Step 2.2: Get the Base Tree SHA

You need the tree SHA from the latest commit on your new branch.

- **Endpoint:** `GET /repos/{owner}/{repo}/git/commits/{commit_sha}`
  - The `{commit_sha}` is the one you used to create the branch.
- **Success Response:** A JSON object for the commit. The required tree SHA is at `tree.sha`.

### Step 2.3: Create a New Tree

Create a new tree object that includes your new file blobs.

- **Endpoint:** `POST /repos/{owner}/{repo}/git/trees`
- **Payload:**
  ```json
  {
    "base_tree": "sha-from-step-2.2",
    "tree": [
      {
        "path": "src/path/to/your/file.js",
        "mode": "100644",
        "type": "blob",
        "sha": "blob-sha-from-step-2.1"
      }
      // Add more file objects here if committing multiple files
    ]
  }
  ```
  - `mode`: `100644` for a file, `100755` for an executable.
- **Success Response:** A JSON object containing the `sha` of the new tree.

### Step 2.4: Create a New Commit

Create the commit, linking the new tree and specifying the parent commit.

- **Endpoint:** `POST /repos/{owner}/{repo}/git/commits`
- **Payload:**
  ```json
  {
    "message": "feat: Implement my new feature",
    "tree": "new-tree-sha-from-step-2.3",
    "parents": ["parent-commit-sha-from-step-1.1"]
  }
  ```
- **Success Response:** A JSON object containing the `sha` of the new commit.

### Step 2.5: Update the Branch Reference

Finally, "push" the new commit by updating your branch's reference to point to the new commit SHA.

- **Endpoint:** `PATCH /repos/{owner}/{repo}/git/refs/heads/{your-new-feature-branch}`
- **Payload:**
  ```json
  {
    "sha": "new-commit-sha-from-step-2.4"
  }
  ```

## 3. Open a Pull Request

Once your changes are committed and pushed to the new branch, you can open a pull request.

- **Endpoint:** `POST /repos/{owner}/{repo}/pulls`
- **Payload:**
  ```json
  {
    "title": "My Amazing New Feature",
    "body": "This PR implements the feature and closes issue #123.",
    "head": "your-new-feature-branch",
    "base": "dev"
  }
  ```
