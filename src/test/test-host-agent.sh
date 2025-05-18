#!/bin/bash

# Function to kill processes on specific ports
function cleanup {
  echo "Stopping all agents..."
  for port in 41243 41244 41245; do
    pid=$(lsof -t -i:$port 2>/dev/null)
    if [ ! -z "$pid" ]; then
      echo "Killing process on port $port (PID: $pid)"
      kill $pid 2>/dev/null
    fi
  done
  exit 0
}

# Set up trap to clean up on exit
trap cleanup EXIT INT TERM

# Change to the project root directory
cd "$(dirname "$0")/../.."

# Create a logs directory if it doesn't exist
mkdir -p logs

echo "===== Starting Bench Test with MCP Integration ====="

# Start each agent in the background
echo "Starting Slack Agent..."
npx tsx src/agents/slack/index.ts > logs/slack-agent.log 2>&1 &
echo "Slack Agent started on port 41243"

echo "Starting Salesforce Agent..."
npx tsx src/agents/salesforce/index.ts > logs/salesforce-agent.log 2>&1 &
echo "Salesforce Agent started on port 41244"

echo "Starting GitHub Agent..."
npx tsx src/agents/github/index.ts > logs/github-agent.log 2>&1 &
echo "GitHub Agent started on port 41245"

# Give the agents time to start up
echo "Waiting for agents to start up..."
sleep 5

# Run the Bench Test
echo "Running Bench Test with all agents..."
npx tsx src/test/host-agent-test.ts

# Keep agents running for a bit to complete any pending operations
echo "Waiting for operations to complete..."
sleep 5

echo "===== Bench Test Complete =====" 