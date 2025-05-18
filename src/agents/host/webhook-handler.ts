import { A2AClient } from "../../a2a/client/client.js";
import { TaskSendParams } from "../../schema.js";
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Get the directory name of the current file
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.join(__dirname, '..', 'test', 'output');

// Agent URLs
const agentUrls = {
  slack: process.env.SLACK_AGENT_URL || "http://localhost:41243",
  salesforce: process.env.SALESFORCE_AGENT_URL || "http://localhost:41244",
  github: process.env.GITHUB_AGENT_URL || "http://localhost:41245"
};

/**
 * Extract tasks from a meeting transcript
 */
function extractTasksFromTranscript(transcript: string): Record<string, string> {
  // In a real system, we would use NLP to extract the relevant information
  // For now, we'll extract the key points manually
  
  // Extract bug report details for GitHub
  const bugInfo = transcript.includes("bug") ? 
    transcript.split("bug")[1].split("Alex: I appreciate")[0].trim() : 
    "Issue with message passing between agents";
    
  // Extract feature request details for Slack
  const featureInfo = transcript.includes("feature request") ? 
    transcript.split("feature request")[1].split("Michael: Would this")[0].trim() : 
    "Request for better integration with existing tools";
    
  // Extract customer information for Salesforce
  const customerInfo = {
    name: "Jennifer Williams",
    title: "Head of AI",
    company: "Bench",
    contact: "Michael Chen (CTO)"
  };
  
  return {
    // GitHub task: Create an issue with the bug report - removing PII and keeping it focused
    github: `Create a GitHub issue for this bug report from our customer:\n` +
            `Title: Bug in Multi-Agent Message Passing\n` +
            `Body: During testing, a critical issue was identified in the multi-agent workflow system:\n\n` +
            `When connecting more than three agents in a sequence and processing conversations with 10+ turns, message passing fails and context is lost between agents. Messages appear to be truncated, causing workflow failures.\n\n` +
            `Steps to reproduce:\n` +
            `1. Set up a workflow with 4+ agents in sequence\n` +
            `2. Run a conversation with at least 10 back-and-forth exchanges\n` +
            `3. Observe message truncation and context loss\n\n` +
            `Impact: Critical - This affects complex multi-agent workflows\n` +
            `Priority: High`,
    
    // Slack task: Send a message with the feature request
    slack: `Send a message to #product-requests saying: Feature Request from Bench Test Customer\n\n` +
           `During a sales discovery call with Bench (potential enterprise customer), they requested the following feature:\n\n` +
           `"Better integration with Slack and Salesforce to automatically update both systems with meeting summaries and action items."\n\n` +
           `This feature was mentioned as a potential deciding factor for them. The customer currently uses Slack extensively for team communication and Salesforce for their CRM.\n\n` +
           `Customer: Jennifer Williams (Head of AI) and Michael Chen (CTO) at Bench\nRequested during: Sales discovery call on ${new Date().toLocaleDateString()}\nPriority: High - potential deal deciding factor`,
    
    // Salesforce task: Create a Lead record with the customer information
    salesforce: `Create the following Salesforce records from our Bench Test sales discovery call:\n` +
                `1. A Lead with name: Jennifer Williams, title: Head of AI, company: Bench\n` +
                `2. A Lead with name: Michael Chen, title: CTO, company: Bench\n` +
                `3. A Task with subject: "Follow up on feature request", description: "Customer requested better integration with Slack and Salesforce for meeting summaries", due date: ${new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString()}, priority: High\n` +
                `4. An Opportunity with name: "Bench - AI Agent Platform", stage: "Discovery", amount: 30000, close date: ${new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toLocaleDateString()}, probability: 30%`
  };
}

/**
 * Process webhook data
 */
