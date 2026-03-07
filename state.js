import { Annotation } from "@langchain/langgraph";

/** @typedef {"pending" | "in_progress" | "completed" | "failed"} TaskStatus */

/**
 * @typedef {Object} TaskItem
 * @property {string} id
 * @property {string} title
 * @property {string} description
 * @property {string=} milestoneId
 * @property {TaskStatus} status
 * @property {string=} output
 * @property {boolean=} syntaxOk
 * @property {{passed: boolean, details: string}=} testResult
 * @property {string=} error
 * @property {"read_file"|"list_directory"|"upsert_file"|"delete_file"|"create_issue"|"list_issues"|"comment_issue"|null=} toolAction
 * @property {Object<string, any>=} toolInput
 */

/**
 * @typedef {Object} Milestone
 * @property {string} id
 * @property {string} title
 * @property {string[]} tests
 */

/**
 * @typedef {Object} WorkerFeedback
 * @property {string} taskId
 * @property {Exclude<TaskStatus, "pending">} status
 * @property {string=} output
 * @property {boolean} syntaxOk
 * @property {{passed: boolean, details: string}=} testResult
 * @property {string=} error
 */

export const AgentStateAnnotation = Annotation.Root({
  userPrompt: Annotation({ reducer: (_, next) => next, default: () => "" }),
  tasks: Annotation({ reducer: (_, next) => next, default: () => [] }),
  currentTaskId: Annotation({ reducer: (_, next) => next, default: () => null }),
  milestones: Annotation({ reducer: (_, next) => next, default: () => [] }),
  workerFeedback: Annotation({ reducer: (_, next) => next, default: () => null }),
  newRequirements: Annotation({ reducer: (_, next) => next, default: () => [] }),
  requirementsFetched: Annotation({ reducer: (_, next) => next, default: () => false }),
  iteration: Annotation({ reducer: (_, next) => next, default: () => 0 }),
  finalOutput: Annotation({ reducer: (_, next) => next, default: () => "" }),
  error: Annotation({ reducer: (_, next) => next, default: () => null }),
  syntaxOk: Annotation({ reducer: (_, next) => next, default: () => true }),
  repoContext: Annotation({ reducer: (_, next) => next, default: () => ({}) }),
});

/** @returns {import("@langchain/langgraph").StateType<typeof AgentStateAnnotation>} */
export function createInitialState() {
  return {
    userPrompt: "",
    tasks: [],
    currentTaskId: null,
    milestones: [],
    workerFeedback: null,
    newRequirements: [],
    requirementsFetched: false,
    iteration: 0,
    finalOutput: "",
    error: null,
    syntaxOk: true,
    repoContext: {},
  };
}
