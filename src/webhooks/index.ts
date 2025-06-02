import { WebhookServer } from './server.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Get port from environment or use default
// Use process.env.PORT directly if it exists (for Heroku, etc.)
const PORT = parseInt(process.env.PORT || process.env.WEBHOOK_PORT || '3000', 10);

// Log the port we're trying to use
console.log(`Attempting to start webhook server on port ${PORT}`);

let webhookServer: WebhookServer;

async function main() {
  try {
    // Create and start webhook server
    webhookServer = new WebhookServer(PORT);
    await webhookServer.start();
    
    console.log(`Webhook server started on port ${PORT}`);
    console.log(`Use the following endpoints:`);
    console.log(`- POST /webhook/:id - To receive webhook requests`);
    console.log(`- GET /api/webhooks - To list all webhook configurations`);
    console.log(`- POST /api/test/webhook/:id - To test a webhook configuration`);
    console.log(`Press Ctrl+C to stop the server gracefully`);
  } catch (error) {
    console.error('Failed to start webhook server:', error);
    process.exit(1);
  }
}

// Graceful shutdown handling
async function gracefulShutdown(signal: string) {
  console.log(`\n🛑 Received ${signal}. Starting graceful shutdown...`);
  
  if (webhookServer) {
    try {
      await webhookServer.stop();
      console.log('✅ Webhook server stopped successfully');
    } catch (error) {
      console.error('❌ Error stopping webhook server:', error);
    }
  }
  
  console.log('👋 Goodbye!');
  process.exit(0);
}

// Handle termination signals
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('unhandledRejection');
});

// Run the server
main(); 