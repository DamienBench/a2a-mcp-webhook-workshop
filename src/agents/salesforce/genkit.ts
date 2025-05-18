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
  model: googleAI.model("gemini-1.5-flash"),
  promptDir: dirname(fileURLToPath(import.meta.url)), // Set the prompt directory to the current directory
});

// Load the prompt defined in salesforce_agent.prompt
export const salesforceAgentPrompt = ai.prompt("salesforce_agent");

// Define the Salesforce Create Record tool
export const salesforceCreateRecord = ai.defineTool(
  {
    name: "salesforce_create_record",
    description: "Create a new record in Salesforce",
    inputSchema: z.object({
      object: z.string().describe("The type of Salesforce object to create (e.g., Lead, Contact, Account, Opportunity)"),
      name: z.string().optional().describe("The name of the record"),
      company: z.string().optional().describe("The company name (for Lead, Account)"),
      email: z.string().optional().describe("The email address"),
      phone: z.string().optional().describe("The phone number")
    }).catchall(z.any()), // Allow additional fields
  },
  async (inputParams) => {
    console.log("[SalesforceAgent MCP] Preparing to create record with params:", JSON.stringify(inputParams, null, 2));
    
    // Extract parameters
    const { object, name, company, email, phone, ...restParams } = inputParams;
    
    // Build field list for instructions
    let fieldList = [];
    if (name) fieldList.push(`name: ${name}`);
    if (company) fieldList.push(`company: ${company}`);
    if (email) fieldList.push(`email: ${email}`);
    if (phone) fieldList.push(`phone: ${phone}`);
    Object.entries(restParams).forEach(([key, value]) => {
      fieldList.push(`${key}: ${value}`);
    });
    
    // MCP requires 'instructions' field and 'object'
    const mcpArgs = {
      instructions: `Create a new ${object} with the following fields: ${fieldList.join(', ')}`,
      object: object || "Lead",
      ...restParams // Pass through any other parameters
    };
    
    console.log("[SalesforceAgent MCP] Sending with args:", JSON.stringify(mcpArgs, null, 2));
    
    try {
      const result = await createSalesforceRecord(mcpArgs);
      console.log("[SalesforceAgent MCP] Result:", JSON.stringify(result, null, 2));
      
      // Parse the MCP response
      let parsedResult = null;
      let recordId = `SF-${Date.now()}`; // Default ID
      
      if (result?.content && result.content[0]?.text) {
        try {
          parsedResult = JSON.parse(result.content[0].text);
          console.log("[SalesforceAgent MCP] Parsed result:", JSON.stringify(parsedResult, null, 2));
          
          if (parsedResult?.results?.[0]?.id) {
            recordId = parsedResult.results[0].id;
          }
        } catch (error) {
          console.error("[SalesforceAgent MCP] Error parsing response:", error);
        }
      }
      
      return { 
        success: true, 
        object,
        id: recordId,
        fields: { name, company, email, phone, ...restParams }
      };
    } catch (error) {
      console.error("[SalesforceAgent MCP] Error creating record:", error);
      return { 
        success: false, 
        object,
        error: error.message 
      };
    }
  }
);

// Define the Salesforce Find Record tool
export const salesforceFindRecord = ai.defineTool(
  {
    name: "salesforce_find_record",
    description: "Find an existing record in Salesforce",
    inputSchema: z.object({
      object: z.string().describe("The type of Salesforce object to find (e.g., Lead, Contact, Account, Opportunity)"),
      id: z.string().describe("The ID of the record to find")
    }).catchall(z.any()), // Allow additional search criteria
  },
  async (inputParams) => {
    console.log("[SalesforceAgent MCP] Preparing to find record with params:", JSON.stringify(inputParams, null, 2));
    
    // Extract parameters
    const { object, id, ...restParams } = inputParams;
    
    // MCP requires 'instructions' field and 'object'
    const mcpArgs = {
      instructions: `Find the ${object} with ID: ${id}`,
      object: object || "Lead",
      ...restParams
    };
    
    console.log("[SalesforceAgent MCP] Sending with args:", JSON.stringify(mcpArgs, null, 2));
    
    try {
      const result = await findSalesforceRecord(mcpArgs);
      console.log("[SalesforceAgent MCP] Result:", JSON.stringify(result, null, 2));
      
      // Parse the MCP response
      let parsedResult = null;
      let fields = {};
      
      if (result?.content && result.content[0]?.text) {
        try {
          parsedResult = JSON.parse(result.content[0].text);
          console.log("[SalesforceAgent MCP] Parsed result:", JSON.stringify(parsedResult, null, 2));
          
          if (parsedResult?.results?.[0]) {
            fields = parsedResult.results[0];
          }
        } catch (error) {
          console.error("[SalesforceAgent MCP] Error parsing response:", error);
        }
      }
      
      return { 
        success: true, 
        object,
        id,
        fields
      };
    } catch (error) {
      console.error("[SalesforceAgent MCP] Error finding record:", error);
      return { 
        success: false, 
        object,
        id,
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
      object: z.string().describe("The type of Salesforce object to update (e.g., Lead, Contact, Account, Opportunity)"),
      id: z.string().describe("The ID of the record to update"),
      name: z.string().optional().describe("The updated name"),
      company: z.string().optional().describe("The updated company name"),
      email: z.string().optional().describe("The updated email address"),
      phone: z.string().optional().describe("The updated phone number")
    }).catchall(z.any()), // Allow additional fields to update
  },
  async (inputParams) => {
    console.log("[SalesforceAgent MCP] Preparing to update record with params:", JSON.stringify(inputParams, null, 2));
    
    // Extract parameters
    const { object, id, name, company, email, phone, ...restParams } = inputParams;
    
    // Build field list for instructions
    let fieldList = [];
    if (name) fieldList.push(`name: ${name}`);
    if (company) fieldList.push(`company: ${company}`);
    if (email) fieldList.push(`email: ${email}`);
    if (phone) fieldList.push(`phone: ${phone}`);
    Object.entries(restParams).forEach(([key, value]) => {
      fieldList.push(`${key}: ${value}`);
    });
    
    // MCP requires 'instructions' field and 'object'
    const mcpArgs = {
      instructions: `Update the ${object} with ID: ${id} with the following fields: ${fieldList.join(', ')}`,
      object: object || "Lead",
      ...restParams
    };
    
    console.log("[SalesforceAgent MCP] Sending with args:", JSON.stringify(mcpArgs, null, 2));
    
    try {
      const result = await updateSalesforceRecord(mcpArgs);
      console.log("[SalesforceAgent MCP] Result:", JSON.stringify(result, null, 2));
      
      // Parse the MCP response
      let parsedResult = null;
      
      if (result?.content && result.content[0]?.text) {
        try {
          parsedResult = JSON.parse(result.content[0].text);
          console.log("[SalesforceAgent MCP] Parsed result:", JSON.stringify(parsedResult, null, 2));
        } catch (error) {
          console.error("[SalesforceAgent MCP] Error parsing response:", error);
        }
      }
      
      return { 
        success: true, 
        object,
        id,
        updatedFields: { name, company, email, phone, ...restParams }
      };
    } catch (error) {
      console.error("[SalesforceAgent MCP] Error updating record:", error);
      return { 
        success: false, 
        object,
        id,
        error: error.message 
      };
    }
  }
);

// Function to get all available Salesforce tools
export function getSalesforceTools() {
  return [salesforceCreateRecord, salesforceFindRecord, salesforceUpdateRecord];
}

export { z }; 