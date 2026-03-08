

## Automatic Pull Request Creation

This feature allows for the automatic creation of a pull request via the command line.

### Configuration

Export your GitHub Personal Access Token:
```bash
export GITHUB_TOKEN='your_token_here'
```

### Usage

```bash
python main.py auto-pr --title "feat: New awesome feature" --body "This PR implements..."
```
