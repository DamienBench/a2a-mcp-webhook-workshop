#!/bin/bash

# Change to the project root directory
cd "$(dirname "$0")/../.."

# Read the transcript file content
TRANSCRIPT=$(cat src/test/sample-transcript.txt)

# Create a JSON file with the transcript
cat > temp-webhook-payload.json << EOF
{
  "transcript": $(jq -Rs . < src/test/sample-transcript.txt)
}
EOF

# Send the webhook request using the JSON file
echo "Sending test webhook to http://localhost:3000/webhook/meeting-transcript..."
curl -X POST http://localhost:3000/webhook/meeting-transcript \
  -H "Content-Type: application/json" \
  -d @temp-webhook-payload.json | jq

# Cleanup
rm temp-webhook-payload.json

echo "Test completed." 