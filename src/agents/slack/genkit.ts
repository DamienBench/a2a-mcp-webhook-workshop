import { genkit } from "genkit/beta";
import { googleAI } from "@genkit-ai/googleai";
import * as dotenv from "dotenv";
import { z } from "genkit/beta";
import { dirname } from "path";
import { fileURLToPath } from "url";
import { sendSlackMessage } from "../../mcp/slack.js";

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

// Initialize the Genkit AI client
export const ai = genkit({
  plugins: [
    googleAI({
      apiKey: process.env.GEMINI_API_KEY,
    }),
  ],
  model: googleAI.model("gemini-2.0-flash"),
  promptDir: dirname(fileURLToPath(import.meta.url)),
});

// Load the prompt defined in slack_agent.prompt
export const slackAgentPrompt = ai.prompt("slack_agent");

// Define a custom Slack tool that correctly maps parameters to MCP format
export const slackSendChannelMessage = ai.defineTool(
  {
    name: "slack_send_channel_message",
    description: "Send a message to a Slack channel",
    inputSchema: z.object({
      channel: z.string().describe("The Slack channel to send the message to (e.g., #general)"),
      message: z.string().describe("The message text to send to the channel")
    }).catchall(z.any()),
  },
  async (inputParams) => {
    console.log("[SlackAgent MCP] Preparing to send message with params:", JSON.stringify(inputParams, null, 2));
    
    // Extract channel and message
    const { channel, message, ...restParams } = inputParams;
    
    // MCP requires 'instructions' field
    const mcpArgs = {
      instructions: `Send a message to ${channel} saying: ${message}`,
      text: message,
      ...restParams // Pass through any other parameters provided
    };
    
    console.log("[SlackAgent MCP] Sending with args:", JSON.stringify(mcpArgs, null, 2));
    
    try {
      const result = await sendSlackMessage(mcpArgs);
      console.log("[SlackAgent MCP] Result:", JSON.stringify(result, null, 2));
      
      // Check if the MCP response indicates an error
      if (result?.isError === true) {
        console.error("[SlackAgent MCP] MCP server returned error response");
        return { 
          success: false, 
          channel, 
          message,
          error: "MCP server returned error response"
        };
      }
      
      // Parse the MCP response
      let parsedResult = null;
      let permalink = null;
      let actualSuccess = false;
      
      if (result?.content && result.content[0]?.text) {
        try {
          parsedResult = JSON.parse(result.content[0].text);
          console.log("[SlackAgent MCP] Parsed result:", JSON.stringify(parsedResult, null, 2));
          
          // Check if the parsed result indicates an error
          if (parsedResult?.status === "error") {
            console.error("[SlackAgent MCP] Parsed result indicates error:", parsedResult.message);
            return { 
              success: false, 
              channel, 
              message,
              error: parsedResult.message || "Unknown error from Slack"
            };
          }
          
          // Check if we got an empty array (indicates failure)
          if (Array.isArray(parsedResult) && parsedResult.length === 0) {
            console.error("[SlackAgent MCP] Received empty array, indicating failure");
            return { 
              success: false, 
              channel, 
              message,
              error: "Slack message sending failed - empty response"
            };
          }
          
          // Look for success indicators in the response
          if (parsedResult?.results?.[0]?.message?.permalink) {
            permalink = parsedResult.results[0].message.permalink;
            actualSuccess = true;
          } else if (parsedResult?.status === "success" || parsedResult?.message) {
            // Some success response format
            actualSuccess = true;
          } else if (typeof parsedResult === 'string' && parsedResult.length > 0) {
            // Non-empty string response is considered success
            actualSuccess = true;
          }
        } catch (error) {
          console.error("[SlackAgent MCP] Error parsing response:", error);
          return { 
            success: false, 
            channel, 
            message,
            error: "Failed to parse MCP response"
          };
        }
      } else {
        console.error("[SlackAgent MCP] No valid content in MCP response");
        return { 
          success: false, 
          channel, 
          message,
          error: "No valid content in MCP response"
        };
      }
      
      return { 
        success: actualSuccess, 
        channel, 
        message,
        permalink,
        error: actualSuccess ? undefined : "Unable to confirm message was sent successfully"
      };
    } catch (error) {
      console.error("[SlackAgent MCP] Error sending message:", error);
      return { 
        success: false, 
        channel, 
        message,
        error: error.message 
      };
    }
  }
);

// Function to get all available tools
export function getSlackTools() {
  // With genkit's defineTool, the tool itself is a function with metadata
  // We need to return an array of the tool function for the prompt to use
  return [slackSendChannelMessage];
}

export { z }; 