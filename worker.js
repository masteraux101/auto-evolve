const { createPlan } = require('./planner');
const { getFileContent, commitFile, getRepositoryContext } = require('./github-tools');
const { saveState, loadState } = require('./state');
const { getTask, updateTask } = require('./graph');

/**
 * This file defines the main worker logic for processing tasks.
 * It orchestrates the entire process from planning to execution.
 * 
 * @module worker
 */

/**
 * @typedef {import('./types').Task} Task
 * @typedef {import('./types').Step} Step
 * @typedef {import('./types').State} State
 */

/**
 * The main worker function that processes a single task.
 * It orchestrates the planning, execution, and state management for a given task.
 * This function is the primary entry point for the worker.
 *
 * @param {string} taskId - The ID of the task to process.
 * @returns {Promise<void>} A promise that resolves when the task is completed or fails.
 */
async function processTask(taskId) {
  console.log(`Starting to process task: ${taskId}`);

  try {
    const task = getTask(taskId);
    if (!task) {
      console.error(`Task with ID ${taskId} not found.`);
      return;
    }

    if (task.status === 'completed') {
      console.log(`Task ${taskId} is already completed. Skipping.`);
      return;
    }

    const state = await loadState(taskId);
    
    // Generate a plan if one doesn't exist
    if (!state.plan || state.plan.length === 0) {
        console.log(`No plan found for task ${taskId}. Generating a new plan.`);
        const context = await getRepositoryContext(task);
        state.plan = await createPlan(task, context);
        await saveState(taskId, state);
    }

    await executePlan(taskId, state);

    updateTask(taskId, { status: 'completed' });
    console.log(`Task ${taskId} completed successfully.`);
  } catch (error) {
    console.error(`Error processing task ${taskId}:`, error);
    updateTask(taskId, { status: 'failed', error: error.message });
    // Depending on the desired behavior, you might want to re-throw the error
    // throw error;
  }
}

/**
 * Executes the plan for a given task by iterating through its steps.
 * It maintains the current step in the state, allowing for resumability.
 *
 * @param {string} taskId - The ID of the task.
 * @param {State} state - The current state of the task, including the plan and progress.
 * @returns {Promise<void>} A promise that resolves when the plan is fully executed.
 */
async function executePlan(taskId, state) {
  console.log(`Executing plan for task: ${taskId}`);

  const startStep = state.currentStep || 0;
  for (let i = startStep; i < state.plan.length; i++) {
    const step = state.plan[i];
    state.currentStep = i;
    
    console.log(`Executing step ${i + 1}/${state.plan.length}: ${step.type} - ${step.description}`);
    
    try {
      const result = await executeStep(step);
      state.stepResults = state.stepResults || [];
      state.stepResults[i] = { status: 'completed', result: result || 'No result' };
      await saveState(taskId, state);
    } catch (error) {
        console.error(`Error executing step ${i + 1} ('${step.description}'):`, error.message);
        state.stepResults = state.stepResults || [];
        state.stepResults[i] = { status: 'failed', error: error.message };
        await saveState(taskId, state);
        // Stop execution on failure and propagate the error
        throw new Error(`Failed to execute step ${i + 1}: ${step.description}. Reason: ${error.message}`);
    }
  }
}

/**
 * Executes a single step from the plan based on its type.
 * This function acts as a dispatcher to the appropriate handler for each step type.
 *
 * @param {Step} step - The step object to execute.
 * @returns {Promise<any>} The result of the step execution.
 * @throws {Error} If the step type is unknown or execution fails.
 */
async function executeStep(step) {
  // Ensure parameters exist to avoid runtime errors
  const params = step.parameters || {};

  switch (step.type) {
    case 'READ_FILE':
      if (!params.path) throw new Error('Missing "path" parameter for READ_FILE step.');
      return getFileContent(params.path);

    case 'WRITE_FILE':
      if (!params.path) throw new Error('Missing "path" parameter for WRITE_FILE step.');
      if (typeof params.content !== 'string') throw new Error('Missing or invalid "content" parameter for WRITE_FILE step.');
      if (!params.message) throw new Error('Missing "message" parameter for WRITE_FILE step.');
      return commitFile(
        params.path,
        params.content,
        params.message
      );

    case 'RUN_COMMAND':
      if (!params.command) throw new Error('Missing "command" parameter for RUN_COMMAND step.');
      // Placeholder for running a command. In a real scenario, use child_process.exec.
      console.log(`Simulating command run: ${params.command}`);
      // const { exec } = require('child_process');
      // return new Promise((resolve, reject) => {
      //   exec(params.command, (error, stdout, stderr) => {
      //     if (error) return reject(error);
      //     if (stderr) return reject(new Error(stderr));
      //     resolve(stdout);
      //   });
      // });
      return Promise.resolve(`Simulated output for: ${params.command}`);

    case 'HUMAN_REVIEW':
        // Placeholder for a step that requires human intervention.
        console.log(`Awaiting human review for: ${step.description}`);
        // This would typically involve an external trigger, a webhook, or a long-polling mechanism.
        // For now, we'll simulate an automatic approval.
        return Promise.resolve({ approved: true, feedback: "Looks good. Auto-approved." });

    default:
      throw new Error(`Unknown step type: '${step.type}'`);
  }
}

module.exports = {
  processTask,
};
