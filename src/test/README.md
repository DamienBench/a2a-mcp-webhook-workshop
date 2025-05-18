# A2A-MCP Test Scripts

This directory contains test scripts for the A2A (Agent-to-Agent) implementation with MCP (Model Context Protocol) integration.

## Individual Agent Tests

- `test-github-agent.sh` - Test the GitHub agent functionality
- `test-slack-agent.sh` - Test the Slack agent functionality
- `test-salesforce-agent.sh` - Test the Salesforce agent functionality

## Multi-Agent Tests

- `run-bench-test.sh` - Starts all three agents and runs the bench test simulation
- `bench-test-all-agents.ts` - TypeScript implementation of the bench test (simulated sales discovery call)

## Utility Scripts

- `start-all-agents.sh` - Starts all three agents in separate terminal windows
- `stop-all-agents.sh` - Stops all running agents
- `run-slack-agent.sh` - Runs the Slack agent with customizable messages

## Usage Examples

### Running the Bench Test

```bash
# Run the complete bench test
./src/test/run-bench-test.sh

# The test will start all agents on their respective ports:
# - Slack Agent: Port 41243
# - Salesforce Agent: Port 41244
# - GitHub Agent: Port 41245
```

### Testing Individual Agents

```bash
# Test GitHub agent with a custom message
./src/test/test-github-agent.sh "Create an issue with title 'Test Issue' and body 'This is a test issue'"

# Test Slack agent with default message
./src/test/test-slack-agent.sh

# Test Salesforce agent operations
./src/test/test-salesforce-agent.sh "Create a lead with name: Test User, company: Test Corp"
```

### Running Slack Agent

```bash
# Run Slack agent with a custom message
./src/test/run-slack-agent.sh "Send a message to #general saying 'Hello from the MCP integration'"

# Run with default message
./src/test/run-slack-agent.sh
```