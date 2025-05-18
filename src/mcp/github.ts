import { createMcpClient } from "./client.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";

// Initialize MCP client
let mcpClient: any = null;

// Function to get or create MCP client
async function getMcpClient() {
  if (!mcpClient) {
    mcpClient = await createMcpClient("github-mcp-client");
    console.log("[GitHub MCP] Connected to MCP server");
  }
  return mcpClient;
}

/**
 * Call the MCP GitHub issue creation tool
 * @param args Arguments for the GitHub issue creation tool
 * @returns MCP response
 */
export async function createGithubIssue(args: any) {
  try {
    console.log("[GitHub MCP] Creating GitHub issue with args:", JSON.stringify(args, null, 2));
    const client = await getMcpClient();
    
    const response = await client.request(
      {
        method: "tools/call",
        params: {
          name: "github_create_issue",
          arguments: args
        }
      },
      CallToolResultSchema
    );
    
    console.log("[GitHub MCP] Received response:", response ? "success" : "null");
    
    // Return a default safe response if null
    if (!response) {
      console.warn("[GitHub MCP] Received null response, returning safe default");
      return {
        tool: "github_create_issue",
        content: [{
          type: "text",
          text: JSON.stringify({
            status: "error",
            message: "No response received from MCP server",
            results: []
          })
        }]
      };
    }
    
    return response;
  } catch (error) {
    console.error("[GitHub MCP] Error calling GitHub tool:", error);
    // Return a error response that won't cause null reference errors
    return {
      tool: "github_create_issue",
      content: [{
        type: "text",
        text: JSON.stringify({
          status: "error",
          message: error.message || "Unknown error",
          results: []
        })
      }]
    };
  }
} 