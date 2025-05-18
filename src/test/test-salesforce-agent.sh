#!/bin/bash

# Script to test the Salesforce agent with proper arguments

# Check if a message was provided
if [ "$#" -eq 0 ]; then
  # No arguments provided, use a default message
  echo "No message provided. Using default test messages..."
  echo "Testing Create operation..."
  TEST_MESSAGE="Create a new lead with name: John Doe, company: Acme Corp, email: john@example.com"
  
  # Run the Salesforce agent with the test message
  cd "$(dirname "$0")/../.."
  if [ ! -f ".env" ]; then
    echo "Error: .env file not found. Please create it with required environment variables."
    exit 1
  fi
  
  # Run the agent in test mode with the default create message
  echo "Running Salesforce agent with message: $TEST_MESSAGE"
  npx tsx src/agents/salesforce/index.ts "$TEST_MESSAGE"
  
  echo "Testing Find operation..."
  TEST_MESSAGE="Find lead with email: john@example.com"
  echo "Running Salesforce agent with message: $TEST_MESSAGE"
  npx tsx src/agents/salesforce/index.ts "$TEST_MESSAGE"
  
  echo "Test completed!"
else
  # Arguments provided, use them as the message
  MESSAGE="$*"
  
  # Run the Salesforce agent with the provided message
  cd "$(dirname "$0")/../.."
  if [ ! -f ".env" ]; then
    echo "Error: .env file not found. Please create it with required environment variables."
    exit 1
  fi
  
  # Run the agent in test mode with the provided message
  echo "Running Salesforce agent with message: $MESSAGE"
  npx tsx src/agents/salesforce/index.ts "$MESSAGE"
  
  echo "Test completed!"
fi 