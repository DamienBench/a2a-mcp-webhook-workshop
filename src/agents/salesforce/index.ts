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
    const response = await salesforceAgentPrompt(
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
    
    // Initialize tool usage variables
    let operation = 'unknown';
    let objectType = 'Lead'; // Default object type
    let recordId = `SF-${Date.now()}`; // Default ID
    let success = false;
    let fields: Record<string, any> = {};
    
    // Parse response to extract tool usage and results
    if (response.request?.messages) {
      for (const msg of response.request.messages) {
        // Extract tool request details (object, fields)
        if (msg.role === 'model' && msg.content && Array.isArray(msg.content)) {
          for (const item of msg.content) {
            if (item.toolRequest) {
              // Determine operation based on the tool name
              if (item.toolRequest.name === 'salesforce_create_record') {
                operation = 'create';
              } else if (item.toolRequest.name === 'salesforce_find_record') {
                operation = 'find';
              } else if (item.toolRequest.name === 'salesforce_update_record') {
                operation = 'update';
              }
              
              if (item.toolRequest.input) {
                const input = item.toolRequest.input as Record<string, any>;
                objectType = input.object || 'Lead';
                
                // Save input fields for later use
                if (input.id) recordId = input.id;
                
                // Extract all other fields
                fields = {...input};
                delete fields.object; // Remove object from fields
                
                console.log(`[SalesforceAgent] ${operation} operation on ${objectType}:`, fields);
              }
            }
          }
        }
        
        // Extract tool response details (success, ID, fields)
        if (msg.role === 'tool' && msg.content && Array.isArray(msg.content)) {
          for (const item of msg.content) {
            if (item.toolResponse && item.toolResponse.output) {
              const output = item.toolResponse.output as { 
                success: boolean; 
                object: string;
                id?: string;
                fields?: Record<string, any>;
                updatedFields?: Record<string, any>;
              };
              
              success = output.success === true;
              objectType = output.object || objectType;
              
              if (output.id) {
                recordId = output.id;
              }
              
              // Update fields based on the operation
              if (operation === 'create' || operation === 'find') {
                if (output.fields) {
                  fields = output.fields;
                }
              } else if (operation === 'update') {
                if (output.updatedFields) {
                  fields = output.updatedFields;
                }
              }
              
              console.log(`[SalesforceAgent] ${operation} success:`, success, "ID:", recordId);
            }
          }
        }
      }
    }
    
    // Create a JSON file with the Salesforce record details
    const filename = `salesforce_${operation}_${objectType.toLowerCase()}.json`;
    const salesforceResponse = {
      operation,
      objectType,
      fields,
      id: recordId,
      timestamp: new Date().toISOString(),
      success
    };
    const fileContent = JSON.stringify(salesforceResponse, null, 2);
    
    console.log("[SalesforceAgent] Creating artifact file:", filename);
    
    // Yield the JSON file as an artifact
    yield {
      index: 0,
      name: filename,
      parts: [{ type: "text", text: fileContent }],
      lastChunk: true,
    };
    
    // Prepare response message based on operation
    let responseMessage = '';
    
    switch (operation) {
      case 'create':
        responseMessage = `I've created a new ${objectType} record with ID ${recordId}.`;
        break;
      case 'find':
        responseMessage = `I've found the ${objectType} record with ID ${recordId}.`;
        break;
      case 'update':
        responseMessage = `I've updated the ${objectType} record with ID ${recordId}.`;
        break;
      default:
        responseMessage = `I've processed your Salesforce request for a ${objectType} record.`;
    }
    
    // If operation failed, update the message
    if (!success) {
      responseMessage = `I was unable to ${operation} the ${objectType} record. Please check the logs for more details.`;
    }
    
    // Finally, send a "completed" status update
    yield {
      state: success ? "completed" : "failed",
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
        description: "An agent that can create, find, and update Salesforce records",
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
        defaultOutputModes: ["text", "file"],
        skills: [
          {
            id: "salesforce_create",
            name: "Create Salesforce Records",
            description:
              "Creates new records in Salesforce based on specified fields.",
            tags: ["salesforce", "crm", "create"],
            examples: [
              "Create a new lead with name: John Doe, company: Acme Corp, email: john@example.com",
              "Create a contact with name: Jane Smith, phone: 555-123-4567",
              "Create an opportunity for Acme Corp with name: New Deal",
            ],
          },
          {
            id: "salesforce_find",
            name: "Find Salesforce Records",
            description:
              "Finds existing records in Salesforce based on search criteria.",
            tags: ["salesforce", "crm", "find", "search"],
            examples: [
              "Find lead with email: john@example.com",
              "Get contact Jane Smith",
              "Find opportunities for Acme Corp",
            ],
          },
          {
            id: "salesforce_update",
            name: "Update Salesforce Records",
            description:
              "Updates existing records in Salesforce with new field values.",
            tags: ["salesforce", "crm", "update"],
            examples: [
              "Update lead John Doe with new phone: 555-987-6543",
              "Update contact Jane Smith, set company: New Corp",
              "Update the Acme Corp opportunity to Closed Won",
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