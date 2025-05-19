# Questions about the Web UI Webhook Debugging Feature

1. Can you provide more details on what exactly is failing with the Salesforce agent? Are there any error messages or specific behavior that's not working?
- from the agent "I was unable to unknown the Lead record. Please check the logs for more details."
- agent logs
[Task deaac156-3df0-45d1-8132-fffc4afe0ef7] Created new task and history.
[SalesforceAgent] Processing request: Create an opportunity for Acme Corp with name: AI Platform Sales Discovery
[SalesforceAgent] Creating artifact file: salesforce_unknown_lead.json

2. Regarding adding the message from the host agent to the sub-agents in the UI:
   - Is the message being stored somewhere but not displayed, or is it not being stored at all?
     - I see it in the agent logs but we need to capture it and display it in the UI so we can debug the system
   - Do we need to make changes to data collection, storage, or just the UI display?
     - Store it in the json db and display it

3. Are there any logs or examples of webhook responses that show what data structure we're working with?
  - review the salesforce-agent.log in the /logs folder

4. Are there specific UI requirements for how the host agent messages should be displayed in the UI (e.g., location, formatting)?
  - we already show the response from the agent we just want to add the request text also

5. Is there anything else not working properly in the webhook UI besides the Salesforce agent issues and missing host agent messages?
  - This will help us debug why the salesforce agent is failing