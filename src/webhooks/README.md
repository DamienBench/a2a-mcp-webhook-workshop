# Webhook Handler Server & Web UI

## Overview

The Webhook Handler Server is a critical component of the A2A-MCP Integration project, providing:

1. **Webhook Endpoints**: Receives and processes data from external systems via webhooks
2. **Web UI Dashboard**: Visual interface for monitoring and debugging agent communication
3. **Testing Tools**: Facilities to test webhook configurations and agent interactions
4. **Real-time Logging**: Visual log viewer for all agents in the system

The server acts as a bridge between external systems and the agent network, allowing messages to be routed to appropriate agents via the Host Agent.

## Architecture

```
┌───────────────┐       ┌───────────────┐       ┌───────────────┐
│  External     │       │  Webhook      │       │  Host Agent   │
│  Systems      ├──────►│  Server       ├──────►│  (Router)     │
│  (Zapier etc) │       │  (Port 3000)  │       │  (Port 41240) │
└───────────────┘       └───┬───────────┘       └───────┬───────┘
                            │                           │
                            ▼                           ▼
                        ┌───────────────┐       ┌───────────────┐
                        │  Web UI       │       │  Sub-Agents   │
                        │  Dashboard    │       │  (41243-5)    │
                        └───────────────┘       └───────────────┘
```

## Features

### Webhook Handler

- **Endpoint**: `/webhook/:id` - Receives webhook data and forwards to appropriate agents
- **Processing**: Intelligent routing of data based on content and configuration
- **Statistics**: Tracks invocations, success/failure rates, and performance metrics
- **Agents Integration**: Communicates with agents using the A2A protocol

### Web UI Dashboard

- **Real-time Stats**: Shows webhook processing statistics and agent activity
- **Recent Invocations**: Lists recent webhook invocations with status and details
- **Agent Status**: Displays the status of all agents in the system
- **Host Agent Messages**: Shows the messages the Host Agent sent to each sub-agent for debugging

### Testing Interface

- **Webhook Testing**: Send test webhook data to specific webhooks
- **JSON Formatting**: Format and validate JSON payloads
- **Real-time Response**: View immediate results of webhook test calls
- **Debugging**: Identify issues in webhook processing and agent communication

### Agent Logs Viewer

- **Real-time Logs**: View logs from all agents in real-time
- **Agent Selection**: Switch between different agent logs
- **Formatted Output**: Syntax highlighting and structured log display
- **Auto-scrolling**: Automatically scroll to latest log entries

## Running the Webhook Server

The webhook server starts automatically when you run:

```bash
npm run start:all
```

Alternatively, you can start it individually:

```bash
npm run webhook:server
```

The server runs on port 3000 by default (configurable via `PORT` or `WEBHOOK_PORT` environment variables).

## Web UI Access

After starting the server, access the Web UI at:

```
http://localhost:3000
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/webhook/:id` | POST | Receive webhook data for specified webhook ID |
| `/api/webhooks` | GET | List all webhook configurations |
| `/api/webhooks/:id` | GET | Get specific webhook configuration |
| `/api/webhooks` | POST | Create new webhook configuration |
| `/api/webhooks/:id` | PUT | Update webhook configuration |
| `/api/webhooks/:id` | DELETE | Delete webhook configuration |
| `/api/test/webhook/:id` | POST | Test a webhook configuration |
| `/api/logs/:agent` | GET | Get logs for a specific agent |
| `/api/stats` | GET | Get webhook statistics |
| `/api/stats/webhook/:invocationId` | GET | Get details for a specific webhook invocation |

## Webhook Configuration

Webhook configurations are stored as JSON files in:
- `src/webhooks/config/` (for backwards compatibility)
- `src/agents/host/configs/webhook.json` (main configuration)

Example configuration:

```json
{
  "id": "meeting-transcript",
  "name": "Meeting Transcript Processor",
  "description": "Processes meeting transcripts and extracts tasks for different agents",
  "processor": "meeting-transcript"
}
```

## Host Agent Messages

The Web UI displays messages sent from the Host Agent to sub-agents for each webhook invocation. This helps with debugging by showing the exact instructions sent to each agent.

These messages are captured during webhook processing and stored with each invocation record in the `webhook-stats.json` file located in the `logs/` directory.

## Troubleshooting

### Common Issues

1. **Webhook Server Port Conflict**
   - Problem: Another application is using port 3000
   - Solution: Set `PORT` or `WEBHOOK_PORT` environment variable to a different port

2. **Agent Communication Failures**
   - Problem: Webhook server can't communicate with agents
   - Solution: Ensure all agents are running on their expected ports
   
3. **Missing Host Agent Messages**
   - Problem: Host agent messages not showing in the UI
   - Solution: Verify the Host Agent is properly recording messages in the webhook stats

4. **Webhook Stats Not Updating**
   - Problem: Statistics don't appear or don't update
   - Solution: Check the `logs/webhook-stats.json` file exists and is writable

### Debugging Tips

- Check the browser console for JavaScript errors
- Look for server-side errors in console output
- Verify the correct webhook ID is being used
- Test with sample data before using real data

## Related Components

- [Host Agent](../agents/host/README.md)
- [Slack Agent](../agents/slack/README.md)
- [GitHub Agent](../agents/github/README.md)
- [Bench Agent](../agents/bench/README.md)

## Component Documentation

Each component has its own detailed documentation:
- [Host Agent](../agents/host/README.md)
- [Slack Agent](../agents/slack/README.md)
- [GitHub Agent](../agents/github/README.md)
- [Bench Agent](../agents/bench/README.md) 