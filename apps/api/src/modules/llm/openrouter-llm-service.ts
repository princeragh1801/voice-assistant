import type { ChatMessage } from '@jarvis/types';
import type { LLMService } from './types';
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

interface OpenRouterSuccessBody {
  choices?: Array<{ message?: { content?: string } }>;
}

export class OpenRouterLLMService implements LLMService {
  constructor(private readonly config: OpenRouterConfig) {}

  async chat(messages: ChatMessage[]): Promise<ChatMessage> {
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
        body: JSON.stringify({ model: this.config.model, messages, stream: false }),
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
    const content = body?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      throw new LLMServiceError('OpenRouter returned an unexpected response shape', response.status);
    }

    return { role: 'assistant', content };
  }
}
