/**
 * Host Agent - The main server that routes requests to sub-agents
 */

import dotenv from 'dotenv';
import crypto from 'crypto';
import { hostAgentPrompt, getHostTools, registerAgent } from './genkit.js';
import { TaskContext, A2AServer, TaskYieldUpdate } from "../../a2a/server/index.js";
import * as schema from "../../schema.js";
import { A2AClient } from '../../a2a/client/client.js';
import { TaskSendParams } from "../../schema.js";
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { v4 as uuidv4 } from 'uuid';

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

// Get the directory name of the current file
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const hostConfigsDir = path.join(__dirname, 'configs');
const webhookConfigPath = path.join(hostConfigsDir, 'webhook.json');
const cliConfigPath = path.join(hostConfigsDir, 'cli.json');

// Load agent configuration
let cliConfig: any = null;
let agentUrls: Record<string, string> = {};
let agentCapabilities: Record<string, string> = {};

// Add agentUrls to global scope so it can be accessed by genkit.ts
declare global {
  var agentUrls: Record<string, string>;
  var isWebhookContentAnalysis: boolean;
}

// Attach agentUrls to global scope
global.agentUrls = agentUrls;
global.isWebhookContentAnalysis = false;

// Agent info map for examples by agent type
const agentInfoMap: Record<string, { examples?: string[] }> = {};

/**
 * Fetch agent capabilities from its agent card
 */
async function fetchAgentCapabilities(agentUrl: string): Promise<string> {
  try {
    console.log(`[HostAgent] Fetching capabilities from agent at ${agentUrl}`);
    const client = new A2AClient(agentUrl);
    const agentCard = await client.agentCard();
    
    // Extract capabilities from agent card
    let capabilities = '';
    
    if (agentCard.description) {
      capabilities = agentCard.description;
    } else if (agentCard.skills && agentCard.skills.length > 0) {
      // Combine skill descriptions
      capabilities = agentCard.skills
        .map(skill => `${skill.name}: ${skill.description}`)
        .join('; ');
    } else {
      capabilities = `Agent hosted at ${agentUrl}`;
    }
    
    console.log(`[HostAgent] Retrieved capabilities: ${capabilities.substring(0, 100)}...`);
    return capabilities;
  } catch (error) {
    console.error(`[HostAgent] Error fetching agent capabilities: ${error}`);
    throw error;
  }
}

/**
 * Refresh agent capabilities by querying all configured agents
 */
async function refreshAgentCapabilities(): Promise<void> {
  const updatedCapabilities: Record<string, string> = {};
  const errors: string[] = [];
  
  for (const [agentType, url] of Object.entries(agentUrls)) {
    try {
      updatedCapabilities[agentType] = await fetchAgentCapabilities(url);
      // Also register the agent in the agent cache
      await registerAgent(agentType, url);
    } catch (error) {
      errors.push(`Failed to fetch capabilities for ${agentType}: ${error}`);
    }
  }
  
  // Update the global capabilities map
  agentCapabilities = updatedCapabilities;
  
  if (errors.length > 0) {
    console.warn('[HostAgent] Errors refreshing agent capabilities:', errors);
  }
}

