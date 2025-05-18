#!/bin/bash

# Script to stop all running agents

# Change to the project root directory
cd "$(dirname "$0")/../.."

echo "Stopping all agents..."

# Function to stop an agent using its PID file
function stop_agent() {
  local agent_name="$1"
  local pid_file="logs/${agent_name}-agent.pid"
  
  if [ -f "$pid_file" ]; then
    local pid=$(cat "$pid_file")
    if ps -p $pid > /dev/null; then
      echo "Stopping $agent_name Agent (PID: $pid)..."
      kill $pid
      sleep 1
      
      # Check if it's still running and force kill if necessary
      if ps -p $pid > /dev/null; then
        echo "Force killing $agent_name Agent..."
        kill -9 $pid
      fi
      
      echo "$agent_name Agent stopped."
      rm "$pid_file"
    else
      echo "$agent_name Agent not running (PID $pid not found)."
      rm "$pid_file"
    fi
  else
    echo "No PID file found for $agent_name Agent."
    
    # Fallback to port-based killing for the specific agent
    case "$agent_name" in
      "slack")     kill_port 41243 "Slack" ;;
      "salesforce") kill_port 41244 "Salesforce" ;;
      "github")    kill_port 41245 "GitHub" ;;
      "host")      kill_port 41241 "Host" ;;
    esac
  fi
}

# Function to kill a process running on a specific port (fallback method)
function kill_port {
  local port=$1
  local agent_name=$2
  
  if lsof -i:$port > /dev/null 2>&1; then
    local pid=$(lsof -t -i:$port)
    if [ ! -z "$pid" ]; then
      echo "Stopping $agent_name Agent (PID: $pid) on port $port..."
      kill $pid
      sleep 1
      
      # Check if it's still running and force kill if necessary
      if lsof -i:$port > /dev/null 2>&1; then
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

# Stop each agent using its PID file
stop_agent "slack"
stop_agent "salesforce"
stop_agent "github"
stop_agent "host"

echo "All agents stopped." 