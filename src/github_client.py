# This module will contain functions to interact with the GitHub API.

import os
import requests

API_URL = "https://api.github.com"
GITHUB_TOKEN = os.getenv("GITHUB_TOKEN")
HEADERS = {
    "Authorization": f"token {GITHUB_TOKEN}",
    "Accept": "application/vnd.github.v3+json"
}

# Functions for creating branch, committing files, and creating PR will be implemented here.
