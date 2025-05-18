# Slack A2A Agent

This agent allows you to send messages to Slack channels using A2A (Agent-to-Agent) communication with MCP (Model Context Protocol).

## Setup

Ensure you have the MCP Server URL configured in your `.env` file. The Zapier MCP Server handles the Slack integration.

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

This will send a test message to a designated Slack channel. 