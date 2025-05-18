# GitHub A2A Agent

This agent allows you to create GitHub issues using A2A (Agent-to-Agent) communication with MCP (Model Context Protocol).

## Setup

Ensure you have the MCP Server URL configured in your `.env` file. The Zapier MCP Server handles the GitHub integration.

## Usage

Run the agent directly with a command:

```bash
npm run agent:github "Create a GitHub issue in repo owner/repo with title 'Test Issue' and description 'This is a test issue'"
```

Or start it as part of the Host Agent system:

```bash
npm run start:all
```

Then use the CLI to interact with the Host Agent, which will delegate to this GitHub agent when needed:

```bash
npm run a2a:cli
```

## Testing

Run the test script to verify the GitHub agent works correctly:

```bash
npm run test:github
```

This will create a test issue in the specified GitHub repository. 