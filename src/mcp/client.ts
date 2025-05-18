import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import dotenv from "dotenv";

// Load environment variables from .env file
dotenv.config();

// Get MCP server URL from environment variables
export const MCP_SERVER_URL = process.env.MCP_SERVER_URL;

/**
 * Creates and connects an MCP client
 * @param name Custom client name (default: a2a-mcp-client)
 * @returns Connected MCP client instance
 */
export async function createMcpClient(name: string = "a2a-mcp-client") {
  if (!MCP_SERVER_URL) {
    throw new Error("MCP_SERVER_URL environment variable is required. Please set it in the .env file.");
  }
  
  // Create an SSE transport for the client
  const transport = new SSEClientTransport(
    new URL(MCP_SERVER_URL)
  );

  // Create and configure the MCP client
  const client = new Client(
    {
      name,
      version: "1.0.0",
    },
    {
      capabilities: {},
    }
  );

  // Connect to the MCP server
  await client.connect(transport);
  
  return client;
}

/**
 * Helper function to parse response data
 * @param response MCP response object
 * @returns Parsed JSON or null if parsing failed
 */
export function parseResponse(response: any): any {
  if (response?.content && response.content[0]?.text) {
    try {
      return JSON.parse(response.content[0].text as string);
    } catch (error) {
      console.log("Failed to parse response data");
    }
  }
  return null;
}

/**
 * Lists all available tools from the MCP server
 * @param filter Optional filter for tool names
 * @returns List of available tools and their schemas
 */
export async function listAvailableTools(filter?: string | string[]) {
  try {
    const client = await createMcpClient("tools-lister");
    
    console.log("Listing available MCP tools using client.listTools()...");
    
    // Use the built-in listTools method
    const toolsResult = await client.listTools();
    
    // Log the raw result for debugging
    console.log("Raw tools result:", JSON.stringify(toolsResult, null, 2));
    
    // Handle different potential return formats
    let tools = [];
    
    if (Array.isArray(toolsResult)) {
      // If it's already an array, use it directly
      tools = toolsResult;
    } else if (toolsResult && typeof toolsResult === 'object') {
      // If it's an object with a tools property that's an array
      if ('tools' in toolsResult && Array.isArray(toolsResult.tools)) {
        tools = toolsResult.tools;
      }
      // If it has a different structure, try to extract it
      else if (Object.values(toolsResult).some(v => Array.isArray(v))) {
        // Find the first array property
        for (const key in toolsResult) {
          if (Array.isArray(toolsResult[key])) {
            tools = toolsResult[key];
            console.log(`Found tools array in property: ${key}`);
            break;
          }
        }
      }
    }
    
    console.log(`Found ${tools.length} tools on MCP server:`, 
      tools.map((t: any) => t.name || 'unnamed').join(', '));
    
    // Filter tools if a filter is provided
    let filteredTools = tools;
    if (filter && tools.length > 0) {
      const filterArray = Array.isArray(filter) ? filter : [filter];
      filteredTools = tools.filter((tool: any) => 
        tool.name && filterArray.includes(tool.name)
      );
      console.log(`Filtered to ${filteredTools.length} tools: ${filteredTools.map((t: any) => t.name || 'unnamed').join(', ')}`);
    }
    
    return filteredTools;
  } catch (error) {
    console.error("Error listing MCP tools:", error);
    return [];
  }
} 