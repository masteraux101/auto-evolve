const github = require('./github-tools');
const llm = require('./llm');
const state = require('./state');
const planner = require('./planner');
const fs = require('fs').promises;
const path = require('path');

/**
 * Executes a single task from the plan.
 * @param {object} task - The task object to execute.
 * @returns {Promise<any>} The result of the task execution.
 */
async function executeTask(task) {
  console.log(`Executing task: ${task.id} - ${task.name} (${task.tool}.${task.action})`);
  try {
    let result;
    const params = task.parameters || {};

    switch (task.tool) {
      case 'github':
        result = await executeGitHubTool(task.action, params);
        break;
      case 'llm':
        result = await executeLlmTool(task.action, params);
        break;
      case 'planner':
        result = await executePlannerTool(task.action, params);
        break;
      case 'filesystem':
        result = await executeFilesystemTool(task.action, params);
        break;
      case 'finish':
        console.log(`Finish task received. Objective: ${params.message}`);
        console.log('Agent has completed its goal.');
        process.exit(0);
      default:
        throw new Error(`Unknown tool: ${task.tool}`);
    }

    console.log(`Task ${task.id} completed successfully.`);
    await state.updateTask(task.id, { status: 'completed', result });
    return result;
  } catch (error) {
    console.error(`Error executing task ${task.id}:`, error);
    await state.updateTask(task.id, { status: 'failed', error: error.message });
    throw error; // Re-throw to be handled by the main loop
  }
}

/**
 * Executes a GitHub-related action.
 * @param {string} action - The specific GitHub action to perform.
 * @param {object} params - The parameters for the action.
 * @returns {Promise<any>} The result from the GitHub tool.
 */
async function executeGitHubTool(action, params) {
  switch (action) {
    case 'getIssue':
      return github.getIssue(params);
    case 'getIssues':
      return github.getIssues(params);
    case 'createComment':
      return github.createComment(params);
    case 'listFiles':
      return github.listFiles(params);
    case 'readFile':
      return github.readFile(params);
    case 'createCommit':
      return github.createCommit(params);
    case 'createPullRequest':
        return github.createPullRequest(params);
    default:
      throw new Error(`Unknown GitHub action: ${action}`);
  }
}

/**
 * Executes an LLM-related action.
 * @param {string} action - The specific LLM action to perform.
 * @param {object} params - The parameters for the action.
 * @returns {Promise<any>} The result from the LLM tool.
 */
async function executeLlmTool(action, params) {
  const { prompt, options } = params;
  switch (action) {
    case 'generateCode':
      return llm.generate(prompt, { temperature: 0.1, ...options });
    case 'analyzeCode':
      return llm.generate(prompt, { temperature: 0.3, ...options });
    case 'summarize':
        return llm.generate(prompt, { temperature: 0.5, ...options });
    default:
      throw new Error(`Unknown LLM action: ${action}`);
  }
}

/**
 * Executes a planner-related action.
 * @param {string} action - The specific planner action to perform.
 * @param {object} params - The parameters for the action.
 * @returns {Promise<any>} The result from the planner tool.
 */
async function executePlannerTool(action, params) {
  switch (action) {
    case 'createPlan':
      return planner.createPlan(params.objective);
    case 'updatePlan':
      return planner.updatePlan(params.objective, params.history);
    default:
      throw new Error(`Unknown planner action: ${action}`);
  }
}

/**
 * Executes a local filesystem action.
 * @param {string} action - The specific filesystem action to perform.
 * @param {object} params - The parameters for the action.
 * @returns {Promise<any>} The result from the filesystem operation.
 */
async function executeFilesystemTool(action, params) {
  // Ensure path is within the project directory to prevent traversal attacks
  const safePath = path.resolve(process.cwd(), params.path);
  if (!safePath.startsWith(process.cwd())) {
      throw new Error(`Access to path '${params.path}' outside the working directory is not allowed.`);
  }

  switch (action) {
    case 'readFile':
      return fs.readFile(safePath, 'utf-8');
    case 'writeFile':
      await fs.mkdir(path.dirname(safePath), { recursive: true });
      return fs.writeFile(safePath, params.content, 'utf-8');
    case 'listFiles':
      const dirents = await fs.readdir(safePath, { withFileTypes: true });
      return dirents.map(dirent => ({
          name: dirent.name,
          type: dirent.isDirectory() ? 'dir' : 'file'
      }));
    default:
      throw new Error(`Unknown filesystem action: ${action}`);
  }
}

/**
 * The main loop for the worker. It continuously fetches and executes tasks.
 */
async function main() {
  console.log('Worker process started.');
  while (true) {
    const task = await state.getNextTask();
    if (task) {
      try {
        await executeTask(task);
      } catch (e) {
        // Error is already logged and state updated in executeTask
        console.error(`Task ${task.id} failed in main loop. Continuing to next task.`);
      }
    } else {
      console.log('No executable tasks found. Checking for completion...');
      const allTasks = await state.getAllTasks();
      const pendingTasks = allTasks.filter(t => ['pending', 'running'].includes(t.status));
      
      if (pendingTasks.length === 0 && allTasks.length > 0) {
          console.log('All tasks are completed or failed. Worker is shutting down.');
          break;
      }
      
      console.log('Still pending tasks. Waiting for new tasks to become available...');
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds before polling again
    }
  }
}

if (require.main === module) {
    main().catch(err => {
        console.error("Worker main loop crashed fatally:", err);
        process.exit(1);
    });
}

module.exports = { 
  executeTask,
  executeGitHubTool,
  executeLlmTool,
  executePlannerTool,
  executeFilesystemTool
};
