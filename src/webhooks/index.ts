import { WebhookServer } from './server.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Get port from environment or use default
// Use process.env.PORT directly if it exists (for Heroku, etc.)
const PORT = parseInt(process.env.PORT || process.env.WEBHOOK_PORT || '3000', 10);

// Log the port we're trying to use
console.log(`Attempting to start webhook server on port ${PORT}`);

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