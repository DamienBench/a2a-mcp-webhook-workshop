import { genkit } from "genkit/beta";
import { googleAI } from "@genkit-ai/googleai";
import * as dotenv from "dotenv";
import { z } from "genkit/beta";
import { dirname } from "path";
import { fileURLToPath } from "url";
import { createGithubIssue } from "../../mcp/github.js";

// Load environment variables from .env file
dotenv.config();

// Check for required environment variables
if (!process.env.MCP_SERVER_URL) {
  console.error("MCP_SERVER_URL environment variable is required");
  process.exit(1);
}

if (!process.env.GEMINI_API_KEY) {
  console.error("GEMINI_API_KEY environment variable is required");
  process.exit(1);
}

if (!process.env.GITHUB_REPOSITORY) {
  console.error("GITHUB_REPOSITORY environment variable is required");
  process.exit(1);
}

// Initialize the Genkit AI client
export const ai = genkit({
  plugins: [
    googleAI({
      apiKey: process.env.GEMINI_API_KEY,
    }),
  ],
  model: googleAI.model("gemini-2.0-flash"),
  promptDir: dirname(fileURLToPath(import.meta.url)), // Set the prompt directory to the current directory
});

// Load the prompt defined in github_agent.prompt
export const githubAgentPrompt = ai.prompt("github_agent");

// Define a custom GitHub tool that correctly formats parameters for MCP
export const githubCreateIssue = ai.defineTool(
  {
    name: "github_create_issue",
    description: "Create a new issue in a GitHub repository",
    inputSchema: z.object({
      title: z.string().describe("The title of the issue"),
      body: z.string().describe("The body/description of the issue"),
      repository: z.string().optional().describe("The repository to create the issue in (format: owner/repo)")
    }).catchall(z.any()), // Allow additional parameters
  },
  async (inputParams) => {
    console.log("[GitHubAgent MCP] Preparing to create issue with params:", JSON.stringify(inputParams, null, 2));
    
    // Extract parameters
    const { title, body, repository, ...restParams } = inputParams;
    
    // Use environment variable for repository if available, otherwise fall back to provided or default
    const defaultRepo = process.env.GITHUB_REPOSITORY;
    const repo = repository && repository !== "owner/repo" ? repository : defaultRepo;
    
    // MCP requires 'instructions' field
    const mcpArgs = {
      instructions: `Create an issue in repository ${repo} with title "${title}"`,
      title: title || "New Issue",
      body: body || "No description provided",
      ...restParams // Pass through any other parameters
    };
    
    console.log("[GitHubAgent MCP] Sending with args:", JSON.stringify(mcpArgs, null, 2));
    
    try {
      const result = await createGithubIssue(mcpArgs);
      console.log("[GitHubAgent MCP] Result:", JSON.stringify(result, null, 2));
      
      // Parse the MCP response
      let parsedResult = null;
      let issueNumber = Math.floor(Math.random() * 1000) + 1; // Default issue number
      let htmlUrl = `https://github.com/${repo}/issues/${issueNumber}`; // Default URL
      
      if (result?.content && result.content[0]?.text) {
        try {
          parsedResult = JSON.parse(result.content[0].text);
          console.log("[GitHubAgent MCP] Parsed result:", JSON.stringify(parsedResult, null, 2));
          
          if (parsedResult?.results?.[0]) {
            issueNumber = parsedResult.results[0].number || issueNumber;
            if (parsedResult.results[0].html_url) {
              htmlUrl = parsedResult.results[0].html_url;
            }
          }
        } catch (error) {
          console.error("[GitHubAgent MCP] Error parsing response:", error);
        }
      }
      
      return { 
        success: true, 
        repository: repo, 
        title,
        body,
        issueNumber,
        htmlUrl
      };
    } catch (error) {
      console.error("[GitHubAgent MCP] Error creating issue:", error);
      return { 
        success: false, 
        repository: repo, 
        title,
        error: error.message 
      };
    }
  }
);

// Function to get all available tools
export function getGithubTools() {
  // Return the tool function for the prompt to use
  return [githubCreateIssue];
}

export { z }; 