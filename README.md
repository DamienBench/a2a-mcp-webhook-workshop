# A2A-MCP Integration

This project demonstrates the integration of the Agent-to-Agent (A2A) communication framework with the Model Context Protocol (MCP).

## Overview

The project includes three agent implementations:

- **Slack Agent**: Send messages to Slack channels
- **GitHub Agent**: Create and manage GitHub issues
- **Salesforce Agent**: Create, find, and update Salesforce records

Each agent is implemented using MCP tools for better interoperability and structured interaction with foundational models.

## Project Structure

- `src/agents/` - Contains implementations for each agent
- `src/mcp/` - MCP tool implementations for each platform
- `src/test/` - Test scripts and utilities for all agents

## Getting Started

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file with the required API keys:
   ```
   GEMINI_API_KEY=your_gemini_api_key
   SLACK_TOKEN=your_slack_token
   GITHUB_TOKEN=your_github_token
   MCP_SERVER_URL=your_mcp_server_url
   ```

## Running Tests

### Individual Agent Tests

```bash
# Test Slack agent
./src/test/test-slack-agent.sh

# Test GitHub agent 
./src/test/test-github-agent.sh

# Test Salesforce agent
./src/test/test-salesforce-agent.sh
```

### Multi-Agent Integration Test

The bench test simulates a sales discovery call and demonstrates how all three agents can work together:

```bash
./src/test/run-bench-test.sh
```

For more information about the test scripts, see [Test Documentation](src/test/README.md).

## License

This project is sample code and not production-quality libraries.
