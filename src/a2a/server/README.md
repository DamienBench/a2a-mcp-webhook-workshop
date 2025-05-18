# Host A2A Agent

This is the main Host Agent that routes user requests to the appropriate specialized agents (Slack, GitHub, Salesforce).

## Setup

Ensure you have the MCP Server URL configured in your `.env` file:
```
MCP_SERVER_URL=your_zapier_mcp_server_url
```

## Usage

Start the Host Agent:

```bash
npm run host:agent
```

To chat with the Host Agent, use the CLI:

```bash
npm run a2a:cli
```

Example prompts:
- "Send a message to #general in Slack saying Hello world"
- "Create a GitHub issue in owner/repo with title 'Bug Report' and description 'Please fix this'"
- "Create a new Contact in Salesforce with FirstName 'John' and LastName 'Smith'"

## Starting All Agents

For the Host Agent to work properly, all sub-agents need to be running. You can start all agents (including the Host Agent) with:

```bash
npm run start:all
```

To stop all running agents:

```bash
npm run stop:all
```

## Testing

Test the Host Agent with all sub-agents:

```bash
npm run test:host
```
