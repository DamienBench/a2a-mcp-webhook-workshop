import { genkit } from "genkit/beta";
import { googleAI } from "@genkit-ai/googleai";
import * as dotenv from "dotenv";
import { z } from "genkit/beta";
import { dirname } from "path";
import { fileURLToPath } from "url";
import { 
  createSalesforceRecord, 
  findSalesforceRecord, 
  updateSalesforceRecord 
} from "../../mcp/salesforce.js";

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
  promptDir: dirname(fileURLToPath(import.meta.url)), // Set the prompt directory to the current directory
});

// Load the prompt defined in salesforce_agent.prompt
export const salesforceAgentPrompt = ai.prompt("salesforce_agent");

// MCP server URL from environment variable
const MCP_SERVER_URL = process.env.MCP_SERVER_URL || "https://mcp.zapier.com";

// Define the Salesforce Create Record tool
export const salesforceCreateRecord = ai.defineTool(
  {
    name: "salesforce_create_record",
    description: "Creates a new record in Salesforce",
    inputSchema: z.object({
      instructions: z.string().describe("Natural language instructions for creating the record, e.g., 'Create a contact named John Smith with company Acme Corp'"),
      object: z.string().describe("The type of Salesforce object to create (e.g., Contact, Account, Opportunity)"),
    }),
  },
  async (inputParams) => {
    console.log("[SalesforceAgent MCP] Preparing to create record with params:", JSON.stringify(inputParams, null, 2));
    
    try {
      const resp = await createSalesforceRecord({
        instructions: inputParams.instructions,
        object: inputParams.object
      });
      
      console.log("[SalesforceAgent MCP] Result:", JSON.stringify(resp, null, 2));
      
      return resp;
    } catch (error) {
      console.error("[SalesforceAgent MCP] Error creating record:", error);
      return { 
        isError: true, 
        error: error.message 
      };
    }
  }
);

// Define the Salesforce Find Record tool
export const salesforceFindRecord = ai.defineTool(
  {
    name: "salesforce_find_record",
    description: "Find an existing record in Salesforce by ID or search criteria",
    inputSchema: z.object({
      instructions: z.string().describe("Natural language instructions for finding the record, e.g., 'Find contact named John Smith'"),
      object: z.string().describe("The type of Salesforce object to find (e.g., Contact, Account, Opportunity)"),
    }),
  },
  async (inputParams) => {
    console.log("[SalesforceAgent MCP] Preparing to find record with params:", JSON.stringify(inputParams, null, 2));
    
    try {
      const resp = await findSalesforceRecord({
        instructions: inputParams.instructions,
        object: inputParams.object
      });
      
      console.log("[SalesforceAgent MCP] Result:", JSON.stringify(resp, null, 2));
      
      return resp;
    } catch (error) {
      console.error("[SalesforceAgent MCP] Error finding record:", error);
      return { 
        isError: true, 
        error: error.message 
      };
    }
  }
);

// Define the Salesforce Update Record tool
export const salesforceUpdateRecord = ai.defineTool(
  {
    name: "salesforce_update_record",
    description: "Update an existing record in Salesforce",
    inputSchema: z.object({
      instructions: z.string().describe("Natural language instructions for updating the record, e.g., 'Update contact John Smith set company to Acme Corp'"),
      object: z.string().describe("The type of Salesforce object to update (e.g., Contact, Account, Opportunity)"),
    }),
  },
  async (inputParams) => {
    console.log("[SalesforceAgent MCP] Preparing to update record with params:", JSON.stringify(inputParams, null, 2));
    
    try {
      const resp = await updateSalesforceRecord({
        instructions: inputParams.instructions,
        object: inputParams.object
      });
      
      console.log("[SalesforceAgent MCP] Result:", JSON.stringify(resp, null, 2));
      
      return resp;
    } catch (error) {
      console.error("[SalesforceAgent MCP] Error updating record:", error);
      return { 
        isError: true, 
        error: error.message 
      };
    }
  }
);



// Function to get all available Salesforce tools
export function getSalesforceTools() {
  return [salesforceCreateRecord];
  // return [salesforceCreateRecord, salesforceFindRecord, salesforceUpdateRecord];
}

export { z }; 