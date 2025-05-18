create a simple webhook server that accepts post requests and logs the body to the console and sends it to the host agent for processing.

Each webhook path /webhook/abc123 has a matching json config file

The json config file tells the host agent what to do with the webhook data.

We want to have a website UI that shows all the agents and their status, webhooks and their config files that can be edited. and a test ui to send webhooks to trigger the agents processing.

The default should be the meeting transcript use case we already have in host-agent-test.ts

put all the webhook server and website code into /src/webhooks