/**
 * Host Agent - The main server that routes requests to sub-agents
 */

import dotenv from 'dotenv';
import crypto from 'crypto';
import { hostAgentPrompt, getHostTools } from './genkit.js';
import { TaskContext, A2AServer, TaskYieldUpdate } from "../server/index.js";
import * as schema from "../schema.js";
import { A2AClient } from '../client/client.js';

// Load environment variables
dotenv.config();

// Enable verbose debugging
const DEBUG = true;

// Helper function for debugging
function debug(...args: any[]) {
  if (DEBUG) {
    console.log('[HostAgent DEBUG]', ...args);
  }
}

// Agent URLs
const agentUrls = {
  slack: process.env.SLACK_AGENT_URL || "http://localhost:41243",
  salesforce: process.env.SALESFORCE_AGENT_URL || "http://localhost:41244",
  github: process.env.GITHUB_AGENT_URL || "http://localhost:41245"
};

// Define port for the server
const SERVER_PORT = parseInt(process.env.HOST_AGENT_PORT || "41240");

// Session tracking
interface Session {
  id: string;
  active: boolean;
  activeAgent?: string;
  taskId?: string;
}

const sessions = new Map<string, Session>();

/**
 * Simple pattern matcher to route requests without LLM
 * @param text User message text
 * @returns Agent name if pattern match, null otherwise
 */
function matchAgentPattern(text: string): string | null {
  const lowerText = text.toLowerCase();
  
  // Direct keywords
  if (lowerText.includes('slack')) {
    return 'slack';
  } else if (lowerText.includes('github')) {
    return 'github';
  } else if (lowerText.includes('salesforce')) {
    return 'salesforce';
  }
  
  // Common patterns
  if (lowerText.includes('message') || lowerText.includes('send') || lowerText.includes('post')) {
    if (lowerText.includes('channel') || lowerText.includes('#')) {
      return 'slack';
    }
    return 'slack'; // Default to slack for general sending
  }
  
  if (lowerText.includes('issue') || lowerText.includes('bug') || lowerText.includes('repo')) {
    return 'github';
  }
  
  if (lowerText.includes('record') || lowerText.includes('contact') || lowerText.includes('lead')) {
    return 'salesforce';
  }
  
  return null;
}

/**
 * Process a user request using direct pattern matching or the LLM
 */
