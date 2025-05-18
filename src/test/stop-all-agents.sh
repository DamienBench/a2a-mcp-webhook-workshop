#!/bin/bash

# Script to stop all running agents

# Function to check if a process is running on a specific port
function is_port_in_use {
  lsof -i:$1 > /dev/null 2>&1
  return $?
}

# Function to kill a process running on a specific port
function kill_port {
  local port=$1
  local agent_name=$2
  
  if is_port_in_use $port; then
    local pid=$(lsof -t -i:$port)
    if [ ! -z "$pid" ]; then
      echo "Stopping $agent_name Agent (PID: $pid) on port $port..."
      kill $pid
      sleep 1
      
      # Check if it's still running and force kill if necessary
      if is_port_in_use $port; then
        echo "Force killing $agent_name Agent..."
        kill -9 $pid
      fi
      
      echo "$agent_name Agent stopped."
    else
      echo "No process found running on port $port."
    fi
  else
    echo "$agent_name Agent not running on port $port."
  fi
}

# Directory of the script
cd "$(dirname "$0")/../.."

echo "Stopping all agents..."

# Stop each agent by port
kill_port 41243 "Slack"
kill_port 41244 "Salesforce"
kill_port 41245 "GitHub"

echo "All agents stopped." 