#!/bin/bash

# Stop all A2A agents
echo "Stopping all A2A agents..."

# Function to stop a process by PID file
stop_process() {
    local name=$1
    local pidfile=$2
    
    if [ -f "$pidfile" ]; then
        local pid=$(cat "$pidfile")
        if ps -p $pid > /dev/null 2>&1; then
            echo "Stopping $name (PID: $pid)..."
            kill $pid
            sleep 1
            
            # Force kill if still running
            if ps -p $pid > /dev/null 2>&1; then
                echo "Force stopping $name..."
                kill -9 $pid
            fi
            echo "$name stopped"
        else
            echo "$name was not running"
        fi
        rm -f "$pidfile"
    else
        echo "No PID file found for $name"
    fi
}

# Stop all agents
stop_process "Host Agent" "logs/host-agent.pid"
stop_process "Slack Agent" "logs/slack-agent.pid"
stop_process "GitHub Agent" "logs/github-agent.pid"
stop_process "Bench Agent" "logs/bench-agent.pid"
stop_process "Webhook Server" "logs/webhook-server.pid"

# Also kill any remaining processes on the ports (backup cleanup)
echo ""
echo "Cleaning up any remaining processes..."

# Kill processes on agent ports
for port in 41240 41241 41243 41245 41246 3000; do
    pid=$(lsof -t -i:$port 2>/dev/null)
    if [ ! -z "$pid" ]; then
        echo "Killing process on port $port (PID: $pid)"
        kill $pid 2>/dev/null || kill -9 $pid 2>/dev/null
    fi
done

echo ""
echo "All agents stopped successfully!"
echo "Log files are preserved in the logs/ directory" 