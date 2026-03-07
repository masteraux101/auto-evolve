import { executeGithubTool } from "./github-tools.js";
import { generateTaskOutput } from "./llm.js";

function getCurrentTask(state) {
  if (!state.currentTaskId) {
    return undefined;
  }
  return state.tasks.find((task) => task.id === state.currentTaskId);
}

export async function workerTools(state) {
  console.log("[Worker.workerTools] start", { currentTaskId: state.currentTaskId });

  const task = getCurrentTask(state);
  if (!task || !task.toolAction) {
    console.log("[Worker.workerTools] end - no tool action on current task");
    return {};
  }

  try {
    const result = await executeGithubTool(task.toolAction, task.toolInput || {});
    console.log("[Worker.workerTools] end - tool executed", { action: task.toolAction });

    return {
      repoContext: {
        ...state.repoContext,
        [task.id]: result,
      },
      error: null,
    };
  } catch (error) {
    const message = `Worker tool execution failed: ${error.message}`;
    console.log("[Worker.workerTools] end - failed", { error: message });
    return { error: message };
  }
}

export async function generateCode(state) {
  console.log("[Worker.generateCode] start", { currentTaskId: state.currentTaskId });

  const task = getCurrentTask(state);
  if (!task) {
    const message = "No current task found for code generation.";
    console.log("[Worker.generateCode] end - failed", { error: message });
    return { error: message };
  }

  try {
    const generated = await generateTaskOutput(task.title, task.description, state.repoContext || {});

    const updatedTasks = state.tasks.map((item) =>
      item.id === task.id ? { ...item, output: generated, error: undefined } : item,
    );

    console.log("[Worker.generateCode] end", { taskId: task.id, outputLength: generated.length });
    return { tasks: updatedTasks, error: null };
  } catch (error) {
    const message = `Code generation failed: ${error.message}`;
    console.log("[Worker.generateCode] end - failed", { error: message });
    return { error: message };
  }
}

export async function syntaxCheck(state) {
  console.log("[Worker.syntaxCheck] start", { currentTaskId: state.currentTaskId });

  const task = getCurrentTask(state);
  if (!task || !task.output) {
    const message = "No generated output available for syntax check.";
    console.log("[Worker.syntaxCheck] end - failed", { error: message });
    return {
      syntaxOk: false,
      error: message,
    };
  }

  const syntaxOk = !task.output.includes("SYNTAX_ERROR");
  const updatedTasks = state.tasks.map((item) =>
    item.id === task.id ? { ...item, syntaxOk } : item,
  );

  console.log("[Worker.syntaxCheck] end", { taskId: task.id, syntaxOk });
  return {
    syntaxOk,
    tasks: updatedTasks,
    error: syntaxOk ? null : "Syntax check failed by marker.",
  };
}

export async function runTests(state) {
  console.log("[Worker.runTests] start", { currentTaskId: state.currentTaskId });

  const task = getCurrentTask(state);
  if (!task) {
    const message = "No current task found for test run.";
    console.log("[Worker.runTests] end - failed", { error: message });
    return { error: message };
  }

  const relatedMilestone = state.milestones.find((ms) => ms.id === task.milestoneId);
  const testNames = relatedMilestone?.tests ?? ["basic smoke test"];

  const passed = Boolean(task.output) && state.syntaxOk;
  const details = `${passed ? "PASS" : "FAIL"}: ${testNames.join(" | ")}`;

  const updatedTasks = state.tasks.map((item) =>
    item.id === task.id ? { ...item, testResult: { passed, details } } : item,
  );

  console.log("[Worker.runTests] end", { taskId: task.id, passed });
  return {
    tasks: updatedTasks,
    error: passed ? null : "Milestone tests failed.",
  };
}

export async function packageFeedback(state) {
  console.log("[Worker.packageFeedback] start", { currentTaskId: state.currentTaskId });

  const task = getCurrentTask(state);
  if (!task) {
    const message = "Cannot package feedback without an active task.";
    console.log("[Worker.packageFeedback] end - failed", { error: message });
    return {
      workerFeedback: null,
      currentTaskId: null,
      error: message,
    };
  }

  const passedTests = task.testResult?.passed ?? false;
  const status = state.syntaxOk && passedTests ? "completed" : "failed";
  const feedback = {
    taskId: task.id,
    status,
    output: task.output,
    syntaxOk: state.syntaxOk,
    testResult: task.testResult,
    error: status === "failed" ? task.error ?? "Syntax check or tests failed." : undefined,
  };

  console.log("[Worker.packageFeedback] end", { taskId: task.id, status: feedback.status });
  return {
    workerFeedback: feedback,
    currentTaskId: null,
  };
}

export async function routeAfterSyntaxCheck(state) {
  if (!state.syntaxOk) {
    console.log("[Worker.routeAfterSyntaxCheck] syntax failed -> package feedback");
    return "package_feedback";
  }

  console.log("[Worker.routeAfterSyntaxCheck] syntax ok -> run tests");
  return "run_tests";
}
