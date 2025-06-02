#!/bin/bash

# Test if Bench agent is reachable
echo "Testing Bench Agent connectivity..."

# Function to get agent URL from .env or default
get_bench_url() {
    local env_var="BENCH_AGENT_URL"
    local default_url="http://localhost:41246"
    
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

# Get the Bench agent URL
BENCH_URL=$(get_bench_url)
echo "Testing Bench Agent at: $BENCH_URL"
echo ""

# Test 1: Basic connectivity (ping-like test)
echo "🔍 Test 1: Basic connectivity..."
if curl -s --connect-timeout 5 --max-time 10 "$BENCH_URL/.well-known/agent.json" > /dev/null; then
    echo "✅ Agent is reachable"
else
    echo "❌ Agent is not reachable"
    echo "   This could mean:"
    echo "   - The agent is not running"
    echo "   - Network connectivity issues"
    echo "   - Firewall blocking the connection"
    exit 1
fi

echo ""

# Test 2: Get agent card (detailed info)
echo "🔍 Test 2: Fetching agent information..."
AGENT_INFO=$(curl -s --connect-timeout 5 --max-time 10 "$BENCH_URL/.well-known/agent.json")

if [ $? -eq 0 ] && [ ! -z "$AGENT_INFO" ]; then
    echo "✅ Agent card retrieved successfully"
    
    # Try to parse and display key info
    if command -v jq >/dev/null 2>&1; then
        echo ""
        echo "📋 Agent Details:"
        echo "   Name: $(echo "$AGENT_INFO" | jq -r '.name // "Unknown"')"
        echo "   Description: $(echo "$AGENT_INFO" | jq -r '.description // "No description"' | cut -c1-60)..."
        echo "   Version: $(echo "$AGENT_INFO" | jq -r '.version // "Unknown"')"
        
        AGENT_CARD_URL=$(echo "$AGENT_INFO" | jq -r '.url // "Unknown"')
        echo "   URL: $AGENT_CARD_URL"
        
        # Check for URL mismatch
        if [[ "$BENCH_URL" != *"localhost"* ]] && [[ "$AGENT_CARD_URL" == *"localhost"* ]]; then
            echo ""
            echo "⚠️  WARNING: URL MISMATCH DETECTED!"
            echo "   Testing URL: $BENCH_URL"
            echo "   Agent Card URL: $AGENT_CARD_URL"
            echo "   → The remote agent is misconfigured with a localhost URL"
            echo "   → This may cause issues with A2A communication"
        fi
        
        echo ""
        echo "🛠️  Available Skills:"
        echo "$AGENT_INFO" | jq -r '.skills[]? | "   - \(.name): \(.description)"' 2>/dev/null || echo "   No skills information available"
    else
        echo "   (Install 'jq' to see formatted agent details)"
        echo "   Raw response length: $(echo "$AGENT_INFO" | wc -c) characters"
    fi
else
    echo "❌ Failed to retrieve agent card"
    exit 1
fi

echo ""

# Test 3: Test A2A endpoint (with detailed debugging)
echo "🔍 Test 3: Testing A2A endpoint..."
echo "   Sending JSON-RPC request to $BENCH_URL/"

# Use a temporary file to capture the full response
TEMP_RESPONSE=$(mktemp)
HTTP_CODE=$(curl -s --connect-timeout 10 --max-time 15 -w "%{http_code}" \
    -X POST "$BENCH_URL/" \
    -H "Content-Type: application/json" \
    -d '{
        "jsonrpc": "2.0",
        "id": "test-connection-'"$(date +%s)"'",
        "method": "tasks/send",
        "params": {
            "id": "test-'"$(date +%s)"'",
            "message": {
                "role": "user",
                "parts": [{"type": "text", "text": "Hello, this is a connectivity test. Please respond with a simple acknowledgment."}]
            }
        }
    }' -o "$TEMP_RESPONSE" 2>/dev/null)

# Read the response body from the temp file
if [ -f "$TEMP_RESPONSE" ]; then
    RESPONSE_BODY=$(cat "$TEMP_RESPONSE")
    rm -f "$TEMP_RESPONSE"
else
    RESPONSE_BODY=""
fi

echo "   HTTP Status: $HTTP_CODE"

if [ "$HTTP_CODE" = "200" ] && [ ! -z "$RESPONSE_BODY" ]; then
    echo "✅ A2A endpoint responded with HTTP 200"
    
    if [[ "$RESPONSE_BODY" == *"jsonrpc"* ]]; then
        echo "✅ Response contains JSON-RPC structure"
        
        if [[ "$RESPONSE_BODY" == *"error"* ]]; then
            echo "⚠️  Response contains error:"
            if command -v jq >/dev/null 2>&1; then
                echo "$RESPONSE_BODY" | jq '.error // .' 2>/dev/null || echo "   Raw: $RESPONSE_BODY"
            else
                echo "   Raw: $RESPONSE_BODY"
            fi
        elif [[ "$RESPONSE_BODY" == *"result"* ]]; then
            echo "✅ A2A protocol working correctly!"
            if command -v jq >/dev/null 2>&1; then
                RESULT_TEXT=$(echo "$RESPONSE_BODY" | jq -r '.result.status.message.parts[0].text // "No text found"' 2>/dev/null)
                echo "   Agent Response: $(echo "$RESULT_TEXT" | cut -c1-100)..."
                
                # Check if task completed successfully
                STATE=$(echo "$RESPONSE_BODY" | jq -r '.result.status.state // "unknown"' 2>/dev/null)
                if [ "$STATE" = "completed" ]; then
                    echo "✅ Task completed successfully"
                else
                    echo "⚠️  Task state: $STATE"
                fi
            fi
        else
            echo "❓ Unexpected response format:"
            echo "   Raw: $(echo "$RESPONSE_BODY" | cut -c1-200)..."
        fi
    else
        echo "❌ Response doesn't contain JSON-RPC structure"
        echo "   Raw response: $(echo "$RESPONSE_BODY" | cut -c1-200)..."
    fi
else
    echo "❌ A2A endpoint test failed"
    echo "   HTTP Code: $HTTP_CODE"
    if [ ! -z "$RESPONSE_BODY" ]; then
        echo "   Response: $(echo "$RESPONSE_BODY" | cut -c1-200)..."
    fi
    
    if [ "$HTTP_CODE" = "404" ]; then
        echo "   → The A2A endpoint might not be available at '$BENCH_URL/'"
        echo "   → Try checking if the agent implements the A2A protocol correctly"
    elif [ "$HTTP_CODE" = "000" ]; then
        echo "   → Connection failed - might be network/firewall issue"
    fi
fi

echo ""
echo "🎉 Bench Agent connectivity test completed!"

if [[ "$BENCH_URL" == *"localhost"* ]]; then
    echo "💡 Tip: You're testing a localhost agent. Make sure it's running with 'npm run agent:bench'"
else
    echo "💡 Tip: You're testing a remote agent. Make sure it's accessible from your network."
    echo "💡 Note: If the agent card shows localhost URL, the remote agent needs reconfiguration."
fi 