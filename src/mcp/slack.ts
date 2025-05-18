import { createMcpClient } from "./client.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";

// Initialize MCP client
let mcpClient: any = null;

// Function to get or create MCP client
async function getMcpClient() {
  if (!mcpClient) {
    mcpClient = await createMcpClient("slack-mcp-client");
    console.log("[Slack MCP] Connected to MCP server");
  }
  return mcpClient;
}

/**
 * Call the MCP Slack message sending tool
 * @param args Arguments for the Slack message tool
 * @returns MCP response
 */
export async function sendSlackMessage(args: any) {
  try {
    console.log("[Slack MCP] Sending slack message with args:", JSON.stringify(args, null, 2));
    const client = await getMcpClient();
    
    const response = await client.request(
      {
        method: "tools/call",
        params: {
          name: "slack_send_channel_message",
          arguments: args
        }
      },
      CallToolResultSchema
    );
    
    console.log("[Slack MCP] Received response:", response ? "success" : "null");
    
    // Return a default safe response if null
    if (!response) {
      console.warn("[Slack MCP] Received null response, returning safe default");
      return {
        tool: "slack_send_channel_message",
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
    console.error("[Slack MCP] Error calling Slack tool:", error);
    // Return a error response that won't cause null reference errors
    return {
      tool: "slack_send_channel_message",
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