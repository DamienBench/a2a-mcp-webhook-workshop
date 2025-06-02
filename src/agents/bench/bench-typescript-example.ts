import { v4 as uuidv4 } from 'uuid';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  parts: {
    type: 'text';
    text: string;
  }[];
  createdAt: string;
}

interface ChatResponse {
  messages: Message[];
  activeMaterials: any[];
  artifacts: any[];
  error?: string;
}

async function sendChatRequest(userMessage: string): Promise<ChatResponse> {
  const API_KEY = 'bnch_tk_v0_your_api_key';
  const API_URL = 'https://bench.io/api/internal/chat';

  const messageId = `msg_${uuidv4().substring(0, 8)}`;

  const payload = {
    messages: [
      {
        id: messageId,
        role: 'user',
        content: userMessage,
        createdAt: new Date().toISOString()
      }
    ],
    activeMaterials: [],
    artifacts: []
  };

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data: ChatResponse = await response.json();
    return data;
  } catch (error) {
    console.error('Error sending chat request:', error);
    throw error;
  }
}

// Example usage
async function main() {
  try {
    const result = await sendChatRequest('Hello, can you help me with a question about TypeScript?');

    // Get the assistant's response
    const assistantMessage = result.messages.find(msg => msg.role === 'assistant');
    if (assistantMessage) {
      console.log(`Assistant: ${assistantMessage.content}`);
    }

    // Check for any artifacts
    if (result.artifacts.length > 0) {
      console.log(`Generated ${result.artifacts.length} artifacts`);
    }
  } catch (error) {
    console.error('Failed to get response:', error);
  }
}