async function processRequest(sessionId: string, text: string) {
  debug(`Processing request: "${text}"`);
  
  // First try pattern matching to avoid LLM rate limits
  const matchedAgent = matchAgentPattern(text);
  if (matchedAgent) {
    debug(`Direct pattern match: ${matchedAgent}`);
    console.log(`[HostAgent] Using direct pattern matching: ${matchedAgent}`);
    
    try {
      // Send directly to matched agent
      const client = new A2AClient(agentUrls[matchedAgent]);
      const taskId = crypto.randomUUID();
      
      console.log(`[HostAgent] Sending task directly to ${matchedAgent} agent: "${text}"`);
      const response = await client.sendTask({
        id: taskId,
        message: {
          role: "user",
          parts: [{ type: "text", text: text }]
        }
      });
      
      console.log(`[HostAgent] Got response from ${matchedAgent}:`, JSON.stringify(response, null, 2));
      
      // Format agent response for consistent handling
      if (response && response.status && response.status.message) {
        const respMessage = response.status.message;
        if (respMessage.parts && respMessage.parts.length > 0 && 'text' in respMessage.parts[0]) {
          const originalText = respMessage.parts[0].text;
          respMessage.parts[0].text = `[${matchedAgent}] ${originalText}`;
        }
      }
      
      return {
        success: true,
        directMatch: true,
        toolResults: [{
          toolName: 'send_task',
          input: { agent_name: matchedAgent, message: text },
          output: { success: true, response }
        }],
        agentResponse: response
      };
    } catch (error) {
      console.error(`[HostAgent] Error in direct routing to ${matchedAgent}:`, error);
      // Fall back to LLM-based routing
    }
  }
  
  // If no pattern match or direct routing failed, use LLM
  debug("Using LLM for routing");
  console.log("[HostAgent] Using LLM for complex routing");
  
  // Get current session state
  const session = sessions.get(sessionId);
  const contextData = {
    current_agent: session?.activeAgent || "none",
    now: new Date().toISOString()
  };
  
  debug("Context data:", contextData);
  debug("Getting host tools");
  
  // Get the tools for the Host Agent
  const hostTools = getHostTools();
  
  debug("Calling hostAgentPrompt");
  
  try {
    // Call the Host Agent prompt with the user text
    const response = await hostAgentPrompt(
      contextData,
      {
        messages: [
          {
            role: "user",
            content: [{ text }]
          }
        ],
        tools: hostTools
      }
    );
    
    debug("Got response from hostAgentPrompt:", JSON.stringify(response, null, 2));
    
    // Extract tool usage from the response
    const toolResults = [];
    
    if (response.request?.messages) {
      // Look for model messages that contain tool requests
      for (const msg of response.request.messages) {
        if (msg.role === 'model' && msg.content && Array.isArray(msg.content)) {
          for (const item of msg.content) {
            // Handle tool requests (the LLM called one of our tools)
            if (item.toolRequest && item.toolRequest.name && item.toolRequest.input) {
              const toolName = item.toolRequest.name;
              const toolInput = item.toolRequest.input;
              
              debug(`Tool request: ${toolName}`, toolInput);
              
              toolResults.push({
                toolName,
                input: toolInput
              });
            }
          }
        }
        
        // Look for tool responses 
        if (msg.role === 'tool' && msg.content && Array.isArray(msg.content)) {
          for (const item of msg.content) {
            if (item.toolResponse && item.toolResponse.output) {
              const output = item.toolResponse.output;
              
              debug("Tool response:", output);
              
              // Store the last send_task result
              if (toolResults.length > 0 && toolResults[toolResults.length - 1].toolName === 'send_task') {
                toolResults[toolResults.length - 1].output = output;
              }
            }
          }
        }
      }
    }
    
    debug("Extracted tool results:", toolResults);
    
    // Find the send_task result if any
    const sendTaskResult = toolResults.find(result => 
      result.toolName === 'send_task' && result.output && result.output.success
    );
    
    if (sendTaskResult) {
      debug("Found successful send_task result:", sendTaskResult);
      return {
        success: true,
        toolResults,
        agentResponse: sendTaskResult.output.response
      };
    }
    
    // If no successful send_task, return the general response
    return {
      success: false,
      toolResults,
      message: "Could not route to a specific agent. Please try again with a clearer request."
    };
  } catch (error) {
    console.error(`[HostAgent] Error processing request:`, error);
    debug("Full error:", error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Host agent implementation that routes requests to specialized sub-agents
 */
async function* hostAgent({
  task,
  userMessage,
}: TaskContext): AsyncGenerator<TaskYieldUpdate, schema.Task | void, unknown> {
  // First, send a "working" status update
  yield {
    state: "working",
    message: {
      role: "agent",
      parts: [{ type: "text", text: "Routing your request to the appropriate agent..." }],
    },
  };
  
  // Get the text from the user message parts
  const userText = userMessage.parts
    .filter((p): p is schema.TextPart => !!(p as schema.TextPart).text)
    .map((p) => p.text)
    .join("\n");
  
  try {
    console.log("[HostAgent] Processing request:", userText);
    
    // Generate a session ID
    const sessionId = task.id || crypto.randomUUID();
    
    // Process the request using the LLM
    yield {
      state: "working",
      message: {
        role: "agent",
        parts: [{ type: "text", text: "Analyzing your request..." }],
      },
    };
    
    const result = await processRequest(sessionId, userText);
    
    if (!result.success) {
      // If we couldn't route to a specific agent
      yield {
        state: "completed",
        message: {
          role: "agent",
          parts: [{ 
            type: "text", 
            text: result.message || "I'm not sure which service you want to use. Please specify if you want to:\n" +
                  "- Send a message to Slack\n" +
                  "- Create an issue in GitHub\n" +
                  "- Create or update a record in Salesforce"
          }],
        },
      };
      return;
    }
    
    // Process each tool result
    const toolResults = result.toolResults || [];
    for (const toolResult of toolResults) {
      if (toolResult.toolName === 'list_remote_agents' && toolResult.output) {
        const agents = toolResult.output;
        const agentsList = agents.map(a => `- ${a.name}: ${a.description}`).join('\n');
        yield {
          state: "working",
          message: {
            role: "agent",
            parts: [{ type: "text", text: `Available agents:\n${agentsList}` }],
          },
        };
      }
      else if (toolResult.toolName === 'send_task' && toolResult.input) {
        const agentName = toolResult.input.agent_name;
        yield {
          state: "working",
          message: {
            role: "agent",
            parts: [{ type: "text", text: `Routing your request to the ${agentName} agent...` }],
          },
        };
      }
    }
    
    // If we got a response from a sub-agent
    if (result.agentResponse) {
      // Return the agent's response directly
      // This is equivalent to the JSON-RPC response we previously returned
      if (result.agentResponse.status && result.agentResponse.status.message) {
        yield {
          state: result.agentResponse.status.state || "completed",
          message: result.agentResponse.status.message,
        };
      } else {
        // Fallback if response structure is unexpected
        const sendTaskInfo = result.toolResults?.find(tr => tr.toolName === 'send_task');
        const agentName = sendTaskInfo?.input?.agent_name || "unknown";
        
        yield {
          state: "completed",
          message: {
            role: "agent",
            parts: [{ type: "text", text: `I've forwarded your request to the ${agentName} agent.` }],
          },
        };
      }
    } else {
      // Fallback for unexpected result structure
      yield {
        state: "completed",
        message: {
          role: "agent",
          parts: [{ type: "text", text: "I processed your request, but didn't receive a proper response from the sub-agent." }],
        },
      };
    }
  } catch (error: any) {
    console.error("[HostAgent] Error:", error);
    yield {
      state: "failed",
      message: {
        role: "agent",
        parts: [
          { 
            type: "text", 
            text: `I encountered an error while processing your request: ${error.message || "Unknown error"}`
          },
        ],
      },
    };
  }
}

/**
 * Start the A2A server for Host agent
 */
async function initServer() {
  const port = SERVER_PORT;
  const server = new A2AServer(
    hostAgent,
    {
      card: {
        name: "Host Agent",
        description: "Routes requests to specialized sub-agents (Slack, GitHub, Salesforce)",
        url: `http://localhost:${port}`,
        provider: {
          organization: "A2A Samples",
        },
        version: "1.0.0",
        capabilities: {
          streaming: true,
          pushNotifications: false,
          stateTransitionHistory: true,
        },
        authentication: null,
        defaultInputModes: ["text"],
        defaultOutputModes: ["text"],
        skills: [
          {
            id: "list_remote_agents",
            name: "List Remote Agents",
            description: "List all available remote agents that can handle specific tasks",
            tags: ["routing", "discovery"],
            examples: [
              "What agents are available?",
              "Show me available agents"
            ]
          },
          {
            id: "send_task",
            name: "Send Task",
            description: "Send a task to a specific remote agent",
            tags: ["routing", "delegation"],
            examples: [
              "Send a message to Slack",
              "Create a GitHub issue",
              "Find a Salesforce contact"
            ]
          }
        ],
      }
    }
  );
  
  await server.start(port);
  console.log(`[HostAgent] Host Agent server started on http://localhost:${port}`);
  console.log(`[HostAgent] Use 'npm run a2a:cli' to interact with this Host Agent`);
  console.log(`[HostAgent] Connected to sub-agents:`);
  Object.entries(agentUrls).forEach(([name, url]) => {
    console.log(`[HostAgent]   - ${name}: ${url}`);
  });
}

/**
 * Main function to start the server
 */
async function main() {
  await initServer();
}

// Run the main function
main().catch(console.error); 