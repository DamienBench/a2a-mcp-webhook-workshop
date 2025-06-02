import { TaskYieldUpdate } from "../../a2a/server/handler.js";
import {
  TaskContext,
  A2AServer
} from "../../a2a/server/index.js";
import * as schema from "../../schema.js";
import { getBenchTools, benchAgentPrompt } from "./genkit.js";
import * as dotenv from "dotenv";

// Load environment variables from .env file
dotenv.config();

// Check if API key is set
if (!process.env.GEMINI_API_KEY) {  
  console.error("GEMINI_API_KEY environment variable not set.")
  process.exit(1);
}

if (!process.env.BENCH_API_KEY) {  
  console.error("BENCH_API_KEY environment variable not set.")
  process.exit(1);
}

/**
 * Bench agent that can interact with the Bench API
 */
async function* benchAgent({
  task,
  userMessage,
}: TaskContext): AsyncGenerator<TaskYieldUpdate, schema.Task | void, unknown> {
  // First, send a "working" status update
  yield {
    state: "working",
    message: {
      role: "agent",
      parts: [{ type: "text", text: "Processing your Bench request..." }],
    },
  };
  
  // Get the text from the user message parts
  const userText = userMessage.parts
    .filter((p): p is schema.TextPart => !!(p as schema.TextPart).text)
    .map((p) => p.text)
    .join("\n");
  
  try {
    console.log("[BenchAgent] Processing request:", userText);
    
    // Get Bench tools
    const benchTools = getBenchTools();
    
    console.log("[BenchAgent] Processing request with tools:", benchTools.map(t => t.name).join(', '));
    
    // Use the prompt file to run the Bench agent with Genkit tools
    const response = await benchAgentPrompt(
      { now: new Date().toISOString() },
      {
        messages: [
          {
            role: "user",
            content: [{ text: userText }]
          }
        ],
        tools: benchTools
      }
    );
    
    // Initialize variables to track tool usage and results
    let success = false;
    let message = "";
    let responseMessage = "";
    let finalResponse = "";
    
    // Parse response to extract tool usage and results
    if (response.request?.messages) {
      for (const msg of response.request.messages) {
        // Extract tool request details
        if (msg.role === 'model' && msg.content && Array.isArray(msg.content)) {
          for (const item of msg.content) {
            if (item.toolRequest && item.toolRequest.input) {
              const input = item.toolRequest.input as { 
                message: string;
              };
              message = input.message || "No message provided";
            }
          }
        }
        
        // Extract tool response details
        if (msg.role === 'tool' && msg.content && Array.isArray(msg.content)) {
          for (const item of msg.content) {
            if (item.toolResponse && item.toolResponse.output) {
              const output = item.toolResponse.output as { 
                success: boolean;
                message?: string;
                error?: string;
              };
              success = output.success === true;
              responseMessage = output.message || output.error || "";
            }
          }
        }
      }
    }
    
    // Extract the model's response text
    if (response.text && typeof response.text === 'string') {
      finalResponse = response.text;
    } else if (typeof response === 'object' && response !== null) {
      // Try alternative response properties
      if ((response as any).response && typeof (response as any).response === 'string') {
        finalResponse = (response as any).response;
      } else if (typeof response.toString === 'function') {
        const fullResponseText = response.toString();
        if (fullResponseText && fullResponseText !== '[object Object]') {
          finalResponse = fullResponseText;
        }
      }
    }
    
    console.log("[BenchAgent] Response:", finalResponse ? finalResponse.substring(0, 100) + "..." : "No response text extracted");
    
    // If we got a response at all, consider it a success
    if (finalResponse) {
      success = true;
    }
    
    // If there's no AI response, provide a fallback message
    if (!finalResponse) {
      console.log("[BenchAgent] DEBUG: No finalResponse, using fallback message");
      finalResponse = success 
        ? `I've processed your request successfully through Bench.${responseMessage ? "\n\n" + responseMessage : ""}`
        : `I had trouble processing your request through Bench.${responseMessage ? "\n\nError: " + responseMessage : ""}`;
    }
    
    console.log("[BenchAgent] DEBUG: Final state:", success ? "completed" : "failed");
    console.log("[BenchAgent] Yielding final response with status:", success ? "completed" : "failed");
    
    // Yield the completed status with the agent's response
    yield {
      state: success ? "completed" : "failed",
      message: {
        role: "agent",
        parts: [{ type: "text", text: finalResponse }],
      },
    };
  } catch (error: any) {
    console.error("[BenchAgent] DEBUG: Uncaught error in benchAgent function:", error);
    console.error("[BenchAgent] Error in Bench agent:", error);
    yield {
      state: "failed",
      message: {
        role: "agent",
        parts: [
          { 
            type: "text", 
            text: `I encountered an error while processing your Bench request: ${error.message || "Unknown error"}`
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
  console.log("[BenchAgent] Running test with message:", testMessage);
  
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
    const agent = benchAgent(mockContext);
    
    // Process all yields from the generator
    let result = await agent.next();
    while (!result.done) {
      console.log("[BenchAgent Test] Yielded:", JSON.stringify(result.value, null, 2));
      result = await agent.next();
    }
    
    console.log("[BenchAgent Test] Final result:", result.value);
  } catch (error) {
    console.error("[BenchAgent Test] Error:", error);
  }
}

/**
 * Start the A2A server for Bench agent
 */
async function initServer() {
  const port = process.env.BENCH_AGENT_PORT || 41246;
  const server = new A2AServer(
    benchAgent,
    {
      card: {
        name: "Bench Agent",
        description: "An agent can chat and answer questions related to coding, research, fact checking, and document analysis. Provides access to Bench's tools for writing code, analyzing materials, fact checking, web search, etc.",
        url: `http://ec2-54-183-197-218.us-west-1.compute.amazonaws.com:${port}`,
        provider: {
          organization: "A2A Samples",
          url: "https://github.com/google/a2a"
        },
        version: "0.1.0",
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
            id: "bench_interaction",
            name: "Bench Interaction",
            description: "Interacts with the Bench API to perform tasks like fact checking, programming help, research, data analysis, and other AI assistant capabilities. Bench can also be used to just chat with the user.",
            tags: ["bench", "ai", "typescript", "programming", "code", "research", "fact-check", "web-search", "chat"],
            examples: [
              "Can you help me analyze this PDF about climate change?",
              "Use Bench to search for information about machine learning",
              "I need help writing code for a React component",
              "Can you fact check this claim: the earth is flat",
              "Help me understand how to use TypeScript interfaces",
              "Research the latest advancements in AI",
              "Can you chat with me about the latest news in technology",
              "What's the weather in Tokyo today?",
              "I'm interested in learning about the history of the moon landing",
              "Can you help me with my homework?",
              "What's the capital of France?",
              "Research the latest advancements in AI",
              "Hi"
            ],
          }
        ],
      }
    }
  );
  
  await server.start(Number(port));
  console.log(`[BenchAgent] Server started on http://ec2-54-183-197-218.us-west-1.compute.amazonaws.com:${port}`);
  console.log(`[BenchAgent] Press Ctrl+C to stop the server`);
}

/**
 * Main function to either run a test or start the server
 */
async function main() {
  if (process.argv.length > 2) {
    // Run test mode with command line arguments
    const testMessage = process.argv.slice(2).join(" ");
    await runTest(testMessage);
  } else {
    // Run in server mode
    await initServer();
  }
}

// Run the main function
main().catch(console.error); 