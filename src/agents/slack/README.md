# Slack A2A Agent

This agent allows you to send messages to Slack channels using A2A (Agent-to-Agent) communication with MCP (Model Context Protocol).

## Prerequisites

This agent requires the following Zapier MCP tool to be configured:

**Required Zapier MCP Tool:**
- **Send Channel Message** - Enables sending messages to Slack channels

**Setup:**
1. Configure the "Send Channel Message" tool in your [Zapier MCP account](https://mcp.zapier.com/mcp/servers)
2. Connect your Slack workspace to Zapier
3. Copy the SSE MCP server URL from Zapier

## Setup

Ensure you have the MCP Server URL configured in your `.env` file:

```
MCP_SERVER_URL=your_zapier_mcp_server_url
SLACK_CHANNEL=#your-slack-channel
```

The Zapier MCP Server handles the Slack integration using the "Send Channel Message" tool. The `SLACK_CHANNEL` environment variable specifies which channel messages will be sent to (defaults to `#general` if not set).

## Usage

Run the agent directly with a command:

```bash
npm run agent:slack "Send a message to #general saying: Hello from the Slack agent"
```

Or start it as part of the Host Agent system:

```bash
npm run start:all
```

Then use the CLI to interact with the Host Agent, which will delegate to this Slack agent when needed:

```bash
npm run a2a:cli
```

## Testing

Run the test script to verify the Slack agent works correctly:

```bash
npm run test:slack
```

This will send a test message to a designated Slack channel through the Zapier MCP integration. 