export async function processWebhookData(webhookData: any): Promise<{success: boolean, results: Record<string, any>}> {
  console.log('Processing webhook data:', JSON.stringify(webhookData, null, 2));
  
  // Add explicit debug logging for processorConfig
  console.log('DEBUG - processorConfig:', JSON.stringify(webhookData.processorConfig || {}, null, 2));
  if (webhookData.processorConfig) {
    console.log('DEBUG - parallel setting:', webhookData.processorConfig.parallel);
  } else {
    console.log('DEBUG - processorConfig is missing from webhookData');
  }
  
  try {
    // Extract whatever webhook ID we can from the data
    const webhookId = webhookData.webhookId || 'unknown';
    console.log(`Processing webhook ${webhookId}`);
    
    // For meeting transcript webhooks, extract transcript from wherever it might be
    if (webhookId === 'meeting-transcript') {
      // Try to find the transcript in common locations
      let transcript = null;
      
      if (webhookData.data && webhookData.data.transcript) {
        // Most common location: data.transcript
        transcript = webhookData.data.transcript;
      } else if (webhookData.data && webhookData.data.content) {
        // Alternative location: data.content
        transcript = webhookData.data.content;
      } else if (webhookData.transcript) {
        // Direct transcript field
        transcript = webhookData.transcript;
      } else if (webhookData.content) {
        // Direct content field
        transcript = webhookData.content;
      } else if (typeof webhookData.data === 'string') {
        // If data itself is a string, use it directly
        transcript = webhookData.data;
      } else if (typeof webhookData === 'string') {
        // If the whole payload is a string, use it
        transcript = webhookData;
      } else {
        // Last resort: stringify the entire payload
        console.log('Could not find transcript in expected fields, using full payload');
        transcript = JSON.stringify(webhookData);
      }
      
      if (transcript) {
        // Check if parallel execution is enabled
        const runParallel = webhookData.processorConfig?.parallel !== false;
        console.log(`Using ${runParallel ? 'parallel' : 'sequential'} execution mode for agent requests`);
        
        return await processMeetingTranscript(transcript, runParallel);
      } else {
        console.log('Could not extract transcript from webhook data');
        return { success: false, results: {} };
      }
    } else {
      // For other webhook types, we'd have similar flexible handling
      console.log(`Unknown webhook ID: ${webhookId}, treating as raw data`);
      
      // Try to extract any string data we can use
      let rawData = null;
      if (typeof webhookData.data === 'string') {
        rawData = webhookData.data;
      } else if (webhookData.data && typeof webhookData.data.content === 'string') {
        rawData = webhookData.data.content;
      } else if (typeof webhookData === 'string') {
        rawData = webhookData;
      } else {
        rawData = JSON.stringify(webhookData);
      }
      
      // For now, just process it as a meeting transcript
      // Default to sequential mode for unknown webhook types
      const runParallel = webhookData.processorConfig?.parallel !== false;
      return await processMeetingTranscript(rawData, runParallel);
    }
  } catch (error) {
    console.error('Error processing webhook data:', error);
    return { success: false, results: {} };
  }
}

/**
 * Process a meeting transcript
 */
