/**
 * Analyzes the exit code from a planner/worker execution to decide the next step.
 *
 * @param {number} exitCode The exit code from the completed process. A value of 0 indicates success.
 * @returns {string} The identifier for the next milestone. 'ms-2' for success, 'ms-3' for failure.
 */
function analyzeExecutionResult(exitCode) {
  if (exitCode === 0) {
    console.log("Planner/worker execution succeeded. Proceeding to 'Persist Output' (ms-2).");
    return 'ms-2';
  } else {
    console.error(`Planner/worker execution failed with exit code ${exitCode}. Proceeding to 'Report Failures' (ms-3).`);
    return 'ms-3';
  }
}

module.exports = {
  analyzeExecutionResult,
};
