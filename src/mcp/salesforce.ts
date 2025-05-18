import { createMcpClient } from "./client.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";

// Initialize MCP client
let mcpClient: any = null;

// Function to get or create MCP client
async function getMcpClient() {
  if (!mcpClient) {
    mcpClient = await createMcpClient("salesforce-mcp-client");
    console.log("[Salesforce MCP] Connected to MCP server");
  }
  return mcpClient;
}

/**
 * Call the MCP Salesforce create record tool
 * @param args Arguments for record creation
 * @returns MCP response
 */
export async function createSalesforceRecord(args: any) {
  const client = await getMcpClient();
  
  const response = await client.request(
    {
      method: "tools/call",
      params: {
        name: "salesforce_create_record",
        arguments: args
      }
    },
    CallToolResultSchema
  );
  
  return response;
}

/**
 * Call the MCP Salesforce find record tool
 * @param args Arguments for record lookup
 * @returns MCP response
 */
export async function findSalesforceRecord(args: any) {
  const client = await getMcpClient();
  
  const response = await client.request(
    {
      method: "tools/call",
      params: {
        name: "salesforce_find_record",
        arguments: args
      }
    },
    CallToolResultSchema
  );
  
  return response;
}

/**
 * Call the MCP Salesforce update record tool
 * @param args Arguments for record update
 * @returns MCP response
 */
export async function updateSalesforceRecord(args: any) {
  const client = await getMcpClient();
  
  const response = await client.request(
    {
      method: "tools/call",
      params: {
        name: "salesforce_update_record",
        arguments: args
      }
    },
    CallToolResultSchema
  );
  
  return response;
} 