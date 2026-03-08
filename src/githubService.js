import { Octokit } from "@octokit/rest";
import axios from 'axios';
import AdmZip from 'adm-zip';

console.log("[githubService] Initializing with GITHUB_TOKEN");
const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
});

// A placeholder for getting repo info. In a real app, this would parse .git/config or use an env var.
function getRepoInfo() {
    // This is a placeholder. A real implementation would be more robust,
    // for example, using a library to parse `git remote -v`.
    // We'll use the owner/repo from the repository context for now.
    return { owner: 'masteraux101', repo: 'auto-evolve' };
}

/**
 * Fetches and concatenates the logs from the most recent failed GitHub Actions workflow run.
 * @returns {Promise<string|null>} A string containing all log files, or null if no failed runs are found or an error occurs.
 */
async function getLatestWorkflowLogs() {
  const { owner, repo } = getRepoInfo();

  if (!owner || !repo) {
    console.error("Could not determine repository owner and name. Please configure it.");
    return null;
  }

  try {
    console.log(`Fetching workflow runs for ${owner}/${repo}...`);
    const { data: { workflow_runs } } = await octokit.actions.listWorkflowRunsForRepo({
      owner,
      repo,
      status: 'completed',
    });

    const failedRun = workflow_runs.find(run => run.conclusion === 'failure');

    if (!failedRun) {
      console.log("No recent failed workflow runs found.");
      return null;
    }

    console.log(`Found latest failed run: ID ${failedRun.id}, Title: "${failedRun.display_title}"`);

    const { url } = await octokit.actions.downloadWorkflowRunLogs({
      owner,
      repo,
      run_id: failedRun.id,
    });

    console.log(`Downloading logs from redirect...`);
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    const zipBuffer = Buffer.from(response.data);

    const zip = new AdmZip(zipBuffer);
    const zipEntries = zip.getEntries();
    let allLogs = "";

    zipEntries.forEach(entry => {
      if (!entry.isDirectory && entry.name.endsWith('.log')) {
        const logContent = zip.readAsText(entry);
        allLogs += `--- Log file: ${entry.entryName} ---\n\n`;
        allLogs += logContent;
        allLogs += "\n\n";
      }
    });

    console.log("Successfully fetched and processed workflow logs.");
    return allLogs.trim();

  } catch (error) {
    console.error("Error fetching workflow logs:", error.message);
    if (error.response) {
      console.error("GitHub API response status:", error.response.status);
      console.error("Response data:", error.response.data);
    }
    return null;
  }
}

/**
 * Analyzes logs for a specific workflow run ID
 * @param {string} runId - The workflow run ID to analyze
 * @returns {Promise<object>} - Analysis results
 */
async function analyzeWorkflowLogs(runId) {
  console.log(`[githubService] Analyzing workflow logs for run ID: ${runId}`);
  const { owner, repo } = getRepoInfo();

  if (!owner || !repo) {
    throw new Error("Could not determine repository owner and name.");
  }

  try {
    const { data: run } = await octokit.actions.getWorkflowRun({
      owner,
      repo,
      run_id: runId,
    });

    console.log(`[githubService] Found workflow run: ${run.name}, status: ${run.status}, conclusion: ${run.conclusion}`);

    const { url } = await octokit.actions.downloadWorkflowRunLogs({
      owner,
      repo,
      run_id: runId,
    });

    console.log(`[githubService] Downloading logs from: ${url}`);
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    const zipBuffer = Buffer.from(response.data);

    const zip = new AdmZip(zipBuffer);
    const zipEntries = zip.getEntries();
    const logFiles = [];

    zipEntries.forEach(entry => {
      if (!entry.isDirectory && entry.name.endsWith('.log')) {
        const logContent = zip.readAsText(entry);
        logFiles.push({
          name: entry.entryName,
          content: logContent
        });
      }
    });

    console.log(`[githubService] Processed ${logFiles.length} log files`);

    return {
      runId,
      runName: run.name,
      status: run.status,
      conclusion: run.conclusion,
      createdAt: run.created_at,
      htmlUrl: run.html_url,
      logFiles,
    };
  } catch (error) {
    console.error(`[githubService] Error analyzing workflow logs:`, error.message);
    throw error;
  }
}

export {
  getLatestWorkflowLogs,
  analyzeWorkflowLogs,
};
