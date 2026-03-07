import process from "process";
import { executeGithubTool, listIssues } from "./github-tools.js";
import { generatePlan } from "./llm.js";

const MAX_ITERATIONS = 20;

function normalizePlan(plan, userPrompt) {
  const tasks = Array.isArray(plan?.tasks) ? plan.tasks : [];
  const milestones = Array.isArray(plan?.milestones) ? plan.milestones : [];

  if (tasks.length === 0) {
    return {
      tasks: [
        {
          id: "task-1",
          title: "Clarify missing plan",
          description: `Fallback task for prompt: ${userPrompt.slice(0, 120)}`,
          milestoneId: "ms-1",
          status: "pending",
          toolAction: null,
          toolInput: {},
        },
      ],
      milestones: [{ id: "ms-1", title: "Fallback milestone", tests: ["Task reached worker stage"] }],
    };
  }

  return {
    tasks: tasks.map((task, index) => ({
      id: task.id || `task-${index + 1}`,
      title: task.title || `Task ${index + 1}`,
      description: task.description || "No description provided.",
      milestoneId: task.milestoneId || "ms-1",
      status: "pending",
      toolAction: task.toolAction ?? null,
      toolInput: task.toolInput ?? {},
    })),
    milestones: milestones.length
      ? milestones
      : [{ id: "ms-1", title: "Implementation", tests: ["Syntax check passes", "Worker feedback exists"] }],
  };
}

export async function parseTasks(state) {
  console.log("[Planner.parseTasks] start", {
    existingTaskCount: state.tasks.length,
    newRequirementsCount: state.newRequirements.length,
  });

  const shouldReplan = state.tasks.length === 0 || state.newRequirements.length > 0;
  if (!shouldReplan) {
    console.log("[Planner.parseTasks] end - skip replan");
    return {};
  }

  try {
    const plan = await generatePlan(state.userPrompt, state.newRequirements);
    const { tasks, milestones } = normalizePlan(plan, state.userPrompt);

    console.log("[Planner.parseTasks] end - replanned", { taskCount: tasks.length, milestoneCount: milestones.length });
    return {
      tasks,
      milestones,
      newRequirements: [],
      error: null,
    };
  } catch (error) {
    const message = `Plan generation failed: ${error.message}`;
    console.log("[Planner.parseTasks] end - failed", { error: message });
    return { error: message };
  }
}

export async function factCheck(state) {
  console.log("[Planner.factCheck] start");

  if (!state.userPrompt || state.userPrompt.trim().length < 8) {
    const message = "User prompt is too short for reliable planning.";
    console.log("[Planner.factCheck] end - failed", { error: message });
    return { error: message };
  }

  try {
    const issueSnapshot = await listIssues("open", 5);
    console.log("[Planner.factCheck] end - passed", { openIssuesScanned: issueSnapshot.length });
    return {
      error: null,
      repoContext: {
        ...state.repoContext,
        openIssues: issueSnapshot,
      },
    };
  } catch (error) {
    const message = `Fact check failed while reading repository: ${error.message}`;
    console.log("[Planner.factCheck] end - degraded", { warning: message });
    return {
      error: null,
      repoContext: {
        ...state.repoContext,
        factCheckWarning: message,
      },
    };
  }
}

export async function plannerTools(state) {
  console.log("[Planner.plannerTools] start");

  const toolSpecRaw = process.env.PLANNER_TOOL_ACTION_JSON;
  if (!toolSpecRaw) {
    console.log("[Planner.plannerTools] end - no tool action requested");
    return {};
  }

  try {
    const spec = JSON.parse(toolSpecRaw);
    const result = await executeGithubTool(spec.action, spec.input || {});
    console.log("[Planner.plannerTools] end - tool executed", { action: spec.action });

    return {
      repoContext: {
        ...state.repoContext,
        plannerToolResult: result,
      },
      error: null,
    };
  } catch (error) {
    const message = `Planner tool execution failed: ${error.message}`;
    console.log("[Planner.plannerTools] end - failed", { error: message });
    return { error: message };
  }
}

