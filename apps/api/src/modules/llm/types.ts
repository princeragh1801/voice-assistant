export type LLMRole = 'system' | 'user' | 'assistant' | 'tool';

export interface LLMToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    /** JSON-encoded string of arguments, exactly as returned by the provider. */
    arguments: string;
  };
}

export interface LLMMessage {
  role: LLMRole;
  /** Null when an assistant message consists only of tool calls. */
  content: string | null;
  /** Present on assistant messages that requested one or more tool calls. */
  toolCalls?: LLMToolCall[];
  /** Required on 'tool' role messages — must match the id of the tool call this is a result for. */
  toolCallId?: string;
}

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    /** JSON Schema object describing the function's arguments. */
    parameters: Record<string, unknown>;
  };
}

export interface LLMChatOptions {
  tools?: ToolDefinition[];
  toolChoice?: 'auto' | 'none';
}

export interface LLMService {
  chat(messages: LLMMessage[], options?: LLMChatOptions): Promise<LLMMessage>;
}
