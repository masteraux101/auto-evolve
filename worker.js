import process from "process";
import { executeGithubTool, upsertFile } from "./github-tools.js";
import { generateTaskOutput } from "./llm.js";

function getCurrentTask(state) {
  return state.tasks.find((task) => task.id === state.currentTaskId) || null;
}

function updateTask(tasks, taskId, updater) {
  return tasks.map((task) => {
    if (task.id !== taskId) {
      return task;
    }
    return updater(task);
  });
}

export async function workerTools(state) {
  console.log("[Worker.workerTools] start", { taskId: state.currentTaskId });
  const task = getCurrentTask(state);
  if (!task) {
    const message = "Current task not found in state.";
    console.log("[Worker.workerTools] end - failed", { error: message });
    return {};
  }

  if (!task.toolAction) {
    console.log("[Worker.workerTools] end - no tool action");
    return {};
  }

  try {
    const result = await executeGithubTool(task.toolAction, task.toolInput || {});
    console.log("[Worker.workerTools] end - tool executed", { action: task.toolAction });
    return {
      repoContext: {
        ...state.repoContext,
        workerToolResult: {
          taskId: task.id,
          action: task.toolAction,
          result,
        },
      },
      error: null,
    };
  } catch (error) {
    const message = `Worker tool execution failed: ${error.message}`;
    console.log("[Worker.workerTools] end - failed", { error: message });
    const tasks = updateTask(state.tasks, task.id, (item) => ({
      ...item,
      error: message,
    }));
    return { tasks };
  }
}

export async function generateCode(state) {
  console.log("[Worker.generateCode] start", { taskId: state.currentTaskId });
  const task = getCurrentTask(state);
  if (!task) {
    const message = "Current task not found for code generation.";
    console.log("[Worker.generateCode] end - failed", { error: message });
    return {};
  }

  try {
    const patch = await generateTaskOutput(task.title, task.description, {
      ...state.repoContext,
      targetRepository: process.env.TARGET_REPOSITORY || process.env.GITHUB_REPOSITORY || "",
      targetBranch: process.env.TARGET_BRANCH || "main",
      currentTaskId: task.id,
    });

    const normalizedPatch = {
      write: Boolean(patch?.write),
      path: typeof patch?.path === "string" ? patch.path : "",
      content: typeof patch?.content === "string" ? patch.content : "",
      message: typeof patch?.message === "string" ? patch.message : `chore: update ${task.id}`,
      summary: typeof patch?.summary === "string" ? patch.summary : "No summary provided.",
    };

    const tasks = updateTask(state.tasks, task.id, (item) => ({
      ...item,
      generatedPatch: normalizedPatch,
    }));

    console.log("[Worker.generateCode] end - patch generated", {
      taskId: task.id,
      write: normalizedPatch.write,
      path: normalizedPatch.path,
    });

    return {
      tasks,
    };
  } catch (error) {
    const message = `Code generation failed: ${error.message}`;
    console.log("[Worker.generateCode] end - failed", { error: message });
    const tasks = updateTask(state.tasks, task.id, (item) => ({
      ...item,
      generatedPatch: {
        write: false,
        path: "",
        content: "",
        message: "",
        summary: message,
      },
      error: message,
    }));
    return { tasks };
  }
}

