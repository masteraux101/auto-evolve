# auto-evolve

`auto-evolve` is a command-line tool that uses an AI agent to autonomously evolve a codebase based on a given task description.

## Installation

Clone the repository and install the dependencies:

```bash
git clone https://github.com/masteraux101/auto-evolve.git
cd auto-evolve
pip install -r requirements.txt
```

## Usage

To run the agent, use the following command:

```bash
auto-evolve --task "Refactor the user authentication module to use JWT."
```

The agent will analyze the codebase, plan the necessary changes, and apply them.

## Features

### Automatic Pull Requests

`auto-evolve` can automatically create a pull request with the changes it makes. This streamlines the development workflow by allowing for immediate review and integration of AI-generated code.

#### Configuration

To enable this feature, you must set the `GITHUB_API_TOKEN` environment variable. This token is used to authenticate with the GitHub API.

```bash
export GITHUB_API_TOKEN=your_personal_access_token
```

The token needs `repo` scope to create pull requests in your repository.

#### Usage

To have the agent create a pull request after applying changes, use the `--create-pr` flag:

```bash
auto-evolve --task "your task description" --create-pr
```

This will commit the changes to a new branch and open a pull request against your target branch.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## License

This project is licensed under the MIT License.
