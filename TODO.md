# Unfinished Code Sections and Technical Debt

This document lists all the `TODO`, `FIXME`, and other comments indicating unfinished or broken code found throughout the repository.

## `github-tools.js`

- **TODO**: Add pagination support for listing issues.
- **FIXME**: Error handling for API rate limits is not robust.

## `graph.js`

- **TODO**: Implement graph visualization.

## `index.js`

- **TODO**: Add command-line arguments for configuration.

## `llm.js`

- **FIXME**: The prompt construction is brittle and needs refactoring.
- **TODO**: Support more LLM providers besides OpenAI.

## `planner.js`

- **TODO**: Improve planning logic to handle complex dependencies.
- **FIXME**: The planner can get into a loop on certain inputs.

## `state.js`

- **TODO**: Persist state to a database instead of in-memory.

## `worker.js`

- **TODO**: Implement a job queue for better task management.
- **FIXME**: The worker crashes if a task throws an unhandled exception.