export async function checkNewRequirements(state) {
  console.log("[Planner.checkNewRequirements] start");

  if (state.requirementsFetched) {
    console.log("[Planner.checkNewRequirements] end - already fetched in this run");
    return {};
  }

  const raw = process.env.NEW_REQUIREMENTS_JSON;
  if (!raw) {
    console.log("[Planner.checkNewRequirements] end - no external updates");
    return { requirementsFetched: true };
  }

  try {
    const parsed = JSON.parse(raw);
    const normalized = Array.isArray(parsed)
      ? parsed.filter((item) => typeof item === "string" && item.trim().length > 0)
      : [];

    console.log("[Planner.checkNewRequirements] end - updates loaded", { count: normalized.length });

    return {
      newRequirements: normalized,
      requirementsFetched: true,
      error: null,
    };
  } catch (error) {
    const message = `Failed to parse NEW_REQUIREMENTS_JSON: ${error.message}`;
    console.log("[Planner.checkNewRequirements] end - parse error", { error: message });
    return {
      error: message,
      requirementsFetched: true,
    };
  }
}

export async function assignTask(state) {
  console.log("[Planner.assignTask] start", { iteration: state.iteration });

  if (state.error) {
    console.log("[Planner.assignTask] end - blocked by error", { error: state.error });
    return {};
  }

  const pendingTask = state.tasks.find((task) => task.status === "pending");
  if (!pendingTask) {
    console.log("[Planner.assignTask] end - no pending task");
    return { currentTaskId: null };
  }

  const updatedTasks = state.tasks.map((task) =>
    task.id === pendingTask.id ? { ...task, status: "in_progress" } : task,
  );

  console.log("[Planner.assignTask] end - task assigned", { taskId: pendingTask.id });
  return {
    currentTaskId: pendingTask.id,
    tasks: updatedTasks,
  };
}

export async function handleFeedback(state) {
  console.log("[Planner.handleFeedback] start", { hasFeedback: Boolean(state.workerFeedback) });

  if (!state.workerFeedback) {
    const message = "Worker feedback missing after worker execution.";
    console.log("[Planner.handleFeedback] end - missing feedback", { error: message });
    return {
      error: message,
      iteration: state.iteration + 1,
    };
  }

  const feedback = state.workerFeedback;
  const updatedTasks = state.tasks.map((task) => {
    if (task.id !== feedback.taskId) {
      return task;
    }

    return {
      ...task,
      status: feedback.status,
      output: feedback.output,
      syntaxOk: feedback.syntaxOk,
      testResult: feedback.testResult,
      error: feedback.error,
    };
  });

  console.log("[Planner.handleFeedback] end", { taskId: feedback.taskId, status: feedback.status });

  return {
    tasks: updatedTasks,
    workerFeedback: null,
    iteration: state.iteration + 1,
  };
}

export async function shouldContinue(state) {
  console.log("[Planner.shouldContinue] evaluate", {
    iteration: state.iteration,
    taskCount: state.tasks.length,
    error: state.error,
  });

  if (state.error) {
    console.log("[Planner.shouldContinue] end - fatal error");
    return "end";
  }

  if (state.iteration >= MAX_ITERATIONS) {
    console.log("[Planner.shouldContinue] end - max iterations reached");
    return "end";
  }

  const hasPending = state.tasks.some((task) => task.status === "pending" || task.status === "in_progress");
  if (hasPending) {
    console.log("[Planner.shouldContinue] continue");
    return "continue";
  }

  console.log("[Planner.shouldContinue] end - all tasks finished");
  return "end";
}

export async function routeAfterRequirementCheck(state) {
  const hasUpdates = state.newRequirements.length > 0;
  if (hasUpdates) {
    console.log("[Planner.routeAfterRequirementCheck] replan required");
    return "replan";
  }

  console.log("[Planner.routeAfterRequirementCheck] proceed to assignment");
  return "assign";
}

export async function routeAfterAssignTask(state) {
  if (!state.currentTaskId) {
    console.log("[Planner.routeAfterAssignTask] no current task -> end");
    return "end";
  }

  console.log("[Planner.routeAfterAssignTask] current task ready -> run worker");
  return "run_worker";
}
