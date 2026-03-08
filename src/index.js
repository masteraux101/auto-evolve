import { StateGraph } from "@langchain/langgraph";

// This is a placeholder for the agent state
const agentState = {
  messages: {
    value: (x, y) => x.concat(y),
    default: () => [],
  },
};

// This is a placeholder for the graph
const workflow = new StateGraph({
  channels: agentState,
});

// TODO: Define nodes and edges for the graph

export default workflow;
