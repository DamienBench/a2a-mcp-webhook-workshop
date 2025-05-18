#!/bin/bash

# Script to test the Slack agent with proper arguments

# Check if a message was provided
if [ "$#" -eq 0 ]; then
  # No arguments provided, use a default message
  echo "No message provided. Using default test message..."
  TEST_MESSAGE="Send a message to #test-slack-damien saying: This is a test message from the Slack agent."
  
  # Run the Slack agent with the test message
  cd "$(dirname "$0")/../.."
  if [ ! -f ".env" ]; then
    echo "Error: .env file not found. Please create it with required environment variables."
    exit 1
  fi
  
  # Run the agent in test mode with the default message
  echo "Running Slack agent with message: $TEST_MESSAGE"
  npx tsx src/agents/slack/index.ts "$TEST_MESSAGE"
  
  echo "Test completed!"
else
  # Arguments provided, use them as the message
  MESSAGE="$*"
  
  # Run the Slack agent with the provided message
  cd "$(dirname "$0")/../.."
  if [ ! -f ".env" ]; then
    echo "Error: .env file not found. Please create it with required environment variables."
    exit 1
  fi
  
  # Run the agent in test mode with the provided message
  echo "Running Slack agent with message: $MESSAGE"
  npx tsx src/agents/slack/index.ts "$MESSAGE"
  
  echo "Test completed!"
fi 