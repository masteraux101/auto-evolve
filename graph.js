import { END, START, StateGraph } from "@langchain/langgraph";
import { AgentStateAnnotation } from "./state.js";
import {
  assignTask,
  checkNewRequirements,
  factCheck,
  handleFeedback,
  parseTasks,
  plannerTools,
  routeAfterAssignTask,
  routeAfterRequirementCheck,
  shouldContinue,
} from "./planner.js";
import {
  applyGeneratedPatch,
  generateCode,
  packageFeedback,
  routeAfterSyntaxCheck,
  runTests,
  syntaxCheck,
  workerTools,
} from "./worker.js";

export function buildWorkerGraph() {
  const workerGraph = new StateGraph(AgentStateAnnotation)
    .addNode("workerTools", workerTools)
    .addNode("generateCode", generateCode)
    .addNode("applyGeneratedPatch", applyGeneratedPatch)
    .addNode("syntaxCheck", syntaxCheck)
    .addNode("runTests", runTests)
    .addNode("packageFeedback", packageFeedback)
    .addEdge(START, "workerTools")
    .addEdge("workerTools", "generateCode")
    .addEdge("generateCode", "applyGeneratedPatch")
    .addEdge("applyGeneratedPatch", "syntaxCheck")
    .addConditionalEdges("syntaxCheck", routeAfterSyntaxCheck, {
      run_tests: "runTests",
      package_feedback: "packageFeedback",
    })
    .addEdge("runTests", "packageFeedback")
    .addEdge("packageFeedback", END);

  return workerGraph.compile();
}

export function buildPlannerGraph() {
  const workerSubgraph = buildWorkerGraph();

  const plannerGraph = new StateGraph(AgentStateAnnotation)
    .addNode("parseTasks", parseTasks)
    .addNode("factCheck", factCheck)
    .addNode("plannerTools", plannerTools)
    .addNode("checkNewRequirements", checkNewRequirements)
    .addNode("assignTask", assignTask)
    .addNode("workerSubgraph", workerSubgraph)
    .addNode("handleFeedback", handleFeedback)
    .addEdge(START, "parseTasks")
    .addEdge("parseTasks", "factCheck")
    .addEdge("factCheck", "plannerTools")
    .addEdge("plannerTools", "checkNewRequirements")
    .addConditionalEdges("checkNewRequirements", routeAfterRequirementCheck, {
      replan: "parseTasks",
      assign: "assignTask",
    })
    .addConditionalEdges("assignTask", routeAfterAssignTask, {
      run_worker: "workerSubgraph",
      end: END,
    })
    .addEdge("workerSubgraph", "handleFeedback")
    .addConditionalEdges("handleFeedback", shouldContinue, {
      continue: "assignTask",
      end: END,
    });

  return plannerGraph.compile();
}

export function buildFinalOutput(state) {
  const completed = state.tasks.filter((task) => task.status === "completed").length;
  const failed = state.tasks.filter((task) => task.status === "failed").length;

  return JSON.stringify(
    {
      issuePrompt: state.userPrompt,
      iteration: state.iteration,
      completed,
      failed,
      tasks: state.tasks,
      milestones: state.milestones,
      repoContext: state.repoContext,
      error: state.error,
    },
    null,
    2,
  );
}
