# Bench A2A Agent (Remote)

This is a **remote** Bench Agent that provides technical assistance and project insights. Unlike the local Slack and GitHub agents, this agent runs on external infrastructure and is accessed via A2A protocol over HTTP.

## Key Features

- **Remote Operation**: Runs on external infrastructure, accessed via HTTP
- **Technical Assistance**: Provides expert guidance on technical topics
- **Project Insights**: Analyzes project requirements and suggests solutions
- **A2A Protocol**: Communicates using the standard A2A protocol
- **Seamless Integration**: Works transparently with the Host Agent

## Architecture

The Bench agent demonstrates a **remote agent architecture**:
- Runs on external servers (not locally)
- Accessed via A2A protocol over HTTP
- No local installation or management required
- Scales independently of local resources

## Configuration

The remote Bench agent is configured via environment variables in your `.env` file:

```
BENCH_AGENT_URL=http://ec2-54-183-197-218.us-west-1.compute.amazonaws.com:41246
BENCH_API_KEY=your_bench_api_key
```

## Usage

The Bench agent is automatically available when you start the Host Agent system:

```bash
npm run start:all
```

**Note**: The `start:all` command only starts local agents. The remote Bench agent is accessed automatically when needed.

Interact with the Bench agent through the Host Agent CLI:

```bash
npm run a2a:cli
```

## Example Prompts

- "Provide technical assistance for the project"
- "Analyze this codebase and suggest improvements"
- "Help me understand best practices for multi-agent systems"
- "What are the key considerations for A2A protocol implementation?"

## Testing

Test connectivity to the remote Bench agent:

```bash
npm run test:bench
```

This verifies:
1. Network connectivity to the remote agent
2. Agent card endpoint functionality
3. A2A protocol communication

## Monitoring

Since the Bench agent is remote, you can monitor its activity through:

- **Web UI Dashboard**: Visit http://localhost:3000 and select the Bench Agent
- **Remote Activity View**: Shows messages sent to the remote agent
- **Status Indicators**: Visual indicators showing remote vs local status

## Technical Details

- **URL**: Configured via `BENCH_AGENT_URL` environment variable
- **Protocol**: A2A over HTTP/HTTPS
- **Authentication**: Uses `BENCH_API_KEY` for secure access
- **Status**: Displays as "REMOTE" in the Web UI

## Advantages of Remote Architecture

1. **Scalability**: Agent can scale independently
2. **Resource Efficiency**: No local compute resources required
3. **Centralized Management**: Single agent serves multiple clients
4. **Easy Updates**: Agent updates don't require local changes
5. **High Availability**: Can be deployed with redundancy

## Troubleshooting

### Common Issues

- **Connection Errors**: Verify `BENCH_AGENT_URL` and network connectivity
- **Authentication Failures**: Check `BENCH_API_KEY` configuration
- **Timeout Issues**: Remote agent may be under high load

### Debugging

- Use `npm run test:bench` to verify connectivity
- Check the Web UI for remote agent activity
- Monitor network requests in browser developer tools
- Verify firewall settings allow outbound HTTP connections

## Related Components

- [Host Agent](../host/README.md) - Routes requests to Bench agent
- [Webhook Server](../../webhooks/README.md) - Monitors remote agent activity 