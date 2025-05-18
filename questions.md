# Questions About Repository Cleanup

1. Is there any existing code that should be preserved but is not mentioned in the spec (e.g., movie-agent, coder agents mentioned in package.json scripts)?
- i already removed the movie agent and coder agent code

2. Should we keep the existing directory structure (src/agents/, src/mcp/, src/test/) or reorganize it?
- keep it

3. The spec mentions "Zapier MCP Server" - is there any existing Zapier integration code we need to update or is this something we need to add?
- we are using the zapier mcp server url from the .env file

4. Are there specific npm scripts you'd like to include for testing each agent, or should we define those as part of the cleanup?
- define those as part of the clean up we want to be able to run each agent standalone and the host agent test too
- we also want to be able to chat with the host agent via the cli by starting the 3 sub agents before running the cli

5. Are there any API keys or environment variables that need to be documented beyond what's already in the README?
- what we have in the .env.example

6. Should we keep the existing README structure and just update its content, or create a completely new README?
- we need the readme to be cleaned up and made more high level and simple to understand

7. How detailed should each agent's individual README be? Just usage instructions or should we include architecture details and examples?
- very simple usage instructions and how to test it

8. Is there a specific format or structure you'd like to see for the implementation.md tracking document? 
- just the phases and milestones and task for the cleanup