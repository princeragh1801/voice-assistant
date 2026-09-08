import type { LLMChatOptions, LLMMessage, LLMService } from './types';
import { LLMServiceError } from './errors';

const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';

export interface OpenRouterConfig {
  apiKey: string;
  model: string;
  siteUrl?: string;
  siteName?: string;
}

interface OpenRouterErrorBody {
  error?: { code?: number; message?: string };
}

interface OpenRouterWireMessage {
  role: string;
  content: string | null;
  tool_calls?: LLMMessage['toolCalls'];
  tool_call_id?: string;
}

interface OpenRouterSuccessBody {
  choices?: Array<{ message?: OpenRouterWireMessage; finish_reason?: string }>;
}

function toWireMessage(message: LLMMessage): OpenRouterWireMessage {
  return {
    role: message.role,
    content: message.content,
    ...(message.toolCalls ? { tool_calls: message.toolCalls } : {}),
    ...(message.toolCallId ? { tool_call_id: message.toolCallId } : {}),
  };
}

export class OpenRouterLLMService implements LLMService {
  constructor(private readonly config: OpenRouterConfig) {}

  async chat(messages: LLMMessage[], options?: LLMChatOptions): Promise<LLMMessage> {
    let response: Response;
    try {
      response = await fetch(OPENROUTER_CHAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
          ...(this.config.siteUrl ? { 'HTTP-Referer': this.config.siteUrl } : {}),
          ...(this.config.siteName ? { 'X-Title': this.config.siteName } : {}),
        },
        body: JSON.stringify({
          model: this.config.model,
          messages: messages.map(toWireMessage),
          stream: false,
          ...(options?.tools?.length
            ? { tools: options.tools, tool_choice: options.toolChoice ?? 'auto' }
            : {}),
        }),
      });
    } catch (cause) {
      throw new LLMServiceError(
        `Failed to reach OpenRouter: ${cause instanceof Error ? cause.message : String(cause)}`,
      );
    }

    if (!response.ok) {
      let providerMessage = `OpenRouter request failed with status ${response.status}`;
      try {
        const body = (await response.json()) as OpenRouterErrorBody;
        if (body?.error?.message) providerMessage = body.error.message;
      } catch {
        // body wasn't JSON — keep the generic message
      }
      throw new LLMServiceError(providerMessage, response.status);
    }

    const body = (await response.json()) as OpenRouterSuccessBody;
    const message = body?.choices?.[0]?.message;
    const hasContent = typeof message?.content === 'string';
    const hasToolCalls = Array.isArray(message?.tool_calls) && message.tool_calls.length > 0;

    if (!message || (!hasContent && !hasToolCalls)) {
      throw new LLMServiceError('OpenRouter returned an unexpected response shape', response.status);
    }

    return {
      role: 'assistant',
      content: message.content ?? null,
      ...(hasToolCalls ? { toolCalls: message.tool_calls } : {}),
    };
  }
}
