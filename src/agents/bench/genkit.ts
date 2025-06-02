import { genkit } from "genkit/beta";
import { googleAI } from "@genkit-ai/googleai";
import * as dotenv from "dotenv";
import { z } from "genkit/beta";
import { dirname } from "path";
import { fileURLToPath } from "url";

// Load environment variables from .env file
dotenv.config();

// Check for required environment variables
if (!process.env.GEMINI_API_KEY) {
  console.error("GEMINI_API_KEY environment variable is required");
  process.exit(1);
}

if (!process.env.BENCH_API_KEY) {
  console.error("BENCH_API_KEY environment variable is required");
  process.exit(1);
}

// Initialize the Genkit AI client
export const ai = genkit({
  plugins: [
    googleAI({
      apiKey: process.env.GEMINI_API_KEY,
    }),
  ],
  model: googleAI.model("gemini-1.5-pro"),
  promptDir: dirname(fileURLToPath(import.meta.url)),
});

// Load the prompt defined in bench_agent.prompt
export const benchAgentPrompt = ai.prompt("bench_agent");

// Define a custom Bench tool for sending messages to Bench API
export const sendMessageToBenchTool = ai.defineTool(
  {
    name: "sendMessageToBench",
    description: "Send a message to Bench API and get a response",
    inputSchema: z.object({
      message: z.string().describe("The message to send to Bench")
    }).catchall(z.any()),
  },
  async (inputParams) => {
    console.log("[BenchAgent] Preparing to send message to Bench:", inputParams.message);
    
    // Get API credentials from environment
    const API_KEY = process.env.BENCH_API_KEY;
    const API_URL = 'https://bench.io/api/internal/chat';
    
    if (!API_KEY) {
      throw new Error("BENCH_API_KEY environment variable is required");
    }
    
    try {
      // Create message payload
      const messageId = `msg_${Math.random().toString(36).substring(2, 10)}`;
      
      const payload = {
        messages: [
          {
            id: messageId,
            role: 'user',
            content: inputParams.message,
            createdAt: new Date().toISOString()
          }
        ],
        activeMaterials: [],
        artifacts: []
      };
      
      console.log("[BenchAgent] Sending payload:", JSON.stringify(payload));
      
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': API_KEY
        },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        const errorText = await response.text().catch(e => "Failed to get error text");
        console.log(`[BenchAgent] Error response: ${response.status} ${response.statusText} - ${errorText}`);
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      console.log("[BenchAgent] Response data:", JSON.stringify(data));
      
      // Extract the assistant's response
      const assistantMessage = data.messages.find(msg => msg.role === 'assistant');
      const responseText = assistantMessage ? assistantMessage.content : "No response from Bench API";
      
      return {
        success: true,
        message: responseText,
        artifacts: data.artifacts || []
      };
    } catch (error) {
      console.error(`[BenchAgent] DEBUG: Error calling Bench API:`, error);
      if (error instanceof Error) {
        console.error(`[BenchAgent] DEBUG: Error message:`, error.message);
        console.error(`[BenchAgent] DEBUG: Error stack:`, error.stack);
        if (error.cause) {
          console.error(`[BenchAgent] DEBUG: Error cause:`, error.cause);
        }
      }
      
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error || "Unknown error connecting to Bench API")
      };
    }
  }
);

// Function to get all available tools
export function getBenchTools() {
  // Return the tool function for the prompt to use
  return [sendMessageToBenchTool];
}

export { z }; 