async function loadAgentConfig() {
  try {
    console.log('[HostAgent] Loading agent configurations...');
    
    // Ensure the config directory exists
    await fs.mkdir(hostConfigsDir, { recursive: true });
    
    // First, try to load the webhook configuration
    const webhookConfigs = new Map<string, any>();
    try {
      const configData = await fs.readFile(webhookConfigPath, 'utf-8');
      const config = JSON.parse(configData);
      
      if (config.id) {
        webhookConfigs.set(config.id, config);
        console.log(`[HostAgent] Loaded webhook config: ${config.id}`);
      }
    } catch (err) {
      console.error('[HostAgent] Error loading webhook configuration:', err);
    }
    
    // Load CLI configuration
    try {
      const cliConfigData = await fs.readFile(cliConfigPath, 'utf-8');
      cliConfig = JSON.parse(cliConfigData);
      console.log('[HostAgent] Loaded CLI configuration');
    } catch (err) {
      console.log('[HostAgent] No CLI configuration found');
      // No default creation - require the config file to exist
      throw new Error('CLI configuration not found');
    }
    
    // Consolidate agent information from all configs
    initializeAgentMaps();
    
    // First, extract from webhook configs (highest priority)
    for (const [_, config] of webhookConfigs.entries()) {
      if (config.processorConfig && config.processorConfig.agents) {
        for (const agent of config.processorConfig.agents) {
          const agentType = agent.type?.toLowerCase() || agent.id?.toLowerCase();
          if (agent.url) {
            agentUrls[agentType] = agent.url;
          }
        }
      }
    }
    
    // Then fill in from CLI config if needed
    if (cliConfig.agents) {
      for (const agent of cliConfig.agents) {
        const agentType = agent.type?.toLowerCase() || agent.id?.toLowerCase();
        // Only set if not already set by webhook config
        if (!agentUrls[agentType] && agent.url) {
          agentUrls[agentType] = agent.url;
        }
      }
    }
    
    // Override with environment variables if available
    for (const agentType in agentUrls) {
      const envVarName = `${agentType.toUpperCase()}_AGENT_URL`;
      if (process.env[envVarName]) {
        agentUrls[agentType] = process.env[envVarName] as string;
      }
    }
    
    // Update global agentUrls
    global.agentUrls = agentUrls;
    
    console.log('[HostAgent] Loaded agent URLs:', agentUrls);
    
    // Fetch agent capabilities
    await refreshAgentCapabilities();
    console.log('[HostAgent] Fetched agent capabilities:', agentCapabilities);
  } catch (err) {
    console.error('[HostAgent] Error loading agent configuration:', err);
    throw err;
  }
}

function initializeAgentMaps() {
  agentUrls = {};
  agentCapabilities = {};
  global.agentUrls = agentUrls;
}

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
 * Process a user request using the LLM
 */
