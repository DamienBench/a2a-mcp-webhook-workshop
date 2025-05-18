import { WebhookServer } from './server.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Get port from environment or use default
const PORT = parseInt(process.env.WEBHOOK_PORT || '3000', 10);

async function main() {
  try {
    // Create and start webhook server
    const server = new WebhookServer(PORT);
    await server.start();
    
    console.log(`Webhook server started on port ${PORT}`);
    console.log(`Use the following endpoints:`);
    console.log(`- POST /webhook/:id - To receive webhook requests`);
    console.log(`- GET /api/webhooks - To list all webhook configurations`);
    console.log(`- POST /api/test/webhook/:id - To test a webhook configuration`);
  } catch (error) {
    console.error('Failed to start webhook server:', error);
    process.exit(1);
  }
}

// Run the server
main(); 