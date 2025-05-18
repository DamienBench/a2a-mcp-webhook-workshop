import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { A2AClient } from '../a2a/client/client.js';

// Get directory path for config files
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configDir = path.join(__dirname, 'config');
const publicDir = path.join(__dirname, 'public');

// Default host agent URL
const HOST_AGENT_URL = process.env.HOST_AGENT_URL || 'http://localhost:41240';

/**
 * Webhook configuration interface
 */
interface WebhookConfig {
  id: string;
  name: string;
  description?: string;
  processor: 'meeting-transcript' | 'custom' | string;
  processorConfig?: Record<string, any>;
  hostAgentUrl?: string;
}

/**
 * Webhook server class
 */
export class WebhookServer {
  private app: express.Express;
  private port: number;
  private configs: Map<string, WebhookConfig> = new Map();
  private hostAgentClient: A2AClient;

  constructor(port = 3000) {
    this.port = port;
    this.app = express();
    this.hostAgentClient = new A2AClient(HOST_AGENT_URL);
    
    // Setup middleware
    this.app.use(cors());
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));
    
    // Serve static files from public directory
    this.app.use(express.static(publicDir));
    
    // Setup routes
    this.setupRoutes();
  }

  /**
   * Load all webhook configurations from the config directory
   */
  private async loadConfigurations(): Promise<void> {
    try {
      // Ensure config directory exists
      await fs.mkdir(configDir, { recursive: true });
      
      // Read all configuration files
      const files = await fs.readdir(configDir);
      const configFiles = files.filter(file => file.endsWith('.json'));
      
      for (const file of configFiles) {
        try {
          const configPath = path.join(configDir, file);
          const configData = await fs.readFile(configPath, 'utf-8');
          const config = JSON.parse(configData) as WebhookConfig;
          
          if (config.id) {
            this.configs.set(config.id, config);
            console.log(`Loaded webhook config: ${config.id} - ${config.name}`);
          }
        } catch (err) {
          console.error(`Error loading config file ${file}:`, err);
        }
      }
      
      // If no configurations exist, create a default meeting transcript one
      if (this.configs.size === 0) {
        const defaultConfig: WebhookConfig = {
          id: 'meeting-transcript',
          name: 'Meeting Transcript Processor',
          description: 'Processes meeting transcripts and extracts tasks for different agents',
          processor: 'meeting-transcript'
        };
        
        await this.saveConfiguration(defaultConfig);
        console.log('Created default meeting transcript webhook configuration');
      }
    } catch (err) {
      console.error('Error loading webhook configurations:', err);
    }
  }

  /**
   * Save a webhook configuration to disk
   */
  private async saveConfiguration(config: WebhookConfig): Promise<void> {
    try {
      // Ensure config directory exists
      await fs.mkdir(configDir, { recursive: true });
      
      // Save config to file
      const configPath = path.join(configDir, `${config.id}.json`);
      await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
      
      // Update in-memory config
      this.configs.set(config.id, config);
    } catch (err) {
      console.error(`Error saving webhook configuration ${config.id}:`, err);
      throw err;
    }
  }

  /**
   * Setup routes for the webhook server
   */
  private setupRoutes(): void {
    // API endpoints for webhooks
    this.app.post('/webhook/:id', this.handleWebhook.bind(this));
    
    // API endpoints for configuration management
    this.app.get('/api/webhooks', this.listWebhooks.bind(this));
    this.app.get('/api/webhooks/:id', this.getWebhook.bind(this));
    this.app.post('/api/webhooks', this.createWebhook.bind(this));
    this.app.put('/api/webhooks/:id', this.updateWebhook.bind(this));
    this.app.delete('/api/webhooks/:id', this.deleteWebhook.bind(this));
    
    // API endpoint for testing a webhook
    this.app.post('/api/test/webhook/:id', this.testWebhook.bind(this));

    // API endpoint for fetching agent logs
    this.app.get('/api/logs/:agent', this.getAgentLogs.bind(this));
    
    // Error handler
    this.app.use(this.errorHandler.bind(this));
  }

  /**
   * Handle webhook requests
   */
  private async handleWebhook(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
    try {
      const webhookId = req.params.id;
      const webhookData = req.body;
      
      console.log(`Received webhook request for ${webhookId}:`);
      console.log(JSON.stringify(webhookData, null, 2));
      
      // Check if webhook configuration exists
      const config = this.configs.get(webhookId);
      if (!config) {
        return res.status(404).json({ 
          error: 'Webhook configuration not found',
          message: `No configuration found for webhook ID: ${webhookId}`
        });
      }
      
      // Process the webhook data
      const result = await this.processWebhookData(webhookData, config);
      
      res.status(200).json({
        success: true,
        webhookId,
        message: 'Webhook processed successfully',
        result
      });
    } catch (err) {
      next(err);
    }
  }
  
  /**
   * Process webhook data and send to host agent
   */
  private async processWebhookData(data: any, config: WebhookConfig): Promise<any> {
    try {
      // Simply pass the raw data directly to the host agent without any pre-processing
      return await this.sendToHostAgent(data, config);
    } catch (err) {
      console.error('Error processing webhook data:', err);
      throw err;
    }
  }
  
  /**
   * Send data to the host agent
   */
  private async sendToHostAgent(data: any, config: WebhookConfig): Promise<any> {
    // Use specific host agent URL if configured, otherwise use default
    const hostAgentUrl = config.hostAgentUrl || HOST_AGENT_URL;
    const client = hostAgentUrl !== HOST_AGENT_URL 
      ? new A2AClient(hostAgentUrl) 
      : this.hostAgentClient;
    
    try {
      // Create task parameters
      const params = {
        id: `webhook-${config.id}-${Date.now()}`,
        message: {
          role: "user" as "user", // Type assertion to fix the type issue
          parts: [{ 
            type: "text" as "text", // Explicitly set the type as "text"
            text: JSON.stringify({
              type: 'webhook',
              webhookId: config.id,
              webhookName: config.name,
              data
            })
          }]
        }
      };
      
      // Send task to host agent - add timeout and error handling
      try {
        const response = await Promise.race([
          client.sendTask(params),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Connection to host agent timed out')), 120000)
          )
        ]);
        return response;
      } catch (connError) {
        // Handle connection errors with more details
        console.error(`Connection error with host agent at ${hostAgentUrl}:`, connError);
        return {
          success: false,
          error: 'Unable to connect to host agent',
          details: connError.message,
          mockResponse: true
        };
      }
    } catch (err) {
      console.error(`Error sending webhook data to host agent at ${hostAgentUrl}:`, err);
      // Return a structured error response instead of throwing
      return {
        success: false,
        error: 'Failed to process webhook',
        details: err.message,
        mockResponse: true
      };
    }
  }
  
  /**
   * API endpoint to list all webhooks
   */
  private async listWebhooks(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
    try {
      const webhooks = Array.from(this.configs.values());
      res.status(200).json(webhooks);
    } catch (err) {
      next(err);
    }
  }
  
  /**
   * API endpoint to get a specific webhook configuration
   */
  private async getWebhook(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
    try {
      const webhookId = req.params.id;
      const config = this.configs.get(webhookId);
      
      if (!config) {
        return res.status(404).json({ error: 'Webhook configuration not found' });
      }
      
      res.status(200).json(config);
    } catch (err) {
      next(err);
    }
  }
  
  /**
   * API endpoint to create a new webhook configuration
   */
  private async createWebhook(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
    try {
      const config = req.body as WebhookConfig;
      
      if (!config.id || !config.name) {
        return res.status(400).json({ error: 'Webhook ID and name are required' });
      }
      
      if (this.configs.has(config.id)) {
        return res.status(409).json({ error: 'Webhook ID already exists' });
      }
      
      await this.saveConfiguration(config);
      res.status(201).json(config);
    } catch (err) {
      next(err);
    }
  }
  
  /**
   * API endpoint to update a webhook configuration
   */
  private async updateWebhook(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
    try {
      const webhookId = req.params.id;
      const updatedConfig = req.body as WebhookConfig;
      
      if (!this.configs.has(webhookId)) {
        return res.status(404).json({ error: 'Webhook configuration not found' });
      }
      
      // Ensure ID in body matches URL parameter
      updatedConfig.id = webhookId;
      
      await this.saveConfiguration(updatedConfig);
      res.status(200).json(updatedConfig);
    } catch (err) {
      next(err);
    }
  }
  
  /**
   * API endpoint to delete a webhook configuration
   */
  private async deleteWebhook(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
    try {
      const webhookId = req.params.id;
      
      if (!this.configs.has(webhookId)) {
        return res.status(404).json({ error: 'Webhook configuration not found' });
      }
      
      // Delete config file
      const configPath = path.join(configDir, `${webhookId}.json`);
      await fs.unlink(configPath);
      
      // Remove from in-memory map
      this.configs.delete(webhookId);
      
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
  
  /**
   * API endpoint to test a webhook
   */
  private async testWebhook(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
    try {
      const webhookId = req.params.id;
      const testData = req.body;
      
      // Check if webhook configuration exists
      const config = this.configs.get(webhookId);
      if (!config) {
        return res.status(404).json({ error: 'Webhook configuration not found' });
      }
      
      // Process the webhook data - now with improved error handling
      const result = await this.processWebhookData(testData, config);
      
      // Check if we got an error response
      if (result && result.mockResponse === true && result.success === false) {
        return res.status(200).json({
          success: false,
          webhookId,
          message: 'Test webhook failed but handled gracefully',
          error: result.error,
          details: result.details
        });
      }
      
      // Check if the host agent failed to process the webhook
      // This is indicated by result.status.state === 'failed'
      if (result && result.status && result.status.state === 'failed') {
        return res.status(200).json({
          success: false,
          webhookId,
          message: 'Webhook was sent but failed to process',
          result
        });
      }
      
      // Normal success response
      return res.status(200).json({
        success: true,
        webhookId,
        message: 'Test webhook processed successfully',
        result
      });
    } catch (err) {
      // Log the error but don't crash
      console.error('Error in testWebhook:', err);
      
      // Return a more informative error
      return res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: err.message || 'Unknown error occurred'
      });
    }
  }
  
  /**
   * API endpoint to get agent logs
   */
  private async getAgentLogs(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
    try {
      const agentType = req.params.agent;
      const validAgents = ['host', 'github', 'slack', 'salesforce', 'webhook'];
      
      // Validate agent type
      if (!validAgents.includes(agentType)) {
        return res.status(400).json({ error: 'Invalid agent type' });
      }
      
      // Define log file path
      const logFile = path.join(process.cwd(), 'logs', `${agentType}-agent.log`);
      
      try {
        // Check if file exists
        await fs.access(logFile);
      } catch (err) {
        return res.status(404).json({ error: 'Log file not found' });
      }
      
      // Read the log file
      const logContent = await fs.readFile(logFile, 'utf-8');
      
      // Parse log entries - split by line and handle timestamps
      const logEntries = logContent.split('\n')
        .filter(line => line.trim().length > 0)
        .map(line => {
          // Try to extract timestamp if it exists (in format [timestamp])
          const timestampMatch = line.match(/\[([^\]]+)\]/);
          const timestamp = timestampMatch ? timestampMatch[1] : '';
          
          return {
            timestamp,
            message: line
          };
        });
      
      // Return the log entries
      res.status(200).json({
        agent: agentType,
        entries: logEntries
      });
    } catch (err) {
      next(err);
    }
  }
  
  /**
   * Error handler middleware
   */
  private errorHandler(err: Error, req: Request, res: Response, next: NextFunction): void {
    console.error('Error processing request:', err);
    
    res.status(500).json({
      error: 'Internal Server Error',
      message: err.message
    });
  }
  
  /**
   * Start the webhook server
   */
  public async start(): Promise<void> {
    // Load webhook configurations
    await this.loadConfigurations();
    
    // Start the server
    this.app.listen(this.port, () => {
      console.log(`Webhook server listening on port ${this.port}`);
    });
  }
} 