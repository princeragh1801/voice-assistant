import { env } from '../../config/env';
import { OpenRouterLLMService } from './openrouter-llm-service';

export type { LLMChatOptions, LLMMessage, LLMRole, LLMService, LLMToolCall, ToolDefinition } from './types';
export { LLMServiceError } from './errors';
export { OpenRouterLLMService } from './openrouter-llm-service';

export const llmService = new OpenRouterLLMService({
  apiKey: env.OPENROUTER_API_KEY,
  model: env.OPENROUTER_MODEL,
  siteUrl: env.OPENROUTER_SITE_URL,
  siteName: env.OPENROUTER_SITE_NAME,
});
