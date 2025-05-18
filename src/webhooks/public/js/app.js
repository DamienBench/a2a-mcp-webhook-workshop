document.addEventListener('DOMContentLoaded', function() {
  // Globals
  const WEBHOOK_API_URL = '/api/webhooks';
  const TEST_WEBHOOK_API_URL = '/api/test/webhook';
  let currentWebhooks = [];
  let webhookStats = {
    totalProcessed: 0,
    agentInvocations: {
      host: 0,
      github: 0,
      slack: 0,
      salesforce: 0
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
  const agentTerminalSection = document.getElementById('agent-terminal');
  const webhooksSection = document.getElementById('webhooks');
  const testSection = document.getElementById('test');
  
  // Navigation links
  const navLinks = document.querySelectorAll('.nav-link');
  
  // Agent URLs
  const agentUrls = {
    host: "http://localhost:41240",
    slack: "http://localhost:41243",
    github: "http://localhost:41245",
    salesforce: "http://localhost:41244",
    webhook: "http://localhost:3000"
  };
  
  // Default webhook test payload
  const defaultPayload = {
    transcript: `Meeting Transcript: Sales Discovery Call with Acme Corp - ${new Date().toLocaleDateString()}

Participants:
- Sarah Johnson (Account Executive, Our Company)
- John Smith (CTO, Acme Corp)
- Emma Davis (Head of Engineering, Acme Corp)

Sarah: Thank you for joining the call today. We're excited to discuss how our AI platform could help with your automation needs.

John: Thanks for setting this up. We've been looking for a solution to automate our development workflows.

Emma: Yes, particularly around code reviews and bug triage. Our team is spending too much time on these tasks.

Sarah: I understand. Our platform has specific features for development workflows. Let me show you how it works.

John: That looks promising. One question - we found a bug in our trial where the AI sometimes misclassifies the severity of bugs.

Sarah: I'll make a note of that and have our engineers look into it. I'll create a bug report for this issue.

Emma: Also, we'd like to integrate this with our Slack channels for team notifications. Is that possible?

Sarah: Absolutely! We have robust Slack integration capabilities. I'll share more details about that.

John: Great. We're also using Salesforce for tracking our customer interactions. Can your system update Salesforce with actions taken?

Sarah: Yes, we offer Salesforce integration as well. I'll send you documentation on that.

Emma: This sounds like it could work for us. What would the next steps be?

Sarah: I'll send a proposal with pricing and implementation details by tomorrow. Should I include anyone else?

John: Please add our VP of Engineering to the proposal. I'll share their contact details after the call.

Sarah: Perfect! Thank you for your time today. I look forward to working with Acme Corp.`
  };
  
  // Initialize the application
  function init() {
    setupEventListeners();
    fetchWebhooks();
    setupAgentSidebar();
    initializeTerminal();
    setupNavigation();
    updateServerStatus();
    initDashboard();
    
    // Hide all agent items active class
    document.querySelectorAll('.agent-item').forEach(item => {
      item.classList.remove('active');
    });
    
    // Make sure the UI is showing the correct section based on URL hash
    handleNavigation(window.location.hash || '#agent-terminal');
    
    // Make sure terminal container is hidden on initial load since no agent is selected
    const terminalContainer = document.querySelector('.terminal-container');
    if (terminalContainer) {
      terminalContainer.style.display = 'none';
    }
    
    // Hide the agent header on initial load
    const agentHeader = document.querySelector('#agent-terminal .d-flex.justify-content-between.align-items-center');
    if (agentHeader) {
      agentHeader.style.display = 'none';
    }
    
    // Make sure stats are visible on initial load
    const statsContainer = document.getElementById('webhook-stats');
    if (statsContainer) {
      statsContainer.style.display = 'block';
    }
  }
  
  // Initialize dashboard with webhook statistics
  function initDashboard() {
    // Create mock statistics for demonstration
    webhookStats = {
      totalProcessed: 15,
      agentInvocations: {
        host: 15,
        github: 8,
        slack: 12,
        salesforce: 6
      },
      recentWebhooks: [
        { id: 'meeting-transcript', name: 'Meeting Transcript', timestamp: new Date(Date.now() - 1000*60*5).toISOString(), status: 'success' },
        { id: 'meeting-transcript', name: 'Meeting Transcript', timestamp: new Date(Date.now() - 1000*60*30).toISOString(), status: 'success' },
        { id: 'meeting-transcript', name: 'Meeting Transcript', timestamp: new Date(Date.now() - 1000*60*60).toISOString(), status: 'success' }
      ]
    };
    
    updateDashboard();
  }
  
  // Update dashboard with latest webhook statistics
  function updateDashboard() {
    // Create dashboard UI if it doesn't exist
    if (!document.getElementById('webhook-stats')) {
      const dashboardHtml = `
        <div id="webhook-stats" class="row mb-4">
          <div class="col-md-12 mb-4">
            <div class="card">
              <div class="card-header">
                Webhook Statistics
              </div>
              <div class="card-body">
                <div class="row">
                  <div class="col-md-12">
                    <h5 class="mb-3 text-light">Agent Invocations</h5>
                    <div class="row">
                      <div class="col-md-3 text-center mb-3">
                        <div class="card bg-dark">
                          <div class="card-body p-2">
                            <h3 class="text-light">${webhookStats.agentInvocations.host}</h3>
                            <p class="mb-0">HOST AGENT</p>
                          </div>
                        </div>
                      </div>
                      <div class="col-md-3 text-center mb-3">
                        <div class="card bg-dark">
                          <div class="card-body p-2">
                            <h3 class="text-light">${webhookStats.agentInvocations.github}</h3>
                            <p class="mb-0">GITHUB AGENT</p>
                          </div>
                        </div>
                      </div>
                      <div class="col-md-3 text-center mb-3">
                        <div class="card bg-dark">
                          <div class="card-body p-2">
                            <h3 class="text-light">${webhookStats.agentInvocations.slack}</h3>
                            <p class="mb-0">SLACK AGENT</p>
                          </div>
                        </div>
                      </div>
                      <div class="col-md-3 text-center mb-3">
                        <div class="card bg-dark">
                          <div class="card-body p-2">
                            <h3 class="text-light">${webhookStats.agentInvocations.salesforce}</h3>
                            <p class="mb-0">SALESFORCE AGENT</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div class="col-md-12">
            <div class="card">
              <div class="card-header">
                Recent Webhook Invocations
              </div>
              <div class="card-body p-0">
                <table class="table table-dark table-striped mb-0">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Name</th>
                      <th>Timestamp</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody id="recent-webhooks">
                    ${webhookStats.recentWebhooks.map(webhook => `
                      <tr>
                        <td>${webhook.id}</td>
                        <td>${webhook.name}</td>
                        <td>${new Date(webhook.timestamp).toLocaleString()}</td>
                        <td><span class="badge ${webhook.status === 'success' ? 'bg-success' : 'bg-danger'}">${webhook.status}</span></td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      `;
      
      // Add the stats directly to the agent terminal section
      const dashboardEl = document.createElement('div');
      dashboardEl.innerHTML = dashboardHtml;
      agentTerminalSection.prepend(dashboardEl);
      
      // Make sure stats are shown
      const statsContainer = document.getElementById('webhook-stats');
      if (statsContainer) {
        statsContainer.style.display = 'block';
      }
    }
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
    const targetId = hash.substring(1) || 'agent-terminal';
    
    // Hide all sections
    if (agentTerminalSection) agentTerminalSection.style.display = 'none';
    if (webhooksSection) webhooksSection.style.display = 'none';
    if (testSection) testSection.style.display = 'none';
    
    // Show the target section
    const targetSection = document.getElementById(targetId);
    if (targetSection) {
      targetSection.style.display = 'block';
      
      // If we're switching to the agent terminal section, check if any agent is selected
      if (targetId === 'agent-terminal') {
        // Check if any agent is active
        const activeAgent = document.querySelector('.agent-item.active');
        
        if (!activeAgent) {
          // If no agent is active, show the dashboard stats
          const statsContainer = document.getElementById('webhook-stats');
          if (statsContainer) {
            statsContainer.style.display = 'block';
          }
          
          // Hide the terminal container if no agent is selected
          const terminalContainer = agentTerminalSection.querySelector('.terminal-container');
          if (terminalContainer) {
            terminalContainer.style.display = 'none';
          }
        } else {
          // If an agent is active, make sure stats are hidden and terminal is visible
          const statsContainer = document.getElementById('webhook-stats');
          if (statsContainer) {
            statsContainer.style.display = 'none';
          }
          
          // Show the terminal container for the active agent
          const terminalContainer = agentTerminalSection.querySelector('.terminal-container');
          if (terminalContainer) {
            terminalContainer.style.display = 'block';
          }
          
          // Update terminal for the active agent
          const agentType = activeAgent.getAttribute('data-agent');
          updateAgentTerminal(agentType);
        }
      }
      
      // Update active nav link
      navLinks.forEach(link => {
        const linkTargetId = link.getAttribute('href').substring(1);
        if (linkTargetId === targetId) {
          link.classList.add('active');
        } else {
          link.classList.remove('active');
        }
      });
    }
  }
  
  // Setup navigation
  function setupNavigation() {
    navLinks.forEach(link => {
      link.addEventListener('click', function(e) {
        e.preventDefault();
        
        // Get the target from href attribute
        const target = this.getAttribute('href');
        
        // Special handling for Dashboard link
        if (target === '#agent-terminal') {
          // Reset any selected agent
          document.querySelectorAll('.agent-item').forEach(item => {
            item.classList.remove('active');
          });
          
          // Show stats, hide terminal
          const statsContainer = document.getElementById('webhook-stats');
          if (statsContainer) {
            statsContainer.style.display = 'block';
          }
          
          const terminalContainer = document.querySelector('.terminal-container');
          if (terminalContainer) {
            terminalContainer.style.display = 'none';
          }
        }
        
        // Update window location hash (this will trigger hashchange event)
        window.location.hash = target;
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
  
  // Send webhook request
  async function sendWebhook() {
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
      
      // Update UI to show loading state
      btnSendWebhook.disabled = true;
      btnSendWebhook.innerHTML = `
        <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
        Sending...
      `;
      
      responseCard.style.display = 'none';
      
      // Add terminal messages
      addTerminalLine(`Sending webhook request to ${webhookId}...`);
      
      // Send the request
      const response = await fetch(`${TEST_WEBHOOK_API_URL}/${webhookId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
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
      
      // Reset button state
      btnSendWebhook.disabled = false;
      btnSendWebhook.textContent = 'Send Webhook';
      
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
      
      // Reset button state
      btnSendWebhook.disabled = false;
      btnSendWebhook.textContent = 'Send Webhook';
    }
  }
  
  // Update webhook statistics after processing
  function updateWebhookStats(webhookId, status) {
    // Find webhook name
    const webhook = currentWebhooks.find(w => w.id === webhookId);
    const webhookName = webhook ? webhook.name : webhookId;
    
    // Update total processed count
    webhookStats.totalProcessed++;
    
    // Update agent invocations (for demo purposes, increment all for meeting transcript)
    if (webhookId === 'meeting-transcript') {
      webhookStats.agentInvocations.host++;
      webhookStats.agentInvocations.github++;
      webhookStats.agentInvocations.slack++;
      webhookStats.agentInvocations.salesforce++;
    } else {
      // For other webhooks, just increment host
      webhookStats.agentInvocations.host++;
    }
    
    // Add to recent webhooks
    webhookStats.recentWebhooks.unshift({
      id: webhookId,
      name: webhookName,
      timestamp: new Date().toISOString(),
      status: status
    });
    
    // Keep only the 10 most recent
    if (webhookStats.recentWebhooks.length > 10) {
      webhookStats.recentWebhooks = webhookStats.recentWebhooks.slice(0, 10);
    }
    
    // Update UI
    refreshDashboard();
  }
  
  // Refresh dashboard UI with updated statistics
  function refreshDashboard() {
    // Update the statistics numbers
    const statsContainer = document.getElementById('webhook-stats');
    if (statsContainer) {
      // Remove existing stats
      statsContainer.remove();
      
      // Rebuild dashboard
      updateDashboard();
    }
  }
  
  // Update agent terminal based on selected agent
  function updateAgentTerminal(agentType) {
    // Update header info
    const agentName = agentType.charAt(0).toUpperCase() + agentType.slice(1) + ' Agent';
    selectedAgentName.textContent = agentName;
    agentUrl.textContent = agentUrls[agentType] || 'N/A';
    
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
    
    // Setup scroll event listener
    setupTerminalScrollListener();
    
    // Add initial connecting message (without extra whitespace)
    addTerminalLine(`Connecting to ${agentName}...`, false);
    
    // Short delay to ensure terminal is ready before fetching logs
    setTimeout(() => {
      // Fetch actual logs from the server
      fetchAgentLogs(agentType, pollingId);
      
      // Start polling for log updates
      startLogPolling(agentType, pollingId);
    }, 100);
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
      const response = await fetch(`/api/logs/${agentType}`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch ${agentType} logs: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      // Check if we're still on the same agent view (polling ID hasn't changed)
      if (terminalContent.getAttribute('data-polling-id') !== pollingId.toString()) {
        console.log('Terminal switched to a different agent, skipping update');
        return;
      }
      
      // Get current log lines for comparison
      const currentLines = Array.from(terminalContent.querySelectorAll('.terminal-line')).map(line => line.textContent);
      const newEntries = data.entries.map(entry => entry.message);
      
      // Only update if there are new log entries
      if (JSON.stringify(currentLines) !== JSON.stringify(newEntries)) {
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
        
        // Always scroll to bottom on initial load or if auto-scroll is enabled
        if (shouldAutoScroll || currentLines.length === 0) {
          // Use setTimeout to ensure DOM has updated before scrolling
          setTimeout(() => {
            scrollToBottom();
          }, 50);
        }
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
    // First, let's pre-process the text to break JSON objects onto their own lines
    const processedText = preProcessLogText(text);
    
    // If the text was split into multiple lines, add each one separately
    if (processedText.includes('\n')) {
      const lines = processedText.split('\n');
      for (const lineText of lines) {
        if (lineText.trim()) { // Skip empty lines
          addSingleLine(lineText, false); // Don't scroll for each line
        }
      }
      // Only scroll at the end if needed
      if (shouldScroll) {
        scrollToBottom();
      }
      return;
    }
    
    // Otherwise, add the single line
    addSingleLine(processedText, shouldScroll);
  }
  
  // Process log text to add line breaks around JSON objects
  function preProcessLogText(text) {
    if (!text || typeof text !== 'string') return text;
    
    // Add a line break before standalone JSON objects (not inside quotes)
    let processed = text;
    
    // Pattern: Find colons followed by opening braces or brackets that aren't in quotes
    const colonPattern = /:\s*({|\[)/g;
    processed = processed.replace(colonPattern, ':\n$1');
    
    // Also handle cases where JSON starts at beginning of line
    if (processed.trim().startsWith('{') || processed.trim().startsWith('[')) {
      const trimmed = processed.trim();
      return trimmed;
    }
    
    return processed;
  }
  
  // Add a single line to the terminal
  function addSingleLine(text, shouldScroll = true) {
    const line = document.createElement('div');
    line.className = 'terminal-line';
    
    // Simple check if this line is a standalone JSON object
    const trimmed = text.trim();
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || 
        (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        // Try to parse as JSON
        const parsed = JSON.parse(trimmed);
        
        // Create pre/code elements for syntax highlighting
        const pre = document.createElement('pre');
        const code = document.createElement('code');
        code.className = 'json';
        code.textContent = JSON.stringify(parsed, null, 2);
        pre.appendChild(code);
        line.appendChild(pre);
        
        // Apply highlighting
        hljs.highlightElement(code);
      } catch (e) {
        // If not valid JSON, just add as text
        line.textContent = text;
      }
    } else {
      // Regular text line
      line.textContent = text;
    }
    
    terminalContent.appendChild(line);
    
    // Scroll to bottom if requested
    if (shouldScroll) {
      scrollToBottom();
    }
  }
  
  // Initialize terminal with default content
  function initializeTerminal() {
    terminalContent.innerHTML = '';
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
    const webhookConfig = document.getElementById('webhookConfig');
    
    if (webhook) {
      // Editing existing webhook
      modalTitle.textContent = 'Edit Webhook Configuration';
      webhookId.value = webhook.id;
      webhookId.disabled = true; // Can't change ID of existing webhook
      webhookName.value = webhook.name;
      webhookDescription.value = webhook.description || '';
      webhookProcessor.value = webhook.processor;
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
            id: "salesforce",
            type: "salesforce",
            url: "http://localhost:41244"
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
      item.addEventListener('click', function() {
        // Remove active class from all items
        agentItems.forEach(agent => agent.classList.remove('active'));
        
        // Add active class to clicked item
        this.classList.add('active');
        
        // Get the agent type
        const agentType = this.getAttribute('data-agent');
        
        // Make sure we're on the dashboard view first (this will hide all other sections)
        window.location.hash = '#agent-terminal';
        
        // If we're in the dashboard view, we need to show the terminal and update it
        if (agentTerminalSection) {
          // First, hide the stats for all agents (including host)
          const statsContainer = document.getElementById('webhook-stats');
          if (statsContainer) {
            statsContainer.style.display = 'none';
          }
          
          // Make sure the terminal is visible
          const terminalContainer = agentTerminalSection.querySelector('.terminal-container');
          if (terminalContainer) {
            terminalContainer.style.display = 'block';
          }
          
          // Show the agent header
          const agentHeader = agentTerminalSection.querySelector('.d-flex.justify-content-between.align-items-center');
          if (agentHeader) {
            agentHeader.style.display = 'flex';
          }
          
          // Update the terminal with the selected agent's information
          updateAgentTerminal(agentType);
        }
      });
    });
  }
  
  // Initialize the application
  init();
}); 