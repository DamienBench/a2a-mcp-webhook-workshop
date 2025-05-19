import { TaskYieldUpdate } from "../../a2a/server/handler.js";
import {
  TaskContext,
  A2AServer
} from "../../a2a/server/index.js";
import * as schema from "../../schema.js";
import { ai, getSlackTools, slackAgentPrompt } from "./genkit.js";
import * as dotenv from "dotenv";

// Load environment variables from .env file
dotenv.config();

// Check if API key is set
if (!process.env.GEMINI_API_KEY) {  
  console.error("GEMINI_API_KEY environment variable not set.")
  process.exit(1);
}

/**
 * Slack agent that can send messages to Slack channels using MCP
 */
async function* slackAgent({
  task,
  userMessage,
}: TaskContext): AsyncGenerator<TaskYieldUpdate, schema.Task | void, unknown> {
  // First, send a "working" status update
  yield {
    state: "working",
    message: {
      role: "agent",
      parts: [{ type: "text", text: "Processing your Slack request..." }],
    },
  };
  
  // Get the text from the user message parts
  const userText = userMessage.parts
    .filter((p): p is schema.TextPart => !!(p as schema.TextPart).text)
    .map((p) => p.text)
    .join("\n");
  
  try {
    console.log("[SlackAgent] Processing request:", userText);
    
    // Get Slack tools
    const slackTools = getSlackTools();
    
    // Use the prompt file to run the Slack agent with Genkit tools
    // Add retry logic with exponential backoff for rate limit errors
    let response;
    let retries = 0;
    const maxRetries = 5;
    const baseDelay = 1000; // 1 second initial delay
    
    while (retries <= maxRetries) {
      try {
        // If we're retrying, notify the user
        if (retries > 0) {
          yield {
            state: "working",
            message: {
              role: "agent",
              parts: [{ type: "text", text: `Retrying due to API rate limit (attempt ${retries}/${maxRetries})...` }],
            },
          };
          console.log(`[SlackAgent] Retry attempt ${retries}/${maxRetries}`);
        }
        
        response = await slackAgentPrompt(
          { now: new Date().toISOString() },
          {
            messages: [
              {
                role: "user",
                content: [{ text: userText }]
              }
            ],
            tools: slackTools
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
          console.log(`[SlackAgent] Rate limit exceeded. Retrying in ${delay}ms...`);
          
          // Notify user about the delay
          yield {
            state: "working",
            message: {
              role: "agent",
              parts: [{ type: "text", text: `Google API rate limit reached. Waiting ${Math.round(delay/1000)} seconds before retrying...` }],
            },
          };
          
          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, delay));
          retries++;
        } else {
          // Either not a rate limit error or we've exceeded max retries
          throw error;
        }
      }
    }
    
    // Initialize tool usage variables
    let success = false;
    let channel = "#test-slack-damien"; // Default channel
    let message = "";
    let permalink = null;
    
    // Parse response to extract tool usage and results
    if (response.request?.messages) {
      for (const msg of response.request.messages) {
        // Extract tool request details (channel & message)
        if (msg.role === 'model' && msg.content && Array.isArray(msg.content)) {
          for (const item of msg.content) {
            if (item.toolRequest && item.toolRequest.input) {
              const input = item.toolRequest.input as { channel: string; message: string };
              channel = input.channel || channel;
              message = input.message || "No message provided";
              console.log("[SlackAgent] Extracted channel:", channel, "message:", message);
            }
          }
        }
        
        // Extract tool response details (success & permalink)
        if (msg.role === 'tool' && msg.content && Array.isArray(msg.content)) {
          for (const item of msg.content) {
            if (item.toolResponse && item.toolResponse.output) {
              const output = item.toolResponse.output as { 
                success: boolean; 
                permalink?: string | null;
              };
              success = output.success === true;
              permalink = output.permalink || null;
              console.log("[SlackAgent] Message success:", success, "permalink:", permalink);
            }
          }
        }
      }
    }
    
    // Build the response text based on the success state
    let responseText = "";
    if (success) {
      responseText = `I've sent your message to ${channel}: "${message}"`;
      if (permalink) {
        responseText += `\n\nView it here: ${permalink}`;
      }
    } else {
      responseText = "I couldn't send your message to Slack. Please try again.";
    }
    
    // Yield the completed status with the agent's response
    yield {
      state: success ? "completed" : "failed",
      message: {
        role: "agent",
        parts: [{ type: "text", text: responseText }],
      },
    };
  } catch (error: any) {
    console.error("[SlackAgent] Error in Slack agent:", error);
    yield {
      state: "failed",
      message: {
        role: "agent",
        parts: [
          { 
            type: "text", 
            text: `I encountered an error while processing your Slack request: ${error.message || "Unknown error"}`
          },
        ],
      },
    };
  }
}

/**
 * Run a test with direct text input (for command line testing)
 * @param testMessage Message to process
 */
async function runTest(testMessage: string) {
  console.log("[SlackAgent] Running test with message:", testMessage);
  
  try {
    // Create mock task context
    const mockContext: TaskContext = {
      task: {} as schema.Task, // Mock task object
      userMessage: {
        role: "user",
        parts: [{ type: "text", text: testMessage }]
      },
      isCancelled: () => false 
    };
    
    // Create and run the agent generator
    const agent = slackAgent(mockContext);
    
    // Process all yields from the generator
    let result = await agent.next();
    while (!result.done) {
      console.log("[SlackAgent Test] Yielded:", JSON.stringify(result.value, null, 2));
      result = await agent.next();
    }
    
    console.log("[SlackAgent Test] Final result:", result.value);
  } catch (error) {
    console.error("[SlackAgent Test] Error:", error);
  }
}

/**
 * Start the A2A server for Slack agent
 */
async function initServer() {
  const port = process.env.SLACK_AGENT_PORT || 41243;
  const server = new A2AServer(
    slackAgent,
    {
      card: {
        name: "SlackAgent",
        description: "A Slack messaging agent using MCP that sends messages to only the #test-slack-damien Slack channel.",
        url: `http://localhost:${port}`,
        provider: {
          organization: "A2A Samples",
        },
        version: "0.0.1",
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
            id: "slack_messaging",
            name: "Slack Messaging",
            description: "Sends messages to only the #test-slack-damien Slack channel.",
            tags: ["slack", "messaging", "communication"],
            examples: [
              "Send a message to #test-slack-damien saying Hello, team!",
              "Post in #test-slack-damien: Don't forget the team meeting at 2pm",
            ],
          },
        ],
      }
    }
  );
  
  await server.start(Number(port));
  console.log(`[SlackAgent MCP] Server started on http://localhost:${port}`);
  console.log(`[SlackAgent MCP] Press Ctrl+C to stop the server`);
}

/**
 * Main function to either run a test or start the server
 */
async function main() {
  if (process.argv.length > 2) {
    // Run test mode with command line arguments
    const testMessage = process.argv[2];
    await runTest(testMessage);
  } else {
    // Run in server mode
    await initServer();
  }
}

// Run the main function
main().catch(console.error); 