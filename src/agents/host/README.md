# Host A2A Agent

The Host Agent is the central router in the multi-agent system, intelligently directing user requests to specialized agents for Slack, GitHub, and Salesforce.

## Key Features

- **Smart Request Routing**: Uses both pattern matching and LLM-based routing for maximum efficiency
- **Intelligent Delegation**: Understands user intent and routes to the appropriate specialized agent
- **Multi-Agent Coordination**: Can process requests that involve multiple agents
- **A2A Protocol**: Fully compatible with the A2A (Agent-to-Agent) communication protocol

## Setup

Ensure you have the required environment variables in your `.env` file:
```
MCP_SERVER_URL=your_zapier_mcp_server_url
GEMINI_API_KEY=your_gemini_api_key  # Required for LLM-based routing
```

## Starting the System

### 1. Starting All Agents

For optimal functionality, start all agents at once:

```bash
npm run start:all
```

This command starts the Host Agent and all three specialized agents in the background, directing logs to the `logs/` directory.

### 2. Interacting with the Host Agent

After starting all agents, use the CLI to interact with the Host Agent:

```bash
npm run a2a:cli
```

### 3. Stopping All Agents

When finished, stop all agents:

```bash
npm run stop:all
```

## Example Prompts

The Host Agent works with a variety of request formats:

### Simple Requests (Pattern-Matched)
- "slack" - Routes to Slack agent
- "github" - Routes to GitHub agent
- "salesforce" - Routes to Salesforce agent

### Service-Specific Requests
- **Slack**: "Send a message to #general saying Hello world"
- **GitHub**: "Create an issue in myrepo with title 'Bug Report'"
- **Salesforce**: "Create a Contact with FirstName John LastName Doe"

### Complex/Multi-Agent Requests (LLM-Routed)
- "Send a Slack message and then create a GitHub issue about it"
- "Find a Salesforce contact and post their email to Slack"

## Host Agent Architecture

The Host Agent uses a layered approach to routing:

1. **First Layer**: Direct pattern matching for quick routing of common requests
2. **Second Layer**: LLM-based analysis using Gemini for complex requests
3. **Final Layer**: A2A protocol communication with sub-agents

## Technical Details

The Host Agent runs on port 41240 and connects to:
- Slack Agent: port 41243
- Salesforce Agent: port 41244
- GitHub Agent: port 41245 

## Agent Communication Flow

```
User Request → CLI → Host Agent → [Pattern Matching or LLM Routing] → Sub-Agent → External Service
```

## Logs and Debugging

Agent logs are stored in:
```
logs/host-agent.log
logs/slack-agent.log
logs/github-agent.log
logs/salesforce-agent.log
``` 