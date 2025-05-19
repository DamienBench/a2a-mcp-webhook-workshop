import { TaskYieldUpdate } from "../../a2a/server/handler.js";
import {
  TaskContext,
  A2AServer
} from "../../a2a/server/index.js";
import * as schema from "../../schema.js";
import { ai, getSalesforceTools, salesforceAgentPrompt } from "./genkit.js";
import * as dotenv from "dotenv";

// Load environment variables from .env file
dotenv.config();

// Check if API key is set
if (!process.env.GEMINI_API_KEY) {  
  console.error("GEMINI_API_KEY environment variable not set.")
  process.exit(1);
}

// Check for MCP server URL
if (!process.env.MCP_SERVER_URL) {
  console.error("MCP_SERVER_URL environment variable not set.")
  process.exit(1);
}

/**
 * Salesforce agent that can create, find, and update Salesforce records
 */
async function* salesforceAgent({
  task,
  userMessage,
}: TaskContext): AsyncGenerator<TaskYieldUpdate, schema.Task | void, unknown> {
  // First, send a "working" status update
  yield {
    state: "working",
    message: {
      role: "agent",
      parts: [{ type: "text", text: "Processing your Salesforce request..." }],
    },
  };
  
  // Get the text from the user message parts
  const userText = userMessage.parts
    .filter((p): p is schema.TextPart => !!(p as schema.TextPart).text)
    .map((p) => p.text)
    .join("\n");
  
  try {
    console.log("[SalesforceAgent] Processing request:", userText);
    
    // Get Salesforce tools
    const salesforceTools = getSalesforceTools();
    
    // Use the prompt file to run the Salesforce agent with MCP tools
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
          console.log(`[SalesforceAgent] Retry attempt ${retries}/${maxRetries}`);
        }
        
        response = await salesforceAgentPrompt(
          { now: new Date().toISOString() },
          {
            messages: [
              {
                role: "user",
                content: [{ text: userText }]
              }
            ],
            tools: salesforceTools
          }
        );
        
        // Add debug output to see the response from the LLM
        console.log("[SalesforceAgent] LLM response structure:", JSON.stringify(response, null, 2).substring(0, 500) + '...');
        
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
          console.log(`[SalesforceAgent] Rate limit exceeded. Retrying in ${delay}ms...`);
          
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
    
    // No file output or artifacts
    
    // Get the LLM's response text
    let responseMessage = '';
    if (response.message?.content && Array.isArray(response.message.content)) {
      for (const content of response.message.content) {
        if (content.text) {
          responseMessage = content.text;
          break;
        }
      }
    }
    
    // Send a "completed" status update with the LLM's response
    yield {
      state: "completed",
      message: {
        role: "agent",
        parts: [{ type: "text", text: responseMessage }],
      },
    };
  } catch (error: any) {
    console.error("[SalesforceAgent] Error in Salesforce agent:", error);
    yield {
      state: "failed",
      message: {
        role: "agent",
        parts: [
          { 
            type: "text", 
            text: `I encountered an error while processing your Salesforce request: ${error.message || "Unknown error"}`
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
  console.log("[SalesforceAgent] Running test with message:", testMessage);
  
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
    const agent = salesforceAgent(mockContext);
    
    // Process all yields from the generator
    let result = await agent.next();
    while (!result.done) {
      console.log("[SalesforceAgent Test] Yielded:", JSON.stringify(result.value, null, 2));
      result = await agent.next();
    }
    
    console.log("[SalesforceAgent Test] Final result:", result.value);
  } catch (error) {
    console.error("[SalesforceAgent Test] Error:", error);
  }
}

/**
 * Start the A2A server for Salesforce agent
 */
async function initServer() {
  const port = process.env.SALESFORCE_AGENT_PORT || 41244;
  const server = new A2AServer(
    salesforceAgent,
    {
      card: {
        name: "Salesforce Agent",
        description: "An agent that can create, find, and update Account, Contact, and Opportunity Salesforce records",
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
            id: "salesforce_create",
            name: "Create Salesforce Records",
            description:
              "Creates new contact in Salesforce based on specified fields.",
            tags: ["salesforce", "crm", "create"],
            examples: [
              "Create a contact with name: Jane Smith, phone: 555-123-4567",
            ],
          },
          {
            id: "salesforce_find",
            name: "Find Salesforce Records",
            description:
              "Finds existing contact in Salesforce based on search criteria.",
            tags: ["salesforce", "crm", "find", "search"],
            examples: [
              "Get contact Jane Smith"
            ],
          },
          {
            id: "salesforce_update",
            name: "Update Salesforce Contacts",
            description:
              "Updates existing contact record in Salesforce with new field values.",
            tags: ["salesforce", "crm", "update"],
            examples: [
              "Update contact Jane Smith, set company: New Corp",
            ],
          },
        ],
      }
    }
  );
  
  await server.start(Number(port));
  console.log(`[SalesforceAgent] Server started on http://localhost:${port}`);
  console.log(`[SalesforceAgent] Press Ctrl+C to stop the server`);
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