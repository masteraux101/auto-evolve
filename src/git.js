import { promisify } from 'util';
import { exec as execCallback } from 'child_process';

const exec = promisify(execCallback);

async function runCommand(command) {
  console.log(`Executing: ${command}`);
  try {
    const { stdout, stderr } = await exec(command);
    if (stderr && !stderr.toLowerCase().includes('warning:')) {
      console.error(`stderr: ${stderr}`);
    }
    if (stdout) {
      console.log(`stdout: ${stdout}`);
    }
    return { stdout, stderr };
  } catch (error) {
    console.error(`Error executing command "${command}":`, error);
    throw error;
  }
}

/**
 * Creates a new branch from a base branch and ensures it's up-to-date.
 * @param {string} branchName - The name of the new branch.
 * @param {string} [baseBranch='dev'] - The branch to create the new branch from.
 */
async function createBranch(branchName, baseBranch = 'dev') {
  console.log(`Creating new branch '${branchName}' from '${baseBranch}'...`);
  await runCommand(`git checkout ${baseBranch}`);
  await runCommand(`git pull origin ${baseBranch}`);
  await runCommand(`git checkout -b ${branchName}`);
  console.log(`Successfully created and checked out branch '${branchName}'.`);
}

/**
 * Stages files for commit.
 * @param {string|string[]} files - A single file path or an array of file paths to add.
 */
async function add(files) {
  const filesToAdd = Array.isArray(files) ? files : [files];
  if (filesToAdd.length === 0) {
    console.log('No files to add.');
    return;
  }
  const fileList = filesToAdd.join(' ');
  console.log(`Staging files: ${fileList}`);
  await runCommand(`git add ${fileList}`);
  console.log('Files staged successfully.');
}

/**
 * Commits staged changes.
 * @param {string} message - The commit message.
 */
async function commit(message) {
  console.log(`Committing with message: "${message}"`);
  // Escape double quotes in the message to prevent issues with the shell command.
  const escapedMessage = message.replace(/"/g, '\\"');
  await runCommand(`git commit -m "${escapedMessage}"`);
  console.log('Commit successful.');
}

/**
 * Pushes a branch to the remote repository, setting the upstream tracking branch.
 * @param {string} branchName - The name of the branch to push.
 */
async function push(branchName) {
  console.log(`Pushing branch '${branchName}' to origin...`);
  await runCommand(`git push -u origin ${branchName}`);
  console.log(`Branch '${branchName}' pushed successfully.`);
}

export {
  createBranch,
  add,
  commit,
  push,
  runCommand
};
