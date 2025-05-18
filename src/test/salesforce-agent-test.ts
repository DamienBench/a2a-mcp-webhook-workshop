import { A2AClient } from "../client/client.js";
import { TaskSendParams } from "../schema.js";
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

// Get the directory name of the current file
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.join(__dirname, 'output', 'salesforce');

/**
 * Test for Salesforce A2A agent
 */
async function testSalesforceAgent() {
  console.log("===== A2A Salesforce Agent Test =====");
  
  // Ensure the output directory exists
  try {
    await fs.mkdir(outputDir, { recursive: true });
    console.log(`✅ Created output directory at ${outputDir}`);
  } catch (error) {
    console.error("❌ Failed to create output directory:", error);
    process.exit(1);
  }

  // Initialize the client
  const serverUrl = "http://localhost:41244"; // Salesforce agent URL
  const client = new A2AClient(serverUrl);
  
  try {
    // Try to fetch the agent card
    const agentCard = await client.agentCard();
    console.log(`\n✨ Connected to agent: ${agentCard.name} (${agentCard.version || 'Unknown version'})`);
    if (agentCard.description) {
      console.log(`📝 Description: ${agentCard.description}`);
    }

    // Generate a random task ID
    const taskId = crypto.randomUUID();
    console.log(`\n📋 Task ID: ${taskId}`);
    
    // Test message for Salesforce - use the find operation that worked in the original test
    const message = "Find Account with name: ACME Corp";
    
    // Construct the request parameters
    const params: TaskSendParams = {
      id: taskId,
      message: {
        role: "user",
        parts: [{ type: "text", text: message }],
      },
    };
    
    console.log(`\n🚀 Sending request to Salesforce Agent...`);
    console.log(`📝 Message: ${message}`);
    
    // Send the task and subscribe to updates
    const stream = client.sendTaskSubscribe(params);
    
    let receivedFiles = new Map<string, string>();
    
    // Process the stream of updates
    for await (const event of stream) {
      if ("status" in event) {
        // Status update event
        console.log(`\n📊 Status: ${event.status.state}`);
        
        if (event.status.message) {
          console.log(`💬 Message: ${event.status.message.parts
            .filter(part => 'text' in part)
            .map(part => (part as any).text)
            .join('\n')}`);
        }
      } else if ("artifact" in event) {
        // Artifact update event (file)
        const artifact = event.artifact;
        
        if (artifact.name) {
          console.log(`\n📄 Received file: ${artifact.name} (Index: ${artifact.index ?? 0})`);
          
          // Extract content from text parts
          const content = artifact.parts
            .filter(part => 'text' in part)
            .map(part => (part as any).text)
            .join('\n');
          
          // Store the file content
          receivedFiles.set(artifact.name, content);
          
          console.log(`📝 Content (preview): ${content.substring(0, 50)}${content.length > 50 ? '...' : ''}`);
        }
      }
    }
    
    console.log("\n✅ Stream completed");
    console.log(`\n📦 Received ${receivedFiles.size} files: ${Array.from(receivedFiles.keys()).join(', ')}`);
    
    // Save all received files
    for (const [filename, content] of receivedFiles.entries()) {
      const filePath = path.join(outputDir, filename);
      await fs.writeFile(filePath, content);
      console.log(`💾 Saved ${filename} to ${filePath}`);
    }
    
    console.log(`\n✅ Communication with Salesforce Agent completed!`);
  } catch (error) {
    console.error(`\n❌ Error communicating with Salesforce Agent:`, error);
    process.exit(1);
  }
}

// Run the test
testSalesforceAgent().catch(err => {
  console.error("❌ Unhandled error:", err);
  process.exit(1);
}); 