/**
 * Host Agent - The main server that routes requests to sub-agents
 */

import dotenv from 'dotenv';
import crypto from 'crypto';
import { hostAgentPrompt, getHostTools, registerAgent, agentCache } from './genkit.js';
import { TaskContext, A2AServer, TaskYieldUpdate } from "../../a2a/server/index.js";
import * as schema from "../../schema.js";
import { A2AClient } from '../../a2a/client/client.js';
import { TaskSendParams } from "../../schema.js";
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { v4 as uuidv4 } from 'uuid';
import { existsSync, mkdirSync } from 'node:fs';
import express, { Request, Response } from 'express';

// Load environment variables
dotenv.config();

// Enable verbose debugging
const DEBUG = true;

// Define the server port and path (once, removed duplicate declarations)
const SERVER_PORT = parseInt(process.env.HOST_AGENT_PORT || '41240', 10);
const API_PORT = SERVER_PORT + 1; // Use port 41241 for the API server
const SERVER_PATH = process.env.HOST_AGENT_PATH || "/";

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

// Debug function
function debug(...args: any[]) {
  if (DEBUG) {
    console.log('[HostAgent DEBUG]', ...args);
  }
}

/**
 * Session tracking and management
 */

// Session tracking
const SESSION_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Fetch agent capabilities from its agent card
 */
async function fetchAgentCapabilities(agentUrl: string): Promise<string> {
  try {
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
    
    return capabilities;
  } catch (error) {
    console.error(`[HostAgent] Error fetching agent capabilities from ${agentUrl}:`, error);
    throw error;
  }
}

/**
 * Update agent cache if needed
 */
