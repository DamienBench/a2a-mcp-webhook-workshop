# Salesforce A2A Agent

This agent allows you to interact with Salesforce records (create, find, update) using A2A (Agent-to-Agent) communication with MCP (Model Context Protocol).

## Setup

Ensure you have the MCP Server URL configured in your `.env` file. The Zapier MCP Server handles the Salesforce integration.

## Usage

Run the agent directly with a command:

```bash
npm run agent:salesforce "Create a Contact record with FirstName 'Test' and LastName 'User'"
```

Or start it as part of the Host Agent system:

```bash
npm run start:all
```

Then use the CLI to interact with the Host Agent, which will delegate to this Salesforce agent when needed:

```bash
npm run a2a:cli
```

## Testing

Run the test script to verify the Salesforce agent works correctly:

```bash
npm run test:salesforce
```

This will create a test record in your Salesforce instance. 