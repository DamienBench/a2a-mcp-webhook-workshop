# A2A-MCP Integration Workshop

This project demonstrates how to build a multi-agent system using Agent-to-Agent (A2A) communication with the Model Context Protocol (MCP).

## Overview

The repository contains:

1. A Host Agent that intelligently routes user requests to specialized sub-agents
2. Three specialized agents:
   - **Slack Agent**: Send messages to Slack channels
   - **GitHub Agent**: Create issues in GitHub repositories
   - **Salesforce Agent**: Create, find, and update Salesforce records

Each agent connects to its respective service via the Zapier MCP Server, allowing seamless integration without direct API access.

## Architecture

```
┌─────────────┐     ┌───────────────┐
│             │     │ Slack Agent   │
│             ├────►│ (Port 41243)  │──► Slack Channels
│ Host Agent  │     └───────────────┘
│ (Port 41240)│     ┌───────────────┐
│             ├────►│ GitHub Agent  │──► GitHub Issues
│  CLI        │     │ (Port 41245)  │
│  Interface  │     └───────────────┘
│             │     ┌───────────────┐
│             ├────►│ Salesforce    │──► Salesforce
└─────────────┘     │ Agent         │    Records
                    │ (Port 41244)  │
                    └───────────────┘
```

## Getting Started

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Configure your `.env` file with:
   ```
   MCP_SERVER_URL=your_zapier_mcp_server_url
   GEMINI_API_KEY=your_gemini_api_key
   ```

## Running the Agents

### Start All Agents

```bash
npm run start:all
```

This starts:
- Host Agent on port 41240
- Slack Agent on port 41243
- GitHub Agent on port 41245
- Salesforce Agent on port 41244

All agents run in the background, with logs stored in the `logs/` directory.

### Chat with the Host Agent

After starting all agents, you can interact with the system through the Host Agent:

```bash
npm run a2a:cli
```

The Host Agent intelligently routes your requests to the appropriate specialized agent:

Example prompts:
- **Slack**: "Send a message to the #general channel saying Hello world"
- **GitHub**: "Create a GitHub issue in myrepo with title 'Bug Report'"
- **Salesforce**: "Create a new Contact in Salesforce with name John Smith"
- **Multiple Services**: "Send hi to Slack and create a GitHub issue about the message"

### Stop All Agents

To stop all running agents:

```bash
npm run stop:all
```

### Run Individual Agents

You can also run and test agents individually:

```bash
# Run Host agent only
npm run host:agent

# Run Slack agent with direct message
npm run agent:slack "Send a message to #general saying Hello"

# Run GitHub agent with direct message
npm run agent:github "Create an issue in repo/name with title 'Test'"

# Run Salesforce agent with direct message
npm run agent:salesforce "Create a Contact with FirstName John LastName Doe"
```

## Testing

Individual agent tests:

```bash
npm run test:slack
npm run test:github
npm run test:salesforce
```

Test the Host Agent with all sub-agents:

```bash
npm run test:host
```

## Agent Documentation

Each agent has its own detailed documentation:
- [Host Agent](src/host/README.md)
- [Slack Agent](src/agents/slack/README.md)
- [GitHub Agent](src/agents/github/README.md)
- [Salesforce Agent](src/agents/salesforce/README.md)
