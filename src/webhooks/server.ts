import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { A2AClient } from '../a2a/client/client.js';
import { existsSync, writeFileSync, readFileSync } from 'node:fs';
import crypto from 'node:crypto';
import { Server } from 'node:http';

// Get the paths for configs and resources
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, 'public');
const logDir = path.join(__dirname, '..', '..', 'logs');
const configDir = path.join(__dirname, 'config');
const hostAgentConfigDir = path.join(__dirname, '..', 'agents', 'host', 'configs');
const statsFilePath = path.join(logDir, 'webhook-stats.json');

// Ensure we don't use the old stats file location
const oldStatsFilePath = path.join(__dirname, 'data', 'webhook-stats.json');

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
  promptTemplate?: string;
}

/**
 * Webhook statistics interface
 */
interface WebhookStats {
  totalProcessed: number;
  agentInvocations: {
    host: number;
    github: number;
    slack: number;
    bench: number;
  };
  recentWebhooks: WebhookInvocation[];
}

/**
 * Webhook invocation interface
 */
interface WebhookInvocation {
  id: string;
  name: string;
  timestamp: string;
  status: 'success' | 'failed' | 'processing';
  details?: {
    webhookData: any;
    result: any;
    agentMessages: Record<string, string>;
  };
}

/**
 * Webhook server class
 */
export class WebhookServer {
  private app: express.Express;
  private server: Server | null = null;
  private port: number;
  private configs: Map<string, WebhookConfig> = new Map();
  private hostAgentClient: A2AClient;
  private stats: WebhookStats;
  
