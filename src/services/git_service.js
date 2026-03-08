const { exec } = require('child_process');
const util = require('util');
const path = require('path');

const execPromise = util.promisify(exec);

const logger = {
  info: (message) => console.log(`[GitService] ${message}`),
  error: (message) => console.error(`[GitService] ERROR: ${message}`),
};

/**
 * Executes a shell command and logs its output.
 * @param {string} command The command to execute.
 * @param {string} cwd The working directory.
 * @returns {Promise<{stdout: string, stderr: string}>}
 */
async function runCommand(command, cwd = process.cwd()) {
  logger.info(`Executing: ${command}`);
  try {
    const { stdout, stderr } = await execPromise(command, { cwd });
    if (stdout) logger.info(`stdout:\n${stdout}`);
    if (stderr) logger.info(`stderr:\n${stderr}`); // Git often uses stderr for progress messages
    return { stdout, stderr };
  } catch (error) {
    logger.error(`Failed to execute command: ${command}`);
    logger.error(error.stdout);
    logger.error(error.stderr);
    throw error;
  }
}

/**
 * Creates a new branch from the 'dev' branch.
 * @param {string} branchName The name of the new branch.
 * @param {string} repoPath The local path to the repository.
 */
async function createBranch(branchName, repoPath) {
  logger.info(`Creating new branch '${branchName}' from 'dev' in ${repoPath}`);
  await runCommand('git checkout dev', repoPath);
  await runCommand('git pull origin dev', repoPath);
  await runCommand(`git checkout -b ${branchName}`, repoPath);
  logger.info(`Successfully created and checked out branch '${branchName}'.`);
}

/**
 * Adds and commits specified files.
 * @param {string[]} files An array of file paths to commit.
 * @param {string} message The commit message.
 * @param {string} repoPath The local path to the repository.
 */
async function commitChanges(files, message, repoPath) {
  if (!files || files.length === 0) {
    logger.info('No files to commit.');
    return;
  }
  logger.info(`Committing files: ${files.join(', ')}`);
  const filePaths = files.map(f => path.relative(repoPath, f)).join(' ');
  await runCommand(`git add ${filePaths}`, repoPath);
  await runCommand(`git commit -m "${message.replace(/"/g, '\"')}"`, repoPath);
  logger.info('Successfully committed changes.');
}

/**
 * Pushes the current branch to the remote repository.
 * @param {string} branchName The name of the branch to push.
 * @param {string} repoPath The local path to the repository.
 */
async function pushChanges(branchName, repoPath) {
  logger.info(`Pushing branch '${branchName}' to origin.`);
  await runCommand(`git push -u origin ${branchName}`, repoPath);
  logger.info(`Successfully pushed branch '${branchName}'.`);
}

module.exports = {
  createBranch,
  commitChanges,
  pushChanges,
};
