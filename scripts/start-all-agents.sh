#!/bin/bash

# Smart start script - only starts agents configured with localhost
echo "Starting A2A agents (localhost only)..."

# Create logs directory if it doesn't exist
mkdir -p logs

# Function to check if an agent URL is localhost
is_localhost() {
    local url=$1
    if [[ "$url" == *"localhost"* ]] || [[ "$url" == *"127.0.0.1"* ]]; then
        return 0  # true
    else
        return 1  # false
    fi
}

# Function to get agent URL from .env or default
get_agent_url() {
    local agent_type=$1
    local default_url=$2
    local env_var="${agent_type}_AGENT_URL"
    
    # Check if .env file exists and has the variable
    if [ -f ".env" ]; then
        local env_value=$(grep "^${env_var}=" .env | cut -d'=' -f2- | tr -d '"' | tr -d "'")
        if [ ! -z "$env_value" ]; then
            echo "$env_value"
            return
        fi
    fi
    
    # Return default if not found in .env
    echo "$default_url"
}

# Function to start an agent if it's localhost
start_agent_if_localhost() {
    local name=$1
    local agent_type=$2
    local default_url=$3
    local npm_script=$4
    local log_file=$5
    local pid_file=$6
    
    local url=$(get_agent_url "$agent_type" "$default_url")
    
    if is_localhost "$url"; then
        echo "Starting $name (configured: $url)..."
        nohup npm run $npm_script > logs/$log_file 2>&1 &
        echo $! > logs/$pid_file
        echo "$name started (PID: $(cat logs/$pid_file))"
        return 0
    else
        echo "Skipping $name (using remote: $url)"
        return 1
    fi
}

# Track which agents were started
started_agents=()

# Check and start each agent
if start_agent_if_localhost "Host Agent" "HOST" "http://localhost:41240" "host:agent" "host-agent.log" "host-agent.pid"; then
    started_agents+=("Host Agent: http://localhost:41240")
fi

if start_agent_if_localhost "Slack Agent" "SLACK" "http://localhost:41243" "agent:slack" "slack-agent.log" "slack-agent.pid"; then
    started_agents+=("Slack Agent: http://localhost:41243")
fi

if start_agent_if_localhost "GitHub Agent" "GITHUB" "http://localhost:41245" "agent:github" "github-agent.log" "github-agent.pid"; then
    started_agents+=("GitHub Agent: http://localhost:41245")
fi

if start_agent_if_localhost "Bench Agent" "BENCH" "http://localhost:41246" "agent:bench" "bench-agent.log" "bench-agent.pid"; then
    started_agents+=("Bench Agent: http://localhost:41246")
fi

# Always start webhook server (it's always local)
echo "Starting Webhook Server..."
nohup npm run webhook:server > logs/webhook-server.log 2>&1 &
echo $! > logs/webhook-server.pid
echo "Webhook Server started (PID: $(cat logs/webhook-server.pid))"
started_agents+=("Webhook Server: http://localhost:3000")

# Wait a moment for processes to start
sleep 2

echo ""
echo "Started ${#started_agents[@]} services:"
for agent in "${started_agents[@]}"; do
    echo "- $agent"
done

echo ""
echo "Logs are available in the logs/ directory"
echo "Use 'npm run stop:all' to stop all agents"
echo "Use 'npm run a2a:cli' to interact with the Host Agent" 