document.addEventListener('DOMContentLoaded', function() {
  // Globals
  const WEBHOOK_API_URL = '/api/webhooks';
  const TEST_WEBHOOK_API_URL = '/api/test/webhook';
  const STATS_API_URL = '/api/stats';
  const LOG_API_URL = '/api/logs';
  const HOST_AGENT_URL = 'http://localhost:41240';
  const HOST_AGENT_API_URL = 'http://localhost:41241'; // API server port
  const HOST_AGENT_RELOAD_URL = `${HOST_AGENT_API_URL}/api/reload-config`;
  let currentWebhooks = [];
  let webhookStats = {
    totalProcessed: 0,
    agentInvocations: {
      host: 0,
      github: 0,
      slack: 0,
      bench: 0
    },
    recentWebhooks: []
  };
  
  // DOM Elements
  const webhookList = document.getElementById('webhookList');
  const webhookSelect = document.getElementById('webhookSelect');
  const jsonEditor = document.getElementById('jsonEditor');
  const responseCard = document.getElementById('responseCard');
  const responseContent = document.getElementById('responseContent');
  const btnFormatJson = document.getElementById('btnFormatJson');
  const btnSendWebhook = document.getElementById('btnSendWebhook');
  const btnNewWebhook = document.getElementById('btnNewWebhook');
  const webhookForm = document.getElementById('webhookForm');
  const btnSaveWebhook = document.getElementById('btnSaveWebhook');
  const btnDeleteWebhook = document.getElementById('btnDeleteWebhook');
  const terminalContent = document.getElementById('terminal-content');
  const selectedAgentName = document.getElementById('selected-agent-name');
  const agentStatusIndicator = document.getElementById('agent-status-indicator');
  const agentUrl = document.getElementById('agent-url');
  const webhookServerStatus = document.getElementById('webhookServerStatus');

  // Main content sections
  const dashboardSection = document.getElementById('dashboard');
  const agentTerminalSection = document.getElementById('agent-terminal');
  const webhooksSection = document.getElementById('webhooks');
  const testSection = document.getElementById('test');
  
  // Navigation links
  const navLinks = document.querySelectorAll('.nav-link');
  
  // Agent URLs for terminal connections
  let agentUrls = {
    host: "http://localhost:41240",
    slack: "http://localhost:41243", 
    github: "http://localhost:41245",
    bench: "http://localhost:41246"
  };

  // Track which agents are remote vs local
  let agentStatus = {
    host: { isLocal: true, url: "http://localhost:41240" },
    slack: { isLocal: true, url: "http://localhost:41243" },
    github: { isLocal: true, url: "http://localhost:41245" },
    bench: { isLocal: true, url: "http://localhost:41246" }
  };
  
  // Default webhook test payload
  // Fake transcript for testing
  const defaultPayload = {
    transcript: `Meeting Transcript: Sales Discovery Call with Snowflake - ${new Date().toLocaleDateString()}

Participants:
- Sarah Johnson (Account Executive, Bench)
- Subramanian Muralidhar (CTO, Snowflake) [1]
- Vivek Raghunathan (SVP of Engineering, Snowflake) [2]

Sarah: Thank you for joining the call today. We're excited to discuss how our AI platform could help with your automation needs.

Subramanian Muralidhar: Thanks for setting this up. We've been looking for a solution to automate our development workflows.

Vivek Raghunathan: Yes, particularly around code reviews and bug triage. Our team is spending too much time on these tasks.

Sarah: I understand. Our platform has specific features for development workflows. Let me show you how it works.

Subramanian Muralidhar: That looks promising. One question - we found a bug in our trial where the AI sometimes misclassifies the severity of bugs.

Sarah: I'll make a note of that and have our engineers look into it. I'll create a bug report for this issue.

Vivek Raghunathan: Also, we'd like to integrate this with our Slack channels for team notifications. Is that possible?

Sarah: Absolutely! We have robust Slack integration capabilities. I'll share more details about that.

Subramanian Muralidhar: Great. We're also using GitHub for tracking our development workflow. Can your system integrate with GitHub for issue management?

Sarah: Yes, we offer GitHub integration as well. I'll send you documentation on that.

Vivek Raghunathan: This sounds like it could work for us. What would the next steps be?

Sarah: I'll send a proposal with pricing and implementation details by tomorrow. Should I include anyone else?

Subramanian Muralidhar: Please add our VP of Engineering to the proposal. I'll share their contact details after the call.

Sarah: Perfect! Thank you for your time today. I look forward to working with Snowflake.
`
  };
  
  // Initialize the application
  function init() {
    console.log("Initializing application");
    
    // Create dashboard first to ensure it exists
    createDashboardUI();
    
    // Initialize agent detection first, then setup sidebar
    initializeAgentDetection().then(() => {
      // Update agent sidebar after detection completes
      setupAgentSidebar();
      console.log('Agent detection and sidebar setup complete');
    });
    
    // Set up other components
    setupEventListeners();
    fetchWebhooks();
    initializeTerminal();
    setupNavigation();
    updateServerStatus();
    
    // Initialize dashboard with more robust error handling
    initDashboard();
    
    // Hide all agent items active class
    document.querySelectorAll('.agent-item').forEach(item => {
      item.classList.remove('active');
    });
    
    // Make sure the UI is showing the correct section based on URL hash
    const currentHash = window.location.hash || '#dashboard';
    handleNavigation(currentHash);
  }
  
  // Initialize dashboard with webhook statistics
  function initDashboard() {
    try {
      // Ensure dashboard exists before trying to update it
      if (!document.getElementById('webhook-stats')) {
        console.log("Dashboard container missing during initialization, creating it");
        createDashboardUI();
      } else {
        console.log("Dashboard already exists, just updating stats");
      }
      
      // Fetch real statistics from the API
      fetchWebhookStats();
      
      // No need for setInterval here anymore as fetchWebhookStats has its own refresh mechanism
    } catch (error) {
      console.error("Error during dashboard initialization:", error);
      
      // Fallback - create a basic dashboard with default data
      if (!document.getElementById('webhook-stats')) {
        console.log("Creating default dashboard due to error");
        createDashboardUI();
      }
    }
  }
  
  // Fetch webhook statistics from API
  async function fetchWebhookStats() {
    try {
      console.log("Fetching webhook stats from API");
      const response = await fetch(STATS_API_URL);
      if (!response.ok) {
        throw new Error(`Failed to fetch stats: ${response.status} ${response.statusText}`);
      }
      
      // Update global stats object
      const data = await response.json();
      console.log("Stats received:", data);
      
      // Check if there are any processing webhooks
      const hasProcessingWebhooks = data.recentWebhooks.some(webhook => webhook.status === 'processing');
      
      // Update the stats object
      webhookStats = data;
      
      // Update dashboard with new stats
      updateDashboard();
      
      // Schedule next refresh - more frequently if there are processing webhooks
      const refreshInterval = hasProcessingWebhooks ? 2000 : 30000; // 2 seconds vs 30 seconds
      setTimeout(fetchWebhookStats, refreshInterval);
    } catch (err) {
      console.error('Error fetching webhook stats:', err);
      
      // If we have an error, just use the default stats that are already initialized
      console.log("Using default stats due to fetch error");
      updateDashboard();
      
      // Try again in 30 seconds
      setTimeout(fetchWebhookStats, 30000);
    }
  }
  
  // Update dashboard with latest webhook statistics
  function updateDashboard() {
    console.log("Updating dashboard with stats:", webhookStats);
    
    // Create or update dashboard UI
    if (!document.getElementById('webhook-stats')) {
      console.log("Dashboard element not found, creating new one");
      createDashboardUI();
      
      // Make sure it's visible in agent-terminal section
      const agentTerminalSection = document.getElementById('agent-terminal');
      if (agentTerminalSection) {
        agentTerminalSection.style.display = 'block';
      }
      
      // Hide terminal container if it exists
      const terminalContainer = document.querySelector('.terminal-container');
      if (terminalContainer) {
        terminalContainer.style.display = 'none';
      }
    } else {
      console.log("Dashboard element found, updating content");
      // Update existing dashboard with new data
      updateDashboardContent();
    }
  }
  
  // Create initial dashboard UI
  function createDashboardUI() {
    console.log("Creating dashboard UI");
    const dashboardHtml = `
      <div id="webhook-stats" class="row mb-4">
        <div class="col-md-12 mb-4">
          <div class="d-flex justify-content-between align-items-center mb-3">
            <h3 class="dashboard-title">
              <i class="fas fa-tachometer-alt me-2"></i> Dashboard
            </h3>
          </div>
          <div class="card">
            <div class="card-header dashboard-header">
              WEBHOOK STATISTICS
            </div>
            <div class="card-body dashboard-card">
              <div class="row">
                <div class="col-md-12">
                  <h5 class="mb-3 text-light">Agent Invocations</h5>
                  <div class="row">
                    <div class="col-md-3 text-center mb-3">
                      <div class="card bg-dark">
                        <div class="card-body p-2">
                          <h3 class="text-light" id="host-agent-count">${webhookStats.agentInvocations.host}</h3>
                          <p class="mb-0">HOST AGENT</p>
                        </div>
                      </div>
                    </div>
                    <div class="col-md-3 text-center mb-3">
                      <div class="card bg-dark">
                        <div class="card-body p-2">
                          <h3 class="text-light" id="github-agent-count">${webhookStats.agentInvocations.github}</h3>
                          <p class="mb-0">GITHUB AGENT</p>
                        </div>
                      </div>
                    </div>
                    <div class="col-md-3 text-center mb-3">
                      <div class="card bg-dark">
                        <div class="card-body p-2">
                          <h3 class="text-light" id="slack-agent-count">${webhookStats.agentInvocations.slack}</h3>
                          <p class="mb-0">SLACK AGENT</p>
                        </div>
                      </div>
                    </div>
                    <div class="col-md-3 text-center mb-3">
                      <div class="card bg-dark">
                        <div class="card-body p-2">
                          <h3 class="text-light" id="bench-agent-count">${webhookStats.agentInvocations.bench}</h3>
                          <p class="mb-0">BENCH AGENT</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
              <div class="row mt-4">
                <div class="col-md-12">
                  <h5 class="mb-3 text-light">Recent Webhook Invocations</h5>
                  <div class="table-responsive">
                    <table class="table table-dark table-hover webhook-table">
                      <thead>
                        <tr>
                          <th>ID</th>
                          <th>NAME</th>
                          <th>TIMESTAMP</th>
                          <th>STATUS</th>
                        </tr>
                      </thead>
                      <tbody id="recent-webhooks-table">
                        ${generateWebhookTableRows(webhookStats.recentWebhooks)}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <!-- Webhook Details Modal -->
      <div class="modal fade" id="webhookDetailsModal" tabindex="-1" aria-labelledby="webhookDetailsModalLabel" aria-hidden="true">
        <div class="modal-dialog modal-xl modal-dialog-scrollable">
          <div class="modal-content bg-dark text-light">
            <div class="modal-header">
              <h5 class="modal-title" id="webhookDetailsModalLabel">Webhook Invocation Details</h5>
              <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body" id="webhookDetailsModalBody">
              <!-- Agent Details Section (At the top) -->
              <div class="row" id="agentDetailsContainer">
                <div class="col-12">
                  <h6>Agent Details</h6>
                  <div id="agentDetailsContent"></div>
                </div>
              </div>
              
              <!-- JSON Data Section (At the bottom, collapsed by default) -->
              <div class="row mt-4">
                <div class="col-12">
                  <div class="accordion" id="webhookDataAccordion">
                    <div class="accordion-item">
                      <h2 class="accordion-header" id="requestDataHeader">
                        <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#requestDataCollapse" aria-expanded="false" aria-controls="requestDataCollapse">
                          <i class="fas fa-arrow-right me-2"></i> Request Payload
                        </button>
                      </h2>
                      <div id="requestDataCollapse" class="accordion-collapse collapse" aria-labelledby="requestDataHeader" data-bs-parent="#webhookDataAccordion">
                        <div class="accordion-body">
                          <pre id="webhookRequestPayload" class="json-highlight"></pre>
                        </div>
                      </div>
                    </div>
                    <div class="accordion-item">
                      <h2 class="accordion-header" id="resultDataHeader">
                        <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#resultDataCollapse" aria-expanded="false" aria-controls="resultDataCollapse">
                          <i class="fas fa-reply me-2"></i> Result Payload
                        </button>
                      </h2>
                      <div id="resultDataCollapse" class="accordion-collapse collapse" aria-labelledby="resultDataHeader" data-bs-parent="#webhookDataAccordion">
                        <div class="accordion-body">
                          <pre id="webhookResultPayload" class="json-highlight"></pre>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
            </div>
          </div>
        </div>
      </div>
    `;
    
    // First try to use the dedicated dashboard section
    const dashboardSection = document.getElementById('dashboard');
    if (dashboardSection) {
      console.log("Found dashboard section, inserting content");
      dashboardSection.innerHTML = dashboardHtml;
      setupWebhookTableRowListeners();
      return;
    }
    
    // Fallback to inserting into main-content if dashboard section doesn't exist
    const mainContent = document.getElementById('main-content');
    if (mainContent) {
      console.log("Found main-content element, inserting dashboard");
      mainContent.insertAdjacentHTML('afterbegin', dashboardHtml);
      setupWebhookTableRowListeners();
      return;
    }
    
    // Last resort - try to insert directly into agent-terminal section
    const agentTerminalSection = document.getElementById('agent-terminal');
    if (agentTerminalSection) {
      console.log("Using fallback: Inserting into agent-terminal section");
      agentTerminalSection.insertAdjacentHTML('afterbegin', dashboardHtml);
      setupWebhookTableRowListeners();
    } else {
      console.error("Could not find any appropriate container for dashboard");
    }
  }
  
  // Update existing dashboard content with new data
  function updateDashboardContent() {
    // Update agent counts
    document.getElementById('host-agent-count').textContent = webhookStats.agentInvocations.host;
    document.getElementById('github-agent-count').textContent = webhookStats.agentInvocations.github;
    document.getElementById('slack-agent-count').textContent = webhookStats.agentInvocations.slack;
    document.getElementById('bench-agent-count').textContent = webhookStats.agentInvocations.bench;
    
    // Update webhook table
    const recentWebhooksTable = document.getElementById('recent-webhooks-table');
    if (recentWebhooksTable) {
      recentWebhooksTable.innerHTML = generateWebhookTableRows(webhookStats.recentWebhooks);
      
      // Add event listeners to updated rows
      setupWebhookTableRowListeners();
    }
  }
  
  // Generate HTML for webhook table rows
  function generateWebhookTableRows(webhooks) {
    if (!webhooks || webhooks.length === 0) {
      return '<tr><td colspan="4" class="text-center">No webhook invocations yet</td></tr>';
    }
    
    return webhooks.map(webhook => {
      const dateObj = new Date(webhook.timestamp);
      const formattedDate = `${dateObj.toLocaleDateString()}, ${dateObj.toLocaleTimeString()}`;
      
      let statusClass, statusText;
      
      // Handle processing status differently from success/failed
      if (webhook.status === 'processing') {
        statusClass = 'info';
        statusText = 'PROCESSING';
      } else {
        // Re-evaluate the status based on actual agent results for accuracy
        const actualStatus = determineActualWebhookStatus(webhook);
        statusClass = actualStatus === 'success' ? 'success' : 'danger';
        statusText = actualStatus === 'success' ? 'SUCCESS' : 'FAILED';
      }
      
      return `
        <tr class="webhook-row" data-id="${webhook.id}">
          <td>${webhook.id}</td>
          <td>${webhook.name}</td>
          <td>${formattedDate}</td>
          <td><span class="badge bg-${statusClass}">${statusText}</span></td>
        </tr>
      `;
    }).join('');
  }
  
  // Re-evaluate webhook status based on actual agent results
  function determineActualWebhookStatus(webhook) {
    // If webhook is still processing, return processing
    if (webhook.status === 'processing') {
      return 'processing';
    }
    
    // If there's no result data, fall back to stored status
    if (!webhook.details || !webhook.details.result) {
      return webhook.status;
    }
    
    const result = webhook.details.result;
    
    try {
      // FIRST: Check for agentResults in the new JSON format
      if (result.status && result.status.message && 
          result.status.message.parts && result.status.message.parts.length > 0) {
        
        const textPart = result.status.message.parts.find(part => part.type === 'text');
        if (textPart && textPart.text) {
          try {
            // Parse the entire JSON response to look for agentResults array
            const responseJson = JSON.parse(textPart.text);
            
            // Check if agentResults array exists
            if (responseJson.agentResults && Array.isArray(responseJson.agentResults)) {
              if (responseJson.agentResults.length === 0) {
                return 'failed'; // No agent results = failure
              }
              
              // Check if ANY agent failed in the agentResults array
              const failedAgents = responseJson.agentResults.filter(agentResult => 
                agentResult.state === 'failed' || agentResult.status === 'failed'
              );
              
              if (failedAgents.length > 0) {
                return 'failed'; // At least one agent failed
              }
              
              return 'success'; // All agents succeeded
            }
          } catch (parseErr) {
            // Fall through to legacy checks
          }
        }
      }
      
      // SECOND: Check direct results object format
      if (result.results && typeof result.results === 'object' && !Array.isArray(result.results)) {
        // Check if ANY agent has an error or failed state
        const anyAgentFailed = Object.entries(result.results).some(([agentName, agentResult]) => {
          // Check for error field
          if (agentResult.error) {
            return true;
          }
          
          // Check for failed state
          if (agentResult.status && agentResult.status.state === 'failed') {
            return true;
          }
          
          return false;
        });
        
        if (anyAgentFailed) {
          return 'failed';
        }
      }
      
      // THIRD: Check for array-type results
      if (result.results && Array.isArray(result.results)) {
        if (result.results.length === 0) {
          return 'failed'; // No results at all
        }
        
        // Check for any failed items in the array
        const anyArrayItemFailed = result.results.some((agentResult) => {
          return agentResult.error || (agentResult.status && agentResult.status.state === 'failed');
        });
        
        if (anyArrayItemFailed) {
          return 'failed';
        }
      }
      
      // FOURTH: Check status state directly in result
      if (result.status && result.status.state === 'failed') {
        return 'failed';
      }
      
      // FIFTH: Check for obvious error indicators
      if (result.error || result.mockResponse) {
        return 'failed';
      }
      
    } catch (err) {
      console.error('Error determining actual webhook status:', err);
    }
    
    // If we can't determine failure, fall back to stored status or assume success
    return webhook.status || 'success';
  }
  
  // Add click event listeners to webhook table rows
  function setupWebhookTableRowListeners() {
    document.querySelectorAll('.webhook-row').forEach(row => {
      row.addEventListener('click', function() {
        const webhookId = this.getAttribute('data-id');
        showWebhookDetails(webhookId);
      });
    });
  }
  
  // Show webhook details in modal
  async function showWebhookDetails(webhookId) {
    try {
      // Fetch webhook details
      const response = await fetch(`${STATS_API_URL}/webhook/${webhookId}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch webhook details: ${response.status} ${response.statusText}`);
      }
      
      const webhookData = await response.json();
      
      // Extract agent results for determining actual status
      let agentResults = null;
      let hasFailedAgents = false;
      let failedAgents = [];
      let agentMessages = {}; // To store messages sent to each agent
      
      // Try to extract agent results for more accurate status
      try {
        // First, try to get agent messages from the top-level tasks property
        if (webhookData.details.result && webhookData.details.result.tasks) {
          agentMessages = webhookData.details.result.tasks;
          console.log("Found tasks in result:", agentMessages);
        }
        // Then check if we have agent messages in the agentMessages property
        else if (webhookData.details.agentMessages) {
          agentMessages = webhookData.details.agentMessages;
          console.log("Found agentMessages:", agentMessages);
        }

        // Check for agentResults in the text response (our new format)
        if (webhookData.details.result && 
            webhookData.details.result.status && 
            webhookData.details.result.status.message && 
            webhookData.details.result.status.message.parts) {
          
          // Locate the text part that contains the JSON response
          const textPart = webhookData.details.result.status.message.parts.find(part => part.type === 'text');
          if (textPart && textPart.text) {
            try {
              // Parse the entire JSON response
              const responseJson = JSON.parse(textPart.text);
              console.log("Parsed response JSON:", responseJson);
              
              // Check if agentResults array exists
              if (responseJson.agentResults && Array.isArray(responseJson.agentResults)) {
                agentResults = {};
                
                // Convert array format to object format for easier processing
                responseJson.agentResults.forEach(agentResult => {
                  const agentName = agentResult.agent;
                  agentResults[agentName] = {
                    id: `${agentName}-${webhookData.id}`,
                    status: {
                      state: agentResult.state || 'completed',
                      message: {
                        parts: [{
                          type: 'text',
                          text: agentResult.response || 'No response'
                        }]
                      },
                      timestamp: webhookData.timestamp
                    },
                    artifacts: []
                  };
                });
                
                console.log("Converted agentResults:", agentResults);
                
                // Determine if any agents failed
                failedAgents = responseJson.agentResults
                  .filter(result => result.state === 'failed')
                  .map(result => result.agent);
                  
                hasFailedAgents = failedAgents.length > 0;
              }
            } catch (parseError) {
              console.error("Error parsing response JSON:", parseError);
              console.log("Response text that failed to parse:", textPart.text);
            }
          }
        }

        // Fallback: First check direct results array
        if (!agentResults && webhookData.details.result && 
            webhookData.details.result.results) {
          const results = webhookData.details.result.results;
          failedAgents = results
            .filter(result => result.status === 'failed')
            .map(result => result.agent || 'Unknown agent');
            
          hasFailedAgents = failedAgents.length > 0;
        }
        
        // Legacy fallback: check nested results in text payload
        if (!agentResults && webhookData.details.result && 
            webhookData.details.result.status && 
            webhookData.details.result.status.message && 
            webhookData.details.result.status.message.parts) {
          
          // Locate the text part that might contain the results
          const textPart = webhookData.details.result.status.message.parts.find(part => part.type === 'text');
          if (textPart && textPart.text) {
            // Try to extract the JSON part
            const resultMatch = textPart.text.match(/Results: (\{.*\})/s);
            if (resultMatch && resultMatch[1]) {
              agentResults = JSON.parse(resultMatch[1]);
              
              // Determine if any agents failed
              failedAgents = Object.keys(agentResults).filter(agentName => {
                const agentData = agentResults[agentName];
                return agentData.status && agentData.status.state === 'failed';
              });
              
              hasFailedAgents = failedAgents.length > 0;
            }
          }
        }
      } catch (err) {
        console.error("Error determining agent status:", err);
      }
      
      // Update modal title with status badge - use official status but warn if there are failed agents
      const status = webhookData.status === 'processing' 
        ? 'processing' 
        : (hasFailedAgents ? 'failed' : webhookData.status);
        
      let statusClass, statusText;
      if (status === 'processing') {
        statusClass = 'info';
        statusText = 'PROCESSING';
      } else {
        statusClass = status === 'success' ? 'success' : 'danger';
        statusText = status === 'success' ? 'SUCCESS' : 'FAILED';
      }
      
      document.getElementById('webhookDetailsModalLabel').innerHTML = 
        `Webhook Invocation: ${webhookData.name} <span class="badge bg-${statusClass} ms-2">${statusText}</span>`;
      
      // Generate agent details content
      const agentDetailsContainer = document.getElementById('agentDetailsContainer');
      const agentDetailsContent = document.getElementById('agentDetailsContent');
      
      // Clear previous agent details
      agentDetailsContent.innerHTML = '';
      
      // Check if webhook is still processing
      if (webhookData.status === 'processing') {
        agentDetailsContainer.style.display = 'flex';
        agentDetailsContent.innerHTML = `
          <div class="alert alert-info mb-3">
            <i class="fas fa-spinner fa-spin me-2"></i>
            This webhook is still being processed. Results will appear when processing is complete.
          </div>
        `;
        
        // Auto-refresh the details after a few seconds
        setTimeout(() => {
          showWebhookDetails(webhookId);
        }, 3000);
      } 
      // Check if we have agent results to display
      else if (agentResults) {
        agentDetailsContainer.style.display = 'flex';
        
        // Create a better formatted display for agent results
        const agentNames = Object.keys(agentResults);
        
        // Add a summary if there are failures
        let summaryHtml = '';
        if (failedAgents.length > 0) {
          summaryHtml = `
            <div class="alert alert-danger mb-3">
              <i class="fas fa-exclamation-triangle me-2"></i>
              ${failedAgents.length} of ${agentNames.length} agents failed: ${failedAgents.join(', ')}
            </div>
          `;
        }
        
        // Create accordion for agent details
        const accordionHtml = `
          ${summaryHtml}
          <div class="accordion" id="agentAccordion">
            ${agentNames.map((agentName, index) => {
              const agentData = agentResults[agentName];
              const agentType = agentName.toLowerCase();
              const iconClass = getAgentIconClass(agentType);
              
              // Determine status class based on agent state
              const isSuccess = agentData.status && agentData.status.state !== 'failed';
              const statusClass = isSuccess ? 'success' : 'danger';
              const statusText = isSuccess ? 'Success' : 'Failed';
              
              // Extract the agent's message text if available
              let messageText = '';
              if (agentData.status && agentData.status.message && agentData.status.message.parts) {
                const textPart = agentData.status.message.parts.find(part => part.type === 'text');
                if (textPart) {
                  messageText = textPart.text;
                }
              }
              
              // Get the message sent to this agent (if available)
              let sentTaskMessage = '';
              if (agentMessages && agentMessages[agentType]) {
                sentTaskMessage = `
                  <div class="mt-3 mb-3 p-3 border border-info bg-dark">
                    <h6 class="text-info"><i class="fas fa-paper-plane me-2"></i>Host Agent Message:</h6>
                    <p class="mb-0 text-light">${convertUrlsToLinks(agentMessages[agentType])}</p>
                  </div>
                `;
              } else if (agentData.task && agentData.task.message && agentData.task.message.parts && agentData.task.message.parts[0]) {
                sentTaskMessage = `
                  <div class="mt-3 mb-3 p-3 border border-info bg-dark">
                    <h6 class="text-info"><i class="fas fa-paper-plane me-2"></i>Host Agent Message:</h6>
                    <p class="mb-0 text-light">${convertUrlsToLinks(agentData.task.message.parts[0].text || 'No message content')}</p>
                  </div>
                `;
              }
              
              // If no task message was found, add a placeholder for debugging
              if (!sentTaskMessage) {
                sentTaskMessage = `
                  <div class="mt-3 mb-3 p-3 border border-warning bg-dark">
                    <h6 class="text-warning"><i class="fas fa-exclamation-triangle me-2"></i>Host Agent Message:</h6>
                    <p class="mb-0 text-light">No message content found. Check server logs for details.</p>
                  </div>
                `;
              }
              
              // Format artifacts if any
              let artifactsHtml = '';
              if (agentData.artifacts && agentData.artifacts.length > 0) {
                artifactsHtml = `
                  <div class="mt-3">
                    <h6>Artifacts</h6>
                    <div class="list-group">
                      ${agentData.artifacts.map(artifact => {
                        // Try to parse any JSON in artifact parts
                        let artifactContent = '';
                        if (artifact.parts && artifact.parts.length > 0) {
                          try {
                            const textPart = artifact.parts.find(part => part.type === 'text');
                            if (textPart && textPart.text) {
                              // Check if it's JSON and can be parsed
                              if (textPart.text.trim().startsWith('{')) {
                                const parsedJson = JSON.parse(textPart.text);
                                artifactContent = `<pre class="json-highlight mt-2">${JSON.stringify(parsedJson, null, 2)}</pre>`;
                              } else {
                                artifactContent = `<pre class="mt-2">${textPart.text}</pre>`;
                              }
                            }
                          } catch (e) {
                            artifactContent = `<pre class="mt-2">${artifact.parts[0]?.text || 'No content'}</pre>`;
                          }
                        }
                        
                        return `
                          <div class="list-group-item bg-dark">
                            <div class="d-flex justify-content-between align-items-center">
                              <h6 class="mb-0">${artifact.name || 'Unnamed Artifact'}</h6>
                              <span class="badge bg-secondary">${artifact.lastChunk ? 'Complete' : 'Partial'}</span>
                            </div>
                            ${artifactContent}
                          </div>
                        `;
                      }).join('')}
                    </div>
                  </div>
                `;
              }
              
              return `
                <div class="accordion-item">
                  <h2 class="accordion-header" id="heading${index}">
                    <button class="accordion-button ${statusClass === 'danger' ? 'bg-danger' : 'bg-success'}" type="button" data-bs-toggle="collapse" 
                            data-bs-target="#collapse${index}" aria-expanded="${index === 0 ? 'true' : 'false'}" aria-controls="collapse${index}">
                      <i class="${iconClass} me-2"></i> 
                      <span class="me-2">${agentName}</span>
                      <span class="badge bg-${statusClass} ms-auto">${statusText}</span>
                    </button>
                  </h2>
                  <div id="collapse${index}" class="accordion-collapse collapse ${index === 0 ? 'show' : ''}" aria-labelledby="heading${index}" data-bs-parent="#agentAccordion">
                    <div class="accordion-body">
                      ${sentTaskMessage}
                      <div class="agent-message bg-${statusClass}">
                        <p class="mb-0"><strong>Response:</strong> ${convertUrlsToLinks(messageText)}</p>
                      </div>
                      <div class="agent-details">
                        <div class="row">
                          <div class="col-md-6">
                            <p><strong>ID:</strong> ${agentData.id}</p>
                            <p><strong>Status:</strong> ${agentData.status?.state || 'Unknown'}</p>
                          </div>
                          <div class="col-md-6">
                            <p><strong>Timestamp:</strong> ${new Date(agentData.status?.timestamp).toLocaleString()}</p>
                          </div>
                        </div>
                      </div>
                      ${artifactsHtml}
                    </div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        `;
        
        agentDetailsContent.innerHTML = accordionHtml;
      } else if (webhookData.details.result && webhookData.details.result.results) {
        // Fallback to the original method if needed
        agentDetailsContainer.style.display = 'flex';
        
        // Create a list of agent results from the results object
        const resultsArray = [];
        const agentTypes = Object.keys(webhookData.details.result.results);
        
        for (const agentType of agentTypes) {
          const result = webhookData.details.result.results[agentType];
          
          // Add the agent type to the result for identification
          result.agent = agentType;
          
          // Add to results array
          resultsArray.push(result);
          
          // If the agent failed, add to failed agents list
          if (result.status && result.status.state === 'failed') {
            failedAgents.push(agentType);
          }
        }
        
        // Add a summary if there are failures
        let summaryHtml = '';
        if (failedAgents.length > 0) {
          summaryHtml = `
            <div class="alert alert-danger mb-3">
              <i class="fas fa-exclamation-triangle me-2"></i>
              ${failedAgents.length} of ${agentTypes.length} agents failed: ${failedAgents.join(', ')}
            </div>
          `;
        }
        
        // Create accordion for agent details
        const accordionHtml = `
          ${summaryHtml}
          <div class="accordion" id="agentAccordion">
            ${agentTypes.map((agentType, index) => {
              const agentData = webhookData.details.result.results[agentType];
              const iconClass = getAgentIconClass(agentType);
              
              // Determine status class based on agent state
              const isSuccess = agentData.status && agentData.status.state !== 'failed';
              const statusClass = isSuccess ? 'success' : 'danger';
              const statusText = isSuccess ? 'Success' : 'Failed';
              
              // Extract the agent's message text if available
              let messageText = '';
              if (agentData.status && agentData.status.message && agentData.status.message.parts) {
                const textPart = agentData.status.message.parts.find(part => part.type === 'text');
                if (textPart) {
                  messageText = textPart.text;
                }
              }
              
              // Get the message sent to this agent (if available)
              let sentTaskMessage = '';
              if (agentMessages && agentMessages[agentType]) {
                sentTaskMessage = `
                  <div class="mt-3 mb-3 p-3 border border-info bg-dark">
                    <h6 class="text-info"><i class="fas fa-paper-plane me-2"></i>Host Agent Message:</h6>
                    <p class="mb-0 text-light">${convertUrlsToLinks(agentMessages[agentType])}</p>
                  </div>
                `;
              } else if (agentData.task && agentData.task.message && agentData.task.message.parts && agentData.task.message.parts[0]) {
                sentTaskMessage = `
                  <div class="mt-3 mb-3 p-3 border border-info bg-dark">
                    <h6 class="text-info"><i class="fas fa-paper-plane me-2"></i>Host Agent Message:</h6>
                    <p class="mb-0 text-light">${convertUrlsToLinks(agentData.task.message.parts[0].text || 'No message content')}</p>
                  </div>
                `;
              }
              
              // If no task message was found, add a placeholder for debugging
              if (!sentTaskMessage) {
                sentTaskMessage = `
                  <div class="mt-3 mb-3 p-3 border border-warning bg-dark">
                    <h6 class="text-warning"><i class="fas fa-exclamation-triangle me-2"></i>Host Agent Message:</h6>
                    <p class="mb-0 text-light">No message content found. Check server logs for details.</p>
                  </div>
                `;
              }
              
              // Format artifacts if any
              let artifactsHtml = '';
              if (agentData.artifacts && agentData.artifacts.length > 0) {
                artifactsHtml = `
                  <div class="mt-3">
                    <h6>Artifacts</h6>
                    <div class="list-group">
                      ${agentData.artifacts.map(artifact => {
                        // Try to parse any JSON in artifact parts
                        let artifactContent = '';
                        if (artifact.parts && artifact.parts.length > 0) {
                          try {
                            const textPart = artifact.parts.find(part => part.type === 'text');
                            if (textPart && textPart.text) {
                              // Check if it's JSON and can be parsed
                              if (textPart.text.trim().startsWith('{')) {
                                const parsedJson = JSON.parse(textPart.text);
                                artifactContent = `<pre class="json-highlight mt-2">${JSON.stringify(parsedJson, null, 2)}</pre>`;
                              } else {
                                artifactContent = `<pre class="mt-2">${textPart.text}</pre>`;
                              }
                            }
                          } catch (e) {
                            artifactContent = `<pre class="mt-2">${artifact.parts[0]?.text || 'No content'}</pre>`;
                          }
                        }
                        
                        return `
                          <div class="list-group-item bg-dark">
                            <div class="d-flex justify-content-between align-items-center">
                              <h6 class="mb-0">${artifact.name || 'Unnamed Artifact'}</h6>
                              <span class="badge bg-secondary">${artifact.lastChunk ? 'Complete' : 'Partial'}</span>
                            </div>
                            ${artifactContent}
                          </div>
                        `;
                      }).join('')}
                    </div>
                  </div>
                `;
              }
              
              return `
                <div class="accordion-item">
                  <h2 class="accordion-header" id="heading${index}">
                    <button class="accordion-button ${statusClass === 'danger' ? 'bg-danger' : 'bg-success'}" type="button" data-bs-toggle="collapse" 
                            data-bs-target="#collapse${index}" aria-expanded="${index === 0 ? 'true' : 'false'}" aria-controls="collapse${index}">
                      <i class="${iconClass} me-2"></i> 
                      <span class="me-2">${agentType}</span>
                      <span class="badge bg-${statusClass} ms-auto">${statusText}</span>
                    </button>
                  </h2>
                  <div id="collapse${index}" class="accordion-collapse collapse ${index === 0 ? 'show' : ''}" aria-labelledby="heading${index}" data-bs-parent="#agentAccordion">
                    <div class="accordion-body">
                      ${sentTaskMessage}
                      <div class="agent-message bg-${statusClass}">
                        <p class="mb-0"><strong>Response:</strong> ${convertUrlsToLinks(messageText)}</p>
                      </div>
                      <div class="agent-details">
                        <div class="row">
                          <div class="col-md-6">
                            <p><strong>ID:</strong> ${agentData.id}</p>
                            <p><strong>Status:</strong> ${agentData.status?.state || 'Unknown'}</p>
                          </div>
                          <div class="col-md-6">
                            <p><strong>Timestamp:</strong> ${new Date(agentData.status?.timestamp).toLocaleString()}</p>
                          </div>
                        </div>
                      </div>
                      ${artifactsHtml}
                    </div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        `;
        
        agentDetailsContent.innerHTML = accordionHtml;
      } else {
        agentDetailsContainer.style.display = 'none';
      }
      
      // Update the JSON data in the accordions at the bottom
      const requestPayload = document.getElementById('webhookRequestPayload');
      const resultPayload = document.getElementById('webhookResultPayload');
      
      if (requestPayload && resultPayload) {
        // Format and display request payload
        requestPayload.textContent = JSON.stringify(webhookData.details.webhookData, null, 2);
        
        // Format and display result payload
        resultPayload.textContent = JSON.stringify(webhookData.details.result, null, 2);
        
        // Apply syntax highlighting
        formatJson();
      }
      
      // Show the modal
      const modalElement = document.getElementById('webhookDetailsModal');
      const modal = new bootstrap.Modal(modalElement, {
        backdrop: false  // Remove backdrop tint completely
      });
      modal.show();
    } catch (error) {
      console.error('Error showing webhook details:', error);
      alert(`Error showing webhook details: ${error.message}`);
    }
  }
  
  // Get icon class for agent type
  function getAgentIconClass(agentType) {
    if (agentType.includes('github')) {
      return 'fab fa-github';
    } else if (agentType.includes('slack')) {
      return 'fab fa-slack';
    } else if (agentType.includes('host')) {
      return 'fas fa-server';
    }
    return 'fas fa-robot';
  }
  
  // Convert URLs in text to clickable links
  function convertUrlsToLinks(text) {
    if (!text || typeof text !== 'string') return text;
    
    // First, convert newlines to HTML line breaks
    text = text.replace(/\n/g, '<br>');
    
    // Convert double asterisks (**text**) to bold
    text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    
    // Convert single asterisks (*text*) to italics (but avoid conflicting with double asterisks)
    text = text.replace(/(?<!\*)\*([^*]+?)\*(?!\*)/g, '<em>$1</em>');
    
    // URL regex pattern that matches http/https URLs
    const urlRegex = /(https?:\/\/[^\s<>"']+)/gi;
    
    return text.replace(urlRegex, (url) => {
      // Clean up any trailing punctuation that might not be part of the URL
      const cleanUrl = url.replace(/[.,;:!?]$/, '');
      const trailing = url.length > cleanUrl.length ? url.slice(-1) : '';
      
      return `<a href="${cleanUrl}" target="_blank" rel="noopener noreferrer" class="text-primary">${cleanUrl}</a>${trailing}`;
    });
  }
  
  // Set up event listeners
  function setupEventListeners() {
    // Format JSON button
    btnFormatJson.addEventListener('click', formatJson);
    
    // Send webhook button
    btnSendWebhook.addEventListener('click', sendWebhook);
    
    // New webhook button
    btnNewWebhook.addEventListener('click', () => showWebhookModal());
    
    // Save webhook button
    btnSaveWebhook.addEventListener('click', saveWebhook);
    
    // Delete webhook button
    btnDeleteWebhook.addEventListener('click', deleteWebhook);
    
    // Webhook select dropdown
    webhookSelect.addEventListener('change', updateTestPayload);
    
    // Listen for hash changes in URL
    window.addEventListener('hashchange', function() {
      handleNavigation(window.location.hash);
    });
    
    // Remove click functionality from webhook server status
    webhookServerStatus.addEventListener('click', function(e) {
      e.preventDefault();
      // No action needed - status indicator is display-only
    });
    
    // Back to Dashboard button
    const backToDashboardBtn = document.getElementById('backToDashboard');
    if (backToDashboardBtn) {
      backToDashboardBtn.addEventListener('click', function() {
        // Reset any selected agent
        document.querySelectorAll('.agent-item').forEach(item => {
          item.classList.remove('active');
        });
        
        // Navigate to dashboard
        window.location.hash = '#dashboard';
      });
    }
    
    // Start periodic server status check
    setInterval(updateServerStatus, 30000);
  }
  
  // Format JSON in the editor
  function formatJson() {
    try {
      const json = JSON.parse(jsonEditor.value);
      jsonEditor.value = JSON.stringify(json, null, 2);
    } catch (error) {
      alert('Invalid JSON: ' + error.message);
    }
  }
  
  // Handle navigation between sections based on hash
  function handleNavigation(hash) {
    const targetId = hash.substring(1) || 'dashboard';
    
    // Create dashboard if it doesn't exist and we're showing dashboard
    if ((targetId === 'dashboard' || targetId === 'agent-terminal') && !document.getElementById('webhook-stats')) {
      console.log("Creating dashboard because it's missing");
      createDashboardUI();
    }
    
    // Get the stats container now that we ensured it exists
    const statsContainer = document.getElementById('webhook-stats');
    
    // Hide all sections
    if (agentTerminalSection) agentTerminalSection.style.display = 'none';
    if (webhooksSection) webhooksSection.style.display = 'none';
    if (testSection) testSection.style.display = 'none';
    const dashboardSection = document.getElementById('dashboard');
    if (dashboardSection) dashboardSection.style.display = 'none';
    
    // Also explicitly hide stats container regardless of which tab we're switching to
    if (statsContainer) {
      statsContainer.style.display = 'none';
    }
    
    // Show the target section
    const targetSection = document.getElementById(targetId);
    if (targetSection) {
      targetSection.style.display = 'block';
      
      // Special handling for dashboard section
      if (targetId === 'dashboard') {
        // Always show agent-terminal section when dashboard is active
        if (agentTerminalSection) {
          agentTerminalSection.style.display = 'block';
        }
        
        // Show the stats
        if (statsContainer) {
          statsContainer.style.display = 'block';
        }
        
        // Hide the terminal container
        const terminalContainer = document.querySelector('.terminal-container');
        if (terminalContainer) {
          terminalContainer.style.display = 'none';
        }
        
        // Hide the agent header
        const agentHeader = document.querySelector('#agent-terminal .d-flex.justify-content-between.align-items-center');
        if (agentHeader) {
          agentHeader.style.display = 'none';
        }
      }
      // If we're switching to the agent terminal section, check if any agent is selected
      else if (targetId === 'agent-terminal') {
        // Check if any agent is active
        const activeAgent = document.querySelector('.agent-item.active');
        
        if (!activeAgent) {
          // If no agent is active, show the dashboard stats
          if (statsContainer) {
            statsContainer.style.display = 'block';
          } else {
            // This should never happen now, but just in case
            console.error("Stats container still not found after creating dashboard");
            
            // Force immediate recreation as a last resort
            createDashboardUI();
            
            // Try to show it after a short delay to ensure DOM is updated
            setTimeout(() => {
              const newStatsContainer = document.getElementById('webhook-stats');
              if (newStatsContainer) {
                newStatsContainer.style.display = 'block';
              }
            }, 50);
          }
          
          // Hide the terminal container if no agent is selected
          const terminalContainer = agentTerminalSection.querySelector('.terminal-container');
          if (terminalContainer) {
            terminalContainer.style.display = 'none';
          }
          
          // Hide the agent header
          const agentHeader = agentTerminalSection.querySelector('.d-flex.justify-content-between.align-items-center');
          if (agentHeader) {
            agentHeader.style.display = 'none';
          }
        } else {
          // If an agent is active, make sure stats are hidden and terminal is visible
          if (statsContainer) {
            statsContainer.style.display = 'none';
          }
          
          // Show the terminal container for the active agent
          const terminalContainer = agentTerminalSection.querySelector('.terminal-container');
          if (terminalContainer) {
            terminalContainer.style.display = 'block';
          }
          
          // Show the agent header
          const agentHeader = agentTerminalSection.querySelector('.d-flex.justify-content-between.align-items-center');
          if (agentHeader) {
            agentHeader.style.display = 'flex';
          }
          
          // Update terminal for the active agent
          const agentType = activeAgent.getAttribute('data-agent');
          updateAgentTerminal(agentType);
        }
      }
      
      // Update active nav link
      if (navLinks) {
        navLinks.forEach(link => {
          const href = link.getAttribute('href');
          // Skip if href is null
          if (!href) return;
          
          const linkTargetId = href.substring(1);
          if (linkTargetId === targetId) {
            link.classList.add('active');
          } else {
            link.classList.remove('active');
          }
        });
      }
    }
  }
  
  // Setup navigation
  function setupNavigation() {
    navLinks.forEach(link => {
      link.addEventListener('click', function(e) {
        e.preventDefault();
        
        // Get the target from href attribute
        const target = this.getAttribute('href');
        
        // Special handling for Dashboard link to reset agents and force stats to show
        if (target === '#dashboard' || (this.textContent && this.textContent.trim() === 'Dashboard')) {
          // Ensure we're using the correct hash for the dashboard
          const dashboardTarget = '#dashboard';
          
          // Reset any selected agent
          document.querySelectorAll('.agent-item').forEach(item => {
            item.classList.remove('active');
          });
          
          // Create dashboard if it doesn't exist
          if (!document.getElementById('webhook-stats')) {
            console.log("Creating dashboard for Dashboard link click");
            createDashboardUI();
          }
          
          // Force stats to show when going to dashboard
          const statsContainer = document.getElementById('webhook-stats');
          if (statsContainer) {
            // Show agent-terminal section first
            if (agentTerminalSection) {
              agentTerminalSection.style.display = 'block';
            }
            
            // Then show stats
            statsContainer.style.display = 'block';
          }
          
          // Hide the terminal container
          const terminalContainer = document.querySelector('.terminal-container');
          if (terminalContainer) {
            terminalContainer.style.display = 'none';
          }
          
          // Hide the agent header
          const agentHeader = document.querySelector('#agent-terminal .d-flex.justify-content-between.align-items-center');
          if (agentHeader) {
            agentHeader.style.display = 'none';
          }
          
          // Update window location hash
          window.location.hash = dashboardTarget;
        } else {
          // For other tabs, just update the hash
          window.location.hash = target;
        }
      });
    });
  }
  
  // Check and update webhook server status indicator
  function updateServerStatus() {
    fetch(WEBHOOK_API_URL)
      .then(response => {
        if (response.ok) {
          // Webhook server is active
          webhookServerStatus.innerHTML = '<span class="status-indicator status-active pulse"></span> Webhook Server';
          // webhookServerStatus.classList.add('active');
        } else {
          // Webhook server is inactive
          webhookServerStatus.innerHTML = '<span class="status-indicator status-inactive"></span> Webhook Server';
          // webhookServerStatus.classList.remove('active');
        }
      })
      .catch(error => {
        // Webhook server is inactive
        webhookServerStatus.innerHTML = '<span class="status-indicator status-inactive"></span> Webhook Server';
        webhookServerStatus.classList.remove('active');
      });
  }
  
  // Render webhook list
  function renderWebhookList(webhooks) {
    if (webhooks.length === 0) {
      webhookList.innerHTML = `
        <div class="col-12 text-center py-4">
          <p>No webhook configurations found. Click "New Webhook" to create one.</p>
        </div>
      `;
      return;
    }
    
    webhookList.innerHTML = '';
    
    webhooks.forEach(webhook => {
      const webhookCard = document.createElement('div');
      webhookCard.className = 'col-md-6 col-lg-4 mb-4';
      webhookCard.innerHTML = `
        <div class="card h-100">
          <div class="card-header d-flex justify-content-between align-items-center">
            <span>${webhook.name}</span>
            <button class="btn btn-sm btn-primary edit-webhook" data-id="${webhook.id}">Edit</button>
          </div>
          <div class="card-body">
            <p class="card-text fw-bold">${webhook.description || 'No description'}</p>
            <div class="mb-3">
              <small class="text-light">Processor Type:</small>
              <span class="badge bg-success">${webhook.processor}</span>
            </div>
            <div class="webhook-url">POST /webhook/${webhook.id}</div>
          </div>
          <div class="card-footer">
            <button class="btn btn-sm btn-outline-primary test-webhook" data-id="${webhook.id}">Test</button>
          </div>
        </div>
      `;
      
      webhookList.appendChild(webhookCard);
      
      // Add event listener to edit button
      webhookCard.querySelector('.edit-webhook').addEventListener('click', () => {
        showWebhookModal(webhook);
      });
      
      // Add event listener to test button
      webhookCard.querySelector('.test-webhook').addEventListener('click', () => {
        window.location.hash = '#test';
        webhookSelect.value = webhook.id;
        updateTestPayload();
        window.scrollTo({
          top: document.getElementById('test').offsetTop - 70,
          behavior: 'smooth'
        });
      });
    });
  }
  
  // Flag to prevent duplicate submissions
  let isWebhookSubmissionInProgress = false;
  
  // Send webhook request
  async function sendWebhook() {
    // Prevent duplicate submissions
    if (isWebhookSubmissionInProgress) {
      console.log('Webhook submission already in progress, ignoring duplicate request');
      return;
    }
    
    const webhookId = webhookSelect.value;
    if (!webhookId) {
      alert('Please select a webhook configuration');
      return;
    }
    
    try {
      // Parse and validate JSON
      let payload;
      try {
        payload = JSON.parse(jsonEditor.value);
      } catch (error) {
        alert('Invalid JSON: ' + error.message);
        return;
      }
      
      // Set flag to prevent duplicate submissions
      isWebhookSubmissionInProgress = true;
      
      // Update UI to show loading state
      btnSendWebhook.disabled = true;
      btnSendWebhook.innerHTML = `
        <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
        Sending...
      `;
      
      responseCard.style.display = 'none';
      
      // Add terminal messages
      addTerminalLine(`Sending webhook request to ${webhookId}...`);
      
      // Generate a client-side unique ID for this request to track it
      const clientRequestId = `${webhookId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      console.log(`Generated client request ID: ${clientRequestId}`);
      
      // Add the unique request ID to the payload
      const payloadWithId = {
        ...payload,
        _clientRequestId: clientRequestId
      };
      
      // Send the request
      const response = await fetch(`${TEST_WEBHOOK_API_URL}/${webhookId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payloadWithId)
      });
      
      // Parse response
      const result = await response.json();
      
      // Show response
      responseCard.style.display = 'block';
      responseContent.textContent = JSON.stringify(result, null, 2);
      
      // Check for successful webhook processing
      const isProcessingSuccessful = result.success;
      
      // Add detailed terminal messages
      addTerminalLine(`Webhook processed: ${isProcessingSuccessful ? 'Success' : 'Failed'}`);
      addTerminalLine(`Response ID: ${result.webhookId}`);
      
      // Add more detailed error info if available
      if (!isProcessingSuccessful) {
        if (result.message) {
          addTerminalLine(`Error: ${result.message}`);
        }
        if (result.result && result.result.status && result.result.status.message) {
          // Get error message from agent if available
          const agentMessage = result.result.status.message.parts?.[0]?.text || "Unknown error";
          addTerminalLine(`Agent response: ${agentMessage}`);
        }
      }
      
      // Update statistics with correct status
      updateWebhookStats(webhookId, isProcessingSuccessful ? 'success' : 'failed');
      
      // Auto-navigate to dashboard and show webhook details if processing was successful
      if (isProcessingSuccessful) {
        addTerminalLine(`Auto-navigating to webhook details...`);
        
        // Wait a moment for stats to update, then navigate to dashboard and show details
        setTimeout(async () => {
          // Navigate to dashboard
          window.location.hash = '#dashboard';
          
          // Wait a bit more for dashboard to load, then try to find and show the webhook details
          setTimeout(async () => {
            // Refresh webhook stats to get the latest data
            await fetchWebhookStats();
            
            // Find the webhook in the table and show its details
            const webhookRows = document.querySelectorAll('tbody tr[data-webhook-id]');
            for (const row of webhookRows) {
              const rowWebhookId = row.getAttribute('data-webhook-id');
              // Match either the full invocation ID or just the webhook ID part
              if (rowWebhookId === result.invocationId || rowWebhookId.includes(webhookId)) {
                // Click the row to show details
                row.click();
                addTerminalLine(`Showing details for webhook: ${result.invocationId}`);
                break;
              }
            }
          }, 1000);
        }, 500);
      }
      
    } catch (error) {
      console.error('Error sending webhook:', error);
      
      // Show error in response card
      responseCard.style.display = 'block';
      responseContent.textContent = JSON.stringify({
        error: 'Failed to send webhook',
        message: error.message
      }, null, 2);
      
      // Add error to terminal
      addTerminalLine(`Error: ${error.message}`);
      
      // Update statistics with failed status
      updateWebhookStats(webhookId, 'failed');
    } finally {
      // Reset button state and submission flag
      btnSendWebhook.disabled = false;
      btnSendWebhook.textContent = 'Send Webhook';
      
      // Add a small delay before allowing new submissions to prevent rapid clicking
      setTimeout(() => {
        isWebhookSubmissionInProgress = false;
      }, 2000);
    }
  }
  
  // Update webhook statistics after processing
  function updateWebhookStats(webhookId, status) {
    // No need to update stats manually anymore, we fetch them from the server
    fetchWebhookStats();
  }
  
  // Update agent terminal based on selected agent
  function updateAgentTerminal(agentType) {
    // Update header info
    const agentName = agentType.charAt(0).toUpperCase() + agentType.slice(1) + ' Agent';
    selectedAgentName.textContent = agentName;
    
    const status = agentStatus[agentType];
    const isLocal = status ? status.isLocal : true;
    const agentUrl = status ? status.url : agentUrls[agentType];
    
    // Update status indicator
    const statusIndicator = document.getElementById('agent-status-indicator');
    if (statusIndicator) {
      // Keep Bootstrap badge classes but add our status class
      statusIndicator.className = `badge ${isLocal ? 'bg-success' : 'bg-warning'} me-2`;
      statusIndicator.textContent = isLocal ? 'LOCAL' : 'REMOTE';
    }
    
    // Update agent URL
    const agentUrlElement = document.getElementById('agent-url');
    if (agentUrlElement) {
      agentUrlElement.className = 'badge bg-dark';
      agentUrlElement.textContent = agentUrl || 'N/A';
    }
    
    // Make sure terminal is visible first
    const terminalContainer = document.querySelector('.terminal-container');
    if (terminalContainer) {
      terminalContainer.style.display = 'block';
    }
    
    // Clear terminal
    if (!terminalContent.classList.contains('terminal-content')) {
      terminalContent.classList.add('terminal-content');
    }

    terminalContent.innerHTML = '';
    
    // Create a unique ID for this polling session
    const pollingId = Date.now();
    terminalContent.setAttribute('data-polling-id', pollingId);
    
    // Set auto-scroll flag to true initially
    terminalContent.setAttribute('data-auto-scroll', 'true');
    
    // Initialize content hash to empty string for new agent
    terminalContent.setAttribute('data-content-hash', '');
    
    // Initialize activity hash for remote agents
    terminalContent.setAttribute('data-activity-hash', '');
    
    // Setup scroll event listener
    setupTerminalScrollListener();
    
    if (isLocal) {
      // For local agents, show logs as before
      addTerminalLine(`Connecting to ${agentName}...`, false);
      
      // Short delay to ensure terminal is ready before fetching logs
      setTimeout(() => {
        // Fetch actual logs from the server
        fetchAgentLogs(agentType, pollingId);
        
        // Start polling for log updates
        startLogPolling(agentType, pollingId);
      }, 100);
    } else {
      // For remote agents, show different information
      addTerminalLine(`Remote ${agentName} Information`, false);
      addTerminalLine(`─────────────────────────────────────────`, false);
      addTerminalLine(`URL: ${agentUrl}`, false);
      addTerminalLine(`Status: External agent (not locally managed)`, false);
      addTerminalLine(``, false);
      addTerminalLine(`About Remote Agent Display:`, false);
      addTerminalLine(`This agent is running remotely. Instead of showing logs,`, false);
      addTerminalLine(`this view will display the messages and data being sent`, false);
      addTerminalLine(`to the remote agent when tasks are delegated to it.`, false);
      addTerminalLine(``, false);
      addTerminalLine(`Recent Messages to Remote Agent:`, false);
      addTerminalLine(`─────────────────────────────────────────`, false);
      
      // Start monitoring for messages sent to this remote agent
      startRemoteAgentMonitoring(agentType, pollingId);
    }
  }
  
  // Setup scroll event listener for terminal
  function setupTerminalScrollListener() {
    // Remove existing listener if any
    terminalContent.removeEventListener('scroll', handleTerminalScroll);
    
    // Add new listener
    terminalContent.addEventListener('scroll', handleTerminalScroll);
  }
  
  // Handle terminal scroll events
  function handleTerminalScroll() {
    // Check if user has scrolled to bottom
    const isAtBottom = terminalContent.scrollHeight - terminalContent.scrollTop <= terminalContent.clientHeight + 50; // 50px tolerance
    
    // Update auto-scroll flag
    terminalContent.setAttribute('data-auto-scroll', isAtBottom.toString());
    
    // Display a visual indicator when auto-scrolling is paused
    const terminalContainer = document.querySelector('.terminal-container');
    if (terminalContainer) {
      if (!isAtBottom) {
        // Show pause indicator if it doesn't exist
        if (!document.getElementById('auto-scroll-paused')) {
          const pauseIndicator = document.createElement('div');
          pauseIndicator.id = 'auto-scroll-paused';
          pauseIndicator.className = 'auto-scroll-paused';
          pauseIndicator.innerHTML = 'Auto-refresh paused <button class="resume-btn">Resume</button>';
          terminalContainer.appendChild(pauseIndicator);
          
          // Add click event to resume button
          pauseIndicator.querySelector('.resume-btn').addEventListener('click', function() {
            // Scroll to bottom
            scrollToBottom();
            // Remove the indicator
            pauseIndicator.remove();
          });
        }
      } else {
        // Remove pause indicator if it exists
        const pauseIndicator = document.getElementById('auto-scroll-paused');
        if (pauseIndicator) {
          pauseIndicator.remove();
        }
      }
    }
  }
  
  // Scroll to bottom of terminal
  function scrollToBottom() {
    if (terminalContent) {
      // Force a reflow before scrolling to ensure content is fully rendered
      void terminalContent.offsetHeight;
      // Scroll to bottom
      terminalContent.scrollTop = terminalContent.scrollHeight;
      console.log('Scrolled to bottom:', terminalContent.scrollTop, terminalContent.scrollHeight);
    }
  }
  
  // Fetch agent logs from the API
  async function fetchAgentLogs(agentType, pollingId) {
    try {
      const response = await fetch(`${LOG_API_URL}/${agentType}`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch ${agentType} logs: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      // Check if we're still on the same agent view (polling ID hasn't changed)
      if (terminalContent.getAttribute('data-polling-id') !== pollingId.toString()) {
        console.log('Terminal switched to a different agent, skipping update');
        return;
      }
      
      // Create a hash of the log content for efficient comparison
      const newEntriesHash = hashLogEntries(data.entries.map(entry => entry.message));
      const currentHash = terminalContent.getAttribute('data-content-hash') || '';
      
      // Only update if content hash has changed
      if (currentHash !== newEntriesHash) {
        console.log('Log content changed, updating terminal');
        
        // Remember scroll position and check if at bottom
        const shouldAutoScroll = terminalContent.getAttribute('data-auto-scroll') === 'true';
        
        // Clear terminal
        terminalContent.innerHTML = '';
        
        // Add each log entry to the terminal
        if (data.entries && data.entries.length > 0) {
          data.entries.forEach(entry => {
            addTerminalLine(entry.message, false); // Don't auto-scroll each line
          });
        } else {
          addTerminalLine(`No logs available for ${agentType} agent`, false);
        }
        
        // Store the current content hash
        terminalContent.setAttribute('data-content-hash', newEntriesHash);
        
        // Always scroll to bottom on initial load or if auto-scroll is enabled
        if (shouldAutoScroll || currentHash === '') {
          // Use setTimeout to ensure DOM has updated before scrolling
          setTimeout(() => {
            scrollToBottom();
          }, 50);
        }
      } else {
        console.log('Log content unchanged, skipping update');
      }
    } catch (error) {
      console.error(`Error fetching ${agentType} logs:`, error);
      
      // Check if we're still on the same agent view
      if (terminalContent.getAttribute('data-polling-id') !== pollingId.toString()) {
        return;
      }
      
      // Show error in terminal
      terminalContent.innerHTML = '';
      addTerminalLine(`Error loading ${agentType} agent logs: ${error.message}`);
      addTerminalLine('');
      addTerminalLine('Check if the agent is running and logs are available.');
      
      // Scroll to bottom even on error
      scrollToBottom();
    }
  }
  
  // Function to create a simple hash of log entries for comparison
  function hashLogEntries(entries) {
    if (!entries || entries.length === 0) return '';
    
    // Use the length and the first/last few characters of first and last entries
    // as a simple way to detect changes without comparing the entire content
    const firstEntry = entries[0] || '';
    const lastEntry = entries[entries.length - 1] || '';
    
    return `${entries.length}:${firstEntry.slice(0, 10)}:${lastEntry.slice(-10)}`;
  }
  
  // Poll for log updates
  function startLogPolling(agentType, pollingId) {
    const pollingInterval = 3000; // 3 seconds
    
    const intervalId = setInterval(() => {
      // Check if we're still on the same agent view
      if (terminalContent.getAttribute('data-polling-id') !== pollingId.toString()) {
        console.log('Terminal switched to a different agent, stopping polling');
        clearInterval(intervalId);
        return;
      }
      
      // Fetch updated logs
      fetchAgentLogs(agentType, pollingId);
    }, pollingInterval);
    
    // Store the interval ID in a data attribute so we can clear it if needed
    terminalContent.setAttribute('data-interval-id', intervalId);
  }
  
  // Add a line to the terminal
  function addTerminalLine(text, shouldScroll = true) {
    // Add the single line without preprocessing
    addSingleLine(text, shouldScroll);
  }
  
  // Add a single line to the terminal
  function addSingleLine(text, shouldScroll = true) {
    const line = document.createElement('div');
    line.className = 'terminal-line';
    
    // Simple check if this line is a standalone JSON object
    const trimmed = text.trim();
    
    // Regular text line
    line.textContent = text;
    
    terminalContent.appendChild(line);
    
    // Scroll to bottom if requested
    if (shouldScroll) {
      scrollToBottom();
    }
  }
  
  // Initialize terminal with default content
  function initializeTerminal() {
    terminalContent.innerHTML = '';
    
    // Initialize hash attributes
    terminalContent.setAttribute('data-content-hash', '');
    terminalContent.setAttribute('data-auto-scroll', 'true');
    
    addTerminalLine('Initializing agent logs...', false);
    addTerminalLine('Waiting for agent selection...', false);
    
    // Ensure we scroll to bottom after initialization
    setTimeout(scrollToBottom, 100);
  }
  
  // Update test payload based on selected webhook
  function updateTestPayload() {
    const webhookId = webhookSelect.value;
    if (!webhookId) return;
    
    const webhook = currentWebhooks.find(w => w.id === webhookId);
    if (!webhook) return;
    
    // Set appropriate payload based on processor type
    if (webhook.processor === 'meeting-transcript') {
      jsonEditor.value = JSON.stringify({
        transcript: defaultPayload.transcript
      }, null, 2);
    } else {
      // For custom processors, provide a simpler payload template
      jsonEditor.value = JSON.stringify({
        type: "custom",
        data: {
          message: "This is a test webhook payload",
          timestamp: new Date().toISOString()
        }
      }, null, 2);
    }
  }
  
  // Show webhook modal for editing or creating
  function showWebhookModal(webhook = null) {
    const modalTitle = document.getElementById('webhookModalTitle');
    const webhookId = document.getElementById('webhookId');
    const webhookName = document.getElementById('webhookName');
    const webhookDescription = document.getElementById('webhookDescription');
    const webhookProcessor = document.getElementById('webhookProcessor');
    const webhookPromptTemplate = document.getElementById('webhookPromptTemplate');
    const webhookConfig = document.getElementById('webhookConfig');
    
    if (webhook) {
      // Editing existing webhook
      modalTitle.textContent = 'Edit Webhook Configuration';
      webhookId.value = webhook.id;
      webhookId.disabled = true; // Can't change ID of existing webhook
      webhookName.value = webhook.name;
      webhookDescription.value = webhook.description || '';
      webhookProcessor.value = webhook.processor;
      webhookPromptTemplate.value = webhook.promptTemplate || '';
      webhookConfig.value = JSON.stringify(webhook.processorConfig || {}, null, 2);
      btnDeleteWebhook.style.display = 'block';
    } else {
      // Creating new webhook
      modalTitle.textContent = 'Create New Webhook';
      webhookId.value = '';
      webhookId.disabled = false;
      webhookName.value = '';
      webhookDescription.value = '';
      webhookProcessor.value = 'meeting-transcript';
      webhookPromptTemplate.value = '';
      webhookConfig.value = JSON.stringify({
        agents: [
          {
            id: "github",
            type: "github",
            url: "http://localhost:41245"
          },
          {
            id: "slack",
            type: "slack",
            url: "http://localhost:41243"
          },
          {
            id: "bench",
            type: "bench",
            url: "http://localhost:41246"
          }
        ]
      }, null, 2);
      btnDeleteWebhook.style.display = 'none';
    }
    
    // Show the modal
    const webhookModal = new bootstrap.Modal(document.getElementById('webhookModal'));
    webhookModal.show();
  }
  
  // Fetch webhooks from the API
  async function fetchWebhooks() {
    try {
      webhookList.innerHTML = `
        <div class="col-12 text-center py-5">
          <div class="spinner-border text-success" role="status">
            <span class="visually-hidden">Loading...</span>
          </div>
        </div>
      `;
      
      const response = await fetch(WEBHOOK_API_URL);
      const data = await response.json();
      
      currentWebhooks = data;
      renderWebhookList(data);
      populateWebhookSelect(data);
      
      // Set default test payload if webhooks exist
      if (data.length > 0 && webhookSelect.value) {
        updateTestPayload();
      }
    } catch (error) {
      console.error('Error fetching webhooks:', error);
      webhookList.innerHTML = `
        <div class="col-12 alert alert-danger">
          Failed to load webhooks. Please try again later.
        </div>
      `;
    }
  }
  
  // Populate webhook select dropdown
  function populateWebhookSelect(webhooks) {
    webhookSelect.innerHTML = '';
    
    webhooks.forEach(webhook => {
      const option = document.createElement('option');
      option.value = webhook.id;
      option.textContent = webhook.name;
      webhookSelect.appendChild(option);
    });
    
    // Update test payload based on selected webhook
    if (webhooks.length > 0) {
      updateTestPayload();
    }
  }
  
  // Save webhook (create or update)
  async function saveWebhook() {
    const webhookId = document.getElementById('webhookId').value;
    const webhookName = document.getElementById('webhookName').value;
    const webhookDescription = document.getElementById('webhookDescription').value;
    const webhookProcessor = document.getElementById('webhookProcessor').value;
    const webhookPromptTemplate = document.getElementById('webhookPromptTemplate').value;
    const webhookConfig = document.getElementById('webhookConfig').value;
    
    // Validate required fields
    if (!webhookId || !webhookName) {
      alert('Webhook ID and Name are required');
      return;
    }
    
    // Parse and validate JSON config
    let processorConfig;
    try {
      processorConfig = JSON.parse(webhookConfig);
    } catch (error) {
      alert('Invalid JSON in processor configuration: ' + error.message);
      return;
    }
    
    // Create webhook object
    const webhook = {
      id: webhookId,
      name: webhookName,
      description: webhookDescription,
      processor: webhookProcessor,
      processorConfig
    };
    
    // Only include promptTemplate if it has content
    if (webhookPromptTemplate.trim()) {
      webhook.promptTemplate = webhookPromptTemplate.trim();
    }
    
    try {
      // Determine if this is a create or update operation
      const exists = currentWebhooks.some(w => w.id === webhookId);
      const method = exists ? 'PUT' : 'POST';
      const url = exists ? `${WEBHOOK_API_URL}/${webhookId}` : WEBHOOK_API_URL;
      
      // Send request to API
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(webhook)
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save webhook');
      }
      
      // Close the modal
      bootstrap.Modal.getInstance(document.getElementById('webhookModal')).hide();
      
      // Refresh webhook list
      fetchWebhooks();
      
      // Add terminal message
      addTerminalLine(`Webhook "${webhookName}" ${exists ? 'updated' : 'created'} successfully`);
      
    } catch (error) {
      console.error('Error saving webhook:', error);
      alert('Error saving webhook: ' + error.message);
      
      // Add error to terminal
      addTerminalLine(`Error: ${error.message}`);
    }
  }
  
  // Delete webhook
  async function deleteWebhook() {
    const webhookId = document.getElementById('webhookId').value;
    const webhookName = document.getElementById('webhookName').value;
    
    if (!confirm(`Are you sure you want to delete the webhook "${webhookName}"?`)) {
      return;
    }
    
    try {
      // Send delete request to API
      const response = await fetch(`${WEBHOOK_API_URL}/${webhookId}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete webhook');
      }
      
      // Close the modal
      bootstrap.Modal.getInstance(document.getElementById('webhookModal')).hide();
      
      // Refresh webhook list
      fetchWebhooks();
      
      // Add terminal message
      addTerminalLine(`Webhook "${webhookName}" deleted successfully`);
      
    } catch (error) {
      console.error('Error deleting webhook:', error);
      alert('Error deleting webhook: ' + error.message);
      
      // Add error to terminal
      addTerminalLine(`Error: ${error.message}`);
    }
  }
  
  // Setup agent sidebar functionality
  function setupAgentSidebar() {
    const agentItems = document.querySelectorAll('.agent-item');
    
    agentItems.forEach(item => {
      const agentType = item.getAttribute('data-agent');
      const status = agentStatus[agentType];
      const isLocal = status ? status.isLocal : true;
      
      // Update the agent item to include the appropriate icon
      const agentName = agentType.charAt(0).toUpperCase() + agentType.slice(1) + ' Agent';
      const iconClass = isLocal ? 'fas fa-network-wired' : 'fas fa-globe';
      
      // Update the content with icon
      item.innerHTML = `
        <span class="agent-status status-active${agentType === 'host' ? ' pulse' : ''}"></span>
        <i class="${iconClass} me-2" style="color: var(--text-muted);"></i>
        <span>${agentName}</span>
      `;
      
      item.addEventListener('click', function() {
        // Remove active class from all items
        agentItems.forEach(agent => agent.classList.remove('active'));
        
        // Add active class to clicked item
        this.classList.add('active');
        
        // Get the agent type
        const agentType = this.getAttribute('data-agent');
        
        // Reset any current navigation
        window.location.hash = '#agent-terminal';
        
        // Manually handle the visibility instead of waiting for hashchange
        if (agentTerminalSection) {
          // Show the terminal section
          agentTerminalSection.style.display = 'block';
          
          // Hide the dashboard stats
          const statsContainer = document.getElementById('webhook-stats');
          if (statsContainer) {
            statsContainer.style.display = 'none';
          }
          
          // Show agent header
          const agentHeader = agentTerminalSection.querySelector('.d-flex.justify-content-between.align-items-center');
          if (agentHeader) {
            agentHeader.style.display = 'flex';
          }
          
          // Show the terminal container
          const terminalContainer = agentTerminalSection.querySelector('.terminal-container');
          if (terminalContainer) {
            terminalContainer.style.display = 'block';
          }
          
          // Update the terminal content
          updateAgentTerminal(agentType);
        }
      });
    });
  }
  
  // Reload agent configurations
  async function reloadAgentConfigurations() {
    try {
      console.log('Reloading agent configurations...');
      
      // Show a loading message in the terminal
      addTerminalLine('Reloading agent configurations...');
      
      // Call the Host Agent reload endpoint
      const response = await fetch(HOST_AGENT_RELOAD_URL);
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to reload agent configurations');
      }
      
      const result = await response.json();
      
      // Display success message
      addTerminalLine(`Successfully reloaded agent configurations. Available agents: ${result.agents.join(', ')}`);
      
      // Refresh the webhook list to show updated agents
      fetchWebhooks();
      
      // If we're on the agent terminal view, refresh it
      const hash = window.location.hash;
      if (hash.startsWith('#agent-terminal')) {
        const agentType = document.querySelector('.agent-item.active')?.getAttribute('data-agent');
        if (agentType) {
          updateAgentTerminal(agentType);
        }
      }
    } catch (error) {
      console.error('Error reloading agent configurations:', error);
      addTerminalLine(`Error reloading agent configurations: ${error.message}`);
    }
  }
  
  // Initialize agent configuration detection
  async function initializeAgentDetection() {
    try {
      // Fetch agent configurations from the webhook server
      const response = await fetch('/api/agent-config');
      if (response.ok) {
        const config = await response.json();
        
        // Update agent URLs and status based on configuration
        Object.keys(agentStatus).forEach(agentType => {
          const envKey = `${agentType.toUpperCase()}_AGENT_URL`;
          const configUrl = config[envKey];
          
          if (configUrl) {
            agentUrls[agentType] = configUrl;
            agentStatus[agentType].url = configUrl;
            agentStatus[agentType].isLocal = configUrl.includes('localhost') || configUrl.includes('127.0.0.1');
          }
        });
        
        console.log('Agent configuration detected:', agentStatus);
      } else {
        console.log('Could not fetch agent config, using defaults');
      }
    } catch (error) {
      console.error('Error detecting agent configuration:', error);
    }
  }
  
  // Start monitoring for messages sent to remote agents
  function startRemoteAgentMonitoring(agentType, pollingId) {
    const pollingInterval = 5000; // 5 seconds
    
    // Initial fetch
    fetchRemoteAgentActivity(agentType, pollingId);
    
    const intervalId = setInterval(() => {
      // Check if we're still on the same agent view
      if (terminalContent.getAttribute('data-polling-id') !== pollingId.toString()) {
        console.log('Terminal switched to a different agent, stopping remote monitoring');
        clearInterval(intervalId);
        return;
      }
      
      // Fetch updated activity
      fetchRemoteAgentActivity(agentType, pollingId);
    }, pollingInterval);
    
    // Store the interval ID
    terminalContent.setAttribute('data-interval-id', intervalId);
  }

  // Fetch activity/messages sent to remote agents  
  async function fetchRemoteAgentActivity(agentType, pollingId) {
    try {
      // For now, we'll show webhook invocations that might have involved this agent
      const response = await fetch(STATS_API_URL);
      if (!response.ok) return;
      
      const data = await response.json();
      
      // Check if we're still on the same agent view
      if (terminalContent.getAttribute('data-polling-id') !== pollingId.toString()) {
        return;
      }
      
      // Filter recent webhooks that might have involved this agent
      const recentActivity = data.recentWebhooks
        .filter(webhook => {
          // Check if this webhook involved the agent type we're monitoring
          return webhook.details && 
                 webhook.details.agentMessages && 
                 webhook.details.agentMessages[agentType];
        })
        .slice(0, 10); // Show last 10 activities
      
      // Create a unique key for the current activity state
      const activityHash = recentActivity.map(w => `${w.id}-${w.timestamp}`).join('|');
      const currentActivityHash = terminalContent.getAttribute('data-activity-hash') || '';
      
      // Only update if activity has changed
      if (currentActivityHash !== activityHash) {
        // Clear all existing remote activity lines
        const existingActivity = terminalContent.querySelectorAll('.remote-activity');
        existingActivity.forEach(el => el.remove());
        
        if (recentActivity.length === 0) {
          const noActivityLine = document.createElement('div');
          noActivityLine.className = 'terminal-line remote-activity';
          noActivityLine.textContent = '(No recent activity to this remote agent)';
          terminalContent.appendChild(noActivityLine);
        } else {
          recentActivity.forEach((webhook, index) => {
            const timestamp = new Date(webhook.timestamp).toLocaleString();
            const message = webhook.details.agentMessages[agentType];
            
            // Add activity entry
            const activityLine = document.createElement('div');
            activityLine.className = 'terminal-line remote-activity';
            activityLine.innerHTML = `<span class="timestamp">[${timestamp}]</span> <span class="webhook-name">${webhook.name}</span>`;
            terminalContent.appendChild(activityLine);
            
            // Add message preview  
            const messageLine = document.createElement('div');
            messageLine.className = 'terminal-line remote-activity message-preview';
            messageLine.textContent = `  → ${message.substring(0, 100)}${message.length > 100 ? '...' : ''}`;
            terminalContent.appendChild(messageLine);
            
            // Add spacing between entries
            if (index < recentActivity.length - 1) {
              const spaceLine = document.createElement('div');
              spaceLine.className = 'terminal-line remote-activity';
              spaceLine.textContent = '';
              terminalContent.appendChild(spaceLine);
            }
          });
        }
        
        // Store the current activity hash
        terminalContent.setAttribute('data-activity-hash', activityHash);
        
        // Scroll to bottom if auto-scroll is enabled
        const shouldAutoScroll = terminalContent.getAttribute('data-auto-scroll') === 'true';
        if (shouldAutoScroll) {
          setTimeout(scrollToBottom, 50);
        }
      }
    } catch (error) {
      console.error(`Error fetching remote agent activity for ${agentType}:`, error);
    }
  }
  
  // Initialize the application
  init();
}); 