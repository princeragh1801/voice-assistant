export interface HealthCheckResponse {
  status: 'ok' | 'error';
  timestamp: string;
  uptime: number;
  database: 'connected' | 'disconnected';
}

export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

/** Messages accepted from / returned to the client. The system prompt is injected server-side and never appears here. */
export interface ClientChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * POST /api/chat sends only the newest user message — the backend is the source of
 * truth for conversation history and loads recent context from Postgres itself.
 */
export interface ChatRequestBody {
  content: string;
}

export interface ChatResponseBody {
  message: ClientChatMessage;
}

/** GET /api/conversation — hydrates the frontend's display list on load (e.g. after a page refresh). */
export interface ConversationResponseBody {
  messages: ClientChatMessage[];
}