  constructor(port = 3000) {
    this.port = port;
    this.app = express();
    this.hostAgentClient = new A2AClient(HOST_AGENT_URL);
    
    // Initialize statistics
    this.stats = {
      totalProcessed: 0,
      agentInvocations: {
        host: 0,
        github: 0,
        slack: 0,
        bench: 0
      },
      recentWebhooks: []
    };
    
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
   * Load all webhook configurations from the host agent config directory
   */
  private async loadWebhookConfigurations(): Promise<void> {
    console.log(`[WebhookServer] Loading webhook configurations...`);
    
    // Get the webhook configurations from the host agent directory
    const hostAgentConfigDir = path.join(process.cwd(), 'src', 'agents', 'host', 'configs');
    console.log(`[WebhookServer] Host agent config dir: ${hostAgentConfigDir}`);
    
    try {
      // Load webhook configuration from host agent
      const webhookConfigPath = path.join(hostAgentConfigDir, 'webhook.json');
      console.log(`[WebhookServer] Looking for webhook config at: ${webhookConfigPath}`);
      
      if (await fs.access(webhookConfigPath).then(() => true).catch(() => false)) {
        const configData = await fs.readFile(webhookConfigPath, 'utf-8');
        const config = JSON.parse(configData) as WebhookConfig;
        
        // Store the configuration
        this.configs.set(config.id, config);
        console.log(`[WebhookServer] Loaded webhook config from host agent: ${config.id} - ${config.name}`);
        console.log(`[WebhookServer] Config contains ${config.processorConfig?.agents?.length || 0} agent entries`);
      } else {
        console.warn(`[WebhookServer] No webhook configuration found at: ${webhookConfigPath}`);
      }
    } catch (err) {
      console.error('[WebhookServer] Error loading webhook configurations:', err);
    }
    
    // Log final configuration state
    console.log(`[WebhookServer] Configs map size: ${this.configs.size}`);
    console.log(`[WebhookServer] Configs map keys: ${Array.from(this.configs.keys()).join(', ')}`);
  }

  /**
   * Save a webhook configuration to disk
   */
  private async saveConfiguration(config: WebhookConfig): Promise<void> {
    try {
      // Only save config to host agent directory
      await fs.mkdir(hostAgentConfigDir, { recursive: true });
      
      // Save config only to host agent location
      const hostConfigPath = path.join(hostAgentConfigDir, 'webhook.json');
      
      await fs.writeFile(hostConfigPath, JSON.stringify(config, null, 2), 'utf-8');
      
      // Update in-memory config
      this.configs.set(config.id, config);
      
      console.log(`[WebhookServer] Saved webhook configuration to ${hostConfigPath}`);
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
    
    // API endpoints for webhook statistics
    this.app.get('/api/stats', this.getWebhookStats.bind(this));
    this.app.get('/api/stats/webhook/:invocationId', this.getWebhookInvocationDetails.bind(this));
    
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
      
      console.log(`[WebhookServer] Received webhook request for ${webhookId} at ${new Date().toISOString()}`);
      console.log(JSON.stringify(webhookData));
      
      // Calculate a simple hash of the request body for deduplication
      const requestBody = JSON.stringify(webhookData);
      const requestHash = crypto.createHash('sha256').update(requestBody).digest('hex').substring(0, 12);
      const dedupKey = `${webhookId}-${requestHash}`;
      
      console.log(`[WebhookServer] Request hash: ${requestHash}, dedupKey: ${dedupKey}`);
      
      // Check for duplicate submission (within 10 seconds)
      const now = Date.now();
      const lastSubmissionTime = this.recentTestSubmissions.get(dedupKey);
      
      if (lastSubmissionTime && (now - lastSubmissionTime) < 10000) {
        console.log(`[WebhookServer] Duplicate webhook detected within 10 seconds: ${dedupKey}`);
        return res.status(409).json({ 
          error: 'Duplicate request',
          message: 'A similar webhook was submitted within the last 10 seconds. Please wait before retrying.'
        });
      }
      
      // Record this submission to prevent duplicates
      this.recentTestSubmissions.set(dedupKey, now);
      console.log(`[WebhookServer] Recorded submission with dedupKey: ${dedupKey}`);
      
      // Check if webhook configuration exists
      const config = this.configs.get(webhookId);
      if (!config) {
        return res.status(404).json({ 
          error: 'Webhook configuration not found',
          message: `No configuration found for webhook ID: ${webhookId}`
        });
      }
      
      // Generate a unique invocation ID
      const invocationId = `${webhookId}-${now}`;
      console.log(`[WebhookServer] Generated invocationId: ${invocationId}`);
      
      // Record the webhook with "processing" status
      this.recordWebhookInvocation(webhookId, config.name, webhookData, null, 'processing', invocationId);
      
      // Process the webhook data asynchronously
      this.processWebhookAsync(webhookId, invocationId, webhookData, config);
      
      // Immediately return a response indicating the webhook is being processed
      res.status(202).json({
        success: true,
        webhookId,
        invocationId,
        message: 'Webhook received and is being processed',
        status: 'processing'
      });
    } catch (err) {
      next(err);
    }
  }
  
  /**
   * Process webhook data asynchronously
   */
  private async processWebhookAsync(webhookId: string, invocationId: string, webhookData: any, config: WebhookConfig): Promise<void> {
    try {
      console.log(`[WebhookServer] Starting processWebhookAsync for invocationId: ${invocationId}`);
      
      // Process the webhook data - pass the invocation ID to ensure stable task ID generation
      const result = await this.processWebhookData(webhookData, config, invocationId);
      
      // Add debug log to see result structure
      console.log(`[WebhookServer] Webhook processing complete for ${invocationId}`);
      console.log(`[WebhookServer] Processing webhook result for ${webhookId}:`, 
        JSON.stringify(result).substring(0, 500) + '...');
      
      // Determine overall success status using our helper method
      const success = this.determineWebhookSuccess(result);
      console.log(`[WebhookServer] Webhook ${invocationId} success determination: ${success}`);
      
      // Update the webhook invocation with the final status
      this.recordWebhookInvocation(webhookId, config.name, webhookData, result, success ? 'success' : 'failed', invocationId);
    } catch (err) {
      console.error('Error processing webhook asynchronously:', err);
      
      // Update the webhook invocation with error status
      this.recordWebhookInvocation(webhookId, config.name, webhookData, {
        error: 'Failed to process webhook',
        details: err.message
      }, 'failed', invocationId);
    }
  }
  
  /**
   * Process webhook data and send to host agent
   */
  private async processWebhookData(data: any, config: WebhookConfig, invocationId?: string): Promise<any> {
    try {
      // Simply pass the raw data directly to the host agent without any pre-processing
      const result = await this.sendToHostAgent(data, config, invocationId);
      
      // If this is a mockResponse due to connection error, mark as failed
      if (result && result.mockResponse) {
        result.success = false;
      }
      
      return result;
    } catch (err) {
      console.error('Error processing webhook data:', err);
      throw err;
    }
  }
  
  /**
   * Send data to the host agent
   */
  private async sendToHostAgent(data: any, config: WebhookConfig, invocationId?: string): Promise<any> {
    // Use specific host agent URL if configured, otherwise use default
    const hostAgentUrl = config.hostAgentUrl || HOST_AGENT_URL;
    const client = hostAgentUrl !== HOST_AGENT_URL 
      ? new A2AClient(hostAgentUrl) 
      : this.hostAgentClient;
    
    try {
      // Add explicit logging for config and processorConfig
      console.log('[WebhookServer] Full webhook config:', JSON.stringify(config));
      console.log('[WebhookServer] processorConfig:', JSON.stringify(config.processorConfig));
      if (config.processorConfig && 'parallel' in config.processorConfig) {
        console.log('[WebhookServer] parallel setting:', config.processorConfig.parallel);
      }
      
      // Use invocation ID if provided to ensure stability of the task ID
      const stableId = invocationId || `webhook-${config.id}-${Date.now()}`;
      console.log(`[WebhookServer] Sending to host agent with stableId: ${stableId}`);
      
      // Create task parameters
      const params = {
        id: stableId,
        message: {
          role: "user" as "user", // Type assertion to fix the type issue
          parts: [{ 
            type: "text" as "text", // Explicitly set the type as "text"
            text: JSON.stringify({
              type: 'webhook',
              webhookId: config.id,
              webhookName: config.name,
              processorConfig: config.processorConfig || {}, // Include the processor configuration
              promptTemplate: config.promptTemplate || null, // Include the custom prompt template
              data,
              requestId: stableId // Include the stable ID as the requestId for deduplication
            })
          }]
        }
      };
      
      // Log what we're sending to the host agent
      console.log('[WebhookServer] Sending to host agent:', JSON.stringify(params.message.parts[0].text));
      
      // Send task to host agent - add timeout and error handling
      try {
        console.log(`[WebhookServer] Sending task to host agent at ${hostAgentUrl} with ID ${stableId}`);
        const response = await Promise.race([
          client.sendTask(params),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Connection to host agent timed out')), 120000)
          )
        ]);
        console.log(`[WebhookServer] Received response from host agent for task ${stableId}`);
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
  
  // Map to track recent webhook test submissions to prevent duplicates
  private recentTestSubmissions = new Map<string, number>();
  
  /**
   * API endpoint to test a webhook
   */
  private async testWebhook(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
    try {
      const webhookId = req.params.id;
      const testData = req.body;
      
      console.log(`[WebhookServer] Testing webhook ${webhookId} at ${new Date().toISOString()}`);
      
      // Calculate a simple hash of the request body for deduplication
      const requestBody = JSON.stringify(testData);
      const requestHash = crypto.createHash('sha256').update(requestBody).digest('hex').substring(0, 12);
      const dedupKey = `test-${webhookId}-${requestHash}`;
      
      console.log(`[WebhookServer] Test request hash: ${requestHash}, dedupKey: ${dedupKey}`);
      console.log(`[WebhookServer] Current recentTestSubmissions Map has ${this.recentTestSubmissions.size} entries`);
      
      // Check for duplicate submission (within 10 seconds)
      const now = Date.now();
      const lastSubmissionTime = this.recentTestSubmissions.get(dedupKey);
      console.log(`[WebhookServer] Last submission time for ${dedupKey}: ${lastSubmissionTime || 'none'}`);
      
      if (lastSubmissionTime && (now - lastSubmissionTime) < 10000) {
        console.log(`[WebhookServer] Duplicate webhook test detected within 10 seconds: ${dedupKey}`);
        return res.status(409).json({ 
          error: 'Duplicate request',
          message: 'A similar webhook test was submitted within the last 10 seconds. Please wait before retrying.'
        });
      }
      
      // Record this submission to prevent duplicates
      this.recentTestSubmissions.set(dedupKey, now);
      console.log(`[WebhookServer] Recorded test submission with dedupKey: ${dedupKey}`);
      
      // Periodically clean up old entries (every 100 requests)
      if (this.recentTestSubmissions.size > 100) {
        const cutoffTime = now - 60000; // 1 minute
        for (const [key, timestamp] of this.recentTestSubmissions.entries()) {
          if (timestamp < cutoffTime) {
            this.recentTestSubmissions.delete(key);
          }
        }
      }
      
      // Check if webhook configuration exists
      const config = this.configs.get(webhookId);
      if (!config) {
        return res.status(404).json({ 
          error: 'Webhook configuration not found',
          message: `No configuration found for webhook ID: ${webhookId}`
        });
      }
      
      // Generate a unique invocation ID
      const invocationId = `${webhookId}-${now}`;
      console.log(`[WebhookServer] Generated test invocationId: ${invocationId}`);
      
      // Record the webhook with "processing" status
      this.recordWebhookInvocation(webhookId, config.name, testData, null, 'processing', invocationId);
      
      // Process the webhook data asynchronously
      this.processWebhookAsync(webhookId, invocationId, testData, config);
      
      // Immediately return a response indicating the webhook is being processed
      res.status(202).json({
        success: true,
        webhookId,
        invocationId,
        message: 'Webhook test received and is being processed',
        status: 'processing'
      });
    } catch (err) {
      next(err);
    }
  }
  
  /**
   * API endpoint to get agent logs
   */
  private async getAgentLogs(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
    try {
      const agentType = req.params.agent;
      const validAgents = ['host', 'github', 'slack', 'webhook', 'bench'];
      
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
   * Record a webhook invocation and update statistics
   */
  private async recordWebhookInvocation(
    webhookId: string, 
    webhookName: string, 
    webhookData: any, 
    result: any, 
    status: 'success' | 'failed' | 'processing',
    invocationId?: string
  ): Promise<void> {
    try {
      console.log(`[STATS DEBUG] ===== UPDATED CODE RUNNING ===== recordWebhookInvocation called: webhookId=${webhookId}, status=${status}, invocationId=${invocationId}`);
      
      // Generate a unique invocation ID if not provided
      const finalInvocationId = invocationId || `${webhookId}-${Date.now()}`;
      
      // Check if we're updating an existing invocation
      const existingIndex = this.stats.recentWebhooks.findIndex(webhook => webhook.id === finalInvocationId);
      const isUpdating = existingIndex !== -1;
      
      console.log(`[STATS DEBUG] isUpdating=${isUpdating}, existingIndex=${existingIndex}`);
      
      // Only increment stats when creating a new record, not when updating
      if (!isUpdating) {
        console.log(`[STATS DEBUG] Creating new webhook record, incrementing totalProcessed from ${this.stats.totalProcessed}`);
        this.stats.totalProcessed++;
        
        // For processing status, we only increment the host agent
        if (status === 'processing') {
          console.log(`[STATS DEBUG] Processing status, incrementing host agent from ${this.stats.agentInvocations.host}`);
          this.stats.agentInvocations.host++;
        }
      } else {
        console.log(`[STATS DEBUG] Updating existing webhook record, NOT incrementing totalProcessed`);
      }
      
      console.log(`[STATS DEBUG] About to check agent counting condition: status="${status}", hasResult=${!!result}, condition=${status !== 'processing' && !!result}`);
      
      // Count agent invocations for completed webhooks (both new and updated records)
      if (status !== 'processing' && result) {
        console.log(`[STATS DEBUG] Completed webhook, checking for agent results`);
        
        // Only increment host agent if this is a new record (not an update)
        if (!isUpdating) {
          this.stats.agentInvocations.host++;
          console.log(`[STATS DEBUG] Incremented host agent to ${this.stats.agentInvocations.host}`);
        }
        
        // Parse the actual agent results from the result structure
        let agentResults: any[] = [];
        
        console.log(`[STATS DEBUG] Checking result structure:`, {
          hasResult: !!result,
          hasStatus: !!result?.status,
          hasMessage: !!result?.status?.message,
          hasParts: !!result?.status?.message?.parts,
          partsLength: result?.status?.message?.parts?.length || 0
        });
        
        // Extract agent results from the actual result structure
        if (result.status?.message?.parts?.[0]?.text) {
          console.log(`[STATS DEBUG] Found text in result, attempting to parse:`, result.status.message.parts[0].text.substring(0, 200) + '...');
          try {
            const parsedResponse = JSON.parse(result.status.message.parts[0].text);
            console.log(`[STATS DEBUG] Successfully parsed JSON response:`, {
              hasAgentResults: !!parsedResponse.agentResults,
              isArray: Array.isArray(parsedResponse.agentResults),
              agentResultsLength: parsedResponse.agentResults?.length || 0
            });
            
            if (parsedResponse.agentResults && Array.isArray(parsedResponse.agentResults)) {
              agentResults = parsedResponse.agentResults;
              console.log(`[STATS DEBUG] Found ${agentResults.length} agent results in webhook response`);
            }
          } catch (err) {
            console.warn('[STATS DEBUG] Failed to parse agent results from webhook response:', err.message);
          }
        } else {
          console.log(`[STATS DEBUG] No text found in result.status.message.parts[0]`);
        }
        
        // Count agent invocations from the parsed results
        for (const agentResult of agentResults) {
          if (agentResult.agent) {
            const agentType = agentResult.agent.toLowerCase();
            console.log(`[STATS DEBUG] Incrementing stats for agent: ${agentType} from ${this.stats.agentInvocations[agentType] || 0}`);
            this.updateAgentInvocationStats(agentType);
            console.log(`[STATS DEBUG] Agent ${agentType} now has ${this.stats.agentInvocations[agentType] || 0} invocations`);
          }
        }
        
        // Also check legacy result.results path for backwards compatibility
        if (result.results) {
          console.log('[STATS DEBUG] Also checking legacy result.results path for agent results');
          
          // Handle both array format and object format (with agent types as keys)
          if (Array.isArray(result.results)) {
            // Array format
            for (const agentResult of result.results) {
              if (agentResult.agent) {
                const agentType = agentResult.agent.toLowerCase();
                this.updateAgentInvocationStats(agentType);
              }
            }
          } else if (typeof result.results === 'object') {
            // Object format with agent types as keys
            for (const agentType of Object.keys(result.results)) {
              this.updateAgentInvocationStats(agentType.toLowerCase());
            }
          }
        }
      }
      
      // Double-check and override status using our helper method
      if (status === 'success' && result) {
        status = this.determineWebhookSuccess(result) ? 'success' : 'failed';
      }
      
      // Extract agent messages if available
      let agentMessages: Record<string, string> = {};
      
      // First, try to parse the host agent response JSON to get the webhook result
      if (result?.status?.message?.parts?.[0]?.text) {
        try {
          const hostResponseText = result.status.message.parts[0].text;
          const hostResponse = JSON.parse(hostResponseText);
          
          // Check if there's agentTasks in the host response (new format)
          if (hostResponse?.agentTasks && typeof hostResponse.agentTasks === 'object') {
            console.log('[WebhookServer] Found agentTasks in host response:', hostResponse.agentTasks);
            agentMessages = hostResponse.agentTasks;
          }
          // Or check if agentResults contain task information
          else if (hostResponse?.agentResults && Array.isArray(hostResponse.agentResults)) {
            console.log('[WebhookServer] Extracting tasks from agentResults');
            for (const agentResult of hostResponse.agentResults) {
              if (agentResult.agent && agentResult.task) {
                agentMessages[agentResult.agent.toLowerCase()] = agentResult.task;
              }
            }
          }
        } catch (parseErr) {
          console.log('[WebhookServer] Could not parse host agent response as JSON:', parseErr.message);
        }
      }
      
      // Fallback: Check if the result has a top-level tasks field (from processWebhookDirectly)
      if (Object.keys(agentMessages).length === 0 && result?.tasks && typeof result.tasks === 'object') {
        console.log('[WebhookServer] Using fallback: found tasks object in result:', result.tasks);
        agentMessages = result.tasks;
      } 
      // Legacy fallback: Then try to check each agent result from processed webhook
      else if (Object.keys(agentMessages).length === 0 && result?.results) {
        console.log('[WebhookServer] Using legacy fallback: checking agent results for task messages');
        
        // Handle both array and object formats for results
        if (Array.isArray(result.results)) {
          // Array format
          for (const agentResult of result.results) {
            if (agentResult.agent && agentResult.task?.message?.parts?.[0]?.text) {
              agentMessages[agentResult.agent.toLowerCase()] = agentResult.task.message.parts[0].text;
            }
          }
        } else {
          // Object format with agent types as keys
          for (const [agentType, agentResult] of Object.entries(result.results)) {
            // Extract the message sent to the agent
            const taskInfo = (agentResult as any).task || {};
            if (taskInfo.message?.parts?.[0]?.text) {
              agentMessages[agentType.toLowerCase()] = taskInfo.message.parts[0].text;
            }
          }
        }
      }
      
      console.log('[WebhookServer] Extracted agent messages:', agentMessages);
      
      // Create or update the invocation record
      const invocation: WebhookInvocation = {
        id: finalInvocationId,
        name: webhookName,
        timestamp: new Date().toISOString(),
        status,
        details: {
          webhookData,
          result,
          agentMessages // Include the messages sent to each agent
        }
      };
      
      // Update or add to recent invocations
      if (isUpdating) {
        // Update existing invocation
        this.stats.recentWebhooks[existingIndex] = invocation;
      } else {
        // Add new invocation at the beginning of the list
        this.stats.recentWebhooks.unshift(invocation);
        
        // Limit to most recent 50 invocations
        if (this.stats.recentWebhooks.length > 50) {
          this.stats.recentWebhooks = this.stats.recentWebhooks.slice(0, 50);
        }
      }
      
      console.log(`[STATS DEBUG] Final stats after processing:`, this.stats.agentInvocations);
      
      // Save statistics to file
      await this.saveStats();
    } catch (err) {
      console.error('Error recording webhook invocation:', err);
    }
  }
  
  /**
   * Save statistics to file
   */
  private async saveStats(): Promise<void> {
    try {
      // Ensure log directory exists
      await fs.mkdir(logDir, { recursive: true });
      
      // Write stats to file
      await fs.writeFile(statsFilePath, JSON.stringify(this.stats, null, 2), 'utf-8');
      
      // Remove old stats file if it exists (transitional cleanup)
      try {
        if (existsSync(oldStatsFilePath)) {
          await fs.unlink(oldStatsFilePath);
          console.log('Removed old webhook stats file');
        }
      } catch (cleanupErr) {
        console.warn('Error cleaning up old stats file:', cleanupErr);
      }
    } catch (err) {
      console.error('Error saving webhook statistics:', err);
    }
  }
  
  /**
   * Load statistics from file
   */
  private async loadStats(): Promise<void> {
    try {
      // Check if stats file exists
      try {
        await fs.access(statsFilePath);
      } catch {
        // Create an empty stats file if it doesn't exist
        await this.saveStats();
        return;
      }
      
      // Read stats from file
      const statsData = await fs.readFile(statsFilePath, 'utf-8');
      this.stats = JSON.parse(statsData) as WebhookStats;
      
      console.log(`Loaded webhook stats from ${statsFilePath} with ${this.stats.recentWebhooks.length} webhooks`);
    } catch (err) {
      console.error('Error loading webhook statistics:', err);
      
      // Initialize with default stats if loading fails
      this.stats = {
        totalProcessed: 0,
        agentInvocations: {
          host: 0,
          github: 0,
          slack: 0,
          bench: 0
        },
        recentWebhooks: []
      };
      
      // Save the default stats
      await this.saveStats();
    }
  }
  
  /**
   * Get webhook statistics
   */
  private async getWebhookStats(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
    try {
      // Return the current stats
      return res.status(200).json(this.stats);
    } catch (err) {
      next(err);
    }
  }
  
  /**
   * Get webhook invocation details
   */
  private async getWebhookInvocationDetails(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
    try {
      const invocationId = req.params.invocationId;
      
      // Find the invocation by ID
      const invocation = this.stats.recentWebhooks.find(webhook => webhook.id === invocationId);
      
      if (!invocation) {
        return res.status(404).json({
          error: 'Webhook invocation not found',
          message: `No invocation found with ID: ${invocationId}`
        });
      }
      
      return res.status(200).json(invocation);
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
    try {
      // Load configurations
      await this.loadWebhookConfigurations();
      
      // Check for old stats file and migrate if needed
      await this.migrateOldStatsFile();
      
      // Load statistics
      await this.loadStats();
      
      // Start the server and store reference
      this.server = this.app.listen(this.port, () => {
        console.log(`Webhook server running on port ${this.port}`);
        console.log(`Using webhook stats file: ${statsFilePath}`);
      });
    } catch (err) {
      console.error('Error starting webhook server:', err);
      throw err;
    }
  }
  
  /**
   * Stop the webhook server gracefully
   */
  public async stop(): Promise<void> {
    if (this.server) {
      return new Promise((resolve, reject) => {
        this.server!.close((err) => {
          if (err) {
            console.error('Error stopping webhook server:', err);
            reject(err);
          } else {
            console.log('🛑 Webhook server stopped successfully');
            this.server = null;
            resolve();
          }
        });
      });
    }
  }
  
  /**
   * Migrate old stats file if it exists
   */
  private async migrateOldStatsFile(): Promise<void> {
    try {
      // Check if old stats file exists
      if (existsSync(oldStatsFilePath)) {
        console.log('Found old webhook stats file, migrating to new location...');
        
        try {
          // Read old stats
          const oldStatsData = await fs.readFile(oldStatsFilePath, 'utf-8');
          const oldStats = JSON.parse(oldStatsData) as WebhookStats;
          
          // Check if new stats file already exists
          if (!existsSync(statsFilePath)) {
            // Save old stats to new location
            await fs.mkdir(logDir, { recursive: true });
            await fs.writeFile(statsFilePath, oldStatsData, 'utf-8');
            console.log('Migrated webhook stats to new location');
          } else {
            console.log('New stats file already exists, skipping migration');
          }
          
          // Delete old stats file
          await fs.unlink(oldStatsFilePath);
          console.log('Removed old webhook stats file');
        } catch (migrationErr) {
          console.error('Error during stats migration:', migrationErr);
        }
      }
    } catch (err) {
      console.warn('Error checking for old stats file:', err);
    }
  }

  /**
   * A helper method to determine if a webhook execution was successful
   */
  private determineWebhookSuccess(result: any): boolean {
    console.log('[WebhookServer] Determining webhook success from result structure:', JSON.stringify(result).substring(0, 300) + '...');
    
    // Consider failures from obvious error indicators
    if (!result || result.error || result.mockResponse) {
      console.log('[WebhookServer] Found error or mockResponse - marking as failed');
      return false;
    }
    
    // FIRST: Try to extract agent results from the text payload (new agentResults format)
    if (result.status && result.status.message && 
        result.status.message.parts && result.status.message.parts.length > 0) {
      try {
        const textPart = result.status.message.parts.find((part: any) => part.type === 'text');
        if (textPart && textPart.text) {
          console.log('[WebhookServer] Checking text payload for agentResults:', textPart.text.substring(0, 100) + '...');
          
          try {
            // Parse the entire JSON response to look for agentResults array
            const responseJson = JSON.parse(textPart.text);
            console.log('[WebhookServer] Parsed response JSON successfully');
            
            // Check if agentResults array exists
            if (responseJson.agentResults && Array.isArray(responseJson.agentResults)) {
              console.log('[WebhookServer] Found agentResults array with', responseJson.agentResults.length, 'agents');
              
              if (responseJson.agentResults.length === 0) {
                console.log('[WebhookServer] No agent results found in agentResults array');
                return false;
              }
              
              // Check if ANY agent failed in the agentResults array
              const failedAgents = responseJson.agentResults.filter((agentResult: any) => 
                agentResult.state === 'failed' || agentResult.status === 'failed'
              );
              
              if (failedAgents.length > 0) {
                const failedAgentNames = failedAgents.map((agent: any) => agent.agent).join(', ');
                console.log(`[WebhookServer] Found ${failedAgents.length} failed agents: ${failedAgentNames} - marking webhook as failed`);
                return false;
              }
              
              console.log('[WebhookServer] All agents in agentResults array succeeded');
              return true;
            }
          } catch (parseErr) {
            console.error("[WebhookServer] Error parsing response JSON:", parseErr);
            // Fall through to legacy checks
          }
          
          // Legacy check: Extract the JSON between "Results: {" and the end of the JSON object
          const resultMatch = textPart.text.match(/Results: (\{.*\})/s);
          if (resultMatch && resultMatch[1]) {
            try {
              console.log('[WebhookServer] Extracted results JSON from text payload (legacy format)');
              const agentResults = JSON.parse(resultMatch[1]);
              const agentNames = Object.keys(agentResults);
              
              if (agentNames.length === 0) {
                console.log('[WebhookServer] No agent results found in extracted JSON');
                return false;
              }
              
              console.log('[WebhookServer] Checking extracted results for agents:', agentNames.join(', '));
              
              // Check if ANY agent failed in the extracted results
              const anyFailed = agentNames.some(agentName => {
                const agentData = agentResults[agentName];
                
                // Check for error field
                if (agentData.error) {
                  console.log(`[WebhookServer] Agent ${agentName} has error field in extracted results`);
                  return true;
                }
                
                // Check for failed state
                if (agentData.status && agentData.status.state === 'failed') {
                  console.log(`[WebhookServer] Agent ${agentName} has failed state in extracted results`);
                  return true;
                }
                
                return false;
              });
              
              if (anyFailed) {
                console.log('[WebhookServer] At least one agent failed in extracted results - marking webhook as failed');
                return false;
              }
            } catch (parseErr) {
              console.error("[WebhookServer] Error parsing agent results JSON:", parseErr);
            }
          }
        }
      } catch (err) {
        console.error("[WebhookServer] Error checking text payload for results:", err);
      }
    }
    
    // SECOND: Check for agent failures in the direct results object
    if (result.results && typeof result.results === 'object' && !Array.isArray(result.results)) {
      console.log('[WebhookServer] Checking direct agent results for failures');
      
      // Check if ANY agent has an error or failed state
      const anyAgentFailed = Object.entries(result.results).some(([agentName, agentResult]) => {
        // Check for error field
        if ((agentResult as any).error) {
          console.log(`[WebhookServer] Agent ${agentName} has an error field: ${(agentResult as any).error}`);
          return true;
        }
        
        // Check for failed state
        if ((agentResult as any).status && (agentResult as any).status.state === 'failed') {
          console.log(`[WebhookServer] Agent ${agentName} has failed state`);
          return true;
        }
        
        return false;
      });
      
      if (anyAgentFailed) {
        console.log('[WebhookServer] At least one agent has failed - marking webhook as failed');
        return false;
      }
    }
    
    // THIRD: For array-type results
    if (result.results && Array.isArray(result.results)) {
      console.log('[WebhookServer] Found results array with', result.results.length, 'items');
      
      if (result.results.length === 0) {
        return false; // No results at all
      }
      
      // Check for any failed items in the array
      const anyArrayItemFailed = result.results.some((agentResult: any) => {
        return agentResult.error || (agentResult.status && agentResult.status.state === 'failed');
      });
      
      if (anyArrayItemFailed) {
        console.log('[WebhookServer] Found failed item in results array - marking as failed');
        return false;
      }
    }
    
    // FOURTH: Check status state directly in result
    if (result.status && result.status.state) {
      if (result.status.state === 'failed') {
        console.log('[WebhookServer] Found failed status state in top-level result');
        return false;
      }
    }
    
    // At this point, we've checked all possible failure indicators and found none
    // If we're still here, the webhook is considered successful
    console.log('[WebhookServer] No failure indicators found - marking as successful');
    return true;
  }

  private updateAgentInvocationStats(agentType: string): void {
    if (agentType === 'github') {
      this.stats.agentInvocations.github++;
    } else if (agentType === 'slack') {
      this.stats.agentInvocations.slack++;
    } else if (agentType === 'bench') {
      this.stats.agentInvocations.bench++;
    } else if (agentType === 'host') {
      this.stats.agentInvocations.host++;
    }
  }
} 