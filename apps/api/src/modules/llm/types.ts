import type { ChatMessage } from '@jarvis/types';

export interface LLMService {
  chat(messages: ChatMessage[]): Promise<ChatMessage>;
}
