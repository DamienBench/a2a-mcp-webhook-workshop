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

// Initialize the Genkit AI client with enhanced configuration for complex transcripts
export const ai = genkit({
  plugins: [
    googleAI({
      apiKey: process.env.GEMINI_API_KEY,
    }),
  ],
  model: googleAI.model("gemini-2.0-flash", {
    maxOutputTokens: 8192,  // Increased for complex outputs
    temperature: 0.1,      // Lower temperature for more consistent task generation
    topP: 0.8,            // Balanced creativity and focus
    topK: 40              // Reasonable diversity
  }),
  promptDir: dirname(fileURLToPath(import.meta.url)),
});

// Load the prompt defined in host_agent.prompt
export const hostAgentPrompt = ai.prompt("host_agent");

// Cache for agent capabilities and examples (populated at runtime)
export const agentCache = new Map<string, {
  description: string;
  examples: string[];
  agentCard?: any;
}>();

/**
 * Fetch agent information from its agent card
 */
async function fetchAgentInfo(agentUrl: string): Promise<{ description: string; examples: string[]; agentCard: any }> {
  try {
    const client = new A2AClient(agentUrl);
    const agentCard = await client.agentCard();
    
    // Extract capabilities description from agent card
    let description = agentCard.description || '';
    
    // Extract examples from agent card skills
    const examples: string[] = [];
    if (agentCard.skills && agentCard.skills.length > 0) {
      for (const skill of agentCard.skills) {
        if (skill.examples && Array.isArray(skill.examples)) {
          examples.push(...skill.examples);
        }
      }
    }
    
    return { description, examples, agentCard };
  } catch (error) {
    console.error(`[HostAgent] Error fetching agent info from ${agentUrl}:`, error);
    return { 
      description: `Agent at ${agentUrl}`,
      examples: [],
      agentCard: {}
    };
  }
}

// Define the list_remote_agents tool
export const listRemoteAgents = ai.defineTool(
  {
    name: "list_remote_agents",
    description: "List all available remote agents that can handle specific tasks",
    inputSchema: z.object({}).catchall(z.any()),
  },
  async () => {
    console.log("[HostAgent] Listing remote agents");
    
    // Get all agent information from cache
    const agents = Array.from(agentCache.entries()).map(([name, info]) => ({
      name,
      description: info.description,
      examples: info.examples || []
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
      agent_name: z.string().describe("The name of the agent to send the task to"),
      message: z.string().describe("The message or instructions to send to the agent")
    }).catchall(z.any()),
  },
  async (inputParams) => {
    console.log("[HostAgent] Sending task with params:", JSON.stringify(inputParams, null, 2));
    
    // Extract agent name and message
    const { agent_name, message } = inputParams;
    
    // Get agent URL from the global configuration (loaded elsewhere)
    const agentUrl = global.agentUrls?.[agent_name];
    
    if (!agentUrl) {
      console.error(`[HostAgent] Agent ${agent_name} not found!`);
      return { 
        success: false, 
        error: `Agent ${agent_name} not found` 
      };
    }
    
    // Check if we're in webhook analysis mode (set externally)
    if (global.isWebhookContentAnalysis) {
      console.log(`[HostAgent] Skipping task sending during content analysis for ${agent_name}. This task will be sent later during parallel execution.`);
      return {
        success: true,
        agent: agent_name,
        message,
        state: "skipped",
        skippedDuringAnalysis: true
      };
    }
    
    // Log the specific task being sent for debugging
    console.log(`[HostAgent] Sending task to ${agent_name.toUpperCase()} agent: "${message}"`);
    
    try {
      // Get agent examples from cache
      const agentInfo = agentCache.get(agent_name);
      if (agentInfo?.examples) {
        console.log(`[HostAgent] Using examples for ${agent_name}:`, agentInfo.examples);
      }
      
      // Forward to sub-agent
      const client = new A2AClient(agentUrl);
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
      
      // Get the actual response message from the agent
      let formattedResponse = "";
      if (response && response.status && response.status.message) {
        const respMessage = response.status.message;
        if (respMessage.parts && respMessage.parts.length > 0 && 'text' in respMessage.parts[0]) {
          const originalText = respMessage.parts[0].text || "";
          // Clean up empty responses
          if (originalText.trim()) {
            // Prefix with agent name if it doesn't already have it
            formattedResponse = originalText.startsWith(`${agent_name}:`) ? 
              originalText : 
              `${agent_name} Agent: ${originalText}`;
            
            // Update the response message text
            respMessage.parts[0].text = formattedResponse;
          }
        }
      }
      
      return {
        success: true,
        agent: agent_name,
        message,
        response,
        formattedResponse,
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

/**
 * Register an agent in the cache
 * @param agentType The name/type of the agent
 * @param agentUrl The URL of the agent
 */
export async function registerAgent(agentType: string, agentUrl: string): Promise<void> {
  try {
    const agentInfo = await fetchAgentInfo(agentUrl);
    agentCache.set(agentType, agentInfo);
  } catch (error) {
    console.error(`[HostAgent] Error registering agent '${agentType}':`, error);
    // Add a minimal entry even on error
    agentCache.set(agentType, {
      description: `Agent at ${agentUrl}`,
      examples: []
    });
  }
}

// Function to get all available tools
export function getHostTools() {
  return [listRemoteAgents, sendTask];
}

export { z }; 