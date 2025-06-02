import { TaskYieldUpdate } from "../../a2a/server/handler.js";
import {
  TaskContext,
  A2AServer
} from "../../a2a/server/index.js";
import * as schema from "../../schema.js";
import { ai, getGithubTools, githubAgentPrompt } from "./genkit.js";
import * as dotenv from "dotenv";

// Load environment variables from .env file
dotenv.config();

// Check if API key is set
if (!process.env.GEMINI_API_KEY) {  
  console.error("GEMINI_API_KEY environment variable not set.")
  process.exit(1);
}

// Check if GitHub repository is set
if (!process.env.GITHUB_REPOSITORY) {  
  console.error("GITHUB_REPOSITORY environment variable not set.")
  process.exit(1);
}

/**
 * GitHub agent that can create issues
 */
async function* githubAgent({
  task,
  userMessage,
}: TaskContext): AsyncGenerator<TaskYieldUpdate, schema.Task | void, unknown> {
  // First, send a "working" status update
  yield {
    state: "working",
    message: {
      role: "agent",
      parts: [{ type: "text", text: "Processing your GitHub request..." }],
    },
  };
  
  // Get the text from the user message parts
  const userText = userMessage.parts
    .filter((p): p is schema.TextPart => !!(p as schema.TextPart).text)
    .map((p) => p.text)
    .join("\n");
  
  try {
    console.log("[GitHubAgent] Processing request:", userText);
    
    // Get GitHub tools
    const githubTools = getGithubTools();
    
    // Use the prompt file to run the GitHub agent with MCP tools
    const response = await githubAgentPrompt(
      { now: new Date().toISOString() },
      {
        messages: [
          {
            role: "user",
            content: [{ text: userText }]
          }
        ],
        tools: githubTools
      }
    );
    
    // Initialize tool usage variables
    const defaultRepo = process.env.GITHUB_REPOSITORY;
    let repository = defaultRepo; // Use actual repo instead of owner/repo
    let title = "";
    let body = "";
    let issueNumber = 0;
    let htmlUrl = "";
    let success = false;
    
    // Parse response to extract tool usage and results
    if (response.request?.messages) {
      for (const msg of response.request.messages) {
        // Extract tool request details (title, body, repository)
        if (msg.role === 'model' && msg.content && Array.isArray(msg.content)) {
          for (const item of msg.content) {
            if (item.toolRequest && item.toolRequest.input) {
              const input = item.toolRequest.input as { 
                title: string; 
                body: string;
                repository?: string;
              };
              title = input.title || "New Issue";
              body = input.body || "";
              // Only use specified repository if it's not the placeholder
              if (input.repository && input.repository !== "owner/repo") {
                repository = input.repository;
              }
              console.log("[GitHubAgent] Extracted title:", title, "repository:", repository);
            }
          }
        }
        
        // Extract tool response details (success, issueNumber, htmlUrl)
        if (msg.role === 'tool' && msg.content && Array.isArray(msg.content)) {
          for (const item of msg.content) {
            if (item.toolResponse && item.toolResponse.output) {
              const output = item.toolResponse.output as { 
                success: boolean; 
                repository: string;
                issueNumber?: number;
                htmlUrl?: string;
              };
              success = output.success === true;
              // Only use response repository if it's not the placeholder
              if (output.repository && output.repository !== "owner/repo") {
                repository = output.repository;
              }
              issueNumber = output.issueNumber || 0;
              htmlUrl = output.htmlUrl || "";
              console.log("[GitHubAgent] Issue creation success:", success, "URL:", htmlUrl);
            }
          }
        }
      }
    }
    
    // Build the response text based on the success state
    let responseText = "";
    if (success) {
      responseText = `I've created a new issue in ${repository}: "${title}"`;
      if (htmlUrl) {
        responseText += `\n\nLink: ${htmlUrl}`;
      }
    } else {
      responseText = `I couldn't create the issue in ${repository}. Please try again.`;
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
    console.error("[GitHubAgent] Error in GitHub agent:", error);
    yield {
      state: "failed",
      message: {
        role: "agent",
        parts: [
          { 
            type: "text", 
            text: `I encountered an error while processing your GitHub request: ${error.message || "Unknown error"}`
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
  console.log("[GitHubAgent] Running test with message:", testMessage);
  
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
    const agent = githubAgent(mockContext);
    
    // Process all yields from the generator
    let result = await agent.next();
    while (!result.done) {
      console.log("[GitHubAgent Test] Yielded:", JSON.stringify(result.value, null, 2));
      result = await agent.next();
    }
    
    console.log("[GitHubAgent Test] Final result:", result.value);
  } catch (error) {
    console.error("[GitHubAgent Test] Error:", error);
  }
}

/**
 * Start the A2A server for GitHub agent
 */
async function initServer() {
  const port = process.env.GITHUB_AGENT_PORT || 41245;
  const githubRepo = process.env.GITHUB_REPOSITORY;
  
  const server = new A2AServer(
    githubAgent,
    {
      card: {
        name: "GitHub Agent",
        description: `An agent that can create GitHub issues in the repo https://github.com/${githubRepo}`,
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
            id: "github_create_issue",
            name: "GitHub Issue Creation",
            description: "Creates new issues in GitHub repositories",
            tags: ["github", "issues", "development"],
            examples: [
              "Create an issue with title 'Fix bug in login page'",
              `Create an issue in ${githubRepo} titled 'Update dependencies'`,
              "Create a GitHub issue with description 'The site is broken on mobile devices'"
            ],
          }
        ],
      }
    }
  );
  
  await server.start(Number(port));
  console.log(`[GitHubAgent] Server started on http://localhost:${port}`);
  console.log(`[GitHubAgent] Press Ctrl+C to stop the server`);
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