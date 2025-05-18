import { genkit } from "genkit/beta";
import { googleAI } from "@genkit-ai/googleai";
import * as dotenv from "dotenv";
import { z } from "genkit/beta";
import { dirname } from "path";
import { fileURLToPath } from "url";
import { A2AClient } from '../../a2a/client/client.js';

// Load environment variables from .env file
dotenv.config();

// Check for required environment variables
if (!process.env.GEMINI_API_KEY) {
  console.error("GEMINI_API_KEY environment variable is required");
  process.exit(1);
}

// Agent URLs
const agentUrls = {
  slack: process.env.SLACK_AGENT_URL || "http://localhost:41243",
  salesforce: process.env.SALESFORCE_AGENT_URL || "http://localhost:41244",
  github: process.env.GITHUB_AGENT_URL || "http://localhost:41245"
};

// Initialize the Genkit AI client
export const ai = genkit({
  plugins: [
    googleAI({
      apiKey: process.env.GEMINI_API_KEY,
    }),
  ],
  model: googleAI.model("gemini-2.0-flash"),
  promptDir: dirname(fileURLToPath(import.meta.url)),
});

// Load the prompt defined in host_agent.prompt
export const hostAgentPrompt = ai.prompt("host_agent");

// Define the list_remote_agents tool
export const listRemoteAgents = ai.defineTool(
  {
    name: "list_remote_agents",
    description: "List all available remote agents that can handle specific tasks",
    inputSchema: z.object({}).catchall(z.any()),
  },
  async () => {
    console.log("[HostAgent] Listing remote agents");
    
    const agents = Object.entries(agentUrls).map(([name, url]) => ({
      name,
      description: getAgentDescription(name)
    }));
    
    console.log("[HostAgent] Available agents:", JSON.stringify(agents, null, 2));
    return agents;
  }
);

// Define the send_task tool for routing to specific agents
export const sendTask = ai.defineTool(
  {
    name: "send_task",
    description: "Send a task to a specific remote agent",
    inputSchema: z.object({
      agent_name: z.string().describe("The name of the agent to send the task to (slack, github, or salesforce)"),
      message: z.string().describe("The message or instructions to send to the agent")
    }).catchall(z.any()),
  },
  async (inputParams) => {
    console.log("[HostAgent] Sending task with params:", JSON.stringify(inputParams, null, 2));
    
    // Extract agent name and message
    const { agent_name, message } = inputParams;
    
    if (!agentUrls[agent_name]) {
      console.error(`[HostAgent] Agent ${agent_name} not found!`);
      return { 
        success: false, 
        error: `Agent ${agent_name} not found` 
      };
    }
    
    // Log the specific task being sent for debugging
    console.log(`[HostAgent] Sending task to ${agent_name.toUpperCase()} agent: "${message}"`);
    
    try {
      // Forward to sub-agent
      const client = new A2AClient(agentUrls[agent_name]);
      const taskId = crypto.randomUUID();
      
      console.log(`[HostAgent] Calling A2AClient.sendTask for ${agent_name} with taskId ${taskId}`);
      const response = await client.sendTask({
        id: taskId,
        message: {
          role: "user",
          parts: [{ type: "text", text: message }]
        }
      });
      
      console.log(`[HostAgent] Got response from ${agent_name}:`, JSON.stringify(response, null, 2));
      
      // Format the response for the LLM
      if (response && response.status && response.status.message) {
        const respMessage = response.status.message;
        if (respMessage.parts && respMessage.parts.length > 0 && 'text' in respMessage.parts[0]) {
          const originalText = respMessage.parts[0].text;
          respMessage.parts[0].text = `[${agent_name}] ${originalText}`;
        }
      }
      
      return {
        success: true,
        agent: agent_name,
        message,
        response,
        state: response?.status?.state || "unknown"
      };
    } catch (error) {
      console.error(`[HostAgent] Error sending task to ${agent_name}:`, error);
      return { 
        success: false,
        agent: agent_name,
        error: error.message 
      };
    }
  }
);

// Helper function to get agent descriptions
function getAgentDescription(agentName: string): string {
  switch (agentName) {
    case 'slack':
      return "Send messages to Slack channels";
    case 'github':
      return "Create issues in GitHub repositories";
    case 'salesforce':
      return "Create, find, and update Salesforce records";
    default:
      return "Unknown agent";
  }
}

// Function to get all available tools
export function getHostTools() {
  return [listRemoteAgents, sendTask];
}

export { z }; 