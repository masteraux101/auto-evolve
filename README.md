# auto-evovle

A Planner/Worker agent demo built with JavaScript and `@langchain/langgraph`.

The project now includes:

- Pure JavaScript runtime (no TypeScript build chain).
- Real Gemini model calls for planning and generation.
- GitHub CRUD tools integrated as Planner and Worker tool nodes.
- A complete deploy script to push this agent + workflow to a target repo.

## Requirements

- Node.js 20+
- npm 10+

## Install

```bash
npm install
```

## Development

Run directly from JavaScript sources:

```bash
npm run dev
```

## Run

```bash
npm start
```

## Environment Variables

Copy `.env.example` to `.env` and set values when needed:

- `GEMINI_API_KEY`: Required for model calls.
- `GEMINI_MODEL`: Optional, default is `gemini-2.5-pro`.
- `GITHUB_TOKEN`: Required for GitHub CRUD tools and issue writeback.
- `TARGET_REPOSITORY`: Target repo for tool operations (`owner/repo`).
- `TARGET_BRANCH`: Branch used by file CRUD tools.
- `USER_PROMPT`: Explicit prompt input.
- `ISSUE_TITLE` / `ISSUE_BODY`: Used when `USER_PROMPT` is empty.
- `NEW_REQUIREMENTS_JSON`: JSON string array for dynamic replanning.
- `PLANNER_TOOL_ACTION_JSON`: Optional single tool action executed in planner stage.
- `WRITE_BACK_TO_ISSUE`: Set `true` to post run result to GitHub issue.
- `ISSUE_NUMBER`: Issue to comment when writeback is enabled.

## GitHub CRUD Tools

The agent supports these actions against `TARGET_REPOSITORY`:

- `read_file`
- `list_directory`
- `upsert_file` (create/update)
- `delete_file`
- `list_issues`
- `create_issue`
- `comment_issue`

Planner node: `plannerTools`.
Worker node: `workerTools`.

Both nodes call `github-tools.js`.

## Deploy to Another Repository (with Action)

Use this script to deploy the agent and workflow to a target repository:

```bash
npm run deploy:repo -- \
	--repo owner/repo \
	--pat <github_pat> \
	--geminiKey <gemini_api_key> \
	--branch main
```

What this script does:

- Clones the target repository.
- Copies all runtime JS files and package files.
- Creates `.github/workflows/auto-evolve-agent.yml`.
- Writes Actions secrets:
	- `AUTO_EVOLVE_GITHUB_PAT`
	- `GEMINI_API_KEY`
- Commits and pushes to the target branch.

## Project Structure

- `index.js`: Runtime entry.
- `graph.js`: Planner and worker graph assembly.
- `planner.js`: Planner node functions, routing, and planner tools.
- `worker.js`: Worker node functions, routing, and worker tools.
- `state.js`: Shared state annotation and initial state.
- `github-tools.js`: GitHub repo CRUD wrappers.
- `llm.js`: Gemini API calls.
- `scripts/deploy-to-repo.js`: Deployment script for target repo + action.