async function updateAgentCacheIfNeeded(agentType: string, agentUrl: string): Promise<void> {
  try {
    if (!agentCache.has(agentType)) {
      await registerAgent(agentType, agentUrl);
    }
  } catch (error) {
    console.error(`[HostAgent] Error updating agent cache for ${agentType}:`, error);
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
    
    // Fetch agent capabilities quietly
    await refreshAgentCapabilities();
    
    // Log a summary of registered agents with each on a new line
    console.log('[HostAgent] Registered agents:');
    Object.entries(agentCapabilities).forEach(([agent, desc]) => {
      console.log(`[HostAgent]   - ${agent}: ${desc.substring(0, 80)}...`);
    });
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
              const output = item.toolResponse.output as any;
              console.log(`[HostAgent] Tool response output:`, output);
              
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
    
    // Extract the final LLM response (after all tool calls)
    const llmResponse = response.message?.content ? response.message : null;
    
    if (sendTaskResult) {
      debug("Found successful send_task result:", sendTaskResult);
      return {
        success: true,
        toolResults,
        agentResponse: sendTaskResult.output.response,
        llmResponse, // Include the LLM's final response
        response     // Include the entire response object
      };
    }
    
    // If no successful send_task, return the general response
    return {
      success: false,
      toolResults,
      llmResponse,  // Include the LLM's final response
      response,     // Include the entire response object
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
  console.log(`[HostAgent] Received task with ID: ${task.id}`);
  
  // First, send a "working" status update
  yield {
    state: "working",
    message: {
      role: "agent",
      parts: [{ type: "text", text: JSON.stringify({
        response: "Routing your request to the appropriate agent...",
        agentResults: []
      }) }],
    },
  };
  
  // Get the text from the user message parts
  const userText = userMessage.parts
    .filter((p): p is schema.TextPart => !!(p as schema.TextPart).text)
    .map<string>((p) => (p as schema.TextPart).text)
    .join("\n");
  
  try {
    console.log("[HostAgent] Processing request:", userText);
    
    // Check if this is a webhook request (JSON with type: 'webhook')
    let isWebhook = false;
    try {
      const parsedData = JSON.parse(userText);
      if (parsedData.type === 'webhook') {
        isWebhook = true;
        console.log('[HostAgent] Detected webhook request');
        
        // Process the webhook directly
        const webhookResult = await processWebhookDirectly(parsedData);
        
        // Create a response with the webhook results
        let responseObj;
        if (webhookResult.success) {
          responseObj = {
            response: "Successfully processed webhook and routed to appropriate agents",
            agentResults: [],
            agentTasks: webhookResult.tasks || {} // Include the task messages sent to each agent
          };
          
          // Convert results to agentResults format if possible
          if (webhookResult.results) {
            // Try to extract agent responses from results
            const agentEntries = Object.entries(webhookResult.results);
            for (const [agentType, result] of agentEntries) {
              if (result && typeof result === 'object') {
                // Extract the actual response text from the agent response structure
                let responseText = '';
                let state = 'completed';
                
                if ('status' in result) {
                  // Get state from the status
                  state = result.status?.state || 'completed';
                  
                  // Extract response text from status.message.parts[0].text
                  if (result.status?.message?.parts?.[0]?.text) {
                    responseText = result.status.message.parts[0].text;
                  }
                } else if ('response' in result) {
                  // Direct response field (fallback)
                  responseText = result.response;
                  state = result.state || 'completed';
                }
                
                // Only add if we have actual response text
                if (responseText) {
                  responseObj.agentResults.push({
                    agent: agentType,
                    response: responseText,
                    state: state,
                    task: webhookResult.tasks?.[agentType] || null // Include the task that was sent to this agent
                  });
                }
              }
            }
          }
        } else {
          responseObj = {
            response: `Error processing webhook: ${webhookResult.error || 'Unknown error'}`,
            agentResults: [],
            agentTasks: {}
          };
        }
        
        // Return the final result
        yield {
          state: "completed",
          message: {
            role: "agent",
            parts: [
              { type: "text", text: JSON.stringify(responseObj, null, 2) }
            ],
          },
        };
        return;
      }
    } catch (e) {
      // Not JSON or not a webhook request, continue with normal processing
    }
    
    // For non-webhook requests, ensure agent cache is populated
    // This helps address potential race conditions where the cache isn't ready
    console.log('[HostAgent] Ensuring agent cache is populated for direct API request');
    for (const [agentType, url] of Object.entries(agentUrls)) {
      if (!agentCache.has(agentType)) {
        console.log(`[HostAgent] Agent ${agentType} not in cache, fetching info for direct API request...`);
        await registerAgent(agentType, url);
      }
    }
    
    // Generate a session ID
    const sessionId = task.id || crypto.randomUUID();
    
    // Process the request using the LLM
    yield {
      state: "working",
      message: {
        role: "agent",
        parts: [{ type: "text", text: JSON.stringify({
          response: "Analyzing your request...",
          agentResults: []
        }) }],
      },
    };
    
    const result = await processRequest(sessionId, userText);
    
    if (!result.success) {
      // If we couldn't route to a specific agent
      // Create a list of available agents from the configuration
      const availableAgents = Object.keys(agentUrls).map(agentType => {
        return `${agentType}`;
      }).join(', ');
      
      yield {
        state: "completed",
        message: {
          role: "agent",
          parts: [{ 
            type: "text", 
            text: JSON.stringify({
              response: result.message || `Could not route to a specific agent. Available agents: ${availableAgents}`,
              agentResults: []
            })
          }],
        },
      };
      return;
    }
    
    // Process each tool result - show work in progress
    const toolResults = result.toolResults || [];
    
    // Extract send_task results
    const sendTaskResults = toolResults
      .filter(r => r.toolName === 'send_task' && r.output && r.output.success)
      .map(r => {
        const agent = r.output.agent;
        const response = r.output.formattedResponse;
        const state = r.output.state || 'completed';
        
        return {
          agent,
          response,
          state
        };
      });
    
    // If no send_task results, create an empty response
    if (sendTaskResults.length === 0) {
      yield {
        state: "completed",
        message: {
          role: "agent",
          parts: [
            { 
              type: "text", 
              text: JSON.stringify({
                response: "Could not route to a specific agent. Please try again with a clearer request.",
                agentResults: []
              })
            }
          ],
        },
      };
      return;
    }
    
    // Check if we have LLM response with content
    const hasLlmResponse = result.llmResponse && 
                          result.llmResponse.content && 
                          result.llmResponse.content.some(item => item.text && item.text.trim().length > 0);
    
    if (hasLlmResponse) {
      // Use the LLM's formatted response as it already includes agent results
      const textContent = result.llmResponse.content
        .filter(item => item.text)
        .map(item => item.text)
        .join('\n');
      
      if (textContent.trim()) {
        // Extract JSON if present in LLM response or create a new JSON response
        try {
          // Check if textContent is already valid JSON
          const jsonMatch = textContent.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const jsonStr = jsonMatch[0];
            const jsonObj = JSON.parse(jsonStr);
            
            // Only if it has the expected structure
            if (jsonObj.response && jsonObj.agentResults) {
              yield {
                state: "completed",
                message: {
                  role: "agent",
                  parts: [
                    { type: "text", text: jsonStr }
                  ],
                },
              };
              return;
            }
          }
        } catch (e) {
          // Not valid JSON, continue to create a new response
          console.log("[HostAgent] Couldn't parse JSON from LLM response, creating new response");
        }
        
        // Create a new JSON response
        const responseJson = {
          response: "Processed your request and routed to appropriate agents",
          agentResults: sendTaskResults
        };
        
        yield {
          state: "completed",
          message: {
            role: "agent",
            parts: [
              { type: "text", text: JSON.stringify(responseJson, null, 2) }
            ],
          },
        };
        return;
      }
    }
    
    // Default response with send task results
    const responseJson = {
      response: "Processed your request and routed to appropriate agents",
      agentResults: sendTaskResults
    };
    
    yield {
      state: "completed",
      message: {
        role: "agent",
        parts: [
          { type: "text", text: JSON.stringify(responseJson, null, 2) }
        ],
      },
    };
  } catch (error) {
    console.error("[HostAgent] Error processing request:", error);
    yield {
      state: "completed",
      message: {
        role: "agent",
        parts: [
          { 
            type: "text", 
            text: JSON.stringify({
              response: `Error processing request: ${error.message}`,
              agentResults: []
            })
          }
        ],
      },
    };
  }
}

/**
 * Process a webhook directly in the host agent using the configuration
 */
async function processWebhookDirectly(webhookData: any): Promise<{success: boolean, results: Record<string, any>, tasks: Record<string, string>, error?: string}> {
  console.log('[HostAgent] Processing webhook directly:', JSON.stringify(webhookData));
  console.log('[HostAgent] ================ START WEBHOOK PROCESSING ================');
  console.log(`[HostAgent] Processing webhook with requestId: ${webhookData.requestId || 'undefined'}`);
  
  try {
    // Extract webhook ID and configuration
    const webhookId = webhookData.webhookId || 'unknown';
    const webhookName = webhookData.webhookName || webhookId;
    
    // Require processorConfig
    if (!webhookData.processorConfig) {
      throw new Error('Missing processorConfig in webhook data');
    }
    const processorConfig = webhookData.processorConfig;
    
    // Extract the custom promptTemplate if provided
    const customPromptTemplate = webhookData.promptTemplate;
    console.log(`[HostAgent] Custom prompt template provided: ${!!customPromptTemplate}`);
    if (customPromptTemplate) {
      console.log(`[HostAgent] Using custom prompt template from webhook configuration`);
    }
    
    console.log(`[HostAgent] Processing ${webhookName} (${webhookId})`);
    console.log(`[HostAgent] Processing webhook ${webhookId} at ${new Date().toISOString()}`);
    console.log(`[HostAgent] Processor config:`, JSON.stringify(processorConfig));
    
    // Use a request ID to prevent duplicate processing
    const requestId = webhookData.requestId || `${webhookId}-${Date.now()}`;
    console.log(`[HostAgent] Using requestId: ${requestId}`);
    
    // Basic duplicate detection
    if (webhookData.timestamp) {
      const requestTime = new Date(webhookData.timestamp).getTime();
      const now = Date.now();
      const timeDiff = now - requestTime;
      
      if (timeDiff < 5000) {
        console.log(`[HostAgent] Potential duplicate request detected within 5 seconds (ID: ${requestId})`);
      }
    }
    
    // Extract content from webhook data
    let content = '';
    
    // Look for content in various possible keys
    const contentKeys = ['transcript', 'content', 'message', 'text', 'data'];
    for (const key of contentKeys) {
      if (webhookData.data && webhookData.data[key]) {
        content = String(webhookData.data[key]);
        console.log(`[HostAgent] Found content in key: ${key}, length: ${content.length}`);
        break;
      }
    }
    
    // If no content found in specific keys, use the raw data
    if (!content && webhookData.data) {
      content = JSON.stringify(webhookData.data);
      console.log(`[HostAgent] No content field found, using raw data, length: ${content.length}`);
    }
    
    if (!content) {
      throw new Error('No content found in webhook data');
    }
    
    // Get the list of available agents
    const agentList = processorConfig.agents || [];
    console.log(`[HostAgent] Agent list: ${agentList.map((a: any) => a.type || a.id).join(', ')}`);
    
    // Ensure agent cache is populated before webhook processing
    console.log('[HostAgent] Ensuring agent cache is populated before webhook processing');
    for (const agent of agentList) {
      const agentType = (agent.type || agent.id || '').toLowerCase();
      if (!agentCache.has(agentType)) {
        console.log(`[HostAgent] Agent ${agentType} not in cache, fetching info...`);
        await updateAgentCacheIfNeeded(agentType, agent.url);
      }
    }
    
    // Determine processing mode (parallel vs sequential)
    const isParallel = processorConfig.parallel !== false; // Default to parallel
    console.log(`[HostAgent] Processing mode: ${isParallel ? 'parallel' : 'sequential'}`);
    
    // If we have a custom prompt template, use it; otherwise use default webhook analyzer prompt
    if (customPromptTemplate) {
      // Update the processor config with the custom prompt template
      processorConfig.promptTemplate = customPromptTemplate;
      console.log('[HostAgent] Updated processor prompt template to require list_remote_agents call');
    }
    
    // Use LLM to analyze content and generate tasks for each agent
    console.log(`[HostAgent] Calling analyzeContentWithLLM...`);
    const tasks = await analyzeContentWithLLM(content, agentList, processorConfig);
    console.log(`[HostAgent] Generated tasks for agents: ${Object.keys(tasks).join(', ')}`);
    
    // Process each agent task in parallel or sequentially
    if (isParallel) {
      // Parallel execution
      console.log(`[HostAgent] Starting parallel processing for requestId: ${requestId}`);
      const results = await processAgentsInParallel(tasks, processorConfig.agents);
      console.log(`[HostAgent] Completed parallel processing for requestId: ${requestId}`);
      return { 
        success: true, 
        results,
        tasks // Explicitly include tasks in the response
      };
    } else {
      // Sequential execution
      console.log(`[HostAgent] Starting sequential processing for requestId: ${requestId}`);
      const results = await processAgentsSequentially(tasks, processorConfig.agents);
      console.log(`[HostAgent] Completed sequential processing for requestId: ${requestId}`);
      return { 
        success: true, 
        results,
        tasks // Explicitly include tasks in the response
      };
    }
  } catch (error) {
    console.error('[HostAgent] Error processing webhook:', error);
    console.log(`[HostAgent] Error during webhook processing: ${error instanceof Error ? error.message : String(error)}`);
    return { 
      success: false, 
      results: {}, 
      tasks: {},
      error: error instanceof Error ? error.message : String(error) 
    };
  } finally {
    console.log('[HostAgent] ================ END WEBHOOK PROCESSING ================');
  }
}

/**
 * Process a list of agent tasks in parallel
 */
async function processAgentsInParallel(tasks: Record<string, string>, agents: any[]): Promise<Record<string, any>> {
  console.log('[HostAgent] Running sub-agent calls in parallel');
  console.log(`[HostAgent] Starting parallel processing of ${Object.keys(tasks).length} tasks`);
  
  const results: Record<string, any> = {};
  const promises: Promise<void>[] = [];
  
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
    
    console.log(`[HostAgent] Processing task for agent ${agentType}, task length: ${task.length}`);
    
    // Create a promise for this agent's task
    const promise = (async () => {
      console.log(`[HostAgent] Sending task to ${agentType} agent`);
      console.log(`[HostAgent] Sending task to ${agentType} agent:`, task.substring(0, 100) + (task.length > 100 ? '...' : ''));
      
      try {
        // Get the agent URL
        const agentUrl = agent.url;
        console.log(`[HostAgent] Sending task to ${agentType} at ${agentUrl}`);
        
        // Send the task to the agent and get the result
        const result = await sendAgentTask(agentType, agentUrl, task);
        console.log(`[HostAgent] Received response from ${agentType}`);
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
  console.log(`[HostAgent] Completed all parallel tasks`);
  
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
  console.log(`[HostAgent] Preparing to send task to ${agentType}`);
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
    
    console.log(`[HostAgent] Got response from ${agentType}:`, JSON.stringify(response));
    
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
  console.log(`[HostAgent] Starting LLM analysis for agent content distribution`);
  
  // Prepare agent information for the LLM
  const agentInfoMap: Record<string, any> = {};
  
  // Convert agent list to a map with agent types as keys
  for (const agent of agentList) {
    const agentType = (agent.type || agent.id || '').toLowerCase();
    if (agentType) {
      agentInfoMap[agentType] = {
        name: agent.name || agentType,
        description: agent.description || 'No description provided',
        url: agent.url,
        capabilities: agent.capabilities || []
      };
      
      // Add examples from agent cache if available
      const cachedAgentInfo = agentCache.get(agentType);
      if (cachedAgentInfo && cachedAgentInfo.examples) {
        agentInfoMap[agentType].examples = cachedAgentInfo.examples;
        console.log(`[HostAgent] Added agent examples from cache to agentInfoMap for ${agentType}`);
      }
    }
  }
  
  // Build the prompt template
  let promptTemplate = processorConfig.promptTemplate;
  if (!promptTemplate) {
    // Default webhook analyzer prompt
    promptTemplate = `You are analyzing content to determine what tasks should be sent to different specialized agents.

Available agents and their capabilities:
{{#each agents}}
- {{this.name}}: {{this.description}}
  {{#if this.examples}}Examples: {{this.examples}}{{/if}}
{{/each}}

Content to analyze:
{{{content}}}

IMPORTANT: ALWAYS first call list_remote_agents to see available agents and their formats before sending any tasks.
For each agent, provide a single, specific instruction based on the content.
Use send_task for each agent with appropriate messages.`;
  }
  
  // Set a flag to prevent task sending during content analysis
  isWebhookContentAnalysis = true;
  console.log(`[HostAgent] Setting isWebhookContentAnalysis flag to true during LLM analysis`);
  
  try {
    // Build the agent capabilities text for the prompt template
    let agentCapabilitiesText = '';
    for (const agent of agentList) {
      const agentType = (agent.type || agent.id || '').toLowerCase();
      const cachedInfo = agentCache.get(agentType);
      const description = cachedInfo?.description || agent.description || `Agent at ${agent.url}`;
      const examples = cachedInfo?.examples || [];
      
      agentCapabilitiesText += `- ${agentType}: ${description}`;
      if (examples.length > 0) {
        agentCapabilitiesText += ` (Examples: ${examples.slice(0, 3).join(', ')})`;
      }
      agentCapabilitiesText += '\n';
    }
    
    // Replace template variables in the prompt
    let finalPrompt = promptTemplate
      .replace('{{agentCapabilities}}', agentCapabilitiesText)
      .replace('{{{content}}}', content)
      .replace('{{content}}', content);
    
    console.log(`[HostAgent] Using prompt template with ${agentList.length} agents`);
    console.log(`[HostAgent] Final prompt: "${finalPrompt.substring(0, 500)}..."`);
    
    // Use the prompt file to run the host agent with Genkit tools
    const response = await hostAgentPrompt(
      { 
        now: new Date().toISOString(),
        availableAgents: agentInfoMap,
        content: content,
        agentCapabilities: agentCapabilitiesText
      },
      {
        messages: [
          {
            role: "user",
            content: [{ text: finalPrompt }]
          }
        ],
        tools: getHostTools()
      }
    );
    
    // Reset the flag after analysis
    isWebhookContentAnalysis = false;
    console.log(`[HostAgent] Resetting isWebhookContentAnalysis flag to false after LLM analysis`);
    
    // Debug: Log the actual response text
    if (response.text) {
      console.log(`[HostAgent] LLM Response text: "${response.text}"`);
    }
    
    // Initialize task collection
    const tasks: Record<string, string> = {};
    let listAgentsCalled = false;
    
    // Process response and extract tool calls
    console.log(`[HostAgent] ========== STEP 6: EXTRACTING TOOL CALLS ==========`);
    
    // If the response has tool calls, process them
    if (response.request?.messages) {
      console.log(`[HostAgent] Found ${response.request.messages.length} messages in response`);
      for (let i = 0; i < response.request.messages.length; i++) {
        const msg = response.request.messages[i];
        console.log(`[HostAgent] Message ${i}: role=${msg.role}, content length=${(msg.content || []).length}`);
        
        // Check if list_remote_agents was called
        if (msg.role === 'model') {
          for (let j = 0; j < (msg.content || []).length; j++) {
            const contentItem = msg.content[j];
            console.log(`[HostAgent] Content item ${j}:`, Object.keys(contentItem));
            
            if (contentItem.toolRequest && contentItem.toolRequest.name === 'list_remote_agents') {
              listAgentsCalled = true;
              console.log(`[HostAgent] LLM called list_remote_agents`);
            }
            
            if (contentItem.toolRequest && contentItem.toolRequest.name === 'send_task') {
              const input = contentItem.toolRequest.input as { agent_name: string; message: string };
              if (input && input.agent_name && input.message) {
                tasks[input.agent_name.toLowerCase()] = input.message;
                console.log(`[HostAgent] Generated task for ${input.agent_name}: "${input.message}"`);
              }
            }
          }
        }
        
        // Also check tool responses that might contain the skipped tasks
        if (msg.role === 'tool') {
          for (let j = 0; j < (msg.content || []).length; j++) {
            const contentItem = msg.content[j];
            console.log(`[HostAgent] Tool response ${j}:`, Object.keys(contentItem));
            
            if (contentItem.toolResponse && contentItem.toolResponse.output) {
              const output = contentItem.toolResponse.output as any;
              console.log(`[HostAgent] Tool response output:`, output);
              
              // Check if this is a skipped send_task with the task info
              if (output && typeof output === 'object' && output.skippedDuringAnalysis && output.agent && output.message) {
                tasks[output.agent.toLowerCase()] = output.message;
                console.log(`[HostAgent] Extracted skipped task for ${output.agent}: "${output.message}"`);
              }
            }
          }
        }
      }
    }
    
    // If list_remote_agents wasn't called, log a warning
    if (!listAgentsCalled) {
      console.warn(`[HostAgent] WARNING: LLM did not call list_remote_agents during webhook analysis`);
    }
    
    console.log(`[HostAgent] Tasks generated via tools: ${Object.keys(tasks).join(', ') || 'none'}`);
    
    // Check for JSON content in the response and try to extract tasks from it
    if (response.text && typeof response.text === 'string') {
      const text = response.text;
      console.log(`[HostAgent] Checking response text for JSON content`);
      
      // Try to extract JSON from the text
      try {
        // Look for JSON patterns in the text
        const jsonMatches = text.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g) || [];
        
        for (const jsonMatch of jsonMatches) {
          try {
            const jsonData = JSON.parse(jsonMatch);
            console.log(`[HostAgent] Parsed JSON data:`, JSON.stringify(jsonData));
            
            // Check if this JSON contains task assignments
            if (jsonData && typeof jsonData === 'object') {
              for (const [key, value] of Object.entries(jsonData)) {
                if (typeof value === 'string' && value.length > 10) {
                  // This might be a task assignment
                  const agentName = key.toLowerCase();
                  if (['slack', 'github', 'bench'].includes(agentName)) {
                    tasks[agentName] = value;
                    console.log(`[HostAgent] Extracted task from JSON for ${agentName}: "${value}"`);
                  }
                }
              }
            }
          } catch (parseErr) {
            // Not valid JSON, continue
          }
        }
      } catch (err) {
        console.error('[HostAgent] Error parsing JSON from response text:', err);
      }
    }
    
    console.log(`[HostAgent] ========== STEP 8: FINAL RESULTS ==========`);
    console.log(`[HostAgent] Final tasks extracted: ${Object.keys(tasks).join(', ') || 'none'}`);
    for (const [agent, task] of Object.entries(tasks)) {
      console.log(`[HostAgent] ${agent}: "${task}"`);
    }
    
    if (Object.keys(tasks).length === 0) {
      console.warn('[HostAgent] Warning: No tasks generated for agents. Continuing but some functionality may be limited.');
    }
    
    return tasks;
  } catch (error) {
    console.error(`[HostAgent] Error in LLM analysis:`, error);
    // Reset the flag on error
    isWebhookContentAnalysis = false;
    return {};
  }
}

/**
 * Start the A2A server for Host agent
 */
async function initServer() {
  try {
    // Create an instance of the A2A server with the host agent handler
    console.log(`[HostAgent] Starting A2A server on port ${SERVER_PORT}...`);
    
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
    
    // Since we can't add the API endpoint to the A2A server directly, 
    // we'll set up a separate Express server for the API
    const app = express();
    app.use(express.json());
    
    // Add API endpoint to reload agent configuration
    app.get('/api/reload-config', async (req: Request, res: Response) => {
      try {
        console.log('[HostAgent] Reloading agent configuration...');
        await loadAgentConfig();
        res.status(200).json({ 
          success: true, 
          message: 'Agent configuration reloaded successfully',
          agents: Object.keys(agentUrls)
        });
      } catch (error) {
        console.error('[HostAgent] Error reloading agent configuration:', error);
        res.status(500).json({ 
          success: false, 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
      }
    });
    
    // Start the API server on a different port
    const API_PORT = SERVER_PORT + 1;
    app.listen(API_PORT, () => {
      console.log(`[HostAgent] API server running on http://localhost:${API_PORT}/api/reload-config`);
    });
    
    await server.start(SERVER_PORT);
    console.log(`[HostAgent] Host Agent server started on http://localhost:${SERVER_PORT}`);
    console.log(`[HostAgent] Use 'npm run a2a:cli' to interact with this Host Agent`);
    
    // Log connected agents in a single line
    const connectedAgents = Object.entries(agentUrls).map(([type, url]) => `${type}:${url.split('://')[1]}`);
    console.log(`[HostAgent] Connected to sub-agents: ${connectedAgents.join(', ')}`);
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