async function processRequest(sessionId: string, text: string) {
  debug(`Processing request: "${text}"`);
  
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
    // Add retry logic with exponential backoff for rate limit errors
    let response;
    let retries = 0;
    const maxRetries = 5;
    const baseDelay = 1000; // 1 second initial delay
    
    while (retries <= maxRetries) {
      try {
        if (retries > 0) {
          debug(`Retry attempt ${retries}/${maxRetries} for processRequest`);
        }
        
        // Call the Host Agent prompt with the user text
        response = await hostAgentPrompt(
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
        
        // If we get here, the request succeeded, so break out of the retry loop
        break;
      } catch (error: any) {
        // Check if it's a rate limit error (429)
        const isRateLimit = error.message && (
          error.message.includes("429 Too Many Requests") || 
          error.message.includes("You exceeded your current quota")
        );
        
        if (isRateLimit && retries < maxRetries) {
          // Calculate exponential backoff with jitter
          const delay = baseDelay * Math.pow(2, retries) + Math.random() * 1000;
          debug(`Rate limit exceeded. Retrying in ${delay}ms...`);
          
          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, delay));
          retries++;
        } else {
          // Either not a rate limit error or we've exceeded max retries
          throw error;
        }
      }
    }
    
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
  // Log task ID for debugging
  console.log(`[DUPLICATION DEBUG] Received task with ID: ${task.id}`);
  
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
    
    // Check if this is a webhook message (sent by the webhook server)
    if (userText.startsWith('{') && userText.includes('"type":"webhook"')) {
      console.log("[HostAgent] Detected webhook data");
      
      try {
        // Parse the webhook data
        const webhookData = JSON.parse(userText);
        
        // Process the webhook data
        yield {
          state: "working",
          message: {
            role: "agent",
            parts: [{ type: "text", text: `Processing webhook from ${webhookData.webhookId || 'unknown source'}...` }],
          },
        };

        // Debug log for duplication tracking
        if (webhookData.type === 'webhook') {
          console.log(`[DUPLICATION DEBUG] Processing webhook task ${task.id} with requestId ${webhookData.requestId || 'undefined'}`);
        }

        // Direct webhook processing in the host agent
        const result = await processWebhookDirectly(webhookData);
        
        // Debug log for completion
        console.log(`[DUPLICATION DEBUG] Completed webhook task ${task.id}`);
        
        if (result.success) {
          yield {
            state: "completed",
            message: {
              role: "agent",
              parts: [{ 
                type: "text", 
                text: `Successfully processed webhook: ${webhookData.webhookId || 'unknown'}\n` +
                      `Results: ${JSON.stringify(result.results, null, 2)}`
              }],
            },
          };
        } else {
          yield {
            state: "failed",
            message: {
              role: "agent",
              parts: [{ 
                type: "text", 
                text: `Failed to process webhook: ${webhookData.webhookId || 'unknown'}`
              }],
            },
          };
        }
        
        return;
      } catch (error) {
        console.error("[HostAgent] Error processing webhook:", error);
      }
    }
    
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
      // Create a list of available agents from the configuration
      const availableAgents = Object.keys(agentUrls).map(agentType => {
        return `- Use the ${agentType} agent`;
      }).join('\n');
      
      yield {
        state: "completed",
        message: {
          role: "agent",
          parts: [{ 
            type: "text", 
            text: result.message || `I'm not sure which service you want to use. Please specify from the available agents:\n${availableAgents}`
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
 * Process a webhook directly in the host agent using the configuration
 */
async function processWebhookDirectly(webhookData: any): Promise<{success: boolean, results: Record<string, any>, tasks: Record<string, string>, error?: string}> {
  console.log('[HostAgent] Processing webhook directly:', JSON.stringify(webhookData, null, 2));
  console.log('[DUPLICATION DEBUG] ================ START WEBHOOK PROCESSING ================');
  console.log(`[DUPLICATION DEBUG] Processing webhook with requestId: ${webhookData.requestId || 'undefined'}`);
  console.log(`[DUPLICATION DEBUG] Webhook data hash: ${crypto.createHash('md5').update(JSON.stringify(webhookData.data || {})).digest('hex')}`);
  
  try {
    // Extract webhook ID and configuration
    const webhookId = webhookData.webhookId || 'unknown';
    const webhookName = webhookData.webhookName || webhookId;
    
    // Require processorConfig
    if (!webhookData.processorConfig) {
      throw new Error('Missing processorConfig in webhook data');
    }
    const processorConfig = webhookData.processorConfig;
    
    console.log(`[HostAgent] Processing ${webhookName} (${webhookId})`);
    console.log(`[DUPLICATION DEBUG] Processing webhook ${webhookId} at ${new Date().toISOString()}`);
    console.log(`[HostAgent] Processor config:`, JSON.stringify(processorConfig, null, 2));
    
    // Use a request ID to prevent duplicate processing
    const requestId = webhookData.requestId || `${webhookId}-${Date.now()}`;
    console.log(`[DUPLICATION DEBUG] Using requestId: ${requestId}`);
    
    // Check for recent identical request - simple duplicate prevention
    // This uses a timestamp-based approach that's stateless
    if (webhookData.timestamp) {
      const timestamp = new Date(webhookData.timestamp).getTime();
      const now = Date.now();
      const timeDiff = now - timestamp;
      
      console.log(`[DUPLICATION DEBUG] Request timestamp: ${webhookData.timestamp}, timeDiff: ${timeDiff}ms`);
      
      // If this is a duplicate request within 5 seconds, skip processing
      if (timeDiff < 5000) {
        console.log(`[DUPLICATION DEBUG] Potential duplicate request detected within 5 seconds (ID: ${requestId})`);
        return {
          success: true,
          results: {
            message: "Duplicate request detected and skipped",
            requestId: requestId
          },
          tasks: {}
        };
      }
    }
    
    // Add timestamp to the webhook data to help detect duplicates
    webhookData.timestamp = new Date().toISOString();
    webhookData.requestId = requestId;
    
    // Extract the content from the webhook data
    let content = '';
    if (webhookData.data) {
      // Try to find any string field that might contain content
      const keys = Object.keys(webhookData.data);
      for (const key of keys) {
        const value = webhookData.data[key];
        if (typeof value === 'string' && value.length > 10) {
          content = value;
          console.log(`[DUPLICATION DEBUG] Found content in key: ${key}, length: ${value.length}`);
          break;
        }
      }
    }
    
    // If no content was found, use the raw webhook data
    if (!content) {
      content = JSON.stringify(webhookData.data || {});
      console.log(`[DUPLICATION DEBUG] No content field found, using raw data, length: ${content.length}`);
    }
    
    // Check if we're using parallel or sequential execution
    const isParallel = processorConfig.parallel || false;
    console.log(`[HostAgent] Using ${isParallel ? 'parallel' : 'sequential'} execution mode`);
    
    // Check if we have agents configured
    if (!processorConfig.agents || !Array.isArray(processorConfig.agents) || processorConfig.agents.length === 0) {
      throw new Error('No agents configured for webhook processor');
    }
    
    console.log(`[HostAgent] Processing with ${processorConfig.agents.length} agents`);
    console.log(`[DUPLICATION DEBUG] Agent list: ${processorConfig.agents.map((a: any) => a.type || a.id).join(', ')}`);
    
    // Analyze content with LLM and get tasks for each agent
    console.log(`[DUPLICATION DEBUG] Calling analyzeContentWithLLM...`);
    const tasks = await analyzeContentWithLLM(content, processorConfig.agents, processorConfig);
    
    // Log the tasks to help with debugging
    console.log(`[HostAgent] Generated tasks:`, JSON.stringify(tasks, null, 2));
    console.log(`[DUPLICATION DEBUG] Generated tasks for agents: ${Object.keys(tasks).join(', ')}`);
    
    // Process each agent task in parallel or sequentially
    if (isParallel) {
      // Parallel execution
      console.log(`[DUPLICATION DEBUG] Starting parallel processing for requestId: ${requestId}`);
      const results = await processAgentsInParallel(tasks, processorConfig.agents);
      console.log(`[DUPLICATION DEBUG] Completed parallel processing for requestId: ${requestId}`);
      return { 
        success: true, 
        results,
        tasks // Explicitly include tasks in the response
      };
    } else {
      // Sequential execution
      console.log(`[DUPLICATION DEBUG] Starting sequential processing for requestId: ${requestId}`);
      const results = await processAgentsSequentially(tasks, processorConfig.agents);
      console.log(`[DUPLICATION DEBUG] Completed sequential processing for requestId: ${requestId}`);
      return { 
        success: true, 
        results,
        tasks // Explicitly include tasks in the response
      };
    }
  } catch (error) {
    console.error('[HostAgent] Error processing webhook:', error);
    console.log(`[DUPLICATION DEBUG] Error during webhook processing: ${error instanceof Error ? error.message : String(error)}`);
    return { 
      success: false, 
      results: {}, 
      tasks: {},
      error: error instanceof Error ? error.message : String(error) 
    };
  } finally {
    console.log('[DUPLICATION DEBUG] ================ END WEBHOOK PROCESSING ================');
  }
}

/**
 * Process a list of agent tasks in parallel
 */
async function processAgentsInParallel(tasks: Record<string, string>, agents: any[]): Promise<Record<string, any>> {
  console.log('[HostAgent] Running sub-agent calls in parallel');
  console.log(`[DUPLICATION DEBUG] Starting parallel processing of ${Object.keys(tasks).length} tasks`);
  
  const results: Record<string, any> = {};
  const promises: Promise<void>[] = [];
  
  // For each agent with a task
  for (const agentType in tasks) {
    const task = tasks[agentType];
    console.log(`[DUPLICATION DEBUG] Processing task for agent ${agentType}, task length: ${task.length}`);
    
    // Find the agent configuration
    const agent = agents.find(a => (a.type || a.id || '').toLowerCase() === agentType.toLowerCase());
    if (!agent) {
      console.warn(`[HostAgent] No agent configuration found for type: ${agentType}`);
      continue;
    }
    
    // Skip if agent URL is not defined
    if (!agent.url) {
      console.warn(`[HostAgent] No URL defined for agent: ${agentType}. Skipping this agent.`);
      results[agentType] = {
        error: `No URL defined for agent: ${agentType}`,
        status: {
          state: 'failed',
          timestamp: new Date().toISOString(),
          message: {
            role: 'agent',
            parts: [{ type: 'text', text: `Error: No URL defined for agent: ${agentType}` }]
          }
        }
      };
      continue;
    }
    
    // Create a promise for this agent's task
    const promise = (async () => {
      console.log(`[HostAgent] Sending task to ${agentType} agent`);
      console.log(`[HostAgent] Sending task to ${agentType} agent:`, task.substring(0, 100) + (task.length > 100 ? '...' : ''));
      
      try {
        // Get the agent URL
        const agentUrl = agent.url;
        console.log(`[DUPLICATION DEBUG] Sending task to ${agentType} at ${agentUrl}, task hash: ${crypto.createHash('md5').update(task).digest('hex').substring(0, 8)}`);
        
        // Send the task to the agent and get the result
        const result = await sendAgentTask(agentType, agentUrl, task);
        console.log(`[DUPLICATION DEBUG] Received response from ${agentType}`);
        results[agentType] = result;
      } catch (error) {
        console.error(`[HostAgent] Error processing task for agent ${agentType}:`, error);
        results[agentType] = {
          error: error instanceof Error ? error.message : String(error),
          status: {
            state: 'failed',
            timestamp: new Date().toISOString(),
            message: {
              role: 'agent',
              parts: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : String(error)}` }]
            }
          }
        };
      }
    })();
    
    promises.push(promise);
  }
  
  // Wait for all agent tasks to complete
  await Promise.all(promises);
  console.log(`[DUPLICATION DEBUG] Completed all parallel tasks`);
  
  return results;
}

/**
 * Process a list of agent tasks sequentially
 */
async function processAgentsSequentially(tasks: Record<string, string>, agents: any[]): Promise<Record<string, any>> {
  console.log('[HostAgent] Running sub-agent calls sequentially');
  
  const results: Record<string, any> = {};
  
  // For each agent with a task
  for (const agentType in tasks) {
    const task = tasks[agentType];
    
    // Find the agent configuration
    const agent = agents.find(a => (a.type || a.id || '').toLowerCase() === agentType.toLowerCase());
    if (!agent) {
      console.warn(`[HostAgent] No agent configuration found for type: ${agentType}`);
      continue;
    }
    
    // Skip if agent URL is not defined
    if (!agent.url) {
      console.warn(`[HostAgent] No URL defined for agent: ${agentType}. Skipping this agent.`);
      results[agentType] = {
        error: `No URL defined for agent: ${agentType}`,
        status: {
          state: 'failed',
          timestamp: new Date().toISOString(),
          message: {
            role: 'agent',
            parts: [{ type: 'text', text: `Error: No URL defined for agent: ${agentType}` }]
          }
        }
      };
      continue;
    }
    
    console.log(`[HostAgent] Sending task to ${agentType} agent`);
    console.log(`[HostAgent] Sending task to ${agentType} agent:`, task.substring(0, 100) + (task.length > 100 ? '...' : ''));
    
    try {
      // Get the agent URL
      const agentUrl = agent.url;
      
      // Send the task to the agent and get the result
      const result = await sendAgentTask(agentType, agentUrl, task);
      results[agentType] = result;
    } catch (error) {
      console.error(`[HostAgent] Error processing task for agent ${agentType}:`, error);
      results[agentType] = {
        error: error instanceof Error ? error.message : String(error),
        status: {
          state: 'failed',
          timestamp: new Date().toISOString(),
          message: {
            role: 'agent',
            parts: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : String(error)}` }]
          }
        }
      };
    }
  }
  
  return results;
}

/**
 * Send a task to an agent and get the result
 */
async function sendAgentTask(agentType: string, agentUrl: string, task: string): Promise<any> {
  console.log(`[DUPLICATION DEBUG] Preparing to send task to ${agentType}`);
  // Create a unique task ID for this request
  const taskId = uuidv4();
  console.log(`[HostAgent] Calling A2AClient.sendTask for ${agentType} with taskId ${taskId}`);
  
  try {
    // Create the A2A client for the agent
    const client = new A2AClient(agentUrl);
    
    // Send the task to the agent - fixed to use single parameter
    const response = await client.sendTask({
      id: taskId,
      message: {
        role: 'user',
        parts: [{ type: 'text', text: task }]
      }
    });
    
    console.log(`[HostAgent] Got response from ${agentType}:`, JSON.stringify(response, null, 2));
    
    // Include the original task in the response - add to a new augmented response object
    const augmentedResponse = {
      ...response,
      task: {
        message: {
          role: 'user',
          parts: [{ type: 'text', text: task }]
        }
      }
    };
    
    return augmentedResponse;
  } catch (error) {
    console.error(`[HostAgent] Error sending task to ${agentType}:`, error);
    throw error;
  }
}

/**
 * Analyze content with LLM and identify tasks for specific agents
 */
async function analyzeContentWithLLM(content: string, agentList: any[], processorConfig: any): Promise<Record<string, string>> {
  console.log('[HostAgent] Analyzing content with LLM...');
  console.log(`[DUPLICATION DEBUG] Starting LLM analysis for agent content distribution`);
  
  // Create context data for the LLM
  try {
    // Use the provided prompt if available, otherwise use default
    const promptTemplate = processorConfig.promptTemplate || 
      `You are processing content from a webhook. Your task is to analyze this content and identify specific actions to delegate to the available specialized agents.

Here's what each agent can do:
{{agentCapabilities}}

Analyze this content carefully and identify exactly one task for each agent. Do not create multiple tasks for the same agent.

Content:
---
{{content}}
---

For each agent, provide a single, specific instruction based on the content.`;
    
    // Replace placeholders in the prompt
    let prompt = promptTemplate;
    
    // Build capabilities string for the prompt
    let capabilitiesText = "";
    for (const agent of agentList) {
      const agentType = agent.type?.toLowerCase() || agent.id?.toLowerCase();
      if (agentCapabilities[agentType]) {
        capabilitiesText += `- ${agentType}: ${agentCapabilities[agentType]}\n`;
      }
    }
    
    prompt = prompt.replace("{{agentCapabilities}}", capabilitiesText);
    prompt = prompt.replace("{{content}}", content);
    
    console.log(`[HostAgent] Using prompt from configuration:`, prompt);
    
    // Log available agents for debugging
    console.log(`[HostAgent] Listing remote agents`);
    // Build a simple array of available agents from the agentCapabilities map
    const availableAgents = Object.entries(agentCapabilities).map(([name, description]) => ({
      name,
      description,
      examples: agentInfoMap[name]?.examples || []
    }));
    console.log(`[HostAgent] Available agents:`, JSON.stringify(availableAgents, null, 2));
    
    // Set up context data for the LLM
    const agentNames = agentList.map(agent => agent.type?.toLowerCase() || agent.id?.toLowerCase()).filter(Boolean);
    const contextData = {
      agents: agentNames.join(","),
      content
    };
    
    // Get the host tools
    const hostTools = getHostTools();

    // Set the webhook content analysis flag to prevent direct task sending
    console.log(`[DUPLICATION DEBUG] Setting isWebhookContentAnalysis flag to true during LLM analysis`);
    global.isWebhookContentAnalysis = true;
    
    // Call the LLM to analyze content and generate tasks
    const response = await hostAgentPrompt(
      contextData,
      {
        messages: [
          {
            role: "user",
            content: [{ text: prompt }]
          }
        ],
        tools: hostTools
      }
    );

    // Reset the flag after LLM analysis
    console.log(`[DUPLICATION DEBUG] Resetting isWebhookContentAnalysis flag to false after LLM analysis`);
    global.isWebhookContentAnalysis = false;
    
    console.log(`[DUPLICATION DEBUG] LLM response structure:`, JSON.stringify(response, null, 2).substring(0, 1000) + '...');
    
    // Process response and extract tool calls
    const tasks: Record<string, string> = {};
    
    // If the response has tool calls, process them
    if (response.request?.messages) {
      for (const msg of response.request.messages) {
        if (msg.role === 'model') {
          for (const contentItem of msg.content || []) {
            if (contentItem.toolRequest && contentItem.toolRequest.name === 'send_task') {
              // Properly type the input as a record with agent_name and message properties
              const input = contentItem.toolRequest.input as { agent_name: string; message: string };
              if (input && input.agent_name && input.message) {
                // IMPORTANT: Just collect the tasks, don't send them yet - prevents duplication
                tasks[input.agent_name.toLowerCase()] = input.message;
                console.log(`[DUPLICATION DEBUG] LLM generated task for ${input.agent_name.toLowerCase()}: ${input.message.substring(0, 50)}...`);
              }
            }
          }
        }
      }
    }
    
    // ========================================================
    // FIX: Skip the default task generation if the agent already has a task assigned
    // This prevents the duplicate task issue when multiple configs exist
    // ========================================================
    console.log(`[DUPLICATION DEBUG] Tasks before default generation: ${Object.keys(tasks).join(', ')}`);
    
    // Only add default tasks for agents that don't already have a task assigned by the LLM
    for (const agent of agentList) {
      const agentType = (agent.type?.toLowerCase() || agent.id?.toLowerCase());
      
      // IMPORTANT: Skip if this agent already has a task
      if (tasks[agentType]) {
        console.log(`[DUPLICATION DEBUG] Skipping default task generation for ${agentType} - already has a task`);
        continue;
      }
      
      // Only create tasks for agents that have capabilities
      if (agentCapabilities[agentType]) {
        // Generate a default action-oriented task based on agent type
        // Don't ask agents to analyze content - give them specific instructions
        let defaultTask = "";
        
        // Generate actionable tasks based on agent type (extracted from content)
        switch (agentType) {
          case 'slack':
            // Extract meeting info from content
            const meetingInfo = content.includes("Meeting") ? 
              content.substring(content.indexOf("Meeting"), content.indexOf("Meeting") + 50) : 
              "team discussion";
            defaultTask = `Send a message to #general saying: "Important update from ${meetingInfo}. Please check your email for details."`;
            break;
          case 'github':
            // Create a reasonable GitHub task based on extracted keywords
            defaultTask = `Create an issue with title "Follow-up from team meeting" and description "Document action items from recent discussion"`;
            break;
          default:
            // For other agents, create a basic task without asking for analysis
            defaultTask = `Perform standard action based on recent team discussion.`;
        }
        
        tasks[agentType] = defaultTask;
        console.log(`[DUPLICATION DEBUG] Generated default task for ${agentType}: ${defaultTask.substring(0, 50)}...`);
      }
    }
    
    console.log(`[DUPLICATION DEBUG] Final tasks after processing: ${Object.keys(tasks).join(', ')}`);
    
    if (Object.keys(tasks).length === 0) {
      throw new Error('No tasks generated for agents');
    }
    
    return tasks;
  } catch (error) {
    console.error('[HostAgent] Error analyzing content with LLM:', error);
    throw error;
  }
}

/**
 * Start the A2A server for Host agent
 */
async function initServer() {
  try {
    // Create an instance of the A2A server with the host agent handler
    console.log(`[DUPLICATION DEBUG] Initializing A2A server on port ${SERVER_PORT}`);
    
    // Minimal server configuration
    const server = new A2AServer(
      hostAgent,
      {
        card: {
          name: "Host Agent",
          description: "Routes requests to specialized sub-agents",
          url: `http://localhost:${SERVER_PORT}`,
          provider: {
            organization: "A2A Workshop",
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
                "Use an agent to perform a task"
              ]
            }
          ],
        }
      }
    );
    
    console.log('[HostAgent] Starting server...');
    await server.start(SERVER_PORT);
    console.log(`[HostAgent] Host Agent server started on http://localhost:${SERVER_PORT}`);
    console.log(`[HostAgent] Use 'npm run a2a:cli' to interact with this Host Agent`);
    
    // Log connected agents
    console.log('[HostAgent] Connected to sub-agents:');
    for (const [agentType, url] of Object.entries(agentUrls)) {
      console.log(`[HostAgent]   - ${agentType}: ${url}`);
    }
  } catch (err) {
    console.error('[HostAgent] Error initializing server:', err);
    throw err;
  }
}

/**
 * Main function to start the server
 */
async function main() {
  // Load agent configuration before starting the server
  await loadAgentConfig();
  await initServer();
}

// Run the main function
main().catch(console.error); 