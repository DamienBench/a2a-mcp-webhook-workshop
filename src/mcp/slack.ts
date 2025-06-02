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
    
    console.log("[Slack MCP] Raw response:", JSON.stringify(response, null, 2));
    
    // Validate the response more thoroughly
    if (!response) {
      console.error("[Slack MCP] Received null response from MCP server");
      return {
        tool: "slack_send_channel_message",
        content: [{
          type: "text",
          text: JSON.stringify({
            status: "error",
            message: "No response received from MCP server",
            results: []
          })
        }],
        isError: true
      };
    }

    // Check if response contains valid content
    if (!response.content || !Array.isArray(response.content) || response.content.length === 0) {
      console.error("[Slack MCP] Response missing content or content is empty");
      return {
        tool: "slack_send_channel_message", 
        content: [{
          type: "text",
          text: JSON.stringify({
            status: "error",
            message: "MCP server returned empty or invalid content",
            results: []
          })
        }],
        isError: true
      };
    }

    // Check if the first content item has text
    const firstContent = response.content[0];
    if (!firstContent || !firstContent.text) {
      console.error("[Slack MCP] Response content missing text field");
      return {
        tool: "slack_send_channel_message",
        content: [{
          type: "text", 
          text: JSON.stringify({
            status: "error",
            message: "MCP server returned content without text",
            results: []
          })
        }],
        isError: true
      };
    }

    // Try to parse the text content
    let parsedContent;
    try {
      parsedContent = JSON.parse(firstContent.text);
    } catch (parseError) {
      // If it's not JSON, treat the raw text as the response
      console.log("[Slack MCP] Response text is not JSON, treating as raw text:", firstContent.text);
      parsedContent = { message: firstContent.text };
    }

    // Check if we received an empty array (which indicates failure)
    if (Array.isArray(parsedContent) && parsedContent.length === 0) {
      console.error("[Slack MCP] Response content is empty array, indicating failure");
      return {
        tool: "slack_send_channel_message",
        content: [{
          type: "text",
          text: JSON.stringify({
            status: "error", 
            message: "Slack message sending failed - empty response",
            results: []
          })
        }],
        isError: true
      };
    }

    // Log successful response
    console.log("[Slack MCP] Received valid response:", response ? "success" : "null");
    
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
      }],
      isError: true
    };
  }
} 