import { program } from 'commander';
import { plan } from './planner.js';
import { initializeState, saveState, getState } from './state.js';
import { executePlan } from './worker.js';
import { getCompletion } from './llm.js';
import { getRepositoryContext } from './github-tools.js';
import { createGraph, logGraph } from './graph.js';
import { createPullRequest } from './src/github_tools.js';

async function main() {
  program
    .command('plan <task>')
    .description('Plan a task')
    .action(async (task) => {
      console.log('Planning task:', task);
      const state = await initializeState({ task });
      const repoContext = await getRepositoryContext();
      state.repoContext = repoContext;
      saveState(state);
      const planResult = await plan(task, state);
      state.plan = planResult;
      state.graph = createGraph(planResult);
      saveState(state);
      console.log('Plan created:');
      console.dir(state.plan, { depth: null });
      console.log('\nExecution graph:');
      logGraph(state.graph);
    });

  program
    .command('execute')
    .description('Execute the plan')
    .action(async () => {
      const state = getState();
      if (!state || !state.plan) {
        console.log('No plan found. Please run "plan" first.');
        return;
      }
      console.log('Executing plan...');
      await executePlan(state);
      console.log('Plan executed.');
    });

  program
    .command('step')
    .description('Execute the next step of the plan')
    .action(async () => {
        const state = getState();
        if (!state || !state.plan) {
            console.log('No plan found. Please run "plan" first.');
            return;
        }
        console.log('Executing next step...');
        await executePlan(state, true); // Pass true for single step execution
        console.log('Step executed.');
    });

  program
    .command('shell <command>')
    .description('Get a completion for a shell command')
    .action(async (command) => {
      const result = await getCompletion(command);
      console.log(result);
    });

  program
    .command('pr')
    .description('Create a pull request on GitHub')
    .option('-t, --title <title>', 'Pull request title')
    .option('-b, --body <body>', 'Pull request body', '')
    .option('-h, --head <head>', 'The name of the branch where your changes are implemented')
    .option('--base <base>', 'The name of the branch you want the changes pulled into')
    .action(async (options) => {
      const { title, body, head, base } = options;
      if (!title || !head || !base) {
        console.error('Error: --title, --head, and --base are required.');
        process.exit(1);
      }
      try {
        console.log(`Creating pull request from ${head} to ${base}...`);
        const pr = await createPullRequest(title, body, head, base);
        console.log(`Successfully created pull request: ${pr.html_url}`);
      } catch (error) {
        console.error(`Failed to create pull request: ${error.message}`);
        process.exit(1);
      }
    });

  await program.parseAsync(process.argv);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
