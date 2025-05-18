import { A2AClient } from "../a2a/client/client.js";
import { TaskSendParams, TaskStatusUpdateEvent, TaskArtifactUpdateEvent } from "../schema.js";
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

// Get the directory name of the current file
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.join(__dirname, 'output');

// Agent URLs
const agentUrls = {
  slack: "http://localhost:41243",
  salesforce: "http://localhost:41244",
  github: "http://localhost:41245"
};

/**
 * Function to send a request to an agent and process the response
 */
async function sendRequestToAgent(
  agentType: keyof typeof agentUrls, 
  message: string
): Promise<{ success: boolean, files: Map<string, string> }> {
  console.log(`\n=== Communicating with ${agentType.toUpperCase()} Agent ===`);
  console.log(`Message: ${message}`);
  
  // Initialize the client
  const serverUrl = process.env[`${agentType.toUpperCase()}_AGENT_URL`] || agentUrls[agentType];
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
        const update = event as TaskStatusUpdateEvent;
        console.log(`\n📊 Status: ${update.status.state}`);
        
        if (update.status.message) {
          console.log(`💬 Message: ${update.status.message.parts
            .filter(part => 'text' in part)
            .map(part => (part as any).text)
            .join('\n')}`);
        }
      } else if ("artifact" in event) {
        // Artifact update event (file)
        const update = event as TaskArtifactUpdateEvent;
        const artifact = update.artifact;
        
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

/**
 * Function to simulate a meeting transcript of a sales discovery call
 */
function getMeetingTranscript(): string {
  const now = new Date().toLocaleDateString();
  
  return `
Meeting Transcript: Sales Discovery Call with Bench - ${now}

Participants:
- Alex Rodriguez (Account Executive, Acme Labs)
- Jennifer Williams (Head of AI, Bench)
- Michael Chen (CTO, Bench)

Alex: Good morning Jennifer and Michael! Thank you for taking the time to discuss how Acme Labs' AI Agent platform could help Bench with your automation needs.

Jennifer: Thanks for having us, Alex. We're really interested in exploring AI agent solutions. At Bench, we're looking to automate a lot of our customer interaction workflows.

Michael: Yes, we've been evaluating several platforms, and Acme's caught our attention after seeing the demo at the AI Summit last month.

Alex: That's great to hear! Let's start by understanding your current pain points and what you're looking to achieve with an AI agent platform.

Jennifer: Our customer service team is overwhelmed with repetitive tasks. We want to automate responses to common inquiries, escalate complex issues to the right departments, and ensure nothing falls through the cracks.

Michael: From a technical perspective, we've noticed your platform has an interesting approach to conversational agents. However, we did encounter what seems like a bug during our trial - when we try to connect multiple agents in a workflow, the message passing occasionally fails and the context is lost between agents.

Alex: That's concerning. Could you provide more details about when this happens?

Michael: It specifically occurs when we have more than three agents in a sequence and the conversation has more than 10 turns. The messages seem to get truncated and the context is lost. I can send you the logs after this call.

Alex: I appreciate you bringing this to our attention. I'll create a bug report immediately and get our engineering team to look into it. This is definitely a critical issue for multi-agent workflows.

Jennifer: While we're discussing improvements, we'd also love to see better integration with our existing tools. We use Slack extensively for team communication and Salesforce for our CRM. It would be amazing if after meetings like this, your AI agents could automatically update both systems with summaries and action items.

Alex: That's a great feature request! Automating post-meeting updates to both Slack and Salesforce would save teams a lot of time. I'll share this with our product team right away.

Michael: Would this be something on your near-term roadmap? This would be a deciding factor for us.

Alex: I can't promise specific timelines, but given the demand we're seeing for better integrations, I'd say this is definitely a priority. I'll push to get this on our next quarterly planning session.

Jennifer: That sounds promising. Can you tell us more about your pricing model for enterprise customers like us?

Alex: Absolutely. For companies of your size, we offer a tailored enterprise package. Our standard enterprise tier starts at $2,500 per month for up to 50 agents and 10,000 conversations.

Jennifer: And what about implementation support and training?

Alex: We provide full white-glove onboarding, including 2 weeks of dedicated implementation support and training for your team. We also assign a dedicated customer success manager for the first 3 months.

Michael: That's helpful. We're definitely interested in moving forward with further discussions.

Alex: Great! I'll send over a detailed proposal next week. Before we wrap up, would it be helpful to schedule a technical deep dive with our engineering team?

Jennifer: Yes, that would be very valuable. Our engineering team would appreciate that.

Alex: Perfect! I'll coordinate and get that scheduled. Thank you both for your time today. It's been great learning more about Bench's needs and how we can support your automation journey.

Jennifer: Thank you, Alex. We look forward to the proposal and next steps.

Michael: Thanks, and please do create that bug report so we can track the progress on that issue.

Alex: Will do. I'll handle that right after our call, along with sharing your feature request with our product team. Have a great day!
  `;
}

/**
 * Process the transcript and extract tasks for each agent
 * This function analyzes the meeting transcript to determine what 
 * information should be sent to each agent
 */
function extractTasksFromTranscript(transcript: string): Record<keyof typeof agentUrls, string> {
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
                `3. An Opportunity named: Bench - AI Agent Platform, stage: Discovery, amount: $30,000`
  };
}

/**
 * Main function to test all agents with the sales discovery call transcript
 */
async function testAllAgentsWithTranscript() {
  console.log("===== Bench Test - Sales Discovery Call Integration Test =====");
  console.log("This test simulates a sales discovery call with tasks for all agents.");
  
  // Ensure the output directory exists
  try {
    await fs.mkdir(outputDir, { recursive: true });
    console.log(`✅ Created output directory at ${outputDir}`);
  } catch (error) {
    console.error("❌ Failed to create output directory:", error);
    process.exit(1);
  }
  
  // Generate the meeting transcript
  const transcript = getMeetingTranscript();
  console.log("\n===== Meeting Transcript =====");
  console.log(transcript);
  
  // Extract tasks for each agent by analyzing the transcript
  const tasks = extractTasksFromTranscript(transcript);
  
  let results = [];
  
  // Process each agent type
  for (const [agentType, task] of Object.entries(tasks)) {
    try {
      const result = await sendRequestToAgent(agentType as keyof typeof agentUrls, task);
      results.push({
        agent: agentType,
        success: result.success,
        fileCount: result.files.size
      });
    } catch (err) {
      console.error(`\n❌ Error testing ${agentType} agent:`, err);
      results.push({
        agent: agentType,
        success: false,
        fileCount: 0
      });
    }
  }
  
  // Print a summary of the tests
  console.log("\n===== Test Summary =====");
  for (const result of results) {
    console.log(`${result.agent.toUpperCase()}: ${result.success ? '✅ Success' : '❌ Failed'} (${result.fileCount} files)`);
  }
}

// Run the main test function
testAllAgentsWithTranscript().catch(err => {
  console.error("❌ Unhandled error:", err);
  process.exit(1);
}); 