#!/bin/bash

# Change to the project root directory
cd "$(dirname "$0")/../.."

# Create a logs directory if it doesn't exist
mkdir -p logs

echo "Starting Host Agent and all sub-agents in background processes..."

# Check if required environment variables are set
if [ ! -f ".env" ]; then
  echo "Error: .env file not found. Please create it with required environment variables."
  exit 1
fi

# Create a function to start an agent in the background
function start_agent() {
  local agent_name="$1"
  local port="$2"
  local command="$3"
  local log_file="logs/${agent_name}-agent.log"
  
  # Clear previous log file
  echo "" > "$log_file"
  
  echo "Starting $agent_name Agent on port $port..."
  # Start the agent in the background and redirect output to log file
  $command > "$log_file" 2>&1 &
  
  # Save the PID to a file for later cleanup
  echo $! > "logs/${agent_name}-agent.pid"
  echo "$agent_name Agent started in background with PID $!. Log file: $log_file"
}

# First start the Host Agent
start_agent "host" "41241" "npx tsx src/host/index.ts"
sleep 2  # Give the Host Agent a moment to start

# Then start the sub-agents
start_agent "slack" "41243" "npx tsx src/agents/slack/index.ts"
start_agent "salesforce" "41244" "npx tsx src/agents/salesforce/index.ts"
start_agent "github" "41245" "npx tsx src/agents/github/index.ts"

echo "Host Agent and all sub-agents started in the background."
echo "To chat with the Host Agent, run: npm run a2a:cli"
echo "To stop all agents, run: npm run stop:all" 