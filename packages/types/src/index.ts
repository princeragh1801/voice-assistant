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

export interface ChatRequestBody {
  messages: ClientChatMessage[];
}

export interface ChatResponseBody {
  message: ClientChatMessage;
}
