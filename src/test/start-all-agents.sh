#!/bin/bash

# Change to the project root directory
cd "$(dirname "$0")/../.."

# Create a logs directory if it doesn't exist
mkdir -p logs

echo "Starting all agents in separate terminals..."

# Check if required environment variables are set
if [ ! -f ".env" ]; then
  echo "Error: .env file not found. Please create it with required environment variables."
  exit 1
fi

# Create a function to start an agent in a new terminal
function start_agent() {
  local agent_name="$1"
  local port="$2"
  local log_file="logs/${agent_name}-agent.log"
  
  # Clear previous log file
  echo "" > "$log_file"
  
  echo "Starting $agent_name Agent on port $port..."
  osascript -e "tell application \"Terminal\" to do script \"cd $(pwd) && npx tsx src/agents/$agent_name/index.ts > $log_file 2>&1\""
  echo "$agent_name Agent started in a new terminal window. Log file: $log_file"
}

# Start each agent in a new terminal
start_agent "slack" "41243"
start_agent "salesforce" "41244"
start_agent "github" "41245"

echo "All agents started. Check the terminal windows and log files for details." 