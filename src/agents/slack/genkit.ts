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
  model: googleAI.model("gemini-1.5-flash"),
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
      
      // Parse the MCP response
      let parsedResult = null;
      let permalink = null;
      
      if (result?.content && result.content[0]?.text) {
        try {
          parsedResult = JSON.parse(result.content[0].text);
          console.log("[SlackAgent MCP] Parsed result:", JSON.stringify(parsedResult, null, 2));
          
          if (parsedResult?.results?.[0]?.message?.permalink) {
            permalink = parsedResult.results[0].message.permalink;
          }
        } catch (error) {
          console.error("[SlackAgent MCP] Error parsing response:", error);
        }
      }
      
      return { 
        success: true, 
        channel, 
        message,
        permalink
      };
    } catch (error) {
      console.error("[SlackAgent MCP] Error sending message:", error);
      return { 
        success: false, 
        channel, 
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