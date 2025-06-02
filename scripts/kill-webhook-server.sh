#!/bin/bash

# Kill webhook server specifically
echo "Stopping Webhook Server..."

# Function to stop a process by PID file
stop_webhook() {
    if [ -f "logs/webhook-server.pid" ]; then
        local pid=$(cat "logs/webhook-server.pid")
        if ps -p $pid > /dev/null 2>&1; then
            echo "Stopping Webhook Server (PID: $pid)..."
            kill $pid
            sleep 1
            
            # Force kill if still running
            if ps -p $pid > /dev/null 2>&1; then
                echo "Force stopping Webhook Server..."
                kill -9 $pid
            fi
            echo "Webhook Server stopped"
        else
            echo "Webhook Server was not running"
        fi
        rm -f "logs/webhook-server.pid"
    else
        echo "No PID file found for Webhook Server"
    fi
}

# Stop webhook server
stop_webhook

# Also kill any process on port 3000 (backup cleanup)
pid=$(lsof -t -i:3000 2>/dev/null)
if [ ! -z "$pid" ]; then
    echo "Killing process on port 3000 (PID: $pid)"
    kill $pid 2>/dev/null || kill -9 $pid 2>/dev/null
    echo "Port 3000 cleaned up"
fi

echo "Webhook Server stopped successfully!" 