async function processMeetingTranscript(transcript: string, runParallel: boolean = true): Promise<{success: boolean, results: Record<string, any>}> {
  console.log(`Processing meeting transcript (mode: ${runParallel ? 'parallel' : 'sequential'})`);
  
  try {
    // Extract tasks for each agent
    const tasks = extractTasksFromTranscript(transcript);
    const results: Record<string, any> = {};
    
    if (runParallel) {
      // PARALLEL MODE: Use Promise.all to process all agents concurrently
      console.log('Running sub-agent calls in parallel mode');
      
      // Create an array of promises for parallel execution
      const agentPromises = Object.entries(tasks).map(async ([agentType, message]) => {
        try {
          console.log(`Sending task to ${agentType} agent`);
          const result = await sendRequestToAgent(agentType as keyof typeof agentUrls, message);
          return { agentType, result, success: true };
        } catch (error) {
          console.error(`Error sending task to ${agentType} agent:`, error);
          return { 
            agentType, 
            result: { success: false, error: String(error), files: new Map<string, string>() },
            success: false 
          };
        }
      });
      
      // Wait for all agent requests to complete in parallel
      const agentResults = await Promise.all(agentPromises);
      
      // Collect results
      for (const { agentType, result } of agentResults) {
        results[agentType] = result;
      }
    } else {
      // SEQUENTIAL MODE: Process each agent in sequence
      console.log('Running sub-agent calls in sequential mode');
      
      // Send tasks to each agent sequentially
      for (const [agentType, message] of Object.entries(tasks)) {
        try {
          console.log(`Sending task to ${agentType} agent`);
          const result = await sendRequestToAgent(agentType as keyof typeof agentUrls, message);
          results[agentType] = result;
        } catch (error) {
          console.error(`Error sending task to ${agentType} agent:`, error);
          results[agentType] = { success: false, error: String(error) };
        }
      }
    }
    
    return { success: true, results };
  } catch (error) {
    console.error('Error processing meeting transcript:', error);
    return { success: false, results: {} };
  }
}

/**
 * Send a request to an agent
 */
async function sendRequestToAgent(
  agentType: keyof typeof agentUrls, 
  message: string
): Promise<{ success: boolean, files: Map<string, string> }> {
  console.log(`\n=== Communicating with ${agentType.toUpperCase()} Agent ===`);
  console.log(`Message: ${message}`);
  
  // Initialize the client
  const serverUrl = agentUrls[agentType];
  const client = new A2AClient(serverUrl);
  let agentName = `${agentType.charAt(0).toUpperCase() + agentType.slice(1)} Agent`; // Default name
  
  try {
    // Try to fetch the agent card
    try {
      const agentCard = await client.agentCard();
      console.log(`\n✨ Connected to agent: ${agentCard.name} (${agentCard.version || 'Unknown version'})`);
      if (agentCard.description) {
        console.log(`📝 Description: ${agentCard.description}`);
      }
      agentName = agentCard.name;
    } catch (error) {
      console.log(`\n⚠️ Couldn't fetch agent card, using default name: ${agentName}`);
      console.log(`🔗 Connected to agent at: ${serverUrl}`);
    }
    
    // Generate a random task ID
    const taskId = crypto.randomUUID();
    console.log(`\n📋 Task ID: ${taskId}`);
    
    // Construct the request parameters
    const params: TaskSendParams = {
      id: taskId,
      message: {
        role: "user",
        parts: [{ type: "text", text: message }],
      },
    };
    
    console.log(`\n🚀 Sending request to ${agentName}...`);
    
    // Send the task and subscribe to updates
    const stream = client.sendTaskSubscribe(params);
    
    let receivedFiles = new Map<string, string>();
    let fileOrder: string[] = [];
    
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
          
          // Track file order if not already in the list
          if (!fileOrder.includes(artifact.name)) {
            fileOrder.push(artifact.name);
          }
          
          console.log(`📝 Content (preview): ${content.substring(0, 50)}${content.length > 50 ? '...' : ''}`);
        }
      }
    }
    
    console.log("\n✅ Stream completed");
    // console.log(`\n📦 Received ${receivedFiles.size} files: ${Array.from(receivedFiles.keys()).join(', ')}`);
    
    // Save all received files to an agent-specific subdirectory
    const agentOutputDir = path.join(outputDir, agentType);
    await fs.mkdir(agentOutputDir, { recursive: true });
    
    for (const [filename, content] of receivedFiles.entries()) {
      const filePath = path.join(agentOutputDir, filename);
      await fs.writeFile(filePath, content);
      console.log(`💾 Saved ${filename} to ${filePath}`);
    }
    
    console.log(`\n✅ Communication with ${agentName} completed successfully!`);
    return {
      success: true,
      files: receivedFiles
    };
  } catch (error) {
    console.error(`\n❌ Error communicating with ${agentName}:`, error);
    return {
      success: false,
      files: new Map<string, string>()
    };
  }
} 