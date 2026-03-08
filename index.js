const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { plan } = require('./planner');
const { executePlan } = require('./worker');
const { state, saveState } = require('./state');
const { getOpenIssues } = require('./github-tools');

const OUTPUT_DIR = 'dev_gened_output';
const EXPERIMENT_FLAG = '--run-dev-experiment';

// --- Orchestrator Functions ---

function runCommand(command, args, cwd = '.') {
    console.log(`Running command: ${command} ${args.join(' ')}`);
    return new Promise((resolve, reject) => {
        const proc = spawn(command, args, { cwd, shell: true, stdio: 'pipe' });
        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', (data) => {
            stdout += data.toString();
            process.stdout.write(data);
        });

        proc.stderr.on('data', (data) => {
            stderr += data.toString();
            process.stderr.write(data);
        });

        proc.on('close', (code) => {
            if (code !== 0) {
                reject({ code, stdout, stderr, message: `Command failed with exit code ${code}` });
            } else {
                resolve({ code, stdout, stderr });
            }
        });

        proc.on('error', (err) => {
            reject({ error: err, stdout, stderr, message: `Command failed to start` });
        });
    });
}

async function setupDevBranch() {
    console.log('Setting up dev-gened branch...');
    try {
        // Stash any local changes to avoid conflicts
        await runCommand('git', ['add', '.']);
        await runCommand('git', ['commit', '-m', 'wip: auto-stashing before experiment'], '.').catch(() => console.log("Nothing to commit, proceeding."));

        await runCommand('git', ['fetch', 'origin']);
        await runCommand('git', ['checkout', 'dev']);
        await runCommand('git', ['pull', 'origin', 'dev']);
        
        // Delete old branch if it exists to ensure a clean start
        await runCommand('git', ['branch', '-D', 'dev-gened']).catch(() => console.log("Branch 'dev-gened' did not exist. Will create it."));
        
        await runCommand('git', ['checkout', '-b', 'dev-gened']);
        console.log('Successfully checked out new branch dev-gened from dev.');
    } catch (error) {
        console.error('Failed to setup dev branch:', error.message || error);
        throw new Error('Git setup failed.');
    }
}

async function runExperiment() {
    console.log('--- Starting Dev Experiment Orchestrator ---');
    
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR);
    }

    await setupDevBranch();

    console.log('Branch setup complete. Spawning worker process...');

    const logFilePath = path.join(OUTPUT_DIR, `run_${Date.now()}.json`);
    const output = {
        stdout: '',
        stderr: '',
        exitCode: null,
        startTime: new Date().toISOString(),
        endTime: null,
    };

    const child = spawn('node', ['index.js'], { stdio: 'pipe' });

    child.stdout.on('data', (data) => {
        process.stdout.write(data); // also print to orchestrator console
        output.stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
        process.stderr.write(data); // also print to orchestrator console
        output.stderr += data.toString();
    });

    child.on('close', (code) => {
        console.log(`Worker process exited with code ${code}`);
        output.exitCode = code;
        output.endTime = new Date().toISOString();
        fs.writeFileSync(logFilePath, JSON.stringify(output, null, 2));
        console.log(`--- Experiment Finished. Output captured to ${logFilePath} ---`);
        process.exit(code); // Exit orchestrator with the same code
    });

    child.on('error', (err) => {
        console.error('Failed to start worker process:', err);
        output.stderr += `Failed to start worker process: ${err.message}\n`;
        output.exitCode = 1;
        output.endTime = new Date().toISOString();
        fs.writeFileSync(logFilePath, JSON.stringify(output, null, 2));
        console.log(`--- Experiment Failed. Output captured to ${logFilePath} ---`);
        process.exit(1);
    });
}

// --- Main Application Logic (Worker) ---

async function main() {
    console.log("Starting main application logic...");
    const issues = await getOpenIssues();
    if (issues.length === 0) {
        console.log("No open issues found. Exiting.");
        return;
    }
    state.issues = issues;
    // For this run, let's focus on a specific, actionable task.
    const targetIssue = issues.find(i => i.number === 2) || issues[0];
    state.currentTask = `Address issue #${targetIssue.number}: "${targetIssue.title}". Analyze the repository, create a plan to implement the required changes, and execute it.`;
    
    console.log(`Starting task: ${state.currentTask}`);

    const planResult = await plan(state.currentTask, [targetIssue]);
    state.plan = planResult;
    saveState(state);

    console.log("Plan generated:", JSON.stringify(state.plan, null, 2));

    const executionResult = await executePlan(state.plan);
    console.log("Execution result:", executionResult);
    state.history.push({
        task: state.currentTask,
        plan: state.plan,
        result: executionResult,
    });
    saveState(state);
    console.log("Main application logic finished.");
}

// --- Entry Point ---

if (process.argv.includes(EXPERIMENT_FLAG)) {
    runExperiment().catch(err => {
        console.error("Critical error in experiment orchestrator:", err);
        process.exit(1);
    });
} else {
    main().catch(err => {
        console.error("Critical error in main application:", err);
        process.exit(1);
    });
}
