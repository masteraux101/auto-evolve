const { exec } = require('child_process');
const { 
    listDirectory, 
    readFile, 
    writeFile, 
    createCommit,
    getIssue,
    getOpenIssues,
    createIssueComment,
    getRepoContext
} = require('./github-tools');
const { updateState, getState } = require('./state');
const { getLLMResponse } = require('./llm');

// A more robust command execution function
async function executeCommand(command) {
    console.log(`Executing command: $ ${command}`);
    return new Promise((resolve) => {
        exec(command, { timeout: 15000 }, (error, stdout, stderr) => {
            if (error) {
                console.error(`exec error: ${error}`);
                const result = {
                    success: false,
                    stdout: stdout,
                    stderr: `Error: ${error.message}\nStderr: ${stderr}`
                };
                resolve(result);
                return;
            }
            if (stderr) {
                console.warn(`Command stderr:\n${stderr}`);
            }
            const result = { success: true, stdout, stderr };
            resolve(result);
        });
    });
}

async function executeTool(action, parameters) {
    console.log(`Executing tool: ${action}`);
    if (parameters && Object.keys(parameters).length > 0) {
        console.log(`With parameters: ${JSON.stringify(parameters, null, 2)}`);
    }

    try {
        switch (action) {
            // Filesystem/Repo tools
            case 'list_directory':
                if (!parameters.path) throw new Error("'path' parameter is required.");
                return await listDirectory(parameters.path);

            case 'read_file':
                if (!parameters.path) throw new Error("'path' parameter is required.");
                return await readFile(parameters.path);

            case 'write_file_and_commit':
                const { path, content, message, summary } = parameters;
                if (!path || content === undefined || !message || !summary) {
                    throw new Error("'path', 'content', 'message', and 'summary' parameters are required.");
                }
                const state = getState();
                const { targetRepository, targetBranch } = state;
                const [owner, repo] = targetRepository.split('/');
                
                console.log(`Committing to ${owner}/${repo} on branch ${targetBranch}`);
                
                const commitResult = await createCommit({
                    owner,
                    repo,
                    branch: targetBranch,
                    changes: [{ path, content }],
                    message: `${message}\n\n${summary}`
                });

                console.log('Commit successful:', commitResult);
                return { success: true, commit: commitResult };

            // Command execution
            case 'execute_command':
                if (!parameters.command) throw new Error("'command' parameter is required.");
                return await executeCommand(parameters.command);
            
            // GitHub specific tools
            case 'get_issue':
                if (!parameters.issue_number) throw new Error("'issue_number' parameter is required.");
                return await getIssue(parameters.issue_number);

            case 'get_open_issues':
                return await getOpenIssues();

            case 'create_issue_comment':
                if (!parameters.issue_number) throw new Error("'issue_number' parameter is required.");
                if (!parameters.comment) throw new Error("'comment' parameter is required.");
                return await createIssueComment(parameters.issue_number, parameters.comment);

            // LLM/Reasoning tools
            case 'ask_llm':
                if (!parameters.prompt) throw new Error("'prompt' parameter is required.");
                return await getLLMResponse(parameters.prompt, parameters.context);

            // Control flow
            case 'final_answer':
                console.log("Final answer received:", parameters.answer);
                // This action signals the end of a task. The main loop will handle this.
                return { success: true, finalAnswer: parameters.answer };

            default:
                console.error(`Unknown action: ${action}`);
                return { success: false, error: `Unknown action: ${action}` };
        }
    } catch (error) {
        console.error(`Error executing tool '${action}':`, error);
        return { 
            success: false, 
            error: `Failed to execute tool '${action}': ${error.message}`,
            stack: error.stack
        };
    }
}

async function run(plan) {
    console.log("Worker starting to execute plan...");
    // Enhanced validation for the plan object
    if (!plan || typeof plan !== 'object' || !Array.isArray(plan.steps) || plan.steps.length === 0) {
        const errorMsg = `Plan is invalid. It must be an object with a non-empty 'steps' array. Received: ${JSON.stringify(plan)}`;
        console.error(errorMsg);
        await updateState({ status: 'failed', error: errorMsg });
        return { success: false, error: errorMsg };
    }

    let lastToolResult = null;

    for (const [index, step] of plan.steps.entries()) {
        // Enhanced validation for each step
        if (!step || typeof step !== 'object' || !step.action) {
            const errorMsg = `Step ${index} is invalid or missing 'action'. Step: ${JSON.stringify(step)}`;
            console.error(errorMsg);
            await updateState({ status: 'failed', error: errorMsg });
            return { success: false, error: errorMsg };
        }

        console.log(`\n[Step ${index + 1}/${plan.steps.length}] Executing: ${step.action}`);
        if (step.thought) {
            console.log(`Thought: ${step.thought}`);
        }

        const toolResult = await executeTool(step.action, step.parameters || {});
        
        // Avoid overly verbose logging for large results like file contents
        const resultToLog = { ...toolResult };
        if (resultToLog && typeof resultToLog.content === 'string' && resultToLog.content.length > 200) {
            resultToLog.content = resultToLog.content.substring(0, 200) + '... (truncated)';
        }
        console.log("Tool result:", JSON.stringify(resultToLog, null, 2));
        
        if (toolResult && toolResult.success === false) {
            const errorMsg = `Worker failed on action '${step.action}'. Reason: ${toolResult.error}`;
            console.error(`Step failed. Stopping execution. Error: ${toolResult.error}`);
            await updateState({
                status: 'failed',
                error: errorMsg,
                lastToolResult: toolResult
            });
            return { success: false, error: errorMsg, details: toolResult };
        }

        lastToolResult = toolResult;
        await updateState({ lastToolResult });

        if (step.action === 'final_answer') {
            console.log("`final_answer` received. Ending worker execution for this plan.");
            break;
        }
    }

    console.log("\nWorker finished executing plan successfully.");
    await updateState({ status: 'completed', finalResult: lastToolResult });
    return { success: true, finalResult: lastToolResult };
}

module.exports = { run, executeTool };
