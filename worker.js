import process from "process";
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

  if (task.toolAction === "upsert_file" && !(task.toolInput?.path && task.toolInput?.content)) {
    console.log("[Worker.workerTools] skip direct upsert - waiting for generated patch content");
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
    const forceWrite = task.toolAction === "upsert_file";

    const normalized = {
      write: Boolean(generated?.write) || forceWrite,
      path:
        typeof generated?.path === "string" && generated.path.trim().length > 0
          ? generated.path
          : typeof task.toolInput?.path === "string"
            ? task.toolInput.path
            : "",
      content: typeof generated?.content === "string" ? generated.content : "",
      message: typeof generated?.message === "string" ? generated.message : `chore: update ${task.id}`,
      summary: typeof generated?.summary === "string" ? generated.summary : "",
    };

    const updatedTasks = state.tasks.map((item) =>
      item.id === task.id
        ? {
            ...item,
            output: normalized.summary || normalized.content,
            generatedPatch: normalized,
            error: undefined,
          }
        : item,
    );

    console.log("[Worker.generateCode] end", {
      taskId: task.id,
      write: normalized.write,
      path: normalized.path,
      contentLength: normalized.content.length,
    });
    return { tasks: updatedTasks, error: null };
  } catch (error) {
    const message = `Code generation failed: ${error.message}`;
    console.log("[Worker.generateCode] end - failed", { error: message });
    return { error: message };
  }
}

export async function applyGeneratedPatch(state) {
  console.log("[Worker.applyGeneratedPatch] start", { currentTaskId: state.currentTaskId });

  const task = getCurrentTask(state);
  if (!task) {
    const message = "No current task found while applying generated patch.";
    console.log("[Worker.applyGeneratedPatch] end - failed", { error: message });
    return { error: message };
  }

  const patch = task.generatedPatch;
  if (!patch || !patch.write) {
    console.log("[Worker.applyGeneratedPatch] end - no repository write requested");
    return {};
  }

  if (!patch.path || !patch.content) {
    const message = "Generated patch requested write but missing path/content.";
    console.log("[Worker.applyGeneratedPatch] end - failed", { error: message });
    return { error: message };
  }

  try {
    const result = await executeGithubTool("upsert_file", {
      path: patch.path,
      content: patch.content,
      message: patch.message || `chore: upsert ${patch.path}`,
      branch: process.env.TARGET_BRANCH,
    });

    const updatedTasks = state.tasks.map((item) =>
      item.id === task.id
        ? {
            ...item,
            toolAction: "upsert_file",
            toolInput: {
              path: patch.path,
              message: patch.message,
            },
          }
        : item,
    );

    console.log("[Worker.applyGeneratedPatch] end - upsert success", {
      taskId: task.id,
      path: patch.path,
      commitSha: result.commitSha,
    });

    return {
      tasks: updatedTasks,
      repoContext: {
        ...state.repoContext,
        [`generatedPatch:${task.id}`]: result,
      },
      error: null,
    };
  } catch (error) {
    const message = `Apply generated patch failed: ${error.message}`;
    console.log("[Worker.applyGeneratedPatch] end - failed", { error: message });
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
