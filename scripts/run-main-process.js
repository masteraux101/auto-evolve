const { spawn } = require('child_process');

async function execute() {
  console.log('Starting planner/worker process execution...');

  const child = spawn('node', ['index.js'], {
    stdio: 'pipe',
    env: { ...process.env }
  });

  let stdout = '';
  let stderr = '';

  child.stdout.on('data', (data) => {
    process.stdout.write(data);
    stdout += data.toString();
  });

  child.stderr.on('data', (data) => {
    process.stderr.write(data);
    stderr += data.toString();
  });

  const exitCode = await new Promise((resolve, reject) => {
    child.on('close', resolve);
    child.on('error', reject);
  });

  console.log(`\n--- Planner/Worker process finished with exit code: ${exitCode} ---`);

  // The calling environment can now inspect the exit code.
  // This script will exit with the same code as the child process.
  process.exit(exitCode);
}

execute().catch(error => {
  console.error('Failed to execute script:', error);
  process.exit(1);
});