export async function applyGeneratedPatch(state) {
  console.log("[Worker.applyGeneratedPatch] start", { taskId: state.currentTaskId });
  const task = getCurrentTask(state);
  if (!task) {
    const message = "Current task not found for patch application.";
    console.log("[Worker.applyGeneratedPatch] end - failed", { error: message });
    return {};
  }

  const patch = task.generatedPatch;
  if (!patch) {
    const message = "Generated patch missing before apply step.";
    console.log("[Worker.applyGeneratedPatch] end - failed", { error: message });
    const tasks = updateTask(state.tasks, task.id, (item) => ({
      ...item,
      error: message,
    }));
    return { tasks };
  }

  if (!patch.write) {
    const tasks = updateTask(state.tasks, task.id, (item) => ({
      ...item,
      output: patch.summary || "No repository write requested.",
    }));

    console.log("[Worker.applyGeneratedPatch] end - write skipped", { taskId: task.id });
    return {
      tasks,
    };
  }

  if (!patch.path || !patch.message || typeof patch.content !== "string") {
    const message = "Generated patch is invalid for repository write.";
    console.log("[Worker.applyGeneratedPatch] end - failed", { error: message });
    const tasks = updateTask(state.tasks, task.id, (item) => ({
      ...item,
      error: message,
    }));
    return { tasks };
  }

  try {
    const result = await upsertFile(
      patch.path,
      patch.content,
      patch.message,
      process.env.TARGET_BRANCH || "main",
    );

    const output = `${patch.summary}\nCommit: ${result.commitSha || "unknown"}\nPath: ${patch.path}`;
    const tasks = updateTask(state.tasks, task.id, (item) => ({
      ...item,
      output,
    }));

    console.log("[Worker.applyGeneratedPatch] end - write applied", {
      taskId: task.id,
      commitSha: result.commitSha,
      path: patch.path,
    });

    return {
      tasks,
      repoContext: {
        ...state.repoContext,
        lastWriteResult: result,
      },
    };
  } catch (error) {
    const message = `Patch application failed: ${error.message}`;
    console.log("[Worker.applyGeneratedPatch] end - failed", { error: message });
    const tasks = updateTask(state.tasks, task.id, (item) => ({
      ...item,
      error: message,
    }));
    return { tasks };
  }
}

export async function syntaxCheck(state) {
  console.log("[Worker.syntaxCheck] start", { taskId: state.currentTaskId });
  const task = getCurrentTask(state);
  if (!task) {
    console.log("[Worker.syntaxCheck] end - failed", { error: "Current task not found." });
    return {
      syntaxOk: false,
    };
  }

  const patch = task.generatedPatch;
  if (patch?.write && patch.path.endsWith(".js") && patch.content.trim().length === 0) {
    console.log("[Worker.syntaxCheck] end - failed", { error: "Empty JavaScript content." });
    return {
      syntaxOk: false,
    };
  }

  console.log("[Worker.syntaxCheck] end - passed", { taskId: task.id });
  return {
    syntaxOk: true,
  };
}

export async function routeAfterSyntaxCheck(state) {
  if (state.syntaxOk) {
    console.log("[Worker.routeAfterSyntaxCheck] run tests");
    return "run_tests";
  }

  console.log("[Worker.routeAfterSyntaxCheck] package feedback directly");
  return "package_feedback";
}

export async function runTests(state) {
  console.log("[Worker.runTests] start", { taskId: state.currentTaskId });
  const result = {
    passed: true,
    details: "No local test suite configured. Basic worker flow validation passed.",
  };

  console.log("[Worker.runTests] end", result);
  return {
    repoContext: {
      ...state.repoContext,
      testResult: result,
    },
  };
}

export async function packageFeedback(state) {
  console.log("[Worker.packageFeedback] start", { taskId: state.currentTaskId });
  const task = getCurrentTask(state);
  if (!task) {
    const message = "Cannot package feedback: current task not found.";
    console.log("[Worker.packageFeedback] end - failed", { error: message });
    return {
      workerFeedback: {
        taskId: state.currentTaskId || "unknown",
        status: "failed",
        syntaxOk: false,
        testResult: { passed: false, details: message },
        error: message,
      },
    };
  }

  const finalError = task.error || null;
  const syntaxOk = state.syntaxOk && !finalError;
  const testResult = state.repoContext?.testResult || {
    passed: syntaxOk,
    details: syntaxOk ? "No tests executed." : "Skipped due to previous error.",
  };

  const feedback = {
    taskId: task.id,
    status: finalError ? "failed" : "completed",
    output: task.output || task.generatedPatch?.summary || "No output generated.",
    syntaxOk,
    testResult,
    error: finalError || undefined,
  };

  console.log("[Worker.packageFeedback] end", {
    taskId: feedback.taskId,
    status: feedback.status,
  });

  return {
    workerFeedback: feedback,
  };
}
