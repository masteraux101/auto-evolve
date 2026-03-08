

## Automatic Pull Request Creation

This feature automates the creation of pull requests. 

### Configuration
Set the following environment variables:
- `GITHUB_TOKEN`: Your personal access token.
- `GITHUB_REPOSITORY`: The repository in `owner/repo` format.

### Usage
`python create_pr.py --title "My Feature" --body "Description of changes."`